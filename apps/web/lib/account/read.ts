import 'server-only';
import { AddressService, CartService, UserProfileService, serviceDb } from '@lezzet/database';
import type { Address, CartItem, CompanyInfo, PointsEntry, PreferredLanguage } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import type { CartEntry, CartLine } from '@/lib/cart/cart-types';
import { getPointsBalance, listPointsHistory } from '@/lib/feedback/points';

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
  points: { balance: number; history: PointsEntry[] } | null;
  /** "Sonraya kaydedilenler" — sepetteki listeyle AYNI veri, ikinci bir yer yok. */
  saved: CartLine[];
}

export async function getAccountView(locale: Locale, customerId: string): Promise<AccountView | null> {
  const db = serviceDb();
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return null;

  const company = profile.companyInfo ?? null;
  const [addresses, cart] = await Promise.all([
    new AddressService(db).listByCustomer(customerId),
    new CartService(db).get(customerId),
  ]);

  // Kaydedilenler sepetin kendi okumasıyla çözülür: ad, görsel, fiyat ve "bölge içi mi" bilgisi
  // orada zaten hesaplanıyor. İkinci bir çözüm yazmak, aynı satırın iki görünümü demekti.
  const savedView = await getCartView(locale, cart.savedItems.map(toEntry), { customerId });

  const points = company
    ? null
    : {
        balance: (await getPointsBalance(customerId)).balance,
        // Dökümün ilk sayfası yeter: tasarım "son kazanımlar" diyor, tam geçmiş değil.
        history: (await listPointsHistory(customerId, undefined, POINTS_HISTORY_SIZE)).rows,
      };

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
