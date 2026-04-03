import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing } from '../../../constants/theme';

type Props = {
  visible: boolean;
  studioName: string;
  estimate?: string | null;
  billedUnitType?: string | null;
  includedText?: string | null;
  premiumText?: string | null;
  priceDriverText?: string | null;
  availabilityText?: string | null;
  settlementText?: string | null;
  onClose?: () => void;
  onConfirm?: () => void;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function PricingBreakdownSheet({
  visible,
  studioName,
  estimate,
  billedUnitType,
  includedText,
  premiumText,
  priceDriverText,
  availabilityText,
  settlementText,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.title}>{studioName} pricing</Text>
            <Text style={styles.estimate}>{estimate || '—'}</Text>
            <Text style={styles.subtext}>Estimated amount before the job starts</Text>

            <View style={styles.heroNote}>
              <Text style={styles.heroNoteText}>
                Credits may be reserved first and finalized only after the job succeeds. If the job fails, the reservation should be released.
              </Text>
            </View>

            <InfoRow label="Billed unit type" value={billedUnitType || '—'} />
            <InfoRow label="What changes price" value={priceDriverText || 'Selected options, usage, and premium features'} />
            <InfoRow label="Included vs premium" value={includedText || 'Plan inclusions apply before any overage'} />
            <InfoRow label="Premium options" value={premiumText || 'Premium providers or advanced options may cost more'} />
            <InfoRow label="Availability" value={availabilityText || 'Availability depends on plan inclusions, wallet balance, or postpaid entitlement'} />
            <InfoRow label="Settlement" value={settlementText || 'Charges settle as included usage, wallet debit, or postpaid billing based on account mode'} />
          </ScrollView>

          <Pressable onPress={onConfirm} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Confirm and continue</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.56)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Colors.dark.cardElevated,
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  content: {
    paddingBottom: 8,
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  estimate: {
    color: Colors.dark.tintSoft,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 10,
  },
  subtext: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  heroNote: {
    marginTop: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,184,72,0.14)',
    backgroundColor: 'rgba(248,184,72,0.08)',
    padding: 14,
  },
  heroNoteText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  infoRow: {
    marginTop: 14,
  },
  infoLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  infoValue: {
    color: Colors.dark.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryText: {
    color: '#2A1606',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: Colors.dark.surface,
  },
  secondaryText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
