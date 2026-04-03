import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Core
    text: '#11181C',
    background: '#FFFFFF',
    surface: '#F8F8F8',
    surface2: '#EFEFEF',
    surface3: '#E7E7E7',
    border: 'rgba(17,24,28,0.10)',

    // Brand
    tint: '#E89838',
    tintBright: '#F8B848',
    tintSoft: '#D88838',

    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#E89838',

    // Semantic text
    textPrimary: '#11181C',
    textSecondary: 'rgba(17,24,28,0.82)',
    textMuted: '#687076',
    textSubtle: '#8A8F98',

    // Cards / overlays
    card: '#FFFFFF',
    cardElevated: '#FFF9F2',
    glass: 'rgba(17,24,28,0.03)',
    glassStrong: 'rgba(17,24,28,0.06)',

    // Premium / pricing semantic states
    pricingEstimate: '#E89838',
    pricingReserved: '#D88838',
    pricingRunning: '#F8B848',
    pricingFinalizing: '#F4C15D',
    pricingCommitted: '#16A34A',
    pricingReleased: '#D97706',
    pricingFailed: '#DC2626',

    // Accent helpers
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#E89838',

    // Optional studio accent layer
    faceAccent: '#F8B848',
    audioAccent: '#E89838',
    fusionAccent: '#D88838',
    retailAccent: '#C97A2B',
    musicAccent: '#F4A261',
  },

  dark: {
    // Core DesiFaces brand
    text: '#F8E888',
    background: '#080808',
    surface: '#180808',
    surface2: '#281808',
    surface3: '#341A0A',
    border: 'rgba(248,184,72,0.14)',

    // Brand
    tint: '#E89838',
    tintBright: '#F8B848',
    tintSoft: '#F8D868',

    icon: '#F8D868',
    tabIconDefault: 'rgba(248,216,104,0.55)',
    tabIconSelected: '#F8B848',

    // Semantic text
    textPrimary: '#FFF6CC',
    textSecondary: 'rgba(255,244,204,0.82)',
    textMuted: 'rgba(248,232,136,0.62)',
    textSubtle: 'rgba(248,232,136,0.42)',

    // Cards / overlays
    card: '#120909',
    cardElevated: '#1C0D0A',
    glass: 'rgba(255,255,255,0.04)',
    glassStrong: 'rgba(255,255,255,0.07)',

    // Premium / pricing semantic states
    pricingEstimate: '#F8B848',
    pricingReserved: '#D89A38',
    pricingRunning: '#F8D868',
    pricingFinalizing: '#FFD27A',
    pricingCommitted: '#4ADE80',
    pricingReleased: '#F59E0B',
    pricingFailed: '#F87171',

    // Accent helpers
    success: '#4ADE80',
    warning: '#F59E0B',
    danger: '#F87171',
    info: '#F8D868',

    // Optional studio accent layer
    faceAccent: '#F8B848',
    audioAccent: '#E89838',
    fusionAccent: '#F8D868',
    retailAccent: '#D88838',
    musicAccent: '#F4A261',
  },
} as const;

export const Gradients = {
  // Screen background glow
  heroGlow: {
    colors: [
      'rgba(248,184,72,0.40)',
      'rgba(232,152,56,0.20)',
      '#180808',
      '#080808',
    ],
    locations: [0.0, 0.25, 0.6, 1.0],
  },

  // Primary CTA
  primary: {
    colors: ['#F8B848', '#E89838', '#D88838'],
  },

  // Premium pricing banner
  pricingHero: {
    colors: [
      'rgba(248,184,72,0.22)',
      'rgba(232,152,56,0.12)',
      'rgba(24,8,8,0.92)',
    ],
    locations: [0, 0.35, 1],
  },

  // Luxury card edge
  cardGlow: {
    colors: [
      'rgba(248,184,72,0.18)',
      'rgba(248,184,72,0.06)',
      'rgba(255,255,255,0.02)',
    ],
    locations: [0, 0.35, 1],
  },
} as const;

export const Radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

export const Spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: 0.28,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    android: {
      elevation: 8,
    },
    default: {},
  }),
  glowGold: Platform.select({
    ios: {
      shadowColor: '#F8B848',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
    },
    android: {
      elevation: 6,
    },
    default: {},
  }),
} as const;

export const PricingStageColors = {
  idle: 'rgba(248,232,136,0.32)',
  estimated: Colors.dark.pricingEstimate,
  reserved: Colors.dark.pricingReserved,
  running: Colors.dark.pricingRunning,
  finalizing: Colors.dark.pricingFinalizing,
  committed: Colors.dark.pricingCommitted,
  released: Colors.dark.pricingReleased,
  failed: Colors.dark.pricingFailed,
} as const;

export const StudioAccents = {
  face: Colors.dark.faceAccent,
  audio: Colors.dark.audioAccent,
  fusion: Colors.dark.fusionAccent,
  retail: Colors.dark.retailAccent,
  music: Colors.dark.musicAccent,
} as const;