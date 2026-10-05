import {
  AnalyticsReportService,
  DeliveryZoneService,
  OrderService,
  SettingsService,
  StockService,
  UserProfileService,
  WarehouseService,
  WarehouseTransferService,
  ZoneNoticeService,
  ShippingBoxService,
  serviceDb,
} from '@lezzet/database';
import type { Country, UserProfile } from '@lezzet/types';
import { printersFor, readFacilityVanSummary } from '@lezzet/application';
import { guarded, requireAdmin } from '@/lib/guard';
import { readStaff } from '@/lib/staff';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readWarehouseLabels } from '@/lib/warehouse/context';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { num } from '@/components/operation/ui/format';
import { stockLink } from '../stock/stock-url';
import { WarehousesClient } from './warehouses-client';
import { readMeasurePoints } from './measure-read';
import { openOrderCountOf, toScorecard, toStaffChips, toWarehouseRows, toZoneCards } from './warehouses-read';
import { parseWarehousesUrl } from './warehouses-url';
import type { VanLoadCardView, WarehouseCardView, WarehousesData } from './warehouses-types';

// Depolar: tesisin kim olduğu, nereye hizmet ettiği ve nasıl durduğu; depo bağlamı bu sayfayı daraltmaz, çünkü depolar bir yönetim
// nesnesidir ve kapalı ya da kapsam dışı depo da listelenir. Sayfalama yok, çünkü depo, bölge ve posta kodu kümeleri operatörün
// kurduğu kümelerdir; seçili tesisin eşik altı varyantları ve sipariş sayaçları ikinci dalgada okunur.

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
  /**
   * Seçim boşsa ilk tesis açılır, aktif olan tercih edilir: ekran tek görünümdür ve kapalı tesisin karnesi okunmaz. Seçim URL'e
   * yazılmaz, çünkü yönlendirme her açılışa bir gezinme turu eklerdi.
   */
  const fallback = rows.find((r) => r.isActive) ?? rows[0] ?? null;
  const selected = urlState.code ? (rows.find((r) => r.code === urlState.code) ?? fallback) : fallback;

  const card = selected ? await readCard(db, stockSvc, { row: selected, zones, staff, batches }) : null;

  const activeCountries = new Set(warehouses.filter((w) => w.isActive).map((w) => w.countryCode));

  const data: WarehousesData = {
    rows,
    card,
    countriesWithWarehouse: [...activeCountries] as Country[],
  };

  return <WarehousesClient data={data} urlState={urlState} />;
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

  /**
   * Ölçüm noktaları ve hijyen takvimi kapalı tesiste de okunur, karnenin aksine: nokta bir künyedir, tesis kapalıyken de dolabı
   * vardır ve denetim defteri asıl o zaman sorulur.
   */
  const measure = await readMeasurePoints(db, row.id, new Date());

  // Yazıcı envanteri kapalı tesiste de okunur, çünkü yazıcı da nokta gibi künyedir; bir depoda birden çok yazıcı ve iki etiket
  // türü var.
  const printers = await printersFor(db, row.id);

  /**
   * Kargo kutuları: deponun kutuları ve henüz benimsenmemiş şablonlar; benimsenmiş şablonu "ekle" diye sunmak reddedilen bir davet
   * olurdu. Ölçüt ad, çünkü kopya şablonun adını taşır, kimliğini taşımaz.
   */
  const boxSvc = new ShippingBoxService(db);
  const [ownBoxes, templates] = await Promise.all([boxSvc.listForWarehouse(row.id), boxSvc.listTemplates()]);
  const ownNames = new Set(ownBoxes.map((b) => b.name));
  const shippingBoxes = { boxes: ownBoxes, adoptable: templates.filter((t) => !ownNames.has(t.name)) };

  /**
   * Bölgelerin ağırlığı: kodlar tek turda sorulur, çünkü bölge başına sorgu aynı RPC'yi N kez çağırırdı; kod yoksa sorgu atılmaz.
   */
  const zoneCodes = [...new Set(zones.filter((z) => z.warehouseId === row.id).flatMap((z) => z.postalCodes.map((c) => c.postalCode)))];
  const [zoneOrders, zoneWaiting] = await Promise.all([
    zoneCodes.length > 0
      ? new AnalyticsReportService(db).postalCodeOrders(zoneCodes)
      : Promise.resolve(new Map<string, { orderCount: number; revenueCents: number }>()),
    zoneCodes.length > 0 ? new ZoneNoticeService(db).pendingCountByPostalCode() : Promise.resolve(new Map<string, number>()),
  ]);

  return {
    row,
    zones: toZoneCards(zones, row.id, { orders: zoneOrders, waiting: zoneWaiting, now: new Date() }),
    staff: toStaffChips(staff, row.id),
    printers,
    shippingBoxes,
    points: measure.points,
    measureTruncated: measure.truncated,
    /*
      Araç yükü yalnız açık tesisin kartında sorulur: aracın kendi karnesi onu zaten sayar, kapalı tesisin malı da bugünün işi değil.
    */
    vanLoad: row.kind === 'facility' && row.isActive ? await readVanLoadCard(db, row.id) : null,
    scorecard: toScorecard({
      batches: ownBatches,
      belowMinCount: belowMin.length,
      inTransitIn: row.inTransitIn,
      openOrderCount: orderCounts ? openOrderCountOf(orderCounts.byStatus) : 0,
    }),
  };
}

/**
 * Karnenin altındaki araç satırı; motoru `@lezzet/application`, burası yalnız cümleyi kurar. Boş satır çizilmez, çünkü sabit duran
 * bir "araçta 0" satırı dolduğu gün fark edilmez.
 */
async function readVanLoadCard(db: ReturnType<typeof serviceDb>, facilityId: string): Promise<VanLoadCardView | null> {
  const summary = await readFacilityVanSummary(db, { facilityId });
  const dolu = summary.vans.filter((van) => van.unitCount > 0);
  if (summary.boxCount === 0 && dolu.length === 0) return null;

  return {
    vans: dolu.map((van) => ({
      code: van.code,
      name: van.name,
      summary: `${num(van.unitCount)} adet · ${num(van.variantCount)} üründen`,
      href: stockLink({ depo: van.code }),
    })),
    boxes: summary.boxCount > 0 ? `${num(summary.boxCount)} kutu · ${num(summary.orderCount)} sipariş` : null,
  };
}
