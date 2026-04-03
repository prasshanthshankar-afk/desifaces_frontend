import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ClassicDashboard from "../features/dashboard/ClassicDashboard";
import TeslaDashboard from "../features/dashboard/TeslaDashboard";
import { useAuth } from "../core/auth/AuthContext";
import { consumePlanFlash } from "../core/pricing/localPlanState";
import { Colors, Radii, Spacing, Shadows } from "../../constants/theme";

type Mode = "classic" | "modern";
const STORAGE_KEY = "df_dashboard_mode_v1";

type JourneyMessage = {
  title: string;
  message: string;
  actionLabel: string;
  actionRoute: string;
} | null;

export default function DashboardScreen() {
  const { isReady, isAuthed, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = React.useState<Mode>("classic");
  const [loaded, setLoaded] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [journeyMessage, setJourneyMessage] = React.useState<JourneyMessage>(null);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;

        if (saved === "modern" || saved === "tesla") {
          setMode("modern");
        } else {
          setMode("classic");
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoaded(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isAuthed) return;
    let mounted = true;

    (async () => {
      const flash = await consumePlanFlash();
      if (!mounted || !flash) return;

      setJourneyMessage({
        title: flash.title,
        message: flash.message,
        actionLabel:
          flash.kind === "registered_free" ? "Explore Face Studio" : "Open Plan & Billing",
        actionRoute:
          flash.kind === "registered_free" ? "/(tabs)/face" : "/pricing/plan-billing",
      });
    })();

    return () => {
      mounted = false;
    };
  }, [isAuthed]);

  const setAndPersist = React.useCallback(async (next: Mode) => {
    setMode(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  const openMenu = React.useCallback(() => setMenuOpen(true), []);

  const goClassic = React.useCallback(async () => {
    closeMenu();
    await setAndPersist("classic");
  }, [closeMenu, setAndPersist]);

  const goModern = React.useCallback(async () => {
    closeMenu();
    await setAndPersist("modern");
  }, [closeMenu, setAndPersist]);

  const goPlanBilling = React.useCallback(() => {
    closeMenu();
    router.push({ pathname: "/pricing/plan-billing" });
  }, [closeMenu]);

  const goComparePlans = React.useCallback(() => {
    closeMenu();
    router.push({ pathname: "/pricing/compare" });
  }, [closeMenu]);

  const goUpgradePlan = React.useCallback(() => {
    closeMenu();
    router.push({ pathname: "/pricing/upgrade-confirm" });
  }, [closeMenu]);

  const handleSignOut = React.useCallback(async () => {
    closeMenu();
    await logout();
  }, [closeMenu, logout]);

  if (!isReady) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!isAuthed) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Redirecting to login…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {mode === "classic" ? (
        <ClassicDashboard onMenuPress={openMenu} />
      ) : (
        <TeslaDashboard onMenuPress={openMenu} />
      )}

      <GlobalMenuSheet
        visible={menuOpen}
        onClose={closeMenu}
        topInset={insets.top}
        mode={mode}
        onGoClassic={goClassic}
        onGoModern={goModern}
        onGoPlanBilling={goPlanBilling}
        onGoComparePlans={goComparePlans}
        onGoUpgradePlan={goUpgradePlan}
        onSignOut={handleSignOut}
        disabled={!loaded}
      />

      <JourneyMessageSheet
        message={journeyMessage}
        onClose={() => setJourneyMessage(null)}
      />
    </View>
  );
}

function JourneyMessageSheet({
  message,
  onClose,
}: {
  message: JourneyMessage;
  onClose: () => void;
}) {
  if (!message) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.journeyBackdrop}>
        <View style={styles.journeyCard}>
          <Text style={styles.journeyTitle}>{message.title}</Text>
          <Text style={styles.journeyBody}>{message.message}</Text>

          <Pressable
            style={styles.journeyPrimaryBtn}
            onPress={() => {
              onClose();
              router.push(message.actionRoute as any);
            }}
          >
            <Text style={styles.journeyPrimaryText}>{message.actionLabel}</Text>
          </Pressable>

          <Pressable style={styles.journeySecondaryBtn} onPress={onClose}>
            <Text style={styles.journeySecondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function GlobalMenuSheet({
  visible,
  onClose,
  topInset,
  mode,
  onGoClassic,
  onGoModern,
  onGoPlanBilling,
  onGoComparePlans,
  onGoUpgradePlan,
  onSignOut,
  disabled,
}: {
  visible: boolean;
  onClose: () => void;
  topInset: number;
  mode: Mode;
  onGoClassic: () => void;
  onGoModern: () => void;
  onGoPlanBilling: () => void;
  onGoComparePlans: () => void;
  onGoUpgradePlan: () => void;
  onSignOut: () => void;
  disabled?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.drawer,
            {
              paddingTop: topInset + 10,
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Menu</Text>
            <Text style={styles.drawerSubtitle}>Workspace, billing, account, help</Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.drawerContent}
          >
            <MenuSection title="Workspace">
              <MenuItem
                label="Classic Dashboard"
                active={mode === "classic"}
                onPress={onGoClassic}
                disabled={disabled}
              />
              <MenuItem
                label="Modern Dashboard"
                active={mode === "modern"}
                onPress={onGoModern}
                disabled={disabled}
              />
            </MenuSection>

            <MenuSection title="Plan & Billing">
              <MenuItem label="Plan & Billing" onPress={onGoPlanBilling} />
              <MenuItem label="Compare Plans" onPress={onGoComparePlans} />
              <MenuItem label="Upgrade Plan" onPress={onGoUpgradePlan} />
            </MenuSection>

            <MenuSection title="Account">
              <MenuItem label="Settings" disabled hint="Soon" />
              <MenuItem label="Preferences" disabled hint="Soon" />
              <MenuItem label="Security & MFA" disabled hint="Soon" />
            </MenuSection>

            <MenuSection title="Help">
              <MenuItem label="Need Help" disabled hint="Soon" />
              <MenuItem label="FAQ" disabled hint="Soon" />
              <MenuItem label="Contact Us" disabled hint="Soon" />
            </MenuSection>

            <MenuSection title="Session">
              <MenuItem label="Sign Out" destructive onPress={onSignOut} />
            </MenuSection>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.menuSection}>
      <Text style={styles.menuSectionTitle}>{title}</Text>
      <View style={styles.menuSectionBody}>{children}</View>
    </View>
  );
}

function MenuItem({
  label,
  onPress,
  active,
  destructive,
  disabled,
  hint,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.menuItem,
        active && styles.menuItemActive,
        disabled && styles.menuItemDisabled,
      ]}
    >
      <Text
        style={[
          styles.menuItemText,
          active && styles.menuItemTextActive,
          destructive && styles.menuItemTextDestructive,
          disabled && styles.menuItemTextDisabled,
        ]}
      >
        {label}
      </Text>

      {!!hint && <Text style={styles.menuHint}>{hint}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },

  modernWrap: {
    flex: 1,
  },

  floatingMenuWrap: {
    position: "absolute",
    left: 16,
    zIndex: 40,
  },

  floatingMenuBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.card,
  },

  menuBar: {
    width: 14,
    height: 1.6,
    borderRadius: 99,
    backgroundColor: Colors.dark.textSecondary,
    marginVertical: 1.5,
  },

  menuBarShort: {
    width: 10,
    height: 1.6,
    borderRadius: 99,
    backgroundColor: Colors.dark.textSecondary,
    marginTop: 1.5,
  },

  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.dark.background,
  },

  loadingText: {
    color: Colors.dark.textSecondary,
    fontWeight: "800",
  },

  modalRoot: {
    flex: 1,
    flexDirection: "row",
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.44)",
  },

  drawer: {
    width: 312,
    backgroundColor: Colors.dark.cardElevated,
    borderLeftWidth: 1,
    borderLeftColor: Colors.dark.border,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  drawerHeader: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },

  drawerTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },

  drawerSubtitle: {
    marginTop: 6,
    color: Colors.dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },

  drawerContent: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },

  menuSection: {
    gap: 10,
  },

  menuSectionTitle: {
    color: Colors.dark.tintSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  menuSectionBody: {
    gap: 8,
  },

  menuItem: {
    minHeight: 46,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  menuItemActive: {
    backgroundColor: "rgba(232,152,56,0.16)",
    borderColor: "rgba(248,184,72,0.30)",
  },

  menuItemDisabled: {
    opacity: 0.65,
  },

  menuItemText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },

  menuItemTextActive: {
    color: Colors.dark.textPrimary,
  },

  menuItemTextDestructive: {
    color: Colors.dark.pricingFailed,
  },

  menuItemTextDisabled: {
    color: Colors.dark.textSubtle,
  },

  menuHint: {
    color: Colors.dark.textSubtle,
    fontSize: 11,
    fontWeight: "700",
  },

  journeyBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },

  journeyCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.22)",
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
    ...Shadows.card,
  },

  journeyTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },

  journeyBody: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },

  journeyPrimaryBtn: {
    marginTop: 18,
    minHeight: 50,
    borderRadius: Radii.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.tint,
  },

  journeyPrimaryText: {
    color: "#2A1606",
    fontSize: 14,
    fontWeight: "800",
  },

  journeySecondaryBtn: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: Radii.xl,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },

  journeySecondaryText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
});
