// `z` porttan geliyor — SDK tek zod örneği bekliyor (`support-tools.ts` künyesi).
import { tool, z, type ToolSet } from '@lezzet/ai';
import { CartService, type CartOwner, type Db } from '@lezzet/database';
import { formatPrice } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Conversation } from '@lezzet/types';
import { getCatalogData } from '../catalog/catalog';
import { getPackagesByIds, listStorefrontPackages } from '../catalog/packages';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { getProductDetail } from '../catalog/product';
import type { PlaceWarehouses } from '../catalog/storefront-types';
import { cartGroupOf, cartPayableCents, entryOfItem, shippingGroupFee, type CartEntry, type CartLine, type CartView } from './cart-types';
import { resolveChatPlace, yerNotu, type ChatPlace, type ChatPlaceMemory } from './chat-place';
import { startCartLink } from './link';
import type { ChatLink } from './link-text';
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

  ── HESAP BAĞLANTISI DA BURADA (15.16 · 10.09) ─────────────────────────────
  `hesap_baglantisi` sepet aracı değil ama sepet bağlantısının kardeşi: aynı jeton kapısı, aynı kap
  (`onLink`), yalnız amacı ve vardığı sayfa farklı. Kimlik kapısı KAPALIYKEN verilir — kapıyı
  müşterinin kendi eliyle açmanın yolu bu; açık kapıda araç hiç yok (`accountLinkOffered`, `ai.ts`).

  ── SEPETE YAZMADAN ÖNCE YER (kullanıcı kararı 10.09) ──────────────────────
  Ekleyen ve artıran araç posta kodu bilinmeden YAZMAZ; kod bir kez söylenir ve sohbette saklanır
  (`chat-place.ts`). Yer bilinince bu adrese gidemeyen kalem de eklenmez (soğuk zincir, rota dışı).
  Canlı turda araç "posta kodunu sor" diyordu ve model başka bir soru sordu — rica kural değildir.
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
   * `hesap_baglantisi` verilsin mi (15.16) — yalnız kimlik kapısı kapalıyken ve işe yarayacakken;
   * kararı `accountLinkOffered` (`ai.ts`) verir. Verilmezse araç sette HİÇ yok.
   */
  accountLink?: boolean;
  /**
   * Sepete YAZILDI (ekle/adet/çıkar) — `ai.ts` bu turda bağlantıyı garantiler (`cartLinkIfDue`).
   * `hazir`: sepet bu hâliyle SİPARİŞ VERİLEBİLİR mi (yer biliniyor, asgari sepet dolu, satın
   * alınamayan ya da gönderilemeyen kalem yok); değilse "Sepetiniz hazır" kendiliğinden gitmez (10.09).
   */
  onCartWrite?: (hazir: boolean) => void;
  /**
   * Sohbetin teslimat yeri hafızası (10.09) — söylenen posta kodu saklanır, sonraki turlar bilir
   * (`chat-place.ts`). Verilmezse yalnız bu turda söylenen kod ve kayıtlı adres okunur.
   */
  place?: ChatPlaceMemory | null;
}

/**
 * Sohbete KAPATILMIŞ sepet araçları — beşi de aynı sepeti görür.
 *
 * Araç gövdesinde hata olursa fırlatmaz — `bilinmiyor` döner ve log'a KİMLİK düşer (içerik değil):
 * fırlatan bir araç koşuyu düşürür ve müşteri cevapsız kalırdı (`support-tools.ts` ile aynı kural).
 *
 * EKLEMEK ile EŞİTLEMEK ayrı araçtır ve bilinçli: *"bir tane daha"* ekler, *"iki tane olsun"*
 * eşitler. Tek araçta ikisini bir bayrakla ayırmak, modelin bayrağı unuttuğu gün müşterinin
 * sepetinde istediğinin iki katı ürün demekti — sitedeki "+" ile adet kutusunun aynı ayrımı.
 */
/** Sepetin sahibi: müşterili sohbette müşteri, kimliksizde sohbetin kendisi (15.22). Tek yerde — araçlar ve söz garantisi aynı sepete bakar. */
function cartOwnerOf(conversation: Conversation): CartOwner {
  return conversation.customerId ? { customerId: conversation.customerId } : { conversationId: conversation.id };
}

/**
 * **BAĞLANTI SÖZÜ VERİLDİYSE BAĞLANTI OLUR** (08.09, canlı Messenger turunda ölçüldü).
 *
 * Model *"Sepetiniz hazır, aşağıdaki bağlantıdan giriş yapıp onaylayabilirsiniz"* yazdı ve
 * `sepet_baglantisi`'ni ÇAĞIRMADI: kap boş kaldı, satır eklenmedi, müşteri boş bir söz okudu ve
 * "bağlantı yok" dedi. Bağlantıyı model değil sistem ekler (`withCartLink`); sözü tutmak da sistemin
 * işi olmalı — istemde "önce aracı çağır" yazmak bir ricadır, bu ise kural. Sepet BOŞSA yine
 * üretilmez (aracın 07.09 kuralı): boş sepete bağlantı, boş sözden kötüdür. Kap zaten doluysa ya da
 * cevapta söz yoksa dokunmaz; çağıran `null`da kendi kabını korur.
 */
