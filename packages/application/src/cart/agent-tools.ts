// `z` porttan geliyor — SDK tek zod örneği bekliyor (`support-tools.ts` künyesi).
import { tool, z, type ToolSet } from '@lezzet/ai';
import { AddressService, CartService, type CartOwner, type Db } from '@lezzet/database';
import { formatPrice } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Address, Conversation } from '@lezzet/types';
import { getCatalogData } from '../catalog/catalog';
import { getPackagesByIds } from '../catalog/packages';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { getProductDetail } from '../catalog/product';
import { resolvePlaceWarehouses, UNRESOLVED_PLACE } from '../delivery/place';
import { cartGroupOf, entryOfItem, type CartLine, type CartView } from './cart-types';
import { startCartLink } from './link';
import { getCartView } from './read';

/*
  AJANIN SEPET ARAÇLARI (15.20 · 15.21 · 15.22 · kullanıcı kararı 07.09) — ajanın İLK YAZAN araçları.

  ── DEĞİŞMEZ DARALDI, KALKMADI ──────────────────────────────────────────────
  `support-tools.ts`in kuralı *"araçlar yalnız okur"* ve gerekçesi duruyor: sipariş değiştirmek,
  adres yazmak, para kararı vermek insanın işi. Sepet bunlardan biri DEĞİL — geri alınabilir, tutar
  taahhüdü doğurmaz, müşterinin kendi niyetidir ve onayı yine checkout'ta verilir (DOMAIN §4:
  sepette stok ayrılmaz; §5: sepetteki fiyat bağlayıcı değildir). Yazma yetkisi YALNIZ sepete açık;
  adres, ödeme ve sipariş kapatma kapalı.

  ── KİMLİK KAPISI: SEPET KAPILI ÜÇ YETKİDEN BİRİ DEĞİL ─────────────────────
  DOMAIN §10 kapılı yetkileri sayar: geçmişi göstermek · puanı harcatmak · kişiye özel fiyat.
  *"Sipariş almak geçmiş gerektirmez."* Sepet kurmak da gerektirmez — numarası doğrulanmış her
  müşteri, çapası olsun olmasın, sepet kurar. Kapılı olan iki şey burada da kapılı kalır:
    · FİYAT kademesi — `pricingCustomerId` çapa kapalıyken `null` gelir, toplam ziyaretçi (B2C
      liste) fiyatından çözülür; B2B kademesi sızmaz (`urun_ara`nın aynı kuralı, `toolsIdentityOf`).
    · KAYITLI ADRES — "her zamanki adrese mi" cümlesi sızıntının kendisidir (DOMAIN §10);
      `addressCustomerId` yalnız çapa açıkken gelir, kapalıyken ajan posta kodunu SORAR.

  ── FİYAT VE İNDİRİM İKİNCİ KEZ HESAPLANMAZ ────────────────────────────────
  Okuma `getCartView`ten geçer — sitenin ve mobilin sepeti okuduğu kapı. Ajanın söylediği toplam
  ile sayfanın gösterdiği toplam ayrışamaz; ayrı bir "ajan için sepet özeti" 07.15'in ölçülmüş
  dersini tekrarlamak olurdu.

  ── KİMLİK ARGÜMAN DEĞİL, KAPANIŞTIR — ÜRÜN DE ÖYLE ────────────────────────
  Araçların hiçbirinde müşteri/sohbet kimliği yok (kapanışta). Ürün de KİMLİKLE değil ADIYLA
  geçer: `urun_ara` kimlik döndürmez ve döndürmemeli — model ezberden bir uuid yazamaz, adı yazar,
  çözümü araç yapar. Belirsizlikte araç SEÇMEZ, SORDURUR (`secenekler`/`boylar`): yanlış boyu
  sepete koymak sessiz bir hatadır, soru değildir.

  ── SEPETİN SAHİBİ SOHBETTEN TÜRER ─────────────────────────────────────────
  Müşterili sohbette (WhatsApp) müşterinin gerçek sepeti — siteyi açtığında aynı sepeti görür.
  Kimliksiz sohbette (Messenger/IG) sohbet sepeti (`cart.conversation_id`, 0055); bağlantıyı açıp
  giriş yapınca hesabına taşınır (`link.ts`).
*/

