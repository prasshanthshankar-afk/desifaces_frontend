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
  Linking,
} from "react-native";
import { router, type Href } from "expo-router";
import { DF } from "../../core/theme/colors";
import { useAuth } from "../../core/auth/AuthContext";
import { AuthBrandHeader } from "./AuthBrandHeader";
import {
  DESIFACES_PRIVACY_URL,
  DESIFACES_TERMS_URL,
} from "../../core/auth/agreement";

const AUTH_LOGIN_ROUTE = "/(auth)/login" as Href;

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}

export function RegisterScreen() {
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [acceptedAgreement, setAcceptedAgreement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const glowA = useRef(new Animated.Value(0)).current;
  const glowB = useRef(new Animated.Value(0)).current;

  const emailOk = useMemo(() => isValidEmail(email), [email]);
  const pwOk = useMemo(() => pw.length >= 8, [pw]);
  const matchOk = useMemo(() => pw === pw2 && pw2.length > 0, [pw, pw2]);
  const canSubmit = emailOk && pwOk && matchOk && acceptedAgreement && !busy;

  const animateGlow = (a: Animated.Value, on: boolean) => {
    Animated.timing(a, {
      toValue: on ? 1 : 0,
      duration: on ? 180 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const submit = async () => {
    setErr(null);
    const e = email.trim();

    if (!fullName.trim()) {
      return setErr("Enter your name.");
    }
    if (!isValidEmail(e)) {
      return setErr("Enter a valid email address.");
    }
    if (pw.length < 8) {
      return setErr("Password must be at least 8 characters.");
    }
    if (pw !== pw2) {
      return setErr("Passwords do not match.");
    }
    if (!acceptedAgreement) {
      return setErr("Please accept the Terms and Privacy Policy.");
    }

    setBusy(true);
    try {
      await register(e, pw, fullName.trim(), acceptedAgreement);
    } catch (e: any) {
      setErr(e?.message || "Registration failed.");
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
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          justifyContent: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        <AuthBrandHeader
          title="Create account"
          subtitle="Join DesiFaces with secure access"
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
          <View
            style={{
              marginBottom: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.22)",
              backgroundColor: "rgba(248,184,72,0.10)",
              padding: 12,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "800", fontSize: 13 }}>
              Every new account starts on the Free plan.
            </Text>
            <Text style={{ color: DF.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
              Explore Face and Audio first, then upgrade later when you want more usage or premium Fusion features like Talking Video and Cinematic Video Direction.
            </Text>
          </View>

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8, letterSpacing: 0.4 }}>
            FULL NAME
          </Text>

          <TextInput
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              if (err) setErr(null);
            }}
            autoCapitalize="words"
            placeholder="Your name"
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
              marginBottom: 12,
            }}
          />

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8, letterSpacing: 0.4 }}>
            EMAIL
          </Text>

          <View style={{ position: "relative", marginBottom: 12 }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                inset: -2,
                borderRadius: 18,
                opacity: glowA.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
                backgroundColor: DF.cyan,
                transform: [{ scale: glowA.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
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
              onFocus={() => animateGlow(glowA, true)}
              onBlur={() => animateGlow(glowA, false)}
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

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8, letterSpacing: 0.4 }}>
            PASSWORD
          </Text>

          <View style={{ position: "relative", marginBottom: 12 }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                inset: -2,
                borderRadius: 18,
                opacity: glowB.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
                backgroundColor: DF.magenta,
                transform: [{ scale: glowB.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
              }}
            />

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
                onFocus={() => animateGlow(glowB, true)}
                onBlur={() => animateGlow(glowB, false)}
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

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8, letterSpacing: 0.4 }}>
            CONFIRM PASSWORD
          </Text>

          <TextInput
            value={pw2}
            onChangeText={(t) => {
              setPw2(t);
              if (err) setErr(null);
            }}
            secureTextEntry={!showPw}
            placeholder="Re-enter password"
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

          <Pressable
            onPress={() => setAcceptedAgreement((v) => !v)}
            style={{ marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: acceptedAgreement ? DF.gold : DF.border,
                backgroundColor: acceptedAgreement ? "rgba(205,165,108,0.18)" : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              {acceptedAgreement ? <Text style={{ color: DF.gold, fontWeight: "900", fontSize: 12 }}>✓</Text> : null}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: DF.textSoft ?? DF.muted, fontSize: 12, lineHeight: 18 }}>
                I agree to the {" "}
                <Text onPress={() => Linking.openURL(DESIFACES_TERMS_URL)} style={{ color: DF.cyan, fontWeight: "700" }}>
                  Terms
                </Text>{" "}
                and {" "}
                <Text onPress={() => Linking.openURL(DESIFACES_PRIVACY_URL)} style={{ color: DF.cyan, fontWeight: "700" }}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </Pressable>

          {!pwOk && pw.length > 0 ? <Text style={{ color: DF.mauve, marginTop: 10, fontSize: 12 }}>Password must be 8+ characters.</Text> : null}
          {pw2.length > 0 && !matchOk ? <Text style={{ color: DF.mauve, marginTop: 6, fontSize: 12 }}>Passwords do not match.</Text> : null}

          {err ? (
            <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(191,163,255,0.28)", backgroundColor: "rgba(191,163,255,0.10)", padding: 12 }}>
              <Text style={{ color: DF.mauve, fontWeight: "700", fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}

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
              opacity: !canSubmit ? 0.85 : 1,
            }}
          >
            {busy ? <ActivityIndicator color="#111" /> : <Text style={{ fontWeight: "800", color: "#111", fontSize: 14 }}>Create free account</Text>}
          </Pressable>

          <Pressable onPress={() => router.replace(AUTH_LOGIN_ROUTE)} style={{ marginTop: 12, paddingVertical: 8 }}>
            <Text style={{ color: DF.cyan, fontWeight: "800", textAlign: "center", fontSize: 12 }}>
              Already have an account? Sign in
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
