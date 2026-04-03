import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PricingUiStage } from '../../features/pricing/types';

const steps: Array<{ key: PricingUiStage; label: string }> = [
  { key: 'estimated', label: 'Estimate' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'running', label: 'Running' },
  { key: 'finalizing', label: 'Finalizing' },
  { key: 'committed', label: 'Charged' },
];

export function JobPricingTimeline({ stage }: { stage: PricingUiStage }) {
  const rank: Record<PricingUiStage, number> = {
    idle: 0,
    estimated: 1,
    reserved: 2,
    running: 3,
    finalizing: 4,
    committed: 5,
    released: 5,
    failed: 5,
  };

  const current = rank[stage] ?? 0;
  const terminalLabel = stage === 'released' ? 'Reservation released after the job ended without a final charge.' : stage === 'failed' ? 'Pricing flow failed to finalize. Review the latest job state.' : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {steps.map((step, idx) => {
          const done = current > idx + 1;
          const active = current === idx + 1;

          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepWrap}>
                <View
                  style={[
                    styles.stepCircle,
                    done || active ? styles.stepCircleActive : null,
                    active ? styles.stepCircleCurrent : null,
                  ]}
                >
                  <View style={[styles.stepDot, done || active ? styles.stepDotActive : null]} />
                </View>
                <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]}>{step.label}</Text>
              </View>
              {idx < steps.length - 1 ? <View style={[styles.line, done ? styles.lineDone : null]} /> : null}
            </React.Fragment>
          );
        })}
      </View>

      {!!terminalLabel && <Text style={styles.terminalLabel}>{terminalLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepWrap: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    borderColor: 'rgba(248,184,72,0.30)',
    backgroundColor: 'rgba(248,184,72,0.16)',
  },
  stepCircleCurrent: {
    transform: [{ scale: 1.04 }],
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  stepDotActive: {
    backgroundColor: 'rgba(248,184,72,0.98)',
  },
  line: {
    height: 1,
    flex: 1,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  lineDone: {
    backgroundColor: 'rgba(248,184,72,0.40)',
  },
  stepLabel: {
    color: 'rgba(255,250,236,0.58)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: 'rgba(255,250,236,0.98)',
    fontWeight: '800',
  },
  terminalLabel: {
    color: 'rgba(255,250,236,0.62)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
});
