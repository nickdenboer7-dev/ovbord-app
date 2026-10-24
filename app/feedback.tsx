import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import { submitFeedback } from "../lib/feedback";

export default function FeedbackScreen() {
  const { colors } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ stop_id?: string; stop_name?: string; reported_at?: string }>();
  const [message, setMessage] = useState(() => params.stop_id ? "Klopt dit niet?\nHalte: " + (params.stop_name || params.stop_id) +
    "\nTijdstip: " + new Date(params.reported_at || Date.now()).toLocaleString("nl-NL") + "\n\n" : "");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (message.trim().length < 10) { Alert.alert("Vertel iets meer", "Schrijf minimaal 10 tekens."); return; }
    if (email.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim())) {
      Alert.alert("Controleer je e-mailadres", "Laat dit veld leeg of vul een geldig e-mailadres in."); return;
    }
    setSending(true);
    try {
      const result = await submitFeedback({ message, contact: email, stop_id: params.stop_id,
        stop_name: params.stop_name, reported_at: params.reported_at });
      Alert.alert(result.sent ? "Bedankt voor je feedback" : "Feedback bewaard",
        result.sent ? "Je bericht is ontvangen." : "Je bericht staat op dit toestel. OVbord verstuurt het zodra er weer verbinding is.",
        [{ text: "OK", onPress: () => router.back() }]);
    } catch { Alert.alert("Nog niet bewaard", "Bewaren is niet gelukt. Je tekst blijft staan; probeer het opnieuw."); }
    finally { setSending(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 12, borderColor: colors.border }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Terug" hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={colors.heading} />
      </Pressable>
      <Text style={[styles.title, { color: colors.heading }]} accessibilityRole="header">Feedback geven</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      <Text style={{ color: colors.textSoft, lineHeight: 21 }}>Wat werkt goed, of wat kan beter?</Text>
      <Text style={[styles.label, { color: colors.text }]}>Je bericht</Text>
      <TextInput testID="feedback-message" accessibilityLabel="Je bericht" multiline textAlignVertical="top" maxLength={2000}
        value={message} onChangeText={setMessage} editable={!sending}
        style={[styles.input, styles.message, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]} />
      <Text style={[styles.label, { color: colors.text }]}>E-mailadres (optioneel)</Text>
      <TextInput accessibilityLabel="E-mailadres (optioneel)" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        maxLength={200} value={email} onChangeText={setEmail} editable={!sending}
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]} />
      <Text style={{ color: colors.textSoft, fontSize: 12, lineHeight: 18 }}>We sturen alleen je bericht, eventueel je e-mailadres, appversie en toestelmodel mee. Bij een melding over een halte ook die halte en het gekozen tijdstip.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Feedback versturen" disabled={sending} onPress={() => void send()}
        style={[styles.send, { backgroundColor: colors.accent, opacity: sending ? .6 : 1 }]}>
        <Text style={styles.sendText}>{sending ? "Bewaren en versturen…" : "Versturen"}</Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontWeight: "800", flex: 1 }, content: { padding: 18, gap: 12 },
  label: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, minHeight: 48 },
  message: { minHeight: 170 }, send: { borderRadius: 10, minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 10 },
  sendText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" }
});
