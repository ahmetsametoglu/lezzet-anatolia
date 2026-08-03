import {
  DeliveryZoneService,
  OrderService,
  SettingsService,
  StockService,
  UserProfileService,
  WarehouseService,
  WarehouseTransferService,
  serviceDb,
} from '@lezzet/database';
import { CountryEnum, type Country, type UserProfile } from '@lezzet/types';
import { guarded, requireAdmin } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { readStaff } from '@/lib/staff';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readWarehouseLabels } from '@/lib/warehouse/context';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { WarehousesClient } from './warehouses-client';
import { openOrderCountOf, toScorecard, toStaffChips, toWarehouseRows, toZoneCards } from './warehouses-read';
import { parseWarehousesUrl } from './warehouses-url';
import type { WarehouseCardView, WarehousesData } from './warehouses-types';

// Depolar (19.5) — tesisin **kim olduğu, nereye hizmet ettiği ve nasıl durduğu**; üçü aynı nesneye
// ait olduğu için ayrılmaz (`design/pages/admin-depolar.md`).
//
// ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
// Depocu ve kurye bu ekranı hiç görmez. Kapı `requireAdmin`; nav'ın onu göstermemesi bir güvence
// değil, bir görgü kuralıdır (`ops-nav`).
//
// ── DEPO BAĞLAMI BU SAYFAYI DARALTMAZ ────────────────────────────────────────
// Sistemin geri kalanında `readWarehouseContext` evreni belirler; burada değil. Depolar bir YÖNETİM
// nesnesidir: kapalı olan da, kapsam dışı olan da listelenir. Kapsamla süzülseydi, "ikinci depoyu
// nereden ekleyeceğim" sorusunun cevabı kendi içinde kaybolurdu.
//
// ── OKUMA PLANI — iki dalga, hiçbiri satır sayısıyla ÇARPMAZ ─────────────────
//   1. dalga (her zaman) · depolar · bölgeler+kodları · personel (rol başına) · eldeki TÜM partiler ·
//      yoldaki sevkiyatlar · raf ömrü eşikleri
//   2. dalga (YALNIZ bir tesis seçiliyken) · o deponun eşik altı varyantları · sipariş sayaçları
//
// Sayfalama YOK ve olmamalı: depo, bölge ve posta kodu kümeleri operatörün elle kurduğu, doğal
// tavanı olan kümelerdir (`CLAUDE.md §1`) — tesis sayısı fiziksel bir gerçektir, veriyle büyümez.
// Partiler de eldeki malla sınırlıdır ve karne TAM olmak zorunda: eksik sayılan bir risk, bakılmayan
// bir risktir.

interface WarehousesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WarehousesPage({ searchParams }: WarehousesPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Depolar"
        reason="Tesis künyesi, hizmet alanı ve kapatma kararı yönetime kapalıdır. Deponuzun stoğu Stok ekranında, günün çıkışları Teslimat ekranındadır."
      />
    );
  }

  const urlState = parseWarehousesUrl(await searchParams);
  const db = serviceDb();
  const stockSvc = new StockService(db);

  const [warehouses, zones, staff, thresholds, transfers, warehouseLabels] = await Promise.all([
    new WarehouseService(db).list(),
    new DeliveryZoneService(db).listWithCodes(),
    readStaff(new UserProfileService(db)),
    readExpiryThresholds(new SettingsService(db)),
    new WarehouseTransferService(db).listInTransit(),
    readWarehouseLabels(),
  ]);

  // Partiler YALNIZ aktif depolardan: kapalı tesisin stoğu kayıtta durur ama satış okumalarında
  // yoktur, karnesinde de olmamalı — "128 varyant" yazan kapalı bir depo, kapalılığın ne demek
  // olduğunu gizlerdi. Kapatma penceresi o sayıyı ayrıca söyler (kapatma ANINDAKİ sonuç).
  const activeIds = warehouses.filter((w) => w.isActive).map((w) => w.id);
  const batchRows = activeIds.length > 0 ? await stockSvc.listInStockDetailed(undefined, activeIds) : [];

  // TEK "şimdi": karnenin tüm satırları aynı ana göre değerlendirilsin (stok ekranının aynı kuralı).
  // Liste fiyatı okunmuyor — karne teklif ÖNERMEZ, yalnız riski sayar; öneri Stok'un işi.
  const batches = toBatchViews(batchRows, { now: new Date(), thresholds, warehouseLabels });

  const rows = toWarehouseRows({ warehouses, zones, staff, batches, transfers });
  const selected = urlState.code ? (rows.find((r) => r.code === urlState.code) ?? null) : null;

  const card = selected ? await readCard(db, stockSvc, { row: selected, zones, staff, batches }) : null;

  const activeCountries = new Set(warehouses.filter((w) => w.isActive).map((w) => w.countryCode));
  const shippingCountries = new Set(warehouses.filter((w) => w.isActive && w.shipsOnline).map((w) => w.countryCode));

  const data: WarehousesData = {
    rows,
    card,
    // Hizmet verilen her ülkenin bir kargo çıkış deposu OLMALI: yoksa o ülkede bölge dışı müşteriye
    // satış yapılamaz ve sipariş hiç açılmaz. Görünür bir eksiklik hâlidir, sessiz bırakılmaz.
    countriesWithoutShipping: CountryEnum.options.filter((c) => activeCountries.has(c) && !shippingCountries.has(c)),
    countriesWithWarehouse: [...activeCountries] as Country[],
  };

  return <WarehousesClient data={data} device={await detectDevice()} urlState={urlState} />;
}


/** Seçili tesisin tam kartı — ikinci dalga: yalnız bu deponun eşik altı ve açık işi okunur. */
async function readCard(
  db: ReturnType<typeof serviceDb>,
  stockSvc: StockService,
  input: Pick<WarehouseCardView, 'row'> & {
    zones: Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>;
    staff: UserProfile[];
    batches: Awaited<ReturnType<typeof toBatchViews>>;
  },
): Promise<WarehouseCardView> {
  const { row, zones, staff, batches } = input;
  const ownBatches = batches.filter((b) => b.warehouseId === row.id);

  // Kapalı depoda ikisi de sorulmaz: eşik altı "sipariş verilmeli" demektir ve kapalı tesise sipariş
  // verilmez; açık iş de kapalı tesisten çıkamaz. Boş sorgu atmak yerine hiç sormuyoruz.
  const [belowMin, orderCounts] = row.isActive
    ? await Promise.all([stockSvc.listBelowMinStock(row.id), new OrderService(db).counts({ warehouseIds: [row.id] })])
    : [[], null];

  return {
    row,
    zones: toZoneCards(zones, row.id),
    staff: toStaffChips(staff, row.id),
    scorecard: toScorecard({
      batches: ownBatches,
      belowMinCount: belowMin.length,
      inTransitIn: row.inTransitIn,
      inTransitOut: row.inTransitOut,
      openOrderCount: orderCounts ? openOrderCountOf(orderCounts.byStatus) : 0,
    }),
  };
}
