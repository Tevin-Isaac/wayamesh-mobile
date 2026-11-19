module.exports = function (api) {
  api.cache(true);
  return {
    // valtio (used by the optional Reown/WalletConnect SDK) needs import.meta transformed.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
