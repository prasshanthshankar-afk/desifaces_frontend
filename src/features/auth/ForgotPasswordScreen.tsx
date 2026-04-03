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

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}

export function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const glow = useRef(new Animated.Value(0)).current;
  const emailOk = useMemo(() => isValidEmail(email), [email]);

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
    const e = email.trim();
    if (!isValidEmail(e)) return setErr("Enter a valid email address.");

    setBusy(true);
    try {
      await forgotPassword(e);
      setDone(true);
    } catch {
      setErr("Something went wrong. Please try again.");
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
          title="Reset access"
          subtitle="We’ll help you recover your account"
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
          <Text
            style={{
              color: DF.muted,
              fontSize: 11,
              fontWeight: "700",
              marginBottom: 8,
              letterSpacing: 0.4,
            }}
          >
            EMAIL
          </Text>

          <View style={{ position: "relative" }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                inset: -2,
                borderRadius: 18,
                opacity: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.16],
                }),
                backgroundColor: DF.cyan,
                transform: [
                  {
                    scale: glow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              }}
            />
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (err) setErr(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="name@company.com"
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
                marginTop: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(49,233,129,0.25)",
                backgroundColor: "rgba(49,233,129,0.08)",
                padding: 12,
              }}
            >
              <Text style={{ color: DF.green, fontWeight: "800", fontSize: 13 }}>
                If an account exists for this email, reset instructions are available.
              </Text>

              <Pressable
                onPress={() => router.push("/(auth)/reset-password")}
                style={{
                  marginTop: 10,
                  paddingVertical: 10,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: DF.border,
                  backgroundColor: DF.night2,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "800", fontSize: 13 }}>
                  Go to Reset Password
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={!emailOk || busy}
              onPress={submit}
              style={{
                marginTop: 14,
                backgroundColor: emailOk && !busy ? DF.gold : "rgba(245,196,81,0.35)",
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
                  Send reset
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