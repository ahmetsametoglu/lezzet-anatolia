import { DiscountCodeService, DiscountService, PointsEntryService, SettingsService, UserProfileService } from '@lezzet/database';
import {
  NEIGHBOR_INVITE_MAX_USES,
  POINTS_CENT_VALUE_KEY,
  POINTS_REDEEM_MIN_KEY,
  POINTS_SETTING_KEYS,
  canRedeem,
  redemptionCode,
} from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { CompanyInfo, CustomerType, KeysetCursor, MePointsEarnWayKey, PointsEntry } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPointsBalance } from '../feedback/points';
import { ensureCustomerReferralCode, inviteUrl } from './referral';

/*
  MÜŞTERİ PUAN CÜZDANI — bakiye + çevirme eşiği + kullanılabilir kuponlar + puan→kupon çevirme
  (21.17). Web'de İKİ dosyada duran kuralın TERFİSİ (kopya değil, CLAUDE §1):
  `apps/web/lib/account/coupons.ts` (kullanılabilirlik süzgeci) ve `apps/web/lib/feedback/points.ts`
  (`redeemPoints` + eşik okuması). Ölçüt karşılandı: aynı kuralları artık iki yüzey istiyor (web
  hesap sayfası + mobil `vHesap` puan kartı). Web dosyaları bugün kendi ekranlarını besliyor
  (KÖPRÜ); benimsemesi web şeridinin işi.

  ── NEDEN `feedback/points.ts` DEĞİL DE BURASI ──────────────────────────────────────────────
  O dosya puanın YAZIM çekirdeğidir (kazanım: yorum, sipariş, ziyaret, getiren) ve künyesi kupon
  çevrimini "bugün tek yüzeyi var, ikinci yüzeyi doğduğu gün AYNI yoldan taşınır" diye bilerek
  dışarıda bırakmıştı. O gün geldi — ama çevirme bir geri bildirim aksiyonu değil, müşterinin
  cüzdan hareketidir: tetikleyeni hesap ekranıdır, geri bildirim akışı değil. Bakiye okuması
  ikisinin ORTAK zeminidir ve kopyalanmıyor: `getPointsBalance` oradan çağrılıyor.

  Web'den ölçülen ve BİREBİR korunan kurallar:
  · **Kupon ayrı bir tablo değil**, `customerId`si dolu bir indirim satırıdır; `redeem_points`
    RPC'si onu doğurur. İkinci bir "kupon" varlığı, sepetteki indirim motorunun onu hiç görmemesi
    demekti.
  · **Süzgeç KULLANILABİLİRLİĞE göre, sahipliğe göre değil** — pasif · tarih penceresi dışı · kotası
    dolmuş kupon listeye girmez. Kullanılmış bir kodu göstermek, checkout'ta reddedilecek bir kodu
    vaat etmektir.
  · **Kota sayımı `usageCounts` ile**, `discount_use` satırı elle sayılarak değil: o metot iptal
    edilmiş siparişleri zaten dışlıyor ("iptal hiç olmadı, iade oldu ve döndü") ve o kural burada
    ikinci kez yazılmamalı.
  · **Kodsuz kupon listeye girmez** — ilk kod alınır; kod ayrı varlıktır ve tekliği varsayılmaz.
  · **Puan/kupon B2C'nindir** — B2B'de ikisi de yok (DOMAIN §14). İkisi TEK koşulda çözülür ki bir
    gün biri B2B'ye sızmasın (web `read.ts` künyesindeki gerekçe).
  · **Eşik AYARDAN** (`points_redeem_min` × `points_cent_value`), ekrana gömülmez: ekranın söylediği
    eşik ile motorun uyguladığı eşik ayrıştığında müşteri reddedilecek bir düğmeye basar (29.07).
    Anahtarlar artık `@lezzet/domain-core`da, kazanım anahtarlarının yanında — üç literal kopyaya
    çıkmasın diye.
  · **Kaç puanın harcanacağını İSTEMCİ SÖYLEMEZ** — `canRedeem`e istek geçilmiyor, motor bakiyenin
    tamamını çeviriyor. İstemciden sayı kabul etseydik ekranın gördüğü eşik ile motorun uyguladığı
    eşik ayrışabilirdi (web action künyesindeki aynı karar).
  · **Puan düşümü ile kuponun doğuşu BÖLÜNEMEZ** — ikisi de `redeem_points` RPC'sinin içinde, tek
    transaction ve müşteri başına advisory kilitle. Uygulama katmanı bunu kendi hesaplamaz.

  Sonuç GÖRÜNÜR RETLİ döner (`updateCustomerPreferences` · `addCustomerAddress` emsali) ve başarıda
  GÜNCEL CÜZDANI taşır: çevirme hem bakiyeyi düşürür hem listeye kupon ekler — tek kaydı dönmek
  istemciyi ikinci tura mecbur bırakırdı (sözleşmedeki "aynı zarf" kararı).
*/

