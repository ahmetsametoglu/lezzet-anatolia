import { useSyncExternalStore } from 'react';

import { hapticError, hapticSuccess } from '@/lib/haptics/haptics';

/*
  TOAST DEPOSU — v3'ün `toastM`i (v3:437): tek satırlık bilgi mesajı, 2400 ms sonra kendiliğinden
  düşer; yeni mesaj eskinin sayacını SIFIRLAR (art arda iki eylemde ilkinin artığı ikincinin
  süresini yemez — şablonun kendi `clearTimeout` kuralı).

  MODÜL-DURUMLU (`use-me.hook` deseni): basan taraf herhangi bir ekran ya da akış, çizen taraf
  kökteki tek `ToastHost`. Prop zinciriyle taşımak her ara katmanı toast'a bağımlı kılardı.

  Metin BURADA i18n'siz gelir: cümle, basan ekranın kendi sözlüğünde çözülür (messages.json
  deseni) — depo çeviri bilmez, yalnız taşır.

  ── TOAST ARTIK TİPLİ, VE TİTREŞİMİN KAYNAĞI BU (kullanıcı kararı 16.08) ────
  Tek bir `publishToast` vardı ve mesajın "oldu" mu "olmadı" mı olduğunu YALNIZ cümlenin kendisi
  biliyordu — yani kimse bilmiyordu. Oysa toast basılan an, tanımı gereği kullanıcının SONUÇ
  BEKLEDİĞİ andır: uygulamanın en doğal geri bildirim kanalı burası.

  Üç fiil, üç niyet: `toastSuccess` (işlem oldu) · `toastError` (olmadı) · `toastInfo` (ne oldu
  ne olmadı — bilgi). Titreşim ilk ikisine bağlı, `toastInfo` SESSİZ. Ayrımın bedeli çağıranın
  tek kelime seçmesi; kazancı yirmi ekranın aynı üslupla konuşması.

  Titreşim burada, host'ta DEĞİL: host bir çizim katmanı ve kendini yeniden çizebilir; titreşim
  ise bir OLAY, iki kez olmamalı. Yayın anı olayın tek gerçekleştiği yerdir.
*/

const TOAST_MS = 2400;

let current: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function publish(message: string): void {
  if (timer !== null) clearTimeout(timer);
  current = message;
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, TOAST_MS);
}

/** İŞLEM OLDU — kullanıcının beklediği sonuç geldi. Titreşir. */
export function toastSuccess(message: string): void {
  hapticSuccess();
  publish(message);
}

/** OLMADI — istenen sonuç gelmedi ve kullanıcının bunu bilmesi gerekiyor. Titreşir. */
export function toastError(message: string): void {
  hapticError();
  publish(message);
}

/** BİLGİ — bir sonucun duyurusu değil, yalnız haber ("yakında", "listenin sonu"). SESSİZ. */
export function toastInfo(message: string): void {
  publish(message);
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
