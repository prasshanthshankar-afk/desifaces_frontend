import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { DF } from "../../core/theme/colors";
import { AuthBrandHeader } from "./AuthBrandHeader";
import {
  confirmPasswordReset,
  normalizeChallengeId,
  normalizeExpiresIn,
  normalizeResendAfterSeconds,
  startPasswordReset,
} from "./authOtpClient";

function pickParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 6);
}

function toPositiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function ResetPasswordScreen() {
  const params = useLocalSearchParams<{
    email?: string;
    challengeId?: string;
    expiresIn?: string;
    resendAfterSeconds?: string;
  }>();

  const initialEmail = pickParam(params.email).trim().toLowerCase();
  const initialChallengeId = pickParam(params.challengeId).trim();

  const [email, setEmail] = useState(initialEmail);
  const [challengeId, setChallengeId] = useState(initialChallengeId);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState(
    toPositiveInt(pickParam(params.expiresIn), 300)
  );
  const [resendAfter, setResendAfter] = useState(
    toPositiveInt(pickParam(params.resendAfterSeconds), 60)
  );

  const codeGlow = useRef(new Animated.Value(0)).current;

  const pwOk = useMemo(() => pw.length >= 8, [pw]);
  const matchOk = useMemo(() => pw === pw2 && pw2.length > 0, [pw, pw2]);
  const codeOk = useMemo(() => code.trim().length === 6, [code]);
  const canSubmit = !!challengeId && codeOk && pwOk && matchOk && !busy;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = setInterval(() => {
      setResendAfter((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAfter]);

  const animateGlow = (on: boolean) => {
    Animated.timing(codeGlow, {
      toValue: on ? 1 : 0,
      duration: on ? 180 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const submit = async () => {
    setErr(null);
    setInfo(null);

    if (!challengeId) {
      setErr("Please request a new verification code.");
      return;
    }
    if (!codeOk) {
      setErr("Enter the 6-digit code from your email.");
      return;
    }
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset({
        challengeId,
        code,
        newPassword: pw,
      });
      setDone(true);
      setInfo("Password reset successful. Please sign in again.");
      setTimeout(() => router.replace("/(auth)/login"), 900);
    } catch (error: any) {
      setErr(error?.message || "Reset failed. The code may be invalid or expired.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(null);
    setInfo(null);

    if (!email) {
      setErr("Go back and enter your email again.");
      return;
    }

    setResendBusy(true);
    try {
      const response = await startPasswordReset(email);
      const nextChallengeId = normalizeChallengeId(response);

      if (!nextChallengeId) {
        setInfo("If this account exists, we sent a new verification code.");
        return;
      }

      setChallengeId(nextChallengeId);
      setCode("");
      setSecondsLeft(normalizeExpiresIn(response, 300));
      setResendAfter(normalizeResendAfterSeconds(response, 60));
      setInfo("A new code was sent. Use the latest code from your email.");
    } catch (error: any) {
      setErr(error?.message || "Could not resend the code. Please try again.");
    } finally {
      setResendBusy(false);
    }
  };

  const canResend = !!email && !busy && !resendBusy && resendAfter <= 0;

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
          title="Create new password"
          subtitle={email ? `Enter the 6-digit code sent to ${email}` : "Enter the verification code from your email"}
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
          {!challengeId ? (
            <View
              style={{
                marginBottom: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(191,163,255,0.28)",
                backgroundColor: "rgba(191,163,255,0.10)",
                padding: 12,
              }}
            >
              <Text style={{ color: DF.mauve, fontWeight: "700", fontSize: 13 }}>
                No active reset session. Request a new verification code.
              </Text>
            </View>
          ) : null}

          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginBottom: 8 }}>
            VERIFICATION CODE
          </Text>

          <View style={{ position: "relative", marginBottom: 12 }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -2,
                left: -2,
                right: -2,
                bottom: -2,
                borderRadius: 18,
                opacity: codeGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
                backgroundColor: DF.cyan,
                transform: [{ scale: codeGlow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
              }}
            />
            <TextInput
              value={code}
              onChangeText={(t) => {
                setCode(onlyDigits(t));
                if (err) setErr(null);
                if (info) setInfo(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="6-digit code"
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
                fontSize: 18,
                letterSpacing: 3,
                textAlign: "center",
              }}
            />
          </View>

          <Text style={{ color: DF.textSoft ?? DF.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
            Code expires in {Math.max(0, Math.ceil(secondsLeft / 60))} minute{Math.ceil(secondsLeft / 60) === 1 ? "" : "s"}. For your safety, all existing sessions will be signed out after reset.
          </Text>

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
                textContentType="newPassword"
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
            textContentType="newPassword"
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

          {info ? (
            <View
              style={{
                marginTop: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: done ? "rgba(49,233,129,0.25)" : "rgba(132,239,162,0.20)",
                backgroundColor: done ? "rgba(49,233,129,0.08)" : "rgba(132,239,162,0.07)",
                padding: 12,
              }}
            >
              <Text style={{ color: done ? DF.green : DF.text, fontWeight: "800", fontSize: 13 }}>
                {info}
              </Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canSubmit || done}
            onPress={submit}
            style={{
              marginTop: 14,
              backgroundColor: canSubmit && !done ? DF.gold : "rgba(245,196,81,0.35)",
              paddingVertical: 14,
              borderRadius: 18,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(0,0,0,0.12)",
              opacity: !canSubmit || done ? 0.85 : 1,
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

          <Pressable
            disabled={!canResend}
            onPress={resend}
            style={{ marginTop: 12, paddingVertical: 8, opacity: canResend ? 1 : 0.55 }}
          >
            {resendBusy ? (
              <ActivityIndicator color={DF.cyan} />
            ) : (
              <Text
                style={{
                  color: DF.cyan,
                  fontWeight: "800",
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                {resendAfter > 0 ? `Resend code in ${resendAfter}s` : "Resend code"}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={{ marginTop: 8, paddingVertical: 8 }}
          >
            <Text
              style={{
                color: DF.textSoft ?? DF.muted,
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
