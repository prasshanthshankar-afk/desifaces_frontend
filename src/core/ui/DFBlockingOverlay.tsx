import React from "react";
import { Modal, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { DF } from "../theme/colors";

export default function DFBlockingOverlay({
  visible,
  title = "Working…",
  message,
}: {
  visible: boolean;
  title?: string;
  message?: string;
}) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.msg}>{message}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    backgroundColor: (DF as any)?.card ?? "#141824",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: (DF as any)?.text ?? "#EAEAF2",
    marginTop: 6,
  },
  msg: {
    fontSize: 13,
    color: (DF as any)?.muted ?? "#AAB0C0",
    textAlign: "center",
    lineHeight: 18,
  },
});