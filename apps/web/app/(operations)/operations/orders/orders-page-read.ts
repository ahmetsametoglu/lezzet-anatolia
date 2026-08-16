import { OrderItemService, OrderService, SettingsService, UserProfileService, type serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, type KeysetCursor, type OrderItem } from '@lezzet/types';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';
import { toCountsView, toOrderRows } from './orders-read';
import { toOrderFilters, type OrdersUrlState } from './orders-url';
import type { OrdersData } from './orders-types';

/**
 * Sipariş listesinin OKUMASI — ilk sayfa (RSC) ve sonraki sayfalar (action) AYNI yoldan geçer.
 * İkisi ayrı yazılsaydı süzgeç bir yerde uygulanır ötekinde unutulur, kaydırınca liste karışırdı.
 *
 * Okuma satır sayısıyla ÇARPMAZ (N+1 yok): bir sayfa sipariş + o sayfanın kalemleri + o sayfanın
 * müşterileri + kuryeleri; sayaç turu (`order_counts`) süzgecin tamamını tek sorguda sayar.
 */

/** Vade süresi ayarı — checkout ile AYNI anahtar (`lib/order/checkout-options`). */
const PAYMENT_TERM_KEY = 'payment_term_days';
const PAYMENT_TERM_DEFAULT = 30;

/** Aramanın müşteri ayağında kaç kayda bakılır — tavan yoksa arama katalog taramasına döner. */
const CUSTOMER_MATCH_LIMIT = 50;

type Db = ReturnType<typeof serviceDb>;

export async function readOrdersPage(
  db: Db,
  urlState: OrdersUrlState,
  opts: { cursor?: KeysetCursor; limit?: number } = {},
): Promise<OrdersData> {
  const orderSvc = new OrderService(db);
  const profileSvc = new UserProfileService(db);

  // Bağlam ÖNCE: hem sayaçların hem listenin evrenini o belirliyor (19.5).
  const ctx = await readWarehouseContext();
  const warehouse = warehouseFilterOf(ctx, urlState.depo);

  // Aramanın müşteri ayağı ÖNCE çözülür: hem liste hem sayaç aynı kimlik kümesini kullanmalı.
  const matches = urlState.q ? await profileSvc.search(urlState.q, CUSTOMER_MATCH_LIMIT) : [];
  const filters = { ...toOrderFilters(urlState), customerIds: matches.map((m) => m.id) };

  // ── SAYAÇ İLE LİSTE AYNI SÜZGECİ ALMAZ (sözleşme kural 5) ────────────────────
  // Sekme sayıları ve alt toplam BAĞLAMIN gerçeğidir: operatörün iş yükü, tabloda o an neye
  // baktığından bağımsızdır. Tablo süzgeci yalnız satırları daraltır ve tablo bunu görünür biçimde
  // söyler ("Süzülüyor: …"). İkisi tek nesneyi paylaşsaydı sayı da satırla düşer, ekran "STR'yi
  // süzdüm" derken toplam iş yükünü olduğundan az gösterirdi.
  // SEÇİLİ sipariş (`?o=`) HEDEFLİ okunur (16.08): liste keyset sayfalı — paylaşılan bağlantının
  // siparişi ilk sayfada olmayabilir ve panel o zaman boş davete düşerdi (URL bir kimlik söylerken).
  // Yalnız İLK sayfada bakılır: devam sayfaları (`cursor`) aynı adresi taşır, her turda yeniden
  // okumanın karşılığı yok.
  const selectedId = opts.cursor ? '' : urlState.selected;

  const [page, counts, termDays, labels, selectedOrders] = await Promise.all([
    orderSvc.listPage(
      { ...filters, warehouseIds: warehouse.warehouseIds },
      { cursor: opts.cursor, limit: opts.limit ?? DEFAULT_PAGE_SIZE },
    ),
    orderSvc.counts({ ...filters, warehouseIds: ctx.warehouseIds }),
    new SettingsService(db).getNumber(PAYMENT_TERM_KEY, PAYMENT_TERM_DEFAULT),
    readWarehouseLabels(),
    selectedId ? orderSvc.listByIds([selectedId]) : Promise.resolve([]),
  ]);

  // Kapsam BURADA DA sorulur: `listByIds` depo süzgeci görmez — paylaşılan bir bağlantı, personelin
  // göremeyeceği deponun siparişini panele düşüremez (DOMAIN §17, fail-closed).
  const pinnedOrder = (() => {
    const order = selectedOrders[0];
    if (!order || page.rows.some((row) => row.id === order.id)) return null;
    if (ctx.warehouseIds && !ctx.warehouseIds.includes(order.warehouseId)) return null;
    return order;
  })();
  const orders = pinnedOrder ? [...page.rows, pinnedOrder] : page.rows;

  const orderIds = orders.map((o) => o.id);
  const customerIds = [...new Set(orders.map((o) => o.customerId))];
  const courierIds = [...new Set(orders.flatMap((o) => (o.courierId ? [o.courierId] : [])))];

  const [items, customers, couriers] = await Promise.all([
    orderIds.length ? new OrderItemService(db).listByOrders(orderIds) : Promise.resolve([]),
    profileSvc.listByIds(customerIds),
    courierIds.length ? profileSvc.listByIds(courierIds) : Promise.resolve([]),
  ]);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId);
    if (list) list.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  const allRows = toOrderRows({
    orders,
    itemsByOrder,
    customers: new Map(customers.map((c) => [c.id, c])),
    courierNames: new Map(couriers.map((c) => [c.id, c.name])),
    defaultTermDays: termDays,
    // TEK "şimdi": istek ortasında gün dönerse listenin yarısı "gecikmiş" görünmesin.
    now: new Date(),
    warehouseLabels: labels,
  });

  return {
    // Hedefli okunan satır LİSTEYE KARIŞMAZ: sayfa 1'in sonuna iliştirmek sayfalama sırasını bozar;
    // o yalnız panelin yedeğidir (`pinned`).
    rows: pinnedOrder ? allRows.filter((row) => row.id !== pinnedOrder.id) : allRows,
    pinned: pinnedOrder ? (allRows.find((row) => row.id === pinnedOrder.id) ?? null) : null,
    nextCursor: page.nextCursor,
    counts: toCountsView(counts),
    warehouse: {
      // Depo sütunu YALNIZ çok depolu bakışta anlamlı (kural 4): tek depoda aynı bilgi gürültüdür.
      showColumn: ctx.activeWarehouseId === null && ctx.warehouses.length > 1 && warehouse.active === null,
      available: warehouse.available,
      active: warehouse.active,
      dropped: warehouse.dropped,
      options: warehouse.options,
    },
  };
}
