import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, LayoutChangeEvent, PanResponder, Platform, Pressable, RefreshControl, ScrollView, Share, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { getRit } from "../../lib/api";
import { useSmartRefresh } from "../../lib/useSmartRefresh";
import { usableOfflineRitCache, usableRitReturnCache } from "../../lib/ritReturnCache";
import { failureKind, ritPositionText, ritRefreshNotice, ritUnavailableMessage } from "../../lib/offline";
import type { FailureKind } from "../../lib/offline";
import {favoriteJourneyKey,useApp} from "../../context/AppProvider";
import { useFlowNavigation } from "../../context/FlowNavigation";
import { boardingHintFromParams, findBoardingIndex } from "../../lib/boardingMatch";
import type { BoardingHint } from "../../lib/boardingMatch";
import { tripCancellation } from "../../lib/ritCancellation";
import { continuationText, estimatedSpeedKmh, nextTripDecision, notTheTappedTrip, otherTripMessage, tripSignature, vehiclePlaceText } from "../../lib/ritIdentity";
import type { TripSignature } from "../../lib/ritIdentity";
import { journeyEnded, ritShareText } from "../../lib/ritLifecycle";
import {shiftClock} from "../../lib/format";
import { journeyExtras } from "../../lib/flowLiveDetails";
import { disruptionSummary } from "../../lib/haltebordV4";
import { upcomingJourneyNotices } from "../../lib/upcomingJourneyNotices";
import { linesConflict } from "../../lib/flowRitQuality";
import { minutesUntilArrival } from "../../lib/ritRedesign";
import { alightingState, arrivalShareText, clockRemainingMs, findAlightingIndex, recallAlighting, rememberAlighting, scheduleIndex } from "../../lib/alighting";
import { clearActiveTrip, loadTripSnapshot, saveActiveTrip, saveTripSnapshot } from "../../lib/activeTripStore";
import { TRIP_SNAPSHOT_INTERVAL_MS, usableTripSnapshot } from "../../lib/tripSnapshot";
import { alightAlertKey, alightRow, boardingProgress, markAlightAlert, noticeStopsText, onTheWayText, positionHeadline, skippedStopIds, timelineStopLabel } from "../../lib/ritProgress";
import { loadAlightVibration, saveAlightVibration, vibrateForAlighting } from "../../lib/alightAlert";
import { MenuButton, OverflowMenu } from "../../components/OverflowMenu";
import type { MenuItem } from "../../components/OverflowMenu";
import { rideSegmentRange } from "../../lib/ritMapRoute";
import type { SavedAlighting } from "../../lib/alighting";
import { ritParamsForDeparture } from "../../lib/ritRoute";
import { JourneySkeleton } from "../../components/JourneySkeleton";
import { RitTransfers } from "../../components/RitTransfers";
import { mapGpsLabel, panMapCenter, routeFollowZoom, routeMapCenter, routeOverviewZoom } from "../../lib/ritMapViewport";
import type { MapViewMode } from "../../lib/ritMapViewport";
import { boardingPosition, confirmedDwellStop, gpsFixForRit, verifiedTimelineLocation } from "../../lib/ritConsistency";
import { verifiedNextStopIndex } from "../../lib/ritLivePresentation";
import { boardingDepartureNote } from "../../lib/realtimeConsistency";
import { ritColors } from "../../lib/ritTheme";
import type { RitColors } from "../../lib/ritTheme";
import { vehicleIcon, vehicleNoun } from "../../lib/ritVehicle";
import type { GpsFix } from "../../lib/ritConsistency";
import type { JourneyStop, RitData } from "../../types/api";

// OVbord Flow 4.0: a dedicated trip page, replacing the inline expansion from the stop board.
// Street tiles and route overlays use React Native primitives already in the app: no native dependency or backend change.
// Fixed colours for map overlays only; everything else on this page follows the app theme via useRitTheme().
const NAVY = "#14518B";
const BLUE = "#1478E3";
const GREEN = "#16894B";
const TEXT = "#13233D";
const TILE = 256;
const EARTH_ZOOM = 14;

