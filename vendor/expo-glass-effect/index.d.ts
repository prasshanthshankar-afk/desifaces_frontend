import * as React from "react";
import { ViewProps } from "react-native";

export const GlassView: React.ForwardRefExoticComponent<ViewProps & React.RefAttributes<any>>;
export const GlassContainer: React.ForwardRefExoticComponent<ViewProps & React.RefAttributes<any>>;
export const GlassEffectView: React.ForwardRefExoticComponent<ViewProps & React.RefAttributes<any>>;
export const LiquidGlassView: React.ForwardRefExoticComponent<ViewProps & React.RefAttributes<any>>;

export function isLiquidGlassAvailable(): boolean;
export function isGlassEffectAPIAvailable(): boolean;

declare const _default: typeof GlassView;
export default _default;