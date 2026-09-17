// `z` de porttan gelir: SDK aracın şemasını doğrularken tek zod örneği bekliyor, ikinci bir kopya sessizce tutmaz.
import { tool, z, type ToolSet } from '@lezzet/ai';
import { AddressService, OrderService, PostalCodePlaceService, ProductService, type Db } from '@lezzet/database';
import { formatPrice, formatShortDate } from '@lezzet/helper';
import { errorMessageOf, logger } from '@lezzet/observability';
import { cdnImageUrl, publicImageUrl } from '@lezzet/storage';
import {
  ALLERGEN_LABELS,
  COUNTRY_LABELS,
  NUTRITION_KEYS,
  NUTRITION_LABELS,
  ORDER_STATUS_LABELS,
  RATIO_CHAT,
  cropOf,
  cropTrim,
  resolveLocalizedText,
  type Conversation,
  type Country,
  type PreferredLanguage,
  type ProductAllergen,
} from '@lezzet/types';
import { getCatalogData } from '../catalog/catalog';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { getProductDetail } from '../catalog/product';
import {
  CARD_ADD_TITLE,
  CARD_OPEN_PREFIX,
  CARD_OPEN_TITLE,
  CAROUSEL_BODY,
  CAROUSEL_CARD_RANGE,
  CAROUSEL_FROM,
  CART_ADD_PREFIX,
  productCardInteractive,
  productCardText,
  productCarouselInteractive,
  productCarouselText,
} from '../catalog/product-card';
import { resolveOutboundLanguage } from '../messaging/translate';
import type { StorefrontDeclaration } from '../catalog/storefront-types';
import { resolvePlaceForPostalCode } from '../delivery/place';
import { birincilAdres, resolveChatPlace, ULKE_GIRDISI, yerNotu, type ChatPlace, type ChatPlaceMemory } from '../cart/chat-place';
import { readDeliveryInputs, resolveDelivery } from '../order/delivery';
import { readPublicDeliveryTerms } from '../settings/public-terms';
import { gitmemeSebebi, gitmeyenAlani, kargoYalniz, stokCumlesi, yereGider, yereGoreAyir } from './product-reach';

/*
  Destek ajanının araçları — müşteriye yazan modelin veriye kendisi baktığı, yalnız okuyan dar yüzey; yönetici MCP'si işletme
  rakamı döndürdüğü ve tek müşteriye daraltılamadığı için buraya verilmez.
  Hiçbir aracın girdisinde müşteri kimliği yoktur, kimlik kapanışla gelir: model başkasının verisini soracak alan bulamaz.
*/

/**
 * Katalog aramasında modele giden en fazla ürün — cevap prompt'a girdiği için sınırlı.
 * Tek soruda duyulabilecek sayıdan fazlası sohbet değil katalog gezintisidir, o da sitenin işi.
 */
const PRODUCT_HITS = 5;

/**
 * Kategori aramasının tavanı daha yüksek: kategori sorusunda beş ürün, kategorinin tamamı sanılıp mutlak hükme dönüşüyor.
 * Tavan yine sonlu; kırpıldığında çıktı bunu ayrıca söyler (`kapsam`).
 */
const CATEGORY_HITS = 20;

/**
 * Yasal beyanın modele giden hâli — alerjen, olası bulaşma, içindekiler ve 100 g besin değerleri, Türkçe adlarla.
 * Detay yalnız satıştaki ürün için gelir ve onun alerjen beyanı veri kısıtıyla zorunludur: boş liste "içermez" beyanıdır.
 * Besin ya da içindekiler kaydı yoksa model tahmin etmez, yetkiliye yönlendirir.
 */
function beyanOf(d: StorefrontDeclaration): Record<string, unknown> {
  const ad = (a: ProductAllergen): string => resolveLocalizedText(ALLERGEN_LABELS[a], 'tr');
  const besin = d.nutrition
    ? Object.fromEntries(
        NUTRITION_KEYS.filter((k) => d.nutrition![k] !== null).map((k) => [`${NUTRITION_LABELS[k].label} (${NUTRITION_LABELS[k].unit})`, d.nutrition![k]]),
      )
    : null;
  return {
    alerjenler: d.allergens.length > 0 ? d.allergens.map(ad).join(', ') : 'yok — ürünün 14 alerjenden hiçbirini içermediği beyan edilmiş',
    ...(d.traces.length > 0 ? { olasiBulasma: d.traces.map(ad).join(', ') } : {}),
    icindekiler: d.ingredients ? d.ingredients.map((s) => s.text).join('') : 'sistemde kayıtlı değil',
    besinDegerleri100g: besin ?? 'sistemde kayıtlı değil — uydurma; müşteri isterse yetkili iletir',
  };
}

/** Modelin gördüğü tarih biçimi — "18 Ağustos Salı". İki bilgi tek dizede: gün adı da lazım. */
function tarihAdi(iso: string): string {
  const gun = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(new Date(iso));
  return `${formatShortDate(iso, 'tr')} ${gun}`;
}