/** Kullanılabilir kişisel kupon — şekli sözleşmede (`MeCouponSchema`), kaynağı `discount` satırı. */
export interface CustomerCoupon {
  id: string;
  code: string;
  /** Kuponun değeri (cent) — puan kuponu her zaman tutar indirimidir, yüzde değil. */
  amountCents: number | null;
  percent: number | null;
  /** Asgari sepet koşulu; `null` = koşulsuz. Ekran bunu ancak varsa yazar. */
  minBasketCents: number | null;
  validTo: string | null;
}

/**
 * Puan KAZANMA yolu — anahtar + puan; ekrandaki cümle istemcide (i18n).
 *
 * Anahtar tipi SÖZLEŞMEDEN geliyor (`MePointsEarnWayKey`), burada ikinci kez sıralanmıyor: üç yolun
 * listesi hem burada hem şemada dursaydı, dördüncü yol eklendiğinde biri güncellenir öteki
 * unutulurdu ve sonuç derleme hatası değil, çalışma anında `parse` düşmesi olurdu. Tek liste, tek
 * doğru — sözcük dağarcığının kendisi zaten defterin sebep sözlüğünden türüyor (şemadaki künye).
 */
export interface CustomerEarnWay {
  key: MePointsEarnWayKey;
  /** Ayardan okunan değer; sıfır ya da okunamayan yol listeye HİÇ girmez (bkz. `readEarnWays`). */
  points: number;
}

/**
 * **Programın kuralları — kimlikten BAĞIMSIZ kısım.** Şekli sözleşmede (`PointsRulesSchema`).
 *
 * Ayrı bir tip olmasının sebebi ikinci bir tüketici: onboarding'in puan adımını MİSAFİR görüyor ve
 * o ekranın bakiyesi, kodu, kuponu yok — yalnız "program neyi ne kadar ödüllendirir" sorusu var.
 * Kart bunu `extends` ile alır, kendi içinde ikinci kez saymaz.
 */
export interface CustomerPointsRules {
  /** `minimumPoints` puan = `valueCents` cent. İkisi de ayardan. */
  redeem: { minimumPoints: number; valueCents: number };
  /** Bir puanın CENT karşılığı — bir yolun para değeri `points × centValue`. */
  centValue: number;
  /** Bir komşu davetinden kaç komşu ödül doğurabilir (`NEIGHBOR_INVITE_MAX_USES`). */
  neighborMaxUses: number;
  /** Kazanma yolları ve sırası (bkz. `EARN_WAYS`). */
  earnWays: CustomerEarnWay[];
}

/** Puan kartı — `null` hâli çağıranda değil, `CustomerPointsView.points`ta yaşıyor. */
export interface CustomerPointsCard extends CustomerPointsRules {
  balance: number;
  /** Davet kodu — kart varsa GARANTİLİ (yoksa üretilir); `null` yalnız üretim başarısızsa. */
  referralCode: string | null;
  /**
   * Kodun paylaşılabilir TAM adresi (17.9) — kod varsa GARANTİLİ, yoksa `null`.
   *
   * **Adresi ekran KURMAZ, sunucu verir:** üç yüzey (web hesabı, mobil paylaş sayfası, ileride
   * WhatsApp metni) kendi adresini kursaydı rota adı değiştiği gün ikisi sessizce 404'e düşerdi —
   * `PATHNAMES` künyesinin kendi dersi. Dil PAYLAŞANIN dilidir (`inviteUrl` künyesi).
   */
  inviteUrl: string | null;
}

