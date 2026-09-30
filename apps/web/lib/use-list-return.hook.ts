'use client';

import { useCallback, useLayoutEffect, useState } from 'react';

/*
  Sonsuz listenin geri dönüşü: yüklenen sayfalar, imleç ve kaydırma konumu bellekte, tarayıcı geçmişinin o kaydına bağlı durur. Liste
  yalnız aynı kayda geri/ileri ile dönülünce geri kurulur; menüden yeniden açılan liste taze başlar, sayfa yenilenince bellek boşalır.
*/

interface Entry {
  scope: string;
  items: unknown[];
  cursor: unknown;
  scrollY: number;
}

/** Geçmiş kaydına eklenen anahtar; Next kendi alanlarını korur, bu anahtar kayıtla birlikte geri gelir. */
const HISTORY_KEY = 'lezzetList';
/** Bellekte tutulan kayıt sayısının üst sınırı; en eskisi düşer. */
const MAX_ENTRIES = 5;
const entries = new Map<string, Entry>();

function storedIdOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const id = (state as Record<string, unknown>)[HISTORY_KEY];
  return typeof id === 'string' ? id : null;
}

/** Geçerli geçmiş kaydının kimliği; kayıtta yoksa üretilip kayda yazılır. */
function currentEntryId(): string {
  const stored = storedIdOf(window.history.state);
  if (stored !== null) return stored;
  const id = crypto.randomUUID();
  window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: id }, '');
  return id;
}

interface ListReturn<T, C> {
  /** Bu kayda dönülüyorsa ilk sayfanın ardından yüklenmiş öğeler ve imleç; taze açılışta `null`. */
  restored: { items: T[]; cursor: C } | null;
  /** Yüklü öğeleri ve imleci geçerli kayda yazar. */
  remember: (items: T[], cursor: C) => void;
}

/** `scope` listenin kimliği ve süzgecidir: aynı kayıtta başka süzgeçle kalmış liste geri kurulmaz. */
export function useListReturn<T, C>(scope: string): ListReturn<T, C> {
  const [restored] = useState<(Entry & { items: T[]; cursor: C }) | null>(() => {
    if (typeof window === 'undefined') return null;
    const id = storedIdOf(window.history.state);
    const entry = id === null ? undefined : entries.get(id);
    return entry !== undefined && entry.scope === scope ? (entry as Entry & { items: T[]; cursor: C }) : null;
  });

  // Düzen etkisi: çıkışta dinleyici yeni sayfanın başa kaydırmasından önce söner, yoksa konum 0 diye yazılırdı.
  useLayoutEffect(() => {
    if (restored !== null) window.scrollTo(0, restored.scrollY);
    const onScroll = () => {
      const entry = entries.get(currentEntryId());
      if (entry !== undefined) entry.scrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [restored]);

  const remember = useCallback(
    (items: T[], cursor: C) => {
      const id = currentEntryId();
      const scrollY = entries.get(id)?.scrollY ?? window.scrollY;
      entries.delete(id);
      entries.set(id, { scope, items, cursor, scrollY });
      for (const oldest of entries.keys()) {
        if (entries.size <= MAX_ENTRIES) break;
        entries.delete(oldest);
      }
    },
    [scope],
  );

  return { restored: restored === null ? null : { items: restored.items, cursor: restored.cursor }, remember };
}
