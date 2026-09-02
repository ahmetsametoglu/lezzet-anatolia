import { useSyncExternalStore } from 'react';

import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics/haptics';

/*
  TOAST DEPOSU — v3'ün `toastM`i (v3:437): tek satırlık bilgi mesajı, kendiliğinden düşer (süre
  metnin uzunluğundan türer — künyesi `sureOf`ta); yeni mesaj eskinin sayacını SIFIRLAR (art arda iki eylemde ilkinin artığı ikincinin
  süresini yemez — şablonun kendi `clearTimeout` kuralı).

  MODÜL-DURUMLU (`use-me.hook` deseni): basan taraf herhangi bir ekran ya da akış, çizen taraf
  kökteki tek `ToastHost`. Prop zinciriyle taşımak her ara katmanı toast'a bağımlı kılardı.

  Metin BURADA i18n'siz gelir: cümle, basan ekranın kendi sözlüğünde çözülür (messages.json
  deseni) — depo çeviri bilmez, yalnız taşır.

  ── TOAST ARTIK TİPLİ, VE TİTREŞİMİN KAYNAĞI BU (kullanıcı kararı 16.08) ────
  Tek bir `publishToast` vardı ve mesajın "oldu" mu "olmadı" mı olduğunu YALNIZ cümlenin kendisi
  biliyordu — yani kimse bilmiyordu. Oysa toast basılan an, tanımı gereği kullanıcının SONUÇ
  BEKLEDİĞİ andır: uygulamanın en doğal geri bildirim kanalı burası.

  Dört fiil, dört niyet: `toastSuccess` (işlem oldu) · `toastWarning` (oldu ama tam olmadı) ·
  `toastError` (olmadı) · `toastInfo` (ne oldu ne olmadı — bilgi). Titreşim ilk üçüne bağlı,
  `toastInfo` SESSİZ. Ayrımın bedeli çağıranın tek kelime seçmesi; kazancı yirmi ekranın aynı
  üslupla konuşması.

  ── `toastWarning` NEDEN SONRADAN GELDİ (01.09) ─────────────────────────────
  Operasyon kancalarının ortak ton sözlüğü dört tonlu (`use-notice.hook`) ve KISMİ başarı orada
  gerçek bir hâl: *"sefer açıldı ama iki durak atlandı"*. Bildirimler toast'a taşınınca (kullanıcı
  kararı: sonuç ekranda değil toast'ta görünür) o ton kanalsız kaldı — `toastInfo`ya düşseydi
  SESSİZ olurdu, `toastError`a düşseydi kısmen başarılı bir işlem hata gibi titreşirdi. Metnin
  görünüşü aynı (şablonda tek toast var); ayrışan tek şey ele giden sinyal, ki operasyonda ekrana
  bakmadan alınan tek sinyal odur.

  Titreşim burada, host'ta DEĞİL: host bir çizim katmanı ve kendini yeniden çizebilir; titreşim
  ise bir OLAY, iki kez olmamalı. Yayın anı olayın tek gerçekleştiği yerdir.
*/

/*
  ── SÜRE METNİN UZUNLUĞUNA GÖRE (kullanıcı kararı 01.09) ────────────────────
  2400 ms sabitti ve şablonun kendi değeriydi (v3:437 `toastM`). Mesajlar kısa kaldığı sürece
  doğruydu; kutu okutma cümlesine ROTA ADI girince değil: *"toast mesajı süresi kutunun hangi
  rota olduğunu söyleyeceği için bir miktar uzun tutulması da gerekebilir."*

  Süre bu yüzden sabit değil, OKUMA SÜRESİ: kısa cümle eskisi kadar durur, uzun cümle karakter
  başına biraz daha. Sabit bir "hepsi 4 saniye" iki yönden de yanlış olurdu — kısa onaylar ekranda
  gereksiz asılır, uzun cümle yine yetişmezdi.

  Sayılar rampada okuyan bir kuryeye göre: eşik 40 karakter (bir bakışta okunan cümle), üstü
  karakter başına 45 ms (~22 karakter/sn — göz atarak okuma hızı), tavan 6 sn. Tavan şart:
  süresi metne bağlı bir toast, bir gün gelen uzun bir hata mesajıyla ekranda kalıcı olurdu.
  Üçü de burada, tek yerde parametrik.
*/
const TOAST_BASE_MS = 2400;
const TOAST_ESIK_KARAKTER = 40;
const TOAST_KARAKTER_MS = 45;
const TOAST_TAVAN_MS = 6000;

function sureOf(message: string): number {
  const fazla = Math.max(0, message.length - TOAST_ESIK_KARAKTER);
  return Math.min(TOAST_TAVAN_MS, TOAST_BASE_MS + fazla * TOAST_KARAKTER_MS);
}

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
  }, sureOf(message));
}

/** İŞLEM OLDU — kullanıcının beklediği sonuç geldi. Titreşir. */
export function toastSuccess(message: string): void {
  hapticSuccess();
  publish(message);
}

/** OLDU AMA TAM OLMADI — kısmi sonuç ("sefer açıldı, iki durak atlandı"). Uyarı titreşimi. */
export function toastWarning(message: string): void {
  hapticWarning();
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

/**
 * **Testlerin başlangıç noktası** — mesajı ve SAYACI birlikte düşürür (01.09).
 *
 * Sayaç asıl mesele: toast basan bir ekran testi bittiğinde 2400 ms'lik `setTimeout` ayakta
 * kalıyor ve Jest süreci kapanmıyor ("did not exit one second after the test run"). Modül
 * düzeyinde durum dosyalar arası da sızar — bir testin bastığı mesaj, sonraki testin ekranında
 * asılı kalırdı (`resetWarehouseChoice`in aynı gerekçesi).
 */
export function resetToast(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
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