/** Tek soruda gösterilecek en fazla aday — `urun_ara`nın tavanıyla aynı ölçü. */
const MAX_CHOICES = 5;

/** Tek satırda makul tavan: elli, "toptancı bile" sınırıdır; ötesi yazım hatasıdır. */
const MAX_QTY = 50;

export interface CartAgentToolsInput {
  conversation: Conversation;
  /** Fiyat kademesinin kimliği — çapa kapalıyken `null` (ziyaretçi fiyatı). */
  pricingCustomerId: string | null;
  /** Kayıtlı adresi okumaya izin — çapa açıkken müşteri kimliği, kapalıyken `null`. */
  addressCustomerId: string | null;
  /** Bağlantı üretildiğinde çağrılır — `ai.ts` cevabın sonuna deterministik ekler. */
  onLink: (url: string) => void;
}

/**
 * Sohbete KAPATILMIŞ sepet araçları — dördü de aynı sepeti görür.
 *
 * Araç gövdesinde hata olursa fırlatmaz — `bilinmiyor` döner ve log'a KİMLİK düşer (içerik değil):
 * fırlatan bir araç koşuyu düşürür ve müşteri cevapsız kalırdı (`support-tools.ts` ile aynı kural).
 */
export function cartAgentTools(db: Db, input: CartAgentToolsInput): ToolSet {
  const { conversation } = input;
  const owner: CartOwner = conversation.customerId ? { customerId: conversation.customerId } : { conversationId: conversation.id };
  const carts = new CartService(db);
  const log = { context: 'application/cart-agent-tools', conversationId: conversation.id };

  /* Yer üç kaynaktan, `urun_ara` ile aynı sırada: söylenen posta kodu · kayıtlı adres (yalnız
     izinliyse) · hiçbiri (depo-üstü okuma, "sana gelir mi" cevaplanamaz). */
  const yer = async (postaKodu: string | undefined) => {
    const adres = input.addressCustomerId ? birincilAdres(await new AddressService(db).listByCustomer(input.addressCustomerId)) : null;
    const kod = postaKodu?.trim() || adres?.postalCode || null;
    return { place: kod ? await resolvePlaceWarehouses(db, kod) : UNRESOLVED_PLACE, kod };
  };

  const ozet = async (postaKodu?: string) => {
    const cart = await carts.getFor(owner);
    if (cart.items.length === 0) return { sepetBos: 'Sepet BOŞ — henüz hiçbir ürün eklenmemiş. Bu bir erişim sorunu değil; sepeti okuyabildin, boş çıktı.' };
    const { place, kod } = await yer(postaKodu);
    const view = await getCartView(db, 'tr', cart.items.map(entryOfItem), {
      customerId: input.pricingCustomerId,
      warehouseId: place.warehouseId,
      shippingWarehouseId: place.shippingWarehouseId,
      bundles: (ids, locale, bundlePlace) => getPackagesByIds(db, ids, locale, bundlePlace),
    });
    return sepetOzeti(view, kod === null);
  };

  return {
    sepetim: tool({
      description:
        'Müşterinin sepetini okur: kalemler, adetler, fiyatlar, toplam, indirim, asgari sepet ve hangi kalemin adresine gidemediği. ' +
        '"Sepetimde ne var", "toplam ne kadar", "sepetim hazır mı" sorularında MUTLAKA bunu çağır.',
      inputSchema: z.object({
        postaKodu: z.string().min(4).optional().describe('Müşteri SÖYLEDİYSE posta kodu — "bu adrese gider mi" ona göre okunur. Söylemediyse boş bırak.'),
      }),
      execute: async ({ postaKodu }) => {
        try {
          return await ozet(postaKodu);
        } catch (err) {
          logger.warn({ ...log, tool: 'sepetim', err: String(err) }, 'sepet aracı okuyamadı');
          return { bilinmiyor: 'Sepet şu an okunamadı.' };
        }
      },
    }),

    sepete_ekle: tool({
      description:
        'Müşterinin istediği ürünü sepete ekler ve sepetin son hâlini döner. Ürünü ADIYLA geç; çok boylu üründe boyu da geç. ' +
        'Araç "secenekler" ya da "boylar" dönerse müşteriye o listeyi göster ve hangisini istediğini SOR — kendin seçme.',
      inputSchema: z.object({
        urun: z.string().min(2).describe('Ürün adı — müşterinin söylediği gibi, örn. "fıstıklı baklava".'),
        boy: z.string().min(1).optional().describe('Boy/gramaj etiketi — müşteri söylediyse ya da araç "boylar" listesi verdiyse, örn. "500 g".'),
        adet: z.number().int().positive().max(MAX_QTY).default(1).describe('Kaç adet — söylenmediyse 1.'),
        postaKodu: z.string().min(4).optional().describe('Müşteri söylediyse posta kodu.'),
      }),
      execute: async ({ urun, boy, adet, postaKodu }) => {
        try {
          const secim = await urunuCoz(db, { urun, boy, postaKodu }, input);
          if ('sonuc' in secim) return secim.sonuc;
          await carts.addItemsFor(owner, [{ variantId: secim.variantId, bundleId: null, qty: adet, unitPrice: secim.priceCents / 100, stockId: null }]);
          return { eklendi: { urun: secim.urun, boy: secim.boy, adet }, sepet: await ozet(postaKodu) };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepete_ekle', err: String(err) }, 'sepet aracı yazamadı');
          return { bilinmiyor: 'Sepete şu an eklenemedi.' };
        }
      },
    }),

    sepetten_cikar: tool({
      description:
        'Sepetten bir kalemi çıkarır ve sepetin son hâlini döner. Kalemi ADIYLA geç; sepette aynı ürünün iki boyu varsa boyu da geç.',
      inputSchema: z.object({
        urun: z.string().min(2).describe('Sepetteki ürünün adı.'),
        boy: z.string().min(1).optional().describe('Boy etiketi — aynı üründen iki boy varsa.'),
      }),
      execute: async ({ urun, boy }) => {
        try {
          const cart = await carts.getFor(owner);
          if (cart.items.length === 0) return { sepetBos: 'Sepet zaten boş.' };
          const view = await getCartView(db, 'tr', cart.items.map(entryOfItem), {
            customerId: input.pricingCustomerId,
            bundles: (ids, locale, bundlePlace) => getPackagesByIds(db, ids, locale, bundlePlace),
          });
          const adaylar = view.lines.filter((line) => esitAd(line.name, urun) || icerir(line.name, urun));
          const daralt = boy ? adaylar.filter((line) => esitAd(line.unitLabel, boy) || icerir(line.unitLabel, boy)) : adaylar;
          if (daralt.length === 0) return { bilinmiyor: `"${urun}" sepette yok. Sepettekiler: ${view.lines.map(satirAdi).join(' · ')}` };
          if (daralt.length > 1) return { secenekler: daralt.slice(0, MAX_CHOICES).map(satirAdi), soru: 'Hangisini çıkarayım? Müşteriye sor.' };
          const line = daralt[0]!;
          await carts.removeItemFor(owner, { variantId: line.variantId ?? null, bundleId: line.bundleId ?? null, stockId: line.stockId ?? null });
          return { cikarildi: satirAdi(line), sepet: await ozet() };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepetten_cikar', err: String(err) }, 'sepet aracı yazamadı');
          return { bilinmiyor: 'Sepetten şu an çıkarılamadı.' };
        }
      },
    }),

    sepet_baglantisi: tool({
      description:
        'Müşterinin sepetini SİTEDE açacak bağlantıyı üretir. Müşteri sepetini tamamlamak, onaylamak, ödemek istediğinde ya da ' +
        '"nasıl sipariş veririm" dediğinde ÇAĞIR. Bağlantı cevabının sonuna otomatik eklenir; sen yazma.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const cart = await carts.getFor(owner);
          const sonuc = await startCartLink(db, { conversationId: conversation.id });
          if (sonuc.status !== 'ok') return { bilinmiyor: 'Bağlantı şu an üretilemedi — müşteriye sitemizden devam edebileceğini söyle.' };
          input.onLink(sonuc.url);
          return {
            hazir: 'Bağlantı üretildi ve cevabının SONUNA otomatik eklenecek — sen bağlantıyı YAZMA.',
            ...(cart.items.length === 0 ? { uyari: 'Sepet şu an BOŞ; müşteri sayfada ürün ekleyebilir ama önce sepete_ekle ile doldurmak daha iyi.' } : {}),
            nasil: 'Müşteri bağlantıyı açar, e-postasıyla giriş yapar (şifre yok), sepetini görür, adresini seçer ve öder. Sepet hesabına geçer.',
            gecerlilik: '7 gün',
          };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepet_baglantisi', err: String(err) }, 'sepet bağlantısı üretilemedi');
          return { bilinmiyor: 'Bağlantı şu an üretilemedi.' };
        }
      },
    }),
  };
}

