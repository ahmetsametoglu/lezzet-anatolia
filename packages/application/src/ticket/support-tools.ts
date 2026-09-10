// `z` de porttan geliyor ve gerekçesi teknik: SDK aracın şemasını doğrularken tek zod örneği
// bekliyor, ikinci bir kopya sessizce tutmaz (`@lezzet/ai` barrel künyesi).
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
import { birincilAdres, resolveChatPlace, yerNotu, type ChatPlace, type ChatPlaceMemory } from '../cart/chat-place';
import { readDeliveryInputs, resolveDelivery } from '../order/delivery';
import { readPublicDeliveryTerms } from '../settings/public-terms';
import { gitmemeSebebi, gitmeyenAlani, kargoYalniz, stokCumlesi, yereGider, yereGoreAyir } from './product-reach';

/*
  DESTEK AJANININ ARAÇLARI (16.9) — modelin veriye KENDİSİ bakabildiği dar yüzey.

  ── NEDEN MCP DEĞİL ─────────────────────────────────────────────────────────
  MCP sunucusu (`apps/backend/src/mcp`) YÖNETİCİ asistanınındır: araçları toplu iş verisi döndürür
  (satış özeti, talep sinyalleri, bölge haritası) ve kendi talimatı "sahibe konuşursun, müşteriye
  asla" der. O araçları müşteriye yazan bir ajana vermek, işletme rakamlarının bir yazışmada
  ağızdan çıkması demekti. Kapısı da tek paylaşımlı anahtarla korunuyor ve "yalnız bu müşterinin
  verisi" diye daraltılamıyor. Üstelik MCP bir TAŞIMA katmanı; destek ajanı zaten aynı süreçte
  koşuyor, araya ağ koymak yalnız gecikme ve arıza yüzeyi eklerdi.

  ── DEĞİŞMEZ: KİMLİK ARGÜMAN DEĞİL, KAPANIŞTIR ──────────────────────────────
  Hiçbir aracın girdisinde `customerId` YOKTUR ve olmayacak. Araçlar istek başına, müşteri kimliği
  kapatılmış (closure) hâlde kurulur; model yalnız "benim teslimat günlerim" diye sorabilir,
  "şu kişininki" diye soramaz — çünkü soracak alan yok. Uydurulmuş bir kimlikle başkasının verisini
  okuması böylece OLANAKSIZ olur; kural veride değil imzada durur (talep kapılarının "sahiplik
  imzada" kuralının aynısı).

  ── DEĞİŞMEZ: YALNIZ OKUR ───────────────────────────────────────────────────
  Yazan araç yok ve bu bir eksiklik değil, sınırın kendisi: siparişin gününü değiştirmek gerçek bir
  operasyon kararıdır (`dispatch-actions.ts` operatörün elinde) ve sipariş değişikliği zaten devir
  tetikleyicileri arasında. Ajan gerçeği SÖYLER, taahhüdü insan verir.

  ── DEĞİŞMEZ: İŞLEM TUTARI YOK — LİSTE FİYATI VAR (22.08'de netleşti) ────────
  Sipariş aracı numara/durum/teslim günü döndürür, TUTAR döndürmez: sipariş toplamı, iade, telafi,
  indirim pazarlığı insanın işidir (`ticket-support.ts` künyesi).

  Katalog aracı (`urun_ara`) FİYAT döndürür ve bu değişmezi ihlal etmez, çünkü ikisi ayrı şeydir:
  liste fiyatı sitede herkese açık YAYIMLANMIŞ bilgidir, işlem tutarı ise bir karardır. "Baklava
  3,76 €" demek taahhüt değil, katalogu okumaktır; "size 3,00 €'ya veririm" demek karardır ve ajan
  onu yapamaz (prompt bunu ayrıca yasaklıyor: indirim ekleme, pazarlık yapma, "sana özel" rakam yok).

  Fiyat MÜŞTERİNİN KENDİ fiyatıdır, varsayılan değil: `pricingViewerOf` kanalı (B2C/B2B) ve kademeyi
  çözüyor. Ölçüldü (22.08): aynı ürün B2B müşteride 3,76 €, B2C müşteride 4,57 €. Varsayılan bir
  görüntüleyici geçilseydi toptancıya perakende fiyat söylenirdi — sessiz ve ticari bir hata.

  ── BİLİNMEYEN, SIFIR DEĞİLDİR ──────────────────────────────────────────────
  Adres yoksa ya da posta kodu hiçbir aktif bölgeye düşmüyorsa araç "gün yok" DEMEZ, `bilinmiyor`
  der ve sebebini yazar. "Teslimat günü yok" cümlesi müşteriye yanlış bir kesinlik verirdi; prompt
  da bu hâlde gün söylemeyip devretmekle yükümlü (CLAUDE §1).
*/

