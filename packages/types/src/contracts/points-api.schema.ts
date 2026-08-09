import { z } from 'zod';
import { DiscountSchema } from '../entities/discount.schema';
import { PointsBalanceSchema } from '../entities/points.schema';

/**
 * `/api/v1/me/points` SÖZLEŞME şemaları (21.17) — hesap ekranının "Puanlarım" bölümünün ve puan →
 * kupon çevirmesinin ortak dili. Terfi gerekçesi `me-api.schema.ts` · `address-api.schema.ts` ile
 * aynı (02-mimari §3.2 "sözleşme tek kaynak"); entity/taşıma ayrımı da oradaki künyede:
 * `points.schema.ts` defterin ve görünümün aynasıdır, bu dosya "bu yüzey tele ne verir"i söyler.
 */

/**
 * Kullanılabilir kişisel kupon — **kupon ayrı bir tablo DEĞİL**, `customer_id`si dolu bir indirim
 * satırıdır (web `lib/account/coupons.ts` künyesi: ikinci bir "kupon" varlığı açmak, sepette
 * çalışan indirim motorunun onu hiç görmemesi demekti). Bu yüzden şema `DiscountSchema`dan TÜRER.
 *
 * `code` tek eklenen alan ve türetilemez: kod ayrı bir varlıktır (`discount_code`, aynı kurala
 * birden çok dil kodu açılabilir). Puan kuponunda tek kod vardır ama okuma bunu VARSAYMAZ —
 * kodsuz kupon listeye hiç girmez, çünkü müşteriye yazacağı bir şey yoktur.
 *
 * Bilinçli dışarıda: `trigger`/`scope`/`type` (motorun iç ayrımı — ekran "kupon" der geçer),
 * `maxUses`/`perCustomerLimit`/`isActive` (kullanılabilirlik SÜZGECİ zaten uygulandı; listede olan
 * kupon kullanılabilirdir, istemcinin aynı kuralı ikinci kez hesaplaması gerekmez), `validFrom`
 * (geçmiş bir tarih; listede olan kuponun başlangıcı çoktan gelmiştir).
 */
export const MeCouponSchema = DiscountSchema.pick({
  id: true,
  amountCents: true,
  percent: true,
  minBasketCents: true,
  validTo: true,
}).extend({ code: z.string() });

/**
 * Puan kartının gövdesi — bakiye + çevirme kuralı.
 *
 * **Eşik AYARDAN gelir, tele sabit gömülmez** (29.07 denetimi): ekranın söylediği eşik ile motorun
 * uyguladığı eşik ayrıştığında müşteri reddedilecek bir düğmeye basar. `minimumPoints` kadar puan
 * `valueCents` kadar kupon eder — "500 puan = 5 €" cümlesi tam olarak bu iki alandır.
 *
 * `earned`/`spent` BİLEREK dışarıda: görünüm onları taşıyor (`PointsBalanceSchema`) ama v3 puan
 * kartı yalnız bakiyeyi ve eksik puanı yazıyor. "Topladın / harcadın" dökümü bir ekrana girdiği
 * gün küme oradan büyür — sözleşme ekranın ihtiyacını taşır (adres sözleşmesinin aynı kararı).
 */
export const MePointsCardSchema = PointsBalanceSchema.pick({ balance: true }).extend({
  redeem: z.object({
    minimumPoints: z.number().int(),
    valueCents: z.number().int(),
  }),
});

/**
 * `GET /api/v1/me/points` ve `POST /api/v1/me/points/redeem` — **AYNI zarf.** Çevirme bakiyeyi
 * düşürür ve listeye yeni bir kupon ekler; tek kaydı dönmek istemciyi ikinci bir okuma turuna
 * mecbur bırakırdı (adres uçlarının "cevap hep güncel liste" kararıyla birebir aynı gerekçe).
 *
 * **`points` NULL olabilir ve bu sıfır DEĞİLDİR:** B2B profil puan programının dışındadır
 * (DOMAIN §14 — oyunlaştırma B2C kararı) ve ekran o hâlde bölümü hiç çizmez, "0 puan" yazmaz.
 * Sıfır yazmak, kazanamayacağı bir bakiyeyi müşteriye boş bir hedef gibi göstermek olurdu
 * (CLAUDE §1: ölçülemeyen değer sıfır değildir). Web hesap okuması da aynı şekilde `null` dönüyor.
 *
 * `coupons` B2B'de her zaman boş — puanla aynı koşula bağlı, ikisi ayrı ayrı sorulmaz ki bir gün
 * biri B2B'ye sızmasın (web `read.ts` künyesindeki aynı gerekçe). Liste SAYFALANMAZ: tek
 * kullanımlık kuponların doğal tavanı var, veriyle sınırsız büyüyen bir küme değil (CLAUDE §1).
 */
export const MePointsViewSchema = z.object({
  points: MePointsCardSchema.nullable(),
  coupons: z.array(MeCouponSchema),
});

/**
 * Çevirmenin adlı retleri — motorun sözlüğüyle BİREBİR (`canRedeem`), tek çeviriyle: `b2b` dışarı
 * `not_eligible` olarak çıkar. Motorun iç ayrımı ("şirket profili") müşterinin göreceği bir cümle
 * değil; web kapısı da aynı indirmeyi yapıyor.
 *
 * Anahtarlar AYRI AYRI taşınıyor, tek bir "çevrilemiyor"a indirgenmiyor: web'in hesap kartı üçünü
 * tek anahtara topluyor ama o bir EKRAN kararıdır (kart zaten kalan puanı yazıyor, B2B'de bölüm
 * hiç çizilmiyor). Taşıma katmanı anahtarı verir, cümleyi ekran kurar — mobil kart isterse aynı
 * indirgemeyi kendi yapar, ama sözleşme ona bu seçeneği bırakmalı.
 */
export const MePointsRedeemErrorEnum = z.enum(['insufficient_balance', 'below_minimum', 'not_eligible']);
export type MePointsRedeemError = z.infer<typeof MePointsRedeemErrorEnum>;

/**
 * Çevirmenin cevabı — güncel cüzdanın AYNISI, üstüne yeni kuponun kodu.
 *
 * Kod ayrıca taşınıyor çünkü ekran *"PUAN-7K4M2P hazır"* diyebilmeli ve bunu listeyi eskisiyle
 * karşılaştırarak bulmak zorunda kalmamalı. Kuponun KENDİSİ tekrarlanmıyor — o zaten `coupons`
 * içinde, süzgeçten geçmiş hâliyle duruyor; burada yalnız "hangisi yeni" sorusunun cevabı var.
 *
 * `null` yalnız RPC kodu döndürmediğinde (olmaması gereken hâl): uydurma bir kod basmaktansa ekran
 * o bildirimi hiç göstermesin.
 */
export const MePointsRedeemResultSchema = MePointsViewSchema.extend({ redeemedCode: z.string().nullable() });
