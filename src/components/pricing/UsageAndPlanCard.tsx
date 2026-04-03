import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Shadows, Spacing } from '../../../constants/theme';

type Props = {
  planName: string;
  monthLabel: string;
  totalUsagePercent?: number;
  walletBalance?: string;
  monthlySpend?: string;
  reservedAmount?: string;
  includedUsageLabel?: string;
  billingModeLabel?: string;
  entitlementNote?: string;
  onPressManage?: () => void;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function UsageAndPlanCard({
  planName,
  monthLabel,
  totalUsagePercent = 0,
  walletBalance,
  monthlySpend,
  reservedAmount,
  includedUsageLabel,
  billingModeLabel,
  entitlementNote,
  onPressManage,
}: Props) {
  const safePercent = Math.max(0, Math.min(100, totalUsagePercent));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Plan & usage</Text>
          <Text style={styles.subtitle}>{planName}</Text>
        </View>

        {!!onPressManage && (
          <Pressable onPress={onPressManage} style={styles.manageBtn}>
            <Text style={styles.manageText}>Manage</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(4, safePercent)}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        {monthLabel} · {safePercent}% used
      </Text>

      {!!entitlementNote && (
        <View style={styles.noteWrap}>
          <Text style={styles.noteText}>{entitlementNote}</Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <Stat label="Included" value={includedUsageLabel || '—'} />
        <Stat label="Wallet" value={walletBalance || '—'} />
        <Stat label="This month" value={monthlySpend || '—'} />
        <Stat label="Reserved" value={reservedAmount || '—'} />
      </View>

      {!!billingModeLabel && (
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>{billingModeLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  manageBtn: {
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,184,72,0.22)',
    backgroundColor: 'rgba(248,184,72,0.12)',
  },
  manageText: {
    color: Colors.dark.tintSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    borderRadius: Radii.pill,
    backgroundColor: 'rgba(248,232,136,0.10)',
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radii.pill,
    backgroundColor: Colors.dark.tintBright,
  },
  progressLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  noteWrap: {
    marginTop: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,184,72,0.14)',
    backgroundColor: 'rgba(248,184,72,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  statCard: {
    width: '48%',
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: Colors.dark.surface2,
    borderRadius: Radii.lg,
    padding: 12,
  },
  statLabel: {
    color: Colors.dark.textSubtle,
    fontSize: 11,
  },
  statValue: {
    color: Colors.dark.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  modePill: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modePillText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
