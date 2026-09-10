import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CartLinkService,
  CartService,
  CategoryService,
  ConversationService,
  CustomerPhoneService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { CART_LINK_PARAM, claimCartLink, startCartLink } from './link';

/**
 * **Sepet bağlantısı** (15.21 · 15.22) — sohbette kurulan sepeti siteye taşıyan jeton.
 *
 * Sınanan şey, kapının SÖZ VERDİĞİ beş şey:
 *   1. Bağlantı müşterinin dilinde sepet sayfasına gider; yeni bağlantı eskisini geçersizler.
 *   2. Kimliksiz sohbetin (Messenger) sepeti bağlantıyı açan hesaba TAŞINIR ve sohbet o hesaba
 *      BAĞLANIR — kanıt `cart_link`, operatör yok.
 *   3. WhatsApp taslağının sepeti hesaba geçer, taslak hesaba birleşir — ve sıra doğru: sepet
 *      birleşmeden ÖNCE taşınır, yoksa kaybolurdu.
 *   4. Jeton TEK KULLANIMLIK ve SÜRELİ; geçersiz jeton hiçbir şey açmaz ve tek cevap verir.
 *   5. Operatörce başka hesaba bağlı sohbet ne kaydırılır ne sepeti kopyalanır.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const phones = new CustomerPhoneService(db);
const conversations = new ConversationService(db);
const carts = new CartService(db);
const links = new CartLinkService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const conversationIds: string[] = [];
let productId = '';
let categoryId = '';
let variantId = '';
let sira = 0;

function numara(): string {
  sira += 1;
  return `+337${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

async function musteri(ad: string, patch: { isDraft?: boolean; preferredLanguage?: 'tr' | 'fr' | 'de' } = {}): Promise<string> {
  const row = await profiles.insert({ name: `${ad} ${stamp}`, ...patch });
  profileIds.push(row.id);
  return row.id;
}

async function messengerSohbeti(): Promise<string> {
  sira += 1;
  const row = await conversations.open({ source: 'messenger', externalRef: `psid-link-${stamp}-${sira}` });
  conversationIds.push(row.id);
  return row.id;
}

async function whatsappSohbeti(customerId: string): Promise<{ id: string; phone: string }> {
  const phone = numara();
  await phones.recordProof(customerId, phone);
  const row = await conversations.open({ source: 'whatsapp', externalRef: phone, customerId });
  conversationIds.push(row.id);
  return { id: row.id, phone };
}

const tokenOf = (url: string): string => new URL(url).searchParams.get(CART_LINK_PARAM) ?? '';

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Bağlantı testi ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Bağlantı böreği ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], conversationIds, profileIds });
});

describe('bağlantı üretimi', () => {
  it('kimliksiz sohbette bağlantı VARSAYILAN dilde sepet sayfasına gider ve 12 haneli jeton taşır', async () => {
    const conversationId = await messengerSohbeti();
    const sonuc = await startCartLink(db, { conversationId });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.url).toMatch(/\/fr\/panier\?link=[A-Z0-9]{12}$/);
  });

  it('müşterili sohbette bağlantı MÜŞTERİNİN dilinde gider — Türkçe tercih, Türkçe yol', async () => {
    const customerId = await musteri('Türkçe', { isDraft: true, preferredLanguage: 'tr' });
    const { id } = await whatsappSohbeti(customerId);
    const sonuc = await startCartLink(db, { conversationId: id });
    expect(sonuc.status === 'ok' && sonuc.url).toMatch(/\/tr\/sepet\?link=/);
  });

  it('YENİ bağlantı öncekini geçersizler — "tekrar gönder" eskisini bir hafta daha yaşatmaz', async () => {
    const conversationId = await messengerSohbeti();
    const ilk = await startCartLink(db, { conversationId });
    const ikinci = await startCartLink(db, { conversationId });
    if (ilk.status !== 'ok' || ikinci.status !== 'ok') throw new Error('bağlantı üretilemedi');
    const hesap = await musteri('Tekrar');
    expect((await claimCartLink(db, { token: tokenOf(ilk.url), customerId: hesap })).status).toBe('invalid');
    // Eski satır SİLİNMEDİ, süresi kapandı — iz duruyor.
    const eski = await links.findByToken(tokenOf(ilk.url));
    expect(eski).not.toBeNull();
    expect(new Date(eski!.expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('HESAP bağlantısı hesap sayfasına gider ve SEPET bağlantısını kapatmaz — iki amaç ayrı yaşar (15.16)', async () => {
    const conversationId = await messengerSohbeti();
    const sepet = await startCartLink(db, { conversationId });
    const hesapLinki = await startCartLink(db, { conversationId, purpose: 'account' });
    if (sepet.status !== 'ok' || hesapLinki.status !== 'ok') throw new Error('bağlantı üretilemedi');
    expect(hesapLinki.url).toMatch(/\/fr\/compte\?link=[A-Z0-9]{12}$/);
    expect((await links.findByToken(tokenOf(hesapLinki.url)))?.purpose).toBe('account');
    // Sepet bağlantısı AÇIK kaldı: hesap bağlantısı gönderildi diye sohbetteki "Sepete git" ölmez.
    const sepetSatiri = await links.findByToken(tokenOf(sepet.url));
    expect(new Date(sepetSatiri!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('HESAP bağlantısı boş sepetle açılınca da sohbeti bağlar — kanıt aynı (cart_link), taşınan kalem yok', async () => {
    const conversationId = await messengerSohbeti();
    const link = await startCartLink(db, { conversationId, purpose: 'account' });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');
    const hesap = await musteri('Hesap bağlantısı');
    expect(await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap })).toMatchObject({ status: 'linked', customerId: hesap, movedItems: 0 });
    expect(await conversations.getById(conversationId)).toMatchObject({ customerId: hesap, linkProof: 'cart_link' });
  });
});

describe('kimliksiz sohbet (Messenger) — sepet taşınır, kimlik bağlanır', () => {
  it('bağlantıyı açıp giriş yapan hesap sepeti ve sohbeti kazanır; kanıt cart_link, operatör yok', async () => {
    const conversationId = await messengerSohbeti();
    await carts.addItemsFor({ conversationId }, [{ variantId, qty: 3, unitPrice: 11 }]);
    const link = await startCartLink(db, { conversationId });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');

    const hesap = await musteri('Messenger');
    const sonuc = await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap });
    expect(sonuc).toMatchObject({ status: 'linked', customerId: hesap, movedItems: 1 });

    const sohbet = await conversations.getById(conversationId);
    expect(sohbet).toMatchObject({ customerId: hesap, linkProof: 'cart_link', linkedBy: null });
    expect(sohbet?.linkedAt).not.toBeNull();

    // Kalemler hesabın sepetinde, sohbet sepeti SİLİNDİ — sahipsiz satır kalmaz. Sohbetin İZİ hedef
    // sepete geçti (15.23): bu sepetten çıkacak sipariş `messenger` kaynaklı olacak.
    const hesabinSepeti = await carts.get(hesap);
    expect(hesabinSepeti.items).toMatchObject([{ variantId, qty: 3 }]);
    expect(hesabinSepeti.sourceConversationId).toBe(conversationId);
    const { data } = await db.from('cart').select('id').eq('conversation_id', conversationId);
    expect(data).toEqual([]);

    // Damga: kim, ne zaman.
    const satir = await links.findByToken(tokenOf(link.url));
    expect(satir).toMatchObject({ claimedBy: hesap });
    expect(satir?.claimedAt).not.toBeNull();
    /* 60 sn — tam paket altında ölçüldü (07.09): açılış ~25 tur atıyor (sepet oku → taşı → sohbeti
       bağla → damgala) ve paralel koşuda tur başına saniyeye yaklaşıyor; 15 sn'lik varsayılan
       yalancı kırmızı üretti. Yavaş koşu yalancı düşüşten ucuzdur (`CLAUDE §4b`). */
  }, 60_000);

  it('jeton TEK KULLANIMLIK — ikinci açılış `invalid` görür, sepet ikinci kez taşınmaz', async () => {
    const conversationId = await messengerSohbeti();
    await carts.addItemsFor({ conversationId }, [{ variantId, qty: 1, unitPrice: 11 }]);
    const link = await startCartLink(db, { conversationId });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');
    const hesap = await musteri('İkinci');
    await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap });
    expect((await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap })).status).toBe('invalid');
    expect((await carts.get(hesap)).items).toMatchObject([{ qty: 1 }]);
  }, 60_000);

  it('hesabın kendi sepeti KORUNUR — gelen kalemler üstüne eklenir (takeOver kapısı)', async () => {
    const conversationId = await messengerSohbeti();
    await carts.addItemsFor({ conversationId }, [{ variantId, qty: 2, unitPrice: 11 }]);
    const link = await startCartLink(db, { conversationId });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');
    const hesap = await musteri('Dolu');
    await carts.addItem(hesap, { variantId, qty: 1, unitPrice: 11 });
    await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap });
    expect((await carts.get(hesap)).items).toMatchObject([{ variantId, qty: 3 }]);
  }, 60_000);
});

