module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
          },
          extensions: [
            '.ios.ts',
            '.android.ts',
            '.web.ts',
            '.native.ts',
            '.ios.tsx',
            '.android.tsx',
            '.web.tsx',
            '.native.tsx',
            '.ts',
            '.tsx',
            '.js',
            '.jsx',
            '.json',
          ],
        },
      ],
      '@babel/plugin-proposal-export-namespace-from',
      'react-native-worklets/plugin',
    ],
  };
};