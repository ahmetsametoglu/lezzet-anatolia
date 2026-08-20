import 'server-only';
import { AddressService, CartService, UserProfileService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import type { Address, CompanyInfo, PointsEntry, PreferredLanguage } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import { entryOfItem, type CartLine } from '@/lib/cart/cart-types';
// Kupon köprüsü (`./coupons`) 20.08'de söküldü: kupon da puan kartıyla AYNI kapıdan geliyor
// (`readCustomerPoints`), ayrı bir okuma kapısı çağrılmıyordu ve ölü koddu (knip).
import { readCustomerPoints, type CustomerCoupon, type PendingNeighborAward } from '@lezzet/application';
import { listPointsHistory } from '@/lib/feedback/points';

/**
 * Hesap sayfasının TEK okuma kapısı (08.5).
 *
 * **Kanal saklanmaz, TÜRETİLİR** (`user_profiles` notu): şirket künyesi doluysa profil B2B'dir.
 * Tasarımın kuralı da buna bağlı — B2C'de şirket bölümü, B2B'de puan/kupon bölümü **DOM'da hiç
 * yoktur**; gri gösterilmez, gizlenmez, hiç doğmaz.
 *
 * **Puan yalnız B2C'de okunur.** B2B için sorgu atmak, sonucu hiç çizilmeyecek bir veriyi
 * getirmekti; üstelik oyunlaştırma B2C-only bir karardır (DOMAIN §14).
 */
export interface AccountView {
  profile: {
    name: string;
    email: string | null;
    phone: string | null;
    preferredLanguage: PreferredLanguage;
  };
  /** Doluysa profil B2B — puan/kupon bölümleri hiç çizilmez, şirket bölümü çizilir. */
  company: CompanyInfo | null;
  addresses: Address[];
  /** Kampanya izinleri; kanal başına "verildi mi". Sipariş bildirimleri bundan BAĞIMSIZDIR. */
  consent: { email: boolean; whatsapp: boolean };
  points: {
    balance: number;
    history: PointsEntry[];
    /**
     * Kupona çevirme kuralı AYARDAN gelir, ekrana gömülmez: ekranın söylediği eşik ile motorun
     * uyguladığı eşik ayrıştığında müşteri reddedilecek bir düğmeye basar (29.07 denetimi).
     */
    redeem: { minimumPoints: number; valueCents: number };
    /**
     * Komşu sipariş verdi ama parası henüz alınmadı — ödül `paid` geçişinde doğacak (★ karar 3,
     * 21.73'ün web yarısı). Deftere KARIŞMAZ: defter "ne oldu"yu tutar, bu "ne olacak"tır;
     * ekranda geçmişin ÜSTÜNDE ayrı blok olarak durur. Okuma application'dan (tek kaynak).
     */
    pendingNeighborAwards: PendingNeighborAward[];
    /**
     * Bir komşu ödülünün puan değeri — `earnWays`ten (kural kapısı KOPYALANMAZ, çağrılır).
     * `null` = kural okunamadı; blok o hâlde hiç çizilmez — bilinmeyen sayıyla söz verilmez.
     */
    neighborPoints: number | null;
    /**
     * Davet bağlantısı (20.08 — native hesabın web'de olmayan bloğu). Adresi EKRAN KURMAZ,
     * application verir (`inviteUrl` künyesi: üç yüzey kendi adresini kursaydı rota adı değişince
     * ikisi sessizce 404'e düşerdi). `null` = kod üretilemedi; blok hiç çizilmez.
     */
    inviteUrl: string | null;
    /** Davet ödülünün puan değeri — `neighborPoints` ile aynı kural: `null` ise söz verilmez. */
    referralPoints: number | null;
  } | null;
  /**
   * Kullanılabilir kişisel kuponlar (17.5). B2B'de her zaman boş — puanla aynı koşula bağlı.
   * Liste sayfalanmaz: tek kullanımlık kuponların doğal tavanı var, sınırsız büyüyen bir küme değil.
   */
  coupons: CustomerCoupon[];
  /** "Sonraya kaydedilenler" — sepetteki listeyle AYNI veri, ikinci bir yer yok. */
  saved: CartLine[];
  /**
   * Bekleyen bölge haberi kayıtları (0030) — "şu posta koduna gelince haber ver".
   *
   * Pazarlama izinlerinden BAĞIMSIZ ve o anahtarlarla karışmaz (tasarımın sözleşmesi): biri
   * "bana kampanya yaz", bu ise tek seferlik bir bekleyiş. Ekranda kendi bloğunda durur ve tek
   * eylemi vazgeçmektir.
   */
  zoneNotices: { postalCode: string }[];
}

export async function getAccountView(locale: Locale, customerId: string): Promise<AccountView | null> {
  const db = serviceDb();
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return null;

  const company = profile.companyInfo ?? null;
  const [addresses, cart, zoneNotices] = await Promise.all([
    new AddressService(db).listByCustomer(customerId),
    new CartService(db).get(customerId),
    readZoneNotices(db, customerId),
  ]);

  // Kaydedilenler sepetin kendi okumasıyla çözülür: ad, görsel, fiyat ve "bölge içi mi" bilgisi
  // orada zaten hesaplanıyor. İkinci bir çözüm yazmak, aynı satırın iki görünümü demekti.
  const savedView = await getCartView(locale, cart.savedItems.map(entryOfItem), { customerId });

  // Puan ve kupon AYNI koşula bağlı: B2B'de ikisi de yok (tasarım — "B2B'de puan/kupon bölümü
  // DOM'da hiç yoktur"). İkisi TEK kapıdan gelir (`readCustomerPoints` — 20.08'de buraya geçildi:
  // eski `readPoints` aynı beş sorguyu parça parça atıyordu ve davet kodunu hiç getirmiyordu;
  // native ile web'in kartı böylece aynı kaynaktan doğuyor).
  const [points, coupons] = company ? [null, [] as CustomerCoupon[]] : await readPointsAndCoupons(db, customerId);

  return {
    profile: {
      name: profile.name,
      email: profile.email ?? null,
      phone: profile.phone,
      preferredLanguage: profile.preferredLanguage,
    },
    company,
    addresses,
    consent: {
      email: Boolean(profile.marketingConsent?.email?.granted),
      whatsapp: Boolean(profile.marketingConsent?.whatsapp?.granted),
    },
    points,
    coupons,
    saved: savedView.lines,
    zoneNotices,
  };
}

/**
 * Bekleyen bölge haberi kayıtları.
 *
 * Eskiden burada ham `db.from('zone_notice')` vardı ve künyesi *"kendi servisi gerekmiyor, iş
 * kuralı taşımıyor"* diyordu. Gerekçe eksikti (denetim A4): mesele iş kuralı değil **sözleşme** —
 * ham okuma `postal_code`'u elle `as string` diye çeviriyordu, yani kolon adı değişse derleyici
 * değil çalışma zamanı haber verirdi (`STACK §6`).
 *
 * Ziyaretçinin kaydı da olabilir (hesap zorunlu değil); burada YALNIZ müşteriye bağlı olanlar
 * okunur — kimlik oturumdan gelir.
 */
async function readZoneNotices(db: ReturnType<typeof serviceDb>, customerId: string): Promise<{ postalCode: string }[]> {
  const rows = await new ZoneNoticeService(db).listForCustomer(customerId);
  return rows.map((row) => ({ postalCode: row.postalCode }));
}

/**
 * Puan bölümü + kuponlar — **yalnız B2C'de çağrılır**: B2B'de sonucu hiç çizilmeyecek sorgular
 * atmanın anlamı yok. Kart application'dan gelir (bakiye, eşik, kupon, davet kodu/adresi, kazanma
 * yolları TEK turda); web yalnız "son kazanımlar" dökümünü ekler.
 */
async function readPointsAndCoupons(
  db: ReturnType<typeof serviceDb>,
  customerId: string,
): Promise<[AccountView['points'], CustomerCoupon[]]> {
  const [view, history] = await Promise.all([
    readCustomerPoints(db, customerId),
    // Dökümün ilk sayfası yeter: tasarım "son kazanımlar" diyor; tam geçmiş `/account/points`ta.
    listPointsHistory(customerId, undefined, POINTS_HISTORY_SIZE),
  ]);
  const card = view.points;
  if (!card) return [null, view.coupons];
  return [
    {
      balance: card.balance,
      history: history.rows,
      redeem: card.redeem,
      pendingNeighborAwards: card.pendingNeighborAwards,
      neighborPoints: card.earnWays.find((way) => way.key === 'neighbor')?.points ?? null,
      inviteUrl: card.inviteUrl,
      referralPoints: card.earnWays.find((way) => way.key === 'referral')?.points ?? null,
    },
    view.coupons,
  ];
}

/** Tasarımın "Son kazanımlar" listesi dört satır gösteriyor; tam döküm ayrı bir ekranın işi. */
const POINTS_HISTORY_SIZE = 4;
