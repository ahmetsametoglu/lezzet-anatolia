import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z, ToolSet } from '@lezzet/ai';
import {
  BundleService,
  CartService,
  CategoryService,
  ConversationService,
  DeliveryZoneService,
  PriceService,
  ProductService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { Conversation } from '@lezzet/types';
import { cartAgentTools, cartLinkIfDue } from './agent-tools';
import { chatPlaceMemory, type ChatPlaceMemory } from './chat-place';
import type { ChatLink } from './link-text';

/**
 * AJANIN SEPET ARAÇLARI (15.20 · 15.22) — ilk YAZAN araçlar.
 *
 * ── ARAÇLAR ŞEMADAN GEÇİRİLEREK ÇAĞRILIYOR (`support-tools.test.ts` dersi) ──
 * Modelin gerçek yolu şemadır; elle çağrıda parametre adı kaçınca olmayan bir arıza bildirilir.
 *
 * ── SINANAN DEĞİŞMEZLER ─────────────────────────────────────────────────────
 *   · Kimlik ARGÜMAN değil: beş aracın hiçbirinin girdisinde müşteri/sohbet kimliği yok.
 *   · Ürün ADIYLA çözülür; belirsizlikte araç SEÇMEZ, SORDURUR (`secenekler` / `boylar`).
 *   · Paket de adıyla eklenir — tek satır, tek fiyat (DOMAIN §13).
 *   · EKLEMEK ile EŞİTLEMEK ayrı: "bir tane daha" üstüne koyar, "iki tane olsun" adedi eşitler.
 *   · Satışa kapalı ürün sepete girmez ve sebebi söylenir.
 *   · Kimliksiz sohbette sepet SOHBETE yazılır; müşterili sohbette müşterinin gerçek sepetine.
 *   · Bağlantı aracı kabı doldurur — model bağlantıyı yazmaz, `ai.ts` ekler.
 *   · YER ŞARTI (10.09): sepete yazan araç posta kodu bilinmeden yazmaz; gerçek kod sohbete yazılır,
 *     bu adrese gidemeyen kalem eklenmez.
 */
const db = serviceDb();
const stamp = Date.now();
const son2 = String(stamp).slice(-2);
/**
 * Kendi rota bölgemizin kodu — `004` bandı: ne FR (01000'den) ne DE (01067'den) referansında var ve
 * öteki dosyaların bantlarına (`005`–`009`) girmiyor; aynı anda koşan iki dosya birbirinin bölgesini çözmez.
 */
const SEPET_KODU = `004${son2}`;
/** Hiçbir kayıtta olmayan kod — `unknown` beklenir; yazım hatasının yerine geçer. */
const YOK_KODU = `003${son2}`;
const gunSonra = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const profileIds: string[] = [];
const productIds: string[] = [];
const conversationIds: string[] = [];
const bundleIds: string[] = [];
let categoryId = '';
let warehouseId = '';
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

/**
 * Fiyatlı boylar test bölgesinin deposunda STOKLU açılır: yeri bilinen sohbette kalem ancak o depodan
 * karşılanıyorsa "kapıya teslim"dir (`decideCartAgainstWarehouse`). `soguk`: kargoya verilemez ve
 * stoksuz — bu adrese hiçbir yoldan gidemeyen kalem (`not_shippable_here`).
 */
async function urunAc(ad: string, boylar: Array<{ label: string; b2c?: number }>, opts: { soguk?: boolean } = {}): Promise<string> {
  const { product, variants } = await new ProductService(db).create({
    name: ucDil(`${ad} ${stamp}`),
    description: ucDil('Sepet aracı testi ürünü'),
    ingredients: ucDil('Un, su, tuz'),
    storageInstructions: ucDil('Serin yerde saklayın'),
    categoryId,
    status: 'active',
    ...(opts.soguk ? { shippable: false } : {}),
    variants: boylar.map((b) => ({ label: { tr: b.label } })),
  });
  productIds.push(product.id);
  for (const [i, boy] of boylar.entries()) {
    if (boy.b2c === undefined) continue;
    await new PriceService(db).insert({ variantId: variants[i]!.id, channel: 'b2c', amountCents: boy.b2c });
    if (!opts.soguk) {
      await new StockService(db).insert({ warehouseId, variantId: variants[i]!.id, physicalQty: 20, expiryDate: gunSonra(60), purchasePriceCents: 100 });
    }
  }
  return variants[0]!.id;
}

const AD = (kisa: string) => `${kisa} ${stamp}`;

/**
 * Yeri BİLİNEN sohbet — gerçek hafıza yerine kodu hazır tutan taklit (DB'ye yazmaz): araçların çoğu
 * yer şartından SONRAKİ davranışı sınıyor. Şartın kendisi ve gerçek hafıza `araclarHafizayla` ile.
 */
const YER: ChatPlaceMemory = { known: () => SEPET_KODU, knownCountry: () => null, remember: async () => {} };

function araclar(
  conversation: Conversation,
  onLink: (link: ChatLink) => void = () => {},
  accountLink = false,
  onCartWrite?: (hazir: boolean) => void,
): ToolSet {
  return cartAgentTools(db, { conversation, pricingCustomerId: null, addressCustomerId: null, onLink, accountLink, place: YER, onCartWrite });
}

/** Yer hafızası ÇAĞIRANDAN: `null` (hiç yer yok) ya da gerçek `chatPlaceMemory` — şartı ve saklamayı sınar. */
function araclarHafizayla(conversation: Conversation, place: ChatPlaceMemory | null): ToolSet {
  return cartAgentTools(db, { conversation, pricingCustomerId: null, addressCustomerId: null, onLink: () => {}, place });
}

beforeAll(async () => {
  // Rota bölgesi: depo + haftalık gün + kod (`support-tools.test.ts` deseni). Stok bu depoya yazılır.
  warehouseId = (await createTestWarehouse(db, { label: 'SPT' })).id;
  const zones = new DeliveryZoneService(db);
  const bolge = await zones.insert({ name: `Sepet aracı bölgesi ${stamp}`, warehouseId, weekdays: [2] });
  await zones.replacePostalCodes(bolge.id, [{ country: 'FR', postalCode: SEPET_KODU }]);

  categoryId = (await new CategoryService(db).create({ name: { tr: `Sepet aracı ${stamp}` } })).id;
  const fistikliVariantId = await urunAc('Fıstıklı Sarma', [{ label: '250 g', b2c: 457 }]);
  await urunAc('Cevizli Sarma', [{ label: '250 g', b2c: 399 }]);
  // Paket: iki fıstıklı sarma, tek fiyat (DOMAIN §13) — adı ürün adlarını İÇERMİYOR ki ürün araması onu
  // görmesin; paket ikinci sırada, yalnız ürün eşleşmeyince aranır.
  const { bundle } = await new BundleService(db).create({
    name: { tr: `Misafir Kutusu ${stamp}` },
    totalPrice: 8.5,
    items: [{ variantId: fistikliVariantId, qty: 2, allocatedUnitPrice: 4.25 }],
  });
  bundleIds.push(bundle.id);
  await urunAc('Peynirli Gözleme', [
    { label: '500 g', b2c: 600 },
    { label: '1 kg', b2c: 1100 },
  ]);
  await urunAc('Kapalı Helva', [{ label: '1 kg' }]);
  await urunAc('Soğuk Pasta', [{ label: '1 adet', b2c: 2258 }], { soguk: true });

  musteriId = (await new UserProfileService(db).insert({ name: `Sepet aracı müşterisi ${stamp}` })).id;
  profileIds.push(musteriId);

  const conversations = new ConversationService(db);
  messenger = await conversations.open({ source: 'messenger', externalRef: `psid-arac-${stamp}` });
  whatsapp = await conversations.open({ source: 'whatsapp', externalRef: `+338${String(stamp).slice(-8)}`, customerId: musteriId });
  conversationIds.push(messenger.id, whatsapp.id);
});

afterAll(async () => {
  // Paketler ÜRÜNDEN ÖNCE gider: kalemler varyanta `restrict` ile bağlı (`bundle.test.ts` dersi).
  for (const id of bundleIds) await new BundleService(db).delete(id);
  // Bölge depoyla, kodları bölgeyle gidiyor (`cleanup.ts`); stok ürünle.
  await purgeTestData(db, { productIds, categoryIds: [categoryId], conversationIds, profileIds, warehouseIds: [warehouseId] });
});

describe('değişmez: kimlik ARGÜMAN değil, KAPANIŞTIR', () => {
  it('yedi aracın hiçbirinin girdisinde müşteri ya da sohbet kimliği YOK — hesap ve talep bağlantısı dahil', () => {
    const tools = araclar(messenger, () => {}, true);
    expect(Object.keys(tools).sort()).toEqual(['hesap_baglantisi', 'sepet_adet', 'sepet_baglantisi', 'sepete_ekle', 'sepetim', 'sepetten_cikar', 'talep_baglantisi']);
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
    const sepet = sonuc.sepet as { kalemler: Array<{ birimFiyat: string; adet: number }>; toplam: string; kargo: string };
    /* Kargo ve ödenecek tutar AÇIK söylenir (08.09): ajan ürün toplamını söyleyip kargoyu susmuştu,
       müşteri sitede farklı bir tutar gördü. Yer biliniyor ve kalem rota deposunda: kapıya teslim. */
    expect(sepet.kargo).toMatch(/kapıya teslim/);
    // Yeri BİLİNMEYEN okumada da eşik söylenir (satış cümlesi) — okumak yer istemez, yazmak ister.
    expect((await cagir(araclarHafizayla(messenger, null), 'sepetim')).kargo).toMatch(/ÜCRETSİZ/);
    expect(sepet.toplam).toMatch(/ödeyeceği tutar/);
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

  it('EKLEMEK üstüne koyar, EŞİTLEMEK sayıyı belirler — "bir tane daha" ile "iki tane olsun" ayrı', async () => {
    // Sepette 2 fıstıklı var (ilk test). "Bir tane daha" → 3; "iki tane olsun" → 2; "sıfır" → satır gider.
    const eklenen = await cagir(araclar(messenger), 'sepete_ekle', { urun: AD('Fıstıklı Sarma'), adet: 1 });
    expect((eklenen.sepet as { kalemler: Array<{ urun: string; adet: number }> }).kalemler.find((k) => k.urun === AD('Fıstıklı Sarma'))?.adet).toBe(3);

    const esitlenen = await cagir(araclar(messenger), 'sepet_adet', { urun: AD('Fıstıklı Sarma'), adet: 2 });
    expect(esitlenen).toMatchObject({ guncellendi: { adet: 2 } });
    expect((await new CartService(db).getFor({ conversationId: messenger.id })).items.find((i) => i.qty === 2)).toBeDefined();

    const sifir = await cagir(araclar(messenger), 'sepet_adet', { urun: AD('Cevizli Sarma'), adet: 0 });
    expect(sifir).toHaveProperty('bilinmiyor'); // sepette yok — uydurma çıkarma yok
  });

  it('PAKET adıyla eklenir — tek satır, tek fiyat; ürün araması onu görmez, paket araması bulur', async () => {
    const sonuc = await cagir(araclar(messenger), 'sepete_ekle', { urun: AD('Misafir Kutusu') });
    expect(sonuc).toMatchObject({ eklendi: { urun: AD('Misafir Kutusu'), adet: 1 } });
    const satir = (await new CartService(db).getFor({ conversationId: messenger.id })).items.find((i) => i.bundleId);
    expect(satir).toMatchObject({ variantId: null, qty: 1 });
    const sepet = sonuc.sepet as { kalemler: Array<{ urun: string; birimFiyat: string }> };
    expect(sepet.kalemler.find((k) => k.urun === AD('Misafir Kutusu'))?.birimFiyat).toMatch(/8,50/);
  });

  it('kalem ADIYLA çıkarılır; kalan sepet döner', async () => {
    const sonuc = await cagir(araclar(messenger), 'sepetten_cikar', { urun: AD('Fıstıklı Sarma') });
    expect(sonuc).toHaveProperty('cikarildi');
    const sepet = sonuc.sepet as { kalemler: Array<{ urun: string }> };
    expect(sepet.kalemler.map((k) => k.urun)).toEqual([AD('Peynirli Gözleme'), AD('Misafir Kutusu')]);
  });

  it('BOŞ sepette bağlantı ÜRETİLMEZ — kap dolmaz, "Sepetiniz hazır" satırı cevaba giremez (07.09)', async () => {
    /* Canlı turda müşteri "sipariş vermek istiyorum" der demez ajan bağlantıyı çağırdı ve boş bir
       sepet için "Sepetiniz hazır" gitti. Kural araçta: uyarı yetmedi, bağlantı hiç üretilmemeli. */
    const bos = await new ConversationService(db).open({ source: 'messenger', externalRef: `psid-bos-${stamp}` });
    conversationIds.push(bos.id);
    let alinan: string | null = null;
    const sonuc = await cagir(araclar(bos, (link) => (alinan = link.url)), 'sepet_baglantisi');
    expect(sonuc).toHaveProperty('bos');
    expect(sonuc).not.toHaveProperty('hazir');
    expect(alinan).toBeNull();
  });

  it('bağlantı aracı KABI doldurur ve modele "yazma" der — adres sohbetin dilinde sepet sayfası', async () => {
    let alinan: string | null = null;
    const sonuc = await cagir(araclar(messenger, (link) => (alinan = link.url)), 'sepet_baglantisi');
    expect(sonuc).toHaveProperty('hazir');
    expect(alinan).toMatch(/\/fr\/panier\?link=[A-Z0-9]{12}$/);
  });

  it('TALEP bağlantısı jetonsuz talep açma sayfasıdır; kabı "support" amacıyla doldurur (15.14)', async () => {
    /* Kullanıcı kararı (10.09): şikâyette ajan talep açmaz — hesabı var mı, hangi sipariş, hangi ürün,
       sohbet bilemez; sayfa bilir. Adres sohbetin dilinde talep açma sayfası; jeton yok. */
    let alinan: ChatLink | null = null;
    const sonuc = await cagir(araclar(messenger, (link) => (alinan = link)), 'talep_baglantisi');
    expect(sonuc).toHaveProperty('hazir');
    expect(alinan).toEqual({ url: expect.stringMatching(/\/fr\/assistance\/nouvelle$/), purpose: 'support' });
  });
});

describe('müşterili sohbette (WhatsApp) sepet MÜŞTERİNİN gerçek sepetidir', () => {
  it('eklenen kalem müşterinin sepetinde durur — siteyi açtığında aynı sepeti görür; sohbetin İZİ sepette (15.23)', async () => {
    await cagir(araclar(whatsapp), 'sepete_ekle', { urun: AD('Cevizli Sarma'), adet: 3 });
    const sepet = await new CartService(db).get(musteriId);
    expect(sepet.items).toMatchObject([{ qty: 3 }]);
    // Sipariş sitede ödense de kaynağı bu sohbetin kanalı olacak — iz burada doğuyor.
    expect(sepet.sourceConversationId).toBe(whatsapp.id);
    const okunan = await cagir(araclar(whatsapp), 'sepetim');
    expect((okunan.kalemler as unknown[]).length).toBe(1);
  });
});

describe('cartLinkIfDue — sepete yazıldıysa ya da söz verildiyse bağlantı sistemce üretilir (08.09)', () => {
  it('dolu sepet + söz ya da yazım → bağlantı; boş sepet ya da (söz yok ve yazım yok) → yok', async () => {
    /* Canlı Messenger turunda iki kez ölçüldü: model "aşağıdaki bağlantıdan…" yazıp aracı çağırmadı;
       ertesi turda 👍'a "afiyet olsun" deyip bağlantısız kapattı. Kural araçla yan yana: söz VEYA bu
       turda yazım + dolu sepet → bağlantı; boş sepet → yok (07.09 kuralı); ikisi de yoksa → yok.
       Sıra önemli: WhatsApp sohbetinin müşteri sepeti önceki testte doldu. */
    const bos = await new ConversationService(db).open({ source: 'messenger', externalRef: `psid-bos-${stamp}` });
    conversationIds.push(bos.id);
    expect(await cartLinkIfDue(db, bos, { reply: 'Sepetiniz hazır, aşağıdaki bağlantıdan onaylayabilirsiniz.', cartWritten: true })).toBeNull();

    expect(await cartLinkIfDue(db, whatsapp, { reply: 'Teşekkürler, iyi günler.', cartWritten: false })).toBeNull();
    const sozle = await cartLinkIfDue(db, whatsapp, { reply: 'Sepetiniz hazır, aşağıdaki bağlantıdan giriş yapıp onaylayabilirsiniz.', cartWritten: false });
    expect(sozle).toMatchObject({ purpose: 'cart', url: expect.stringMatching(/\/panier\?link=[A-Z0-9]{12}$/) });
    const yazimla = await cartLinkIfDue(db, whatsapp, { reply: 'Üç pastayı sepetinize ekledim.', cartWritten: true });
    expect(yazimla).toMatchObject({ purpose: 'cart', url: expect.stringMatching(/\/panier\?link=[A-Z0-9]{12}$/) });
    expect(yazimla?.url).not.toBe(sozle?.url); // her çağrı yeni jeton, öncekini kapatır (`startCartLink`)
  });
});

describe('hesap bağlantısı (15.16) — yalnız verildiğinde var, kabı HESAP amacıyla doldurur', () => {
  it('verilmediğinde araç sette YOK — karar `accountLinkOffered`ın, araç kendini sunmaz', () => {
    expect(Object.keys(araclar(messenger))).not.toContain('hesap_baglantisi');
  });

  it('BOŞ sepette de bağlantı üretir — işi sepet değil kimlik; adres hesap sayfası, amaç account', async () => {
    const bos = await new ConversationService(db).open({ source: 'messenger', externalRef: `psid-hesap-${stamp}` });
    conversationIds.push(bos.id);
    let alinan: ChatLink | null = null;
    const sonuc = await cagir(araclar(bos, (link) => (alinan = link), true), 'hesap_baglantisi');
    expect(sonuc).toHaveProperty('hazir');
    expect(alinan).toMatchObject({ purpose: 'account', url: expect.stringMatching(/\/fr\/compte\?link=[A-Z0-9]{12}$/) });
  });
});

describe('yer ŞARTI (10.09 · kullanıcı kararı) — posta kodu bilinmeden sepete yazılmaz', () => {
  /* Canlı Messenger turunda ölçüldü: müşteri posta kodu söylemeden baklava ve yaş pasta istedi, ajan
     ikisini de sepete koydu ve toplamı söyledi — o adrese gidip gitmediğimizi bilmeden. Araç "posta
     kodunu sor" diyordu ama bu bir ricaydı; model başka bir soru sordu. Kural artık araçta. */
  const sohbetAc = async (ek: string): Promise<Conversation> => {
    const row = await new ConversationService(db).open({ source: 'messenger', externalRef: `psid-yer-${ek}-${stamp}` });
    conversationIds.push(row.id);
    return row;
  };

  it('yer bilinmezken ekleme YAZMAZ ve modele posta kodunu sordurur; sepet değişmez', async () => {
    const sohbet = await sohbetAc('yok');
    const sonuc = await cagir(araclarHafizayla(sohbet, null), 'sepete_ekle', { urun: AD('Fıstıklı Sarma') });
    expect(sonuc).toHaveProperty('sepeteYazilmadi');
    expect(sonuc).toHaveProperty('yerBilinmiyor');
    expect((await new CartService(db).getFor({ conversationId: sohbet.id })).items).toHaveLength(0);
  });

  it('söylenen GERÇEK kod sohbete yazılır; sonraki tur kodu SORMADAN ekler', async () => {
    const sohbet = await sohbetAc('var');
    const ilk = await cagir(araclarHafizayla(sohbet, chatPlaceMemory(db, sohbet)), 'sepete_ekle', { urun: AD('Cevizli Sarma'), postaKodu: SEPET_KODU });
    expect(ilk).toHaveProperty('eklendi');

    const saklanan = await new ConversationService(db).getById(sohbet.id);
    expect(saklanan?.postalCode).toBe(SEPET_KODU);
    // Yeni tur: kod söylenmiyor, sohbetten okunuyor.
    const ikinci = await cagir(araclarHafizayla(saklanan!, chatPlaceMemory(db, saklanan!)), 'sepete_ekle', { urun: AD('Cevizli Sarma') });
    expect(ikinci).toHaveProperty('eklendi');
  });

  it('böyle bir kod YOKSA ne saklanır ne yazılır — yazım hatası sohbeti yanlış yere kilitlemez', async () => {
    const sohbet = await sohbetAc('yanlis');
    const sonuc = await cagir(araclarHafizayla(sohbet, chatPlaceMemory(db, sohbet)), 'sepete_ekle', { urun: AD('Cevizli Sarma'), postaKodu: YOK_KODU });
    expect(sonuc).toHaveProperty('sepeteYazilmadi');
    expect(sonuc).toHaveProperty('postaKoduGecersiz');
    expect((await new ConversationService(db).getById(sohbet.id))?.postalCode).toBeNull();
  });

  it('bu adrese GİDEMEYEN kalem eklenmez ve sebebi söylenir — soğuk zincir, depoda yok', async () => {
    const sohbet = await sohbetAc('soguk');
    const sonuc = await cagir(araclar(sohbet), 'sepete_ekle', { urun: AD('Soğuk Pasta') });
    expect(sonuc).toHaveProperty('gonderilemez');
    expect((await new CartService(db).getFor({ conversationId: sohbet.id })).items).toHaveLength(0);
  });

  it('"sipariş verilebilir mi" ÖZETLE tutarlı — asgari sepet eksikse bağlantı kendiliğinden gitmez', async () => {
    /* 16.05'te 22,84 €'luk sepete (asgari 40 €) "Sepetiniz hazır… ödemek için" düğmesi gitti. Hazırlık
       özetin söylediğiyle aynı hesaptan: asgari sepet satırı varsa hazır DEĞİL. Eşik bir ayar olduğu
       için iddia tutara değil TUTARLILIĞA yazıldı. */
    const sohbet = await sohbetAc('hazir');
    const hazirlar: boolean[] = [];
    const sonuc = await cagir(araclar(sohbet, () => {}, false, (hazir) => hazirlar.push(hazir)), 'sepete_ekle', { urun: AD('Cevizli Sarma') });
    const sepet = sonuc.sepet as Record<string, unknown>;
    expect(hazirlar).toEqual([sepet.asgariSepet === undefined]);
  });
});
