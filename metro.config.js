const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Resolve @/* → src/*
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

// The Anthropic SDK guards its Node-only paths (credential files on disk) at
// runtime, but Metro still tries to resolve their `node:*` imports. Stub them —
// we always pass the API key explicitly, so those paths never execute in-app.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('node:')) {
    return { type: 'empty' };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
