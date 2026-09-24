// `z` porttan geliyor — SDK tek zod örneği bekliyor (`support-tools.ts` künyesi).
import { tool, z, type ToolSet } from '@lezzet/ai';
import { CartService, type CartOwner, type Db } from '@lezzet/database';
import { formatPrice } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Conversation, Country } from '@lezzet/types';
import { getCatalogData } from '../catalog/catalog';
import { getPackagesByIds, listStorefrontPackages } from '../catalog/packages';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { getProductDetail } from '../catalog/product';
import type { PlaceWarehouses } from '../catalog/storefront-types';
import { cartGroupOf, entryOfItem, shippingGroupFree, type CartEntry, type CartLine, type CartView } from './cart-types';
import { resolveChatPlace, ULKE_GIRDISI, yerNotu, type ChatPlace, type ChatPlaceMemory } from './chat-place';
import { startCartLink, supportLinkUrl } from './link';
import type { ChatLink } from './link-text';
import { getCartView } from './read';

/*
  Ajanın sepet araçları: sepet geri alınabilir bir niyet olduğu için yazma yetkisi yalnız sepete açıktır, adres, ödeme ve sipariş sitede
  kalır. Okuma sitenin ve uygulamanın sepetiyle aynı kapıdan (`getCartView`) geçer ki ajanın söylediği tutar sayfadakinden ayrışmasın.
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
  /** Bağlantı üretildiğinde çağrılır — `ai.ts` cevabın sonuna deterministik ekler; amaç cümleyi ve düğmeyi seçer. */
  onLink: (link: ChatLink) => void;
  /**
   * `hesap_baglantisi` verilsin mi: yalnız kimlik kapısı kapalıyken, kararı `accountLinkOffered` (`ai.ts`) verir; verilmezse araç sette
   * yok.
   */
  accountLink?: boolean;
  /**
   * Sepete yazıldı (ekle/adet/çıkar); `ai.ts` bu turda bağlantıyı garantiler (`cartLinkIfDue`). `hazir` sepetin bu hâliyle sipariş
   * verilebilir olduğunu söyler, değilse "Sepetiniz hazır" kendiliğinden gitmez.
   */
  onCartWrite?: (hazir: boolean) => void;
  /**
   * Sohbetin teslimat yeri hafızası: söylenen posta kodu saklanır ve sonraki turlar bilir (`chat-place.ts`). Verilmezse yalnız bu turda
   * söylenen kod ve kayıtlı adres okunur.
   */
  place?: ChatPlaceMemory | null;
}

/** Sepetin sahibi: müşterili sohbette müşteri, kimliksizde sohbetin kendisi; araçlar ve söz garantisi aynı sepete bakar. */
function cartOwnerOf(conversation: Conversation): CartOwner {
  return conversation.customerId ? { customerId: conversation.customerId } : { conversationId: conversation.id };
}

/**
 * Bağlantı sözü verildiyse bağlantı olur: model "aşağıdaki bağlantıdan" yazıp aracı çağırmayabilir ve sözü tutmak sistemin işidir. Sepet
 * boşsa bağlantı üretilmez; söz yoksa ya da çağıranın kabı doluysa dokunulmaz.
 */
export async function cartLinkIfDue(
  db: Db,
  conversation: Conversation,
  input: { reply: string | null; cartWritten: boolean },
): Promise<ChatLink | null> {
  /* Bu turda sepete yazıldıysa ve sepet sipariş verilebilirse bağlantı modelin sözünü beklemeden gider, çünkü onay ve ödeme yalnız
     sitede olur ve bağlantısız bir sepet çıkmaz sokaktır. */
  const promised = !!input.reply && /bağlant|\blink\b/i.test(input.reply);
  if (!promised && !input.cartWritten) return null;
  try {
    const cart = await new CartService(db).getFor(cartOwnerOf(conversation));
    if (cart.items.length === 0) return null;
    const sonuc = await startCartLink(db, { conversationId: conversation.id });
    return sonuc.status === 'ok' ? { url: sonuc.url, purpose: 'cart' } : null;
  } catch (err) {
    logger.warn({ context: 'application/cart-agent-tools', conversationId: conversation.id, err: String(err) }, 'söz verilen sepet bağlantısı üretilemedi');
    return null;
  }
}