export interface CustomerPointsView {
  /** `null` = B2B, yani program dışı. SIFIR DEĞİL: kazanılamayan bakiye boş bir hedef gibi durur. */
  points: CustomerPointsCard | null;
  coupons: CustomerCoupon[];
}

/**
 * Başarıda GÜNCEL CÜZDAN döner; yeni kupon zaten `view.coupons` içindedir. `code` ayrıca taşınıyor
 * çünkü ekran "PUAN-7K4M2P hazır" diyebilmeli ve bunu listeyi ESKİSİYLE karşılaştırarak bulmak
 * zorunda kalmamalı. Kuponun kendisi ikinci kez KURULMUYOR — o iş süzgeçten geçmiş listenin.
 * `code: null` yalnız RPC kodu döndürmediğinde (olmaması gereken hâl): uydurma bir kod basmaktansa
 * ekran o bildirimi hiç göstermesin.
 */
export type RedeemCustomerPointsOutcome =
  | { status: 'ok'; view: CustomerPointsView; code: string | null }
  | { status: 'insufficient_balance' | 'below_minimum' | 'not_eligible' };

/**
 * Program dışı mı — **İKİ sinyal de sayılır** ve bu web'in okumasından bilinçli bir SAPMA.
 *
 * Web hesap okuması B2B'yi yalnız `companyInfo`dan türetiyor ("kanal saklanmaz, türetilir"), ama
 * çevirmeye izin veren motor (`canRedeem`) yalnız `type`a bakıyor. İki ölçüt AYRIŞABİLİYOR ve
 * bugün gerçekten ayrışıyor (ölçüldü, yerel veri: `type='company'` + künyesi boş bir profil var).
 * O profilde web bugün puan kartını ÇİZİYOR, düğmeyi gösteriyor, müşteri basıyor ve motor
 * `not_eligible` diyor — ekranın vaat ettiği ile motorun uyguladığı ayrışması, 29.07 denetiminin
 * tam olarak kapattığı arıza sınıfı.
 *
 * Burada birleşim (OR) alınıyor: hangi sinyal B2B derse kart çizilmez. Sonuç motorun kararından
 * ASLA daha cömert olmaz — reddedilecek bir düğme gösterilmez. Ters yön (künyesi dolu ama
 * `type='individual'`) zaten web'in de sakladığı hâl, orada davranış aynen korunuyor.
 *
 * **Bu bir yama, kök çözüm değil:** iki ölçütten hangisinin doğru olduğu bir ürün/veri kararıdır
 * (`type` mi kanonik, `companyInfo` mu) ve rapora açık madde olarak yazıldı. Kararı verilene kadar
 * güvenli taraf budur.
 */
function isOutsideProgram(type: CustomerType, companyInfo: CompanyInfo | null): boolean {
  return type === 'company' || companyInfo !== null;
}

/** Çevirme eşiği — tek yerde okunur; kart da çevirme kapısı da AYNI sayıyı görür. */
async function redeemSettings(db: SupabaseClient): Promise<{ minimum: number; centValue: number }> {
  const settings = new SettingsService(db);
  const [minimum, centValue] = await Promise.all([
    settings.getNumber(POINTS_REDEEM_MIN_KEY, 500),
    settings.getNumber(POINTS_CENT_VALUE_KEY, 1),
  ]);
  return { minimum, centValue };
}

