/**
 * Kuryeyi cihazının navigasyon uygulamasına devreden bağlantılar (11.8) — **saf karar**, I/O yok.
 *
 * ── NEDEN VAR: DÜĞME YANLIŞ İŞİ YAPIYORDU ───────────────────────────────────
 * İki yüzeyde de URL elle yazılıydı ve ikisi de `maps/search/?api=1&query=` idi. O adres bir **yer
 * kartı** açar: haritada bir iğne gösterir, yolculuğu BAŞLATMAZ — kurye ekranda ikinci kez "Yol
 * tarifi"ne basmak zorunda kalır. Doğrusu `maps/dir/?api=1&destination=…`: uygulama doğrudan rota
 * kurar. Tek harf farkı gibi görünen şey, kapıda her durakta tekrarlanan bir dokunuş.
 *
 * ── NEDEN BURADA, SÖZLEŞMEDE DEĞİL ──────────────────────────────────────────
 * Kardeşi `whatsAppLink` sunucuda hesaplanıp `CourierStop`a konuyor, bu KONMUYOR — ve fark ilkeseldir:
 * WhatsApp bağlantısı sunucunun BİLDİĞİ bir şeye dayanır (müşterinin dili, normalize numara), istemci
 * onları bilmez. Navigasyon hedefi ise **cihazın** kararıdır: iOS mu Android mi, hangi harita
 * uygulaması kurulu. Sunucu bunların hiçbirini bilmez; bilmediği bir şeye karar verirse ekran onu
 * düzeltmek zorunda kalır. Burası adlandırılmış hedefleri ÜRETİR, hangisinin açılacağına yüzey karar
 * verir — sözleşme (`CourierStopSchema`) hiç değişmez.
 *
 * ── NEDEN YALNIZ `https` (ve `canOpenURL` neden yok) ────────────────────────
 * `comgooglemaps://` gibi özel şemalar uygulama kurulu değilse sessizce başarısız olur; doğru
 * kullanımları `canOpenURL` ile önden yoklamayı gerektirir. Android 11+ paket görünürlüğü yüzünden
 * `canOpenURL` bildirilmemiş şemalar için **yanlışlıkla `false`** döner ve doğru cevap almak
 * `app.json`'a `android.queries` + yeni bir prebuild turu ister. `https` adresleri ise her cihazda
 * çözülür: uygulama kuruluysa uygulamada, değilse tarayıcıda açılır. Kazanç aynı, bedel sıfır.
 */

import type { GeoPoint } from './distance';

/** Hedefin hangi uygulamada açılacağı. `universal` her cihazda çalışan varsayılandır. */
export type NavigationTarget = 'universal' | 'geo' | 'waze' | 'apple';

export interface NavigationLink {
  target: NavigationTarget;
  url: string;
}

/**
 * Durağın navigasyon bağlantıları. Hedef ne koordinat ne adres metni olarak biliniyorsa **null**
 * döner — çağıran düğmeyi hiç çizmez (`whatsAppLink`in aynı kuralı: tıklanınca hiçbir yere gitmeyen
 * bir düğme, olmayan bir düğmeden kötüdür).
 *
 * Koordinat varsa o kullanılır (kesin); yoksa adres metni yollanır ve hedef uygulama kendi tarafında
 * çözer — Google, Waze ve Apple üçü de serbest metni kabul eder, bize hiçbir maliyeti yok.
 */
export function navigationLinks(input: {
  point?: GeoPoint | null;
  address?: string | null;
}): NavigationLink[] | null {
  const destination = destinationOf(input);
  if (!destination) return null;

  const q = encodeURIComponent(destination);
  return [
    // Varsayılan: kurulu uygulamada, kurulu değilse tarayıcıda açılır — ve doğrudan ROTA kurar.
    { target: 'universal', url: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving` },
    // Android sistem seçicisi: "hangi uygulamayla" sorusunu işletim sistemi sorar ve cevabı KENDİSİ
    // hatırlar. Kuryenin tercihini biz saklamayız — sakladığımız gün cihazın ayarıyla çelişirdi.
    { target: 'geo', url: `geo:0,0?q=${q}` },
    { target: 'waze', url: `https://waze.com/ul?q=${q}&navigate=yes` },
    // Yalnız iOS'ta anlamlı; Android'de web sayfası açar, o yüzden oraya konmaz.
    { target: 'apple', url: `https://maps.apple.com/?daddr=${q}&dirflg=d` },
  ];
}

/** Yüzeylerin çoğunun istediği tek bağlantı: her cihazda çalışan varsayılan. */
export function navigationLink(input: { point?: GeoPoint | null; address?: string | null }): string | null {
  return navigationLinks(input)?.find((link) => link.target === 'universal')?.url ?? null;
}

/**
 * Hedefin metinsel hâli. Koordinat **kesin**dir ve adres metnini yener: "12 rue des Fleurs" hedef
 * uygulamada başka bir şehirde eşleşebilir, `48.573400,7.752100` eşleşemez.
 *
 * Koordinat altı haneye yuvarlanır (≈11 cm) — `numeric(9,6)` kolonunun taşıdığı incelik bu; daha
 * fazla hane ölçümde olmayan bir kesinlik iddia ederdi.
 */
function destinationOf(input: { point?: GeoPoint | null; address?: string | null }): string | null {
  const point = input.point;
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
  }

  const address = (input.address ?? '').trim();
  return address ? address : null;
}
