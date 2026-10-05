import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";

export default function FavorietenScreen() {
  const { colors, favoriteStops, favoriteLines, addRecentStop } = useApp();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.headerRow}><View style={styles.headerCopy}><Text style={[styles.title, { color: colors.text }]}>Favorieten</Text><Text style={[styles.subtitle, { color: colors.textSoft }]}>Jouw vaste haltes en lijnen</Text></View><SettingsButton /></View>
      <FlatList
        data={favoriteStops}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete lijnen</Text><View style={styles.lineWrap}>{favoriteLines.length ? favoriteLines.map((line) => <LijnBadge key={line} line={line} compact />) : <Text style={{ color: colors.textSoft }}>Nog geen favoriete lijnen.</Text>}</View></View>}
        renderItem={({ item }) => <Pressable onPress={() => { addRecentStop(item); router.push({ pathname: "/halte/[id]", params: { id: item.id } }); }} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.stopRow}><View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} /><View style={{ flex: 1 }}><Text style={[styles.stopTitle, { color: colors.text }]}>{item.name}</Text><Text style={[styles.stopMeta, { color: colors.textSoft }]}>{item.city}</Text><View style={styles.lineWrap}>{item.lines.slice(0, 5).map((line, index) => <LijnBadge key={`${line.line}-${index}`} line={line.line} carrier={line.carrier} compact />)}</View></View></View></Pressable>}
        ListEmptyComponent={<View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.textSoft }}>Nog geen favoriete haltes. Open een halte en tik op de ster.</Text></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, headerRow: { paddingTop: 58, paddingHorizontal: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }, headerCopy: { flex: 1 }, title: { fontSize: 27, fontWeight: "800" }, subtitle: { marginTop: 4, fontSize: 13 }, content: { padding: 16, gap: 12, paddingBottom: 28 }, card: { borderWidth: 1, borderRadius: 20, padding: 16 }, cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 10 }, stopRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, modeDot: { width: 16, height: 16, borderRadius: 999, marginTop: 4 }, stopTitle: { fontSize: 16, fontWeight: "800" }, stopMeta: { marginTop: 4, fontSize: 13 }, lineWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }
});
