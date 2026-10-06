import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { Reliability } from "../types/api";

export function BetrouwbaarheidsBar({ reliability }: { reliability: Reliability }) {
  const { colors } = useApp();
  const reliabilityColors: Record<Reliability, string> = {
    high: colors.success,
    medium: colors.warning,
    low: colors.danger
  };

  return <View style={[styles.bar, { backgroundColor: reliabilityColors[reliability] }]} />;
}

const styles = StyleSheet.create({
  bar: {
    width: 4,
    flex: 1,
    alignSelf: "stretch",
    borderRadius: 2
  }
});