describe('WhatsApp — taslak hesaba birleşir, sepet ÖNCE taşınır', () => {
  it('taslağın sepeti hesaba geçer, taslak hesaba birleşir, sohbet hesaba döner', async () => {
    const taslak = await musteri('Taslak', { isDraft: true });
    const { id: conversationId, phone } = await whatsappSohbeti(taslak);
    await carts.addItem(taslak, { variantId, qty: 4, unitPrice: 11 });
    const link = await startCartLink(db, { conversationId });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');

    const hesap = await musteri('Hesap');
    // Hesabın ZATEN sepeti var — birleşme bu hâlde kaynağınkini siler; sıra yanlış olsaydı 4 kalem kaybolurdu.
    await carts.addItem(hesap, { variantId, qty: 1, unitPrice: 11 });
    const sonuc = await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap });
    expect(sonuc).toMatchObject({ status: 'merged', customerId: hesap, movedItems: 1 });

    expect((await carts.get(hesap)).items).toMatchObject([{ variantId, qty: 5 }]);
    expect((await profiles.getById(taslak))?.mergedIntoId).toBe(hesap);
    expect((await conversations.getById(conversationId))?.customerId).toBe(hesap);
    expect((await phones.findActive(phone))?.customerId).toBe(hesap);
  }, 60_000);

  it('sohbet ZATEN bu hesabınsa yalnız `own` — hiçbir şey taşınmaz, kimlik dokunulmaz', async () => {
    const hesap = await musteri('Kendi');
    const { id: conversationId } = await whatsappSohbeti(hesap);
    await carts.addItem(hesap, { variantId, qty: 2, unitPrice: 11 });
    const link = await startCartLink(db, { conversationId });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');
    expect(await claimCartLink(db, { token: tokenOf(link.url), customerId: hesap })).toMatchObject({ status: 'own', movedItems: 0 });
    expect((await carts.get(hesap)).items).toMatchObject([{ qty: 2 }]);
  });
});