/**
 * **Gösterilecek kazanma yolları ve SIRASI** — ödül merdiveni, en yüksek basamaktan en düşüğe.
 *
 * ── SIRANIN GEREKÇESİ DEĞİŞTİ (kullanıcı kararı 12.08) ──────────────────────
 * Eskiden üç yol vardı ve sıra *"ürün sırası"* diye anlatılıyordu: davet → değerlendirme → keşif.
 * Liste artık ALTI yolu taşıyor ve ikinci bir tüketicisi var — *"nasıl puan kazanırım"* anlatımı.
 * Bir merdiveni basamak sırasına göre dizmemek, okuyana keyfî görünür: müşteri "en çok ne
 * kazandırır" sorusuyla bakıyor ve cevabı listenin KENDİ sırasından okuyabilmeli.
 *
 * Çelişki de yok: değer sırası eski ürün sırasını zaten koruyor (davet 500 → komşu 100 → yorum 20
 * → giriş 10 → beğeni 5 → keşif oyu 2). Değişen şey listenin gerekçesi, dizilişi değil.
 *
 * Sıra sunucudan gelir ki üç yüzey (mobil hesap, onboarding anlatımı, ileride web hesap) aynı
 * hikâyeyi anlatsın; istemcinin kendi sıralaması, aynı programı iki farklı düzende sunmak olurdu.
 * Liste bir DOMAIN kuralı DEĞİL — "hangi aksiyon kaç puan" motorda/ayarda, "hangisini ekranda önce
 * anlatırız" burada; o yüzden `domain-core`a değil bu kapıya yazıldı.
 *
 * **Sıra ELLE yazılı, puana göre `sort` EDİLMİYOR** ve bu bilinçli: bir ayar değiştiğinde listenin
 * anlatım düzeni sessizce başkalaşmamalı. Ayrıca sıfır/okunamayan değerli yol listeye hiç girmiyor
 * (`readEarnWays`), yani sıralanacak sayının var olduğu bile garanti değil.
 */
const EARN_WAYS: readonly MePointsEarnWayKey[] = [
  'referral',
  'neighbor',
  'review',
  'visit',
  'feedback_purchase',
  'feedback_candidate',
];

/**
 * Kazanma yollarının ayardaki değerleri — **okunamayan yol LİSTEYE GİRMEZ.**
 *
 * Varsayılan YOK ve bu bilinçli: aksiyonun kaç puan ettiğinin varsayılanı yazım kapısında yaşıyor
 * (`feedback/points.ts` → `POINTS_DEFAULTS`) ve orası dışa açık değil. Burada ikinci bir tablo
 * açsaydık aynı sayı üçüncü kez yazılmış olurdu (web `pointsSettings` + paket `POINTS_DEFAULTS` +
 * bu) ve üçü bir gün ayrışırdı — ekran, motorun vermeyeceği bir sayı söylerdi (29.07 denetiminin
 * tam olarak kapattığı arıza sınıfı).
 *
 * Bu yüzden ayar satırı YOKSA yol sessizce değil, LOG'la atlanır ve ekran o yolu hiç göstermez.
 * Yön güvenli: motor yine de puanı yazar (varsayılanı var), yani müşteri kazanır ama fazlasını
 * vaat etmiş olmayız — kart hiçbir zaman motordan cömert olmaz (`isOutsideProgram` ile aynı ilke).
 * Sıfır da aynı kapıdan düşer: `canEarnPoints` sıfır değerli aksiyonu `no_value` diye reddediyor,
 * yani "0 puan kazandıran yol" diye bir şey yok (CLAUDE §1: ölçülemeyen değer sıfır değildir).
 */
async function readEarnWays(db: SupabaseClient, customerId: string | null): Promise<CustomerEarnWay[]> {
  const settings = new SettingsService(db);
  const values = await Promise.all(EARN_WAYS.map((key) => settings.get<unknown>(POINTS_SETTING_KEYS[key], null)));

  const ways: CustomerEarnWay[] = [];
  EARN_WAYS.forEach((key, index) => {
    const points = Number(values[index]);
    if (!Number.isFinite(points) || !Number.isInteger(points) || points <= 0) {
      logger.warn(
        // Kimlik YOKSA da uyarı basılır (kural okuması misafire açık): eksik ayar bir müşterinin
        // değil PROGRAMIN arızasıdır ve kimliksiz yolda da görülmelidir.
        { context: 'customer/points', customerId, earnWay: key, settingKey: POINTS_SETTING_KEYS[key] },
        'kazanım puanı ayardan okunamadı — yol ekranda gösterilmiyor',
      );
      return;
    }
    ways.push({ key, points });
  });
  return ways;
}

