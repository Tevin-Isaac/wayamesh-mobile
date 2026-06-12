// Crypto polyfill MUST load before anything that uses randomness (ethers, viem,
// @circle). Keep this as the first import in the app.
import 'react-native-get-random-values';
import 'expo-router/entry';