/**
 * Sohbete kapatılmış sepet araçları; hata fırlatmaz, `bilinmiyor` döner ve log'a kimlik düşer, yoksa koşu düşer ve müşteri cevapsız
 * kalırdı. Eklemek ile eşitlemek ayrı araçtır, çünkü ikisini bir bayrakla ayırmak modelin bayrağı unuttuğu gün iki kat ürün demekti.
 */
export function cartAgentTools(db: Db, input: CartAgentToolsInput): ToolSet {
  const { conversation } = input;
  const owner = cartOwnerOf(conversation);
  const carts = new CartService(db);
  const log = { context: 'application/cart-agent-tools', conversationId: conversation.id };

  /* Müşteri sepetine yazan araç sohbeti damgalar ki sipariş sitede ödense de kaynağı bu sohbetin kanalı olsun. Sohbet sepetinde damga
     gerekmez, iz bağlantı devralınırken hedef sepete geçer (`link.ts`). */
  const damgala = async (hazir: boolean): Promise<void> => {
    // Yazan her araç buradan geçer: kabı "yazıldı" diye işaretlemek de bu tek noktanın işi.
    input.onCartWrite?.(hazir);
    if (conversation.customerId) await carts.stampChat(owner, conversation.id);
  };

  /* Yer dört kaynaktan, TEK sırayla (`chat-place.ts`): söylenen · sohbette saklanan · kayıtlı adres
     (yalnız izinliyse) · hiçbiri. Söylenen kod gerçekse sohbete yazılır — müşteri bir daha söylemez. */
  const yer = (postaKodu?: string, ulke?: Country): Promise<ChatPlace> =>
    resolveChatPlace(db, { said: postaKodu, saidCountry: ulke, memory: input.place ?? null, addressCustomerId: input.addressCustomerId });

  /** Sepet görünümü bu yerin depolarıyla — özet, hazırlık ve "bu adrese gider mi" aynı hesaptan okunur. */
  const gorunum = (entries: CartEntry[], yerim: ChatPlace) =>
    getCartView(db, 'tr', entries, {
      customerId: input.pricingCustomerId,
      warehouseId: yerim.place.warehouseId,
      shippingWarehouseId: yerim.place.shippingWarehouseId,
      bundles: (ids, locale, bundlePlace) => getPackagesByIds(db, ids, locale, bundlePlace),
    });

  /**
   * Sepetteki satırı ADIYLA bulur (adet değiştirme ve çıkarma aynı soruyu soruyor — tek gövde).
   * Ad görünümden okunur (`getCartView`): sepet satırı yalnız kimlik taşır, adı bilmez.
   */
  const satirBul = async (urun: string, boy: string | undefined): Promise<{ line: CartLine } | { sonuc: Record<string, unknown> }> => {
    const cart = await carts.getFor(owner);
    if (cart.items.length === 0) return { sonuc: { sepetBos: 'Sepet zaten boş.' } };
    const view = await getCartView(db, 'tr', cart.items.map(entryOfItem), {
      customerId: input.pricingCustomerId,
      bundles: (ids, locale, bundlePlace) => getPackagesByIds(db, ids, locale, bundlePlace),
    });
    const adaylar = view.lines.filter((line) => esitAd(line.name, urun) || icerir(line.name, urun));
    const daralt = boy ? adaylar.filter((line) => esitAd(line.unitLabel, boy) || icerir(line.unitLabel, boy)) : adaylar;
    if (daralt.length === 0) return { sonuc: { bilinmiyor: `"${urun}" sepette yok. Sepettekiler: ${view.lines.map(satirAdi).join(' · ')}` } };
    if (daralt.length > 1) return { sonuc: { secenekler: daralt.slice(0, MAX_CHOICES).map(satirAdi), soru: 'Hangisi? Müşteriye sor.' } };
    return { line: daralt[0]! };
  };

  /**
   * Sepetin son hâli ve siparişe hazır mı: yer biliniyor, asgari sepet dolu, satın alınamayan ya da gönderilemeyen kalem yok. "Sepetiniz
   * hazır" düğmesi yalnız bu hâlde kendiliğinden gider.
   */
  const durum = async (yerim: ChatPlace): Promise<{ ozet: Record<string, unknown>; hazir: boolean }> => {
    const cart = await carts.getFor(owner);
    if (cart.items.length === 0) {
      return { ozet: { sepetBos: 'Sepet BOŞ — henüz hiçbir ürün eklenmemiş. Bu bir erişim sorunu değil; sepeti okuyabildin, boş çıktı.' }, hazir: false };
    }
    const view = await gorunum(cart.items.map(entryOfItem), yerim);
    const hazir = yerim.durum === 'biliniyor' && view.minBasketOk && view.lines.every((line) => !line.blocked && cartGroupOf(line) !== 'undeliverable');
    return { ozet: sepetOzeti(view, yerim), hazir };
  };

  const ozet = async (postaKodu?: string, ulke?: Country) => (await durum(await yer(postaKodu, ulke))).ozet;

  /**
   * Seçilen kalem bu adrese gidebilir mi, sepete yazmadan önce tek satırlık görünümle bakılır. Sepete koyup sonra "gönderilemiyor" demek
   * müşteriye olmayan bir sepet kurdurmaktı.
   */
  const gonderilemez = async (secim: CozulmusSatir, yerim: ChatPlace): Promise<Record<string, unknown> | null> => {
    const entry: CartEntry = secim.bundleId
      ? { kind: 'bundle', bundleId: secim.bundleId, qty: 1 }
      : { kind: 'variant', variantId: secim.variantId ?? '', qty: 1, stockId: null };
    const [satir] = (await gorunum([entry], yerim)).lines;
    if (!satir || cartGroupOf(satir) !== 'undeliverable') return null;
    return {
      gonderilemez: `${secim.urun} bu posta koduna (${yerim.kod}) gönderilemiyor — soğuk zincir ürünü, yalnız teslimat bölgemizde kapıya gider. Sepete EKLENMEDİ: müşteriye söyle ve kargoyla gidebilen bir alternatif öner.`,
    };
  };

  return {
    sepetim: tool({
      description:
        'Müşterinin sepetini okur: kalemler, adetler, fiyatlar, toplam, indirim, asgari sepet ve hangi kalemin adresine gidemediği. ' +
        '"Sepetimde ne var", "toplam ne kadar", "sepetim hazır mı" sorularında MUTLAKA bunu çağır.',
      inputSchema: z.object({
        postaKodu: z.string().min(4).optional().describe('Müşteri SÖYLEDİYSE posta kodu — "bu adrese gider mi" ona göre okunur. Söylemediyse boş bırak.'),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ postaKodu, ulke }) => {
        try {
          return await ozet(postaKodu, ulke);
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
        postaKodu: z
          .string()
          .min(4)
          .optional()
          .describe('Müşteri söylediyse posta kodu — bir kez söylenen kod saklanır; araç "sepeteYazilmadi" dönerse müşteriye sor ve bununla yeniden çağır.'),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ urun, boy, adet, postaKodu, ulke }) => {
        try {
          // Yer önce: "bu adrese gider mi" bilinmeden sepet kurulmaz.
          const yerim = await yer(postaKodu, ulke);
          const engel = yerEngeli(yerim);
          if (engel) return engel;
          const secim = await urunuCoz(db, { urun, boy }, yerim.place, input);
          if ('sonuc' in secim) return secim.sonuc;
          const gidemez = await gonderilemez(secim, yerim);
          if (gidemez) return gidemez;
          await carts.addItemsFor(owner, [{ variantId: secim.variantId, bundleId: secim.bundleId, qty: adet, unitPrice: secim.priceCents / 100, stockId: null }]);
          const son = await durum(yerim);
          await damgala(son.hazir);
          return { eklendi: { urun: secim.urun, boy: secim.boy, adet }, sepet: son.ozet };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepete_ekle', err: String(err) }, 'sepet aracı yazamadı');
          return { bilinmiyor: 'Sepete şu an eklenemedi.' };
        }
      },
    }),

    sepet_adet: tool({
      description:
        'Sepetteki bir kalemin adedini verilen sayıya EŞİTLER ("iki tane olsun", "üçe çıkar", "bir tane yeter"); 0 çıkarır. ' +
        'Eklemek için değil — "bir tane daha" sepete_ekle ile. Kalemi ADIYLA geç; aynı ürünün iki boyu varsa boyu da geç.',
      inputSchema: z.object({
        urun: z.string().min(2).describe('Sepetteki ürünün adı.'),
        boy: z.string().min(1).optional().describe('Boy etiketi — aynı üründen iki boy varsa.'),
        adet: z.number().int().min(0).max(MAX_QTY).describe('Yeni adet — sepette olacak TOPLAM sayı; 0 kalemi çıkarır.'),
        postaKodu: z.string().min(4).optional().describe('Müşteri söylediyse posta kodu.'),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ urun, boy, adet, postaKodu, ulke }) => {
        try {
          const bulunan = await satirBul(urun, boy);
          if ('sonuc' in bulunan) return bulunan.sonuc;
          const { line } = bulunan;
          const yerim = await yer(postaKodu, ulke);
          // Azaltmak ya da çıkarmak yer istemez; ARTIRMAK sepet kurmaktır — sepete_ekle ile aynı şart.
          const engel = adet > line.qty ? yerEngeli(yerim) : null;
          if (engel) return engel;
          await carts.setQtyFor(owner, { variantId: line.variantId ?? null, bundleId: line.bundleId ?? null, stockId: line.stockId ?? null }, adet);
          const son = await durum(yerim);
          await damgala(son.hazir);
          return adet === 0 ? { cikarildi: satirAdi(line), sepet: son.ozet } : { guncellendi: { urun: satirAdi(line), adet }, sepet: son.ozet };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepet_adet', err: String(err) }, 'sepet aracı yazamadı');
          return { bilinmiyor: 'Adet şu an değiştirilemedi.' };
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
          const bulunan = await satirBul(urun, boy);
          if ('sonuc' in bulunan) return bulunan.sonuc;
          const { line } = bulunan;
          await carts.removeItemFor(owner, { variantId: line.variantId ?? null, bundleId: line.bundleId ?? null, stockId: line.stockId ?? null });
          const son = await durum(await yer());
          await damgala(son.hazir);
          return { cikarildi: satirAdi(line), sepet: son.ozet };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepetten_cikar', err: String(err) }, 'sepet aracı yazamadı');
          return { bilinmiyor: 'Sepetten şu an çıkarılamadı.' };
        }
      },
    }),

    sepet_baglantisi: tool({
      description:
        'Müşterinin sepetini SİTEDE açacak bağlantıyı üretir. Sepet DOLUYKEN ve müşteri tamamlamak, onaylamak, ödemek istediğinde ÇAĞIR. ' +
        'Boş sepette çağırma: "nasıl sipariş veririm" sorusuna önce ne istediğini sor ya da sepete_ekle ile doldur. Bağlantı cevabının sonuna otomatik eklenir; sen yazma.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const cart = await carts.getFor(owner);
          // Boş sepete bağlantı yok: üretilse kap dolar ve cevaba "Sepetiniz hazır" satırı sepet boşken eklenirdi.
          if (cart.items.length === 0) {
            return {
              bos: 'Sepet BOŞ — bağlantı üretilmedi. Önce sepete_ekle ile ürün ekle; müşteri yalnız nasıl sipariş vereceğini sorduysa ne istediğini sor. Bağlantı sepet doluyken gönderilir.',
            };
          }
          const sonuc = await startCartLink(db, { conversationId: conversation.id });
          if (sonuc.status !== 'ok') return { bilinmiyor: 'Bağlantı şu an üretilemedi — müşteriye sitemizden devam edebileceğini söyle.' };
          input.onLink({ url: sonuc.url, purpose: 'cart' });
          return {
            hazir: 'Bağlantı üretildi ve cevabının SONUNA otomatik eklenecek — sen bağlantıyı YAZMA.',
            nasil: 'Müşteri bağlantıyı açar, e-postasıyla giriş yapar (şifre yok), sepetini görür, adresini seçer ve öder. Sepet hesabına geçer.',
            gecerlilik: '7 gün',
          };
        } catch (err) {
          logger.warn({ ...log, tool: 'sepet_baglantisi', err: String(err) }, 'sepet bağlantısı üretilemedi');
          return { bilinmiyor: 'Bağlantı şu an üretilemedi.' };
        }
      },
    }),

    /* Şikâyette ajan talep açmaz, talep sayfasının bağlantısını verir, çünkü hesap, sipariş ve ürün seçimini sayfa bilir. Bağlantı
       jetonsuzdur ve her turda verilir, şikâyet kimliksiz sohbette de doğar. */
    talep_baglantisi: tool({
      description:
        'Müşteriye TALEP AÇMA sayfasının bağlantısını verir. Şikâyet (bozuk, eksik, yanlış ürün), iade ya da tazminat isteğinde ÇAĞIR — ' +
        'talebi sen açamazsın; müşteri sayfada giriş yapıp siparişini ve ürünü seçer, sorunu yazar, fotoğraf ekler. Bağlantı cevabının sonuna otomatik eklenir; sen yazma.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const url = await supportLinkUrl(db, conversation.id);
          if (!url) return { bilinmiyor: 'Bağlantı şu an üretilemedi — müşteriye sitemizdeki talep sayfasından yazabileceğini söyle.' };
          input.onLink({ url, purpose: 'support' });
          return {
            hazir: 'Talep bağlantısı cevabının SONUNA otomatik eklenecek — sen bağlantıyı YAZMA.',
            nasil: 'Müşteri bağlantıyı açar, giriş yapar (e-posta kodu, şifre yok), siparişini ve sorunlu ürünü seçip yazar; fotoğraf ekleyebilir. Talep ekibimize düşer, cevap orada verilir.',
          };
        } catch (err) {
          logger.warn({ ...log, tool: 'talep_baglantisi', err: String(err) }, 'talep bağlantısı üretilemedi');
          return { bilinmiyor: 'Bağlantı şu an üretilemedi.' };
        }
      },
    }),

    /* Sohbeti müşterinin hesabına bağlatan bağlantı; yalnız kimlik kapısı kapalıyken verilir, çünkü Messenger/IG'de kimlik başka yoldan
       kurulamaz. Sepet boş olabilir, doluysa giriş anında taşınır (`claimCartLink`). */
    ...(input.accountLink
      ? {
          hesap_baglantisi: tool({
            description:
              'Sohbeti müşterinin SİTEDEKİ hesabına bağlayacak bağlantıyı üretir. Müşteri siparişlerini, sipariş durumunu, adreslerini, puanlarını ya da hesabını sorduğunda ÇAĞIR — ' +
              'bu sohbet henüz bir hesaba bağlı değil, o bilgiler bağlanınca açılır. Bağlantı cevabının sonuna otomatik eklenir; sen yazma. ' +
              'Müşteri sepetini tamamlamak istiyorsa bunun yerine sepet_baglantisi: o da giriş yapınca sohbeti hesaba bağlar.',
            inputSchema: z.object({}),
            execute: async () => {
              try {
                const sonuc = await startCartLink(db, { conversationId: conversation.id, purpose: 'account' });
                if (sonuc.status !== 'ok') {
                  return { bilinmiyor: 'Bağlantı şu an üretilemedi — müşteriye sitemizde hesabına girerek siparişlerini görebileceğini söyle.' };
                }
                input.onLink({ url: sonuc.url, purpose: 'account' });
                return {
                  hazir: 'Hesap bağlantısı üretildi ve cevabının SONUNA otomatik eklenecek — sen bağlantıyı YAZMA.',
                  nasil: 'Müşteri bağlantıyı açar, e-postasına gelen kodla giriş yapar (şifre yok); sohbet o anda hesabına bağlanır. Sonra siparişlerini ve hesabını bu sohbetten sorabilir.',
                  gecerlilik: '7 gün',
                };
              } catch (err) {
                logger.warn({ ...log, tool: 'hesap_baglantisi', err: String(err) }, 'hesap bağlantısı üretilemedi');
                return { bilinmiyor: 'Bağlantı şu an üretilemedi.' };
              }
            },
          }),
        }
      : {}),
  };
}

