import Constants from 'expo-constants';
import { Platform } from 'react-native';

const trimmed = (value: string | undefined, fallback: string) =>
  (value ?? fallback).replace(/\/+$/, '');

/**
 * The one server the app talks to, fixed when the app is built (plan §4). The fallbacks are
 * what an Android emulator calls the computer it runs on; a real phone needs the computer's
 * address on the Wi-Fi, set in `.env` (see `.env.example`).
 */
export const API_URL = trimmed(process.env.EXPO_PUBLIC_API_URL, 'http://10.0.2.2:4000');
export const WEB_URL = trimmed(process.env.EXPO_PUBLIC_WEB_URL, 'http://10.0.2.2:3001');

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** What this phone is called in "my sessions" on the site. Sent once, at sign-in. */
export function deviceName(): string {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as { Brand?: string; Model?: string };
    const name = [constants.Brand, constants.Model].filter(Boolean).join(' ').trim();
    return (name || 'Android phone').slice(0, 80);
  }
  return Platform.OS === 'ios' ? 'iPhone' : 'Phone';
}
