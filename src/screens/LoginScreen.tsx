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
import { DF } from "../core/theme/colors";
import { useAuth } from "../core/auth/AuthContext";

function isValidEmail(s: string) {
  const v = (s || "").trim();
  // pragmatic email validation (good UX, avoids over-rejecting)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState("user1@desifaces.ai");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPw, setFocusPw] = useState(false);

  // subtle “lift” animation on primary button press
  const btnAnim = useRef(new Animated.Value(0)).current;

  const emailOk = useMemo(() => isValidEmail(email), [email]);
  const pwOk = useMemo(() => password.trim().length >= 1, [password]); // allow any length; backend enforces
  const canSubmit = emailOk && pwOk && !busy;

  const emailGlow = useRef(new Animated.Value(0)).current;
  const pwGlow = useRef(new Animated.Value(0)).current;

  const animateGlow = (a: Animated.Value, on: boolean) => {
    Animated.timing(a, {
      toValue: on ? 1 : 0,
      duration: on ? 180 : 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const onPressIn = () => {
    Animated.timing(btnAnim, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.timing(btnAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const btnStyle = useMemo(() => {
    const translateY = btnAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] });
    const scale = btnAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.99] });
    return { transform: [{ translateY }, { scale }] };
  }, [btnAnim]);

  const submit = async () => {
    setErr(null);

    const e = email.trim();
    if (!isValidEmail(e)) {
      setErr("Enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setErr("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      await login(e, password);
      // navigation handled by your auth flow (or root index route)
    } catch {
      setErr("Login failed. Check credentials / API base URL.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: DF.night }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand header */}
        <View style={{ marginBottom: 18 }}>
          <Text style={{ color: DF.text, fontSize: 36, fontWeight: "900", letterSpacing: 0.2 }}>
            DesiFaces
          </Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontSize: 14 }}>
            Sign in to continue
          </Text>
        </View>

        {/* Card */}
        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: DF.border,
            backgroundColor: DF.card,
            padding: 16,
          }}
        >
          {/* Email */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: DF.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
              EMAIL
            </Text>

            <View style={{ position: "relative" }}>
              {/* glow */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: -2,
                  borderRadius: 18,
                  opacity: emailGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }),
                  backgroundColor: DF.cyan,
                  transform: [
                    {
                      scale: emailGlow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }),
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
                keyboardType="email-address"
                placeholder="name@company.com"
                placeholderTextColor="rgba(255,255,255,0.35)"
                onFocus={() => {
                  setFocusEmail(true);
                  animateGlow(emailGlow, true);
                }}
                onBlur={() => {
                  setFocusEmail(false);
                  animateGlow(emailGlow, false);
                }}
                returnKeyType="next"
                style={{
                  backgroundColor: DF.night2,
                  borderColor: focusEmail ? "rgba(255,255,255,0.22)" : DF.border,
                  borderWidth: 1,
                  borderRadius: 18,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  color: DF.text,
                  fontSize: 15,
                }}
              />
            </View>

            {/* inline validation */}
            {email.length > 0 && !emailOk ? (
              <Text style={{ color: DF.mauve, marginTop: 8, fontSize: 12 }}>
                Please enter a valid email.
              </Text>
            ) : null}
          </View>

          {/* Password */}
          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: DF.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
              PASSWORD
            </Text>

            <View style={{ position: "relative" }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: -2,
                  borderRadius: 18,
                  opacity: pwGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
                  backgroundColor: DF.magenta,
                  transform: [
                    {
                      scale: pwGlow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }),
                    },
                  ],
                }}
              />

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (err) setErr(null);
                  }}
                  secureTextEntry={!showPw}
                  placeholder="Your password"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  onFocus={() => {
                    setFocusPw(true);
                    animateGlow(pwGlow, true);
                  }}
                  onBlur={() => {
                    setFocusPw(false);
                    animateGlow(pwGlow, false);
                  }}
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  style={{
                    flex: 1,
                    backgroundColor: DF.night2,
                    borderColor: focusPw ? "rgba(255,255,255,0.22)" : DF.border,
                    borderWidth: 1,
                    borderRadius: 18,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    color: DF.text,
                    fontSize: 15,
                    paddingRight: 92, // room for show button
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
                  <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>
                    {showPw ? "HIDE" : "SHOW"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Error banner */}
          {err ? (
            <View
              style={{
                marginTop: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(191,163,255,0.35)",
                backgroundColor: "rgba(191,163,255,0.10)",
                padding: 12,
              }}
            >
              <Text style={{ color: DF.mauve, fontWeight: "700" }}>{err}</Text>
            </View>
          ) : null}

          {/* Primary CTA */}
          <Animated.View style={[{ marginTop: 14 }, btnStyle]}>
            <Pressable
              disabled={!canSubmit}
              onPress={submit}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              style={{
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
                <Text style={{ fontWeight: "900", color: "#111", fontSize: 15 }}>Sign In</Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Links row */}
          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Pressable
              onPress={() => router.push("/(auth)/forgot-password")}
              style={{ paddingVertical: 8, paddingHorizontal: 6 }}
            >
              <Text style={{ color: DF.cyan, fontWeight: "800" }}>Forgot password?</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(auth)/register")}
              style={{ paddingVertical: 8, paddingHorizontal: 6 }}
            >
              <Text style={{ color: DF.teal, fontWeight: "900" }}>Create account</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <Text style={{ color: DF.muted, marginTop: 18, textAlign: "center", fontSize: 12 }}>
          By continuing, you agree to DesiFaces Terms & Privacy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}