/**
 * Sepete yazmadan önce yer şartı: "bu adrese gider mi" okunamıyorsa araç yazmaz ve modele ne soracağını söyler. Okuma araçları serbesttir,
 * çünkü bilgi vermek yer istemez.
 */
function yerEngeli(yerim: ChatPlace): Record<string, string> | null {
  if (yerim.durum === 'biliniyor') return null;
  return { sepeteYazilmadi: 'Yer okunamadığı için sepete YAZILMADI — önce aşağıdakini çöz, sonra aynı aracı yeniden çağır.', ...yerNotu(yerim) };
}

const normalize = (s: string) => s.trim().toLocaleLowerCase('tr');
const esitAd = (a: string, b: string) => normalize(a) === normalize(b);
const icerir = (a: string, b: string) => normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));

function satirAdi(line: CartLine): string {
  return line.unitLabel ? `${line.name} (${line.unitLabel})` : line.name;
}

/** Çözülmüş satır — ürün (varyant) ya da paket; ikisinden tam biri dolu (`sameLine` kuralı). */
interface CozulmusSatir {
  variantId: string | null;
  bundleId: string | null;
  priceCents: number;
  urun: string;
  boy: string;
}

/**
 * Adı söylenen şeyi satılan birime (varyant, paket ya da sorulacak soru) katalogla aynı kapıdan çözer; fiyatsız ürün sepete girmez. Paket
 * ancak ürün eşleşmezse aranır, çünkü paket adları ürün adlarını içerir.
 */
