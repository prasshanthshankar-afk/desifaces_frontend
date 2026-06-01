const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "expo-glass-effect": path.resolve(__dirname, "src/shims/expo-glass-effect"),
};

module.exports = config;