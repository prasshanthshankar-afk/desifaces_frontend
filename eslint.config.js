// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // MediaViewer intentionally resolves optional native modules at runtime so
    // the screen can degrade safely when an Expo native module is unavailable.
    // Keep this exception scoped to the viewer; all other TypeScript stays on
    // the standard no-require-imports rule.
    files: ['src/app/(tabs)/media/viewer.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