/**
 * Katalog aramasında modele verilecek EN FAZLA ürün sayısı.
 *
 * Tavan var çünkü araç cevabı prompt'a giriyor: sınırsız bir liste hem maliyeti hem de modelin
 * "hangisini söyleyeyim" belirsizliğini büyütürdü. Beş, müşterinin tek soruda duyabileceği makul
 * sayı — daha fazlası zaten sohbet değil, katalog gezintisidir ve orası sitenin işi.
 */
const PRODUCT_HITS = 5;

/**
 * KATEGORİ aramasının tavanı ayrı ve daha yüksek (07.09 · ölçülmüş arıza).
 *
 * Beş, "baklava var mı" gibi bir İSİM sorusunda doğru sayıydı. Kategori sorusunda değil: müşteri
 * *"ne tip tatlı çeşitleriniz var"* diye sordu, Tatlı kategorisindeki **20 üründen** ilk beşi
 * döndü ve beşi de tesadüfen baklavaydı — ajan da *"tatlı çeşitlerimiz sadece baklavalardan
 * oluşmaktadır"* dedi. Kırpılmış listeden MUTLAK bir hüküm çıkardı.
 *
 * Sayıyı yükseltmek tek başına yetmez ve asıl düzeltme öteki yarıda: kırpma artık SESSİZ değil,
 * çıktı kaç üründen kaçını gösterdiğini söylüyor (`kapsam`). Sayı da yine sonlu — sınırsız liste
 * hem maliyeti hem "hangisini söyleyeyim" belirsizliğini büyütür, ve tam katalog sohbetin değil
 * sitenin işidir.
 */
const CATEGORY_HITS = 20;

/**
 * Yasal beyanın modele giden hâli (07.09 · ölçülmüş yanlış devir) — alerjen · olası bulaşma ·
 * içindekiler · 100 g besin değerleri, Türkçe adlarla.
 *
 * "Beyan yok" ile "alerjen yok" AYRI cümlelerdir ve fark bir sağlık sorusudur: boş alerjen listesi
 * kataloğun kuralına göre EKSİK BEYANDIR (`declarationGaps`), "içermez" değil. Model bu cümleyi
 * okuyunca "içermez" diyemez; yetkili teyidine yönlendirir. Besin değeri de aynı: yoksa yoktur,
 * tahmin edilmez — etiketler `NUTRITION_LABELS`tan, ikinci bir liste yazılmaz.
 */
