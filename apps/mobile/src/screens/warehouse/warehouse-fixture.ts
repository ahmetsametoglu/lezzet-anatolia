import type {
  NearExpiryBatchContract,
  InboundTransferContract,
  IntakeFormRowContract,
  PreparationBoxContract,
  PreparationLineContract,
  PreparationOrderContract,
} from '@lezzet/types';

/*
  DEPO EKRAN TESTLERİNİN ORTAK SATIRLARI.

  TEK YERDE durmasının sebebi sözleşmenin kendisi (kurye/katalog fixture'larıyla aynı gerekçe):
  `PreparationLine` bir alan kazandığında bütün testler birden DERLEMEDE kırılsın ve hepsi
  güncellensin — ayrı ayrı yazılmış yer tutucuların biri mutlaka eskir.

  Satırlar v2'nin demo verisinden türetildi (v2:970-1000): iki kalemli B2B siparişi, çıpalı kalem,
  beklenenden sapan kabul satırı, iki kalemli rampa transferi. Kimlikler UUID biçiminde çünkü şema
  öyle istiyor.

  **Bu dosya YALNIZ testlerindir** — ekranların ürün fixture'ları ayrı yaşıyor
  (`courier-return-fixture.ts`) ve gerekçeleri kendi künyelerinde. **D3'ünki 31.08'de SÖKÜLDÜ** —
  uç açıldı (`/api/v1/warehouse/near-expiry`) ve liste gerçek partileri taşıyor (21.187).
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const ORDER_ID = uuid(1);
export const ITEM_A = uuid(11);
export const ITEM_B = uuid(12);
export const STOCK_A = uuid(21);
export const STOCK_B = uuid(22);

export function preparationLine(overrides: Partial<PreparationLineContract> = {}): PreparationLineContract {
  return {
    itemId: ITEM_A,
    variantId: uuid(31),
    productName: 'Fıstıklı Baklava',
    variantLabel: '1 kg',
    // Kapaksız ürün varsayılan: ekranın monogram düşüşü de böylece her testte sınanıyor (31.08).
    imageUrl: null,
    barcode: '8691000030009',
    // 21.11d: kuyruk artık mevcut parti dağılımını taşıyor — varsayılan "hiç kayıt yok".
    pickedBatches: [],
    orderedQty: 2,
    pickedQty: 0,
    pinnedStockId: null,
    suggestion: [{ stockId: STOCK_A, qty: 2, expiryDate: '2026-08-12', areaName: 'A-1' }],
    shortfallQty: 0,
    ...overrides,
  };
}

export function preparationOrder(overrides: Partial<PreparationOrderContract> = {}): PreparationOrderContract {
  const lines = overrides.lines ?? [preparationLine()];
  return {
    orderId: ORDER_ID,
    referenceNo: 'LZA-26-3M8C',
    customerName: 'Restaurant Bosphore',
    // Varsayılan `null` = alıcı hesabın sahibiyle aynı (yaygın hâl); koli adı satırı çizilmez.
    recipientName: null,
    channel: 'b2b',
    status: 'confirmed',
    deliveryDate: '2026-08-09',
    // Varsayılan ROTA kulvarı: kutu tipi sorusu kargoya özgüdür ve testlerin çoğu onu görmemeli.
    deliveryType: 'route',
    lineCount: lines.length,
    pickedLineCount: 0,
    // 23.6: kuyruk kutuları da taşıyor — varsayılan "kutusuz akış" (eski yol).
    boxes: [],
    ...overrides,
    lines,
  };
}

/** Kutu (23.6) — varsayılan AÇIK ve boş: masada doldurulmayı bekleyen hâl. */
export function preparationBox(overrides: Partial<PreparationBoxContract> = {}): PreparationBoxContract {
  return {
    boxId: '00000000-0000-4000-8000-0000000000b1',
    boxNo: 1,
    code: 'KT-26-4K2M9P7HWX',
    sealedAt: null,
    items: [],
    // Varsayılan "tip seçilmedi" — rota kutusunun ve 07.12 öncesi açılmış kutuların hâli.
    shippingBoxId: null,
    ...overrides,
  };
}

export function intakeRow(overrides: Partial<IntakeFormRowContract> = {}): IntakeFormRowContract {
  return {
    variantId: uuid(41),
    productName: 'Antep Fıstığı',
    variantLabel: '5 kg',
    expectedQty: 10,
    // Tedarikçi kodu DOLU, SKU boş: fikstürün varsayılanı PO'lu satırdır ve orada satırı tanıtan
    // kod tedarikçinindir. Plansız satırı sınayan test tersini `overrides` ile verir.
    supplierCode: 'GAZ-7120',
    sku: null,
    // Uzun ömürlü bir DDM ürünü: varsayılan satır ömür uyarısı ÜRETMEMELİ — uyarıyı sınayan test
    // kısa ömrü ve yakın tarihi kendisi verir, öteki testler gürültüsüz kalır.
    dateType: 'DDM',
    shelfLifeDays: 360,
    // Koli boyu YOK varsayılanda: kayıtlı boyu olmayan ürün de meşrudur ve adet çekmecesi o hâlde
    // yalnız tek paket sayar. Koli sayımını sınayan test boyları kendisi verir.
    caseSizes: [],
    // Lot ADAYI YOK varsayılanda (21.175): depoda o varyanttan kodlu parti bulunmayan hâl de
    // meşrudur ve çekmece o zaman yalnız aynı kabuldeki kodları önerir. Öneriyi sınayan test
    // adayları kendisi verir.
    lotCandidates: [],
    ...overrides,
  };
}

/**
 * D3 · yakın-SKT satırı (21.187) — kapı cevabının şekli.
 *
 * Varsayılan: kararı olan, ömrü ölçülmüş, kodu yazılmış bir parti. Testler istisnayı kendileri
 * verir (kodsuz parti, ölçülemeyen ömür, imhalık karar).
 */
export function nearExpiryBatch(overrides: Partial<NearExpiryBatchContract> = {}): NearExpiryBatchContract {
  return {
    stockId: '00000000-0000-4000-8000-000000000401',
    lotNumber: 'P-0401',
    productName: 'Su Böreği',
    variantLabel: 'tepsi',
    qty: 6,
    expiryDate: '2026-09-02',
    daysLeft: 2,
    remainingPercent: 18,
    decision: 'can_offer',
    belowMlor: true,
    dateType: 'DDM',
    shelfLabel: 'A-12',
    productStockQty: 24,
    ...overrides,
  };
}

export function inboundTransfer(overrides: Partial<InboundTransferContract> = {}): InboundTransferContract {
  return {
    transferId: uuid(51),
    referenceNo: 'TRF-COL-26-0007',
    fromWarehouseId: uuid(61),
    dispatchedAt: '2026-08-07T09:00:00.000Z',
    note: 'rampa',
    lines: [
      { lineId: uuid(71), sourceStockId: STOCK_A, name: 'Mantı · 500 g', dispatchedQty: 4, receivedQty: null, caseSizes: [] },
      { lineId: uuid(72), sourceStockId: STOCK_B, name: 'Künefe · 2 kişilik', dispatchedQty: 2, receivedQty: null, caseSizes: [] },
    ],
    ...overrides,
  };
}
