import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, OrderStatusEnum, type Channel, type DeliveryType, type OrderStatus, type PaymentStatus } from '@lezzet/types';
import { WAREHOUSE_PARAM } from '@/lib/warehouse/filter';
import { dayMonth } from '@/components/operation/ui/format';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Sipariş ekranının URL SÖZLEŞMESİ — fiyat/stok/ürün ekranlarının deseni. Sekme ve süzgeçler adreste
// taşınır: yenilemede aynı görünüm açılır ve SUNUCU okuyabildiği için süzme sunucuda yapılır.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.

export const ORDERS_PATH = '/operations/orders';

/**
 * Sekmeler = DURUMLAR. Tasarım altı sekme çiziyor ama sistemde dokuz durum var; eksik bırakılan
 * durumun siparişi hiçbir sekmede görünmezdi. Bu yüzden sekme kümesi enum'dan TÜRETİLİR — yeni bir
 * durum eklendiğinde sekmesi kendiliğinden gelir, kimse listeyi güncellemeyi unutamaz.
 *
 * `draft` yok: yarım kalmış checkout sipariş değildir (bkz. `LISTED_STATUSES`).
 */
export const ORDER_TABS = ['all', ...OrderStatusEnum.options.filter((s) => s !== 'draft')] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export interface OrdersUrlState {
  tab: OrderTab;
  /** Referans no ya da müşteri araması (boş = yok). */
  q: string;
  /** Kanal süzgeci — 'all' ya da b2c/b2b. */
  chan: Channel | 'all';
  /** Teslim türü — 'all' ya da rota/kargo. */
  del: DeliveryType | 'all';
  /** Tahsilat durumu — 'all' ya da ödeme durumu. */
  pay: PaymentStatus | 'all';
  /** Teslim günü (YYYY-AA-GG); boş = gün süzgeci yok. */
  day: string;
  /**
   * Depo süzgeci — depo KODU (`STR`), kimliği değil; boş = süzgeç yok (19.5).
   *
   * Adreste taşınır çünkü bir BAKIŞTIR ve paylaşılabilir olmalı; depo BAĞLAMI ise çerezdedir ve
   * adrese yazılmaz — paylaşılan bir bağlantı alıcının evrenini ezmemeli.
   */
  depo: string;
}

