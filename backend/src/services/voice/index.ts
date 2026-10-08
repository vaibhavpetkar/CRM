import { ExotelProvider } from './exotel';
import { MockProvider } from './mock';
import { ViProvider } from './vi';
import type { VoiceProvider } from './types';

// Registered providers, by VOICE_PROVIDER value. Exotel is the default.
const PROVIDERS: Record<string, () => VoiceProvider> = {
  exotel: () => new ExotelProvider(),
  vi: () => new ViProvider(),
  mock: () => new MockProvider(),
};

const cache = new Map<string, VoiceProvider>();

export const providerKey = () => (process.env.VOICE_PROVIDER || 'exotel').trim().toLowerCase();

export const getVoiceProvider = (key = providerKey()): VoiceProvider | null => {
  const factory = PROVIDERS[key];
  if (!factory) return null;
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key)!;
};

export * from './types';
