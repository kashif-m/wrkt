const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require("path");

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [path.resolve(__dirname, "../workout-pack")],
  transformer: {
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
  },
  resolver: {
    assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...defaultConfig.resolver.sourceExts, "svg"],
    extraNodeModules: {
      // allow importing workout-pack config from RN code
      "workout-pack": path.resolve(__dirname, "../workout-pack"),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
