import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router, type Href } from "expo-router";
import { DF } from "../../core/theme/colors";
import { useAuth } from "../../core/auth/AuthContext";
import { AuthBrandHeader } from "./AuthBrandHeader";

const AUTH_LOGIN_ROUTE = "/(auth)/login" as Href;

type ChallengePurpose = "login" | "register" | "change_password" | "password_reset";
type ChallengeMethod = "email_otp" | "totp" | "sms_otp";

function buildHeaderCopy(challenge: {
  purpose?: ChallengePurpose;
  maskedDestination?: string;
  method?: ChallengeMethod;
}) {
  const destination = challenge.maskedDestination;
  const method = challenge.method;
  const destinationText = destination
    ? `Enter the code sent to ${destination}`
    : method === "totp"
    ? "Enter the code from your authenticator app"
    : "Enter your verification code";

  switch (challenge.purpose) {
    case "register":
      return {
        title: "Verify your email",
        subtitle: destinationText,
        buttonLabel: "Verify email",
      };
    case "change_password":
      return {
        title: "Confirm password change",
        subtitle: destinationText,
        buttonLabel: "Confirm change",
      };
    case "password_reset":
      return {
        title: "Reset password",
        subtitle: destinationText,
        buttonLabel: "Continue",
      };
    default:
      return {
        title: "Verify access",
        subtitle: destinationText,
        buttonLabel: "Verify",
      };
  }
}

function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 6);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export function MfaChallengeScreen() {
  const {
    mfaChallenge,
    verifyMfa,
    resendMfaChallenge,
    clearMfaChallenge,
  } = useAuth();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAfter, setResendAfter] = useState(
    readNumber((mfaChallenge as any)?.resendAfterSeconds ?? (mfaChallenge as any)?.resend_after_seconds, 60)
  );
  const [expiresIn, setExpiresIn] = useState(
    readNumber((mfaChallenge as any)?.expiresIn ?? (mfaChallenge as any)?.expires_in, 600)
  );

  useEffect(() => {
    setResendAfter(
      readNumber((mfaChallenge as any)?.resendAfterSeconds ?? (mfaChallenge as any)?.resend_after_seconds, 60)
    );
    setExpiresIn(
      readNumber((mfaChallenge as any)?.expiresIn ?? (mfaChallenge as any)?.expires_in, 600)
    );
  }, [mfaChallenge]);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = setInterval(() => setResendAfter((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendAfter]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const timer = setInterval(() => setExpiresIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [expiresIn]);

  const codeOk = useMemo(() => code.trim().length === 6, [code]);

  const headerCopy = buildHeaderCopy({
    purpose: mfaChallenge?.purpose as ChallengePurpose | undefined,
    maskedDestination: mfaChallenge?.maskedDestination,
    method: mfaChallenge?.method as ChallengeMethod | undefined,
  });

  const isTotp = mfaChallenge?.method === "totp";
  const canResend = !!mfaChallenge && !isTotp && !busy && !resendBusy && resendAfter <= 0;

  const submit = async () => {
    setErr(null);
    setInfo(null);

    if (!codeOk) {
      setErr("Enter the 6-digit verification code.");
      return;
    }

    setBusy(true);
    try {
      await verifyMfa(code.trim());
    } catch (e: any) {
      setErr(e?.message || "The code is invalid or expired. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(null);
    setInfo(null);

    setResendBusy(true);
    try {
      const response = await resendMfaChallenge();
      setCode("");
      setResendAfter(readNumber((response as any)?.resendAfterSeconds ?? (response as any)?.resend_after_seconds, 60));
      setExpiresIn(readNumber((response as any)?.expiresIn ?? (response as any)?.expires_in, expiresIn || 600));
      setInfo(
        mfaChallenge?.maskedDestination
          ? `A new code was sent to ${mfaChallenge.maskedDestination}.`
          : "A new verification code was sent."
      );
    } catch (e: any) {
      setErr(e?.message || "Could not resend the verification code.");
    } finally {
      setResendBusy(false);
    }
  };

  if (!mfaChallenge) {
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
        >
          <AuthBrandHeader title="Verification" subtitle="No active challenge" />

          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: DF.border,
              backgroundColor: DF.card,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: DF.textSoft ?? DF.muted,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Start sign in or registration again.
            </Text>

            <Pressable
              onPress={() => router.replace(AUTH_LOGIN_ROUTE)}
              style={{
                marginTop: 14,
                backgroundColor: DF.gold,
                paddingVertical: 14,
                borderRadius: 18,
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "800", color: "#111", fontSize: 14 }}>
                Back to sign in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
        <AuthBrandHeader title={headerCopy.title} subtitle={headerCopy.subtitle} />

        <View
          style={{
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
            VERIFICATION CODE
          </Text>

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
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="done"
            onSubmitEditing={submit}
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

          {!isTotp ? (
            <Text style={{ color: DF.textSoft ?? DF.muted, marginTop: 10, fontSize: 12, lineHeight: 18 }}>
              The code expires in {Math.max(0, Math.ceil(expiresIn / 60))} minute{Math.ceil(expiresIn / 60) === 1 ? "" : "s"}.
            </Text>
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
              <Text style={{ color: DF.green, fontWeight: "800", fontSize: 13 }}>{info}</Text>
            </View>
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
              <Text style={{ color: DF.mauve, fontWeight: "700", fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!codeOk || busy}
            onPress={submit}
            style={{
              marginTop: 14,
              backgroundColor: codeOk && !busy ? DF.gold : "rgba(245,196,81,0.35)",
              paddingVertical: 14,
              borderRadius: 18,
              alignItems: "center",
              opacity: !codeOk || busy ? 0.85 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#111" />
            ) : (
              <Text style={{ fontWeight: "800", color: "#111", fontSize: 14 }}>
                {headerCopy.buttonLabel}
              </Text>
            )}
          </Pressable>

          {!isTotp ? (
            <Pressable
              disabled={!canResend}
              onPress={resend}
              style={{
                marginTop: 12,
                paddingVertical: 8,
                opacity: canResend ? 1 : 0.55,
              }}
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
          ) : null}

          <Pressable
            onPress={() => {
              clearMfaChallenge();
              router.replace(AUTH_LOGIN_ROUTE);
            }}
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
              Cancel
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