const DEFAULTS: OrdersUrlState = { tab: 'all', q: '', chan: 'all', del: 'all', pay: 'all', day: '', depo: '' };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseOrdersUrl(params: RawParams): OrdersUrlState {
  return {
    tab: oneOf(params.tab, ORDER_TABS, DEFAULTS.tab),
    q: one(params.q).trim(),
    chan: oneOf(params.chan, ['b2c', 'b2b', 'all'] as const, DEFAULTS.chan),
    del: oneOf(params.del, ['route', 'shipping', 'all'] as const, DEFAULTS.del),
    pay: oneOf(params.pay, PAYMENT_FILTERS, DEFAULTS.pay),
    day: /^\d{4}-\d{2}-\d{2}$/.test(one(params.day)) ? one(params.day) : DEFAULTS.day,
    // Kod burada DOĞRULANMAZ, yalnız normalize edilir: "bu kod benim evrenimde var mı" sorusunun
    // cevabı bağlamdadır (`warehouseFilterOf`) ve URL çözümleyicisi bağlamı görmez.
    depo: one(params[WAREHOUSE_PARAM]).trim().toUpperCase(),
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function ordersUrl(state: OrdersUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.chan !== DEFAULTS.chan) p.set('chan', state.chan);
  if (state.del !== DEFAULTS.del) p.set('del', state.del);
  if (state.pay !== DEFAULTS.pay) p.set('pay', state.pay);
  if (state.day) p.set('day', state.day);
  if (state.depo) p.set(WAREHOUSE_PARAM, state.depo);
  const qs = p.toString();
  return qs ? `${ORDERS_PATH}?${qs}` : ORDERS_PATH;
}

/**
 * SERVİS süzgeçleri. Hepsi sunucuda uygulanabilir — sipariş kümesi sınırsız büyür, süzmeyi ekranda
 * yapmak listenin kuyruğunu yutardı. Müşteri araması burada YOK: kimlikler çağıranda çözülür
 * (`UserProfileService.search`), böylece "neyde aranır" tek yerde kalır.
 */
export function toOrderFilters(state: OrdersUrlState): {
  status?: OrderStatus[];
  channel?: Channel;
  deliveryType?: DeliveryType;
  paymentStatus?: PaymentStatus;
  query?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
} {
  return {
    status: state.tab === 'all' ? undefined : [state.tab],
    channel: state.chan === 'all' ? undefined : state.chan,
    deliveryType: state.del === 'all' ? undefined : state.del,
    paymentStatus: state.pay === 'all' ? undefined : state.pay,
    query: state.q || undefined,
    deliveryFrom: state.day || undefined,
    deliveryTo: state.day || undefined,
  };
}

/** Sekme adı — durum adları TEK KAYNAKTAN (`ORDER_STATUS_LABELS`), ekranda yeniden yazılmaz. */
export function tabLabel(tab: OrderTab): string {
  return tab === 'all' ? 'Tümü' : ORDER_STATUS_LABELS[tab];
}

export const CHANNEL_FILTERS = ['all', 'b2c', 'b2b'] as const;
export const CHANNEL_LABEL: Record<(typeof CHANNEL_FILTERS)[number], string> = {
  all: 'Tümü',
  b2c: 'B2C',
  b2b: 'B2B',
};

/**
 * Kanalın rengi — B2C olive, B2B amber. Aynı eşleme satır rozetinde de geçerli: çip ile rozet
 * farklı renk konuşsaydı "B2B" süzgeciyle gelen listenin satırları başka bir kanaldanmış gibi
 * okunurdu. `all` nötr kalır: bir kanal değil, kanal yokluğudur.
 */
export const CHANNEL_TONE: Record<(typeof CHANNEL_FILTERS)[number], 'olive' | 'amber'> = {
  all: 'olive',
  b2c: 'olive',
  b2b: 'amber',
};

export const DELIVERY_FILTERS = ['all', 'route', 'shipping'] as const;
export const DELIVERY_LABEL: Record<(typeof DELIVERY_FILTERS)[number], string> = {
  all: 'Her teslim',
  route: 'Rota',
  shipping: 'Kargo',
};

export const PAYMENT_FILTERS = ['all', 'pending', 'partial', 'paid', 'refunded'] as const;
/** Süzgeç etiketleri — durum adları TEK KAYNAKTAN (`PAYMENT_STATUS_LABELS`), burada yeniden yazılmaz. */
export const PAYMENT_LABEL: Record<(typeof PAYMENT_FILTERS)[number], string> = {
  all: 'Her tahsilat',
  ...PAYMENT_STATUS_LABELS,
};


/**
 * Teslim günü süzgecinin seçenekleri — tasarımın "bugün · 24 Tem ▾" kontrolü.
 *
 * **Bugün SUNUCUDAN gelir**, `new Date()` ekranda çağrılmaz: client bileşen sunucuda da render
 * edilir ve gece yarısını geçen bir istekte iki taraf farklı gün üretirdi.
 *
 * Liste yakın günlerle sınırlı ve bu bilinçli: rota günü operasyonel bir yakın gelecektir — "üç ay
 * sonrası" diye bir teslim günü süzgeci yok, o soru raporların işi.
 */
export function deliveryDayOptions(today: string, span = 7): Array<{ value: string; label: string }> {
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: span }, (_, i) => {
    const day = new Date(base.getTime() + i * 86_400_000);
    const value = day.toISOString().slice(0, 10);
    const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : dayMonth(value);
    return { value, label };
  });
}
