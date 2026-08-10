/**
 * Ayar anahtarları ve varsayılanları — **kısmi geçiş köprüsü** (terfi aşama 2/3, denetim K5-1).
 *
 * Altı sepet/kargo sabiti `@lezzet/application/cart/settings-keys`ten geliyor; künyelerin tamamı
 * orada (eşiğin neden koda gömülmediği, varsayılanın neden ayar okunamadığında devreye girdiği).
 *
 * ── NEDEN İKİZ TEHLİKELİYDİ ─────────────────────────────────────────────────
 * Bunlar "yalnızca sabit" değil, İKİ YÜZEYİN AYNI SAYIYI okuma sözü: ücretsiz kargo eşiği web
 * sepetinde bir dosyadan, mobil sepette başkasından okunuyordu. Biri güncellenip öteki unutulsa
 * müşteri web'de "6,90 € kargo", uygulamada "ücretsiz" görürdü — ve iki dosyanın da testi yeşil
 * kalırdı.
 *
 * ── İKİ ANAHTAR HÂLÂ BURADA VE BU BİLİNÇLİ ──────────────────────────────────
 * `POINTS_*` pakete taşınmadı: puan kuralı sepetin değil sadakat modülünün (17.x) ve paket tarafında
 * karşılığı yok. Buraya sahte bir köprü yazmak — pakette olmayan bir şeyi varmış gibi göstermek —
 * ikizden kötü olurdu. Taşınma sırası geldiğinde bu dosya tamamen köprüye iner.
 *
 * ── ADRES BARREL DEĞİL, DERİN YOL (10.08) ───────────────────────────────────
 * Bu dosyayı operasyonun ayarlar ve depolar ekranları (istemci komponentleri) okuyor. Barrel'dan
 * açılınca paketin tamamı — `@lezzet/database` ve `node:crypto` dahil — tarayıcı paketine giriyor;
 * sepet köprüsünde aynı şey ödeme sayfasını 500'e düşürdü. Kaynak modül saf (hiç importu yok), o
 * yüzden derin yol hem doğru hem bedelsiz.
 */
export {
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  FREE_SHIPPING_THRESHOLD_KEY,
  MIN_BASKET_DEFAULT,
  MIN_BASKET_KEY,
  SHIPPING_FEE_DEFAULT,
  SHIPPING_FEE_KEY,
} from '@lezzet/application/cart/settings-keys';

/**
 * Puanı kupona çevirme kuralı — **hesap ekranı ile motor aynı sayıyı okumak zorunda.**
 *
 * Yaşandı (29.07 · tasarım denetimi): ekran eşiği koda `300` diye gömmüştü, ayar `500` idi. 340
 * puanlı müşteri "300 puan = 5 € kuponu" cümlesini okuyup düğmeye basacak, motor reddedecekti —
 * ekranın söylediği kural sistemin kuralı değildi.
 *
 * Anahtarlar `0028_points.sql`'de tanımlı; `lib/feedback/points.ts` de aynı satırları okur (bugün
 * dize sabitiyle). İkisi buluşturulmalı — kapı 17.5 ile açılırken buradan okumalı.
 */
export const POINTS_REDEEM_MIN_KEY = 'points_redeem_min';
export const POINTS_CENT_VALUE_KEY = 'points_cent_value';
