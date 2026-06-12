// Crypto polyfill for viem/@circle (smart-account + agent features). Guarded with
// require + try/catch so an older dev client that predates this native module
// still boots — rebuild the dev client to enable smart-account on-chain features.
// Using require (not import) keeps load order: the polyfill must run before the app.
try {
  require('react-native-get-random-values');
} catch (e) {
  console.warn('[wayamesh] crypto polyfill unavailable — rebuild the dev client to enable smart-account features', e);
}
require('expo-router/entry');
