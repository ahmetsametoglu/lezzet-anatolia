import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, CategoryService, OrderService, ProductService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { recordOrderPayment } from '@lezzet/application';
// Beklenen şekil ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME kırılır.
import type { MoneyDayEnd, MoneyOverview } from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, type SignedInUser } from '../../lib/testing';

/**
 * PARA UÇLARI (21.12 · M1/M2) — çivilenen üç karar:
 *
 *  1. **Kapı `accounting` + `admin`** — kurye/depocu para özetini GÖREMEZ (403). Bearer'sız 401
 *     `router.test`in KORUMALI beyanında.
 *  2. **Bekleyen tahsilat GÜNÜN ödenmemiş siparişlerinden türetilir** — kendi kurduğumuz satır
 *     listede kalan tutarıyla görünmeli (paylaşılan DB: yalnız KENDİ satırımızı ararız, küresel
 *     sayı iddia edilmez — CLAUDE §4b).
 *  3. **Gün sonu bir MUTABAKAT özetidir**: kapanan sefer yokken fark `null` gelir, 0 değil —
 *     0 "fark yok" derdi, oysa soru henüz sorulmadı.
 */
const db = serviceDb();
const stamp = Date.now();

let muhasebeci: SignedInUser;
let kurye: SignedInUser;
let musteri: SignedInUser;
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let orderId: string;
let partialOrderId: string;
let accountId: string;

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Para ucu ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Peynirli Poğaça ${stamp}` },
    categoryId,
  });
  productId = product.id;
  variantId = variants[0]!.id;

  muhasebeci = await createSignedInUser({ prefix: 'money', label: 'muhasebeci', roles: ['accounting'], warehouseIds: [warehouseId] });
  kurye = await createSignedInUser({ prefix: 'money', label: 'kurye', roles: ['courier'], warehouseIds: [warehouseId] });
  musteri = await createSignedInUser({ prefix: 'money', label: 'musteri', roles: ['customer'], warehouseIds: [] });

  // Bugün teslim edilecek, ödemesi kapıda bekleyen sipariş — M1'in "bekleyen tahsilat" satırı.
  const created = await new OrderService(db).create(
    {
      customerId: musteri.profileId,
      warehouseId,
      channel: 'b2c',
      status: 'confirmed',
      deliveryType: 'pickup',
      deliveryDate: today,
      paymentMethod: 'cash',
      orderedTotalCents: 2600,
    },
    [{ variantId, qty: 2, unitPriceCents: 1300, vatRate: 5.5 }],
  );
  orderId = created.order.id;

  // ── KISMİ ödenmiş sipariş + GERÇEK tahsilat hareketi: yöntem kırılımı ve gün sonu bu deftere
  // bakar. Hesap TESTİN KENDİ hesabıdır (purge `accountIds` ile toplar) — işletmenin Kasa'sına
  // test hareketi yazmak, paylaşılan defteri kirletmek olurdu (CLAUDE §4b).
  accountId = (await new AccountService(db).insert({ name: `Test Kasa ${stamp}`, type: 'cash' })).id;
  const partial = await new OrderService(db).create(
    {
      customerId: musteri.profileId,
      warehouseId,
      channel: 'b2c',
      status: 'confirmed',
      deliveryType: 'pickup',
      deliveryDate: today,
      paymentMethod: 'cash',
      orderedTotalCents: 2000,
    },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  partialOrderId = partial.order.id;
  const payment = await recordOrderPayment(db, { orderId: partialOrderId, accountId, amountCents: 600 });
  if (payment.status !== 'ok') throw new Error(`fikstür: tahsilat yazılamadı (${payment.status})`);
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [muhasebeci.profileId, kurye.profileId, musteri.profileId],
    warehouseIds: [warehouseId],
    accountIds: [accountId],
  });
});

const get = (user: SignedInUser, path: string) => app.request(`/api/v1/money/${path}`, { headers: bearer(user.token) });

describe('GET /money/overview', () => {
  it('MUHASEBECİ okuyor — kendi kurduğumuz ödenmemiş sipariş kalan tutarıyla listede', async () => {
    const res = await get(muhasebeci, 'overview');
    expect(res.status).toBe(200);
    const data = await envelopeData<MoneyOverview>(res);

    const row = data.pending.find((pending) => pending.orderId === orderId);
    expect(row).toMatchObject({
      kind: 'door',
      remainingCents: 2600,
      method: 'cash',
      customerName: 'musteri',
    });
    // Yapı sözleşme şeklinde: kırılım ve float alanları var (sayıları küresel, değerleri iddia etmeyiz).
    expect(Array.isArray(data.todayByMethod)).toBe(true);
    expect(typeof data.todayCount).toBe('number');
    /* FLOAT SEFER BAŞINA (30.08) — önce tek toplamdı. Satır varsa künyesi TAM olmalı: para
       kimdeyse o seferin referansı yazılı olmadan "kuryenin üstünde" cümlesi kimi işaret ettiğini
       söyleyemez. Küresel veride satır olup olmadığını iddia etmeyiz, ŞEKLİNİ ederiz. */
    expect(Array.isArray(data.courierFloat)).toBe(true);
    for (const row of data.courierFloat) {
      expect(typeof row.referenceNo).toBe('string');
      expect(typeof row.cashCents).toBe('number');
    }
  });

  it('KURYE 403 — para özeti rol kapısının arkasında', async () => {
    expect((await get(kurye, 'overview')).status).toBe(403);
  });
});

describe('GET /money/day-end', () => {
  it('mutabakat özeti sözleşme şeklinde; iade hiçbir zaman pozitif değil', async () => {
    const res = await get(muhasebeci, 'day-end');
    expect(res.status).toBe(200);
    const data = await envelopeData<MoneyDayEnd>(res);

    expect(data.date).toBe(today);
    expect(data.refundCents).toBeLessThanOrEqual(0);
    expect(data.collectedCents).toBeGreaterThanOrEqual(0);
    // Fark ya null (kapanan sefer yok) ya iki sayı — 0'a düşürülmüş bir "bilinmiyor" olamaz.
    if (data.discrepancy !== null) {
      expect(typeof data.discrepancy.expectedCents).toBe('number');
      expect(typeof data.discrepancy.countedCents).toBe('number');
      /* KÜNYE YALNIZ FARKI OLAN SEFERDEN (30.08) — tutan kapanış listeye girmez; girseydi
         muhasebeci farkı olanı aramak zorunda kalırdı. Sıfır farklı bir satır bulunması bir
         hata değil bir çelişki olurdu. */
      for (const run of data.discrepancy.runs) {
        expect(run.differenceCents).not.toBe(0);
        expect(typeof run.referenceNo).toBe('string');
      }
    }
  });

  it('KURYE 403', async () => {
    expect((await get(kurye, 'day-end')).status).toBe(403);
  });
});

describe('M1/M2 · gerçek tahsilatın izi', () => {
  it('kısmi ödenmiş sipariş KALANIYLA listede; ödenen tutar rakam olarak tekrarlanmaz', async () => {
    const data = await envelopeData<MoneyOverview>(await get(muhasebeci, 'overview'));
    const row = data.pending.find((pending) => pending.orderId === partialOrderId);
    expect(row).toMatchObject({ kind: 'partial', remainingCents: 1400, method: 'cash' });
  });

  it('yöntem kırılımı ve gün sonu tahsilatı DEFTERDEN sayar — bizim hareket alt sınırdır', async () => {
    const overview = await envelopeData<MoneyOverview>(await get(muhasebeci, 'overview'));
    const cash = overview.todayByMethod.find((rowx) => rowx.method === 'cash');
    // Paylaşılan DB: eşitlik değil ALT SINIR — bizim 6,00 €'luk hareket var oldukça nakit ≥ 600.
    expect(cash).toBeDefined();
    expect(cash!.cents).toBeGreaterThanOrEqual(600);

    const dayEnd = await envelopeData<MoneyDayEnd>(await get(muhasebeci, 'day-end'));
    expect(dayEnd.collectedCents).toBeGreaterThanOrEqual(600);
  });
});
