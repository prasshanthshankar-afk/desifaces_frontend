import React from "react";
import { View } from "react-native";

type AnyProps = Record<string, any>;

const Passthrough = React.forwardRef<any, AnyProps>(function Passthrough(props, ref) {
  return <View ref={ref} {...props} />;
});

export const GlassView = Passthrough;
export const GlassContainer = Passthrough;
export const GlassEffectView = Passthrough;
export const LiquidGlassView = Passthrough;

export const isGlassEffectAvailable = false;
export const isGlassEffectSupported = false;
export const isLiquidGlassAvailable = false;

export default Passthrough;