/**
 * **Programın kuralları — KİMLİKSİZ** (`GET /api/v1/points/rules`, kullanıcı kararı 12.08).
 *
 * Onboarding'in son adımı puanı anlatıyor ve o ekranı gören kişi henüz misafir: bakiyesi yok, davet
 * kodu yok, `/me` ailesine hiç gidemez. Ama söylediği her sayı motorun uyguladığı sayı olmalı — bu
 * kapı tam olarak o ortak zemini verir.
 *
 * Kartla arasında kopya YOK: `readCustomerPoints` bu kapıyı çağırır ve üstüne yalnız kimliğe bağlı
 * olanı (bakiye, kod, adres) ekler. İki ayrı okuma yazsaydık, bir gün biri altı yol öteki üç yol
 * gösterirdi — ve ikisi de "doğru" görünürdü.
 */
export async function readPointsRules(db: SupabaseClient): Promise<CustomerPointsRules> {
  const [settings, earnWays] = await Promise.all([redeemSettings(db), readEarnWays(db, null)]);
  return {
    redeem: { minimumPoints: settings.minimum, valueCents: settings.minimum * settings.centValue },
    centValue: settings.centValue,
    // Ayardan DEĞİL motordan: sınır davet satırına yazılıyor, ayarlar tablosunda karşılığı yok
    // (`NEIGHBOR_INVITE_MAX_USES` künyesi — davetin sözü doğduğu gün donuyor).
    neighborMaxUses: NEIGHBOR_INVITE_MAX_USES,
    earnWays,
  };
}

/**
 * Hesap ekranının puan bölümü — bakiye, eşik, kullanılabilir kuponlar, davet kodu ve kazanma
 * yolları TEK turda.
 *
 * B2B'de sorgu bile atılmaz: sonucu hiç çizilmeyecek bir veriyi getirmek, boşa dolaşmaktır (web'in
 * aynı kısa devresi). Profil yoksa da program dışı sayılır — kimliksiz bir cüzdan yoktur.
 *
 * **Okuma YAZABİLİR ve bu bilinçli:** davet kodu yoksa burada üretilir (`ensureCustomerReferralCode`
 * — web'in tembel üretiminin aynısı). Bir GET'in yan etkisi olması ilk bakışta rahatsız edicidir
 * ama alternatifi daha kötü: ekran "arkadaşını davet et, 50 puan" der, müşteri dokunur ve
 * paylaşılacak kod olmadığı için hiçbir şey olmaz. Yazım İDEMPOTENT (kod bir kez doğar, sonraki her
 * okuma aynısını döndürür) ve yalnız programa dahil profilde çalışır — B2B'de kısa devre yukarıda.
 */
export async function readCustomerPoints(db: SupabaseClient, customerId: string): Promise<CustomerPointsView> {
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile || isOutsideProgram(profile.type, profile.companyInfo)) return { points: null, coupons: [] };

  const [balance, rules, coupons, referralCode] = await Promise.all([
    getPointsBalance(db, customerId),
    // Kural kapısı KOPYALANMIYOR, çağrılıyor: kartın gösterdiği yollar ile misafirin onboarding'de
    // gördüğü yollar bir gün ayrışırsa ikisi de "doğru" görünür ve fark edilmez.
    readPointsRules(db),
    listCustomerCoupons(db, customerId),
    // Kod ZATEN varsa kapı hiç çağrılmaz: `ensureCustomerReferralCode` profili yeniden okuyor ve o
    // tur her puan okumasında boşuna atılırdı — elimizdeki satır aynı cevabı taşıyor. Kapı yine de
    // kimliği alır (profili değil): üretim yolunda tek doğrulanmış kaynak vardır, o da DB satırı.
    profile.referralCode ?? ensureCustomerReferralCode(db, customerId),
  ]);

  return {
    points: {
      ...rules,
      balance: balance.balance,
      referralCode,
      // Adres kodun yanında doğuyor: kod `null`sa (üretim çakışması) paylaşılacak bağ da yoktur —
      // "bu bağlantıyı paylaş" deyip boş bir adres vermek, çalışmayan bir düğme göstermektir.
      inviteUrl: referralCode ? inviteUrl(referralCode, profile.preferredLanguage) : null,
    },
    coupons,
  };
}