export async function cartLinkIfDue(
  db: Db,
  conversation: Conversation,
  input: { reply: string | null; cartWritten: boolean },
): Promise<ChatLink | null> {
  /* İKİNCİ ÖLÇÜM (08.09, aynı tur): müşteri "sepete koy" dedi, ajan koydu; sonraki turda 👍 gelince
     ajan "afiyet olsun" deyip kapattı — bağlantı sözü de geçmedi, araç da çağrılmadı, müşteri siteye
     bağlantısız kaldı. Onay ve ödeme yalnız sitede (15.21); bağlantısız bir sepet yazımı çıkmaz sokak.
     Kural: bu turda sepete YAZILDIYSA bağlantı gider, modelin sözünü beklemeden — ama yalnız sepet
     SİPARİŞ VERİLEBİLİRSE (10.09: çağıran `cartWritten`i yazım + hazırlık olarak geçer, `ai.ts`). */
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

export function cartAgentTools(db: Db, input: CartAgentToolsInput): ToolSet {
  const { conversation } = input;
  const owner = cartOwnerOf(conversation);
  const carts = new CartService(db);
  const log = { context: 'application/cart-agent-tools', conversationId: conversation.id };

  /* SOHBETİN İZİ (15.23): müşteri sepetine yazan her araç sohbeti damgalar — sipariş sitede ödense de
     kaynağı bu sohbetin kanalı olur. Sohbet sepetinde (kimliksiz) damga gerekmez: satırın sahibi
     zaten sohbet, iz bağlantı devralınırken hedef sepete geçer (`link.ts`). */
  const damgala = async (hazir: boolean): Promise<void> => {
    // Yazan her araç buradan geçer: kabı "yazıldı" diye işaretlemek de bu tek noktanın işi (08.09).
    input.onCartWrite?.(hazir);
    if (conversation.customerId) await carts.stampChat(owner, conversation.id);
  };

  /* Yer dört kaynaktan, TEK sırayla (`chat-place.ts`): söylenen · sohbette saklanan · kayıtlı adres
     (yalnız izinliyse) · hiçbiri. Söylenen kod gerçekse sohbete yazılır — müşteri bir daha söylemez. */
  const yer = (postaKodu: string | undefined): Promise<ChatPlace> =>
    resolveChatPlace(db, { said: postaKodu, memory: input.place ?? null, addressCustomerId: input.addressCustomerId });

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
   * Sepetin son hâli — modele giden özet ve SİPARİŞE HAZIR mı. Hazır: yer biliniyor, asgari sepet
   * dolu, satın alınamayan ya da bu adrese gönderilemeyen kalem yok. "Sepetiniz hazır" düğmesi yalnız
   * bu hâlde kendiliğinden gider (10.09 · canlı turda 22,84 €'luk sepete, asgari 40 €'yken gitmişti).
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

  const ozet = async (postaKodu?: string) => (await durum(await yer(postaKodu))).ozet;

  /**
   * Seçilen kalem BU ADRESE gidebilir mi — sepete yazmadan önce, tek satırlık görünümle (10.09).
   * Soğuk zincir ürünü rota dışındaki koda ne araçla ne kargoyla gider (`not_shippable_here`);
   * sepete koyup sonra "gönderilemiyor" demek, müşteriye olmayan bir sepet kurdurmaktı.
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
        postaKodu: z
          .string()
          .min(4)
          .optional()
          .describe('Müşteri söylediyse posta kodu — bir kez söylenen kod saklanır; araç "sepeteYazilmadi" dönerse müşteriye sor ve bununla yeniden çağır.'),
      }),
      execute: async ({ urun, boy, adet, postaKodu }) => {
        try {
          // YER ÖNCE (10.09 · kullanıcı kararı): "bu adrese gider mi" bilinmeden sepet kurulmaz.
          const yerim = await yer(postaKodu);
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
      }),
      execute: async ({ urun, boy, adet, postaKodu }) => {
        try {
          const bulunan = await satirBul(urun, boy);
          if ('sonuc' in bulunan) return bulunan.sonuc;
          const { line } = bulunan;
          const yerim = await yer(postaKodu);
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
          const son = await durum(await yer(undefined));
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
          /*
            BOŞ SEPETE BAĞLANTI YOK (07.09 · canlı turda ölçüldü). Müşteri *"sipariş vermek istiyorum"*
            der demez ajan bağlantıyı çağırdı; kap dolduğu için cevabın sonuna *"Sepetiniz hazır —
            giriş yapıp onaylamak ve ödemek için"* satırı eklendi — sepet BOŞKEN. Uyarı alanı vardı ama
            bağlantı yine üretiliyordu; model uyarıyı okusa da satır cevaba giriyordu. Kural araçta:
            boş sepette bağlantı üretilmez, kap dolmaz, satır eklenmez.
          */
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

    /*
      HESAP BAĞLANTISI (15.16 · kullanıcı tasarımı 08.09) — sohbeti müşterinin HESABINA bağlatan
      bağlantı. Yalnız kimlik kapısı kapalıyken verilir (`input.accountLink`, karar `ai.ts`te):
      Messenger/IG'de kimlik başka yoldan kurulamaz ve "siparişim nerede" sorusu o kapı açılmadan
      cevaplanamaz. Sepet boş olabilir — bu bağlantının işi sepet değil kimlik; doluysa giriş anında
      yine taşınır (`claimCartLink` iki amaçta aynı).
    */
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
 * Sepete YAZMADAN önce yer şartı (10.09 · kullanıcı kararı): "bu adrese gider mi" okunamıyorsa araç
 * yazmaz ve modele ne soracağını söyler. Okuma araçları serbest — bilgi vermek yer istemez, sepet
 * kurmak ister.
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
 * Adı söylenen şeyi SATILAN BİRİME çözer — bir varyant, bir paket ya da modele sorulacak soru.
 *
 * Katalog `urun_ara` ile AYNI kapıdan okunur (`getCatalogData`, `getProductDetail`,
 * `listStorefrontPackages`): fiyat ve stok kuralı ikinci kez yazılmıyor. Satışa kapalı ürün
 * (fiyatsız) sepete GİRMEZ ve sebebi söylenir — "0 €" ile eklemek, sitenin satmadığı şeyi sohbetin
 * satması olurdu.
 *
 * PAKET ikinci sırada aranır ve yalnız ürün eşleşmeyince: paket adları ürün adlarını içerir
 * ("Bayram Sofrası" içinde baklava var) ve ürün sorusunun cevabına paketi karıştırmak yanlış
 * tarafta hata olurdu. Müşteri paketi adıyla ister; o ad ürün kataloğunda yoktur.
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
 * Kargo cümlesi — ücret, ücretsiz kargo eşiği ve eşiğe kalan tek cümlede; karar motorun
 * (`shippingGroupFee` → `resolveShippingFee`), burası yalnız söyler. Adres bilinmiyorsa ücret de
 * bilinmez ama EŞİK bilinir ve söylenir: "şu tutardan sonra kargo bedava" satış cümlesidir.
 */
function kargoCumlesi(view: CartView, yerim: ChatPlace): string {
  const esik = formatPrice(view.freeShippingCents, 'tr');
  if (yerim.durum === 'hizmet-yok') return 'Bu posta koduna şu an ne kapıya teslim ne kargo var.';
  if (yerim.durum !== 'biliniyor') return `Kargo ücreti adres bilinince belli olur; kargo ürünleri ${esik} ve üzerindeyse kargo ÜCRETSİZ.`;
  if (view.shippingSubtotalCents <= 0) return 'Sepettekiler kapıya teslim bölgesinde — kargo ücreti yok.';
  const ucret = shippingGroupFee(view);
  const kargoUrunleri = formatPrice(view.shippingSubtotalCents, 'tr');
  if (ucret.feeCents === 0) return `Kargo ÜCRETSİZ — kargoyla giden ürünler ${kargoUrunleri}, ${esik} eşiği aşıldı.`;
  const karisik = view.shippingOnly ? '' : ' Sepet karışık (kapıya teslim + kargo); kargo ücreti adreste kesinleşir.';
  return `Kargo ücreti ${formatPrice(ucret.feeCents, 'tr')} (kargoyla giden ürünler ${kargoUrunleri}). ${esik} ve üzerinde kargo ÜCRETSİZ — eşiğe ${formatPrice(ucret.remainingForFreeCents, 'tr')} kaldı, müşteriye SÖYLE.${karisik}`;
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
  const odenecek = cartPayableCents(view);

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
    /* Kargo ve ödenecek toplam AYRI AYRI ve açık (kullanıcı bulgusu 08.09): ajan "61,02 €" dedi,
       müşteri sitede kargo eklenmiş bir tutar görüp şaşırdı. Sepet görünümü kargoyu zaten biliyor
       (`shippingGroupFee`), söylenmiyordu. Tek kaynak korunur: ödenecek tutar `cartPayableCents`. */
    kargo,
    toplam: `${formatPrice(odenecek, 'tr')} — müşterinin ödeyeceği tutar${odenecek > view.totalCents ? ' (kargo dahil)' : ''}; ürün toplamı ${formatPrice(view.totalCents, 'tr')}`,
    ...(view.minBasketOk
      ? {}
      : { asgariSepet: `Asgari sepet ${formatPrice(view.minBasketCents, 'tr')} — ${formatPrice(view.missingForMinBasketCents, 'tr')} eksik; müşteri bu hâlde sipariş VEREMEZ, ürün eklemeli.` }),
    ...yerNotu(yerim),
    not: 'Sepete eklemek sipariş DEĞİLDİR: onay, adres ve ödeme sitede yapılır (sepet_baglantisi).',
  };
}
