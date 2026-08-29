import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@lezzet/types';
import { closureConsequences, openOrderCountOf, toStaffChips, toWarehouseRows } from './warehouses-read';
import type { WarehouseCardView, ZoneCardView } from './warehouses-types';

// Depolar ekranının SAF indirgemeleri. DB'siz: girdiler zaten okunmuş satırlar.
//
// Test edilenler ekranın YALAN SÖYLEYEBİLECEĞİ yerler: "kurulumu eksik" hangi hâlde doğar, açık iş
// hangi durumları sayar, kapatma hangi sonuçları üretir. Üçü de sessizce yanlış olabilecek kararlar —
// bir tanesi yanlışsa operatör kapatılmaması gereken bir depoyu kapatır.

const WAREHOUSE = {
  id: 'w1',
  code: 'STR',
  name: 'Strasbourg',
  kind: 'facility' as const,
  countryCode: 'FR' as const,
  address: null,
  shipsOnline: false,
  isActive: true,
  sortOrder: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

function rowsOf(over: Partial<typeof WAREHOUSE> = {}, extra: Partial<Parameters<typeof toWarehouseRows>[0]> = {}) {
  return toWarehouseRows({
    warehouses: [{ ...WAREHOUSE, ...over }],
    zones: [],
    staff: [],
    batches: [],
    transfers: [],
    ...extra,
  });
}

const ZONE = {
  id: 'z1',
  name: 'Merkez',
  warehouseId: 'w1',
  weekdays: [2],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  postalCodes: [{ country: 'FR' as const, postalCode: '67000' }],
};

/** Kapsam dizisi dışında hiçbir alanı okunmayan asgari profil. */
function staffRow(id: string, warehouseIds: string[], roles: string[] = ['warehouse']) {
  return { id, name: `Kişi ${id}`, roles, warehouseIds } as never;
}

describe('kurulum eksikliği', () => {
  it('bölgesi ve kargo çıkışı olmayan AKTİF depo ulaşılamazdır', () => {
    const [row] = rowsOf();
    expect(row!.setupGap).toContain('hiçbir sipariş buraya çözülmez');
  });

  it('kargo çıkışı olan depo bölgesiz de sipariş alır — o dal düşer', () => {
    const [row] = rowsOf({ shipsOnline: true }, { staff: [staffRow('p1', ['w1'])] });
    expect(row!.setupGap).toBeNull();
  });

  it('bölgesi olan ama personeli olmayan depoda mal İŞLENEMEZ — ayrı bir eksiklik', () => {
    const [row] = rowsOf({}, { zones: [ZONE] });
    expect(row!.setupGap).toContain('kapsamlı personeli yok');
    expect(row!.setupGap).not.toContain('hiçbir sipariş');
  });

  it('PASİF bölge kurulumu tamamlamaz — bugün hiçbir adresi çözmez', () => {
    const [row] = rowsOf({}, { zones: [{ ...ZONE, isActive: false }], staff: [staffRow('p1', ['w1'])] });
    expect(row!.setupGap).toContain('hiçbir sipariş buraya çözülmez');
    expect(row!.activeZoneCount).toBe(0);
    // Kod sayacı da yalnız aktif bölgelerden: "1 posta kodu bağlı" demek bir vaat olurdu.
    expect(row!.postalCodeCount).toBe(0);
  });

  it('KAPALI depoda kurulum eksikliği sorulmaz — kapalılık bir arıza değil', () => {
    const [row] = rowsOf({ isActive: false });
    expect(row!.setupGap).toBeNull();
  });
});

describe('açık iş', () => {
  const counts = (entries: Array<[OrderStatus, number]>) => openOrderCountOf(new Map(entries));

  it('kapanmış dallar ve taslak sayılmaz', () => {
    expect(counts([['delivered', 5], ['completed', 3], ['cancelled', 2], ['returned', 1], ['draft', 4]])).toBe(0);
  });

  it('yoldaki ve hazırlıktaki iş sayılır', () => {
    expect(counts([['confirmed', 2], ['preparing', 1], ['ready', 3], ['out_for_delivery', 1], ['delivered', 9]])).toBe(7);
  });
});

describe('kapatmanın sonuçları', () => {
  /**
   * Bölge fikstürü — ağırlık alanları (19.28) varsayılan sıfır. Kapatma kararı onlara BAKMIYOR:
   * bir bölgenin cirosu, kapanınca adreslerinin sahipsiz kalmasını değiştirmez. Fikstürde durmaları
   * yalnız tipin gereği, testin konusu değil.
   */
  const zone = (over: Partial<ZoneCardView> = {}): ZoneCardView => ({
    id: 'z1',
    name: 'Merkez',
    isActive: true,
    weekdays: [],
    postalCodes: [],
    orderCount: 0,
    revenueCents: 0,
    waitingCount: 0,
    nextDeliveryDate: null,
    ...over,
  });

  const card = (over: Partial<WarehouseCardView> = {}): WarehouseCardView => ({
    row: rowsOf()[0]!,
    zones: [],
    staff: [],
    printers: [],
    // Kargo kutuları bu dosyanın konusu değil (URL/okuma çözümü) — boş künye.
    shippingBoxes: { boxes: [], adoptable: [] },
    points: [],
    measureTruncated: false,
    scorecard: {
      variantCount: 0,
      batchCount: 0,
      nearExpiryCount: 0,
      expiredCount: 0,
      riskCents: null,
      belowMinCount: 0,
      inTransitIn: 0,
      openOrderCount: 0,
      lastIntakeAt: null,
    },
    ...over,
  });

  it('sonucu olmayan tesiste uyarı ÜRETİLMEZ — gürültü sonraki gerçek uyarıyı da okutmaz', () => {
    expect(closureConsequences(card())).toEqual([]);
  });

  it('stok, aktif bölge, tek kapsamlı personel ve gelen sevkiyat ayrı ayrı sayılır', () => {
    const result = closureConsequences(
      card({
        zones: [zone({ isActive: true, weekdays: [2], postalCodes: [{ country: 'FR', postalCode: '67000' }] })],
        staff: [{ id: 'p1', name: 'Yusuf D.', roleText: 'Depo', onlyHere: true }],
        scorecard: { ...card().scorecard, batchCount: 88, variantCount: 41, inTransitIn: 1 },
      }),
    );
    expect(result.map((c) => c.weight)).toEqual(['hardest', 'heavy', 'heavy', 'pending']);
    expect(result[0]!.body).toContain('88 parti');
    expect(result[2]!.body).toContain('Yusuf D.');
  });

  it('PASİF bölge sahipsiz adres bırakmaz — o dal düşer', () => {
    const result = closureConsequences(
      card({ zones: [zone({ isActive: false })] }),
    );
    expect(result).toEqual([]);
  });

  it('kargo çıkış deposu kapanınca ülkenin bölge dışı satışı durur — en sert dal', () => {
    const row = { ...rowsOf({ shipsOnline: true })[0]!, shipsOnline: true };
    const result = closureConsequences(card({ row }));
    expect(result.map((c) => c.title)).toContain('Ülkenin kargo çıkış deposu bu');
  });
});

describe('bağlı personel', () => {
  it('tek kapsamı burası olan kişi işaretlenir; çok kapsamlı olan işaretlenmez', () => {
    const chips = toStaffChips([staffRow('a', ['w1']), staffRow('b', ['w1', 'w2'])], 'w1');
    expect(chips.map((c) => c.onlyHere)).toEqual([true, false]);
  });

  it('kapsamında bu depo olmayan kişi HİÇ listelenmez', () => {
    expect(toStaffChips([staffRow('a', ['w2'])], 'w1')).toEqual([]);
  });
});