/**
 * Müşterinin KULLANILABİLİR kişisel kuponları — üç eleme (pasif · tarih penceresi · kota).
 *
 * Süzgeç "sahibi kim" değil "bugün kullanılabilir mi" sorusunu yanıtlar: ekran "kuponlarım" dese de
 * müşterinin beklediği anlam budur, ve kullanılmış bir kodu listelemek onu checkout'ta hataya
 * göndermektir (web künyesindeki ders).
 */
export async function listCustomerCoupons(db: SupabaseClient, customerId: string): Promise<CustomerCoupon[]> {
  const discounts = new DiscountService(db);
  // ── İKİ ELEME SORGUDA, BİRİ BURADA (08.5 · 09.08) ──────────────────────────
  // Aktiflik ve tarih penceresi burada elle süzülüyordu ve tavan (50) o yüzden "en yeni 50 KUPON"a
  // vuruyordu, "en yeni 50 KULLANILABİLİR kupon"a değil. Kullanılmış kuponlar kümede kalır
  // (silinmez, kapatılır), yani pencere yıllar içinde onlarla dolar ve ekranda kullanılabilir kupon
  // sessizce eksik görünürdü — eksik kupon "yok" gibi okunur, hata vermez.
  //
  // **Kota elemesi AŞAĞIDA kaldı** ve bu bilinçli: `usageCounts` iptal/iade kuralını taşıyan ayrı
  // bir turdur; aynı kuralı SQL'e ikinci kez yazmak bir gün ayrışan iki cevap üretirdi.
  const active = await discounts.listByCustomer(customerId, { usableAt: new Date() });
  if (active.length === 0) return [];

  const ids = active.map((d) => d.id);
  const [usage, codes] = await Promise.all([discounts.usageCounts(ids), new DiscountCodeService(db).listByDiscounts(ids)]);

  return active
    .filter((d) => {
      const used = usage.get(d.id);
      // Kota YOKSA sınırsızdır; `maxUses` null bir eksiklik değil, bilinçli bir "sınırsız".
      if (d.maxUses !== null && (used?.total ?? 0) >= d.maxUses) return false;
      if (d.perCustomerLimit !== null && (used?.byCustomer.get(customerId) ?? 0) >= d.perCustomerLimit) return false;
      return true;
    })
    .flatMap((d) => {
      const code = codes.get(d.id)?.[0]?.code;
      if (!code) return [];
      return [
        {
          id: d.id,
          code,
          amountCents: d.amountCents,
          percent: d.percent,
          minBasketCents: d.minBasketCents,
          validTo: d.validTo,
        },
      ];
    });
}

/**
 * **Puan → kişisel kupon** (17.5). Müşteri kendi isteyince çevirir, otomatik değil: biriken puanı
 * kendiliğinden bozmak, daha büyük bir ödül için biriktirme kararını elinden almaktır (DOMAIN §14).
 *
 * Karar motorda (`canRedeem`), uygulama RPC'de (`redeem_points`): puan düşümü ve kuponun doğuşu
 * bölünemez ve müşteri başına serileştirilir — iki eşzamanlı çevirme aynı puanı iki kez harcayamaz.
 *
 * Kod motorda üretilir, benzersizliği veritabanı söyler. Çakışma astronomik ölçüde nadirdir (26^6)
 * ama imkânsız değil: çarpışmada yeni kodla yeniden denenir (`generateReferenceNo` ile aynı
 * sözleşme). Üç denemeden sonra ısrar etmenin anlamı yok — ortada başka bir sorun vardır.
 */
