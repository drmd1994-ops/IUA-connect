import * as SecureStore from 'expo-secure-store';
import { type SecureStore as Store } from './session-core';

/** Keys may hold only letters, digits, ".", "-" and "_". */
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * The phone's secure storage: the Keystore on Android, the Keychain on iPhone. Values are
 * encrypted by the phone and readable by this app only.
 */
export const secureStore: Store = {
  get: (key) => SecureStore.getItemAsync(safe(key)),
  set: (key, value) => SecureStore.setItemAsync(safe(key), value),
  remove: (key) => SecureStore.deleteItemAsync(safe(key)),
};
