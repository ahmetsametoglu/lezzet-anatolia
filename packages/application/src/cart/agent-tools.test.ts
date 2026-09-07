import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z, ToolSet } from '@lezzet/ai';
import { CartService, CategoryService, ConversationService, PriceService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { Conversation } from '@lezzet/types';
import { cartAgentTools } from './agent-tools';

/**
 * AJANIN SEPET ARAÇLARI (15.20 · 15.22) — ilk YAZAN araçlar.
 *
 * ── ARAÇLAR ŞEMADAN GEÇİRİLEREK ÇAĞRILIYOR (`support-tools.test.ts` dersi) ──
 * Modelin gerçek yolu şemadır; elle çağrıda parametre adı kaçınca olmayan bir arıza bildirilir.
 *
 * ── SINANAN DEĞİŞMEZLER ─────────────────────────────────────────────────────
 *   · Kimlik ARGÜMAN değil: dört aracın hiçbirinin girdisinde müşteri/sohbet kimliği yok.
 *   · Ürün ADIYLA çözülür; belirsizlikte araç SEÇMEZ, SORDURUR (`secenekler` / `boylar`).
 *   · Satışa kapalı ürün sepete girmez ve sebebi söylenir.
 *   · Kimliksiz sohbette sepet SOHBETE yazılır; müşterili sohbette müşterinin gerçek sepetine.
 *   · Bağlantı aracı kabı doldurur — model bağlantıyı yazmaz, `ai.ts` ekler.
 */
const db = serviceDb();
const stamp = Date.now();

const profileIds: string[] = [];
const productIds: string[] = [];
const conversationIds: string[] = [];
let categoryId = '';
let musteriId = '';
let messenger: Conversation;
let whatsapp: Conversation;

const CAGRI_BAGLAMI = { toolCallId: `test-${stamp}`, messages: [] } as unknown as Parameters<NonNullable<ToolSet[string]['execute']>>[1];

async function cagir(tools: ToolSet, ad: string, ham: unknown = {}): Promise<Record<string, unknown>> {
  const arac = tools[ad];
  if (!arac?.execute) throw new Error(`araç yok ya da yürütülemez: ${ad}`);
  const girdi = (arac.inputSchema as z.ZodType<unknown>).parse(ham);
  return (await arac.execute(girdi, CAGRI_BAGLAMI)) as Record<string, unknown>;
}

const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });

async function urunAc(ad: string, boylar: Array<{ label: string; b2c?: number }>): Promise<void> {
  const { product, variants } = await new ProductService(db).create({
    name: ucDil(`${ad} ${stamp}`),
    description: ucDil('Sepet aracı testi ürünü'),
    ingredients: ucDil('Un, su, tuz'),
    storageInstructions: ucDil('Serin yerde saklayın'),
    categoryId,
    status: 'active',
    variants: boylar.map((b) => ({ label: { tr: b.label } })),
  });
  productIds.push(product.id);
  for (const [i, boy] of boylar.entries()) {
    if (boy.b2c !== undefined) await new PriceService(db).insert({ variantId: variants[i]!.id, channel: 'b2c', amountCents: boy.b2c });
  }
}

const AD = (kisa: string) => `${kisa} ${stamp}`;

