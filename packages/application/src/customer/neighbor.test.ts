import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  DeliveryZoneService,
  NeighborInviteService,
  OrderService,
  ProductService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import {
  acceptNeighborInvite,
  countNeighborInviteUses,
  neighborInviteUrl,
  openNeighborInvite,
  readNeighborWelcome,
  remainingNeighborInviteUses,
} from './neighbor';

/**
 * KOMŞU DAVETİ — sefere bağlı ödülün karar katmanı (21.93 · MB-56).
 *
 * ── NEDEN BU MODÜL, NEDEN ŞİMDİ ─────────────────────────────────────────────
 * Davet PARAYA dokunuyor: her kabul edilen komşu 100 puanlık bir ödülün önkoşulu ve kullanım hakkı
 * SINIRLI. Buradaki her karar yanlış tarafa düştüğünde ya müşteriye tutulmayacak bir söz verilir
 * ya hak ettiği ödül doğmaz — ikisi de hata vermez.
 *
 * ── ÇİVİLENEN DÖRT KARAR ────────────────────────────────────────────────────
 * 1. **Davet İDEMPOTENT açılır.** İkinci çağrı yeni bağlantı doğurursa müşterinin PAYLAŞTIĞI
 *    bağlantı sessizce ölür — ve bunu ancak komşusu tıklayıp "tanımadık" görünce fark eder.
 * 2. **Karşılamada sıra: `self` → pencere → doluluk.** Kendi bağlantısını açan müşteriye
 *    *"kullanım hakkı doldu"* demek doğru ama işe yaramaz bir cümle; ona söylenecek şey
 *    bağlantısının ÇALIŞTIĞIDIR.
 * 3. **Kullanım siparişten TÜRETİLİR, sayaçtan değil — ve İPTAL sayılmaz.** Sayaç tutulsaydı iptal
 *    edilen sipariş hakkı geri vermezdi: müşteri üç komşu çağırma hakkını, gelmemiş bir siparişe
 *    kaptırırdı.
 * 4. **Kalan hak SIFIRIN ALTINA düşmez.** Tavan davet açılırken donuyor; ayar sonradan düşerse
 *    çıplak çıkarma negatif verir ve ekran *"-1 komşu daha yararlanabilir"* yazardı.
 *
 * ── KÜRESEL SAYIYA BAKILMIYOR (`CLAUDE §4b`) ────────────────────────────────
 * Üç ajan aynı veritabanını paylaşıyor. Her iddia yalnız BU testin kurduğu davet ve siparişleri
 * sayıyor; "toplam kaç davet var" gibi bir ölçüt başka şeridin verisiyle oynar.
 */
const db = serviceDb();
const orders = new OrderService(db);
const invites = new NeighborInviteService(db);

const stamp = Date.now();
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let zoneId: string;
let inviterId: string;
let neighborId: string;
let otherId: string;
const createdProfiles: string[] = [];

/** Sefer AÇIK olsun diye teslimat günü ileriye alınır — kesim saati testin koştuğu saate bağlanmasın. */
const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'KMS' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Komşu testi ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Komşu böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  // Davet eden ad SOYADIYLA açılır: karşılama yalnız İLK adı vermeli (bağlantı tanımadığımız
  // kanallarda dolaşıyor) ve bunu ancak soyadı VARKEN ölçebiliriz.
  const inviter = await profiles.insert({ name: 'Ayşe Yılmaz', email: `davet-eden-${stamp}@example.test` });
  const neighbor = await profiles.insert({ name: 'Mehmet Demir', email: `komsu-${stamp}@example.test` });
  const other = await profiles.insert({ name: 'Zeynep Kaya', email: `ucuncu-${stamp}@example.test` });
  inviterId = inviter.id;
  neighborId = neighbor.id;
  otherId = other.id;
  createdProfiles.push(inviter.id, neighbor.id, other.id);

  // Rota HER GÜN koşar: testin hangi gün koştuğu davranışı değiştirmesin (kurye testinin kararı).
  zoneId = (await new DeliveryZoneService(db).insert({
    name: `Komşu testi rotası ${stamp}`,
    warehouseId,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;

  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 100,
    expiryDate: ileriGun(60),
    purchasePriceCents: 300,
  });
});

