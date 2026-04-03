type GradientTuple = readonly [string, string, ...string[]];

export const DF = {
  // Core dark surfaces
  bg: "#000000",
  bgElevated: "#000000",
  bgCanvas: "#000000",
  bgBlack: "#000000",

  // Legacy aliases
  night: "#000000",
  night2: "#000000",

  // Surfaces
  surface: "rgba(255,255,255,0.05)",
  surface2: "rgba(255,255,255,0.07)",
  surface3: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.055)",
  panel: "rgba(16,19,26,0.84)",

  // Borders / lines
  border: "rgba(255,255,255,0.10)",
  hairline: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.08)",

  // Text
  text: "rgba(255,255,255,0.94)",
  textStrong: "#FFFFFF",
  textSoft: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.52)",
  muted: "rgba(255,255,255,0.52)",

  // Brand accents
  // desifaces. -> neutral premium
  // ai -> pleasant magenta
  brand: "#D2B07A",
  brandStrong: "#E0C08E",
  brandSoft: "rgba(210,176,122,0.16)",

  brandWordmark: "#D4A017",
  aiWordmark: "#B22222",

  ai: "#B22222",
  aiSoft: "rgba(216,108,255,0.16)",

  // Optional secondary cool accent
  cyan: "#9EB3D8",
  teal: "#7FA8A0",

  // Feedback / semantic
  green: "#6ED39C",
  success: "#6ED39C",
  warn: "#F0B35A",
  danger: "#FF6B6B",
  info: "#8CB4FF",
  mauve: "#C7A4FF",

  // Effects
  overlay: "rgba(5,7,10,0.58)",
  shadow: "rgba(0,0,0,0.42)",
  glow: "rgba(210,176,122,0.16)",

  // Gauge / progress
  ringTrack: "rgba(255,255,255,0.10)",
  ringInner: "rgba(255,255,255,0.05)",

  // Back-compat older warm keys
  halo: "#D2B07A",
  gold: "#D2B07A",
  ember: "#E0C08E",
  bronze: "#9E7A4E",
  copper: "#7A5D3C",
  magenta: "#D86CFF",
};

export const Gradients: Record<string, GradientTuple> = {
  bg: ["#000000", "#000000", "#000000"],
  panel: ["rgba(255,255,255,0.07)", "rgba(255,255,255,0.02)"],
  header: ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.00)"],
  cardGlow: ["rgba(210,176,122,0.08)", "rgba(0,0,0,0.00)"],
  premium: ["rgba(210,176,122,0.18)", "rgba(216,108,255,0.08)"],
};