describe('geçersiz ve yabancı', () => {
  it('bilinmeyen ve SÜRESİ GEÇMİŞ jeton tek cevap verir: invalid', async () => {
    const hesap = await musteri('Geçersiz');
    expect((await claimCartLink(db, { token: 'YOKBOYLEBIR1', customerId: hesap })).status).toBe('invalid');

    const conversationId = await messengerSohbeti();
    await links.insert({ token: `ESKI${String(stamp).slice(-8)}`, conversationId, purpose: 'cart', expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await claimCartLink(db, { token: `ESKI${String(stamp).slice(-8)}`, customerId: hesap })).status).toBe('invalid');
  });

  it('operatörce BAŞKA hesaba bağlı Messenger sohbeti: bağ kaydırılmaz, sepet KOPYALANMAZ', async () => {
    const sahip = await musteri('Sahip');
    const conversationId = await messengerSohbeti();
    await conversations.linkCustomer(conversationId, { customerId: sahip, linkedBy: null, proof: 'email' });
    await carts.addItem(sahip, { variantId, qty: 9, unitPrice: 11 });
    const link = await startCartLink(db, { conversationId });
    if (link.status !== 'ok') throw new Error('bağlantı üretilemedi');

    const yabanci = await musteri('Yabancı');
    const sonuc = await claimCartLink(db, { token: tokenOf(link.url), customerId: yabanci });
    expect(sonuc).toMatchObject({ status: 'foreign_identity', movedItems: 0 });
    expect((await conversations.getById(conversationId))?.customerId).toBe(sahip);
    expect((await carts.get(yabanci)).items).toEqual([]);
  }, 60_000);
});