beforeEach(async () => {
  // Davet SİPARİŞ BAŞINA tek (`order_id unique`) — her senaryo kendi siparişini kurar, önceki
  // turun daveti kalırsa `openNeighborInvite` onu döner ve iddia yanlış şeyi ölçer.
  for (const id of createdProfiles) await db.from('order').delete().eq('customer_id', id);
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

/** Rota siparişi — davetin açılabilmesi için gereken en kısa yol. */
async function rotaSiparisi(opts: { customerId?: string; date?: string } = {}) {
  const { order } = await orders.create(
    {
      warehouseId,
      customerId: opts.customerId ?? inviterId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryZoneId: zoneId,
      deliveryDate: opts.date ?? ileriGun(3),
      totalCents: 2000,
    },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  return order;
}

/** Kargo siparişi — sefer diye bir şey yok, davet de olmamalı. */
async function kargoSiparisi() {
  const { order } = await orders.create(
    { warehouseId, customerId: inviterId, channel: 'b2c', deliveryType: 'shipping', totalCents: 2000 },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  return order;
}

/** Açılmış bir davet — çoğu senaryonun başlangıç noktası. */
async function davet() {
  const order = await rotaSiparisi();
  const outcome = await openNeighborInvite(db, { orderId: order.id, customerId: inviterId });
  if (outcome.status !== 'ok') throw new Error(`davet açılamadı: ${outcome.status}`);
  return outcome.invite;
}

describe('davetin açılması', () => {
  it('rota siparişinde davet açılır ve sınır AÇIKÇA yazılır', async () => {
    const invite = await davet();

    expect(invite.deliveryZoneId).toBe(zoneId);
    // Sınır veritabanı varsayılanına bırakılmıyor: müşteri yüzeyi "o güne en fazla N komşu"
    // diyecek ve o sayıyı motorun uyguladığı yerden okumalı.
    expect(invite.maxUses).toBeGreaterThan(0);
  });

  it('İDEMPOTENT — ikinci çağrı AYNI daveti döner, paylaşılan bağlantı ölmez', async () => {
    const order = await rotaSiparisi();
    const ilk = await openNeighborInvite(db, { orderId: order.id, customerId: inviterId });
    const ikinci = await openNeighborInvite(db, { orderId: order.id, customerId: inviterId });

    if (ilk.status !== 'ok' || ikinci.status !== 'ok') throw new Error('davet açılamadı');
    expect(ikinci.invite.id).toBe(ilk.invite.id);
    expect(ikinci.invite.token).toBe(ilk.invite.token);
  });

  it('BAŞKASININ siparişinden davet açılamaz', async () => {
    const order = await rotaSiparisi();
    const outcome = await openNeighborInvite(db, { orderId: order.id, customerId: neighborId });

    expect(outcome.status).toBe('not_owner');
  });

  it('KARGO siparişinde davet YOKTUR — kavramın kendisi, kısıtlama değil', async () => {
    // Kargoda "aynı sefer" diye bir şey yok; taşıyıcı zaten paket başına ücretlendiriyor.
    const order = await kargoSiparisi();
    const outcome = await openNeighborInvite(db, { orderId: order.id, customerId: inviterId });

    expect(outcome.status).toBe('not_route');
  });

  it('olmayan sipariş `not_found` — sessizce boş davet doğmaz', async () => {
    const outcome = await openNeighborInvite(db, {
      orderId: '00000000-0000-4000-9000-000000000000',
      customerId: inviterId,
    });

    expect(outcome.status).toBe('not_found');
  });
});

describe('karşılama', () => {
  it('geçerli belirteç davet edenin YALNIZ İLK ADINI verir', async () => {
    // Bağlantı tanımadığımız kanallarda dolaşıyor; soyadı göstermenin bir işlevi yok.
    const invite = await davet();
    const welcome = await readNeighborWelcome(db, invite.token, neighborId);

    expect(welcome.status).toBe('ok');
    if (welcome.status !== 'ok') throw new Error('karşılama kurulamadı');
    expect(welcome.inviterName).toBe('Ayşe');
    expect(welcome.deliveryDate).toBe(invite.deliveryDate);
  });

  it('tanınmayan belirteç `unknown` — yanlış kopyalanmış bağlantı', async () => {
    const welcome = await readNeighborWelcome(db, `yok-${stamp}`, neighborId);

    expect(welcome.status).toBe('unknown');
  });

  it('KENDİ bağlantısını açan `self` görür — doluluktan ÖNCE', async () => {
    // Sıranın çivisi: davet dolu olsa bile sahibine söylenecek şey bağlantısının ÇALIŞTIĞIDIR.
    const invite = await davet();
    const welcome = await readNeighborWelcome(db, invite.token, inviterId);

    expect(welcome.status).toBe('self');
  });

  it('KİMLİKSİZ ziyaretçi karşılamayı görür — `self` yalnız sahibinindir', async () => {
    const invite = await davet();
    const welcome = await readNeighborWelcome(db, invite.token, null);

    expect(welcome.status).toBe('ok');
  });

  it('SEFER GEÇMİŞSE `run_closed` — davet artık bir söz veremez', async () => {
    const order = await rotaSiparisi({ date: ileriGun(-5) });
    // Geçmiş günün siparişinde davet HİÇ açılmaz; kapı da aynı cevabı verir.
    const outcome = await openNeighborInvite(db, { orderId: order.id, customerId: inviterId });

    expect(outcome.status).toBe('run_closed');
  });
});

describe('kullanım hakkı', () => {
  it('kabul TEK BAŞINA hakkı tüketmez — ölçüt SİPARİŞ', async () => {
    // Kullanım siparişten türetiliyor: komşu daveti kabul etti ama henüz sipariş vermediyse
    // hak duruyor. Kabulü sayan bir yazım, çağırılıp da alışveriş yapmayan komşuyu hak sayardı.
    const invite = await davet();
    await acceptNeighborInvite(db, { token: invite.token, customerId: neighborId });

    expect(await countNeighborInviteUses(db, invite.id)).toBe(0);
    expect(await remainingNeighborInviteUses(db, invite)).toBe(invite.maxUses);
  });

  it('İPTAL edilen sipariş hakkı GERİ VERİR — sayaç tutulsaydı vermezdi', async () => {
    const invite = await davet();
    const komsuSiparisi = await rotaSiparisi({ customerId: neighborId });
    await db.from('order').update({ neighbor_invite_id: invite.id }).eq('id', komsuSiparisi.id);

    expect(await countNeighborInviteUses(db, invite.id)).toBe(1);

    await db.from('order').update({ status: 'cancelled' }).eq('id', komsuSiparisi.id);

    expect(await countNeighborInviteUses(db, invite.id)).toBe(0);
    expect(await remainingNeighborInviteUses(db, invite)).toBe(invite.maxUses);
  });

  it('KALAN HAK sıfırın altına düşmez — tavan sonradan düşürülebilir', async () => {
    // Tavan davet AÇILIRKEN donuyor. Ayar düşerse eski davetlerin kullanımı tavanı aşmış görünür
    // ve çıplak çıkarma negatif verirdi: ekran "-1 komşu daha yararlanabilir" yazardı.
    const invite = await davet();
    const komsuSiparisi = await rotaSiparisi({ customerId: neighborId });
    await db.from('order').update({ neighbor_invite_id: invite.id }).eq('id', komsuSiparisi.id);

    expect(await remainingNeighborInviteUses(db, { id: invite.id, maxUses: 0 })).toBe(0);
  });
});

describe('kabul', () => {
  it('kabul edilen davet `ok` döner', async () => {
    const invite = await davet();
    const outcome = await acceptNeighborInvite(db, { token: invite.token, customerId: neighborId });

    expect(outcome).toEqual({ status: 'ok', inviteId: invite.id });
  });

  it('İDEMPOTENT — aynı kişi ikinci kez kabul ederse yine `ok`, ikinci satır açılmaz', async () => {
    const invite = await davet();
    await acceptNeighborInvite(db, { token: invite.token, customerId: neighborId });
    const ikinci = await acceptNeighborInvite(db, { token: invite.token, customerId: neighborId });

    expect(ikinci.status).toBe('ok');
    const { count } = await db
      .from('neighbor_invite_claim')
      .select('id', { count: 'exact', head: true })
      .eq('invite_id', invite.id)
      .eq('customer_id', neighborId);
    expect(count).toBe(1);
  });

  it('KENDİ davetini kabul edemez — ekran değişse bile veri bozulmasın', async () => {
    // Karşılama sayfası zaten `self` diyor; kapı da tutuyor. İki kat koruma bilinçli.
    const invite = await davet();
    const outcome = await acceptNeighborInvite(db, { token: invite.token, customerId: inviterId });

    expect(outcome).toEqual({ status: 'rejected', reason: 'self' });
  });

  it('tanınmayan belirteç `unknown` ile reddedilir', async () => {
    const outcome = await acceptNeighborInvite(db, { token: `yok-${stamp}`, customerId: neighborId });

    expect(outcome).toEqual({ status: 'rejected', reason: 'unknown' });
  });

  it('kabul davet EDENİ getiren olarak bağlar — komşu daveti yeni müşteri de kazandırır', async () => {
    // Ölçülen boşluk (17.08): `referred_by`yi yazan tek yol getiren KODUNDAN geçiyordu, oysa komşu
    // bağlantısı kod değil TOKEN taşıyor — davetle gelip kaydolan kişi "kimsenin getirmediği
    // müşteri" olarak doğuyordu ve 500 puanlık getiren ödülü hiç doğmuyordu.
    const invite = await davet();
    await acceptNeighborInvite(db, { token: invite.token, customerId: otherId });

    const profile = await new UserProfileService(db).getById(otherId);
    expect(profile?.referredBy).toBe(inviterId);
  });
});

describe('paylaşılabilir adres', () => {
  it('belirteci ve PAYLAŞANIN dilini taşır', () => {
    const url = neighborInviteUrl('ABC123', 'fr');

    expect(url).toContain('ABC123');
    expect(url.startsWith('http')).toBe(true);
  });

  it('dil değişince adres de değişir — üç dilin üçü ayrı yol', () => {
    const fr = neighborInviteUrl('ABC123', 'fr');
    const tr = neighborInviteUrl('ABC123', 'tr');

    expect(fr).not.toBe(tr);
  });
});

/** Servis doğrudan da sınanıyor: davet satırı belirteciyle bulunabilmeli (karşılamanın tek girişi). */
describe('belirteçle okuma', () => {
  it('açılan davet belirteciyle bulunur', async () => {
    const invite = await davet();
    const found = await invites.findByToken(invite.token);

    expect(found?.id).toBe(invite.id);
  });
});