/**
 * ISO gün numarası (1=Pazartesi … 7=Pazar) → Türkçe ad.
 * Sabit bir Pazartesiden türer: elle yazılmış yedi elemanlı dizinin sırası kayarsa hata vermeden yanlış gün söyletirdi.
 */
function gunAdi(isoGun: number): string {
  const gun = new Date(2024, 0, isoGun); // 1 Ocak 2024 = Pazartesi
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(gun);
}

/**
 * Katalog kapısının iki zorunlu bağlamı — `place` (hangi depo) ve `viewer` (kanal/kademe) — üç ürün aracı için tek yerde; yer
 * sepet araçlarıyla aynı sırayla çözülür (`cart/chat-place.ts`).
 * Görüntüleyici müşterinin kendisidir, çünkü varsayılanı toptancıya perakende fiyat söyletirdi.
 */
async function yerVeGoruntuleyici(
  db: Db,
  customerId: string | null,
  soylenen: { postaKodu?: string; ulke?: Country },
  memory: ChatPlaceMemory | null,
) {
  const [yerim, viewer] = await Promise.all([
    resolveChatPlace(db, { said: soylenen.postaKodu, saidCountry: soylenen.ulke, memory, addressCustomerId: customerId }),
    pricingViewerOf(db, customerId),
  ]);
  return { yerim, viewer };
}

/**
 * Ürün kartı kancası — yalnız sohbet turunda verilir: araç kartı kaba bırakır, gönderimi metin cevabından önce `ai.ts` yapar.
 * Kurucu ve sınırlar `catalog/product-card.ts`te.
 */
export interface ProductCardHook {
  conversation: Pick<Conversation, 'source' | 'language' | 'customerId'>;
  onCard: (card: PendingProductCard) => void;
}

export interface PendingProductCard {
  /** Defter metni — "müşteri ne okudu"; ekranlar görseli değil bunu gösterir. */
  text: string;
  /** Kanalın etkileşimli gövdesi — `payload.interactive` olarak gider. */
  interactive: Record<string, unknown>;
  /** Kart metninin dili — müşteri dilinde üretildi, çeviri kapısı dokunmasın. */
  language: PreferredLanguage;
}

/**
 * Bir müşteriye kapatılmış araç seti; araç hatada fırlatmaz, `bilinmiyor` döner, çünkü fırlatan araç koşuyu düşürür ve
 * müşteri cevapsız kalır. Kimlik yoksa (Messenger/Instagram sohbeti kimliksiz doğar, CHANNELS §3b) set boş değil dardır:
 * kimseye ait olmayan bilgi kimlik istemez.
 */
export function customerSupportTools(
  db: Db,
  customerId: string | null,
  card: ProductCardHook | null = null,
  /** Sohbetin teslimat yeri hafızası — yalnız sohbet turunda var, talep yolunda (e-posta) yok. */
  memory: ChatPlaceMemory | null = null,
): ToolSet {
  return {
    ...publicTools(db, customerId, memory),
    ...(card ? productCardTools(db, customerId, card, memory) : {}),
    ...(customerId ? identityTools(db, customerId) : {}),
  };
}

/** Meta'nın görsel mesajda kabul ettiği biçimler — WebP çıkartma sayılır; dönüşümsüz yedek yol için. */
const META_IMAGE_KEY = /\.(jpe?g|png)$/i;
/** Kart görselinin uzun kenarı (px): telefonda tam genişlik, Meta 5 MB tavanının çok altında. */
const CARD_IMAGE_WIDTH = 1200;

