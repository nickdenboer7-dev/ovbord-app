import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useApp } from "../context/AppProvider";

type Props = {
  disabled?: boolean;
  inverted?: boolean;
};

export function SettingsButton({ disabled = false, inverted = false }: Props) {
  const { colors } = useApp();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Instellingen"
      disabled={disabled}
      onPress={() => router.push("/meer" as never)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: inverted ? "rgba(255,255,255,0.12)" : colors.surface,
          borderColor: inverted ? "rgba(255,255,255,0.4)" : colors.border,
          opacity: pressed ? 0.72 : 1
        }
      ]}
    >
      <Ionicons name="settings-outline" size={21} color={inverted ? "#FFFFFF" : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  }
});
