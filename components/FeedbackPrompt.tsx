import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Alert, AppState, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { registerFeedbackLaunch, retryFeedback, submitFeedback } from "../lib/feedback";

export function FeedbackPrompt() {
  const { colors } = useApp();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<"positive" | "negative" | undefined>();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let active = true;
    void registerFeedbackLaunch().then((show) => { if (active) setOpen(show); }).catch(() => {});
    const retry = () => { if (AppState.currentState === "active") void retryFeedback().catch(() => {}); };
    retry();
    const sub = AppState.addEventListener("change", retry);
    const interval = setInterval(retry, 30000);
    return () => { active = false; sub.remove(); clearInterval(interval); };
  }, []);
  const send = async () => {
    if (!rating) return;
    setSending(true);
    try {
      const result = await submitFeedback({ rating, message: message.trim() || (rating === "positive" ? "OVbord bevalt goed." : "OVbord kan beter.") });
      setOpen(false);
      Alert.alert("Bedankt!", result.sent ? "Je feedback is ontvangen." : "Je feedback is bewaard en wordt later verstuurd.");
    } catch { Alert.alert("Nog niet bewaard", "Probeer het opnieuw."); }
    finally { setSending(false); }
  };
  return <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Feedbackkaart sluiten" onPress={() => setOpen(false)} />
      <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.heading }]}>Hoe bevalt OVbord?</Text>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Sluiten" hitSlop={12}>
            <Ionicons name="close" size={23} color={colors.textSoft} />
          </Pressable>
        </View>
        <View style={styles.rating}>
          {(["positive", "negative"] as const).map((value) => <Pressable key={value} onPress={() => setRating(value)}
            accessibilityRole="radio" accessibilityState={{ checked: rating === value }} accessibilityLabel={value === "positive" ? "Bevalt goed" : "Kan beter"}
            style={[styles.thumb, { borderColor: rating === value ? colors.accentText : colors.border }]}>
            <Text style={{ fontSize: 30 }}>{value === "positive" ? "👍" : "👎"}</Text>
          </Pressable>)}
        </View>
        {rating ? <>
          <TextInput accessibilityLabel="Toelichting (optioneel)" placeholder="Toelichting (optioneel)" placeholderTextColor={colors.textSoft}
            multiline maxLength={2000} value={message} onChangeText={setMessage} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <Pressable onPress={() => void send()} disabled={sending} accessibilityRole="button" style={[styles.send, { backgroundColor: colors.accent }]}>
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{sending ? "Versturen…" : "Versturen"}</Text>
          </Pressable>
        </> : null}
        <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={{ padding: 8, alignSelf: "center" }}>
          <Text style={{ color: colors.textSoft }}>Overslaan</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.4)", justifyContent: "center", padding: 24 },
  card: { borderRadius: 18, padding: 20, gap: 16 }, heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 22, fontWeight: "800", flex: 1 }, rating: { flexDirection: "row", justifyContent: "center", gap: 20 },
  thumb: { width: 76, minHeight: 64, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, minHeight: 90, padding: 12, borderRadius: 10, textAlignVertical: "top", fontSize: 15 },
  send: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 10 }
});
