import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing } from '../../../constants/theme';

type Props = {
  visible: boolean;
  title: string;
  description: string;
  currentPlan?: string;
  highlights?: string[];
  usageContext?: string;
  upgradeLabel?: string;
  secondaryLabel?: string;
  onClose?: () => void;
  onUpgrade?: () => void;
  onSecondary?: () => void;
};

export function UpgradePromptSheet({
  visible,
  title,
  description,
  currentPlan,
  highlights,
  usageContext,
  upgradeLabel = 'Upgrade plan',
  secondaryLabel = 'Not now',
  onClose,
  onUpgrade,
  onSecondary,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Plan access</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            {!!currentPlan && <Text style={styles.currentPlan}>Current plan: {currentPlan}</Text>}
            <Text style={styles.description}>{description}</Text>

            {!!usageContext && (
              <View style={styles.contextCard}>
                <Text style={styles.contextTitle}>Why this is showing</Text>
                <Text style={styles.contextText}>{usageContext}</Text>
              </View>
            )}

            {!!highlights?.length && (
              <View style={styles.listWrap}>
                {highlights.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <Pressable style={styles.primaryBtn} onPress={onUpgrade}>
            <Text style={styles.primaryText}>{upgradeLabel}</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={onSecondary}>
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
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
    maxHeight: '86%',
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
    paddingBottom: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(248,184,72,0.22)',
    backgroundColor: 'rgba(248,184,72,0.12)',
  },
  heroBadgeText: {
    color: Colors.dark.tintSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
  },
  currentPlan: {
    color: Colors.dark.tintSoft,
    fontSize: 13,
    marginTop: 8,
  },
  description: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  contextCard: {
    marginTop: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface2,
    padding: 14,
  },
  contextTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  contextText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  listWrap: {
    gap: 10,
    marginTop: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: Colors.dark.tint,
  },
  bulletText: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#2A1606',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
