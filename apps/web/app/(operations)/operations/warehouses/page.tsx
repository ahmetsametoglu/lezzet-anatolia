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
  serviceDb,
} from '@lezzet/database';
import type { Country, UserProfile } from '@lezzet/types';
import { labelPrinterFor } from '@lezzet/application';
import { guarded, requireAdmin } from '@/lib/guard';
import { readStaff } from '@/lib/staff';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readWarehouseLabels } from '@/lib/warehouse/context';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { WarehousesClient } from './warehouses-client';
import { readMeasurePoints } from './measure-read';
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

  // **Bölge dışı talep okuması KALKTI (17.08).** Buradan bir liderlik tablosu okunuyordu ("hangi
  // kod ne sıklıkla soruluyor") ve ekranın "Ağ geneli" bölümünü besliyordu; o bölüm bu sayfanın
  // sorusuna cevap vermediği için kaldırıldı — gerekçe `warehouses.desktop`ta. Sayfa bir sorgu
  // eksildi: veriyi okuyup çizmeyen bir sayfa, o okumanın bedelini boşuna ödüyordu.
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
   * **Seçim boşsa İLK TESİS açılır** (16.08) — ekran artık tek görünüm, yani "hiçbiri seçili değil"
   * diye bir hâli yok. Boş bırakılsaydı sayfa kendi şeridini gösterip altını boş bırakırdı: bir
   * seçim davetiyle karşılamak, ilk tesisi göstermekten hiçbir şey kazandırmaz — operatör zaten
   * şeritten istediğine geçiyor.
   *
   * **Aktif olan tercih edilir:** kapalı bir tesisin karnesi okunmuyor (`readCard` künyesi) ve
   * sayfayı kapalı bir depoyla açmak, ekranı boş bir kartla karşılamak olurdu. Hepsi kapalıysa
   * yine de ilki açılır — orada kapalılık gerçeğin kendisidir.
   *
   * URL'e YAZILMIYOR: adres boş kalır, bağlantı paylaşan kişi "ilk tesis" der. Yönlendirme
   * yazsaydık her açılış bir gezinme turu daha eklerdi.
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


// `readLastMeasured` SİLİNDİ (19.30) → `measure-read.readMeasurePoints`. "Son ölçüm" artık takvimin
// yan ürünü: aynı üç aylık pencere hem günleri hem son anı veriyor, yani ayrı bir tarama gereksizdi.
// Sınırı da düzeldi — eskiden 200 satırlık tavanın dışında kalan nokta "hiç ölçülmemiş" görünüyordu;
// bugün "son 3 ayda ölçüm yok" deniyor ve bu cümle ölçtüğümüz şeyin birebir karşılığı.

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
   * Ölçüm noktaları + hijyen takvimi (19.28 · 19.30) — **kapalı tesiste de okunur**, karnenin aksine.
   *
   * Karne "bugün ne durumda" sorusudur ve kapalı tesiste sorulmaz; nokta ise KÜNYEDİR — tesis
   * kapalıyken de dolabı vardır ve yeniden açılınca aynı noktalarla açılır. Denetim defteri de
   * kapalı tesiste okunur; asıl o zaman sorulur.
   */
  const measure = await readMeasurePoints(db, row.id, new Date());

  // Etiket yazıcısı (23.7) — kapalı tesiste de okunur: yazıcı da nokta gibi KÜNYEDİR.
  const printer = await labelPrinterFor(db, row.id);

  /**
   * **Bölgelerin ağırlığı** (19.28) — kart artık yalnız tanımı değil sonucu da gösteriyor.
   *
   * Kodlar TEK turda soruluyor: bölge başına sorgu atmak (N+1) beş bölgede beş tur demekti ve
   * ikisi de aynı RPC'yi çağırırdı. Kod yoksa sorgu HİÇ atılmıyor — boş bir `in ()` sorgusu, sonucu
   * baştan belli bir tur.
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
    printer,
    points: measure.points,
    measureTruncated: measure.truncated,
    scorecard: toScorecard({
      batches: ownBatches,
      belowMinCount: belowMin.length,
      inTransitIn: row.inTransitIn,
      openOrderCount: orderCounts ? openOrderCountOf(orderCounts.byStatus) : 0,
    }),
  };
}
