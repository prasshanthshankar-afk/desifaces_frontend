import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing } from '../../../constants/theme';

type Props = {
  primaryLabel: string;
  onPrimaryPress?: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  helperText?: string;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
  loading?: boolean;
};

export function StudioPricingFooter({
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
  helperText,
  primaryDisabled,
  secondaryDisabled,
  loading,
}: Props) {
  return (
    <View style={styles.wrap}>
      {!!helperText && <Text style={styles.helper}>{helperText}</Text>}
      <View style={styles.row}>
        {!!secondaryLabel && (
          <Pressable
            style={[styles.secondaryBtn, secondaryDisabled ? styles.disabledBtn : null]}
            onPress={onSecondaryPress}
            disabled={secondaryDisabled || loading}
          >
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.primaryBtn, (primaryDisabled || loading) ? styles.disabledPrimary : null]}
          onPress={onPrimaryPress}
          disabled={primaryDisabled || loading}
        >
          {loading ? <ActivityIndicator color="#2A1606" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Spacing.lg,
  },
  helper: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 12,
  },
  disabledBtn: {
    opacity: 0.58,
  },
  disabledPrimary: {
    opacity: 0.58,
  },
  secondaryText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryText: {
    color: '#2A1606',
    fontSize: 14,
    fontWeight: '800',
  },
});
