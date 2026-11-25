const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');
const {withDesktopPlatforms} = require('basalt-core/metro-config');

const config = withDesktopPlatforms(getDefaultConfig(__dirname));

// The desktop app reuses the phone app's plain-RN components and pure logic from ../src (via the
// `@/` alias in tsconfig.json), so Metro watches the repo root too...
const shared = path.resolve(__dirname, '../src');
config.watchFolders = [path.resolve(__dirname, '..')];

// ...but a package imported from ../src must still come from desktop/node_modules: the root's copy of
// react-native is the phone's, and Basalt replaces parts of this one.
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // `@/x` is ../src/x (the RN CLI's Metro doesn't read tsconfig paths).
  if (moduleName.startsWith('@/')) moduleName = path.join(shared, moduleName.slice(2));
  const bare = !moduleName.startsWith('.') && !moduleName.startsWith('/') && !moduleName.startsWith('@/');
  const ctx = bare && context.originModulePath.startsWith(shared)
    ? {...context, originModulePath: path.join(__dirname, 'index.ts')}
    : context;
  return (resolve ?? context.resolveRequest)(ctx, moduleName, platform);
};

module.exports = config;