function araclar(conversation: Conversation, onLink: (url: string) => void = () => {}): ToolSet {
  return cartAgentTools(db, { conversation, pricingCustomerId: null, addressCustomerId: null, onLink });
}

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sepet aracı ${stamp}` } })).id;
  await urunAc('Fıstıklı Sarma', [{ label: '250 g', b2c: 457 }]);
  await urunAc('Cevizli Sarma', [{ label: '250 g', b2c: 399 }]);
  await urunAc('Peynirli Gözleme', [
    { label: '500 g', b2c: 600 },
    { label: '1 kg', b2c: 1100 },
  ]);
  await urunAc('Kapalı Helva', [{ label: '1 kg' }]);

  musteriId = (await new UserProfileService(db).insert({ name: `Sepet aracı müşterisi ${stamp}` })).id;
  profileIds.push(musteriId);

  const conversations = new ConversationService(db);
  messenger = await conversations.open({ source: 'messenger', externalRef: `psid-arac-${stamp}` });
  whatsapp = await conversations.open({ source: 'whatsapp', externalRef: `+338${String(stamp).slice(-8)}`, customerId: musteriId });
  conversationIds.push(messenger.id, whatsapp.id);
});

afterAll(async () => {
  await purgeTestData(db, { productIds, categoryIds: [categoryId], conversationIds, profileIds });
});

describe('değişmez: kimlik ARGÜMAN değil, KAPANIŞTIR', () => {
  it('dört aracın hiçbirinin girdisinde müşteri ya da sohbet kimliği YOK', () => {
    const tools = araclar(messenger);
    expect(Object.keys(tools).sort()).toEqual(['sepet_baglantisi', 'sepete_ekle', 'sepetim', 'sepetten_cikar']);
    for (const arac of Object.values(tools)) {
      const alanlar = Object.keys((arac.inputSchema as z.ZodObject<z.ZodRawShape>).shape ?? {});
      expect(alanlar.some((a) => /customer|conversation|Id$/i.test(a))).toBe(false);
    }
  });
});

describe('kimliksiz sohbette (Messenger) sepet SOHBETE yazılır', () => {
  it('boş sepet bir CEVAPTIR — "erişemedim" değil', async () => {
    expect(await cagir(araclar(messenger), 'sepetim')).toHaveProperty('sepetBos');
  });

  it('ürün ADIYLA eklenir, özet fiyatı MOTORDAN söyler, satır sohbetin sepetinde durur', async () => {
    const sonuc = await cagir(araclar(messenger), 'sepete_ekle', { urun: AD('Fıstıklı Sarma'), adet: 2 });
    expect(sonuc).toMatchObject({ eklendi: { urun: AD('Fıstıklı Sarma'), adet: 2 } });
    const sepet = sonuc.sepet as { kalemler: Array<{ birimFiyat: string; adet: number }>; toplam: string };
    expect(sepet.kalemler).toHaveLength(1);
    expect(sepet.kalemler[0]).toMatchObject({ adet: 2 });
    expect(sepet.kalemler[0]!.birimFiyat).toMatch(/4,57/);
    expect(sepet.toplam).toMatch(/9,14/);

    const satir = await new CartService(db).getFor({ conversationId: messenger.id });
    expect(satir.items).toMatchObject([{ qty: 2 }]);
    expect(satir.customerId).toBeNull();
  });

  it('belirsiz ad SEÇİLMEZ, SORDURULUR — "sarma" iki ürünü tutar, sepet değişmez', async () => {
    const once = (await new CartService(db).getFor({ conversationId: messenger.id })).items.length;
    const sonuc = await cagir(araclar(messenger), 'sepete_ekle', { urun: `Sarma ${stamp}` });
    expect(sonuc).toHaveProperty('secenekler');
    expect(sonuc.secenekler).toEqual(expect.arrayContaining([AD('Fıstıklı Sarma'), AD('Cevizli Sarma')]));
    expect((await new CartService(db).getFor({ conversationId: messenger.id })).items).toHaveLength(once);
  });

  it('çok boylu üründe boy verilmezse BOYLAR listesi döner; boy verilince o boy eklenir', async () => {
    const sorulan = await cagir(araclar(messenger), 'sepete_ekle', { urun: AD('Peynirli Gözleme') });
    expect(sorulan).toHaveProperty('boylar');
    expect((sorulan.boylar as { secenekler: unknown[] }).secenekler).toHaveLength(2);

    const eklenen = await cagir(araclar(messenger), 'sepete_ekle', { urun: AD('Peynirli Gözleme'), boy: '1 kg' });
    expect(eklenen).toMatchObject({ eklendi: { boy: '1 kg', adet: 1 } });
  });

  it('satışa KAPALI ürün sepete girmez ve sebebi söylenir — "0 €" ile eklenmez', async () => {
    const sonuc = await cagir(araclar(messenger), 'sepete_ekle', { urun: AD('Kapalı Helva') });
    expect(sonuc).toHaveProperty('satisaKapali');
  });

  it('kalem ADIYLA çıkarılır; kalan sepet döner', async () => {
    const sonuc = await cagir(araclar(messenger), 'sepetten_cikar', { urun: AD('Fıstıklı Sarma') });
    expect(sonuc).toHaveProperty('cikarildi');
    const sepet = sonuc.sepet as { kalemler: Array<{ urun: string }> };
    expect(sepet.kalemler.map((k) => k.urun)).toEqual([AD('Peynirli Gözleme')]);
  });

  it('bağlantı aracı KABI doldurur ve modele "yazma" der — adres sohbetin dilinde sepet sayfası', async () => {
    let alinan: string | null = null;
    const sonuc = await cagir(araclar(messenger, (url) => (alinan = url)), 'sepet_baglantisi');
    expect(sonuc).toHaveProperty('hazir');
    expect(alinan).toMatch(/\/fr\/panier\?link=[A-Z0-9]{12}$/);
  });
});

describe('müşterili sohbette (WhatsApp) sepet MÜŞTERİNİN gerçek sepetidir', () => {
  it('eklenen kalem müşterinin sepetinde durur — siteyi açtığında aynı sepeti görür', async () => {
    await cagir(araclar(whatsapp), 'sepete_ekle', { urun: AD('Cevizli Sarma'), adet: 3 });
    expect((await new CartService(db).get(musteriId)).items).toMatchObject([{ qty: 3 }]);
    const okunan = await cagir(araclar(whatsapp), 'sepetim');
    expect((okunan.kalemler as unknown[]).length).toBe(1);
  });
});
