const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Resolve @/* → src/*
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
