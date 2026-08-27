import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarehouseScope } from '@lezzet/domain-core';
import type { Warehouse } from '@lezzet/types';

/**
 * Operasyon bağlamı kapısı (19.14) — **çerez ile kapsamın kesiştiği yer** ve 27.08'e kadar TESTSİZDİ.
 *
 * Dosya iki ayrı sözü birden veriyor ve ikisi de sessizce bozulabilir cinsten:
 *
 *   1. **Yetki** — çerezi istemci yazabilir. Doğrulanmayan bir bağlam yetki atlatmadır: depocu
 *      çereze başka deponun kimliğini yazar ve o deponun stoğunu okur. Kural tek satır
 *      (`canAccessWarehouse` + aktif depo listesinde olma), ama kırıldığında hiçbir şey patlamaz —
 *      yalnız yanlış deponun verisi görünür.
 *   2. **Yazma hedefi** — `readWorkWarehouse` "malı hangi kapıdan sokacağım" sorusunu yanıtlar ve
 *      `CLAUDE §1`in *"varsayılan depo YOKTUR"* kuralını taşır. Yanlış cevabı iki türlü olur:
 *      sormaması gerekirken sorar (operatöre olmayan bir karar verdirir), ya da sorması gerekirken
 *      kendi seçer (malı yanlış depoya sokar).
 *
 * ── TESTİN ASIL KONUSU: KAPATILMIŞ DEPO ──────────────────────────────────────
 * Kapsam ile ELDEKİ depo aynı şey değil. İki depoya atanmış personelin depolarından biri
 * kapatılmışsa kapsam hâlâ iki kimlik taşır, ama seçilebilir tek depo kalmıştır — doğru davranış
 * SORMAMAKTIR. Bu ayrım `03.12`de ölçüldü: motorun `warehouseOptions`ı kapsamı olduğu gibi
 * döndürüyor ve bu hâlde *"seçim gerekiyor"* diyor, yani buradaki cevapla AYRIŞIYOR. Aşağıdaki
 * testler bugünkü (doğru) davranışı çiviliyor ki motor düzeltilip buraya bağlanırken cevabın
 * değişmediği kanıtlanabilsin.
 *
 * Sınırlar taklit ediliyor (çerez · guard · depo servisi), KARAR taklit edilmiyor: `canAccessWarehouse`
 * gerçek motordan geliyor. Taklit edilen bir kuralın testi kendi kendini onaylar.
 */

const cerez: { deger: string | undefined } = { deger: undefined };
const kapsam: { simdiki: WarehouseScope } = { simdiki: { kind: 'none' } };
const tesisler: { hepsi: Warehouse[] } = { hepsi: [] };
/** Servise giden sorgu — "aktif süzgeci gerçekten isteniyor mu" iddiası için. */
let sonSorgu: { activeOnly?: boolean; warehouseIds?: readonly string[] } | null = null;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cerez.deger === undefined ? undefined : { name, value: cerez.deger }),
    set: vi.fn(),
  }),
}));

vi.mock('@/lib/guard', () => ({
  requireWarehouseScope: async () => ({ user: { id: 'personel' }, scope: kapsam.simdiki }),
}));

vi.mock('@lezzet/database', () => ({
  serviceDb: () => ({}),
  WarehouseService: class {
    // Gerçek `list`in sözleşmesini AYNEN uygular (`warehouse.service.ts:37`): boş dizi = hiçbiri,
    // `activeOnly` pasifi eler, `warehouseIds` kapsamı süzer. Taklit süzmezse test sahte olurdu —
    // kapatılmış depo hâli tam da süzgecin sonucudur.
    list(opts: { activeOnly?: boolean; warehouseIds?: readonly string[] } = {}): Promise<Warehouse[]> {
      sonSorgu = opts;
      if (opts.warehouseIds?.length === 0) return Promise.resolve([]);
      return Promise.resolve(
        tesisler.hepsi.filter(
          (w) => (!opts.activeOnly || w.isActive) && (!opts.warehouseIds || opts.warehouseIds.includes(w.id)),
        ),
      );
    }
  },
}));

const { readWarehouseContext, readWorkWarehouse } = await import('./context');

const depo = (id: string, isActive = true): Warehouse =>
  ({ id, code: id.toUpperCase(), name: `Depo ${id}`, isActive, sortOrder: 0 }) as unknown as Warehouse;

const STR = depo('str');
const COL = depo('col');
const KAPALI = depo('kapali', false);

beforeEach(() => {
  cerez.deger = undefined;
  kapsam.simdiki = { kind: 'none' };
  tesisler.hepsi = [];
  sonSorgu = null;
});

