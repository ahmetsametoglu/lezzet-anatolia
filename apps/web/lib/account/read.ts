import 'server-only';
import { AddressService, CartService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import type { Address, CartItem, CompanyInfo, PointsEntry, PreferredLanguage } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import type { CartEntry, CartLine } from '@/lib/cart/cart-types';
import { getPointsBalance, listPointsHistory } from '@/lib/feedback/points';
import { POINTS_CENT_VALUE_KEY, POINTS_REDEEM_MIN_KEY } from '@/lib/settings-keys';

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
  } | null;
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
  const savedView = await getCartView(locale, cart.savedItems.map(toEntry), { customerId });

  const points = company ? null : await readPoints(db, customerId);

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
    saved: savedView.lines,
    zoneNotices,
  };
}

/**
 * Bekleyen bölge haberi kayıtları. Kendi servisi YOK ve gerekmiyor: `zone_notice` tek kolonluk bir
 * bekleme listesi, üzerinde iş kuralı taşımıyor — bir servis sınıfı burada yalnız bir katman olurdu.
 * Yazma tarafı da aynı biçimde doğrudan yazıyor (`lib/delivery/notice-actions.ts`).
 *
 * Ziyaretçinin kaydı da olabilir (hesap zorunlu değil, oturumsuz kayıt yalnız e-postayla durur);
 * burada YALNIZ müşteriye bağlı olanlar okunur — kimlik oturumdan gelir.
 */
async function readZoneNotices(db: ReturnType<typeof serviceDb>, customerId: string): Promise<{ postalCode: string }[]> {
  const { data, error } = await db.from('zone_notice').select('postal_code').eq('customer_id', customerId).order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({ postalCode: row.postal_code as string }));
}

/**
 * Puan bölümü — bakiye, son hareketler ve çevirme kuralı. **Yalnız B2C'de çağrılır**: B2B'de
 * sonucu hiç çizilmeyecek üç sorgu atmanın anlamı yok.
 */
async function readPoints(db: ReturnType<typeof serviceDb>, customerId: string): Promise<NonNullable<AccountView['points']>> {
  const settings = new SettingsService(db);
  const [balance, history, minimumPoints, centValue] = await Promise.all([
    getPointsBalance(customerId),
    // Dökümün ilk sayfası yeter: tasarım "son kazanımlar" diyor, tam geçmiş değil.
    listPointsHistory(customerId, undefined, POINTS_HISTORY_SIZE),
    settings.getNumber(POINTS_REDEEM_MIN_KEY, 500),
    settings.getNumber(POINTS_CENT_VALUE_KEY, 1),
  ]);
  return {
    balance: balance.balance,
    history: history.rows,
    redeem: { minimumPoints, valueCents: minimumPoints * centValue },
  };
}

/**
 * Saklanan satır → niyet. Tür ALANDAN değil kendi bayrağından okunur: `bundleId` doluluğu bir
 * `string` kontrolüdür ve TypeScript onunla daraltma yapamaz (`CartEntry` notu).
 */
function toEntry(item: CartItem): CartEntry {
  return item.bundleId
    ? { kind: 'bundle', bundleId: item.bundleId, qty: item.qty }
    : { kind: 'variant', variantId: item.variantId ?? '', qty: item.qty, stockId: item.stockId ?? null };
}

/** Tasarımın "Son kazanımlar" listesi dört satır gösteriyor; tam döküm ayrı bir ekranın işi. */
const POINTS_HISTORY_SIZE = 4;
