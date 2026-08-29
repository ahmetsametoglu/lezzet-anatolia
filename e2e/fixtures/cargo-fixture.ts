import { loadRootEnv } from './order-fixture';

/**
 * DAMGALI KARGO GÖNDERİSİ — duyurulmuş, İKİ kolili, her koli kendi takip numarasıyla.
 *
 * ── NEDEN İKİ KOLİ ──────────────────────────────────────────────────────────
 * Tek kolili bir fikstür kargo yüzeyinin en kırılgan kuralını hiç sınamaz: **her kolinin AYRI
 * takip numarası var** (multicollo). O kural bir kez tam bu yüzden yanlış yazıldı — tek numara
 * varsayıldı ve üç kutulu siparişin ikisi ekranda hiç görünmedi. Fikstür bu yüzden çok kolili.
 *
 * ── NEDEN SAĞLAYICIYA ÇIKMIYOR ──────────────────────────────────────────────
 * Duyuru GERÇEK PARA harcar. Satırlar doğrudan yazılıyor; alanlar duyuru kapısının yazdıklarının
 * aynısı ve sağlayıcı kimlikleri `e2e-` önekli — canlı bir gönderiyle karışmasınlar.
 *
 * ── NEDEN DB'DEN, UI'DAN DEĞİL ──────────────────────────────────────────────
 * `order-fixture`ın gerekçesiyle aynı: senaryonun öznesi gönderinin GÖRÜNMESİ ve zincirin
 * ilerlemesi, gönderinin nasıl açıldığı değil. Duyuru kapısının kendi testleri ayrı dosyada.
 */
export interface CargoOrder {
  stamp: number;
  orderId: string;
  shipmentId: string;
  customerName: string;
  carrierName: string;
  /** Kutu sırasıyla takip numaraları — ekranda "Kutu 1/2", "Kutu 2/2" diye görünecekler. */
  trackingNumbers: string[];
  /**
   * Taşıyıcı konuştu: gönderiyi verilen koda taşır ve sipariş zincirini ilerletir.
   * **Sağlayıcı SAHTE** — ağ yok; sınanan uzlaştırmanın kendisi.
   */
  taşıyıcıSöyledi: (code: string) => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function createCargoOrder(): Promise<CargoOrder> {
  loadRootEnv();
  // Dinamik import: modül yükü env'den SONRA (order-fixture'ın aynı gerekçesi).
  const { CategoryService, OrderBoxService, OrderService, ProductService, ShipmentService, StockService, UserProfileService, serviceDb } =
    await import('@lezzet/database');
  const { createTestWarehouse, purgeTestData } = await import('@lezzet/database/testing');
  const { syncShipmentStatus } = await import('@lezzet/application');
  const { providerStub } = await import('@lezzet/application/shipping/provider.testkit');

  const db = serviceDb();
  const stamp = Date.now();
  const customerName = `E2E kargo müşterisi ${stamp}`;
  const carrierName = 'Chronopost';

  const warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `E2E kargo kategori ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `E2E kargo baklava ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '1 kg' }, packedWeightG: 600, packedLengthMm: 140, packedWidthMm: 90, packedHeightMm: 60 }],
  });
  const variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: customerName });
  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 10,
    expiryDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    purchasePriceCents: 200,
  });

  const { order } = await new OrderService(db).create(
    {
      warehouseId,
      customerId: profile.id,
      channel: 'b2c',
      deliveryType: 'shipping',
      // Adres kopyası siparişin kendisinde durur; operasyon ekranı alıcıyı oradan okuyor.
      addressSnapshot: { country: 'FR', postalCode: '75001', city: 'Paris', recipient: `Alıcı ${stamp}`, line1: '1 rue de Rivoli' },
    },
    [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  // `ready`: kutular mühürlenmiş, sevke hazır. Geçiş motoru bu testin konusu değil (order-fixture'ın kararı).
  await db.from('order').update({ status: 'ready' }).eq('id', order.id);

  const shipment = await new ShipmentService(db).insert({
    orderId: order.id,
    warehouseId,
    status: 'handed_over',
    providerShipmentId: `e2e-${stamp}`,
    shippingOptionCode: 'chronopost:shop2shop',
    carrierCode: 'chronopost',
    carrierName,
  });

  const boxes = new OrderBoxService(db);
  const parcelRefs: string[] = [];
  const trackingNumbers: string[] = [];
  for (let n = 1; n <= 2; n++) {
    const ref = `e2e-p-${stamp}-${n}`;
    const tracking = `E2E${stamp}${n}`;
    const box = await boxes.insert({ orderId: order.id, warehouseId, boxNo: n, code: `E2E-KT-${stamp}-${n}` });
    await db
      .from('order_box')
      .update({
        sealed_at: new Date().toISOString(),
        shipment_id: shipment.id,
        provider_parcel_ref: ref,
        tracking_number: tracking,
        tracking_url: `https://takip.test/${tracking}`,
      })
      .eq('id', box.id);
    parcelRefs.push(ref);
    trackingNumbers.push(tracking);
  }

  return {
    stamp,
    orderId: order.id,
    shipmentId: shipment.id,
    customerName,
    carrierName,
    trackingNumbers,
    taşıyıcıSöyledi: async (code: string) => {
      const sonuc = await syncShipmentStatus(
        db,
        providerStub({ status: async () => parcelRefs.map((parcelId) => ({ parcelId, trackingNumber: null, code, message: null })) }),
        { shipmentId: shipment.id },
      );
      // Sessiz başarısızlık YOK: uzlaştırma ilerleyemezse senaryo kendi kurulumuna aldanmasın.
      if (sonuc.status !== 'ok') throw new Error(`e2e kargo fikstürü: uzlaştırma ilerlemedi (${sonuc.status})`);
    },
    cleanup: async () => {
      // `shipment` ve `order_box` siparişten CASCADE düşüyor; purge sırası onun bilgisi (§4b).
      await purgeTestData(db, {
        orderIds: [order.id],
        productIds: [product.id],
        categoryIds: [category.id],
        profileIds: [profile.id],
        warehouseIds: [warehouseId],
      });
    },
  };
}