describe('readWorkWarehouse — "malı hangi kapıdan sokacağım"', () => {
  it('kapsamda TEK depo varsa sorulmaz — olmayan bir karar seçenek gibi sunulmaz', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id] };
    tesisler.hepsi = [STR, COL];

    expect(await readWorkWarehouse()).toEqual({ status: 'ok', warehouseId: STR.id, name: STR.name });
  });

  it('kapsam ÇOK depolu ve seçim yapılmamışsa sorulur — sistem onun yerine seçmez', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, COL.id] };
    tesisler.hepsi = [STR, COL];

    expect(await readWorkWarehouse()).toEqual({ status: 'needs_choice' });
  });

  it('seçim yapılmışsa o kazanır', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, COL.id] };
    tesisler.hepsi = [STR, COL];
    cerez.deger = COL.id;

    expect(await readWorkWarehouse()).toEqual({ status: 'ok', warehouseId: COL.id, name: COL.name });
  });

  /*
    `03.12`nin çekirdek hâli. Kapsam İKİ kimlik taşıyor ama biri kapatılmış tesis — geriye
    seçilebilir tek depo kalıyor, dolayısıyla sorulacak bir şey yok. Motorun bugünkü
    `warehouseOptions`ı burada `needsChoice: true` derdi (kapsamı olduğu gibi sayıyor); bu test o
    ayrışmanın buraya sızmasını engelliyor.
  */
  it('kapsamdaki depolardan biri KAPATILMIŞSA geriye tek aktif kalır ve sorulmaz', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, KAPALI.id] };
    tesisler.hepsi = [STR, KAPALI];

    expect(await readWorkWarehouse()).toEqual({ status: 'ok', warehouseId: STR.id, name: STR.name });
    // İddianın dayanağı süzgecin İSTENMİŞ olması: `activeOnly` düşerse bu test sessizce doğru
    // cevabı yanlış sebeple verirdi.
    expect(sonSorgu).toMatchObject({ activeOnly: true });
  });

  it('kapsamdaki depoların HEPSİ kapatılmışsa `none` — boş seçiciye gönderilmez', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [KAPALI.id] };
    tesisler.hepsi = [KAPALI];

    expect(await readWorkWarehouse()).toEqual({ status: 'none' });
  });

  it('`none` ile `needs_choice` AYRI: biri çözülemez, öteki çözülebilir', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, COL.id] };
    tesisler.hepsi = [STR, COL];
    const sorulan = await readWorkWarehouse();

    kapsam.simdiki = { kind: 'limited', warehouseIds: [KAPALI.id] };
    tesisler.hepsi = [KAPALI];
    const cozulemez = await readWorkWarehouse();

    expect(sorulan.status).toBe('needs_choice');
    expect(cozulemez.status).toBe('none');
  });

  it('depo-üstü rolde (`all`) tüm AKTİF tesisler seçenek — çok tesiste sorulur', async () => {
    kapsam.simdiki = { kind: 'all' };
    tesisler.hepsi = [STR, COL, KAPALI];

    expect(await readWorkWarehouse()).toEqual({ status: 'needs_choice' });
    // `all` kapsamda kimlik süzgeci GÖNDERİLMEZ — gönderilseydi admin kendi kapsamıyla sınırlanırdı.
    expect(sonSorgu).toEqual({ activeOnly: true, warehouseIds: undefined });
  });
});

describe('readWarehouseContext — çerez KAPSAMA karşı doğrulanır', () => {
  it('kapsam DIŞI kimlik sessizce düşer, hata üretmez', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id] };
    tesisler.hepsi = [STR, COL];
    cerez.deger = COL.id; // yetkisi olmayan depo

    const ctx = await readWarehouseContext();
    expect(ctx.activeWarehouseId).toBeNull();
    // Ve kapsam dışı depo listede HİÇ görünmez — görüp de seçememek değil, hiç görmemek.
    expect(ctx.warehouses.map((w) => w.id)).toEqual([STR.id]);
  });

  it('KAPATILMIŞ deponun kimliği de düşer — yetki var ama tesis yok', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, KAPALI.id] };
    tesisler.hepsi = [STR, KAPALI];
    cerez.deger = KAPALI.id;

    expect((await readWarehouseContext()).activeWarehouseId).toBeNull();
  });

  it('"all" değeri seçim YOKLUĞUDUR, bir depo kimliği değil', async () => {
    kapsam.simdiki = { kind: 'all' };
    tesisler.hepsi = [STR, COL];
    cerez.deger = 'all';

    const ctx = await readWarehouseContext();
    expect(ctx.activeWarehouseId).toBeNull();
    // Süzgeç yok (admin gerçekten hepsini görür) ama KIRILIM evreni dolu — ikisi ayrı alan.
    expect(ctx.warehouseIds).toBeUndefined();
    expect(ctx.visibleWarehouseIds).toEqual([STR.id, COL.id]);
  });

  it('`limited` + seçimsiz: süzgeç kapsamın AKTİF depoları olur, `undefined` DEĞİL', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, KAPALI.id] };
    tesisler.hepsi = [STR, KAPALI];

    const ctx = await readWarehouseContext();
    // `undefined` "hiç süzme" demektir; burada olsaydı depocu tüm ağın siparişlerini görürdü.
    expect(ctx.warehouseIds).toEqual([STR.id]);
  });

  it('tek depo seçiliyken kırılım evreni yalnız o depodur', async () => {
    kapsam.simdiki = { kind: 'limited', warehouseIds: [STR.id, COL.id] };
    tesisler.hepsi = [STR, COL];
    cerez.deger = STR.id;

    const ctx = await readWarehouseContext();
    expect(ctx.warehouseIds).toEqual([STR.id]);
    expect(ctx.visibleWarehouseIds).toEqual([STR.id]);
  });
});
