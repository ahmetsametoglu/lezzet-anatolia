import { useSyncExternalStore } from 'react';

/*
  TOAST DEPOSU — v3'ün `toastM`i (v3:437): tek satırlık bilgi mesajı, 2400 ms sonra kendiliğinden
  düşer; yeni mesaj eskinin sayacını SIFIRLAR (art arda iki eylemde ilkinin artığı ikincinin
  süresini yemez — şablonun kendi `clearTimeout` kuralı).

  MODÜL-DURUMLU (`use-me.hook` deseni): basan taraf herhangi bir ekran ya da akış, çizen taraf
  kökteki tek `ToastHost`. Prop zinciriyle taşımak her ara katmanı toast'a bağımlı kılardı.

  Metin BURADA i18n'siz gelir: cümle, basan ekranın kendi sözlüğünde çözülür (messages.json
  deseni) — depo çeviri bilmez, yalnız taşır.
*/

const TOAST_MS = 2400;

let current: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function publishToast(message: string): void {
  if (timer !== null) clearTimeout(timer);
  current = message;
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, TOAST_MS);
}

/** Kökteki host'un aboneliği — mesaj yokken `null` (host hiçbir şey çizmez). */
export function useToastMessage(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
