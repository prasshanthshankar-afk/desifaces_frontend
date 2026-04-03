import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Shadows, Spacing } from '../../../constants/theme';
import type { PricingSnapshot, PricingUiSummary } from '../../features/pricing/types';
import { JobPricingTimeline } from './JobPricingTimeline';
import { ReservationStateChip } from './ReservationStateChip';

function shorten(value?: string | null) {
  if (!value) return '—';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function RunReceiptCard({ pricing, pricingSummary }: { pricing?: PricingSnapshot | null; pricingSummary?: PricingUiSummary | null }) {
  if (!pricing && !pricingSummary) return null;

  const stage = pricing?.stage || (pricingSummary?.finalLabel ? 'committed' : 'estimated');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Run receipt</Text>
          <Text style={styles.description}>
            {pricingSummary?.message || pricing?.message || 'Pricing finalized from the latest job status snapshot.'}
          </Text>
        </View>
        <ReservationStateChip stage={stage} />
      </View>

      <JobPricingTimeline stage={stage} />

      <View style={styles.grid}>
        <Stat label="Estimate" value={pricingSummary?.estimateLabel || '—'} />
        <Stat label="Final" value={pricingSummary?.finalLabel || pricingSummary?.estimateLabel || '—'} />
        <Stat label="Billed units" value={pricing?.billedUnits || pricing?.estimatedUnits || '—'} />
        <Stat label="Settlement" value={pricing?.settlementMode || pricing?.billingMode || '—'} />
        <Stat label="Reservation" value={shorten(pricing?.reservationId)} />
        <Stat label="Ledger" value={shorten(pricing?.ledgerEntryId)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.xxl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardElevated,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  description: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  stat: {
    width: '48%',
    minWidth: 138,
    flexGrow: 1,
    borderRadius: Radii.lg,
    backgroundColor: Colors.dark.surface2,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: {
    color: Colors.dark.textSubtle,
    fontSize: 11,
  },
  statValue: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
});
