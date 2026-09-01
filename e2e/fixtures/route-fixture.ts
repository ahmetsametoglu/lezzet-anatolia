import { loadRootEnv } from './order-fixture';

/**
 * **SIRALANMIŞ SEFER fikstürü** (11.9) — damgalı depo + rota + sefer + iki paralel hattın durakları,
 * sırası motorla hesaplanmış hâlde.
 *
 * ── NEDEN UI'DAN KURULMUYOR ─────────────────────────────────────────────────
 * `order-fixture`ın gerekçesinin aynısı: senaryonun sınadığı şey sıranın EKRANDA nasıl göründüğü,
 * seferin nasıl açıldığı değil. Seferi arayüzden kurmak, duman testini kurye gün akışının
 * (yükleme, kutu okutma, sefer başlatma) rehinesi yapardı — o akışın kendi testleri var.
 *
 * Seed'in seferini kullanmak da yasak (`CLAUDE §4b`): üç ajan aynı veritabanını paylaşıyor ve
 * seed'in sırasını yeniden hesaplatmak küresel kirliliktir.
 *
 * ── GEOMETRİ TESADÜFİ DEĞİL ─────────────────────────────────────────────────
 * İki paralel hat, aralarında ~1,2 km, hat üstündeki komşular ~2,2 km. Yani karşı hattaki durak
 * kendi hattındaki komşudan YAKIN — açgözlü bir sıralama zikzak çizer, kapalı turu gören arama U
 * kurar. Aynı geometri motorun birim testinde ve `stop-order.test.ts`te de kullanılıyor; bu dosya
 * onu ekrana kadar taşıyor.
 */

const DEPO = { lat: 48.578, lng: 7.742 };
const ENLEMLER = [48.6, 48.62, 48.64, 48.66] as const;
const BATI = 7.745;
const DOGU = 7.761;

export interface RouteRun {
  stamp: number;
  runId: string;
  referenceNo: string;
  zoneName: string;
  warehouseName: string;
  /** Depoya en yakın iki durağın adres satırı — turun İKİ UCUNDA olmaları gereken duraklar. */
  guneyLabels: [string, string];
  cleanup: () => Promise<void>;
}