export async function redeemCustomerPoints(db: SupabaseClient, input: { customerId: string }): Promise<RedeemCustomerPointsOutcome> {
  const [profile, balance, settings] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    getPointsBalance(db, input.customerId),
    redeemSettings(db),
  ]);
  if (!profile) return { status: 'not_eligible' };

  const check = canRedeem({
    customerType: profile.type,
    balance: balance.balance,
    minimum: settings.minimum,
    centValue: settings.centValue,
  });
  if (!check.allowed) {
    // `b2b` dışarı motor sözlüğüyle sızmaz: müşteri "programa dahil değilsiniz" cümlesini görür.
    return { status: check.reason === 'b2b' ? 'not_eligible' : check.reason };
  }

  const entries = new PointsEntryService(db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await entries.redeem({
        customerId: input.customerId,
        points: check.pointsSpent,
        valueCents: check.valueCents,
        minimum: settings.minimum,
        code: redemptionCode(),
      });

      // RPC'nin `ok:false`u bir ARIZA değil, motorun cevabı — yukarıdaki `canRedeem` ile bu çağrı
      // arasında başka bir çevirme araya girmiş olabilir (advisory kilit transaction'ın İÇİNDE,
      // öncesinde değil). Son sözü veritabanı söyler: bakiyeyi orada sayıyor.
      if (!result.ok) return { status: result.reason ?? 'not_eligible' };

      // Cüzdan çevirmeden SONRA okunur: bakiye düştü ve listeye yeni kupon girdi. Kuponu elle
      // kurmuyoruz — listedeki satır süzgeçten geçmiş hâlidir, ikinci bir kurulum aynı kuponu iki
      // farklı şekilde tarif etme riskidir.
      return { status: 'ok', view: await readCustomerPoints(db, input.customerId), code: result.code ?? null };
    } catch (err) {
      if ((err as { code?: string }).code !== '23505') throw err; // unique ihlali değilse bizim sorunumuz değil
    }
  }

  throw new Error('redeemCustomerPoints: benzersiz kupon kodu üretilemedi');
}

/**
 * **Puan geçmişinin bir sayfası** (kullanıcı isteği 15.08) — *"hangi puan nereden geldi."*
 *
 * ── NEDEN ŞİMDİ TERFİ ETTİ ──────────────────────────────────────────────────
 * `feedback/points.ts` künyesi puan geçmişi okumalarını BİLEREK dışarıda bırakmıştı: *"bugün tek
 * yüzeyleri var (web hesap sayfası · operasyon); ikinci yüzeyleri doğduğu gün AYNI yoldan buraya
 * taşınırlar."* Doğdu — native hesap ekranı istiyor. Söz gereğince taşındı, kopyalanmadı.
 *
 * ── SIRA VE İMLEÇ SERVİSİN ──────────────────────────────────────────────────
 * `listByCustomer` yeniden eskiye sıralı ve keyset imleçli (`points.service.ts`); burada ikinci bir
 * sıralama ya da elle bir pencere KURULMAZ. Defter veriyle sınırsız büyüyen bir küme (CLAUDE §1) ve
 * sayfalayan okumanın tüketeni de var: ekran `nextCursor`ı sonsuz kaydırmada harcıyor.
 *
 * ── B2B ADLI RETLE DÜŞER, BOŞ SAYFAYLA DEĞİL ────────────────────────────────
 * Program dışı profile boş bir sayfa dönmek *"hiç hareketiniz yok"* demektir; doğrusu *"bu program
 * size açık değil"* (`CLAUDE §1`: ölçülemeyen değer sıfır değildir — kartın `points: null` dönmesiyle
 * aynı karar). Ölçüt de kartınkiyle AYNI kapıdan geçiyor (`isOutsideProgram`), ikinci bir tanım
 * yazılmadı: iki koşuldan biri bir gün ötekinden ayrılırsa müşteri kartı göremediği hâlde geçmişi
 * görebilirdi.
 */
export type ReadPointsHistoryOutcome =
  | { status: 'ok'; entries: PointsEntry[]; nextCursor: KeysetCursor | null }
  | { status: 'not_eligible' };

export async function readCustomerPointsHistory(
  db: SupabaseClient,
  input: { customerId: string; cursor?: KeysetCursor; limit?: number },
): Promise<ReadPointsHistoryOutcome> {
  const profile = await new UserProfileService(db).getById(input.customerId);
  if (!profile || isOutsideProgram(profile.type, profile.companyInfo)) return { status: 'not_eligible' };

  const page = await new PointsEntryService(db).listByCustomer(input.customerId, input.cursor, input.limit);
  return { status: 'ok', entries: page.rows, nextCursor: page.nextCursor };
}
