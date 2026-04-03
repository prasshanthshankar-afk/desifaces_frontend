import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { router } from "expo-router";
import { DF } from "../../core/theme/colors";
import { useAuth } from "../../core/auth/AuthContext";
import { AuthBrandHeader } from "./AuthBrandHeader";

export function ResetPasswordScreen() {
  const { resetPassword } = useAuth();

  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const glow = useRef(new Animated.Value(0)).current;

  const pwOk = useMemo(() => pw.length >= 8, [pw]);
  const matchOk = useMemo(() => pw === pw2 && pw2.length > 0, [pw, pw2]);
  const tokenOk = useMemo(() => token.trim().length >= 6, [token]);
  const canSubmit = tokenOk && pwOk && matchOk && !busy;

  const animateGlow = (on: boolean) => {
    Animated.timing(glow, {
      toValue: on ? 1 : 0,
      duration: on ? 180 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const submit = async () => {
    setErr(null);
    const t = token.trim();

    if (t.length < 6) return setErr("Enter the reset token.");
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords do not match.");

    setBusy(true);
    try {
      await resetPassword(t, pw);
      setDone(true);
      setTimeout(() => router.replace("/(auth)/login"), 700);
    } catch {
      setErr("Reset failed. Token may be invalid or expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: DF.night }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <AuthBrandHeader
          title="Set new password"
          subtitle="Use the reset token you received"
        />

        <View
          style={{
            marginTop: 6,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: DF.border,
            backgroundColor: DF.card,
            padding: 16,
          }}
        >
          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8 }}>
            RESET TOKEN
          </Text>

          <View style={{ position: "relative", marginBottom: 12 }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                inset: -2,
                borderRadius: 18,
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
                backgroundColor: DF.cyan,
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
              }}
            />
            <TextInput
              value={token}
              onChangeText={(t) => {
                setToken(t);
                if (err) setErr(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste token here"
              placeholderTextColor="rgba(255,255,255,0.35)"
              onFocus={() => animateGlow(true)}
              onBlur={() => animateGlow(false)}
              style={{
                backgroundColor: DF.night2,
                borderColor: DF.border,
                borderWidth: 1,
                borderRadius: 18,
                paddingVertical: 14,
                paddingHorizontal: 14,
                color: DF.text,
                fontSize: 14,
              }}
            />
          </View>

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8 }}>
            NEW PASSWORD
          </Text>

          <View style={{ position: "relative", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextInput
                value={pw}
                onChangeText={(t) => {
                  setPw(t);
                  if (err) setErr(null);
                }}
                secureTextEntry={!showPw}
                placeholder="Minimum 8 characters"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  flex: 1,
                  backgroundColor: DF.night2,
                  borderColor: DF.border,
                  borderWidth: 1,
                  borderRadius: 18,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  color: DF.text,
                  fontSize: 14,
                  paddingRight: 92,
                }}
              />
              <Pressable
                onPress={() => setShowPw((v) => !v)}
                style={{
                  position: "absolute",
                  right: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: DF.border,
                  backgroundColor: "rgba(255,255,255,0.04)",
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "700", fontSize: 11 }}>
                  {showPw ? "HIDE" : "SHOW"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8 }}>
            CONFIRM PASSWORD
          </Text>

          <TextInput
            value={pw2}
            onChangeText={(t) => {
              setPw2(t);
              if (err) setErr(null);
            }}
            secureTextEntry={!showPw}
            placeholder="Re-enter new password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              backgroundColor: DF.night2,
              borderColor: DF.border,
              borderWidth: 1,
              borderRadius: 18,
              paddingVertical: 14,
              paddingHorizontal: 14,
              color: DF.text,
              fontSize: 14,
            }}
          />

          {!pwOk && pw.length > 0 ? (
            <Text style={{ color: DF.mauve, marginTop: 10, fontSize: 12 }}>
              Password must be 8+ characters.
            </Text>
          ) : null}

          {pw2.length > 0 && !matchOk ? (
            <Text style={{ color: DF.mauve, marginTop: 6, fontSize: 12 }}>
              Passwords do not match.
            </Text>
          ) : null}

          {err ? (
            <View
              style={{
                marginTop: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(191,163,255,0.28)",
                backgroundColor: "rgba(191,163,255,0.10)",
                padding: 12,
              }}
            >
              <Text style={{ color: DF.mauve, fontWeight: "700", fontSize: 13 }}>
                {err}
              </Text>
            </View>
          ) : null}

          {done ? (
            <View
              style={{
                marginTop: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(49,233,129,0.25)",
                backgroundColor: "rgba(49,233,129,0.08)",
                padding: 12,
              }}
            >
              <Text style={{ color: DF.green, fontWeight: "800", fontSize: 13 }}>
                Password updated.
              </Text>
            </View>
          ) : (
            <Pressable
              disabled={!canSubmit}
              onPress={submit}
              style={{
                marginTop: 14,
                backgroundColor: canSubmit ? DF.gold : "rgba(245,196,81,0.35)",
                paddingVertical: 14,
                borderRadius: 18,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.12)",
              }}
            >
              {busy ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={{ fontWeight: "800", color: "#111", fontSize: 14 }}>
                  Reset password
                </Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={{ marginTop: 12, paddingVertical: 8 }}
          >
            <Text
              style={{
                color: DF.cyan,
                fontWeight: "800",
                textAlign: "center",
                fontSize: 12,
              }}
            >
              Back to sign in
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}