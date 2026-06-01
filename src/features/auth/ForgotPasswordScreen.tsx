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
import { AuthBrandHeader } from "./AuthBrandHeader";
import {
  normalizeChallengeId,
  normalizeExpiresIn,
  normalizeResendAfterSeconds,
  startPasswordReset,
} from "./authOtpClient";

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
    setInfo(null);

    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      setErr("Enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const response = await startPasswordReset(e);
      const challengeId = normalizeChallengeId(response);

      if (challengeId) {
        router.push({
          pathname: "/(auth)/reset-password",
          params: {
            email: e,
            challengeId,
            expiresIn: String(normalizeExpiresIn(response, 300)),
            resendAfterSeconds: String(normalizeResendAfterSeconds(response, 60)),
          },
        });
        return;
      }

      setInfo("If this account exists, we sent a verification code.");
    } catch (error: any) {
      setErr(error?.message || "Unable to send the verification code. Please try again.");
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
          title="Reset password"
          subtitle="We’ll send a 6-digit code to your email"
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
                top: -2,
                left: -2,
                right: -2,
                bottom: -2,
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
                if (info) setInfo(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="name@company.com"
              placeholderTextColor="rgba(255,255,255,0.35)"
              onFocus={() => animateGlow(true)}
              onBlur={() => animateGlow(false)}
              returnKeyType="send"
              onSubmitEditing={submit}
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

          <Text style={{ color: DF.textSoft ?? DF.muted, marginTop: 10, fontSize: 12, lineHeight: 18 }}>
            If this email is registered, we’ll send a verification code. Enter that code in the app to create a new password.
          </Text>

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

          {info ? (
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
                {info}
              </Text>
            </View>
          ) : null}

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
              opacity: !emailOk || busy ? 0.85 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#111" />
            ) : (
              <Text style={{ fontWeight: "800", color: "#111", fontSize: 14 }}>
                Send verification code
              </Text>
            )}
          </Pressable>

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