function productCardTools(db: Db, customerId: string | null, card: ProductCardHook, memory: ChatPlaceMemory | null): ToolSet {
  return {
    urun_karti: tool({
      description:
        'Müşteriye ÜRÜN KARTI gönderir: fotoğraf, ad, boylar ve müşterinin KENDİ fiyatı, "Sepete ekle" düğmeleri. ' +
        'Müşteri bir ürünü görmek istediğinde, fotoğraf/görsel sorduğunda ya da TEK bir ürün önerdiğinde çağır; listede sayarken çağırma. ' +
        'kod = urun_ara çıktısındaki "kod" alanı (ürünün adı DEĞİL). Kart senin cevabından ÖNCE kendiliğinden gider: cevabında ürünü yeniden anlatma, bir cümleyle bağla.',
      inputSchema: z.object({
        kod: z.string().min(1).describe('urun_ara çıktısındaki "kod" alanı — aynen geç.'),
        postaKodu: z.string().min(4).optional().describe('Müşteri SÖYLEDİYSE posta kodu; söylemediyse boş bırak.'),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ kod, postaKodu, ulke }) => {
        try {
          const { yerim, viewer } = await yerVeGoruntuleyici(db, customerId, { postaKodu, ulke }, memory);
          const { language: dil } = await resolveOutboundLanguage(db, card.conversation);
          const okunan = await kartUrunu(db, kod, dil, yerim, viewer);
          // Bu adrese gitmeyen ürüne kart yok: düğmesine basan müşteri "gönderilemez" cevabı alırdı.
          if (okunan.durum === 'gidemez') return { gonderilemez: okunan.mesaj };
          if (okunan.durum !== 'ok') return { bilinmiyor: okunan.mesaj };
          const { detay, boylar, imageUrl } = okunan;

          const tekBoy = boylar.length === 1;
          const buttons = tekBoy
            ? [{ id: `${CART_ADD_PREFIX}${boylar[0]!.id}`, title: CARD_ADD_TITLE[dil] }]
            : boylar.slice(0, 3).map((v) => ({ id: `${CART_ADD_PREFIX}${v.id}`, title: v.label }));
          const body = boylar.map((v) => `${v.label} — ${formatPrice(v.priceCents!, dil)}`).join('\n');
          const girdi = { source: card.conversation.source, imageUrl, title: detay.name, body, buttons };
          card.onCard({ text: productCardText(girdi), interactive: productCardInteractive(girdi), language: dil });

          return {
            kart: 'cevabından önce gönderilecek',
            urun: detay.name,
            boySayisi: boylar.length,
            gorsel: imageUrl ? 'var' : 'yok',
            ...(boylar.length > 3 ? { not: 'yalnız ilk 3 boy düğme oldu; ötekileri cevabında say' } : {}),
          };
        } catch (err) {
          logger.warn({ context: 'application/support-tools', tool: 'urun_karti', err: errorMessageOf(err) }, 'ürün kartı hazırlanamadı');
          return { bilinmiyor: 'ürün kartı hazırlanamadı — ürünü metinle anlat.' };
        }
      },
    }),

    // Karusel — çeşit sorusunda ürünler tek mesajda kaydırılır kartlarla gider; Meta bütün kartlarda aynı düğme türü ve görsel
    // başlık istediği için her kartta tek düğme vardır ve görselsiz ürün karusele girmez (kurucu `catalog/product-card.ts`).
    urun_karuseli: tool({
      description:
        'Müşteriye 2–10 ürünlük KAYDIRMALI KARUSEL gönderir: her kartta fotoğraf, ad, fiyat (ya da "n boy · …\'dan") ve tek düğme. ' +
        '"Hangi baklavalarınız var", "ne tür pastalar var" gibi ÇEŞİT sorularında urun_ara\'dan sonra çağır; kodlar = urun_ara çıktısındaki "kod" alanları (en fazla 10). ' +
        'Karusel cevabından ÖNCE kendiliğinden gider; cevabında ürünleri tek tek sayma, bir cümleyle bağla.',
      inputSchema: z.object({
        kodlar: z.array(z.string().min(1)).min(CAROUSEL_CARD_RANGE.min).max(CAROUSEL_CARD_RANGE.max).describe('urun_ara çıktısındaki "kod" alanları — aynen geç, sırası kartların sırası.'),
        postaKodu: z.string().min(4).optional().describe('Müşteri SÖYLEDİYSE posta kodu; söylemediyse boş bırak.'),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ kodlar, postaKodu, ulke }) => {
        try {
          const { yerim, viewer } = await yerVeGoruntuleyici(db, customerId, { postaKodu, ulke }, memory);
          const { language: dil } = await resolveOutboundLanguage(db, card.conversation);
          const okunanlar = await Promise.all([...new Set(kodlar)].map((kod) => kartUrunu(db, kod, dil, yerim, viewer)));

          const kartlar = [];
          const disarida: string[] = [];
          for (const o of okunanlar) {
            if (o.durum !== 'ok' || !o.imageUrl) {
              // Görselsiz ya da bu adrese gitmeyen ürün kart olmaz; sebebiyle dışarıda kalır.
              disarida.push(o.durum === 'ok' ? `${o.detay.name} (görselsiz)` : o.durum === 'gidemez' ? `${o.ad} (bu adrese gönderilemiyor)` : o.kod);
              continue;
            }
            const tekBoy = o.boylar.length === 1;
            const enUcuz = Math.min(...o.boylar.map((v) => v.priceCents!));
            kartlar.push({
              title: o.detay.name,
              body: tekBoy ? formatPrice(enUcuz, dil) : CAROUSEL_FROM[dil](o.boylar.length, formatPrice(enUcuz, dil)),
              imageUrl: o.imageUrl,
              button: tekBoy
                ? { id: `${CART_ADD_PREFIX}${o.boylar[0]!.id}`, title: CARD_ADD_TITLE[dil] }
                : { id: `${CARD_OPEN_PREFIX}${o.kod}`, title: CARD_OPEN_TITLE[dil] },
            });
          }
          if (kartlar.length < CAROUSEL_CARD_RANGE.min) {
            return { bilinmiyor: `karusel için en az ${CAROUSEL_CARD_RANGE.min} görselli ürün gerekir (uygun: ${kartlar.length}) — ürünleri metinle say.`, disarida };
          }
          const girdi = { source: card.conversation.source, body: CAROUSEL_BODY[dil], cards: kartlar };
          card.onCard({ text: productCarouselText(girdi), interactive: productCarouselInteractive(girdi), language: dil });
          return {
            karusel: 'cevabından önce gönderilecek',
            kartSayisi: kartlar.length,
            urunler: kartlar.map((k) => k.title),
            ...(disarida.length > 0 ? { karuseleGirmeyen: disarida } : {}),
          };
        } catch (err) {
          logger.warn({ context: 'application/support-tools', tool: 'urun_karuseli', err: errorMessageOf(err) }, 'karusel hazırlanamadı');
          return { bilinmiyor: 'karusel hazırlanamadı — ürünleri metinle say.' };
        }
      },
    }),
  };
}

