import { DiscountCodeService, DiscountService, PointsEntryService, SettingsService, UserProfileService } from '@lezzet/database';
import {
  NEIGHBOR_INVITE_MAX_USES,
  POINTS_CENT_VALUE_KEY,
  POINTS_REDEEM_MAX_DEFAULT,
  POINTS_REDEEM_MAX_KEY,
  POINTS_REDEEM_MIN_KEY,
  POINTS_SETTING_KEYS,
  anchorStateOf,
  canOpenHistory,
  canRedeem,
  nextRedemption,
  redemptionCode,
} from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { CompanyInfo, CustomerType, KeysetCursor, MePointsEarnWayKey, PointsEntry } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPointsBalance } from '../feedback/points';
import { readPendingNeighborAwards, type PendingNeighborAward } from './neighbor';
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

/** Puan kazanma yolu: anahtar ve puan; anahtar tipi sözleşmeden gelir ki yeni yol eklendiğinde iki liste ayrışmasın. */
export interface CustomerEarnWay {
  key: MePointsEarnWayKey;
  /** Ayardan okunan değer; sıfır ya da okunamayan yol listeye HİÇ girmez (bkz. `readEarnWays`). */
  points: number;
}

/** Programın kimlikten bağımsız kuralları; misafir onboarding de okuduğu için karttan ayrı durur, kart bunu genişletir. */
export interface CustomerPointsRules {
  /** `minimumPoints` puan = `valueCents` cent; tek kupon en fazla `maximumPoints`. Hepsi ayardan. */
  redeem: { minimumPoints: number; maximumPoints: number; valueCents: number };
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
  /** Düğmeye basılınca çevrilecek puan ve karşılığı; ekran hesaplamaz, çünkü tavan ve eşik motorun kuralıdır. */
  nextRedeem: { points: number; valueCents: number };
  /** Davet kodu — kart varsa GARANTİLİ (yoksa üretilir); `null` yalnız üretim başarısızsa. */
  referralCode: string | null;
  /** Kodun paylaşılabilir tam adresi; sunucu kurar, çünkü her yüzey kendi kursaydı rota adı değiştiği gün davetler kırılırdı. */
  inviteUrl: string | null;
  /** Ödemesi bekleyen komşu ödülleri; puan değeri `earnWays`te durur, burada yalnız olay taşınır ki iki kopya ayrışmasın. */
  pendingNeighborAwards: PendingNeighborAward[];
  /** Bugünkü ziyaret puanı alındı mı; kimliğe bağlı olduğu için misafirin de gördüğü kurallarda değil kartta durur. */
  visitClaimedToday: boolean;
}

export interface CustomerPointsView {
  /** `null` = B2B, yani program dışı. SIFIR DEĞİL: kazanılamayan bakiye boş bir hedef gibi durur. */
  points: CustomerPointsCard | null;
  coupons: CustomerCoupon[];
}

/**
 * Başarıda güncel cüzdan döner; `code` ayrıca taşınır ki ekran yeni kuponu listeyi karşılaştırmadan söyleyebilsin. `code:
 * null` yalnız RPC kod döndürmezse olur ve ekran o hâlde bildirimi hiç göstermez.
 */
export type RedeemCustomerPointsOutcome =
  | { status: 'ok'; view: CustomerPointsView; code: string | null }
  /** Kimlik çapası yok; puanı harcatmak "seni tanıyorum" demektir ve yanlış kişiye söylenirse geri alınamaz. */
  | { status: 'insufficient_balance' | 'below_minimum' | 'not_eligible' | 'anchor_required' };

/**
 * Program dışı mı: `type` ile `companyInfo`dan hangisi B2B derse kart çizilmez, çünkü iki ölçüt ayrışabiliyor ve kart
 * motorun kararından cömert olursa müşteri reddedilecek düğmeye basar.
 */
function isOutsideProgram(type: CustomerType, companyInfo: CompanyInfo | null): boolean {
  return type === 'company' || companyInfo !== null;
}

/** Çevirme eşiği — tek yerde okunur; kart da çevirme kapısı da AYNI sayıyı görür. */
async function redeemSettings(db: SupabaseClient): Promise<{ minimum: number; maximum: number; centValue: number }> {
  const settings = new SettingsService(db);
  const [minimum, maximum, centValue] = await Promise.all([
    settings.getNumber(POINTS_REDEEM_MIN_KEY, 500),
    settings.getNumber(POINTS_REDEEM_MAX_KEY, POINTS_REDEEM_MAX_DEFAULT),
    settings.getNumber(POINTS_CENT_VALUE_KEY, 1),
  ]);
  return { minimum, maximum, centValue };
}

/**
 * Gösterilecek kazanma yolları, ödül merdiveninin en yüksek basamağından en düşüğüne; müşteri "en çok ne kazandırır"
 * sorusunun cevabını sıradan okur. Sıra elle yazılı ve sunucudan gelir ki bir ayar değişince anlatım düzeni sessizce başkalaşmasın.
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
 * Kazanma yollarının ayardaki değerleri; okunamayan ya da sıfır değerli yol listeye girmez, çünkü kart motorun vereceğinden
 * fazlasını vaat etmemeli. Varsayılan yok: aynı sayının üçüncü kopyası bir gün ayrışırdı.
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

/** Programın kimliksiz kuralları; misafir onboarding okur, kart da bu kapıyı çağırır ki iki okuma ayrışmasın. */
export async function readPointsRules(db: SupabaseClient): Promise<CustomerPointsRules> {
  const [settings, earnWays] = await Promise.all([redeemSettings(db), readEarnWays(db, null)]);
  return {
    redeem: { minimumPoints: settings.minimum, maximumPoints: settings.maximum, valueCents: settings.minimum * settings.centValue },
    centValue: settings.centValue,
    // Ayardan DEĞİL motordan: sınır davet satırına yazılıyor, ayarlar tablosunda karşılığı yok
    // (`NEIGHBOR_INVITE_MAX_USES` künyesi — davetin sözü doğduğu gün donuyor).
    neighborMaxUses: NEIGHBOR_INVITE_MAX_USES,
    earnWays,
  };
}