async function urunuCoz(
  db: Db,
  girdi: { urun: string; boy?: string },
  /** Yer çağıranda çözüldü (`chat-place.ts`) — ürün çözümü ikinci bir yer kararı vermez. */
  place: PlaceWarehouses,
  input: CartAgentToolsInput,
): Promise<CozulmusSatir | { sonuc: Record<string, unknown> }> {
  const viewer = await pricingViewerOf(db, input.pricingCustomerId);
  const ortak = { locale: 'tr' as const, place, viewer, includeUnsellable: true };

  const katalog = await getCatalogData(db, { ...ortak, query: { search: girdi.urun } });
  const tam = katalog.products.filter((p) => esitAd(p.name, girdi.urun));
  const adaylar = tam.length > 0 ? tam : katalog.products;
  if (adaylar.length === 0) return paketiCoz(db, girdi.urun);
  if (adaylar.length > 1) {
    return { sonuc: { secenekler: adaylar.slice(0, MAX_CHOICES).map((p) => p.name), soru: 'Birden çok ürün eşleşti — müşteriye hangisini istediğini sor, sonra o adla yeniden çağır.' } };
  }

  const urun = adaylar[0]!;
  if (urun.variantCount <= 1) {
    if (!urun.variantId || urun.priceCents === null) return { sonuc: { satisaKapali: `${urun.name} bu kanalda satışa kapalı — sepete eklenemez; "kontrol edip döneceğiz" de.` } };
    return { variantId: urun.variantId, bundleId: null, priceCents: urun.priceCents, urun: urun.name, boy: urun.unitLabel };
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
  return { variantId: boy.id, bundleId: null, priceCents: boy.priceCents!, urun: urun.name, boy: boy.label };
}

/**
 * Paketi adıyla çözer — sitenin satılabilir paket listesinden (`listStorefrontPackages`: pasif ve
 * kalemi satıştan kalkmış paket zaten düşmüş). Paket sepette TEK satırdır, tek fiyatla (DOMAIN §13);
 * boyu yoktur.
 */
async function paketiCoz(db: Db, ad: string): Promise<CozulmusSatir | { sonuc: Record<string, unknown> }> {
  const paketler = await listStorefrontPackages(db, 'tr');
  const tam = paketler.filter((p) => esitAd(p.name, ad));
  const adaylar = tam.length > 0 ? tam : paketler.filter((p) => icerir(p.name, ad));
  if (adaylar.length === 0) return { sonuc: { bilinmiyor: `"${ad}" için katalogda eşleşen ürün ya da paket yok.` } };
  if (adaylar.length > 1) {
    return { sonuc: { secenekler: adaylar.slice(0, MAX_CHOICES).map((p) => p.name), soru: 'Birden çok paket eşleşti — müşteriye hangisini istediğini sor.' } };
  }
  const paket = adaylar[0]!;
  return { variantId: null, bundleId: paket.id, priceCents: paket.priceCents, urun: paket.name, boy: '' };
}

/**
 * Kargo cümlesi: ücretsiz kargo eşiği ve eşiğe kalan. Ücretin tutarı söylenmez, çünkü taşıyıcı onu ödeme adımında seçilen servise göre
 * fiyatlar; eşik adres bilinmese de söylenir, "şu tutardan sonra kargo bedava" satış cümlesidir.
 */
function kargoCumlesi(view: CartView, yerim: ChatPlace): string {
  const esik = formatPrice(view.freeShippingCents, 'tr');
  const odemede = 'kargo ücreti ödeme adımında müşterinin seçtiği servise göre eklenir; tutar SÖYLEME, tahmin de verme';
  if (yerim.durum === 'hizmet-yok') return 'Bu posta koduna şu an ne kapıya teslim ne kargo var.';
  if (yerim.durum !== 'biliniyor') return `Kargo ürünleri ${esik} ve üzerindeyse kargo ÜCRETSİZ; altındaysa ${odemede}.`;
  if (view.shippingSubtotalCents <= 0) return 'Sepettekiler kapıya teslim bölgesinde — kargo ücreti yok.';
  const esikCevabi = shippingGroupFree(view);
  const kargoUrunleri = formatPrice(view.shippingSubtotalCents, 'tr');
  if (esikCevabi.free) return `Kargo ÜCRETSİZ — kargoyla giden ürünler ${kargoUrunleri}, ${esik} eşiği aşıldı.`;
  return `Kargoyla giden ürünler ${kargoUrunleri}: ${odemede}. ${esik} ve üzerinde kargo ÜCRETSİZ — eşiğe ${formatPrice(esikCevabi.remainingForFreeCents, 'tr')} kaldı, müşteriye SÖYLE.`;
}

/**
 * Sepet görünümünün modele söylenen hâli — cümleler AÇIK, bayrak değil: `false` bir alanı model
 * "önemsiz" sayıp atlayabilir, cümleyi atlayamaz (`urun_ara`nın kargo alanıyla aynı karar).
 */
function sepetOzeti(view: CartView, yerim: ChatPlace): Record<string, unknown> {
  const durum = (line: CartLine): string => {
    if (line.blocked) return 'SATIN ALINAMAZ — tükendi ya da bu kanalda satışa kapalı; sepetten çıkarılmalı';
    if (yerim.durum === 'hizmet-yok') return 'BU POSTA KODUNA TESLİMAT YOK';
    if (yerim.durum !== 'biliniyor') return 'stokta';
    const grup = cartGroupOf(line);
    if (grup === 'undeliverable') return 'BU ADRESE GÖNDERİLEMİYOR — soğuk zincir ürünü, bölge dışı; kapıya teslim bölgesinde değilse alınamaz';
    return grup === 'shipping' ? 'kargoyla gider' : 'kapıya teslim';
  };
  const indirim =
    view.discount.status === 'applied' || view.discount.status === 'automatic' ? formatPrice(view.discount.amountCents, 'tr') : null;
  const kargo = kargoCumlesi(view, yerim);

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
    ...(indirim ? { indirim: `${indirim} indirim uygulandı — müşteriye SÖYLE` } : {}),
    /* Toplam sitenin sepetindeki tutardır ve kargo içermez; kargo ayrı cümlede söylenir ki ajanın tutarı sitede görülenle ayrışmasın. */
    kargo,
    toplam: `${formatPrice(view.totalCents, 'tr')} — ürün toplamı, kargo hariç`,
    ...(view.minBasketOk
      ? {}
      : { asgariSepet: `Asgari sepet ${formatPrice(view.minBasketCents, 'tr')} — ${formatPrice(view.missingForMinBasketCents, 'tr')} eksik; müşteri bu hâlde sipariş VEREMEZ, ürün eklemeli.` }),
    ...yerNotu(yerim),
    not: 'Sepete eklemek sipariş DEĞİLDİR: onay, adres ve ödeme sitede yapılır (sepet_baglantisi).',
  };
}
