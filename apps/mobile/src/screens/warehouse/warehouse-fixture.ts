import type {
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
  (`near-expiry-fixture.ts`, `courier-return-fixture.ts`) ve gerekçeleri kendi künyelerinde.
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
    ...overrides,
  };
}

export function intakeRow(overrides: Partial<IntakeFormRowContract> = {}): IntakeFormRowContract {
  return {
    variantId: uuid(41),
    productName: 'Antep Fıstığı',
    variantLabel: '5 kg',
    expectedQty: 10,
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
      { lineId: uuid(71), sourceStockId: STOCK_A, name: 'Mantı · 500 g', dispatchedQty: 4, receivedQty: null },
      { lineId: uuid(72), sourceStockId: STOCK_B, name: 'Künefe · 2 kişilik', dispatchedQty: 2, receivedQty: null },
    ],
    ...overrides,
  };
}
