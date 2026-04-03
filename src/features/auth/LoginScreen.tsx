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

export function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPw, setFocusPw] = useState(false);

  const btnAnim = useRef(new Animated.Value(0)).current;
  const emailGlow = useRef(new Animated.Value(0)).current;
  const pwGlow = useRef(new Animated.Value(0)).current;

  const isValidEmail = (s: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());

  const emailOk = useMemo(() => isValidEmail(email), [email]);
  const pwOk = useMemo(() => password.trim().length >= 1, [password]);
  const canSubmit = emailOk && pwOk && !busy;

  const animateGlow = (a: Animated.Value, on: boolean) => {
    Animated.timing(a, {
      toValue: on ? 1 : 0,
      duration: on ? 160 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const onPressIn = () =>
    Animated.timing(btnAnim, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const onPressOut = () =>
    Animated.timing(btnAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const btnStyle = useMemo(() => {
    const translateY = btnAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1.5],
    });
    const scale = btnAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.99],
    });
    return { transform: [{ translateY }, { scale }] };
  }, [btnAnim]);

  const submit = async () => {
    setErr(null);
    const e = email.trim();

    if (!isValidEmail(e)) return setErr("Enter a valid email address.");
    if (!password.trim()) return setErr("Enter your password.");

    setBusy(true);
    try {
      await login(e, password);
    } catch (e: any) {
      setErr(e?.message || "Sign in failed.");
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
          title="Sign in"
          subtitle="Access your desifaces.ai workspace"
        />

        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: DF.border,
            backgroundColor: DF.card,
            padding: 16,
          }}
        >
          <View style={{ marginBottom: 12 }}>
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
                  opacity: emailGlow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.16],
                  }),
                  backgroundColor: DF.cyan,
                  transform: [
                    {
                      scale: emailGlow.interpolate({
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
                  borderColor: focusEmail ? "rgba(255,255,255,0.18)" : DF.border,
                  borderWidth: 1,
                  borderRadius: 18,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  color: DF.text,
                  fontSize: 14,
                }}
              />
            </View>
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text
              style={{
                color: DF.muted,
                fontSize: 11,
                fontWeight: "700",
                marginBottom: 8,
                letterSpacing: 0.4,
              }}
            >
              PASSWORD
            </Text>

            <View style={{ position: "relative" }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: -2,
                  borderRadius: 18,
                  opacity: pwGlow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.14],
                  }),
                  backgroundColor: DF.magenta,
                  transform: [
                    {
                      scale: pwGlow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.98, 1],
                      }),
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
                    borderColor: focusPw ? "rgba(255,255,255,0.18)" : DF.border,
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
                  <Text
                    style={{ color: DF.text, fontWeight: "700", fontSize: 11 }}
                  >
                    {showPw ? "HIDE" : "SHOW"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {err ? (
            <View
              style={{
                marginTop: 10,
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
                <Text style={{ fontWeight: "800", color: "#111", fontSize: 14 }}>
                  Continue
                </Text>
              )}
            </Pressable>
          </Animated.View>

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
              <Text style={{ color: DF.cyan, fontWeight: "700", fontSize: 12 }}>
                Forgot password?
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(auth)/register")}
              style={{ paddingVertical: 8, paddingHorizontal: 6 }}
            >
              <Text style={{ color: DF.teal, fontWeight: "800", fontSize: 12 }}>
                Create account
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}