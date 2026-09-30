'use client';

import { useSyncExternalStore } from 'react';
import { hapticRouteOf, type HapticRoute } from './haptics';

/** Tarayıcı kimliği sayfa ömrü boyunca değişmez; dinlenecek bir olay yok. */
const subscribe = () => () => undefined;

/** Tarayıcının titreşim yolu; sunucuda ve ilk hidrasyonda `none`, ki istemcinin ilk çizimi sunucu çıktısıyla aynı olsun. */
export function useHapticRoute(): HapticRoute {
  return useSyncExternalStore(
    subscribe,
    () => hapticRouteOf(navigator),
    () => 'none',
  );
}
