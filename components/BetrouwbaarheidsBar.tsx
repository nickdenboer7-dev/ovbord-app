import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { Reliability } from "../types/api";

export function BetrouwbaarheidsBar({ reliability }: { reliability: Reliability }) {
  const { colors } = useApp();
  const backgroundColor = reliability === "high" ? colors.success : reliability === "medium" ? colors.warning : colors.danger;
  return <View style={[styles.bar, { backgroundColor }]} />;
}

const styles = StyleSheet.create({ bar: { width: 6, borderRadius: 999, alignSelf: "stretch" } });