type KartUrunu =
  | { durum: 'ok'; kod: string; detay: NonNullable<Awaited<ReturnType<typeof getProductDetail>>>; boylar: { id: string; label: string; priceCents: number | null }[]; imageUrl: string | null }
  | { durum: 'yok' | 'kapali'; kod: string; mesaj: string }
  | { durum: 'gidemez'; kod: string; ad: string; mesaj: string };

/**
 * Kart ve karuselin ortak okuması: detay `urun_ara` ile aynı motordan, satılabilir ve bu adrese giden boylar, görsel adresi.
 * Görsel CDN'den JPEG istenir, çünkü WhatsApp WebP'yi çıkartma sayıp reddeder; dönüşüm yoksa yalnız zaten JPEG/PNG olan
 * alınır, o da yoksa kart görselsiz gider.
 */
async function kartUrunu(
  db: Db,
  kod: string,
  dil: PreferredLanguage,
  yerim: ChatPlace,
  viewer: Parameters<typeof getProductDetail>[1]['viewer'],
): Promise<KartUrunu> {
  const [detay, urun] = await Promise.all([getProductDetail(db, { locale: dil, slug: kod, place: yerim.place, viewer }), new ProductService(db).findBySlug(kod)]);
  if (!detay) return { durum: 'yok', kod, mesaj: `"${kod}" kodlu ürün bulunamadı — urun_ara'daki "kod" alanını aynen geç.` };
  const satilik = detay.variants.filter((v) => v.priceCents !== null);
  if (satilik.length === 0) return { durum: 'kapali', kod, mesaj: 'bu ürün bu kanalda satışa kapalı — kart gönderilmedi.' };
  // Yalnız bu adrese giden boylar: kart düğmesi sepete yazar, gidemeyen boyun düğmesi "gönderilemez" cevabına götürürdü.
  // Yer bilinmiyorsa ayıklama yok (`product-reach.ts`).
  const boylar = satilik.filter((v) => yereGider(v.stockStatus, yerim));
  if (boylar.length === 0) {
    // Hiçbir boy gitmiyor — sebep ürün düzeyinde tek cümle, boyların en iyi hâlinden (başka depoda > tükendi).
    const hal = satilik.some((v) => v.stockStatus === 'elsewhere') ? 'elsewhere' : 'out_of_stock';
    const sebep = gitmemeSebebi({ stockStatus: hal, shippable: detay.shippable }, yerim);
    return {
      durum: 'gidemez',
      kod,
      ad: detay.name,
      mesaj: `${detay.name} bu posta koduna (${yerim.kod}) gönderilemiyor — ${sebep}. Kart gönderilmedi: müşteriye söyle ve gidebilen bir alternatif öner.`,
    };
  }
  // Operatörün odak ve zoom'u sohbet kartı çerçevesine (`RATIO_CHAT`) kesim olarak gider, kırpma penceresindeki önizlemeyle aynı kare.
  // Kaynak ölçüsü yoksa kesim yok, tam görsel.
  const trim = urun ? cropTrim({ width: urun.imageWidth, height: urun.imageHeight }, RATIO_CHAT, cropOf(urun)) : null;
  const imageUrl =
    cdnImageUrl(urun?.imageKey, urun?.imageUpdatedAt, { width: CARD_IMAGE_WIDTH, format: 'jpeg', trim }) ??
    (META_IMAGE_KEY.test(urun?.imageKey ?? '') ? publicImageUrl(urun?.imageKey, urun?.imageUpdatedAt) : null);
  return { durum: 'ok', kod, detay, boylar, imageUrl };
}

/**
 * Müşterinin kendi verisini okuyan araçlar — yalnız kimlik varken verilir (`ai.ts` kapısı).
 * Girdileri bilerek boş: kimlik argüman olsaydı model başkasınınkini sorabilirdi.
 */