type LatLon = { lat: number; lon: number };
type Px = { x: number; y: number };
type TileData = { key: string; x: number; y: number; url: string };

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
function validPosition(p: LatLon | null | undefined): p is LatLon {
  return Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 85 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0));
}
function mercator(p: LatLon, zoom: number): Px {
  const sin = Math.sin((p.lat * Math.PI) / 180);
  const size = TILE * Math.pow(2, zoom);
  return { x: (p.lon + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}
function stopShort(name: string): string {
  const words = String(name || "").split(", ");
  return words.length === 2 && words[0].length <= 30 ? words[1] : name;
}
function isTime(value: string | undefined) { return /^\d{1,2}:\d{2}$/.test(value || ""); }
function timeOf(stop: JourneyStop, passed = stop.state==="passed"): string {
  // Actual observations belong to passed stops; all upcoming clocks share the journey's effective ETA.
  if(passed && stop.actualKnown && isTime(stop.actualTime))return stop.actualTime!;
  if(isTime(stop.expectedTime))return stop.expectedTime!;
  if(isTime(stop.plannedTime) && typeof stop.delayMinutes==="number")
    return shiftClock(stop.plannedTime,stop.delayMinutes);
  return isTime(stop.plannedTime)?stop.plannedTime:"—";
}
function minutesSuffix(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? (value > 0 ? "+" + value : "−" + Math.abs(value)) : "";
}
function coordFromStop(stop: JourneyStop | undefined): LatLon | undefined {
  return stop && typeof stop.lat === "number" && typeof stop.lon === "number" ? { lat: stop.lat, lon: stop.lon } : undefined;
}

/** Map centered on verified vehicle (or boarding stop if GPS is unavailable). Native-free to keep OTA runtime compatible. */
/** Fixed overlay colour for the part of the route still to ride (to the alighting stop). */
const RIDE = "#6A42C2";

function TripMap({ journey, live, gpsAgeSeconds, nextStop, boarding, expanded = false, alight, initialFollow = false }: { journey: RitData; live: boolean; gpsAgeSeconds?: number; nextStop?: JourneyStop | null; boarding: BoardingHint; expanded?: boolean;
  /** Where the user gets off: a marker, and the route there is highlighted. */
  alight?: JourneyStop | null;
  /** Opened by tapping the vehicle in the timeline: start by following it. */
  initialFollow?: boolean }) {
  const { styles } = useRitTheme();
  const [width, setWidth] = useState(360);
  const [zoom, setZoom] = useState(EARTH_ZOOM);
  const [viewMode, setViewMode] = useState<MapViewMode>(initialFollow ? "follow" : "overview");
  const [selectedCenter, setSelectedCenter] = useState<LatLon | null>(null);
  const [userZoomed, setUserZoomed] = useState(false);
  const panState = useRef<{ center: LatLon | null; zoom: number }>({center:null,zoom:EARTH_ZOOM});
  const dragStart = useRef<{ center: LatLon; zoom: number } | null>(null);
  const lastDragMs = useRef(0);
  const lastFollowPoint = useRef<LatLon | null>(null);
  const boardingIndex=findBoardingIndex(journey.stops,boarding);
  const board=boardingIndex>=0?journey.stops[boardingIndex]:undefined;
  const first = journey.stops.find((s) => validPosition(coordFromStop(s)));
  const height = expanded ? 415 : 230;
  const boardingPoint=coordFromStop(board);
  const busPoint=live&&!journey.estimatedPosition&&validPosition(journey.vehicle)?journey.vehicle:undefined;
  const nextPoint=coordFromStop(nextStop || undefined);
  if (busPoint && viewMode === "follow") lastFollowPoint.current = busPoint;
  // On GPS loss preserve the camera but remove the vehicle marker until a fresh fix arrives.
  const center=routeMapCenter(viewMode, busPoint, boardingPoint, coordFromStop(first),
    viewMode === "follow" ? lastFollowPoint.current : selectedCenter);
  const gpsLabel=mapGpsLabel(gpsAgeSeconds, Boolean(busPoint), Boolean(journey.estimatedPosition));
  panState.current = {center, zoom};
  function applyDrag(dx:number,dy:number) {
    const start=dragStart.current;
    if (!start)return;
    const next=panMapCenter(start.center,start.zoom,dx,dy);
    if (!next)return;
    setSelectedCenter(next);setViewMode("manual");setUserZoomed(true);
  }
  const panResponder=useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
    onPanResponderGrant: () => {
      const current=panState.current;
      dragStart.current=validPosition(current.center)?{center:current.center,zoom:current.zoom}:null;
      lastDragMs.current=0;
    },
    onPanResponderMove: (_event, gesture) => {
      const now=Date.now();
      if (now-lastDragMs.current < 40)return;
      lastDragMs.current=now;
      applyDrag(gesture.dx,gesture.dy);
    },
    onPanResponderRelease: (_event, gesture) => {
      applyDrag(gesture.dx,gesture.dy);
      dragStart.current=null;
    },
    onPanResponderTerminate: () => { dragStart.current=null; },
    onPanResponderTerminationRequest: () => false
  })).current;
  // Follow mode tracks verified GPS on every refresh; selected stops and manual zoom persist.
  useEffect(()=>{
    if(viewMode !== "overview" || userZoomed)return;
    setZoom(routeOverviewZoom(busPoint, boardingPoint, width, height));
  },[viewMode, userZoomed, busPoint?.lat, busPoint?.lon, boardingPoint?.lat, boardingPoint?.lon, width, height]);
  useEffect(()=>{
    if(viewMode !== "follow" || userZoomed || !busPoint)return;
    setZoom(routeFollowZoom(busPoint, nextPoint, width, height));
  },[viewMode,userZoomed,busPoint?.lat,busPoint?.lon,nextPoint?.lat,nextPoint?.lon,width,height]);
  function overview() {
    setViewMode("overview"); setSelectedCenter(null); setUserZoomed(false);
    setZoom(routeOverviewZoom(busPoint, boardingPoint, width, height));
  }
  function toggleFollow() {
    if(!validPosition(busPoint))return;
    if(viewMode === "follow") overview();
    else { setViewMode("follow"); setSelectedCenter(null); setUserZoomed(false); setZoom(routeFollowZoom(busPoint,nextPoint,width,height)); }
  }
  function focusStop(point: LatLon) {
    setSelectedCenter(point); setViewMode("stop"); setUserZoomed(true);
  }
  function changeZoom(delta: number) {
    setUserZoomed(true);
    setZoom((value)=>Math.max(11,Math.min(17,value+delta)));
  }
  const geom = useMemo(() => {
    if (!validPosition(center) || width < 100) return null;
    const c = mercator(center, zoom);
    const originX = c.x - width / 2;
    const originY = c.y - height / 2;
    const n = Math.pow(2, zoom);
    const tiles: TileData[] = [];
    const leftTile = Math.floor(originX / TILE);
    const rightTile = Math.floor((originX + width) / TILE);
    const topTile = Math.floor(originY / TILE);
    const bottomTile = Math.floor((originY + height) / TILE);
    for (let tileX = leftTile; tileX <= rightTile; tileX++) {
      for (let tileY = topTile; tileY <= bottomTile; tileY++) {
        if (tileY < 0 || tileY >= n) continue;
        const normalizedX = ((tileX % n) + n) % n;
        tiles.push({ key: `${zoom}:${normalizedX}:${tileY}`, x: tileX * TILE - originX, y: tileY * TILE - originY, url: `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/${zoom}/${normalizedX}/${tileY}.png` });
      }
    }
    const convert = (ll: LatLon): Px => {
      const p = mercator(ll, zoom);
      return { x: p.x - originX, y: p.y - originY };
    };
    const routePoints = (journey.polyline || []).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    // Limit React Native views while preserving enough detail for local road bends.
    const step = Math.max(1, Math.ceil(routePoints.length / 220));
    const indexed: LatLon[] = [];
    for (let i = 0; i < routePoints.length; i += step) indexed.push({ lat: routePoints[i].latitude, lon: routePoints[i].longitude });
    if (routePoints.length > 1) indexed.push({ lat: routePoints[routePoints.length - 1].latitude, lon: routePoints[routePoints.length - 1].longitude });
    const alightPoint = coordFromStop(alight || undefined);
    const ride = validPosition(alightPoint) ? rideSegmentRange(indexed, busPoint || boardingPoint, alightPoint) : null;
    const roadSegments: { key: number; left: number; top: number; distance: number; angle: string; ride: boolean }[] = [];
    for (let i = 0; i < indexed.length - 1; i++) {
      const a = convert(indexed[i]); const b = convert(indexed[i + 1]);
      if (!Number.isFinite(a.x + a.y + b.x + b.y)) continue;
      if ((a.x < -30 && b.x < -30) || (a.x > width + 30 && b.x > width + 30) || (a.y < -30 && b.y < -30) || (a.y > height + 30 && b.y > height + 30)) continue;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance < 0.5 || distance > 200) continue;
      roadSegments.push({ key: i, left: (a.x + b.x) / 2 - distance / 2, top: (a.y + b.y) / 2 - 2, distance, angle: `${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI}deg`,
        ride: Boolean(ride && i >= ride.start && i < ride.end) });
    }
    const nearbyStops = journey.stops.map((stop, index) => ({ stop, index, p: coordFromStop(stop) })).filter((s) => validPosition(s.p)).map((s) => ({ ...s, screen: convert(s.p!) })).filter((s) => s.screen.x > 5 && s.screen.x < width - 5 && s.screen.y > 5 && s.screen.y < height - 5);
    const vehiclePoint = busPoint ? convert(busPoint) : null;
    const boardingMarker=validPosition(boardingPoint)?convert(boardingPoint):null;
    const finalStopPoint=coordFromStop(journey.stops[journey.stops.length-1]);
    const endMarker=validPosition(finalStopPoint)?convert(finalStopPoint):null;
    const alightMarker=validPosition(alightPoint)?convert(alightPoint):null;
    return { tiles, roadSegments, nearbyStops, vehiclePoint, boardingMarker, endMarker, alightMarker };
  }, [center?.lat, center?.lon, width, zoom, height, journey, alight?.lat, alight?.lon]);

  function onLayout(event: LayoutChangeEvent) { const value = event.nativeEvent.layout.width; if (value > 100 && Math.abs(value - width) > 1) setWidth(value); }
  return (
    <View {...panResponder.panHandlers} onLayout={onLayout} style={[styles.map, expanded && styles.mapExpanded]} accessibilityLabel="Routekaart met haltes en alleen bevestigde live voertuigposities">
      {geom ? <>
        {geom.tiles.map((t) => <Image key={t.key} source={{ uri: t.url, cache: "default" }} style={{ position: "absolute", left: t.x, top: t.y, width: TILE, height: TILE }} resizeMode="stretch" />)}
        {geom.roadSegments.map((seg) => <React.Fragment key={seg.key}>
          <View style={{ position: "absolute", left: seg.left, top: seg.top - 2, width: seg.distance, height: 8, backgroundColor: "#FFFFFF", transform: [{ rotate: seg.angle }], borderRadius: 4 }} />
          <View style={{ position: "absolute", left: seg.left, top: seg.ride ? seg.top - 1 : seg.top, width: seg.distance, height: seg.ride ? 6 : 4,
            backgroundColor: seg.ride ? RIDE : BLUE, transform: [{ rotate: seg.angle }], borderRadius: 3 }} />
        </React.Fragment>)}
        {geom.nearbyStops.map((s) => <Pressable accessibilityRole="button" accessibilityLabel={`Centreer op ${s.stop.name}`} onPress={() => focusStop(s.p!)} hitSlop={12} key={`${s.stop.id}-${s.index}`} style={[styles.mapDot, { left: s.screen.x - 5, top: s.screen.y - 5 }]} />)}
        {geom.endMarker ? <View pointerEvents="none" accessibilityLabel="Eindhalte op kaart" style={[styles.mapEnd, {left:geom.endMarker.x-13,top:geom.endMarker.y-13}]}><Ionicons name="flag" color="#FFFFFF" size={16}/></View> : null}
        {geom.alightMarker ? <View pointerEvents="none" accessibilityLabel="Jouw uitstaphalte op kaart" style={[styles.mapAlight, {left:geom.alightMarker.x-12,top:geom.alightMarker.y-12}]}><Ionicons name="flag" color="#FFFFFF" size={14}/></View> : null}
        {geom.boardingMarker ? <View accessibilityLabel="Jouw halte op kaart" style={[styles.mapBoarding,{left:geom.boardingMarker.x-12,top:geom.boardingMarker.y-12}]}><Ionicons name="location" color="#FFFFFF" size={18}/></View> : null}
        {geom.vehiclePoint ? <View style={[styles.mapBus, { left: geom.vehiclePoint.x - 14, top: geom.vehiclePoint.y - 14 }]}><Ionicons name={vehicleIcon(journey.mode)} color="#FFFFFF" size={17}/></View> : null}
        <View style={styles.mapStatus}><View style={[styles.mapStatusDot, {backgroundColor: gpsLabel.tone === "green" ? GREEN : gpsLabel.tone === "amber" ? "#CF8E1C" : gpsLabel.tone === "red" ? "#C22E39" : "#8290A0"}]}/><Text style={styles.mapStatusText}>{gpsLabel.text}</Text></View>
      </> : <Text style={styles.mapUnavailable}>Routekaart niet beschikbaar</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={viewMode === "follow" && busPoint ? "Voertuig volgen uitschakelen" : "Volg voertuig"}
        accessibilityState={{disabled: !busPoint, selected: viewMode === "follow" && Boolean(busPoint)}}
        disabled={!busPoint} onPress={toggleFollow}
        style={[styles.mapFollow, viewMode === "follow" && busPoint && styles.mapFollowActive, !busPoint && styles.mapFollowDisabled]}>
        <Ionicons name={viewMode === "follow" && busPoint ? "navigate" : "locate-outline"} size={15} color={viewMode === "follow" && busPoint ? "#FFFFFF" : NAVY}/>
        <Text style={[styles.mapFollowText, viewMode === "follow" && busPoint && styles.mapFollowActiveText]}>
          {viewMode === "follow" && !busPoint ? "Volgen gepauzeerd" : viewMode === "follow" ? "Volgen aan" : "Volg voertuig"}
        </Text>
      </Pressable>
      <View style={styles.mapControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Inzoomen" onPress={() => changeZoom(1)} style={styles.mapCtrl}><Ionicons name="add" color={NAVY} size={21}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Uitzoomen" onPress={() => changeZoom(-1)} style={styles.mapCtrl}><Ionicons name="remove" color={NAVY} size={21}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Routeoverzicht tonen" onPress={overview} style={styles.mapCtrl}><Ionicons name="map-outline" color={NAVY} size={18}/></Pressable>
      </View>
      <Text style={styles.mapAttribution}>Kaart © Kadaster 2026 · CC BY 4.0</Text>
    </View>
  );
}

function platformLabel(stop: JourneyStop, mode: RitData["mode"]): string {
  return stop.platform ? (mode === "train" ? "Spoor " : "Perron ") + stop.platform : "";
}

function TimeLine({ journey, liveLocation, boarding, onOpenStop, lastKnown = false,
  alightIndex = -1, choosing = false, minAlightIndex = 1, onChooseAlight, onFocusVehicle, skipped, onRowLayout }: {
  journey: RitData;
  liveLocation: { kind: "at" | "between"; index: number } | null | undefined;
  boarding: BoardingHint;
  onOpenStop: (stop: JourneyStop) => void;
  /** Last refresh failed: position tags describe the last known state. */
  lastKnown?: boolean;
  /** Stop where the user gets off; -1 when none is chosen. */
  alightIndex?: number;
  /** Choosing the alighting stop: rows then set it instead of opening the stop board. */
  choosing?: boolean;
  /** First stop that can be chosen (after boarding and the verified position). */
  minAlightIndex?: number;
  onChooseAlight?: (stop: JourneyStop, index: number) => void;
  /** Tapping the vehicle opens the map, following it. */
  onFocusVehicle?: () => void;
  /** Stops the vehicle skips according to a notice ("Halte vervalt"). */
  skipped?: ReadonlySet<string>;
  /** Where each row sits in the timeline, for scrolling to the vehicle once. */
  onRowLayout?: (index: number, y: number) => void;
}) {
  const { c, styles } = useRitTheme();
  const stops = journey.stops;
  const boardingIndex = findBoardingIndex(stops, boarding);
  // V5.7: every stop, always, in one continuous list. Opening scrolls once to the vehicle;
  // choosing where to get off scrolls to the first stop that can be chosen. Nothing is hidden.
  const visible = stops;
  const start = 0;
  const nextIndex = verifiedNextStopIndex(liveLocation || null, stops.length);
  const GRAY_RAIL = c.grayRail;
  const icon = vehicleIcon(journey.mode);

  return <View style={styles.timeLine}>
    {visible.map((stop, offset) => {
      const index = start + offset;
      // The backend's schedule-derived "passed/current" states aren't GPS observations.
      const passed = liveLocation
        ? (liveLocation.kind === "at" ? index < liveLocation.index : index <= liveLocation.index)
        : false;
      const atStop = liveLocation?.kind === "at" && liveLocation.index === index;
      const between = liveLocation?.kind === "between" && liveLocation.index === index;
      const last = index === stops.length - 1;
      const isBoarding = index === boardingIndex;
      const isNext = nextIndex !== null && index === nextIndex && !passed;
      const delay = minutesSuffix(stop.delayMinutes);
      const shouldShowCity = index === 0 ||
        (stop.name.includes(", ") && stop.name.split(", ")[0] !== stops[index - 1]?.name.split(", ")[0]);
      const displayName = shouldShowCity ? stop.name : stopShort(stop.name);
      const platform = platformLabel(stop, journey.mode);
      const isAlight = index === alightIndex;
      // After the alighting stop the rest of the route is shown lighter.
      const afterAlight = alightIndex >= 0 && index > alightIndex;
      const railAbove = passed || (atStop && !isAlight) ? GRAY_RAIL : afterAlight ? c.afterAlightRail : c.green;
      const railBelow = passed || atStop ? (atStop ? c.green : GRAY_RAIL) : afterAlight || isAlight ? c.afterAlightRail : c.green;
      const selectable = Boolean(onChooseAlight) && index >= minAlightIndex;
      const skip = !passed && Boolean(skipped?.has(String(stop.id)));
      // A boarding stop's clock is its DEPARTURE, not the earlier arrival time.
      // Other stops retain their existing arrival/actual-time semantics.
      const stopClock = isBoarding && !passed
        ? (isTime(stop.expectedDepartureTime) ? stop.expectedDepartureTime! :
          isTime(stop.plannedDepartureTime) ? stop.plannedDepartureTime! : timeOf(stop, passed))
        : timeOf(stop, passed);
      const label = timelineStopLabel({ name: stop.name, clock: stopClock, delayMinutes: stop.delayMinutes, platform,
        passed, vehicleHere: atStop, next: isNext, boarding: isBoarding, alight: isAlight, last, lastKnown, skipped: skip });
      // Tap opens the stop board; a long press (or tapping while choosing) picks the alighting stop.
      return <Pressable key={stop.id + "-" + index}
        onLayout={onRowLayout ? (event: LayoutChangeEvent) => onRowLayout(index, event.nativeEvent.layout.y) : undefined}
        onPress={() => { if (!choosing) onOpenStop(stop); else if (selectable) onChooseAlight?.(stop, index); }}
        onLongPress={selectable && !choosing ? () => onChooseAlight?.(stop, index) : undefined}
        disabled={choosing && !selectable}
        accessibilityRole="button"
        accessibilityState={{ disabled: choosing && !selectable, selected: isAlight }}
        accessibilityLabel={choosing ? (selectable ? "Kies " + stop.name + " als uitstaphalte" : stop.name + ", niet te kiezen")
          : label + ". Vertrekbord openen"}
        accessibilityHint={choosing ? undefined : selectable
          ? "Tik voor het haltebord; lang indrukken om als uitstaphalte te kiezen"
          : "Tik om het haltebord te openen"}
        style={({ pressed }) => [
        styles.timelineRow,
        passed && styles.passedRow,
        atStop && styles.timelineRowAtVehicle,
        isNext && !isAlight && !atStop && styles.timelineRowNext,
        between && styles.timelineRowWithVehicle,
        choosing && !selectable && styles.timelineRowDisabled,
        pressed && styles.timelineRowPressed
      ]}>
        <View style={styles.timelineTimeCol}>
          <View style={styles.timelineActualLine}>
            {/* The time column has a fixed width (the vehicle marker is positioned from it): cap large system fonts. */}
            <Text maxFontSizeMultiplier={1.25} style={[styles.timelineTime, passed && styles.passedText, afterAlight && styles.afterAlightText,
              (isBoarding || isNext || atStop) && !passed && styles.timelineImportantTime, isAlight && styles.alightTime]}>{stopClock}</Text>
            {delay && !passed ? <Text maxFontSizeMultiplier={1.25} style={[styles.delayText, { color: delay.startsWith("+") ? c.red : c.green }]}>{delay}</Text> : null}
          </View>
          {platform && !passed ? <Text maxFontSizeMultiplier={1.25} style={[styles.timelinePlatform, stop.platformChanged && styles.timelinePlatformChanged]}
            numberOfLines={1}>{platform}</Text> : null}
        </View>
        <View style={styles.timelineRail}>
          {index > 0 ? <View style={[styles.railTop, { backgroundColor: railAbove }]}/> : null}
          {atStop ? <View style={[styles.railVehicle, { backgroundColor: lastKnown ? c.muted : c.green }]}>
            <Ionicons name={icon} size={14} color="#FFFFFF"/>
          </View> : isAlight ? <View style={[styles.railAlight, { borderColor: c.alightTagText }]}>
            <View style={[styles.railAlightDot, { backgroundColor: c.alightTagText }]}/>
          </View> : <View style={[styles.railNode, { borderColor: passed ? GRAY_RAIL : afterAlight ? c.afterAlightRail : c.green,
            backgroundColor: passed ? GRAY_RAIL : c.railFill }]}>
            {passed ? <Ionicons name="checkmark" size={8} color="#FFFFFF"/> : null}
          </View>}
          {!last ? <View style={[styles.railBottom, { backgroundColor: railBelow }]}/> : null}
        </View>
        <View style={styles.timelineLabel}>
          <View style={styles.timelineNameRow}>
            <Text style={[styles.timelineName, passed && styles.passedName, afterAlight && styles.afterAlightText,
              (isBoarding || isNext || atStop) && !passed && styles.timelineImportantName, last && styles.lastStop,
              isAlight && styles.alightName, skip && styles.skippedName]} numberOfLines={2}>{displayName}</Text>
            {skip ? <Text style={styles.skipTag}>Vervalt</Text> : null}
            {atStop ? <Text onPress={onFocusVehicle} accessibilityRole={onFocusVehicle ? "button" : undefined}
              accessibilityLabel={onFocusVehicle ? vehicleNoun(journey.mode) + " is hier. Volg op de kaart" : undefined}
              style={[styles.nowTag, lastKnown && styles.tagMuted]}>{lastKnown ? "Laatst hier" : "Nu hier"}</Text> : null}
          </View>
          {isNext && !atStop && !isAlight && !isBoarding && !skip ? <Text style={styles.nextTag}>Volgende halte</Text> : null}
          {/* One small line under the name, as in OVinfo. */}
          {isAlight ? <Text style={styles.alightSub}>Je stapt hier uit</Text>
            : passed ? <Text style={styles.passedSub}>Vertrokken</Text> : null}
        </View>
        {!choosing ? <Ionicons name="chevron-forward" size={16} color={passed ? c.passedName : c.muted} /> : null}
        {between ? <Pressable onPress={onFocusVehicle} disabled={!onFocusVehicle} hitSlop={10} style={[styles.vehicleOnRail, lastKnown && { backgroundColor: c.muted }]}
          accessibilityRole={onFocusVehicle ? "button" : undefined}
          accessibilityLabel={vehicleNoun(journey.mode) + (lastKnown ? " was" : " is") + " tussen deze halte en de volgende" + (onFocusVehicle ? ". Volg op de kaart" : "")}>
          <Ionicons name={icon} size={13} color="#FFFFFF"/>
        </Pressable> : null}
      </Pressable>;
    })}
  </View>;
}

export default function RitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; line?: string; destination?: string; boardingName?: string; boardingId?:string;
    boardingLat?: string; boardingLon?: string; boardingTime?: string; boardCancelled?: string; carrier?: string }>();
  const tripId = single(params.id);
  const expectedLine = single(params.line);
  const fallbackDestination = single(params.destination);
  const boardingName = single(params.boardingName);
  const boardingId=single(params.boardingId);
  const boardingLat = single(params.boardingLat);
  const boardingLon = single(params.boardingLon);
  const boardingTime = single(params.boardingTime);
  const boardCancelled = single(params.boardCancelled) === "1";
  // Stop boards and trip feeds can use different IDs and names for one station;
  // position and planned time identify the boarding stop when ID and name differ.
  const boarding = useMemo(() => boardingHintFromParams({ boardingId, boardingName, boardingLat, boardingLon, boardingTime }),
    [boardingId, boardingName, boardingLat, boardingLon, boardingTime]);
  const {toggleFavoriteJourney,isFavoriteJourney,getCachedRit,setCachedRit}=useApp();
  const { followJourneyStop } = useFlowNavigation();
  const { c, styles } = useRitTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [journey, setJourney] = useState<RitData | null>(null);
  /** The trip first shown on this page; vehicle-based IDs (GVB_1913) move on to the bus's next trip. */
  const identity = useRef<TripSignature | null>(null);
  /** A later trip of the vehicle seen once; it must be seen again before this trip counts as finished. */
  const pendingNext = useRef<TripSignature | null>(null);
  /** The vehicle finished this trip and now drives another one: the page keeps the finished trip. */
  const [continuation, setContinuation] = useState<{ rit: RitData; firstDeparture: string } | null>(null);
  /** At opening, the vehicle is still (or already) on another trip than the one tapped. */
  const [otherTrip, setOtherTrip] = useState<RitData | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  /** Only for data that must not be shown (wrong line); fetch failures go in `failure`. */
  const [error, setError] = useState<string | null>(null);
  /** Last refresh failed: data on screen is last known, not live. */
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [mapOpen, setMapOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  /** Opening the trip scrolls once to the vehicle (or the boarding stop); never again by itself. */
  const autoScrolled = useRef(false);
  const timelineTop = useRef<number | null>(null);
  const rowY = useRef<Record<number, number>>({});
  const [infoOpen,setInfoOpen]=useState(false);
  /** Where the user gets off; remembered per trip while the app runs. */
  const [alighting, setAlighting] = useState<SavedAlighting | null>(() => recallAlighting(tripId));
  const [choosingAlight, setChoosingAlight] = useState(false);
  /** Transfers: null follows the trip (open once the alighting stop is next); a tap overrides it. */
  const [transfersOpen, setTransfersOpen] = useState<boolean | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Vibrate when the alighting stop is next (setting under ⋮). */
  const [vibrate, setVibrate] = useState(true);
  const lastSnapshotAt = useRef(0);
  const activeRequest = useRef(0);
  const previousGpsFix = useRef<GpsFix | null>(null);
  const confirmedStop = useRef<number | null>(null);
  const refreshTripRef = useRef<() => Promise<void>>(async () => {});
  const hasJourney = useRef(false);
  // Stop automatic refreshing once the trip has finished; pull-to-refresh still works.
  // After a failure, retry sooner so the page recovers quickly when the connection returns.
  const ended = journeyEnded(journey, nowMs) || continuation !== null;
  useSmartRefresh(() => refreshTripRef.current(), failure ? 10000 : 15000, tripId + ":" + expectedLine + ":" + fallbackDestination + ":" + retry, !ended);

  useEffect(() => {
    let active = true;
    const seq = ++activeRequest.current;
    setMapOpen(false);
    autoScrolled.current = false;
    timelineTop.current = null;
    rowY.current = {};
    setAlighting(recallAlighting(tripId));
    setChoosingAlight(false);
    setTransfersOpen(null);
    setAlertsOpen(false);
    setMenuOpen(false);
    lastSnapshotAt.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    previousGpsFix.current = null;
    confirmedStop.current = null;
    identity.current = null;
    pendingNext.current = null;
    setContinuation(null);
    setOtherTrip(null);
    setSpeedKmh(null);
    const cached = getCachedRit(tripId);
    const cacheHit = usableRitReturnCache(cached, tripId, expectedLine, Date.now(), fallbackDestination);
    if (cacheHit && cached) {
      identity.current = tripSignature(cached.data);
      setJourney(cached.data);
      setFetchedAt(cached.fetchedAt);
      previousGpsFix.current = gpsFixForRit(cached.data, cached.fetchedAt);
      setLoading(false);
      hasJourney.current = true;
    } else {
      setJourney(null);
      setLoading(true);
      hasJourney.current = false;
    }
    setError(null);
    setFailure(null);
    let pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await getRit(tripId);
        if (!active || seq !== activeRequest.current) return;
        const signature = tripSignature(result);
        const decision = nextTripDecision(identity.current, signature, pendingNext.current);
        // A lagging source may briefly report the previous trip again: keep what is on screen.
        if (decision === "ignore") { setFailure(null); return; }
        if (decision === "wait") { pendingNext.current = signature; setFailure(null); return; }
        if (decision === "continue") {
          // The bus finished this trip: keep it on screen as ended and say what the bus does next.
          const first = result.stops[0];
          setContinuation({ rit: result, firstDeparture: first ? first.plannedDepartureTime || first.plannedTime || "" : "" });
          setFailure(null);
          return;
        }
        pendingNext.current = null;
        // Vehicle-based IDs follow the bus: show only the trip that was opened.
        if (!identity.current && notTheTappedTrip(tripId, { line: expectedLine, destination: fallbackDestination }, result)) {
          setOtherTrip(result);
          setJourney(null);
          setError(null);
          setFailure(null);
          hasJourney.current = false;
          return;
        }
        if (expectedLine && linesConflict(expectedLine, result.line)) {
          setError("De rit hoort bij een andere lijn. De gegevens worden niet getoond.");
          setJourney(null);
          setFailure(null);
          hasJourney.current = false;
          return;
        }
        if (!identity.current) identity.current = signature;
        setOtherTrip(null);
        const receivedAt = Date.now();
        const newFix = gpsFixForRit(result, receivedAt);
        const previous = previousGpsFix.current;
        const priorStop = confirmedStop.current;
        // A single GPS point near a platform isn't proof of a stationary bus.
        // Require two independent readings at least eight seconds apart.
        const newlyConfirmed = confirmedDwellStop(previous, newFix, result.stops);
        const repeatedObservation = Boolean(newFix && previous &&
          Math.abs(newFix.observedMs - previous.observedMs) < 1000 &&
          newFix.lat === previous.lat && newFix.lon === previous.lon);
        confirmedStop.current = repeatedObservation ? priorStop : newlyConfirmed;
        if (!newFix) setSpeedKmh(null);
        else if (!repeatedObservation) setSpeedKmh(estimatedSpeedKmh(previous, newFix));
        previousGpsFix.current = newFix;
        setJourney(result);
        setFetchedAt(receivedAt);
        setError(null);
        setFailure(null);
        hasJourney.current = true;
        setCachedRit(tripId, { data: result, fetchedAt: receivedAt });
        // Kept on the device (once a minute) for a restart without a connection.
        if (receivedAt - lastSnapshotAt.current >= TRIP_SNAPSHOT_INTERVAL_MS) {
          lastSnapshotAt.current = receivedAt;
          void saveTripSnapshot(tripId, result, receivedAt);
        }
      } catch (caught) {
        if (!active || seq !== activeRequest.current) return;
        setFailure(failureKind(caught));
        // Nothing on screen yet: fall back to this trip as seen earlier (up to 30 min),
        // shown as last known. Without it the page explains that it is offline.
        if (!hasJourney.current) {
          const fallback = getCachedRit(tripId);
          if (fallback && usableOfflineRitCache(fallback, tripId, expectedLine, Date.now(), fallbackDestination)) {
            identity.current = tripSignature(fallback.data);
            setJourney(fallback.data);
            setFetchedAt(fallback.fetchedAt);
            hasJourney.current = true;
          }
        }
        // After a restart the memory is empty: the data stored on the device (up to 2 hours) is used instead.
        if (!hasJourney.current) {
          const snapshot = await loadTripSnapshot();
          if (active && seq === activeRequest.current && !hasJourney.current &&
              usableTripSnapshot(snapshot, tripId, expectedLine, Date.now(), fallbackDestination)) {
            identity.current = tripSignature(snapshot.data);
            setJourney(snapshot.data);
            setFetchedAt(snapshot.fetchedAt);
            hasJourney.current = true;
          }
        }
      } finally {
        pending = false;
        if (active && seq === activeRequest.current) setLoading(false);
      }
    };
    refreshTripRef.current = update;
    if (!cacheHit) void update();
    return () => { active = false; refreshTripRef.current = async () => {}; };
  }, [tripId, expectedLine, fallbackDestination, retry, getCachedRit, setCachedRit]);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void loadAlightVibration().then((value) => { if (active) setVibrate(value); });
    return () => { active = false; };
  }, []);

  const info = useMemo(() => journeyExtras(journey, journey?.stops || [], nowMs), [journey, nowMs]);
  const live = info.liveLocation;
  const gpsAge = journey?.gpsAgeSeconds;
  const shownGpsAge = typeof gpsAge === "number" && Number.isFinite(gpsAge) ? Math.max(0, gpsAge + (nowMs - fetchedAt) / 1000) : undefined;
  const gpsFresh = Boolean(live && shownGpsAge !== undefined && shownGpsAge < 45);
  // Backend state "current" is a route-progress marker, not evidence of dwell.
  const verifiedLive = gpsFresh ? verifiedTimelineLocation(live, confirmedStop.current) : null;
  const nextStopIndex = verifiedNextStopIndex(verifiedLive, journey?.stops.length || 0);
  const nextStopIsLive = nextStopIndex !== null;
  const nextStop = journey ? (nextStopIndex !== null
    ? journey.stops[nextStopIndex]
    : journey.stops.find((s) => s.state === "current" || s.state === "upcoming") || null) : null;
  // When the last refresh failed, what is shown is the last known state, not live.
  const lastKnown = Boolean(failure && journey);
  // Short: this sits next to the map button on narrow screens.
  // "Tussen Prinsengracht en Frederiksplein": only from GPS-verified progress.
  const placeText = journey && !ended ? vehiclePlaceText(journey.stops.map((stop) => stopShort(stop.name)), verifiedLive, lastKnown) : "";
  const speedText = placeText && !lastKnown && speedKmh !== null && speedKmh >= 5 ? " · ± " + speedKmh + " km/u" : "";
  const positionText = ritPositionText({ ended, gpsFresh, gpsAgeSeconds: shownGpsAge,
    estimated: journey?.estimatedPosition, lastKnown });
  const journeyNumber = info.journeyNumber || "";
  const carrier = journey?.carrier || single(params.carrier);
  const destination = journey?.destination || fallbackDestination || "Ritinformatie";
  const line = journey?.line || expectedLine || "?";
  const favoriteKey=favoriteJourneyKey(line,destination,boardingId||boardingName);
  const saved=Boolean(boardingName&&isFavoriteJourney(favoriteKey));
  const boardingIndex=journey?findBoardingIndex(journey.stops,boarding):-1;
  const boardingStop=journey&&boardingIndex>=0?journey.stops[boardingIndex]:null;
  // Either source may report the cancellation; /api/rit and /api/halte can disagree.
  const cancellation = tripCancellation(journey?.cancelled, boardCancelled);
  const cancelled = cancellation.cancelled;
  const departureNote = cancelled ? "" : boardingDepartureNote(boardingStop);
  const boardingPlatform = journey && boardingStop ? platformLabel(boardingStop, journey.mode) : "";
  const boardingState=boardingPosition(boardingIndex,verifiedLive);
  const alreadyPassed=boardingState==="passed";
  const arrivalDelta = !cancelled && journey?.live && typeof boardingStop?.delayMinutes === "number" ? boardingStop.delayMinutes : undefined;
  const disruptions = useMemo(() => upcomingJourneyNotices(journey?.disruptions || [], journey?.stops || [], verifiedLive, nowMs, ended),
    [journey, verifiedLive, nowMs, ended]);
  // "Halte vervalt": stops of this trip the vehicle does not call at.
  const skipped = useMemo(() => skippedStopIds(disruptions, journey?.stops || []), [disruptions, journey]);
  // Alighting stop: progress comes from verified GPS; without it the count starts at boarding or the timetable.
  const alightIndex = journey ? findAlightingIndex(journey.stops, alighting, boardingIndex) : -1;
  const alightStop = journey && alightIndex >= 0 ? journey.stops[alightIndex] : null;
  const scheduleAt = journey ? scheduleIndex(journey.stops.map((stop) => timeOf(stop)), nowMs) : -1;
  const alightState = alightingState(alightIndex, verifiedLive, Math.max(boardingIndex, scheduleAt));
  const alightClock = alightStop ? timeOf(alightStop, alightState.status === "passed") : "";
  const alightLine = alightStop ? alightRow({ name: stopShort(alightStop.name), clock: alightClock,
    minutes: minutesUntilArrival(alightClock, nowMs), status: alightState.status, remaining: alightState.remaining, lastKnown }) : null;
  const alightActive = !lastKnown && (alightState.status === "next" || alightState.status === "at");
  // Two short pulses once, when the alighting stop is next (GPS-verified, not on last-known data).
  const alertKey = alightAlertKey(tripId, alightStop ? alighting : null, alightState.status, lastKnown);
  useEffect(() => {
    if (!alertKey || !vibrate) return;
    if (markAlightAlert(alertKey)) vibrateForAlighting();
  }, [alertKey, vibrate]);
  const minAlightIndex = Math.max(boardingIndex, verifiedLive ? verifiedLive.index : -1, 0) + 1;
  const canChooseAlight = Boolean(journey) && !ended && !cancelled && minAlightIndex < (journey?.stops.length || 0);
  // Remember this trip for "Je rit" on Start (after a restart too), until it ends.
  const endClock = journey && journey.stops.length ? timeOf(journey.stops[journey.stops.length - 1]) : "";
  const hasTrip = Boolean(journey);
  const savedAlighting = alightStop ? alighting : null;
  useEffect(() => {
    if (!hasTrip) return;
    if (ended) { void clearActiveTrip(tripId); return; }
    const routeParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      const textValue = single(value as string | string[] | undefined);
      if (textValue) routeParams[key] = textValue;
    }
    routeParams.id = tripId;
    void saveActiveTrip({ tripId, params: routeParams, line, destination, carrier: carrier || "",
      boardingName: boardingStop ? stopShort(boardingStop.name) : boardingName, endClock,
      alighting: savedAlighting, alightName: alightStop ? stopShort(alightStop.name) : "", alightClock, savedAt: Date.now() });
    // Saved on opening, on a new alighting stop and when times move; not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, hasTrip, ended, savedAlighting, alightClock, endClock]);
  const [mapFollowStart, setMapFollowStart] = useState(false);
  const transfersExpanded = transfersOpen ?? (alightState.status === "next" || alightState.status === "at");
  const alertSummary = disruptionSummary(line, disruptions);
  // One position card: where the vehicle is, and one line that follows the trip.
  const headline = journey ? positionHeadline({ ended, placeText: onTheWayText(placeText), live: Boolean(journey.live), cancelled }) : "";
  const vehicleLabel = journey && info.busNumber ? vehicleNoun(journey.mode) + " " + info.busNumber : "";
  const positionSub = cancelled ? (cancellation.source === "haltebord"
      ? "Het vertrekbord meldt deze rit als uitgevallen. Kijk daar voor een alternatief."
      : "De vervoerder meldt deze rit als uitgevallen. Kijk op het vertrekbord voor een alternatief.")
    : ended ? "" : positionText + speedText;
  // Minutes until the boarding stop; negative once its time has passed (then, without GPS, the line goes).
  const boardingRemaining = boardingStop ? clockRemainingMs(timeOf(boardingStop), nowMs) : null;
  const boardingLine = journey && boardingStop && !cancelled && !ended ? boardingProgress({ name: stopShort(boardingStop.name),
    clock: timeOf(boardingStop, alreadyPassed), delayMinutes: arrivalDelta,
    minutes: boardingRemaining === null ? null : Math.ceil(boardingRemaining / 60000),
    state: boardingState, platform: boardingPlatform, note: departureNote, lastKnown }) : null;
  const alertWarning = disruptions.some((notice) => notice.severity === "warning");
  /** Scrolls so that a stop sits a few rows below the top; false while its position is not known yet. */
  function scrollToStop(index: number, animated: boolean): boolean {
    const top = timelineTop.current;
    const y = rowY.current[index];
    if (top === null || y === undefined) return false;
    const target = Math.max(0, top + y - 140);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: target, animated }));
    return true;
  }
  // Where the page opens: the verified vehicle, otherwise the boarding stop. Never a guessed position.
  const scrollTarget = verifiedLive ? verifiedLive.index : boardingIndex;
  function autoScroll() {
    if (autoScrolled.current || mapOpen || choosingAlight || scrollTarget < 0) return;
    if (scrollToStop(scrollTarget, false)) autoScrolled.current = true;
  }
  function onRowLayout(index: number, y: number) {
    rowY.current[index] = y;
    if (index === scrollTarget) autoScroll();
  }
  function toggleMap() { setMapFollowStart(false); setMapOpen((open) => !open); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
  /** Tapping the vehicle in the timeline: open the map following it. */
  function focusVehicle() { setMapFollowStart(true); setMapOpen(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
  function shareArrival() {
    if (!alightStop) return;
    const message = arrivalShareText({ stopName: stopShort(alightStop.name), clock: alightClock, line, destination,
      delayMinutes: journey?.live ? alightStop.delayMinutes : undefined, live: Boolean(journey?.live), lastKnown });
    void Share.share({ message }).catch(() => { /* Share sheet dismissed or unavailable. */ });
  }
  function shareTrip() {
    const message = ritShareText({ line, destination, cancelled,
      boardingName: boardingStop ? stopShort(boardingStop.name) : undefined,
      boardingClock: boardingStop ? timeOf(boardingStop) : undefined,
      delayMinutes: arrivalDelta, platform: boardingPlatform || undefined });
    void Share.share({ message }).catch(() => { /* Share sheet dismissed or unavailable. */ });
  }
  async function pullToRefresh() {
    setRefreshing(true);
    try { await refreshTripRef.current(); } finally { setRefreshing(false); }
  }
  /** Open any stop board, remembering which exact trip Back should restore. */
  function openStopBoard(stop: JourneyStop) {
    const returnTrip: Record<string, string> & { id: string } = { id: tripId };
    for (const [key, value] of Object.entries(params)) {
      const textValue = single(value as string | string[] | undefined);
      if (textValue) returnTrip[key] = textValue;
    }
    // Drop stacked trip routes before opening the board, as before.
    if (router.canDismiss()) router.dismissAll(); else if (router.canGoBack()) router.back(); else router.replace("/");
    followJourneyStop(stop, journey?.mode || "bus", returnTrip);
  }
  function startChoosingAlight() {
    setChoosingAlight(true);
    setMapOpen(false);
    autoScrolled.current = true;
    // A temporary mode: the banner stays under the header; the list scrolls to the first stop that can be chosen.
    setTimeout(() => { scrollToStop(Math.max(0, minAlightIndex - 1), true); }, 60);
  }
  function chooseAlight(stop: JourneyStop, index: number) {
    const value = { id: stop.id, name: stop.name, index };
    setAlighting(value);
    rememberAlighting(tripId, value);
    setChoosingAlight(false);
    setTransfersOpen(null);
  }
  function clearAlight() {
    setAlighting(null);
    rememberAlighting(tripId, null);
    setChoosingAlight(false);
  }
  function toggleVibrate() {
    const next = !vibrate;
    setVibrate(next);
    saveAlightVibration(next);
  }
  // Everything that does not need to be on screen all the time.
  const menuItems: MenuItem[] = [];
  if (journey) menuItems.push({ key: "share", label: "Rit delen", icon: "share-social-outline", onPress: shareTrip });
  if (canChooseAlight) menuItems.push({ key: "choose", label: alightStop ? "Uitstaphalte wijzigen" : "Kies waar je uitstapt", icon: "flag-outline", onPress: startChoosingAlight });
  if (alightStop && alightState.status !== "passed") menuItems.push({ key: "arrival", label: "Aankomsttijd delen", icon: "time-outline", onPress: shareArrival });
  if (alightStop) menuItems.push({ key: "clear", label: "Uitstaphalte wissen", icon: "close", onPress: clearAlight });
  if (boardingName) menuItems.push({ key: "save", label: saved ? "Rit uit favorieten" : "Rit bewaren", icon: saved ? "bookmark" : "bookmark-outline", group: 1, onPress: () => toggleFavorite() });
  menuItems.push({ key: "vibrate", label: "Trillen bij uitstappen", icon: "notifications-outline", checked: vibrate, group: 1, onPress: toggleVibrate });
  menuItems.push({ key: "info", label: "Ritinfo", description: "Rit-ID: " + tripId + (journeyNumber ? " · rit " + journeyNumber : "") + (carrier ? " · " + carrier : ""),
    icon: "information-circle-outline", group: 2, onPress: () => {} });
  function toggleFavorite() {
    if(!boardingName)return;
    // The board's own line and destination let Favorieten find this trip's next departures.
    toggleFavoriteJourney({key:favoriteKey,line,direction:destination,carrier,
      boardLine:expectedLine||undefined,boardDirection:fallbackDestination||undefined,
      stop:{id:boardingId||boardingName,name:boardingName,city:"",mode:journey?.mode||"bus",
        lines:[{line,carrier}]}});
  }


  return <View style={styles.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ExpoStatusBar style={c.statusBar} />
    <View style={[styles.header, { paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight || 24 : 30 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={boardingName ? "Terug naar haltebord" : "Terug"} style={styles.headerButton}><Ionicons name="arrow-back" color={c.text} size={25}/></Pressable>
      <View style={styles.headerBadge}><LijnBadge line={line} carrier={carrier} tone="accent" /></View>
      <View style={styles.headerTitles} accessibilityRole="header"><Text maxFontSizeMultiplier={1.2} style={[styles.headerTitle, destination.length > 18 && styles.headerTitleLong]} numberOfLines={3}><Text style={styles.headerNaar}>naar </Text>{destination}</Text></View>
      {journey ? <Pressable onPress={toggleMap} accessibilityRole="button" accessibilityLabel={mapOpen ? "Kaart sluiten" : "Op kaart"}
        accessibilityState={{ expanded: mapOpen }} style={styles.headerButton}>
        <Ionicons name={mapOpen ? "list-outline" : "map-outline"} color={c.text} size={22}/>
      </Pressable> : null}
      <MenuButton onPress={() => setMenuOpen(true)} color={c.text} label="Meer opties voor deze rit" />
    </View>
    {/* Choosing where to get off is a temporary mode: this bar stays in view while the list scrolls. */}
    {choosingAlight && journey && !mapOpen ? <View style={styles.chooseBanner} accessibilityRole="alert">
      <Ionicons name="flag-outline" color={c.alightTagText} size={17}/>
      <Text style={styles.chooseBannerText}>Tik op de halte waar je uitstapt</Text>
      <Pressable onPress={() => setChoosingAlight(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kiezen annuleren">
        <Text style={styles.chooseCancel}>Annuleren</Text>
      </Pressable>
    </View> : null}
    {loading && !journey ? <JourneySkeleton /> : !journey ? <View style={styles.center}><Text style={styles.message}>{error || (otherTrip ? otherTripMessage(otherTrip, { line: expectedLine, destination: fallbackDestination }) : ritUnavailableMessage(failure))}</Text>{otherTrip ? <Pressable onPress={() => router.replace({ pathname: "/rit/[id]", params: { id: tripId, line: otherTrip.line, destination: otherTrip.destination, carrier: otherTrip.carrier || "" } })} accessibilityRole="button" accessibilityLabel="Huidige rit van deze bus bekijken" style={styles.otherTripLink}><Text style={styles.otherTripLinkText}>Huidige rit van deze bus bekijken</Text></Pressable> : null}<Pressable onPress={() => setRetry((x) => x + 1)} accessibilityRole="button" accessibilityLabel="Ritverloop opnieuw laden" style={styles.retry}><Ionicons name="refresh" color="#FFFFFF" size={17}/><Text style={styles.retryText}>Opnieuw proberen</Text></Pressable>{failure === "offline" && !error ? <Text style={styles.offlineHint}>OVbord probeert het automatisch opnieuw zodra er verbinding is.</Text> : null}</View> :
    <ScrollView ref={scrollRef} style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 12) }]}
      showsVerticalScrollIndicator={false}
      // Once the user scrolls, the page never jumps to the vehicle by itself.
      onScrollBeginDrag={() => { autoScrolled.current = true; }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()}
        colors={[c.green]} tintColor={c.green} progressBackgroundColor={c.surface} />}>
      {continuation ? <View style={styles.continuationBanner} accessibilityRole="alert">
        <Ionicons name="arrow-redo-outline" color={c.navy} size={20}/>
        <Text style={styles.continuationText}>{continuationText(continuation.rit, continuation.firstDeparture)}</Text>
        <Pressable onPress={() => router.replace({ pathname: "/rit/[id]", params: { id: tripId, line: continuation.rit.line,
          destination: continuation.rit.destination, carrier: continuation.rit.carrier || "" } })}
          hitSlop={6} accessibilityRole="button" accessibilityLabel={"Volg de bus op " + continuation.rit.line + " naar " + continuation.rit.destination}>
          <Text style={styles.continuationLink}>Volg bus</Text>
        </Pressable>
      </View> : null}
      {/* Above the timeline only what needs attention: a cancellation, or the alighting stop being next.
          The alighting stop itself is marked in the list; choosing it is under ⋮ (V5.7: no permanent bar). */}
      {cancelled ? <View style={[styles.tripBar, styles.tripBarCancelled]} accessibilityRole="alert">
        <Ionicons name="close-circle" size={22} color={c.red}/>
        <View style={styles.summaryBody}>
          <Text style={[styles.tripBarMain, { color: c.red }]}>Deze rit rijdt niet</Text>
          <Text style={styles.tripBarLabel}>{positionSub}</Text>
        </View>
      </View> : alightLine && (alightState.status === "next" || alightState.status === "at") ? <View style={styles.alightWarning}
        accessibilityRole="alert" accessibilityLiveRegion="polite"
        accessibilityLabel={alightLine.detail + ": " + alightLine.name + ", " + alightLine.clock}>
        <Ionicons name="flag" size={17} color={lastKnown ? c.muted : c.alightTagText}/>
        <Text style={[styles.alightWarningText, lastKnown && { color: c.muted }]}>
          <Text style={styles.positionLineStrong}>{alightLine.detail}</Text>{" · " + alightLine.name + " · " + alightLine.clock}
        </Text>
      </View> : null}
      {/* The user's own stops are named when a notice says the vehicle skips them. */}
      {[boardingStop && boardingLine ? boardingStop : null, alightStop && alightState.status !== "passed" ? alightStop : null]
        .filter((stop): stop is JourneyStop => Boolean(stop) && skipped.has(String(stop!.id)) && !cancelled)
        .map((stop) => <View key={"skip-" + stop.id} style={styles.skipWarning} accessibilityRole="alert">
          <Ionicons name="warning-outline" size={16} color={c.red}/>
          <Text style={[styles.positionLineText, { color: c.red }]}>Let op: stopt niet bij {stopShort(stop.name)} (melding: halte vervalt)</Text>
        </View>)}
      {/* Where the vehicle is: one small line; the vehicle itself is in the timeline. */}
      {!cancelled ? <Pressable onPress={verifiedLive ? focusVehicle : toggleMap} accessibilityRole="button"
        accessibilityLabel={(vehicleLabel ? vehicleLabel + ". " : "") + headline + ". " + positionSub + ". Op kaart"} style={styles.vehicleLine}>
        <Ionicons name={lastKnown ? "cloud-offline-outline" : verifiedLive ? "radio-outline" : "time-outline"} size={15} color={verifiedLive && !lastKnown ? c.green : c.muted}/>
        <Text style={styles.vehicleLineText} numberOfLines={2}>
          {vehicleLabel ? <Text style={styles.vehicleNumber}>{vehicleLabel + "  "}</Text> : null}
          <Text style={styles.vehicleLineStrong}>{headline}</Text>{positionSub && positionSub !== headline ? " · " + positionSub.replace("Live GPS · ", "live ").replace(" geleden", "") : ""}
        </Text>
      </Pressable> : null}
      {/* All notices as one compact row; the details open on tap. */}
      {disruptions.length ? <View style={[styles.ritAlertGroup, alertWarning && styles.ritAlertWarning]}>
        <Pressable onPress={() => setAlertsOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }}
          accessibilityLabel={alertSummary.title + ", " + alertSummary.detail + (alertsOpen ? ", inklappen" : ", details tonen")}
          style={styles.ritAlertHead}>
          <Ionicons name={alertWarning ? "warning-outline" : "information-circle-outline"} size={18} color={alertWarning ? c.red : c.navy}/>
          <View style={{ flex: 1 }}>
            <Text style={styles.ritAlertTitle}>{alertSummary.title}</Text>
            {alertSummary.detail ? <Text style={styles.ritAlertText} numberOfLines={alertsOpen ? undefined : 1}>{alertSummary.detail}</Text> : null}
          </View>
          <Ionicons name={alertsOpen ? "chevron-up" : "chevron-down"} size={17} color={c.muted}/>
        </Pressable>
        {alertsOpen ? disruptions.map((notice, index) => (
          <View key={index} style={styles.ritAlertItem}>
            {notice.badge ? <Text style={styles.ritAlertBadge}>{notice.badge}</Text> : null}
            <Text style={styles.ritAlertItemTitle}>{notice.title}</Text>
            {notice.description ? <Text style={styles.ritAlertText}>{notice.description}</Text> : null}
            {noticeStopsText(notice.stopIds, journey.stops, stopShort) ? <Text style={styles.ritAlertStops}>{noticeStopsText(notice.stopIds, journey.stops, stopShort)}</Text> : null}
          </View>
        )) : null}
      </View> : null}
      {mapOpen ? <>
        <TripMap journey={journey} live={gpsFresh} gpsAgeSeconds={shownGpsAge} nextStop={nextStopIsLive ? nextStop : null} boarding={boarding} expanded
          alight={alightState.status !== "passed" ? alightStop : null} initialFollow={mapFollowStart}/>
        {nextStop ? <View style={styles.mapNextStop}>
          <Ionicons name="location" color={nextStopIsLive && !lastKnown ? c.green : c.muted} size={22}/>
          <View style={{flex:1}}>
            <Text style={[styles.mapNextLabel, (!nextStopIsLive || lastKnown) && { color: c.muted }]}>
              {nextStopIsLive ? (lastKnown ? "Laatst bekende volgende halte" : "Volgende halte · GPS") : "Halte volgens dienstregeling"}
            </Text>
            <Text style={styles.mapNextName} numberOfLines={2}>{nextStop.name}</Text>
          </View>
          <View style={styles.mapNextTimes}>
            <Text style={styles.mapNextTime}>{timeOf(nextStop)}</Text>
            <Text style={styles.mapNextEta}>
              {nextStopIsLive && typeof journey.delaySeconds === "number" &&
                minutesUntilArrival(timeOf(nextStop), nowMs) !== null &&
                minutesUntilArrival(timeOf(nextStop), nowMs)! <= 60
                ? (minutesUntilArrival(timeOf(nextStop), nowMs) === 0 ? (lastKnown ? "± nu" : "nu") :
                  (lastKnown ? "± " : "over ") + minutesUntilArrival(timeOf(nextStop), nowMs) + " min")
                : journey.live && typeof journey.delaySeconds === "number" ? "verwacht" : "gepland"}
            </Text>
          </View>
        </View> : null}
      </> : null}
      {failure ? <Text style={styles.refreshError}>{ritRefreshNotice(failure, fetchedAt)}</Text> : null}
      {mapOpen ? null : <View onLayout={(event: LayoutChangeEvent) => { timelineTop.current = event.nativeEvent.layout.y; autoScroll(); }}>
        <TimeLine journey={journey} liveLocation={verifiedLive} boarding={boarding} onOpenStop={openStopBoard} lastKnown={lastKnown} onFocusVehicle={focusVehicle}
          alightIndex={alightIndex} choosing={choosingAlight} minAlightIndex={minAlightIndex} onChooseAlight={canChooseAlight ? chooseAlight : undefined}
          skipped={skipped} onRowLayout={onRowLayout}/>
      </View>}
      {alightStop && !cancelled && alightState.status !== "passed" && !choosingAlight ? <RitTransfers stop={alightStop} arrivalClock={alightClock}
        expanded={transfersExpanded} onToggle={() => setTransfersOpen(!transfersExpanded)}
        tripId={tripId} line={line} destination={destination}
        onOpenTrip={(item, boardStop) => router.push({ pathname: "/rit/[id]", params: ritParamsForDeparture(item, boardStop) })}
        onOpenBoard={() => openStopBoard(alightStop)}/> : null}
      <Text style={styles.disclaimer}>Alleen bevestigde GPS verschijnt als live positie. Dienstregeling en verwachtingen kunnen wijzigen.</Text>
    </ScrollView>}
    {/* Last child: the menu lies above the trip. */}
    <OverflowMenu open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} title="Meer acties voor deze rit" />
  </View>;
}

// Light and dark style sheets are built once; useRitTheme picks the active one.
// Map overlays keep fixed light colours because they sit on light PDOK tiles.
function makeStyles(c: RitColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.page },
  // V5.7: white header with a hairline; the green line badge is the accent.
  header: { backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    flexDirection: "row", alignItems: "center", paddingBottom: 10, paddingHorizontal: 6, minHeight: 76 },
  headerButton: { width: 39, height: 42, alignItems: "center", justifyContent: "center" },
  headerBadge: { marginLeft: 2, marginRight: 10 },
  headerTitles: { flex: 1, minWidth: 0 },
  headerTitle: { color: c.text, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  headerTitleLong: { fontSize: 17, lineHeight: 21 },
  headerNaar: { fontWeight: "500", color: c.muted },
  headerSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25, gap: 16 },
  message: { fontSize: 14, color: c.muted, textAlign: "center" },
  retry: { backgroundColor: c.buttonBg, borderRadius: 7, paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  retryText: { color: "white", fontWeight: "700" },
  scroll: { flex: 1 }, content: { paddingBottom: 24 },
  summaryCard: { marginHorizontal: 12, marginTop: 13, marginBottom: 12, borderRadius: 15,
    borderColor: c.summaryBorder, borderWidth: 1, backgroundColor: c.summaryBg, overflow: "hidden" },
  summaryArrival: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 12, gap: 9 },
  summaryHeaderRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  summaryBody: { flex: 1, minWidth: 0 },
  positionCard: { marginHorizontal: 12, marginTop: 4, marginBottom: 10, borderRadius: 14, borderWidth: 1,
    borderColor: c.positionBorder, backgroundColor: c.positionBg, overflow: "hidden" },
  positionCardCancelled: { borderColor: c.cancelBorder, backgroundColor: c.cancelBg },
  positionTop: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  positionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.positionIconBg, alignItems: "center", justifyContent: "center" },
  positionTitle: { color: c.text, fontSize: 15, lineHeight: 19, fontWeight: "800" },
  positionSub: { color: c.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  positionMap: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  positionLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.positionBorder },
  positionLineActive: { backgroundColor: c.alightTagBg },
  positionLineText: { flex: 1, color: c.text, fontSize: 12.5, lineHeight: 17 },
  positionLineStrong: { fontWeight: "800" },
  tripBar: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginTop: 4, marginBottom: 6,
    paddingHorizontal: 14, paddingVertical: 10, minHeight: 58, borderRadius: 14 },
  tripBarBoarding: { backgroundColor: c.positionBg },
  tripBarAlight: { backgroundColor: c.alightRowBg },
  tripBarAlightActive: { backgroundColor: c.alightTagBg },
  tripBarCancelled: { backgroundColor: c.cancelBg, borderWidth: 1, borderColor: c.cancelBorder },
  tripBarLabel: { color: c.muted, fontSize: 12.5, lineHeight: 16 },
  tripBarMain: { color: c.text, fontSize: 15.5, lineHeight: 20 },
  skipWarning: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginBottom: 6 },
  vehicleLine: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, paddingVertical: 6 },
  vehicleLineText: { flex: 1, color: c.muted, fontSize: 12.5, lineHeight: 17 },
  vehicleLineStrong: { color: c.text, fontWeight: "700" },
  vehicleNumber: { color: c.muted, fontWeight: "800" },
  // Shown only while the alighting stop is next or reached: a warning, not a permanent bar.
  alightWarning: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 12, marginTop: 8, marginBottom: 2,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: c.alightRowBg },
  alightWarningText: { flex: 1, color: c.alightTagText, fontSize: 13, lineHeight: 18 },
  timelineNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 7, rowGap: 3 },
  alightSub: { color: c.alightTagText, fontSize: 12.5, fontWeight: "600", marginTop: 1 },
  boardingSub: { color: c.green, fontSize: 12.5, fontWeight: "600", marginTop: 1 },
  passedSub: { color: c.passedName, fontSize: 12, marginTop: 1 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, paddingVertical: 10, minHeight: 54,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.positionBorder },
  stopRowPressed: { opacity: 0.7 },
  stopRowMain: { color: c.text, fontSize: 14, lineHeight: 19 },
  stopRowName: { fontWeight: "800" },
  stopRowDetail: { color: c.muted, fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  stopRowDetailActive: { color: c.alightTagText, fontWeight: "800" },
  stopRowChoose: { flex: 1, color: c.alightTagText, fontWeight: "800" },
  summaryEyebrow: { color: c.muted, fontSize: 11.5, fontWeight: "700" },
  summaryStopName: { color: c.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
  summaryStage: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6, alignSelf: "flex-start" },
  summaryStageText: { fontSize: 10.5, fontWeight: "800" },
  summaryTimeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 29 },
  summaryTimeBody: { flex: 1, minWidth: 0 },
  summaryClock: { fontSize: 30, lineHeight: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },
  summaryContext: { color: c.muted, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
  summaryDeparture: { color: c.navy, fontSize: 11.5, fontWeight: "700", marginTop: 4 },
  summaryPosition: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 14,
    paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.summaryDivider },
  summaryPositionOnly: { borderTopWidth: 0 },
  summaryPositionText: { flex: 1, color: c.muted, fontSize: 12, lineHeight: 17 },
  summaryNextRow: { flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 14,
    paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.summaryDivider },
  summaryNextText: { flex: 1, color: c.text, fontSize: 11.5, fontWeight: "700" },
  summaryNextClock: { color: c.green, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  mapToggleText: { color: c.navy, fontSize: 11, fontWeight: "800" },
  mapToggle: { minHeight: 36, paddingHorizontal: 11, borderWidth: 1, borderColor: c.toggleBorder,
    borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.surface },
  map: { width: "100%", height: 230, backgroundColor: c.mapBg, overflow: "hidden", borderBottomWidth: 1, borderBottomColor: c.border },
  mapExpanded: { height: 415 },
  mapStatus: { position: "absolute", left: 11, top: 11, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "#FFFFFFEF", maxWidth: "76%" },
  mapStatusDot: { width: 8, height: 8, borderRadius: 4 },
  mapStatusText: { color: TEXT, fontSize: 10.5, fontWeight: "700" },
  mapFollow: { position: "absolute", left: 11, top: 51, minHeight: 37, paddingHorizontal: 11,
    backgroundColor: "#FFFFFFF2", borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 7,
    borderWidth: 1, borderColor: "#DDE6F0" },
  mapFollowActive: { backgroundColor: GREEN, borderColor: GREEN },
  mapFollowDisabled: { opacity: 0.48 },
  mapFollowText: { fontSize: 11, fontWeight: "800", color: NAVY },
  mapFollowActiveText: { color: "#FFFFFF" },
  mapUnavailable: { color: c.muted, alignSelf: "center", marginTop: 95, fontSize: 13 },
  mapDot: { width: 10, height: 10, position: "absolute", borderRadius: 5, borderWidth: 2, borderColor: BLUE, backgroundColor: "#FFFFFF" },
  mapBoarding:{position:"absolute",width:24,height:24,borderRadius:6,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",borderColor:"#FFFFFF",borderWidth:2},
  mapAlight:{position:"absolute",width:24,height:24,borderRadius:6,backgroundColor:RIDE,alignItems:"center",justifyContent:"center",borderColor:"#FFFFFF",borderWidth:2},
  mapEnd:{position:"absolute",width:26,height:26,borderRadius:8,backgroundColor:TEXT,alignItems:"center",justifyContent:"center",borderColor:"#FFFFFF",borderWidth:2},
  mapBus: { position: "absolute", width: 28, height: 28, backgroundColor: GREEN, borderRadius: 7, borderWidth: 2, borderColor: "white", alignItems: "center", justifyContent: "center" },
  mapControls: { position: "absolute", right: 12, top: 10, gap: 5 },
  mapCtrl: { width: 31, height: 31, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 2 },
  mapAttribution: { position: "absolute", bottom: 1, right: 4, fontSize: 8, color: "#536071", backgroundColor: "#FFFFFFCC", paddingHorizontal: 3 },
  mapNextStop: { margin: 12, padding: 14, backgroundColor: c.surface, borderRadius: 13, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  mapNextLabel: { fontSize: 10.5, color: c.green, fontWeight: "700" },
  mapNextName: { fontSize: 14, fontWeight: "800", color: c.text, marginTop: 3 },
  mapNextTimes: { alignItems: "flex-end", gap: 3 },
  mapNextTime: { fontSize: 14, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] },
  mapNextEta: { fontSize: 10.5, fontWeight: "700", color: c.muted },
  refreshError: { paddingHorizontal: 14, paddingVertical: 9, color: c.refreshError, fontSize: 11 },
  offlineHint: { fontSize: 12, color: c.muted, textAlign: "center", maxWidth: 280 },
  timeLine: { marginTop: 0 },
  timelineRow: { position: "relative", flexDirection: "row", alignItems: "center", minHeight: 42, paddingHorizontal: 12 },
  timelineRowWithVehicle: { zIndex: 2 },
  timelineRowAtVehicle: { minHeight: 50 },
  // The next stop: a subtle green row and label.
  timelineRowNext: { backgroundColor: c.boardingRowBg },
  passedRow: { minHeight: 36 },
  passedName: { color: c.passedName, fontWeight: "400" },
  timelineImportantName: { fontWeight: "800", fontSize: 15.5 },
  timelineImportantTime: { fontWeight: "800", color: c.text },
  afterAlightText: { color: c.passedName },
  alightTime: { color: c.alightTagText, fontWeight: "900" },
  alightName: { color: c.alightTagText, fontWeight: "900", fontSize: 15.5 },
  nextTag: { backgroundColor: c.boardingTagBg, color: c.boardingTagText, fontSize: 10, fontWeight: "800",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, overflow: "hidden", alignSelf: "flex-start", marginTop: 2 },
  boardingRow:{backgroundColor:c.boardingRowBg},
  boardingTag:{backgroundColor:c.boardingTagBg,color:c.boardingTagText,fontSize:11,fontWeight:"800",paddingHorizontal:8,paddingVertical:3,borderRadius:10,overflow:"hidden"},
  timelineTimeCol: { width: 64, justifyContent: "center" },
  timelineActualLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  timelineTime: { fontSize: 13.5, color: c.muted, fontVariant: ["tabular-nums"] },
  timelineOldTime: { color: c.muted, fontSize: 10, textDecorationLine: "line-through" },
  passedText: { color: c.passedText },
  delayText: { fontSize: 10, fontWeight: "700", ...(c.delayText ? { color: c.delayText } : null) },
  timelineRail: { width: 30, minHeight: 42, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  railTop: { position: "absolute", top: 0, height: "50%", width: 3 },
  railBottom: { position: "absolute", top: "50%", bottom: 0, width: 3 },
  railNode: { width: 14, height: 14, borderWidth: 2.5, borderRadius: 7, alignItems: "center", justifyContent: "center", zIndex: 1 },
  railVehicle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", zIndex: 1,
    borderWidth: 2, borderColor: c.vehicleRing },
  railAlight: { width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, backgroundColor: c.railFill, alignItems: "center", justifyContent: "center", zIndex: 1 },
  railAlightDot: { width: 9, height: 9, borderRadius: 5 },
  // Centred on the rail: row padding 12 + time column 64 + half the rail (15) - half the marker (12).
  vehicleOnRail: { position: "absolute", left: 79, bottom: -12, width: 24, height: 24, borderRadius: 12,
    backgroundColor: c.green, borderWidth: 2, borderColor: c.vehicleRing, justifyContent: "center",
    alignItems: "center", zIndex: 4 },
  timelineLabel: { flex: 1, paddingLeft: 10, minWidth: 0, justifyContent: "center", paddingVertical: 3 },
  timelineName: { flexShrink: 1, fontSize: 14.5, color: c.text, fontWeight: "500" },
  nowTag: { backgroundColor: c.nowTagBg, borderRadius: 10, color: c.green, fontSize: 11, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  endTag: { backgroundColor: c.endTagBg, borderRadius: 9, color: c.text, fontSize: 9.5, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 3, overflow: "hidden" },
  lastStop: { fontWeight: "800" },
  moreInfo:{marginHorizontal:13,marginTop:8,flexDirection:"row",alignItems:"center",gap:5,paddingVertical:6},
  moreInfoText:{color:c.muted,fontSize:11,fontWeight:"700"},
  ritDetails:{color:c.muted,fontSize:11,marginHorizontal:16,marginBottom:10},
  disclaimer: { fontSize: 10, color: c.muted, paddingHorizontal: 13, paddingVertical: 10 },
  timelineRowPressed: { opacity: 0.6 },
  tagMuted: { backgroundColor: c.stageNeutralBg, color: c.muted },
  alightRow: { backgroundColor: c.alightRowBg },
  skippedName: { textDecorationLine: "line-through", color: c.muted },
  skipTag: { backgroundColor: c.cancelBg, color: c.red, fontSize: 11, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  ritAlertStops: { color: c.text, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  alightTag: { backgroundColor: c.alightTagBg, color: c.alightTagText, fontSize: 11, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  timelineRowDisabled: { opacity: 0.4 },
  summaryAlightRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.summaryDivider },
  summaryAlightActive: { backgroundColor: c.alightTagBg },
  summaryAlightTitle: { color: c.text, fontSize: 13, fontWeight: "900" },
  summaryAlightDetail: { color: c.muted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  summaryAlightButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  summaryAlightChoose: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.summaryDivider },
  summaryAlightChooseText: { flex: 1, color: c.navy, fontSize: 12, fontWeight: "800" },
  chooseBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: c.alightTagBg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  chooseBannerText: { flex: 1, color: c.text, fontSize: 12.5, fontWeight: "800" },
  chooseCancel: { color: c.navy, fontSize: 12, fontWeight: "800" },
  timelinePlatform: { color: c.muted, fontSize: 9.5, fontWeight: "700", marginTop: 1 },
  timelinePlatformChanged: { color: c.red },
  struck: { textDecorationLine: "line-through" },
  summaryPlatform: { color: c.navy, fontSize: 11.5, fontWeight: "800", marginTop: 4 },
  cancelBanner: { marginHorizontal: 12, marginTop: 13, padding: 12, borderRadius: 13, borderWidth: 1,
    borderColor: c.cancelBorder, backgroundColor: c.cancelBg, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  cancelTitle: { color: c.red, fontSize: 14, fontWeight: "900" },
  cancelText: { color: c.text, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  ritAlerts: { marginHorizontal: 12, marginBottom: 12, gap: 6 },
  ritAlert: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 11, borderRadius: 11, borderWidth: 1,
    borderColor: c.summaryBorder, backgroundColor: c.summaryBg },
  ritAlertWarning: { borderColor: c.warnAlertBorder, backgroundColor: c.warnAlertBg },
  ritAlertTitle: { color: c.text, fontSize: 12.5, fontWeight: "800" },
  ritAlertText: { color: c.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  ritAlertMore: { color: c.muted, fontSize: 11, fontWeight: "700", paddingHorizontal: 4 },
  summaryPlaceText: { color: c.text, fontSize: 13, fontWeight: "800" },
  summaryPositionSub: { color: c.muted, fontSize: 11.5, marginTop: 1 },
  continuationBanner: { marginHorizontal: 12, marginTop: 13, padding: 12, borderRadius: 13, borderWidth: 1,
    borderColor: c.summaryBorder, backgroundColor: c.nextTagBg, flexDirection: "row", alignItems: "center", gap: 9 },
  continuationText: { flex: 1, color: c.text, fontSize: 12.5, fontWeight: "800", lineHeight: 17 },
  continuationLink: { color: c.blue, fontSize: 12, fontWeight: "900" },
  otherTripLink: { paddingVertical: 8 },
  otherTripLinkText: { color: c.blue, fontSize: 13, fontWeight: "800" },
  ritAlertGroup: { marginHorizontal: 12, marginBottom: 10, borderRadius: 12, borderWidth: 1,
    borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" },
  ritAlertHead: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 9, minHeight: 44 },
  ritAlertItem: { paddingHorizontal: 11, paddingVertical: 9, gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.summaryDivider },
  ritAlertBadge: { alignSelf: "flex-start", backgroundColor: c.stageNeutralBg, color: c.text, fontSize: 10, fontWeight: "800",
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, overflow: "hidden" },
  ritAlertItemTitle: { color: c.text, fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  });
}

const RIT_STYLES = { light: makeStyles(ritColors.light), dark: makeStyles(ritColors.dark) };

/** Active trip-page colours and styles, following the app theme (light/dark/system). */
function useRitTheme() {
  const { resolvedScheme } = useApp();
  const scheme = resolvedScheme === "dark" ? "dark" : "light";
  return { c: ritColors[scheme], styles: RIT_STYLES[scheme] };
}
