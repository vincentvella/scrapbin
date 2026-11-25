const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Anthropic SDK's ESM build has an import cycle (BetaToolRunner) that crashes under Metro;
// its CommonJS build re-exports lazily, so resolve the SDK with the `require` condition.
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const ctx = context.originModulePath.includes('@anthropic-ai/sdk') || moduleName.startsWith('@anthropic-ai/sdk')
    ? { ...context, unstable_conditionNames: ['require', 'react-native'] }
    : context;
  return (resolve ?? context.resolveRequest)(ctx, moduleName, platform);
};

module.exports = config;
