import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii } from '../../../constants/theme';

export function LiveEstimatePill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(248,184,72,0.18)',
    backgroundColor: 'rgba(248,184,72,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    color: Colors.dark.tintSoft,
    fontSize: 12,
    fontWeight: '700',
  },
});
