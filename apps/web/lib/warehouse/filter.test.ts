import { describe, expect, it } from 'vitest';
import { warehouseFilterOf } from './filter';
import type { WarehouseContext } from './context';
import type { Warehouse } from '@lezzet/types';

// Depo ekseninin DAVRANIŞ kuralları (`design/pages/operasyon-depo-ekseni.md §3`). Bunlar bir
// görünüm tercihi değil sözleşme: süzgecin bağlamı ezmediği, bağlamın süzgeci kapsadığı ve uymayan
// süzgecin SESSİZCE düşmediği burada sabitleniyor.
//
// DB'ye vurmaz — `warehouseFilterOf` saf bir türetme (birim projesinde koşar).

const warehouse = (id: string, code: string, name: string): Warehouse =>
  ({ id, code, name, countryCode: 'FR', address: null, shipsOnline: false, isActive: true, sortOrder: 0, createdAt: '' }) as Warehouse;

const STR = warehouse('w-str', 'STR', 'Strasbourg');
const KEHL = warehouse('w-kehl', 'KEHL', 'Kehl');

const ctx = (patch: Partial<WarehouseContext> = {}): WarehouseContext => ({
  scope: { kind: 'all' },
  warehouses: [STR, KEHL],
  activeWarehouseId: null,
  warehouseIds: undefined,
  visibleWarehouseIds: [STR.id, KEHL.id],
  ...patch,
});

describe('tablo depo süzgeci', () => {
  it('süzgeç yokken bağlamın evrenini olduğu gibi geçirir', () => {
    const f = warehouseFilterOf(ctx(), '');
    expect(f.warehouseIds).toBeUndefined();
    expect(f.active).toBeNull();
    expect(f.available).toBe(true);
  });

  it('kod eşleşince YALNIZ o depoya daraltır — bağlam değişmez', () => {
    const base = ctx();
    const f = warehouseFilterOf(base, 'STR');
    expect(f.warehouseIds).toEqual([STR.id]);
    expect(f.active?.code).toBe('STR');
    // Kural 1: süzgeç bağlamı ASLA yazmaz.
    expect(base.activeWarehouseId).toBeNull();
    expect(base.warehouseIds).toBeUndefined();
  });

  it('küçük harfli ve boşluklu kodu çözer (elle yazılan link)', () => {
    expect(warehouseFilterOf(ctx(), ' str ').active?.code).toBe('STR');
  });

  it('kapsam dışı kod DÜŞER ve bildirilir — sessizce yok sayılmaz (kural 7)', () => {
    const f = warehouseFilterOf(ctx(), 'COL');
    expect(f.active).toBeNull();
    expect(f.dropped).toBe('COL');
    // Liste bağlamın evreniyle açılır: boş küme değil, daha geniş ama YETKİLİ bir görüş.
    expect(f.warehouseIds).toBeUndefined();
  });

  it('bağlam tek depoya inince süzgeç KAYBOLUR (kural 2)', () => {
    const single = ctx({ activeWarehouseId: STR.id, warehouseIds: [STR.id], visibleWarehouseIds: [STR.id] });
    const f = warehouseFilterOf(single, 'KEHL');
    expect(f.available).toBe(false);
    expect(f.active).toBeNull();
    // Kural 3: "bağlam=STR iken süzgeç=KEHL" üretilemez — ve üretilmeye çalışılırsa bildirilir.
    expect(f.dropped).toBe('KEHL');
    expect(f.warehouseIds).toEqual([STR.id]);
  });

  it('tek depolu bağlamda KENDİ deposunun kodu gürültüdür, uyarı üretmez', () => {
    const single = ctx({ activeWarehouseId: STR.id, warehouseIds: [STR.id], visibleWarehouseIds: [STR.id] });
    expect(warehouseFilterOf(single, 'STR').dropped).toBeNull();
  });

  it('tek depolu KURULUMDA süzgeç hiç çizilmez (daraltacak bir şey yok)', () => {
    const only = ctx({ warehouses: [STR], visibleWarehouseIds: [STR.id] });
    expect(warehouseFilterOf(only, '').available).toBe(false);
  });

  it('seçenekler kapsamdan türer — kapsam dışı depo listede YOKTUR (kural 8)', () => {
    const limited = ctx({
      scope: { kind: 'limited', warehouseIds: [STR.id] },
      warehouses: [STR],
      warehouseIds: [STR.id],
      visibleWarehouseIds: [STR.id],
    });
    expect(warehouseFilterOf(limited, '').options.map((o) => o.code)).toEqual(['STR']);
  });
});