/** Varsayılan adres, yoksa ilk adres — `support-tools.ts` ile aynı ölçü. */
function birincilAdres(adresler: Address[]): Address | null {
  return adresler.find((a) => a.isDefault) ?? adresler[0] ?? null;
}

const normalize = (s: string) => s.trim().toLocaleLowerCase('tr');
const esitAd = (a: string, b: string) => normalize(a) === normalize(b);
const icerir = (a: string, b: string) => normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));

function satirAdi(line: CartLine): string {
  return line.unitLabel ? `${line.name} (${line.unitLabel})` : line.name;
}

/**
 * Adı söylenen ürünü SATILAN BİRİME (varyant) çözer — ya bir varyant ya da modele sorulacak soru.
 *
 * Katalog `urun_ara` ile AYNI kapıdan okunur (`getCatalogData`, `getProductDetail`): fiyat ve stok
 * kuralı ikinci kez yazılmıyor. Satışa kapalı ürün (fiyatsız) sepete GİRMEZ ve sebebi söylenir —
 * "0 €" ile eklemek, sitenin satmadığı şeyi sohbetin satması olurdu.
 */
async function urunuCoz(
  db: Db,
  girdi: { urun: string; boy?: string; postaKodu?: string },
  input: CartAgentToolsInput,
): Promise<{ variantId: string; priceCents: number; urun: string; boy: string } | { sonuc: Record<string, unknown> }> {
  const adres = input.addressCustomerId ? birincilAdres(await new AddressService(db).listByCustomer(input.addressCustomerId)) : null;
  const kod = girdi.postaKodu?.trim() || adres?.postalCode || null;
  const [place, viewer] = await Promise.all([kod ? resolvePlaceWarehouses(db, kod) : Promise.resolve(UNRESOLVED_PLACE), pricingViewerOf(db, input.pricingCustomerId)]);
  const ortak = { locale: 'tr' as const, place, viewer, includeUnsellable: true };

  const katalog = await getCatalogData(db, { ...ortak, query: { search: girdi.urun } });
  const tam = katalog.products.filter((p) => esitAd(p.name, girdi.urun));
  const adaylar = tam.length > 0 ? tam : katalog.products;
  if (adaylar.length === 0) return { sonuc: { bilinmiyor: `"${girdi.urun}" için katalogda eşleşen ürün yok.` } };
  if (adaylar.length > 1) {
    return { sonuc: { secenekler: adaylar.slice(0, MAX_CHOICES).map((p) => p.name), soru: 'Birden çok ürün eşleşti — müşteriye hangisini istediğini sor, sonra o adla yeniden çağır.' } };
  }

  const urun = adaylar[0]!;
  if (urun.variantCount <= 1) {
    if (!urun.variantId || urun.priceCents === null) return { sonuc: { satisaKapali: `${urun.name} bu kanalda satışa kapalı — sepete eklenemez; "kontrol edip döneceğiz" de.` } };
    return { variantId: urun.variantId, priceCents: urun.priceCents, urun: urun.name, boy: urun.unitLabel };
  }

  const detay = await getProductDetail(db, { ...ortak, slug: urun.slug });
  const boylar = (detay?.variants ?? []).filter((v) => v.priceCents !== null);
  if (boylar.length === 0) return { sonuc: { satisaKapali: `${urun.name} bu kanalda satışa kapalı — sepete eklenemez.` } };
  const secenekler = boylar.map((v) => ({ boy: v.label, fiyat: formatPrice(v.priceCents!, 'tr') }));
  if (!girdi.boy) return { sonuc: { boylar: { urun: urun.name, secenekler }, soru: 'Ürünün birden çok boyu var — müşteriye hangisini istediğini sor, sonra `boy` ile yeniden çağır.' } };

  const boyEs = boylar.filter((v) => esitAd(v.label, girdi.boy!));
  const boyAday = boyEs.length > 0 ? boyEs : boylar.filter((v) => icerir(v.label, girdi.boy!));
  if (boyAday.length !== 1) {
    return { sonuc: { boylar: { urun: urun.name, secenekler }, soru: `"${girdi.boy}" boyu tek bir seçenekle eşleşmedi — listeden birini müşteriye sor.` } };
  }
  const boy = boyAday[0]!;
  return { variantId: boy.id, priceCents: boy.priceCents!, urun: urun.name, boy: boy.label };
}

