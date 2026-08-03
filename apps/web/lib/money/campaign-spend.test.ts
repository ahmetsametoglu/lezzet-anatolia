import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordAdvertisingExpense, recordExpense } from './movement';

/**
 * Reklam gideri + kampanya kırılımı (12.5) — DOMAIN §350. 13.2'nin ROI tablosunun **gider sütunu**
 * budur; ciro sütunu analitikten gelir.
 *
 * Doğrulanan asıl şey toplama değil, **hiçbir reklam parasının rapordan düşmemesi**: etiketsiz satır
 * da, farklı tipteki reklam ödemesi de görünür. Rapor eksik gösterirse ROI sessizce şişer.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
/** Kampanya adları damgalı, dönem de seed'in dokunmadığı geçmişte — rapor şirket geneli okur. */
const BAYRAM = `bayram-${stamp}`;
const YILBASI = `yilbasi-${stamp}`;
let bankAccount: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const PERIOD = { from: dayOffset(-200), to: dayOffset(-180) };

beforeAll(async () => {
  bankAccount = (await accounts.insert({ name: `Reklam bankası ${stamp}`, type: 'bank' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', bankAccount);
});

afterAll(async () => {
  await purgeTestData(db, { accountIds: [bankAccount] });
});

/** Dönemdeki kampanya kırılımı — testin açtığı satırlar dışındakiler bu pencereye düşmez. */
const rapor = () => movements.campaignSpend(PERIOD.from, PERIOD.to);

describe('reklam gideri kampanya etiketiyle girer', () => {
  it('etiket `meta.campaign`e, kategori `advertising`e yazılır', async () => {
    const result = await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 25_000, campaign: BAYRAM, valueDate: dayOffset(-190) });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement).toMatchObject({ type: 'expense', direction: 'out', category: 'advertising', meta: { campaign: BAYRAM } });
  });

  it('aynı kampanyanın birden çok ödemesi tek satırda toplanır', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 25_000, campaign: BAYRAM, valueDate: dayOffset(-195) });
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 13_050, campaign: BAYRAM, valueDate: dayOffset(-185) });

    expect(await rapor()).toEqual([{ campaign: BAYRAM, totalCents: 38_050, count: 2 }]);
  });

  it('kampanyalar ayrı satırdır, büyük gider önce gelir', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 9000, campaign: YILBASI, valueDate: dayOffset(-190) });
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 40_000, campaign: BAYRAM, valueDate: dayOffset(-190) });

    expect((await rapor()).map((s) => s.campaign)).toEqual([BAYRAM, YILBASI]);
  });

  it('dönem dışı reklam gideri raporda yoktur — ROI dönemi kendi giderini görür', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 50_000, campaign: BAYRAM, valueDate: dayOffset(-300) });
    expect(await rapor()).toEqual([]);
  });
});

describe('hiçbir reklam parası rapordan düşmez', () => {
  it('etiketsiz reklam gideri ATILMAZ, `null` kovasında görünür', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 20_000, campaign: BAYRAM, valueDate: dayOffset(-190) });
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 7500, valueDate: dayOffset(-190) }); // ajans faturası, kampanyası belirsiz

    const satirlar = await rapor();
    expect(satirlar).toHaveLength(2);
    expect(satirlar.find((s) => s.campaign === null)).toMatchObject({ totalCents: 7500, count: 1 });
    // Kampanyaların toplamı dönemin GERÇEK reklam gideriyle tutar.
    expect(satirlar.reduce((t, s) => t + s.totalCents, 0)).toBe(27_500);
  });

  it('boş etiket kendi kovasını açmaz — etiketsizle aynı yere düşer', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 4000, campaign: '   ', valueDate: dayOffset(-190) });
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 6000, valueDate: dayOffset(-190) });

    expect(await rapor()).toEqual([{ campaign: null, totalCents: 10_000, count: 2 }]);
  });

  it('süzgeç TİP değil KATEGORİ: reklam kategorili başka tipteki ödeme de sayılır', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 10_000, campaign: BAYRAM, valueDate: dayOffset(-190) });
    // Ajansa yapılan sınıflandırılmamış ödeme — tipe göre süzseydik gider eksik, ROI şişkin çıkardı.
    await movements.insert({
      accountId: bankAccount, direction: 'out', amountCents: 5000, type: 'misc',
      category: 'advertising', meta: { campaign: BAYRAM }, valueDate: dayOffset(-190),
    });

    expect(await rapor()).toEqual([{ campaign: BAYRAM, totalCents: 15_000, count: 2 }]);
  });

  it('geri gelen reklam parası gideri AZALTIR — iptal edilen reklam gider olarak kalmaz', async () => {
    await recordAdvertisingExpense({ accountId: bankAccount, amountCents: 30_000, campaign: BAYRAM, valueDate: dayOffset(-195) });
    await movements.insert({
      accountId: bankAccount, direction: 'in', amountCents: 12_000, type: 'misc',
      category: 'advertising', meta: { campaign: BAYRAM }, description: 'Meta reklam kredisi', valueDate: dayOffset(-185),
    });

    expect(await rapor()).toEqual([{ campaign: BAYRAM, totalCents: 18_000, count: 2 }]);
  });

  it('reklam DIŞI gider kampanya raporuna karışmaz', async () => {
    await recordExpense({ accountId: bankAccount, amountCents: 145_000, category: 'kira', valueDate: dayOffset(-190) });
    expect(await rapor()).toEqual([]);
  });
});
