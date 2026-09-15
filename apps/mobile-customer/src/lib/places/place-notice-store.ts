import { useSyncExternalStore } from 'react';
import type { z } from 'zod';
import type { PlaceNoticeBodySchema } from '@lezzet/types';

/*
  "BURAYA DA GELİN" KAYDININ HAFIZASI — İKİ LİSTENİN ORTAK GERÇEĞİ.

  Bant iki yerde çiziliyor: katalog ve paketler (`place-notice-band.tsx` künyesi). Kaydın alınıp
  alınmadığı ise bandın kendi `useState`inde duruyordu ve React state'i BİLEŞENE aittir — iki
  bant iki ayrı örnek, yani iki ayrı hafıza. Sonuç ölçüldü (kullanıcı bulgusu 11.08): müşteri
  katalogda "Buraya da gelin"e basıp kaydını bıraktıktan sonra paketler sekmesine geçince aynı
  düğmeyi yeniden görüyordu — bandın kendi künyesi *"kayıt alındığında düğme kalkar: alınmış bir
  kaydı ikinci kez isteten düğme 'sayılmadım mı?' sorusunu doğururdu"* diyor ve bu söz tam da iki
  ekran arasında bozuluyordu. Aynı arıza tek ekranda da var: sayfadan çıkıp geri gelen müşteri
  bandı sıfırlanmış buluyordu.

  ── NEDEN BİR DEPO, EKRAN İÇİ `useState` DEĞİL ──────────────────────────────
  Sepetin (`cart-store`) ve teslimat adresi seçiminin (`delivery-address-store`) aynı gerekçesi:
  bir gerçek BİRDEN ÇOK ekranın ortaksa, onu bileşenin ömrüne bağlamak o gerçeği ekran sayısı
  kadar kopyalamaktır. Modül düzeyinde depo + `useSyncExternalStore` bunu kabuk sözleşmesine
  dokunmadan verir.

  ── ANAHTAR YER, KİMLİK DEĞİL ───────────────────────────────────────────────
  Kayıt bir YERE bırakılır (`ülke + posta kodu`), o yüzden hafıza da yere göre anahtarlanır.
  Müşteri kodunu değiştirince yeni yerin kaydı YOKTUR ve düğme haklı olarak geri gelir.

  Kimlik anahtara GİRMEZ ve bu bilinçli: misafir kaydı bırakırken akışın kendisi hesabı kuruyor
  (`PlaceNoticeSheet` — e-posta + tek kullanımlık kod), yani kimlik kaydın TAM ORTASINDA değişiyor;
  kimliği anahtara koysaydık kayıt biter bitmez hafıza başka bir kovaya düşer ve düğme yine geri
  gelirdi. Taşınan bilgi şudur: *"bu cihaz, bu oturumda, bu yere kaydını bıraktı."*

  ── DİSKE YAZILMAZ ──────────────────────────────────────────────────────────
  Kaydın KALICI sahibi sunucudur (`zone_notice`) ve ikinci istek zaten `already` dönüyor — yani
  uygulama yeniden açıldığında düğme görünse bile müşteri yanlış bir cevap almaz, "kaydınız zaten
  var" der. Diske yazmak, sunucuda silinmiş bir kaydı cihazda diriltme riskini karşılığı olmadan
  satın almak olurdu (`delivery-address-store`un aynı hükmü).
*/

/** Kaydın iki olumlu hâli — sözleşmenin `ok`/`already`si; ötekiler kayıt DEĞİL (bant onları basmaz). */
type PlaceNoticeRecord = 'ok' | 'already';

/** Ülke tipi SÖZLEŞMEDEN türer; elle bir birleşim yazılmaz (bandın kendi kuralı). */
type NoticeCountry = z.input<typeof PlaceNoticeBodySchema>['country'];

const records = new Map<string, PlaceNoticeRecord>();

const listeners = new Set<() => void>();

function keyOf(country: NoticeCountry, postalCode: string): string {
  return `${country}:${postalCode}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Kaydı yazar — hangi listeden bırakıldığı fark etmez, ötekiler de aynı anda öğrenir. */
export function rememberPlaceNotice(country: NoticeCountry, postalCode: string, record: PlaceNoticeRecord): void {
  const key = keyOf(country, postalCode);
  if (records.get(key) === record) return;
  records.set(key, record);
  emit();
}

/**
 * Bu yere kayıt bırakıldı mı — `null` = bırakılmadı (eylem yerinde durur).
 *
 * `getSnapshot` her render'da yeniden kurulur ama döndürdüğü değer İLKELDİR (dizge ya da `null`),
 * yani React aynı değeri görüp yeniden çizmez — depo kalıbının kendi gerekçesi.
 */
export function usePlaceNoticeRecord(country: NoticeCountry, postalCode: string): PlaceNoticeRecord | null {
  const read = () => records.get(keyOf(country, postalCode)) ?? null;
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Testlerin arasını ayıran kapı — modül deposu dosyalar arasında yaşar, kalıntı bırakmamalı.
 *
 * BOŞKEN HABER SALMAZ (`rememberPlaceNotice`in ve `delivery-address-store`un aynı erken dönüşü):
 * değişmeyen bir değeri duyurmak, dinleyicileri boşuna uyandırmaktır. Ölçüldü (11.08) ve boş
 * duyuru testte GÖRÜNÜR bir arıza üretiyordu: her testin başında koşan bu satır, bir öncekinden
 * kalan dinleyicileri tetikliyor ve SONRAKİ `render` boş bir ağaç döndürüyordu — kaybolan şey
 * bileşen değil, koşucunun ağacıydı.
 */
export function resetPlaceNotices(): void {
  if (records.size === 0) return;
  records.clear();
  emit();
}
