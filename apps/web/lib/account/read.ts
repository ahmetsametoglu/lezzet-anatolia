import 'server-only';
import { AddressService, CartService, ConversationService, CustomerPhoneService, UserProfileService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import type { Address, CompanyInfo, ConversationSource, PointsEntry, PreferredLanguage } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import { entryOfItem, type CartLine } from '@/lib/cart/cart-types';
import { readCustomerPoints, type CustomerCoupon, type CustomerPointsRules, type PendingNeighborAward } from '@lezzet/application';
import { listPointsHistory } from '@/lib/feedback/points';

/**
 * Hesap sayfasının tek okuma kapısı; kanal saklanmaz, şirket künyesinden türer. Puan yalnız B2C'de okunur, çünkü B2B'de hiç
 * çizilmeyecek veriyi getirmek boşa sorgudur.
 */
/**
 * `since` bağlanma anı, yoksa sohbetin açılışı: WhatsApp sohbeti müşterisiyle doğar ve ayrıca bağlanmaz.
 */
export interface LinkedChat {
  id: string;
  source: ConversationSource;
  since: string;
}

export interface AccountView {
  profile: {
    name: string;
    email: string | null;
    /**
     * İletişim numarası, kimlik anahtarı değil: doğrulanmamış serbest metindir ve yeni adres formuna öneri olur. Kimlik
     * `whatsappNumbers`ta ayrı durur, çünkü tek kutuda müşteri kurye numarasıyla WhatsApp kimliğini aynı sanıyor.
     */
    phone: string | null;
    preferredLanguage: PreferredLanguage;
  };
  /**
   * Doğrulanmış WhatsApp numaraları; boş dizi hiç kanıt yok demektir. Salt okunurdur, çünkü elle yazılabilen satır kanıt olmaktan
   * çıkar.
   */
  whatsappNumbers: string[];
  /** Doluysa profil B2B — puan/kupon bölümleri hiç çizilmez, şirket bölümü çizilir. */
  company: (CompanyInfo & { vatNumber: string | null }) | null;
  addresses: Address[];
  /** Bu hesaba bağlı sohbetler, en yeni bağ başta. Salt okunur, çünkü bağı çözmek bir birleştirme kararıdır. */
  chats: LinkedChat[];
  /** Kampanya izinleri; kanal başına "verildi mi". Sipariş bildirimleri bundan BAĞIMSIZDIR. */
  consent: { email: boolean; whatsapp: boolean };
  points: {
    balance: number;
    history: PointsEntry[];
    /** Kural ayardan gelir, çünkü ekranın eşiği motorunkinden ayrışırsa müşteri reddedilecek düğmeye basar. */
    redeem: { minimumPoints: number; valueCents: number };
    /** Kazanma yolları ve para karşılıkları; telefon kartı native'in kazanma listesini bunlarla çizer. */
    earnWays: CustomerPointsRules['earnWays'];
    centValue: number;
    neighborMaxUses: number;
    visitClaimedToday: boolean;
    /** Ödemesi bekleyen komşu ödülleri; deftere karışmaz, çünkü defter olanı, bu olacak olanı tutar. */
    pendingNeighborAwards: PendingNeighborAward[];
    /** Komşu ödülünün puanı; `null` ise kural okunamamıştır ve blok çizilmez, çünkü bilinmeyen sayıyla söz verilmez. */
    neighborPoints: number | null;
    /**
     * Davet bağlantısı; adresi application verir, çünkü her yüzey kendi kursa rota adı değişince davetler sessizce kırılır. `null`
     * ise kod üretilememiştir ve blok çizilmez.
     */
    inviteUrl: string | null;
    /** Davet kodu; telefonda okunup söylendiği için gösterilir, paylaşılan yine bağlantıdır. */
    referralCode: string | null;
    /** Davet ödülünün puan değeri — `neighborPoints` ile aynı kural: `null` ise söz verilmez. */
    referralPoints: number | null;
  } | null;
  /** Kullanılabilir kişisel kuponlar; B2B'de her zaman boş. Sayfalanmaz, çünkü tek kullanımlık kuponların doğal tavanı var. */
  coupons: CustomerCoupon[];
  /** "Sonraya kaydedilenler" — sepetteki listeyle AYNI veri, ikinci bir yer yok. */
  saved: CartLine[];
  /**
   * Bekleyen bölge haberi kayıtları. Pazarlama izinlerinden bağımsızdır, çünkü biri kampanya izni, bu tek seferlik bir bekleyiştir.
   */
  zoneNotices: { postalCode: string }[];
}

export async function getAccountView(locale: Locale, customerId: string): Promise<AccountView | null> {
  const db = serviceDb();
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return null;

  // KDV numarası künyede değil profilin kendi sütununda; kart ikisini birlikte yazar.
  const company = profile.companyInfo ? { ...profile.companyInfo, vatNumber: profile.vatNumber } : null;
  const [addresses, cart, zoneNotices, phones, conversations] = await Promise.all([
    new AddressService(db).listByCustomer(customerId),
    new CartService(db).get(customerId),
    readZoneNotices(db, customerId),
    // Emekli numaralar gelmez: artık bizde olmayan numarayı "sizde" diye göstermek en kafa karıştırıcı hâl olurdu.
    new CustomerPhoneService(db).listActiveByCustomer(customerId),
    // Kaynak sayısı kadar satır; sayfalanmaz.
    new ConversationService(db).listByCustomer(customerId),
  ]);

  const chats: LinkedChat[] = conversations
    .map((c) => ({ id: c.id, source: c.source, since: c.linkedAt ?? c.createdAt }))
    .sort((a, b) => b.since.localeCompare(a.since));

  // Kaydedilenler sepetin kendi okumasıyla çözülür: ad, görsel, fiyat ve "bölge içi mi" bilgisi
  // orada zaten hesaplanıyor. İkinci bir çözüm yazmak, aynı satırın iki görünümü demekti.
  const savedView = await getCartView(locale, cart.savedItems.map(entryOfItem), { customerId });

  // Puan ve kupon aynı koşula bağlı ve tek kapıdan gelir, böylece native ile web'in kartı aynı kaynaktan doğar.
  const [points, coupons] = company ? [null, [] as CustomerCoupon[]] : await readPointsAndCoupons(db, customerId);

  return {
    profile: {
      name: profile.name,
      email: profile.email ?? null,
      phone: profile.phone,
      preferredLanguage: profile.preferredLanguage,
    },
    whatsappNumbers: phones.map((p) => p.phone),
    company,
    addresses,
    chats,
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

/** Yalnız müşteriye bağlı kayıtlar okunur; ziyaretçinin kaydı hesapsız da olabilir. */
async function readZoneNotices(db: ReturnType<typeof serviceDb>, customerId: string): Promise<{ postalCode: string }[]> {
  const rows = await new ZoneNoticeService(db).listForCustomer(customerId);
  return rows.map((row) => ({ postalCode: row.postalCode }));
}

/** Yalnız B2C'de çağrılır. Kart application'dan tek turda gelir; web yalnız son kazanımlar dökümünü ekler. */
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
      earnWays: card.earnWays,
      centValue: card.centValue,
      neighborMaxUses: card.neighborMaxUses,
      visitClaimedToday: card.visitClaimedToday,
      pendingNeighborAwards: card.pendingNeighborAwards,
      neighborPoints: card.earnWays.find((way) => way.key === 'neighbor')?.points ?? null,
      inviteUrl: card.inviteUrl,
      referralCode: card.referralCode,
      referralPoints: card.earnWays.find((way) => way.key === 'referral')?.points ?? null,
    },
    view.coupons,
  ];
}

/** Tasarımın "Son kazanımlar" listesi dört satır gösteriyor; tam döküm ayrı bir ekranın işi. */
const POINTS_HISTORY_SIZE = 4;
