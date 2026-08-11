import { z } from 'zod';
import { DiscountSchema } from '../entities/discount.schema';
import { PointsBalanceSchema } from '../entities/points.schema';
import { PointsReasonEnum } from '../primitives/enums.schema';

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
 * **Puan kazanma yolunun ANAHTARI** — defterin sebep sözlüğünden TÜRER (`PointsReasonEnum`), elle
 * yazılmaz. İkinci bir sözlük ("discovery", "invite" gibi ekrana özel adlar) açsaydık, ayarın
 * anahtarı (`points_feedback_candidate`), defterin sebebi (`feedback_candidate`) ve telin adı
 * birbirinden ayrı üç sözcük olurdu — ve "keşif turu kaç puan" sorusunun cevabı her katmanda bir
 * çeviri gerektirirdi (enum künyesinin `ProductFeedback.context` ile hizalanma gerekçesi birebir
 * aynı).
 *
 * Küme `.extract` ile DARALTILMIŞ, tüm kazanım sebepleri değil: buradakiler müşterinin **kendi
 * iradesiyle başlatabileceği** yollar. Dışarıda kalanlar bilinçli — `order` ve
 * `feedback_purchase` bir satın almanın peşinden gelir (kazanma yolu değil, alışverişin yan ödülü)
 * ve `visit` uygulamayı açmakla kendiliğinden yazılır, yani gösterilecek bir "yap" yok. Ekran bu
 * anahtar kümesi üzerinde TAM bir metin haritası kurabilir; enum genişlerse derleme kırılır ve
 * eksik metin üretimde değil, o an fark edilir.
 */
export const MePointsEarnWayKeyEnum = PointsReasonEnum.extract(['referral', 'review', 'feedback_candidate']);
export type MePointsEarnWayKey = z.infer<typeof MePointsEarnWayKeyEnum>;

/**
 * Tek bir kazanma yolu — **anahtar + sayı, metin YOK.**
 *
 * Cümleyi ekran kurar (i18n istemcide, üç dil); sunucu yalnız "hangi yol" ve "kaç puan" der. Metni
 * sunucudan göndermek, tele çeviri koymak ve müşterinin dilini sunucunun tahminine bağlamak olurdu
 * — adlı retlerin (`MePointsRedeemErrorEnum`) aynı ayrımı: anahtar sözleşmede, cümle ekranda.
 *
 * `points` AYARDAN gelir (`points_referral` · `points_review` · `points_feedback_candidate`), tele
 * sabit gömülmez: ekranın vaat ettiği puan ile motorun yazdığı puan ayrıştığında müşteri
 * gelmeyecek bir ödül için hareket eder (eşik ayrışmasının aynısı — 29.07 denetimi).
 *
 * `positive()` bir titizlik değil KURAL: motor sıfır değerli aksiyonu zaten reddediyor
 * (`canEarnPoints` → `no_value`), yani "0 puan kazandıran yol" diye bir şey yok. Sıfır taşıyan bir
 * satır listeye hiç girmez — girseydi ekran kazandırmayan bir işi kazanç gibi gösterirdi.
 */
export const MePointsEarnWaySchema = z.object({
  key: MePointsEarnWayKeyEnum,
  points: z.number().int().positive(),
});

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
 *
 * `referralCode` ve `earnWays` KARTIN İÇİNDE, zarfın kökünde değil: ikisi de "bu müşteri puan
 * kazanabilir" önermesinin parçası ve kart `null` olduğunda (B2B) ikisinin de anlamı yok. Kökte
 * dursalardı program dışı bir profile davet kodu üretmemek için AYNI koşulu ikinci kez yazmak
 * gerekirdi — ve iki koşuldan biri bir gün ötekinden ayrılırdı (kuponların `read.ts` künyesindeki
 * gerekçenin aynısı: tek koşul, tek karar).
 */
export const MePointsCardSchema = PointsBalanceSchema.pick({ balance: true }).extend({
  redeem: z.object({
    minimumPoints: z.number().int(),
    valueCents: z.number().int(),
  }),
  /**
   * Müşterinin davet kodu — **kart çizildiyse GARANTİLİ** (kapı yoksa üretir). `/me`nin aynı adlı
   * alanı profil satırının HAM aynasıdır ve boş olabilir; burada kod bir kimlik künyesi değil,
   * `referral` kazanım yolunun yüküdür — yolu gösterip paylaşılacak kodu vermemek, müşteriyi
   * çalışmayan bir düğmeye bastırırdı.
   *
   * `null` yalnız üretim başarısızsa (kod çakışması tekrarı tükendi — pratikte olmayan hâl):
   * uydurma bir kod basmaktansa ekran davet yolunu hiç göstermesin.
   */
  referralCode: z.string().nullable(),
  /**
   * Kodun paylaşılabilir TAM adresi (17.9) — `https://…/fr/parrainage/AB12CD34`.
   *
   * **Kod ile adres AYRI alanlar** çünkü ikisinin işi ayrı: kod telefonda okunur/yazılır, adres
   * paylaşılır. Ekran adresi kodu birleştirerek KURMAZ — kuran her yüzey, rota adı değiştiğinde
   * sessizce 404'e düşen bir bağlantı taşır. `null` yalnız kod da `null`ken.
   */
  inviteUrl: z.string().nullable(),
  /** Puan kazanma yolları — sıra sunucudan gelir (bkz. `MePointsEarnWaySchema`). */
  earnWays: z.array(MePointsEarnWaySchema),
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
