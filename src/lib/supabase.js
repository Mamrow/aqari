import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as aesjs from 'aes-js';
import { createClient } from '@supabase/supabase-js';

// Hermes/RN provide a bare `crypto.getRandomValues` global but no
// `crypto.subtle` — without it, @supabase/auth-js's PKCE code silently
// downgrades from S256 to the weaker "plain" challenge method (logs a
// WebCrypto warning). expo-crypto's Crypto.digest has the same
// (algorithm, BufferSource) => Promise<ArrayBuffer> shape as
// SubtleCrypto.digest, so it drops in directly.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}
if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = (array) => Crypto.getRandomValues(array);
}
if (typeof globalThis.crypto.subtle === 'undefined') {
  globalThis.crypto.subtle = {
    digest: (algorithm, data) => Crypto.digest(algorithm, data),
  };
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in a local .env file (see .env.example).'
  );
}

// Supabase's official React Native pattern (SecureStore alone can't hold a
// session — its underlying platform storage rejects values much over ~2KB,
// and a session blob with both tokens + user metadata routinely exceeds
// that). A random AES-256 key lives in the OS keychain via SecureStore; the
// actual session ciphertext (unbounded size) sits in AsyncStorage, unreadable
// without that key. Plaintext tokens never touch disk.
class LargeSecureStore {
  async _encrypt(key, value) {
    // expo-crypto (not the third-party react-native-get-random-values +
    // global `crypto` polyfill Supabase's own docs show) — this app tests in
    // Expo Go, which only supports Expo's own bundled SDK modules, not
    // arbitrary native code pulled in from npm.
    const encryptionKey = Crypto.getRandomValues(new Uint8Array(256 / 8));

    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  async _decrypt(key, value) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) {
      return null;
    }

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this._decrypt(key, encrypted);
  }

  async removeItem(key) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key, value) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

// flowType 'pkce' is what keeps the password-reset email link from carrying
// raw access/refresh tokens: the link instead carries a single-use `code`
// that's worthless without the code_verifier this device generated and kept
// in `storage` when the reset was requested (see AppContext.sendPasswordReset
// / handleAuthDeepLink). detectSessionInUrl stays off — RN has no browser URL
// for the SDK to read from; the deep link is parsed and exchanged manually.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
