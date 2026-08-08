import { pricingViewerOf } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { SettingScopeContext } from '@lezzet/types';

/**
 * **Ayar kapsamının TEK kurucusu** (07.15) — sepet ve checkout aynı ekseni aynı yerden doldurur.
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * `SettingsService.get` kapsamı doğru çözüyordu (depo → bölge → kanal → ülke → global, birim
 * testli) ama **iki tüketici de kapsam GEÇMİYORDU**: sepet üç okumayı kapsamsız yapıyordu,
 * checkout beş okumayı `{ channel: undefined }` ile. Ölçülen sonuç (denetim, 08.08):
 *
 *   B2B asgari sepet 120 € → küresel 0        · toptancı 2 €'luk sipariş verebiliyordu
 *   B2B bedava kargo 250 € → 60 €             · toptancıya perakende eşiği
 *   DE kargo 12,90 €       → 7,90 €           · sınır ötesi taşıma FR fiyatına
 *   Bölge asgari sepeti    → hiç uygulanmıyor
 *
 * Yani kapsamlı ayar satırları yazılıyor, hiçbiri okunmuyordu.
 *
 * ── NEDEN ORTAK BİR YARDIMCI ────────────────────────────────────────────────
 * 29.07 dersinin kapsam boyutu: o gün sepet ile checkout'un aynı ayarı FARKLI ANAHTARLA okuduğu
 * görülmüş ve anahtarlar ortak bir sabite alınmıştı. Anahtar ortaklığı yetmiyor — **kapsam da
 * ortak olmalı.** İki yüzey aynı anahtarı farklı kapsamla okursa sepette "13 € eşik" yazıp
 * checkout'ta 0 € uygulanır ve müşteri arada ne olduğunu anlamaz.
 *
 * ── YER EKSENLERİ İÇERİDE OKUNMAZ, DIŞARIDAN GELİR ──────────────────────────
 * İlk yazımda burası `cookies()` okuyordu ve **ölçüldü: 34 test düştü** (*"`cookies` was called
 * outside a request scope"*). Sebep bir test kazası değil bir tasarım hatası: istek bağlamına
 * bağlı bir okumayı orkestrasyonun içine koymak, o orkestrasyonu istek dışında ÇAĞRILAMAZ hâle
 * getirir — cron, webhook ve mobil uç dâhil.
 *
 * Doğrusu deponun kendi disiplininde zaten yazılıydı: `getCartView` yer eksenlerini parametre
 * olarak alıyor, çünkü yeri ÇÖZEN taraf isteğin sahibi olan sayfadır. Bu yardımcı da öyle —
 * çerezi okuyan yüzeydir (`readPlaceScope`), kapsamı kuran burasıdır.
 *
 * ── KANAL NEDEN İÇERİDE ─────────────────────────────────────────────────────
 * Kanal bir DB okumasıdır, istek bağlamı istemez; ve ham `company_info` varlığına bakmak yanlış
 * olurdu — **onaysız şirket `b2c`'dir** (DOMAIN §10: SIRET herkese açık, künye girmek toptancı
 * olmak değil). Kural fiyatın okunduğu yerde tek nüsha yaşıyor (`pricingViewerOf`).
 *
 * **Ziyaretçide kanal `b2c`'dir, `undefined` değil** — kapsamsız bırakmak "kanal bilinmiyor"
 * demektir ve çözücü o ekseni atlar; oysa ziyaretçi bilinmeyen değil, perakendedir.
 */
export interface SettingScopeInput {
  customerId?: string | null;
  /** Teslimatın gideceği ülke — yeri çözen yüzeyden gelir (çerez okuması orada). */
  country?: string | null;
  /** Posta kodunun düştüğü rota bölgesi; kod bölgeye düşmüyorsa `null` (kargo yolu). */
  zoneId?: string | null;
  /** Yerin deposu — en özgül eksen (rota/paketleme maliyeti, kesim saati depo başına değişir). */
  warehouseId?: string | null;
}

export async function settingScopeOf(input: SettingScopeInput = {}): Promise<SettingScopeContext> {
  const viewer = await pricingViewerOf(serviceDb(), input.customerId ?? null);
  return {
    channel: viewer.channel,
    country: input.country ?? null,
    zoneId: input.zoneId ?? null,
    warehouseId: input.warehouseId ?? null,
  };
}