export async function createSequencedRun(): Promise<RouteRun> {
  loadRootEnv();
  // Dinamik import: modül yükü env'den SONRA (statik import `serviceDb`i env'siz kurardı).
  const {
    CategoryService,
    DeliveryZoneService,
    OrderService,
    ProductService,
    UserProfileService,
    WarehouseService,
    serviceDb,
  } = await import('@lezzet/database');
  const { createTestWarehouse, mustDelete, purgeTestData } = await import('@lezzet/database/testing');
  const { ensureStopOrder } = await import('@lezzet/application');

  const db = serviceDb();
  const stamp = Date.now();
  /*
    GÜN YEREL SAATE GÖRE — `toISOString().slice(0, 10)` DEĞİL.

    Ölçüldü (01.09, bu fikstürün ilk koşusunda): saat yerelde 01:44 iken UTC hâlâ bir önceki gündü;
    fikstür seferi "dün"e yazdı, sevkiyat masası "bugün"e baktı ve şeritte sefer hiç görünmedi.
    Ekran `deliveries-url.toIsoDate`i kullanıyor ve o yerel bileşenlerden kuruluyor — fikstür de
    aynı ölçütü kullanmak zorunda, yoksa test günün iki saatinde sebepsiz kırmızıya döner.

    Not: `application/courier/day.ts` "bugün"ü hâlâ UTC'den türetiyor; yani gece yarısı ile yerel
    02:00 arasında kurye günü ile sevkiyat masası AYRI güne bakıyor. Bu 11.9'un konusu değil —
    kayıt `docs/talep/not-operasyon-gun-olcutu.md`.
  */
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const warehouse = await createTestWarehouse(db);
  // Depo noktası: turun çıpası. Yoksa motor hesabı REDDEDER (`no_origin`) ve senaryonun ölçtüğü
  // şey hiç doğmaz.
  await new WarehouseService(db).update({ id: warehouse.id, lat: DEPO.lat, lng: DEPO.lng });

  const category = await new CategoryService(db).create({ name: { tr: `E2E rota kategorisi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `E2E rota ürünü ${stamp}` },
    categoryId: category.id,
  });

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: `E2E rota müşterisi ${stamp}` });
  const courier = await profiles.insert({ name: `E2E rota kuryesi ${stamp}` });

  const zoneName = `E2E sıralı rota ${stamp}`;
  // Haftanın her günü koşar: senaryonun HANGİ GÜN koştuğu sonucu değiştirmesin.
  const zone = await new DeliveryZoneService(db).insert({
    name: zoneName,
    warehouseId: warehouse.id,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });

  const referenceNo = `SF-E2E-${String(stamp).slice(-6)}`;
  const { data: runRow, error: runError } = await db
    .from('delivery_run')
    .insert({
      reference_no: referenceNo,
      delivery_zone_id: zone.id,
      delivery_date: today,
      warehouse_id: warehouse.id,
      courier_id: courier.id,
      departed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (runError) throw new Error(`e2e fikstürü: sefer açılamadı — ${runError.message}`);
  const runId = runRow.id as string;

  const orders = new OrderService(db);
  const orderIds: string[] = [];
  const labelOf = (yon: 'B' | 'D', i: number) => `${i + 1} rue ${yon === 'B' ? 'Ouest' : 'Est'} ${stamp}`;

  /* Duraklar hat hat DEĞİL, ÇAPRAZ yazılıyor (batı-doğu-batı-doğu…): okuma sırası `createdAt`tir
     ve ekranda o sıra görünseydi zikzak okunurdu. Senaryonun ölçtüğü şey tam olarak bu sıranın
     ekrana ÇIKMAMASI. */
  for (const [i, lat] of ENLEMLER.entries()) {
    for (const [yon, lng] of [['B', BATI] as const, ['D', DOGU] as const]) {
      const { order } = await orders.create(
        {
          warehouseId: warehouse.id,
          customerId: customer.id,
          channel: 'b2c',
          deliveryType: 'route',
          deliveryZoneId: zone.id,
          deliveryDate: today,
          deliveryRunId: runId,
          courierId: courier.id,
          addressSnapshot: { line1: labelOf(yon, i), city: 'Strasbourg', postalCode: '67000', lat, lng },
          paymentMethod: 'cash',
          totalCents: 1000,
        },
        [{ variantId: variants[0]!.id, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
      );
      orderIds.push(order.id);
    }
  }
  // Sipariş `draft` doğar; sevkiyat şeridi GÜNÜN çıkışlarını sayıyor ve `confirmed` o kümenin
  // içinde. Durum düz yazımla yükseltiliyor — geçiş motorunu çağırmak bu senaryonun işi değil.
  await db.from('order').update({ status: 'confirmed' }).in('id', orderIds);

  // SIRAYI MOTOR YAZAR — fikstür elle bir dizi kurmuyor. Ekranda görülen sıra, üretimde görülecek
  // olanın aynısı olmak zorunda; elle yazılmış bir dizi senaryoyu kendi kendini doğrulayan bir
  // tekrara çevirirdi.
  const outcome = await ensureStopOrder(db, { runId, actorId: courier.id });
  if (outcome.status !== 'written') {
    throw new Error(`e2e fikstürü: sıra hesaplanamadı — ${JSON.stringify(outcome)}`);
  }

  return {
    stamp,
    runId,
    referenceNo,
    zoneName,
    warehouseName: warehouse.name,
    guneyLabels: [labelOf('B', 0), labelOf('D', 0)],
    cleanup: async () => {
      // SIRA: sipariş → sefer → geri kalanı purge'e. Sefer `restrict` bağlar taşıyor ve `mustDelete`
      // hatayı FIRLATIR — sessiz yarım silme paylaşılan veritabanında haftalarca birikir (§4b).
      await mustDelete(db, 'order', (q) => q.in('id', orderIds));
      await mustDelete(db, 'delivery_run', (q) => q.eq('id', runId));
      await purgeTestData(db, {
        productIds: [product.id],
        categoryIds: [category.id],
        profileIds: [customer.id, courier.id],
        warehouseIds: [warehouse.id],
      });
    },
  };
}
