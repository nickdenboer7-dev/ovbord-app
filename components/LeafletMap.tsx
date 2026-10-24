import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { mapFitKey } from "../lib/mapFit";

export type LeafletPoint = { latitude: number; longitude: number };
export type LeafletMarker = {
  id: string;
  lat: number;
  lon: number;
  title?: string;
  color?: string;
};

type Props = {
  polyline?: LeafletPoint[];
  markers?: LeafletMarker[];
  vehicle?: { lat: number; lon: number };
  center?: { lat: number; lon: number };
};

// PDOK BRT-Achtergrondkaart (Kadaster, CC BY 4.0): same tiles as the trip page, meant for app use.
// OpenStreetMap's public tile servers are not intended for app traffic.
const TILE_URL = "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/{z}/{x}/{y}.png";

const HTML = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<style>
html,body,#map{width:100%;height:100%;margin:0;padding:0;background:#f5f7f5;overflow:hidden}
.leaflet-control-attribution{font:9px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
(function(){
  var initialView = __INITIAL_VIEW__;
  var map = L.map('map', { zoomControl: true, attributionControl: true, preferCanvas: true }).setView(initialView ? [initialView.lat,initialView.lon] : [52.2,5.3], initialView ? 14 : 7);
  L.tileLayer('${TILE_URL}', { maxZoom: 19, maxNativeZoom: 17, minZoom: 6, attribution: 'Kaart &copy; Kadaster' }).addTo(map);
  var route = L.polyline([], { color:'#1D6F42', weight:5, opacity:.9 }).addTo(map);
  var markerLayer = L.layerGroup().addTo(map);
  var vehicleLayer = L.layerGroup().addTo(map);
  // Re-frame only when the framed content changes (fitKey from React Native), not on every refresh.
  var lastFitKey = "";

  function safeColor(value, fallback){ return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : fallback; }
  function update(payload){
    if(!payload) return;
    var points = Array.isArray(payload.polyline) ? payload.polyline : [];
    var latlngs = points.filter(function(p){ return Number.isFinite(p.latitude) && Number.isFinite(p.longitude); }).map(function(p){ return [p.latitude,p.longitude]; });
    route.setLatLngs(latlngs);
    markerLayer.clearLayers();
    (payload.markers || []).forEach(function(m){
      if(!Number.isFinite(m.lat) || !Number.isFinite(m.lon)) return;
      L.circleMarker([m.lat,m.lon], { radius:7, color:'#ffffff', weight:2, fillColor:safeColor(m.color,'#75847b'), fillOpacity:1 })
        .bindTooltip(m.title || '', { direction:'top' }).addTo(markerLayer);
    });
    vehicleLayer.clearLayers();
    if(payload.vehicle && Number.isFinite(payload.vehicle.lat) && Number.isFinite(payload.vehicle.lon)){
      L.circleMarker([payload.vehicle.lat,payload.vehicle.lon], { radius:9, color:'#ffffff', weight:3, fillColor:'#1D6F42', fillOpacity:1 })
        .bindTooltip('Voertuig', { direction:'top' }).addTo(vehicleLayer);
    }

    var fitKey = typeof payload.fitKey === "string" ? payload.fitKey : "";
    if(fitKey && fitKey !== lastFitKey){
      lastFitKey = fitKey;
      var bounds = [];
      latlngs.forEach(function(p){ bounds.push(p); });
      (payload.markers || []).forEach(function(m){ if(Number.isFinite(m.lat) && Number.isFinite(m.lon)) bounds.push([m.lat,m.lon]); });
      if(payload.vehicle && Number.isFinite(payload.vehicle.lat) && Number.isFinite(payload.vehicle.lon)) bounds.push([payload.vehicle.lat,payload.vehicle.lon]);
      if(bounds.length > 1){ map.fitBounds(bounds, { padding:[22,22], maxZoom:16 }); }
      else if(payload.center && Number.isFinite(payload.center.lat) && Number.isFinite(payload.center.lon)){ map.setView([payload.center.lat,payload.center.lon], 14); }
      else if(bounds.length === 1){ map.setView(bounds[0], 15); }
    }
  }

  function receive(event){
    try { update(JSON.parse(event.data)); } catch(e) {}
  }
  document.addEventListener('message', receive);
  window.addEventListener('message', receive);
  window.__ovbordUpdate = update;
})();
</script>
</body>
</html>`;

export function LeafletMap({ polyline = [], markers = [], vehicle, center }: Props) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const initialCenter = useRef(center || vehicle || (markers[0] ? { lat: markers[0].lat, lon: markers[0].lon } : null)).current;
  const source = useMemo(() => ({ html: HTML.replace("__INITIAL_VIEW__", JSON.stringify(initialCenter)) }), [initialCenter]);
  const payload = useMemo(() => JSON.stringify({ polyline, markers, vehicle, center,
    fitKey: mapFitKey(markers, center, polyline.length) }), [polyline, markers, vehicle, center]);

  useEffect(() => {
    if (!ready) return;
    ref.current?.postMessage(payload);
  }, [payload, ready]);

  return (
    <View style={styles.wrap}>
      <WebView
        ref={ref}
        source={source}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        onLoadEnd={() => setReady(true)}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: "transparent" }
});