/**
 * Hesap ekranının puan bölümü tek turda. Okuma davet kodu yoksa üretir: kod olmadan "arkadaşını davet et" düğmesi hiçbir
 * şey paylaşamazdı; yazım idempotent ve B2B'de hiç koşmaz.
 */
export async function readCustomerPoints(db: SupabaseClient, customerId: string): Promise<CustomerPointsView> {
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile || isOutsideProgram(profile.type, profile.companyInfo)) return { points: null, coupons: [] };

  const [balance, rules, coupons, referralCode, pendingNeighborAwards, visitEarnedToday] = await Promise.all([
    getPointsBalance(db, customerId),
    // Kural kapısı KOPYALANMIYOR, çağrılıyor: kartın gösterdiği yollar ile misafirin onboarding'de
    // gördüğü yollar bir gün ayrışırsa ikisi de "doğru" görünür ve fark edilmez.
    readPointsRules(db),
    listCustomerCoupons(db, customerId),
    // Kod ZATEN varsa kapı hiç çağrılmaz: `ensureCustomerReferralCode` profili yeniden okuyor ve o
    // tur her puan okumasında boşuna atılırdı — elimizdeki satır aynı cevabı taşıyor. Kapı yine de
    // kimliği alır (profili değil): üretim yolunda tek doğrulanmış kaynak vardır, o da DB satırı.
    profile.referralCode ?? ensureCustomerReferralCode(db, customerId),
    // "Puan yolda" (★ karar 3): komşu sipariş verdi, parası henüz alınmadı. Kartın İÇİNDE çünkü
    // program dışı profilde anlamı yok — yukarıdaki erken `return` ikisini birden düşürüyor.
    readPendingNeighborAwards(db, customerId),
    /* BUGÜNKÜ ZİYARET PUANI (MB-54) — sayı değil VARLIK sorusu; `earnedToday` işletme gününü
       (Europe/Paris) kısıtla ve günlük tavanla AYNI tanımdan okuyor. İkinci bir "bugün" tanımı
       yazmak, ekranın "alındı" dediği anla motorun yeni günü açtığı anın ayrışması demekti —
       yazın Paris'te 00:00–02:00 arasında görünür, hiçbir yerde hata vermez. */
    new PointsEntryService(db).earnedToday(customerId, ['visit']),
  ]);

  return {
    points: {
      ...rules,
      balance: balance.balance,
      nextRedeem: nextRedemption({
        balance: balance.balance,
        minimum: rules.redeem.minimumPoints,
        maximum: rules.redeem.maximumPoints,
        centValue: rules.centValue,
      }),
      referralCode,
      // Adres kodun yanında doğuyor: kod `null`sa (üretim çakışması) paylaşılacak bağ da yoktur —
      // "bu bağlantıyı paylaş" deyip boş bir adres vermek, çalışmayan bir düğme göstermektir.
      inviteUrl: referralCode ? inviteUrl(referralCode, profile.preferredLanguage) : null,
      pendingNeighborAwards,
      // Puan POZİTİF yazılır (`canEarnPoints` sıfır değerli aksiyonu reddediyor), yani "bugün
      // kazanılan ziyaret puanı > 0" ile "satır var" aynı şey.
      visitClaimedToday: visitEarnedToday > 0,
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
  // Aktiflik ve tarih süzgeci sorguda, çünkü kullanılmış kuponlar kümede kalır ve tavan onlarla dolup kullanılabilir kuponu
  // gizlerdi. Kota elemesi aşağıda, çünkü iptal/iade kuralı `usageCounts`ta ve SQL'e ikinci kez yazılsa ayrışırdı.
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
 * Puanı kişisel kupona çevirir; karar motorda, puan düşümü ile kuponun doğuşu tek RPC'de ve müşteri başına sıralı ki aynı
 * puan iki kez harcanmasın. Kod çakışırsa yeni kodla üç kez denenir.
 */
export async function redeemCustomerPoints(db: SupabaseClient, input: { customerId: string }): Promise<RedeemCustomerPointsOutcome> {
  const [profile, balance, settings] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    getPointsBalance(db, input.customerId),
    redeemSettings(db),
  ]);
  if (!profile) return { status: 'not_eligible' };

  // Puanı harcatmak kapılı yetkidir ve kural puanın kendisine ait, bu yüzden kapı burada. Bekleyen WhatsApp kimlik sorusu
  // okunmaz: oturum açmış müşteri kimliğini posta koduyla kanıtlamıştır, daha güçlü kanıt daha zayıfına yenilmemeli.
  if (!canOpenHistory(anchorStateOf(profile))) return { status: 'anchor_required' };

  const check = canRedeem({
    customerType: profile.type,
    balance: balance.balance,
    minimum: settings.minimum,
    maximum: settings.maximum,
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
 * Puan geçmişinin bir sayfası, yeniden eskiye ve keyset imleçli; defter sınırsız büyüdüğü için ekran sonsuz kaydırır.
 * Program dışı profil boş sayfa değil adlı ret alır, çünkü "hareket yok" ile "program size açık değil" ayrı cümlelerdir.
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
