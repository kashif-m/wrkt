const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require("path");

const config = {
  watchFolders: [path.resolve(__dirname, "../workout-pack")],
  resolver: {
    extraNodeModules: {
      // allow importing workout-pack config from RN code
      "workout-pack": path.resolve(__dirname, "../workout-pack"),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
