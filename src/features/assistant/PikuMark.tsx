import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

export function PikuMark({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityLabel="Piku">
      <Defs>
        <RadialGradient id="pikuBg" cx="36%" cy="28%" rx="78%" ry="78%">
          <Stop offset="0" stopColor="#2B2110" />
          <Stop offset="0.58" stopColor="#0D0B08" />
          <Stop offset="1" stopColor="#050505" />
        </RadialGradient>
        <LinearGradient id="pikuRing" x1="10" y1="8" x2="86" y2="90">
          <Stop offset="0" stopColor="#FFD76A" />
          <Stop offset="0.48" stopColor="#F4B000" />
          <Stop offset="1" stopColor="#E35A21" />
        </LinearGradient>
      </Defs>
      <Circle cx="48" cy="48" r="45" fill="#050505" stroke="#272017" strokeWidth="2" />
      <Circle cx="48" cy="48" r="38" fill="url(#pikuBg)" stroke="url(#pikuRing)" strokeWidth="4" />
      <Path d="M31 47c2-12 9-20 17-20s15 8 17 20c2 14-5 26-17 26S29 61 31 47Z" fill="#11100D" stroke="#F4B000" strokeWidth="2.6" />
      <Path d="M37 45c3-4 7-5 11-2m11 2c-3-4-7-5-11-2" fill="none" stroke="#FFD76A" strokeWidth="3" strokeLinecap="round" />
      <Circle cx="41" cy="48" r="2.8" fill="#F4B000" />
      <Circle cx="55" cy="48" r="2.8" fill="#F4B000" />
      <Path d="M39 59c5 5 13 5 18 0" fill="none" stroke="#F1742B" strokeWidth="3" strokeLinecap="round" />
      <Path d="M48 20v-7m-4 3 4-4 4 4" fill="none" stroke="#FFD76A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="48" cy="11" r="2.4" fill="#F4B000" />
    </Svg>
  );
}
