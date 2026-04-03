import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PricingUiStage } from '../../features/pricing/types';

type Props = {
  stage?: PricingUiStage | null;
  labelOverride?: string;
};

export function ReservationStateChip({ stage = 'idle', labelOverride }: Props) {
  const map: Record<PricingUiStage, { label: string; bg: string; border: string; text: string }> = {
    idle: { label: 'Idle', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,250,236,0.82)' },
    estimated: { label: 'Estimated', bg: 'rgba(248,184,72,0.10)', border: 'rgba(248,184,72,0.22)', text: 'rgba(248,184,72,0.98)' },
    reserved: { label: 'Reserved', bg: 'rgba(248,184,72,0.12)', border: 'rgba(248,184,72,0.24)', text: 'rgba(248,184,72,0.98)' },
    running: { label: 'Running', bg: 'rgba(142,197,252,0.12)', border: 'rgba(142,197,252,0.22)', text: 'rgba(204,231,255,0.98)' },
    finalizing: { label: 'Finalizing', bg: 'rgba(248,232,136,0.12)', border: 'rgba(248,232,136,0.22)', text: 'rgba(248,232,136,0.98)' },
    committed: { label: 'Charged', bg: 'rgba(110,211,156,0.12)', border: 'rgba(110,211,156,0.22)', text: 'rgba(220,255,232,0.98)' },
    released: { label: 'Released', bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.22)', text: 'rgba(226,232,240,0.98)' },
    failed: { label: 'Failed', bg: 'rgba(255,120,120,0.14)', border: 'rgba(255,120,120,0.24)', text: 'rgba(255,220,220,0.98)' },
  };

  const safeStage: PricingUiStage = stage ?? 'idle';
  const tone = map[safeStage];
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.text, { color: tone.text }]}>{labelOverride || tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
  },
});