function identityTools(db: Db, customerId: string): ToolSet {
  return {
    teslimat_gunleri: tool({
      description:
        'Müşterinin kendi adresine hangi günler teslimat yapıldığını ve yaklaşan somut tarihleri söyler. ' +
        'Teslimat günü, rota günü ya da "ne zaman gelirsiniz" sorularında MUTLAKA bunu çağır.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const adres = birincilAdres(await new AddressService(db).listByCustomer(customerId));
          if (!adres) return { bilinmiyor: 'Müşterinin kayıtlı adresi yok — hangi adrese sorulacağı belli değil.' };

          // Rota çözümü motorun işi (`resolveDelivery`); ikinci kopya checkout ile ajanın farklı gün söylemesi demekti.
          // Bölge listesi bir kez okunup geçilir: haftalık günler de aynı listeden gelir, iki okuma iki ayrı ana ait olabilirdi.
          const inputs = await readDeliveryInputs(db);
          const cozum = await resolveDelivery(db, {
            postalCode: adres.postalCode,
            country: adres.country,
            inputs,
          });

          if (cozum.deliveryType !== 'route') {
            return {
              bilinmiyor:
                'Bu adres rota dışında (kargo bölgesi) — haftalık teslimat günü yok, gönderi kargoyla gidiyor.',
            };
          }
          const bolge = inputs.zones.find((z) => z.id === cozum.zoneId);
          return {
            adres: `${adres.postalCode} ${adres.city}`,
            haftalikGunler: (bolge?.weekdays ?? []).map(gunAdi),
            yaklasanTarihler: cozum.availableDates.map(tarihAdi),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'teslimat_gunleri', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Teslimat bilgisi şu an okunamadı.' };
        }
      },
    }),

    siparislerim: tool({
      description:
        'Müşterinin son siparişlerini listeler: sipariş numarası, durumu ve teslim günü. ' +
        'Sipariş durumu, "nerede kaldı", "ne zaman gelecek" sorularında çağır. Tutar bilgisi VERMEZ.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const sayfa = await new OrderService(db).listByCustomer(customerId, { limit: 5 });
          // Boş liste açıkça söylenir: açıklamasız boş dizi modele "erişemiyorum" diye okunabiliyor.
          // "Okunamadı" (`bilinmiyor`, catch dalı) ile "yok" ayrı kalır; ikisi birleşse arıza boşluk gibi görünürdü.
          if (sayfa.rows.length === 0) {
            return { siparisYok: 'Bu müşterinin sistemde kayıtlı siparişi YOK. Bu bir erişim sorunu değil — geçmişi okuyabildin, boş çıktı.' };
          }
          return {
            siparisler: sayfa.rows.map((o) => ({
              numara: o.referenceNo,
              durum: ORDER_STATUS_LABELS[o.status],
              teslimGunu: o.deliveryDate ? tarihAdi(o.deliveryDate) : 'kargo (rota günü yok)',
            })),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'siparislerim', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Sipariş bilgisi şu an okunamadı.' };
        }
      },
    }),
  };
}

/**
 * Kimlik istemeyen araçlar — kimliksiz sohbette de verilir; kimlik varsa cevap müşterinin kapsamına (B2B fiyatı, bölgesi)
 * daralır, yoksa ziyaretçi kapsamına düşer (`pricingViewerOf`). Aynı araç iki modda dürüst çalıştığı için ayrı ziyaretçi seti yazılmaz.
 */
