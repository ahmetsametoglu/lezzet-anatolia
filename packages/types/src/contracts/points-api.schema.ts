import { z } from 'zod';
import { DiscountSchema } from '../entities/discount.schema';
import { PointsBalanceSchema, PointsEntrySchema } from '../entities/points.schema';
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
 * ── KÜME ÜÇTEN ALTIYA GENİŞLEDİ (kullanıcı kararı 12.08) ────────────────────
 * Eskiden `.extract(['referral','review','feedback_candidate'])`ti ve ölçütü *"müşterinin kendi
 * iradesiyle başlatabileceği yollar"*dı — çünkü tek tüketicisi hesap kartıydı ve o kartın her
 * satırında bir düğme vardı. Şimdi ikinci bir tüketici doğdu: **"nasıl puan kazanırım" anlatımı**
 * (onboarding'in son adımı + hesaptaki başvuru sayfası), ve orada soru "ne yapabilirim" değil
 * **"bu sistem beni neyle ödüllendiriyor"**dur. `visit` kendiliğinden yazılır ama müşterinin
 * bilmesi gereken en düzenli gelirdir; `feedback_purchase` ve `neighbor` de gerçek ödüllerdir.
 * Eksik anlatmak, kazandığı puanın nereden geldiğini bilmeyen bir müşteri bırakırdı.
 *
 * **`order` DIŞARIDA ve bu bir eksiklik değil:** sipariş puanı kaldırıldı (kullanıcı kararı 11.08,
 * `BACKLOG-musteri §4` karar 1) — sebep enum'unda geçmişi okuyabilmek için duruyor ama artık
 * yazılmıyor, yani bir "kazanma yolu" değil. Kazanılamayan bir yolu listelemek, motorun vermeyeceği
 * bir sözü ekrana yazmaktır.
 *
 * Ekran bu anahtar kümesi üzerinde TAM bir metin haritası kurar; enum genişlerse derleme kırılır ve
 * eksik metin üretimde değil, o an fark edilir. **Düğme haritası ise TAM DEĞİL** (`Partial`):
 * `visit`/`feedback_purchase` müşterinin gidebileceği bir yere işaret etmez.
 */
export const MePointsEarnWayKeyEnum = PointsReasonEnum.extract([
  'referral',
  'neighbor',
  'review',
  'feedback_purchase',
  'feedback_candidate',
  'visit',
]);
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
 * **PROGRAMIN KURALLARI — kimliksiz okunabilir** (`GET /api/v1/points/rules`, kullanıcı kararı 12.08).
 *
 * Onboarding'in son adımı puanı anlatıyor ve o ekranı gören kişi henüz MİSAFİR: hesabı yok, bakiyesi
 * yok, `/me/points`e hiç gidemez. Ama ekranın söylediği her sayı yine motorun uyguladığı sayı olmak
 * zorunda — sabit gömmek, ayarlar değiştiği gün müşteriye gerçekleşmeyecek bir vaat vermek olurdu
 * (29.07 denetiminin kapattığı arıza sınıfı, `MePointsCardSchema` künyesindeki aynı gerekçe).
 *
 * Bu yüzden kural KİMLİKTEN AYRILDI: burada "program neyi ne kadar ödüllendirir" var, kartta ise
 * onun üstüne "bu müşterinin bakiyesi ve kodu" biniyor (`MePointsCardSchema` bunu `merge` ile alır —
 * iki şema aynı alanları iki kez saymaz).
 *
 * `centValue` AYRICA taşınıyor, `valueCents / minimumPoints` diye türetilmiyor: bölme tam sayı
 * vermeyebilir ve ekran "yorum yazınca 0,20 €" cümlesini tek tek yollar için kurar. Türetme, eşik
 * bir gün kuruşa bölünemeyen bir sayı olduğunda sessizce yanlış para basardı.
 */
export const PointsRulesSchema = z.object({
  redeem: z.object({
    minimumPoints: z.number().int(),
    valueCents: z.number().int(),
  }),
  /** Bir puanın CENT karşılığı — bir yolun para değeri `points × centValue`. */
  centValue: z.number().int().positive(),
  /**
   * **Bir komşu davetinden kaç komşu ödül doğurabilir** (`NEIGHBOR_INVITE_MAX_USES`).
   *
   * Taşınmasının sebebi ölçülmüş bir yanlış metin (kullanıcı bulgusu 13.08): ekran *"her komşu için
   * 1,00 €"* diyordu ve iki şeyi birden gizliyordu — davet **tek bir sefere** ait (o günün
   * teslimatı), ve kullanım hakkı **sınırlı**. Sınırsız ve süresiz bir ödül gibi okunuyordu.
   *
   * Sayı ekrana GÖMÜLMEZ: sınır bir gün değişirse (kolon 1–20 arası kabul ediyor) müşteriye
   * söylenen ile motorun uyguladığı ayrışırdı — bu şemanın baştan sona kurduğu ilkenin aynısı.
   */
  neighborMaxUses: z.number().int().positive(),
  /** Puan kazanma yolları — sıra sunucudan gelir (bkz. `MePointsEarnWaySchema`). */
  earnWays: z.array(MePointsEarnWaySchema),
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
export const MePointsCardSchema = PointsBalanceSchema.pick({ balance: true }).merge(PointsRulesSchema).extend({
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
  /**
   * **BUGÜNKÜ ZİYARET PUANI ALINDI MI** (MB-54 · kullanıcı kararı 11.08 — *"kullanıcı geldiği zaman
   * o tik yanmalı"*).
   *
   * ── NEDEN KARTTA, `earnWays` SATIRINDA DEĞİL ────────────────────────────────
   * `MePointsEarnWaySchema` PROGRAMI anlatıyor (*"hangi yol, kaç puan"*) ve kimlikten bağımsız:
   * onboarding'in son adımı onu MİSAFİRE gösteriyor (`/points/rules`, açık uç). Oraya kimliğe bağlı
   * bir bayrak koymak, misafirin göremeyeceği bir alanı program tarifine sokmak olurdu — ve o ucun
   * *"kişisel hiçbir şey taşımaz"* sınırını delerdi.
   *
   * Kart ise zaten kimliğin kendisi ve B2B'de tümden `null` (program dışı). `referralCode` ve
   * `earnWays`in kartın İÇİNDE olmasının gerekçesi birebir aynı: tek koşul, tek karar.
   *
   * ── NEDEN "KAÇ PUAN KALDI" DEĞİL, İKİ DEĞERLİ ───────────────────────────────
   * Ziyaret günde bir kezdir (`points_entry_visit_day` — işletme günü başına tek satır), yani
   * cevap zaten evet/hayır. Sayı taşımak, olmayan bir kısmiliği ima ederdi.
   *
   * **Gün İŞLETMENİN günüdür (Europe/Paris)**, sunucunun değil — kısıtla ve günlük tavanla AYNI
   * tanım. Ayrı olsalardı yazın Paris'te 00:00–02:00 arasında ekran "bugün alındı" derken motor
   * yeni günü açmış olurdu.
   */
  visitClaimedToday: z.boolean(),
  /**
   * **"Puan yolda"** — davet edilen komşu sipariş verdi ama parası henüz alınmadı (★ karar 3 · MB-57).
   *
   * Ödül `paid` geçişinde doğuyor; o ana kadar müşterinin ekranında HİÇBİR ŞEY değişmiyordu —
   * komşusunu çağırmış, komşu sipariş vermiş, ortada bir iz yok. Bekleme doğaldır (ödül başkasının
   * parasına bağlı), görünmezliği kusurdu.
   *
   * **Puan değeri taşımaz, OLAY taşır:** kaç puan olduğunu ekran zaten biliyor (`earnWays`'teki
   * `neighbor`) ve iki yerde tutmak, ayar değiştiğinde ikisinin ayrışması demekti. Boş dizi = bekleyen
   * yok; ekran bloğu hiç çizmez. Defterde karşılığı YOKTUR ve olmamalı — `points_entry` *"ne oldu"*yu
   * tutar, *"ne olabilir"*i değil; sanal bir satır bakiyeyi de yalan söyletirdi.
   */
  pendingNeighborAwards: z.array(
    z.object({
      /** Komşunun YALNIZ adı (ilk sözcük) — cümlenin öznesi; soyadı göstermenin bir işlevi yok. */
      neighborName: z.string(),
      deliveryDate: z.string(),
    }),
  ),
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
 * **PUAN GEÇMİŞİNİN BİR SATIRI** (`GET /api/v1/me/points/history`, kullanıcı isteği 15.08).
 *
 * ── NEDEN VAR: EN BÜYÜK İKİ ÖDÜL GÖRÜNMEZDİ ─────────────────────────────────
 * Kullanıcının cümlesi: *"hangi puan nereden geldi konusunu da gösterebileceğimiz bir bölümümüz
 * olmalı."* Ölçüm bunun bir süsleme olmadığını gösterdi (15.08): `referral` (500) ve `neighbor`
 * (100) **başkasının** eylemiyle doğuyor — davet edilen kişi parasını ödediğinde — ve müşteri o an
 * uygulamada değil. Yani programın en değerli iki ödülünün gösterilebileceği bir "sonuç sayfası"
 * YOK; tek yeri geçmiştir. Günlük ziyaret puanı da bilinçli sessiz yazılıyor (karar 11.08) ve
 * müşterinin onu görebildiği ilk yer yine burası.
 *
 * ── SEBEP KÜMESİ TAM: `PointsReasonEnum`, `MePointsEarnWayKey` DEĞİL ─────────
 * Kazanma yolları kümesi (`MePointsEarnWayKeyEnum`) altı üye taşıyor ve ölçütü *"program neyle
 * ödüllendirir"*. Geçmiş bunu SORMUYOR: defterde ne varsa onu gösteriyor — `redemption` (kupona
 * çevirme, eksi), `manual` (personelin elle düzeltmesi) ve artık yazılmayan `order` da dahil.
 * Kazanma yolları kümesini genişletmek, "kazanma yolu" listesine hiç kazanma olmayan iki anahtar
 * sokardı; ayrı kalmalarının sebebi bu (web şeridinin 15.08 cevabındaki aynı gerekçe).
 *
 * ── DIŞARIDA BIRAKILANLAR ───────────────────────────────────────────────────
 * `note` — YALNIZ `manual`da dolu ve **personelin gerekçesi**dir ("gecikme telafisi — jest"), iç
 * yazışma; müşteriye gösterilmek üzere yazılmadı. `refId` — iç kimlik, müşterinin açabileceği bir
 * şeye işaret etmiyor (bir `product_feedback` satırı ya da bir davet). `createdBy` — personel
 * kimliği; müşteriye kimin düzelttiğini söylemenin bir işlevi yok.
 */
export const MePointsHistoryEntrySchema = PointsEntrySchema.pick({
  id: true,
  /** İşaretli: **+ kazanım, − harcama.** Ekran işareti hem renkten hem rakamdan okutur. */
  points: true,
  reason: true,
}).extend({
  /** Hareketin anı — `createdAt`in taşıma adı; ekran onu tarihe çevirir, ham damgayı yazmaz. */
  at: PointsEntrySchema.shape.createdAt,
});

/**
 * Geçmişin sayfa zarfı — sipariş listesinin BİREBİR aynı kararı (`MeOrderPageSchema` künyesi).
 *
 * **Defter veriyle SINIRSIZ büyür** (CLAUDE §1: sayfalama ölçütü liste olmak değil, sınırsız
 * büyümek): günde bir ziyaret puanı yazan bir müşteride bile satır sayısı yıllarla artar. Keyset,
 * offset değil — liste akarken araya kayıt girdiğinde offset satır atlar.
 *
 * `nextCursor` **opak bir dize**: istemci onu yorumlamaz, bir sonraki isteğe aynen geri verir.
 * **İmleç URL'e yazılmaz** — süzgeç yok, yani paylaşılabilecek bir seçim de yok.
 *
 * `total` YOK: tasarımda "N hareket" diye bir başlık yok ve olmayan bir sayacı taşımak, bir gün
 * süzgeç eklendiğinde sessizce yalan söyleyen bir alan bırakırdı.
 */
export const MePointsHistoryPageSchema = z.object({
  entries: z.array(MePointsHistoryEntrySchema),
  nextCursor: z.string().nullable(),
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