function beyanOf(d: StorefrontDeclaration): Record<string, unknown> {
  const ad = (a: ProductAllergen): string => resolveLocalizedText(ALLERGEN_LABELS[a], 'tr');
  const besin = d.nutrition
    ? Object.fromEntries(
        NUTRITION_KEYS.filter((k) => d.nutrition![k] !== null).map((k) => [`${NUTRITION_LABELS[k].label} (${NUTRITION_LABELS[k].unit})`, d.nutrition![k]]),
      )
    : null;
  return {
    alerjenler:
      d.allergens.length > 0
        ? d.allergens.map(ad).join(', ')
        : 'BEYAN YOK — bu ürün için alerjen kaydı girilmemiş; "içermez" DEME, yetkili teyit etmeli',
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
 *
 * Sabit bir referans haftadan türetiliyor (2024-01-01 bir Pazartesi): elle yazılmış yedi elemanlı
 * bir dizi, sıralaması bir gün kayarsa hiçbir yerde hata vermeden yanlış gün söyletirdi.
 */
function gunAdi(isoGun: number): string {
  const gun = new Date(2024, 0, isoGun); // 1 Ocak 2024 = Pazartesi
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(gun);
}

/**
 * Katalog kapısının iki zorunlu bağlamı — `place` (hangi depo) ve `viewer` (hangi kanal/kademe) —
 * `urun_ara`, `urun_karti` ve `urun_karuseli` için TEK yerde. Yer dört kaynaktan, sepet araçlarıyla
 * AYNI sırayla (`cart/chat-place.ts`): söylenen · sohbette saklanan · kayıtlı adres · hiçbiri. Söylenen
 * gerçek kod sohbete yazılır (10.09) — müşteri bir daha söylemez. Depo çözülmediyse `place` depo-üstüdür;
 * ürünlerin yere göre ayıklanma kuralı `product-reach.ts`te.
 */
async function yerVeGoruntuleyici(db: Db, customerId: string | null, postaKodu: string | undefined, memory: ChatPlaceMemory | null) {
  const [yerim, viewer] = await Promise.all([
    resolveChatPlace(db, { said: postaKodu, memory, addressCustomerId: customerId }),
    pricingViewerOf(db, customerId),
  ]);
  return { yerim, viewer };
}

/**
 * **ÜRÜN KARTI KANCASI** (08.09) — sohbet turunda verilir; araç kartı üretir, kaba bırakır, gönderimi
 * `ai.ts` yapar (metin cevabından ÖNCE, yalnız özerk yolda). Talep yolunda (e-posta) sohbet yok,
 * kart da yok. Kurucu ve sınırlar `catalog/product-card.ts`te.
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
 * Bir müşteriye KAPATILMIŞ araç seti.
 *
 * Çağıran talebin sahibini geçirir; model o kimliği ne görür ne değiştirebilir. Araç gövdesinde
 * hata olursa fırlatmaz — `bilinmiyor` döner ve log'a KİMLİK düşer (içerik değil): fırlatan bir
 * araç koşuyu düşürür ve müşteri cevapsız kalırdı.
 *
 * ── KİMLİK YOKSA SET BOŞ DEĞİL, DAR (28.08 · `CHANNELS §3b`) ────────────────
 * `customerId` **null olabilir** ve bu hâl Messenger/Instagram'da istisna değil KURAL: PSID telefon
 * taşımaz, sohbet kimliksiz doğar. Bir tur boyunca o sohbetlerde HİÇ araç verilmiyordu ve bu,
 * `ai.ts`'in kendi künyesiyle çelişiyordu (*"ajan o hâlde de konuşur ama yalnız herkese açık
 * bilgiyle"*) — ajan herkese açık bilgiyi bile okuyamıyordu. "67000'e geliyor musunuz" sorusunun
 * cevabı sitede ziyaretçiye açıkken sohbette cevapsız kalıyordu.
 *
 * Ayrım kanalda değil SORUDA: kimseye ait olmayan bilgi (katalog, fiyat listesi, teslimat şartları,
 * bir posta koduna gidip gitmediğimiz) kimlik istemez; müşterinin GEÇMİŞİ ister.
 */
export function customerSupportTools(
  db: Db,
  customerId: string | null,
  card: ProductCardHook | null = null,
  /** Sohbetin teslimat yeri hafızası (10.09) — yalnız sohbet turunda; talep yolunda (e-posta) yok. */
  memory: ChatPlaceMemory | null = null,
): ToolSet {
  return {
    ...publicTools(db, customerId, memory),
    ...(card ? productCardTools(db, customerId, card, memory) : {}),
    ...(customerId ? identityTools(db, customerId) : {}),
  };
}

/**
 * `urun_karti` — müşteriye görsel + ad + boy/fiyat + "Sepete ekle" düğmeleri (08.09, kullanıcı
 * kararı: katalogsuz, sabit fiyatsız ürün görseli). Fiyat `urun_ara` ile AYNI motordan ve aynı
 * bağlamla (yer + görüntüleyici) okunur; ad ve fiyat biçimi müşterinin dilinde üretilir, çeviri
 * kapısından geçmez. Görsel yalnız JPEG/PNG anahtarda kartta (WebP'yi Meta kabul etmez, dönüşüm kararı
 * açık); yoksa kart görselsiz gider — görselsiz kart, kartsız cevaptan iyidir.
 */
/** Meta'nın görsel mesajda kabul ettiği biçimler — WebP değil (çıkartma sayılır). Dönüşümsüz yedek yol için. */
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
      }),
      execute: async ({ kod, postaKodu }) => {
        try {
          const { yerim, viewer } = await yerVeGoruntuleyici(db, customerId, postaKodu, memory);
          const { language: dil } = await resolveOutboundLanguage(db, card.conversation);
          const okunan = await kartUrunu(db, kod, dil, yerim, viewer);
          // Bu adrese gitmeyen ürüne kart yok (10.09): düğmesine basan müşteri "gönderilemez" duyardı.
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

    /*
      KARUSEL (09.09, kullanıcı isteği): çeşit sorusunda 4–5 ürünü arka arkaya fotoğraf olarak
      göndermek kötü; tek mesajda kaydırılır kartlar. Her kartta tek düğme (Meta: düğme türü ve
      sayısı bütün kartlarda aynı) — tek boylu üründe "Sepete ekle" (boy kimliğiyle), çok boyluda
      "Boyları gör" (ürün koduyla; ajan sonra `urun_karti` gönderir). Görselsiz ürün karusele GİREMEZ
      (Meta görsel başlığı zorunlu tutuyor); ikiden az kart kalırsa karusel yok, ajan metinle anlatır.
      Kurucu ve sınırlar `catalog/product-card.ts`.
    */
    urun_karuseli: tool({
      description:
        'Müşteriye 2–10 ürünlük KAYDIRMALI KARUSEL gönderir: her kartta fotoğraf, ad, fiyat (ya da "n boy · …\'dan") ve tek düğme. ' +
        '"Hangi baklavalarınız var", "ne tür pastalar var" gibi ÇEŞİT sorularında urun_ara\'dan sonra çağır; kodlar = urun_ara çıktısındaki "kod" alanları (en fazla 10). ' +
        'Karusel cevabından ÖNCE kendiliğinden gider; cevabında ürünleri tek tek sayma, bir cümleyle bağla.',
      inputSchema: z.object({
        kodlar: z.array(z.string().min(1)).min(CAROUSEL_CARD_RANGE.min).max(CAROUSEL_CARD_RANGE.max).describe('urun_ara çıktısındaki "kod" alanları — aynen geç, sırası kartların sırası.'),
        postaKodu: z.string().min(4).optional().describe('Müşteri SÖYLEDİYSE posta kodu; söylemediyse boş bırak.'),
      }),
      execute: async ({ kodlar, postaKodu }) => {
        try {
          const { yerim, viewer } = await yerVeGoruntuleyici(db, customerId, postaKodu, memory);
          const { language: dil } = await resolveOutboundLanguage(db, card.conversation);
          const okunanlar = await Promise.all([...new Set(kodlar)].map((kod) => kartUrunu(db, kod, dil, yerim, viewer)));

          const kartlar = [];
          const disarida: string[] = [];
          for (const o of okunanlar) {
            if (o.durum !== 'ok' || !o.imageUrl) {
              // Bu adrese gitmeyen ürün kart olmaz (10.09) — dışarıda kalır, sebebiyle.
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
 * Kart ve karuselin ORTAK okuması: detay (müşteri dili, yer, görüntüleyici) + satılabilir ve BU ADRESE
 * GİDEN boylar + görsel adresi. Görsel CDN dönüşümüyle JPEG (09.09, 05.37): WhatsApp WebP'yi çıkartma sayıp reddeder,
 * Cloudflare aynı kaynaktan `width=1200,format=jpeg` üretir (ölçüldü: 67 KB). Dönüşüm yoksa (r2.dev
 * tabanı) yalnız zaten JPEG/PNG olan görsel alınır.
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
  /* YALNIZ BU ADRESE GİDEN BOYLAR (10.09): kart düğmesi sepete yazar ve gidemeyen boyun düğmesi müşteriyi
     "gönderilemez" cevabına götürürdü. Yer bilinmiyorsa ayıklama yok (`product-reach.ts`). */
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
  /* Kadraj (05.37): operatörün odak+zoom'u sohbet kartı çerçevesine (`RATIO_CHAT`) `trim` olarak gider —
     kırpma penceresindeki "sohbet kartı" önizlemesiyle aynı kare. Kaynak ölçüsü yoksa kesim yok, tam görsel. */
  const trim = urun ? cropTrim({ width: urun.imageWidth, height: urun.imageHeight }, RATIO_CHAT, cropOf(urun)) : null;
  const imageUrl =
    cdnImageUrl(urun?.imageKey, urun?.imageUpdatedAt, { width: CARD_IMAGE_WIDTH, format: 'jpeg', trim }) ??
    (META_IMAGE_KEY.test(urun?.imageKey ?? '') ? publicImageUrl(urun?.imageKey, urun?.imageUpdatedAt) : null);
  return { durum: 'ok', kod, detay, boylar, imageUrl };
}

/**
 * Müşterinin KENDİ verisini okuyan araçlar — kimlik çapası açıkken verilir (`ai.ts` kapısı).
 *
 * Girdileri BOŞ ve bilerek: sorulacak tek şey "benimki"dir. Kimlik argüman olsaydı model
 * başkasınınkini sorabilirdi (dosya başındaki değişmez).
 */
function identityTools(db: Db, customerId: string): ToolSet {
  return {
    teslimat_gunleri: tool({
      description:
        'Müşterinin kendi adresine hangi günler teslimat yapıldığını ve yaklaşan somut tarihleri söyler. ' +
        'Teslimat günü, rota günü ya da "ne zaman gelirsiniz" sorularında MUTLAKA bunu çağır.',
      // Girdi BOŞ ve bilerek: sorulacak tek adres müşterinin kendi adresi (künye: kimlik kapanıştır).
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const adres = birincilAdres(await new AddressService(db).listByCustomer(customerId));
          if (!adres) return { bilinmiyor: 'Müşterinin kayıtlı adresi yok — hangi adrese sorulacağı belli değil.' };

          // Rota çözümü MOTORUN işi (`resolveDelivery`): kesim saati, bölge eşleşmesi ve yaklaşan
          // tarihler orada hesaplanıyor. Burada ikinci bir kopya yazmak, checkout ile ajanın farklı
          // gün söylemesi demekti. Bölge listesi bir kez okunup GEÇİLİYOR: haftalık günleri aynı
          // listeden alacağız, iki ayrı okuma iki farklı ana ait olabilirdi.
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
          /*
            ── BOŞ LİSTE BİR CEVAPTIR, SESSİZLİK DEĞİL (07.09 · ölçülmüş arıza) ────────────────
            Araç sıfır siparişte açıklamasız `{ siparisler: [] }` döndürüyordu ve model bunu
            YORUMLAMAK zorunda kalıyordu. Yorumu da yanlış çıktı: ajan *"sipariş geçmişini
            göremediğimiz için"* diye devretti — yani "veri yok"u "erişemiyorum" sandı. Oysa
            elinde araç vardı ve kapı açıktı; eksik olan tek şey boşluğun ADIYDI.

            Aynı dosyadaki öteki araçlar bunu zaten doğru yapıyor (`urun_ara` boşta *"katalogda
            eşleşen ürün yok"* diye cümle kurar). Bu araç kurmuyordu — tek fark buydu.

            "Okunamadı" ile "yok" AYRI kalıyor: ilki `bilinmiyor`la (catch dalı), ikincisi burada.
            İkisini tek cümleye indirmek, arızayı boşlukmuş gibi göstermek olurdu.
          */
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
 * KİMLİK İSTEMEYEN araçlar — kimliksiz sohbette de verilir.
 *
 * `customerId` yine geçiliyor ama **zorunlu değil**: varsa cevap müşterinin kapsamıyla daralır
 * (B2B fiyatı, kendi bölgesinin stoğu), yoksa ziyaretçi kapsamına düşer — `pricingViewerOf`'un
 * kendi kuralı (`!customerId → VISITOR`). Yani aynı araç iki modda çalışır ve ikisi de dürüsttür;
 * ikinci bir "ziyaretçi seti" yazmak aynı üç aracın ikinci kopyası olurdu.
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
      }),
      execute: async ({ terim, postaKodu }) => {
        try {
          /*
            İKİ BAĞLAM ZORUNLU — katalog kapısının kendi kuralı: `place` (hangi depo) ve `viewer`
            (hangi kanal/kademe). Varsayılan geçmek, B2B müşteriye B2C fiyatı ya da başka deponun
            stoğunu okutmak olurdu; kapı bu yüzden ikisini de zorunlu istiyor (`CatalogInput`
            künyesi) ve araç da uydurmuyor.

            ── YER DÖRT KAYNAKTAN, TEK SIRAYLA (28.08 · 10.09 · `cart/chat-place.ts`) ──────────
            (1) sohbette SÖYLENEN posta kodu · (2) sohbette SAKLANAN · (3) müşterinin kayıtlı adresi · (4) hiçbiri.
            Söylenen kod öndedir ve bilerek: "annemin evine, 75001'e gelir mi" diyen müşteride
            kayıtlı adres YANLIŞ cevabı verirdi. Posta kodu KİMLİK DEĞİL — herkese açık bir soru
            (`posta_kodu_kontrol` künyesinin kurduğu gerekçe); o yüzden bu araç kimliksiz sohbette
            de tam çalışır ve kimliksizlik yalnız FİYAT kapsamını ziyaretçiye düşürür.

            Yer hiç çözülemezse `place` DEPO-ÜSTÜ okunur (`UNRESOLVED_PLACE`): "hiç var mı" sorusu
            cevaplanabilir, "sana gelir mi" cevaplanamaz — ve model bunu bilsin diye cevapta ayrıca
            söyleniyor (`yerBilinmiyor`), üstelik çaresiyle: posta kodunu SOR ve yeniden çağır.
            Yer BİLİNİYORSA liste yalnız o adrese gidebilenlerden kurulur; gidemeyenler sebebiyle ayrı
            alanda (10.09 · `product-reach.ts`).
          */
          const { yerim, viewer } = await yerVeGoruntuleyici(db, customerId, postaKodu, memory);
          const { place, kod } = yerim;

          const ortak = {
            // Operasyon dili Türkçe ve model Türkçe yazıyor; cevabın müşteri diline çevrilmesi
            // gönderim anında, tek kapıdan yapılıyor (20.2). Araç ikinci bir dil kararı vermez.
            locale: 'tr' as const,
            place,
            viewer,
            /* REFERANS okuma — vitrin değil (08.46). Vitrin, kanalında satılamayan ürünü hiç
               listelemiyor ve müşteri için doğrusu o. Ama burada müşteri bir ürünü ADIYLA soruyor;
               süzseydik araç VAR OLAN bir ürün için "katalogda eşleşen ürün yok" derdi. Doğru cümle
               aşağıda zaten kurulu: "bu kanalda satışa kapalı". */
            includeUnsellable: true,
          };

          const isimAramasi = await getCatalogData(db, { ...ortak, query: { search: terim } });

          /*
            ── "TATLI" BİR ÜRÜN ADI DEĞİL, BİR KATEGORİDİR (06.09 · ölçülmüş arıza) ────────────
            Müşteri *"başka tatlı çeşitleriniz var mı"* diye sordu; araç yalnız ADDA arayabildiği
            için `Tatlı Simit` döndü ve ajan bir FIRIN ürününü tatlı diye saydı. Model kusuru
            DEĞİLDİ: kategori ne girdide vardı ne çıktıda — "tatlı bir kategoridir" bilgisini
            bilse bile kullanacağı bir kapı yoktu.

            Kapı burada açılıyor ve karar ARAÇTA veriliyor, modelde değil: terim bir kategori
            adıyla eşleşiyorsa arama o kategoriye daraltılır. Modele "önce kategori mi diye bak"
            demek, unutulabilecek bir talimat olurdu; burada unutulamaz.

            Kategori listesi ayrı bir okumadan gelmiyor — `getCatalogData` onu zaten döndürüyor.
            İkinci çağrı yalnız gerçekten kategori eşleştiğinde yapılıyor.
          */
          const normalize = (s: string) => s.trim().toLocaleLowerCase('tr');
          const kategori = isimAramasi.categories.find((c) => normalize(c.name) === normalize(terim)) ?? null;

          /*
            ── KARGO BÖLGESİNDE KATEGORİ, KARGOYA UYGUNLARDAN KURULUR (10.09 · kullanıcı sorusu) ─────
            Kapıya teslim bölgesi dışındaki müşteriye soğuk zincir ürünü hiçbir yoldan gitmez. Kategori
            süzgeçsiz okunsaydı sayfa ve tavan onlarla dolar, kargoyla gidebilenler kesilen kısımda
            kalabilirdi. Süzgeç sitenin "adresime gönderilebilir" çipinin kendisi (`onlyShippable`, SQL'de:
            sayfalı okumada sonradan süzmek sonraki sayfaları yutardı). İsim aramasına UYGULANMAZ: adıyla
            sorulan soğuk zincir ürünü "yok" değil, "bu adrese gitmiyor" diye söylenmeli. Kargoya uygun hiç
            ürün çıkmazsa kategori süzgeçsiz okunur — aynı sebeple.
          */
          const kargoSuzgeci = kategori !== null && kargoYalniz(place);
          const kategoriOku = (slug: string, onlyShippable: boolean) =>
            getCatalogData(db, { ...ortak, query: { categorySlug: slug, ...(onlyShippable ? { onlyShippable } : {}) } });
          let katalog = kategori ? await kategoriOku(kategori.slug, kargoSuzgeci) : isimAramasi;
          const kargoyaSuzuldu = kargoSuzgeci && katalog.products.length > 0;
          if (kategori && kargoSuzgeci && !kargoyaSuzuldu) katalog = await kategoriOku(kategori.slug, false);
          if (katalog.products.length === 0) return { bilinmiyor: `"${terim}" için katalogda eşleşen ürün yok.` };

          // Yer biliniyorsa gidemeyenler ayrılır: liste ve tavan gidebilenlere, gidemeyenler adıyla ayrı alana.
          const { gidenler, gitmeyenler } = yereGoreAyir(katalog.products, yerim);

          /*
            FİYAT ALANI ADIYLA NE OLDUĞUNU SÖYLER (06.09 · ölçülmüş arıza).

            `p.priceCents` çok boylu üründe **başlangıç fiyatıdır** — en ucuz aktif boyun fiyatı
            (`map.ts` künyesi; sitede "…'dan" diye çizilir). Alan düpedüz `fiyat` diye veriliyordu
            ve ajan onu TEK fiyat sanıp öyle yazdı: müşteri "fıstıklı baklava" diye genel sordu,
            dört boydan yalnız en küçüğünü (225 g · 4,57 €) öğrendi, ötekilerin varlığını hiç
            duymadı. Cevap YANLIŞ değildi — gramaj ve fiyat aynı varyanttan geldiği için eşleşme
            doğruydu — ama eksikti, ve eksikliği doğuran şey alan adının sustuğu bilgiydi.

            Bu, para alanının taşıdığı anlamı adında söyleme kuralının aynısı: tek boyluda `fiyat`,
            çok boyluda `enUcuzBoy`/`fiyatBaslangic`. Model hangisini okuduğunu adından bilir.
          */
          const tavan = kategori ? CATEGORY_HITS : PRODUCT_HITS;
          const urunler = gidenler.slice(0, tavan).map((p) => {
            const fiyat = p.priceCents === null ? 'bu kanalda satışa kapalı' : formatPrice(p.priceCents, 'tr');
            return {
              ad: p.name,
              // Ürün kartı aracının anahtarı (08.09): `urun_karti` bu kodu ister, adı değil.
              kod: p.slug,
              // Yer bilinmiyorsa "bu adrese" denmez (10.09): stok depo-üstü okundu, hangi adres belli değil.
              durum: stokCumlesi(p.stockStatus, yerim),
              /* KARGO UYGUNLUĞU AYRI BİR GERÇEK (07.09 · ölçülmüş arıza). `durum` "bu adrese gider
                 mi" sorusunu cevaplıyor; bu "kargoyla hiç gider mi". Ajan bu alan yokken *"tüm
                 ürünlerimiz kargo ile gönderime uygundur"* dedi ve sorgulanınca ısrar etti — oysa
                 aktif ürünlerin üçte biri (dondurmalar, taze fırın, çiğ köfte) kargoya verilemiyor.
                 Cümle olarak veriliyor, bayrak olarak değil: `false` bir alanı model "önemsiz"
                 sayıp atlayabilir, cümleyi atlayamaz. */
              kargo: p.shippable ? 'kargoya verilebilir' : 'KARGOYA VERİLEMEZ — yalnız bölge içi kapıya teslim',
              // `null` fiyat = bu kanalda SATIŞA KAPALI (DOMAIN §5) — "0 €" demek yanlış olurdu.
              ...(p.variantCount > 1
                ? { boySayisi: p.variantCount, enUcuzBoy: p.unitLabel, fiyatBaslangic: fiyat }
                : { birim: p.unitLabel, fiyat }),
            };
          });

          /*
            EN İYİ EŞLEŞMENİN BOYLARI — sayı yetmez, LİSTE gerekir.

            Araç bugüne kadar yalnız `boySayisi: 4` diyordu; ajan "dört boy var" bilgisine sahipti
            ama boyların etiketini ve fiyatını BİLMİYORDU, yani isteseydi de sayamazdı. Müşterinin
            "hangi boylar var, kaça" sorusu cevapsız kalıyordu.

            YALNIZ İLK EŞLEŞME için okunuyor ve bu bilinçli: beş ürünün beşine detay çekmek beş
            ekstra sorgu demekti, oysa müşteri genelde tek ürünü soruyor ve arama zaten ilgiye göre
            sıralı. İkinci ürünün boyları gerekirse model onu adıyla yeniden aratır.

            Detay AYNI motordan okunuyor (`getProductDetail`, aynı `place`+`viewer`): ikinci bir
            fiyat kuralı doğmuyor, yani listedeki fiyatla boy fiyatları ayrışamaz. Yer biliniyorsa
            ilk eşleşme GİDEBİLENLERİN ilkidir (10.09): gidemeyen ürünün boyları satın alınamaz.
          */
          const ilk = gidenler[0];
          /*
            DETAY ARTIK HER İLK EŞLEŞME İÇİN OKUNUYOR (07.09 · ölçülmüş yanlış devir): eskiden yalnız
            çok boylu üründe, boyları saymak için. Şimdi YASAL BEYAN da buradan geliyor — müşteri
            *"bu pastanın besin değerleri ve alerjenleri"*ni sordu, ajan *"bilgi sistemde yok"* diye
            devretti; oysa katalog alerjeni, içindekileri ve besin tablosunu tutuyordu, yalnız araç
            vermiyordu. Alerjen bir sağlık sorusudur: cevabı tahmin değil kayıt olmalı (`beyanOf`).
          */
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

          /*
            ── ÇIKTI HANGİ SORUYU CEVAPLADIĞINI SÖYLER ───────────────────────────────────────
            İki arama aynı şekle sahip ama ANLAMLARI farklı ve model bunu bilmeden doğru cümleyi
            kuramaz:
              · kategori araması → "bunlar o kategorinin ürünleri" (küme TAM)
              · isim araması     → "bunlar adı eşleşen ürünler" (küme kategori DEĞİL)
            06.09'daki arıza tam olarak bu ayrımın yokluğuydu: isim eşleşmesi kategori sanıldı.

            İsim aramasında kategori listesi de veriliyor: model "tatlı" diye bir kategorimiz
            olduğunu görüp doğru soruyu yeniden sorabilsin — ve müşteri "neler satıyorsunuz"
            derse uydurmak yerine gerçek taksonomiyi söylesin.
          */
          /*
            ── KIRPMA SESSİZ OLMAZ (07.09 · ölçülmüş arıza) ───────────────────────────────────
            Liste tavanla kesiliyordu ve çıktı bunu SÖYLEMİYORDU. Model kırpılmış listeyi tam sanıp
            *"tatlı çeşitlerimiz SADECE baklavalardan oluşmaktadır"* dedi — oysa kategoride 20 ürün
            vardı, ilk beşi tesadüfen baklavaydı.

            Eksik veriden mutlak hüküm, hiç veri olmamasından kötüdür: hiç veri olsa ajan
            "bilmiyorum" derdi. O yüzden sayı burada CÜMLEYE giriyor — modelin "sadece/hepsi"
            diyebilmesini yapısal olarak zorlaştırıyor.
          */
          /* Toplam SAYAÇTAN (`total`), sayfadan değil (10.09): sayfa 30 satırdır ve kalabalık kategoride
             "toplam 30" yazıyordu. Gidemeyenler kırpma sayılmaz — onlar kendi alanında adıyla duruyor. */
          const toplam = katalog.total;
          const kirpildi = gidenler.length > urunler.length || toplam > katalog.products.length;
          const kirpmaNotu = kirpildi
            ? ` Toplam ${toplam} ürünün ${urunler.length}'i listelendi — bu liste TAM DEĞİL, "sadece bunlar var" DEME.`
            : '';

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

          /* YER ALANI — hangi koda bakıldığı ve o kodun hâli. Kod var ama depo çözülmediyse (yazım hatası,
             iki ülkeli kod, hizmet yok) hâlin cümlesi de gelir; sepet araçlarıyla aynı cümle (`yerNotu`). */
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

          // Eşleşme VAR ama hiçbiri bu adrese gitmiyor: "katalogda yok" demek yanlış olurdu (10.09).
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
      }),
      execute: async ({ postaKodu }) => {
        try {
          /*
            ── YER ADI DA KABUL EDİLİR (07.09 · ölçülmüş arıza) ────────────────────────────────
            Araç yalnız POSTA KODU alıyordu ve müşteri *"lingolsheim a geliyor musunuz?"* diye
            sordu — ajan cevaplayamayıp *"kontrol edip size bilgi vereceğiz"* dedi. O bir çıkmaz
            sokaktı: sohbet YZ modundaydı, talep de açılmadı, yani kimse kontrol etmeyecekti.

            Oysa veri elimizdeydi (`postal_code_place.places_search`) ve servis kapısı ikisini de
            çözüyor (`search` — terimin ad mı kod mu olduğunu kendi ayırt ediyor). Eksik olan tek
            şey aracın o kapıyı çağırmamasıydı.

            Ve bu kenar durum DEĞİL: müşteri doğal olarak semtinin adını söyler, posta kodunu
            değil. Kod isteyen bir araç, en sık sorulan biçimi cevapsız bırakıyordu.
          */
          const kodMu = /^\d{4,}$/.test(postaKodu.trim());
          let cozulmusKod = postaKodu.trim();
          if (!kodMu) {
            const adaylar = await new PostalCodePlaceService(db).search(postaKodu, 3);
            if (adaylar.length === 0) {
              return { bilinmiyor: `"${postaKodu}" diye bir yerleşim bulunamadı. Müşteriden POSTA KODUNU iste.` };
            }
            /* BİRDEN ÇOK EŞLEŞMEDE SEÇİM YAPILMAZ, SORULUR: aynı ad birden çok kodda geçebilir
               (mahalle/ilçe) ve yanlışını seçmek "gelmiyoruz" demek olurdu. Model müşteriye sorar. */
            if (adaylar.length > 1) {
              return {
                belirsiz: `"${postaKodu}" birden çok posta koduna denk geliyor. Müşteriye hangisi olduğunu sor.`,
                adaylar: adaylar.map((a) => `${a.postalCode} ${a.places.join(', ')}`),
              };
            }
            cozulmusKod = adaylar[0]!.postalCode;
          }
          const postaKoduCozum = cozulmusKod;
          /*
            BU ARAÇ GİRDİ ALIYOR ve değişmezi çiğnemiyor: alınan şey KİMLİK değil, herkese açık bir
            soru. "67000'e geliyor musunuz" cevabı sitede zaten var (posta kodu adımı ziyaretçiye
            açık) — kimseye ait olmayan bir bilgiyi okumak, başkasının verisini okumak değildir.

            Kimliğe dayalı sorunun aracı ayrı (`teslimat_gunleri`, girdisi boş): "benim adresim"
            sorusunu bu araca postalayan bir model, müşterinin adresini uydurmak zorunda kalırdı.
          */
          const cozum = await resolvePlaceForPostalCode(db, postaKoduCozum);
          // Müşterinin söylediği GERÇEK kod sohbete yazılır (10.09): bir daha sorulmaz, sepete o yerle yazılır.
          if (cozum.kind !== 'unknown' && cozum.kind !== 'ambiguous') await memory?.remember(postaKoduCozum);
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
              // Aynı kod iki hizmet ülkemizde birden geçerli — model UYDURMAZ, SORAR.
              return {
                kod: postaKoduCozum,
                bilinmiyor: 'Bu kod birden çok ülkede geçerli — hangi ülke olduğunu müşteriye SOR, tahmin etme.',
                adaylar: cozum.candidates.map((c) => `${COUNTRY_LABELS[c.country]}${c.inRoute ? ' (rota bölgemizde)' : ''}`),
              };
            case 'unknown':
              return { kod: postaKoduCozum, bilinmiyor: 'Böyle bir posta kodu bulunamadı — büyük olasılıkla yazım hatası. Müşteriden kodu teyit et.' };
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
          /*
            Sayılar `settings`ten ve MÜŞTERİNİN KAPSAMIYLA okunuyor (`readPublicDeliveryTerms`
            kimliği alıyor): B2B'nin asgari sepeti B2C'ninkinden farklı olabilir. Aynı kapıyı bilgi
            sayfaları, sepet ve checkout da okuyor — ajanın ikinci bir sayı söylemesi, sitede yazanla
            sohbette söylenenin ayrışması demekti (07.15'in ölçülmüş dersi).
          */
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
