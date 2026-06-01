const React = require("react");

function getView() {
  try {
    return require("react-native").View;
  } catch {
    return "View";
  }
}

const Passthrough = React.forwardRef(function Passthrough(props, ref) {
  const View = getView();
  return React.createElement(View, { ...props, ref });
});

function isLiquidGlassAvailable() {
  return false;
}

function isGlassEffectAPIAvailable() {
  return false;
}

module.exports = {
  __esModule: true,
  default: Passthrough,
  GlassView: Passthrough,
  GlassContainer: Passthrough,
  GlassEffectView: Passthrough,
  LiquidGlassView: Passthrough,
  isLiquidGlassAvailable,
  isGlassEffectAPIAvailable,
};