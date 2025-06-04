const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  ...(config.resolver.alias || {}),
  "react-native-safe-area-context": require.resolve("react-native-safe-area-context"),
};

module.exports = config;