function publicTools(db: Db, customerId: string | null, memory: ChatPlaceMemory | null): ToolSet {
  return {
    urun_ara: tool({
      description:
        'Katalogda ürün arar ve müşterinin KENDİ fiyatıyla, KENDİ adresine göre satın alınabilirliğini söyler. ' +
        'Adres biliniyorsa yalnız o adrese gidebilen ürünleri listeler; gidemeyenler sebebiyle "buAdreseGitmeyenler" alanındadır. ' +
        '"X var mı", "fiyatı ne", "kaça", "hangi boyları var" sorularında MUTLAKA bunu çağır. Tahmin etme.',
      inputSchema: z.object({
        terim: z
          .string()
          .min(2)
          .describe(
            'Ürün adı YA DA kategori adı — örn. "baklava", "su böreği", "tatlı", "pasta", "dondurma". ' +
              'Terim bir kategoriyle eşleşirse araç o kategorinin ürünlerini döndürür ve bunu `kategori` alanıyla söyler; ' +
              'eşleşmezse adı eşleşen ürünleri döndürür. Hangisi olduğunu ÇIKTIDAKİ `kapsam` alanından oku.',
          ),
        postaKodu: z
          .string()
          .min(4)
          .optional()
          .describe(
            'Müşteri SÖYLEDİYSE posta kodu — stok o bölgenin deposundan okunur. ' +
              'Kayıtlı adresi olan müşteride bile SÖYLENEN kod önceliklidir (başka adrese gönderiyor olabilir). ' +
              'Müşteri söylemediyse BOŞ bırak, uydurma.',
          ),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ terim, postaKodu, ulke }) => {
        try {
          // Söylenen posta kodu kayıtlı adresin önündedir, çünkü müşteri başka bir adrese soruyor olabilir; kod kimlik değildir,
          // bu yüzden araç kimliksiz sohbette de çalışır ve kimliksizlik yalnız fiyat kapsamını ziyaretçiye düşürür.
          const { yerim, viewer } = await yerVeGoruntuleyici(db, customerId, { postaKodu, ulke }, memory);
          const { place, kod } = yerim;

          const ortak = {
            // Model Türkçe yazar; müşteri diline çeviri gönderimde tek kapıdan yapılır, araç ikinci bir dil kararı vermez.
            locale: 'tr' as const,
            place,
            viewer,
            // Referans okuma: müşteri ürünü adıyla sorar; kanalında satılamayanı süzmek var olan ürüne "katalogda yok" dedirtirdi,
            // doğru cümle "bu kanalda satışa kapalı".
            includeUnsellable: true,
          };

          const isimAramasi = await getCatalogData(db, { ...ortak, query: { search: terim } });

          // Terim bir kategori adıyla eşleşiyorsa arama o kategoriye daralır; karar araçta, çünkü modele verilen "önce kategoriye bak"
          // talimatı unutulabilir. Kategori listesi isim aramasından hazır gelir, ikinci çağrı yalnız eşleşmede yapılır.
          const normalize = (s: string) => s.trim().toLocaleLowerCase('tr');
          const kategori = isimAramasi.categories.find((c) => normalize(c.name) === normalize(terim)) ?? null;

          // Kargo bölgesinde kategori kargoya uygunlardan kurulur (`onlyShippable`, SQL'de), yoksa soğuk zincir ürünleri tavanı doldururdu.
          // İsim aramasına ve uygun ürün çıkmayan kategoriye uygulanmaz: o ürün "yok" değil "bu adrese gitmiyor" diye söylenmeli.
          const kargoSuzgeci = kategori !== null && kargoYalniz(place);
          const kategoriOku = (slug: string, onlyShippable: boolean) =>
            getCatalogData(db, { ...ortak, query: { categorySlug: slug, ...(onlyShippable ? { onlyShippable } : {}) } });
          let katalog = kategori ? await kategoriOku(kategori.slug, kargoSuzgeci) : isimAramasi;
          const kargoyaSuzuldu = kargoSuzgeci && katalog.products.length > 0;
          if (kategori && kargoSuzgeci && !kargoyaSuzuldu) katalog = await kategoriOku(kategori.slug, false);
          if (katalog.products.length === 0) return { bilinmiyor: `"${terim}" için katalogda eşleşen ürün yok.` };

          // Yer biliniyorsa gidemeyenler ayrılır: liste ve tavan gidebilenlere, gidemeyenler adıyla ayrı alana.
          const { gidenler, gitmeyenler } = yereGoreAyir(katalog.products, yerim);

          // Fiyat müşterinin liste fiyatıdır (yayımlanmış bilgi, işlem tutarı değil); çok boylu üründe en ucuz boyun fiyatı olduğu için
          // alan adı bunu söyler (`enUcuzBoy`/`fiyatBaslangic`) ki model onu tek fiyat sanmasın.
          const tavan = kategori ? CATEGORY_HITS : PRODUCT_HITS;
          const urunler = gidenler.slice(0, tavan).map((p) => {
            const fiyat = p.priceCents === null ? 'bu kanalda satışa kapalı' : formatPrice(p.priceCents, 'tr');
            return {
              ad: p.name,
              // `urun_karti` ürünü bu kodla ister, adla değil.
              kod: p.slug,
              // Yer bilinmiyorsa "bu adrese" denmez: stok depo-üstü okundu.
              durum: stokCumlesi(p.stockStatus, yerim),
              // Kargo uygunluğu "bu adrese gider mi"den ayrı bir gerçektir; cümle olarak verilir, çünkü model `false` bir bayrağı
              // önemsiz sayıp atlayabilir.
              kargo: p.shippable ? 'kargoya verilebilir' : 'KARGOYA VERİLEMEZ — yalnız bölge içi kapıya teslim',
              // `null` fiyat = bu kanalda SATIŞA KAPALI (DOMAIN §5) — "0 €" demek yanlış olurdu.
              ...(p.variantCount > 1
                ? { boySayisi: p.variantCount, enUcuzBoy: p.unitLabel, fiyatBaslangic: fiyat }
                : { birim: p.unitLabel, fiyat }),
            };
          });

          // Boy listesi ve yasal beyan yalnız ilk eşleşme için okunur: müşteri çoğunlukla tek ürünü sorar, ikincisi gerekirse adıyla
          // yeniden aratılır. İlk eşleşme bu adrese gidebilenlerin ilkidir, çünkü gidemeyen ürünün boyları satın alınamaz.
          const ilk = gidenler[0];
          // Detay listeyle aynı motordan ve bağlamdan okunur ki boy fiyatları listedekinden ayrışmasın.
          const detay = ilk ? await getProductDetail(db, { locale: 'tr', slug: ilk.slug, place, viewer }) : null;
          const boylar =
            ilk && ilk.variantCount > 1
              ? (detay?.variants ?? [])
                  .filter((v) => v.priceCents !== null)
                  .map((v) => ({ boy: v.label, fiyat: formatPrice(v.priceCents!, 'tr') }))
              : [];
          // Boy listesi yalnız DOLUYSA gönderiliyor: boş dizi, modele "boy yok" diye okunabilecek
          // bir gürültüdür — tek boylu üründe alan hiç olmamalı.
          const boyAlani = boylar.length > 0 ? { boylar: { urun: ilk!.name, secenekler: boylar } } : {};
          const beyanAlani = ilk && detay ? { beyan: { urun: ilk.name, ...beyanOf(detay.declaration) } } : {};

          // Kırpma sessiz olmaz: eksik listeden "sadece bunlar var" hükmü hiç veri olmamasından kötüdür, sayı bu yüzden cümleye girer.
          // Toplam sayfadan değil sayaçtan (`total`) gelir; gidemeyenler kırpma sayılmaz, kendi alanlarında adlarıyla durur.
          const toplam = katalog.total;
          const kirpildi = gidenler.length > urunler.length || toplam > katalog.products.length;
          const kirpmaNotu = kirpildi
            ? ` Toplam ${toplam} ürünün ${urunler.length}'i listelendi — bu liste TAM DEĞİL, "sadece bunlar var" DEME.`
            : '';

          // Kategori araması tam kümedir, isim araması değildir; çıktı bunu söyler ki model ad eşleşmesini kategori sanmasın.
          // İsim aramasında kategori listesi de gider: model doğru soruyu yeniden sorabilsin, taksonomiyi uydurmasın.
          const kapsam = kategori
            ? {
                kategori: kategori.name,
                kapsam: `Bunlar "${kategori.name}" kategorisinin ürünleridir.${kirpmaNotu}`,
              }
            : {
                kapsam:
                  `Bunlar ADI "${terim}" ile eşleşen ürünlerdir — bir kategori listesi DEĞİL. ` +
                  'Eşleşen ürünün o türden olduğunu VARSAYMA (örn. adında "tatlı" geçen bir fırın ürünü tatlı değildir).' +
                  kirpmaNotu,
                mevcutKategoriler: isimAramasi.categories.map((c) => c.name),
              };

          // Kod var ama depo çözülmediyse (yazım hatası, iki ülkeli kod, hizmet yok) hâlin cümlesi de gelir, sepet araçlarıyla
          // aynı cümle (`yerNotu`).
          const yerAlani = kod
            ? { yer: kod, ...yerNotu(yerim) }
            : {
                yerBilinmiyor:
                  'Yer bilinmiyor — stok "hiç var mı" düzeyinde okundu, bir depoya göre değil. ' +
                  'Müşteriden POSTA KODU iste ve bu aracı postaKodu ile yeniden çağır.',
              };
          const gitmeyen = gitmeyenAlani(gitmeyenler, tavan);
          const kargoAlani = kargoyaSuzuldu
            ? {
                kargoBolgesi:
                  'Bu posta kodu kargo bölgesinde (kapıya teslim yok): liste yalnız KARGOYA VERİLEBİLEN ürünlerden kuruldu; ' +
                  'kargoya verilemeyen soğuk zincir ürünleri bu adrese gitmediği için listede yok.',
              }
            : {};

          // Eşleşme var ama hiçbiri bu adrese gitmiyor: "katalogda yok" demek yanlış olurdu.
          if (urunler.length === 0) {
            return {
              buAdreseGidenYok: `"${terim}" ile eşleşen ${gitmeyenler.length} ürünün hiçbiri bu posta koduna (${kod}) gönderilemiyor — "yok" DEME; var ama bu adrese gitmiyor.`,
              ...gitmeyen,
              ...kapsam,
              ...kargoAlani,
              ...yerAlani,
            };
          }
          return { urunler, ...boyAlani, ...beyanAlani, ...kapsam, ...gitmeyen, ...kargoAlani, ...yerAlani };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'urun_ara', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Katalog şu an okunamadı.' };
        }
      },
    }),

    posta_kodu_kontrol: tool({
      description:
        'Verilen POSTA KODUNA teslimat yapılıp yapılmadığını söyler: kapıya rota teslimi mi, kargo mu, yoksa hiç gitmiyor mu. ' +
        '"Şu koda geliyor musunuz", "adresime gelir mi", "biz X şehrindeyiz" sorularında ÇAĞIR. ' +
        'Müşterinin KENDİ kayıtlı adresi soruluyorsa teslimat_gunleri aracını kullan; bu araç adresi olmayan ya da BAŞKA bir yeri soran kişi içindir.',
      inputSchema: z.object({
        postaKodu: z
          .string()
          .min(3)
          .describe(
            'Posta kodu YA DA yerleşim adı — "67000", "75001", "Lingolsheim", "Kehl". ' +
              'Müşteri hangisini söylediyse AYNEN geç; ad verildiyse araç kodu kendisi bulur.',
          ),
        ulke: ULKE_GIRDISI,
      }),
      execute: async ({ postaKodu, ulke }) => {
        try {
          // Yer adı da kabul edilir, çünkü müşteri çoğunlukla posta kodunu değil semtinin adını söyler;
          // ad `postal_code_place` aramasıyla koda çevrilir.
          const kodMu = /^\d{4,}$/.test(postaKodu.trim());
          let cozulmusKod = postaKodu.trim();
          if (!kodMu) {
            const adaylar = await new PostalCodePlaceService(db).search(postaKodu, 3);
            if (adaylar.length === 0) {
              return { bilinmiyor: `"${postaKodu}" diye bir yerleşim bulunamadı. Müşteriden POSTA KODUNU iste.` };
            }
            // Birden çok eşleşmede seçim yapılmaz, sorulur: aynı ad birden çok kodda geçebilir
            // ve yanlışını seçmek "gelmiyoruz" demek olurdu.
            if (adaylar.length > 1) {
              return {
                belirsiz: `"${postaKodu}" birden çok posta koduna denk geliyor. Müşteriye hangisi olduğunu sor.`,
                adaylar: adaylar.map((a) => `${a.postalCode} ${a.places.join(', ')}`),
              };
            }
            cozulmusKod = adaylar[0]!.postalCode;
          }
          const postaKoduCozum = cozulmusKod;
          // Bu araç girdi alır ama kimlik almaz: posta kodu herkese açık bir sorudur; "benim adresim" sorusu girdisiz
          // `teslimat_gunleri`nindir, yoksa model adresi uydurmak zorunda kalırdı.
          // Ülke söylendiyse süzgeçtir: iki ülkeli kodun cevabını tek ülkeye indirir.
          const cozum = await resolvePlaceForPostalCode(db, postaKoduCozum, ulke);
          // Söylenen gerçek kod sohbete yazılır ki bir daha sorulmasın ve sepet o yerle kurulsun; iki ülkeli kod da (ülkesiz)
          // yazılır, sonraki tur yalnız ülkeyi sorar.
          if (cozum.kind !== 'unknown') await memory?.remember(postaKoduCozum, ulke);
          switch (cozum.kind) {
            case 'route':
              // En değerli cevap: rota günleri ÇÖZÜMLE BİRLİKTE geliyor, ikinci okuma gerekmiyor.
              return {
                kod: postaKoduCozum,
                teslimat: 'kapıya teslim (haftalık rota)',
                yer: cozum.placeName,
                haftalikGunler: cozum.weekdays.map(gunAdi),
              };
            case 'shipping':
              return {
                kod: postaKoduCozum,
                teslimat: 'kargo ile gönderim (haftalık rota yok)',
                yer: cozum.placeName,
                not: 'Kargo ücreti ve ücretsiz kargo eşiği için teslimat_sartlari aracına bak.',
              };
            case 'unresolved':
              // Ülke biliniyor ama hizmet yok: "yanlış kod" DEĞİL, "buraya henüz gelmiyoruz".
              return {
                kod: postaKoduCozum,
                teslimat: 'yok — bu koda şu an teslimat yapmıyoruz',
                not: 'Kod geçerli; bölgemiz henüz oraya ulaşmıyor. Müşteri isterse haber listesine yazılabilir (bunu operatör yapar).',
              };
            case 'ambiguous':
              // Aynı kod iki hizmet ülkemizde birden geçerli — model UYDURMAZ, SORAR; cevap `ulke` ile geri gelir.
              return {
                kod: postaKoduCozum,
                bilinmiyor:
                  'Bu kod birden çok ülkede geçerli — hangi ülke olduğunu müşteriye SOR, tahmin etme; cevabı gelince bu aracı aynı kod ve `ulke` ile yeniden çağır. Kod saklandı, yeniden sorma.',
                adaylar: cozum.candidates.map((c) => `${COUNTRY_LABELS[c.country]} (${c.country})${c.inRoute ? ' (rota bölgemizde)' : ''}`),
              };
            case 'unknown':
              return {
                kod: postaKoduCozum,
                bilinmiyor: ulke
                  ? `Bu kod ${COUNTRY_LABELS[ulke]} için geçerli değil — müşteriden kodu ve ülkeyi teyit et.`
                  : 'Böyle bir posta kodu bulunamadı — büyük olasılıkla yazım hatası. Müşteriden kodu teyit et.',
              };
          }
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'posta_kodu_kontrol', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Bölge bilgisi şu an okunamadı.' };
        }
      },
    }),

    teslimat_sartlari: tool({
      description:
        'Kargo ücreti, ücretsiz kargo eşiği, asgari sepet tutarı, kapıda ödeme üst sınırı ve kargo gönderdiğimiz ülkeleri söyler. ' +
        '"Kargo kaç para", "asgari sipariş var mı", "ne kadar alırsam kargo bedava", "kapıda ödeyebilir miyim" sorularında ÇAĞIR.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          // Sayılar müşterinin kapsamıyla okunur (B2B asgari sepeti farklı olabilir); bilgi sayfaları, sepet ve checkout da aynı
          // kapıyı okur ki sohbette söylenen sitede yazandan ayrışmasın.
          const s = await readPublicDeliveryTerms(db, customerId);
          return {
            kargoUcreti: formatPrice(s.shippingFeeCents, 'tr'),
            ucretsizKargoEsigi: formatPrice(s.freeShippingCents, 'tr'),
            asgariSepetKapiyaTeslim: formatPrice(s.minBasketRouteCents, 'tr'),
            // 0 = alt sınır YOK (kapının kendi künyesi) — "0,00 €" yazmak "sıfır euroluk sipariş
            // verebilirsiniz" gibi okunurdu; yokluk ile sıfır ayrı şeylerdir.
            asgariSepetKargo: s.minBasketShippingCents > 0 ? formatPrice(s.minBasketShippingCents, 'tr') : 'alt sınır yok',
            kapidaOdemeUstSiniri: formatPrice(s.codMaxCents, 'tr'),
            kargoGonderilenUlkeler: s.shippingCountries.map((c) => COUNTRY_LABELS[c]),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'teslimat_sartlari', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Teslimat şartları şu an okunamadı.' };
        }
      },
    }),
  };
}
