import type { SettingScopeContext } from '@lezzet/types';
import type { PricingViewer } from '../catalog/pricing-viewer';

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
 * İlk yazımda web'deki nüsha `cookies()` okuyordu ve **ölçüldü: 34 test düştü** (*"`cookies` was
 * called outside a request scope"*). Sebep bir test kazası değil bir tasarım hatası: istek
 * bağlamına bağlı bir okumayı orkestrasyonun içine koymak, o orkestrasyonu istek dışında
 * ÇAĞRILAMAZ hâle getirir — cron, webhook ve mobil uç dâhil.
 *
 * ── KANAL NEDEN GÖRÜNTÜLEYENDEN GELİR ───────────────────────────────────────
 * Kanal bir DB okumasıdır; ham `company_info` varlığına bakmak yanlış olurdu — **onaysız şirket
 * `b2c`'dir** (DOMAIN §10: SIRET herkese açık, künye girmek toptancı olmak değil). Kural fiyatın
 * okunduğu yerde tek nüsha yaşıyor (`pricingViewerOf`) ve buraya ÇÖZÜLMÜŞ hâliyle geliyor.
 *
 * **Ziyaretçide kanal `b2c`'dir, `undefined` değil** (`VISITOR`) — kapsamsız bırakmak "kanal
 * bilinmiyor" demektir ve çözücü o ekseni atlar; oysa ziyaretçi bilinmeyen değil, perakendedir.
 *
 * ── TERFİ (aşama 1/3) · WEB'DEN FARKI ───────────────────────────────────────
 * Kaynağı `apps/web/lib/settings-scope.ts`ti ve orada `async (customerId) → pricingViewerOf` idi.
 * Burada **saf**: görüntüleyen çağırandan gelir. Tek sebep tekilleştirme — sepet okuması aynı
 * görüntüleyeni fiyat bağlamı için ZATEN çözüyordu, ikinci bir profil okuması aynı satırı iki kez
 * getiriyordu. Kural değişmedi: kanal yine `pricingViewerOf`ün kararı.
 */
export function settingScopeOf(
  viewer: PricingViewer,
  place: { country?: string | null; zoneId?: string | null; warehouseId?: string | null } = {},
): SettingScopeContext {
  return {
    channel: viewer.channel,
    country: place.country ?? null,
    zoneId: place.zoneId ?? null,
    warehouseId: place.warehouseId ?? null,
  };
}
