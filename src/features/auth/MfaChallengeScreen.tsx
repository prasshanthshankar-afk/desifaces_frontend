import React, { useMemo, useState } from "react";
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

export function MfaChallengeScreen() {
  const { mfaChallenge, verifyMfa, clearMfaChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const codeOk = useMemo(() => code.trim().length >= 4, [code]);

  const submit = async () => {
    setErr(null);

    if (!codeOk) {
      setErr("Enter the verification code.");
      return;
    }

    setBusy(true);
    try {
      await verifyMfa(code.trim());
    } catch (e: any) {
      setErr(e?.message || "Verification failed.");
    } finally {
      setBusy(false);
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
          <AuthBrandHeader
            title="Verification"
            subtitle="No active challenge"
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
            <Text
              style={{
                color: DF.textSoft ?? DF.muted,
                fontSize: 13,
                textAlign: "center",
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
              <Text
                style={{ fontWeight: "800", color: "#111", fontSize: 14 }}
              >
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
        <AuthBrandHeader
          title="Verify access"
          subtitle={
            mfaChallenge.maskedDestination
              ? `Enter the code sent to ${mfaChallenge.maskedDestination}`
              : "Enter your verification code"
          }
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
          <Text
            style={{
              color: DF.muted,
              fontSize: 11,
              fontWeight: "700",
              marginBottom: 8,
            }}
          >
            VERIFICATION CODE
          </Text>

          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\s+/g, ""));
              if (err) setErr(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            placeholder="Enter code"
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
              fontSize: 14,
              letterSpacing: 1.2,
            }}
          />

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
              <Text
                style={{ color: DF.mauve, fontWeight: "700", fontSize: 13 }}
              >
                {err}
              </Text>
            </View>
          ) : null}

          <Pressable
            disabled={!codeOk || busy}
            onPress={submit}
            style={{
              marginTop: 14,
              backgroundColor:
                codeOk && !busy ? DF.gold : "rgba(245,196,81,0.35)",
              paddingVertical: 14,
              borderRadius: 18,
              alignItems: "center",
              opacity: !codeOk || busy ? 0.85 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#111" />
            ) : (
              <Text
                style={{ fontWeight: "800", color: "#111", fontSize: 14 }}
              >
                Verify
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              clearMfaChallenge();
              router.replace(AUTH_LOGIN_ROUTE);
            }}
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
              Cancel
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}