/**
 * Sepet görünümünün modele söylenen hâli — cümleler AÇIK, bayrak değil: `false` bir alanı model
 * "önemsiz" sayıp atlayabilir, cümleyi atlayamaz (`urun_ara`nın kargo alanıyla aynı karar).
 */
function sepetOzeti(view: CartView, yerBilinmiyor: boolean): Record<string, unknown> {
  const durum = (line: CartLine): string => {
    if (line.blocked) return 'SATIN ALINAMAZ — tükendi ya da bu kanalda satışa kapalı; sepetten çıkarılmalı';
    if (yerBilinmiyor) return 'stokta';
    const grup = cartGroupOf(line);
    if (grup === 'undeliverable') return 'BU ADRESE GÖNDERİLEMİYOR — soğuk zincir ürünü, bölge dışı; kapıya teslim bölgesinde değilse alınamaz';
    return grup === 'shipping' ? 'kargoyla gider' : 'kapıya teslim';
  };
  const indirim =
    view.discount.status === 'applied' || view.discount.status === 'automatic' ? formatPrice(view.discount.amountCents, 'tr') : null;

  return {
    kalemler: view.lines.map((line) => ({
      urun: line.name,
      boy: line.unitLabel,
      adet: line.qty,
      birimFiyat: line.unitPriceCents === null ? 'fiyatsız' : formatPrice(line.unitPriceCents, 'tr'),
      satirToplami: line.lineTotalCents === null ? 'fiyatsız' : formatPrice(line.lineTotalCents, 'tr'),
      durum: durum(line),
    })),
    kalemSayisi: view.itemCount,
    araToplam: formatPrice(view.subtotalCents, 'tr'),
    ...(indirim ? { indirim } : {}),
    toplam: formatPrice(view.totalCents, 'tr'),
    ...(view.minBasketOk
      ? {}
      : { asgariSepet: `Asgari sepet ${formatPrice(view.minBasketCents, 'tr')} — ${formatPrice(view.missingForMinBasketCents, 'tr')} eksik; müşteri bu hâlde sipariş VEREMEZ, ürün eklemeli.` }),
    ...(yerBilinmiyor
      ? { yerBilinmiyor: 'Adres bilinmiyor — "bu adrese gider mi" okunmadı. Müşteriye posta kodunu SOR ve `postaKodu` ile yeniden çağır.' }
      : {}),
    not: 'Sepete eklemek sipariş DEĞİLDİR: onay, adres ve ödeme sitede yapılır (sepet_baglantisi).',
  };
}
