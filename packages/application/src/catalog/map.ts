import { percentOffCents, resolvePrice } from '@lezzet/domain-core';
import type { ActiveOffer } from '@lezzet/domain-core';
import { pricePerKg } from '@lezzet/helper';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, resolveLocalizedText } from '@lezzet/types';
import type {
  AvailableStockTotal,
  Category,
  ImageMeta,
  PreferredLanguage,
  Price,
  Product,
  ProductVariant,
  StockStatus,
} from '@lezzet/types';
import type { ScopeCampaign } from './campaign';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct, StorefrontVariant } from './storefront-types';
import { rotateDaily } from './featured';
import { VISITOR, type PricingViewer } from './pricing-viewer';

/**
 * DB satırı → vitrin kartı indirgemesi (terfi 21.6; kaynağı `apps/web/lib/storefront/map.ts`).
 *
 * Anasayfa, katalog ve detay AYNI indirgemeyi kullanır; ayrı yazılsa aynı ürün üç ekranda farklı
 * görünebilirdi (no-duplication). Mobil yüzeyin katalog uçları da buraya bağlanacak — bugün
 * ticari bağlamsız çalışıyorlar (fiyat/stok/teklif yok) çünkü bu indirgeme henüz web'deydi.
 *
 * Fiyat kararı BU KATMANDA verilmez: satırlar `PriceService`'ten toplu gelir, karar saf motorda
 * (`domain-core/resolvePrice`) — `database` motora bağlanmaz (STACK §4), birleştirme burada yapılır.
 */

/** Görsel künyesini karta indirger — anahtar→URL ve odak/zoom çözümü TEK yerde. */
export function imageOf(row: ImageMeta): StorefrontImage {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row) };
}

/**
 * Kategori kartının ihtiyaç duyduğu satır. Dışa VERİLİR çünkü `getCatalogData`'nın yedek kategori
 * parametresi bu şekli bekliyor — çağıranın elindeki listeyi bu tiple imzalaması, yedek ile gerçek
 * satırın ayrışmasını derleme anında yakalar.
 */
export type CatalogCategoryRow = Pick<Category, 'id' | 'slug' | 'name'> & ImageMeta;

/**
 * Kategori kartı — görseli HAVUZDAN, güne göre seçilir (05.23).
 *
 * "Börekler" bir ürün değil bir RAF: su böreği de, kol böreği de aynı raftadır ve hiçbiri tek
 * başına o rafın doğru resmi değildir. Operatör havuza birkaç kare koyar, kart her gün başka
 * birini gösterir.
 *
 * ── HAVUZ = KAPAK + EK FOTOĞRAFLAR ───────────────────────────────────────────
 * Kapak havuzdan ÇIKARILMAZ: o da operatörün seçtiği bir karedir ve dışarıda bırakmak, havuza ilk
 * fotoğraf eklendiği gün kapağı sessizce emekliye ayırmak olurdu. Anahtarı olmayan satır havuza
 * girmez — kapağı henüz yüklenmemiş bir kategori boş kare göstermesin.
 *
 * ── SEÇİM `rotateDaily` İLE, YENİ BİR KURALLA DEĞİL ──────────────────────────
 * Koleksiyon bandı aynı soruyu 08.08'den beri soruyor ve cevabı orada verilmişti: `Math.random()`
 * önbelleği kırar, aynı müşteriye her yenilemede başka vitrin gösterir ve "dün gördüğüm neydi"
 * sorusunu cevapsız bırakır. Kategori kartında üçü de aynen geçerli — ayrıca paylaşım kartı (OG)
 * ile sayfanın kendisi ayrışırdı: linki açan, önizlemede gördüğünden başka bir fotoğrafla
 * karşılaşırdı.
 *
 * Havuz BOŞSA kart bugünkü davranışını aynen sürdürür (kapak) — bu tablo hiçbir ekranı
 * değiştirmeden boş kalabilir.
 *
 * `pool` ve `now` opsiyonel: havuzu okumayan çağıran (ürün detayının kategori rozeti gibi, kart
 * çizmiyor) hiçbir şey değiştirmek zorunda değil; `now` ise testin günü sabitlemesi için.
 */
export function toCategory(
  row: CatalogCategoryRow,
  locale: PreferredLanguage,
  pool?: readonly ImageMeta[],
  now?: Date,
): StorefrontCategory {
  const faces = [row, ...(pool ?? [])].filter((face) => face.imageKey !== null);
  const face = rotateDaily(faces, 1, now)[0] ?? row;
  return { id: row.id, slug: row.slug, name: resolveLocalizedText(row.name, locale), image: imageOf(face) };
}

/** Ürünün karta indirgenmesi için gereken yan veriler — çağıran toplu okur, kart başına sorgu yok. */
export interface ProductContext {
  /**
   * **Kim soruyor** — kanal, onay ve kimlik (`pricing-viewer.ts`).
   *
   * Fiyatın çözümü buna bağlı ve bağlam içinde taşınması şart: fiyat SATIRLARI zaten bu kanala
   * göre okundu (`loadProductContext`), yani motora başka bir kanal söylemek elindeki listeyle
   * çelişen bir soru sormak olurdu.
   */
  viewer: PricingViewer;
  variants: ProductVariant[];
  prices: Map<string, { channelPrice: Price | null; customerPrice: Price | null }>;
  /**
   * Kullanılabilir stok. Tip depo-ÜSTÜ olanı (`AvailableStockTotal`) çünkü iki okumadan da
   * beslenir: yer belliyse depo satırı (o tip bunun süpersetidir), belirsizse toplam. Okuyan taraf
   * yalnız `availableQty`ye bakar — hangi okumadan geldiği kararı çağıranındır (DOMAIN §17).
   */
  stock: Map<string, AvailableStockTotal>;
  /**
   * AĞ genelindeki toplam (19.10) — dördüncü hâli ayırmak için.
   *
   * "Yerelde yok + kargoda yok" iki ayrı şey olabilir: ürün başka bir depoda duruyor (soğuk zincir,
   * o bölgeye gitmiyor) ya da hiçbir yerde yok. İlkinin doğru cümlesi "bölgenizde şu an yok" ve
   * yanında "gelince haber ver"; ikincisininki "tükendi". Aynı kelimeyle söylemek, gelmeyecek malı
   * bekletmek ya da gelecek malı kaçırmaktır.
   *
   * `null` = yer bilinmiyor; o hâlde `stock` zaten ağ toplamıdır.
   */
  networkStock: Map<string, AvailableStockTotal> | null;
  /**
   * KARGO deposunun kullanılabiliri (19.10) — `stock`'tan ayrı bir soru.
   *
   * "Yerel depoda yok" tek başına **tükendi demek değildir** (C3): ürün kargo deposunda duruyorsa
   * hâlâ satılabilir, yalnız yolu değişir. Bu harita olmadan yer bilen müşteri, kargoyla
   * gönderebileceğimiz ürünü "Tükendi" görüyordu — sistem müşteriyi tanıdıkça daha az satıyordu.
   *
   * `null` = yer bilinmiyor (o hâlde `stock` zaten ağ-geneli toplam) ya da o ülkeye kargo yok.
   */
  shippingStock: Map<string, AvailableStockTotal> | null;
  /** Varyanta açık near-expiry teklifi (partiye bağlı indirim, DOMAIN §5). */
  offers: Map<string, ActiveOffer>;
}

/**
 * Stok hâlini üç sayıdan ve ürünün kargolanabilirliğinden türetir.
 *
 * Dışa VERİLİR (web'de dosya-içi özeldi): dört hâlin hangi sayıdan doğduğu tek başına sınanabilen
 * bir karardır ve testi de öyle yazılıyor — üç haritanın hepsi doluyken ekrandan geriye doğru
 * okumak, yanlış dalı yeşil gösterirdi.
 */
export function stockStatusOf(
  ctx: ProductContext,
  variantIds: readonly string[],
  shippable: boolean,
): StockStatus {
  const sum = (map: Map<string, AvailableStockTotal> | null): number =>
    map ? variantIds.reduce((total, id) => total + (map.get(id)?.availableQty ?? 0), 0) : 0;

  if (sum(ctx.stock) > 0) return 'available';
  // Kargolanamayan ürün (soğuk zincir) kargo deposunda dursa da o yola giremez.
  if (shippable && sum(ctx.shippingStock) > 0) return 'shipping';
  // Yer bilinmiyorsa `networkStock` null'dur ve `ctx.stock` zaten ağ toplamıydı → buraya
  // düşmek "hiçbir yerde yok" demektir.
  return sum(ctx.networkStock) > 0 ? 'elsewhere' : 'out_of_stock';
}

/**
 * Yan verisi olmayan ürün bağlamı — fiyatsız/stoksuz görünür, yani satışa kapalı ve tükendi.
 * Toplu okuma bir ürünü ıskalarsa buraya düşülür; her okuma dosyası kendi boşunu tanımlamasın.
 */
export const EMPTY_PRODUCT_CONTEXT: ProductContext = {
  // Bağlamı olmayan ürünün fiyatı da yok; ziyaretçi künyesi burada bir varsayım değil, "soruyu
  // soracak kimse yok"un yazılışı.
  viewer: VISITOR,
  variants: [],
  prices: new Map(),
  stock: new Map(),
  shippingStock: null,
  networkStock: null,
  offers: new Map(),
};

/**
 * Tek varyantın satış künyesi — fiyat, kıyas fiyatı, indirim referansı, adet tavanı ve tükendi.
 *
 * Kart da (ilk varyanttan) detay sayfası da (her varyant için) BU indirgemeyi kullanır. Ayrı
 * yazılsalar aynı ürün iki ekranda farklı fiyatlanabilirdi — kartta indirimli, detayda normal gibi.
 *
 * Karar bu katmanda VERİLMEZ: satırlar servisten toplu gelir, fiyatı saf motor çözer
 * (`domain-core/resolvePrice`), burada yalnız motorun cevabı görünüm alanlarına dağıtılır.
 *
 * Dışa VERİLİR: "kartın gösterdiği fiyat" tek bir yerden gelmeli ve o yerin sınanabilir olması
 * gerekiyor — web'de özeldi, terfide kapı açıldı (yalnız okuma; karar yine motorda).
 */
export function sellingOf(variant: ProductVariant, ctx: ProductContext) {
  const priceRows = ctx.prices.get(variant.id);
  // Servis cent döndürür (02.9 · STACK §8) — motorun istediği birim de bu, dönüşüm kalmadı.
  const listCents = priceRows?.channelPrice?.amountCents ?? null;
  const customerCents = priceRows?.customerPrice?.amountCents ?? null;

  const resolved = resolvePrice({
    channel: ctx.viewer.channel,
    b2bApproved: ctx.viewer.b2bApproved,
    // Liste, okunduğu kanalın satırıdır — `viewer.channel` zaten daraltılmış hâl (onaysız şirket
    // B2C'dir), yani motorun kendi daraltması bu listeyle çelişmez.
    channelPrices: listCents != null ? [{ channel: ctx.viewer.channel, amountCents: listCents }] : [],
    customerPriceCents: customerCents,
    // Grup kademesi (20.08): yüzde viewer'da çözülmüş gelir, fiyata motor uygular (özel→grup→liste).
    groupPercentOff: ctx.viewer.groupPercentOff,
    offer: ctx.offers.get(variant.id) ?? null,
  });

  const priceCents = resolved.sellable ? resolved.unitPriceCents : null;
  // Teklifin yerine geçtiği fiyat, motorun teklifsiz vereceği fiyattır: özel → grup → liste.
  const withoutOffer =
    customerCents ??
    (ctx.viewer.channel === 'b2b' && ctx.viewer.groupPercentOff != null && listCents != null
      ? percentOffCents(listCents, ctx.viewer.groupPercentOff)
      : listCents);
  return {
    priceCents,
    // Teklif kazandıysa üstü çizilen, teklifin YERİNE GEÇTİĞİ fiyattır.
    wasCents: resolved.sellable && resolved.source === 'offer' ? (withoutOffer ?? undefined) : undefined,
    // Kıyas fiyatı ÖDENEN fiyattan hesaplanır (teklif kazandıysa indirimli olandan) — müşteri
    // karşılaştırırken bugün ödeyeceği tutarı kıyaslar. Net ağırlık girilmemişse satır düşer.
    comparisonCents: priceCents != null ? pricePerKg(priceCents, variant.netWeightG) : null,
    // Adet tavanı yalnız teklifte vardır (partide kalan miktar); normal satışta tavan yoktur.
    limitLabel: resolved.sellable && resolved.quantityCap != null ? String(resolved.quantityCap) : null,
    // Teklif kazandıysa kalem O PARTİYE çıpalanır: indirimin sebebi partinin tarihidir, başka
    // partiye taşınmaz (DOMAIN §5). Sepet ve rezervasyon bu kimliği taşır.
    stockId: resolved.sellable ? resolved.stockId : null,
    availableQty: ctx.stock.get(variant.id)?.availableQty ?? 0,
  };
}

/**
 * Ürünün BİRİNCİL boyu — kartın fiyatını okuduğu, detayın seçili açması gereken boy (düzeltme 09.08).
 *
 * **Ölçüt EN UCUZ satılabilir boydur, operatörün sırası değil.** Sıra fiyatı bilmiyor ve ölçüldü:
 * 32 çok boylu ürünün **24'ünde** kartta yazan fiyat en ucuz boyunki değildi (bir üründe kart
 * 9,14 € gösteriyordu, 1,57 €'luk boyu vardı). Müşteri pahalı fiyatı görüp geçiyor, ucuz boyun
 * varlığını hiç öğrenmiyordu — hiçbir yerde hata vermeyen, sessiz bir satış kaybı.
 *
 * **`sort_order`'a dokunulmadı** ve dokunulmamalı: o kolon operatörün kararı (*"1 kg'ı öne al"*) ve
 * detayın boy seçicisi, mobil ana ekran ve fikirler şeridi de onu okuyor. Değişen tek şey hangi
 * boyun fiyatının VAAT edildiği; boyların SIRASI değişmiyor. İkisi ayrı sorudur.
 *
 * **Fiyatı olmayan boy birincil olamaz** — olsaydı ürünün fiyatı olduğu hâlde kartı boş görünürdü.
 * Hiçbir boyun fiyatı yoksa ilk boya düşülür: ürün satışa kapalıdır ve kart yine de bir boy adı
 * gösterebilmeli (`unitLabel`), aksi hâlde kart adsız kalırdı.
 *
 * **Eşitlikte gelen sıra korunur** (`<`, `<=` değil) — sıra `sort_order`'dan geliyor ve bu, SQL
 * tarafındaki tie-breaker'ın (`0032_product_listing.sql`) birebir karşılığı. İki taraf aynı boyu
 * seçmezse kartın fiyatı ile sıralamanın kullandığı fiyat ayrışır ve ayrışma sessizdir.
 *
 * Dışa VERİLİR: ölçüt tek yerde dursun — detay sayfasının açılış boyu da buradan okunmalı, yoksa
 * müşteri listede 17 € görüp tıklıyor ve karşısına 33 € çıkıyor (bugünkü hâlden kötü).
 */
export function primaryVariantOf(variants: readonly ProductVariant[], ctx: ProductContext): ProductVariant | null {
  let best: ProductVariant | null = null;
  let bestCents: number | null = null;
  for (const variant of variants) {
    const cents = sellingOf(variant, ctx).priceCents;
    if (cents == null) continue;
    if (bestCents == null || cents < bestCents) {
      best = variant;
      bestCents = cents;
    }
  }
  return best ?? variants[0] ?? null;
}

/**
 * Varyantı detay sayfasının "Boy seçin" kartına indirger (K22).
 *
 * `shippable` ÜRÜNÜN özelliğidir, varyantın değil — ama karar varyant düzeyinde verilir (bir boy
 * yerelde bitip öteki durabilir), o yüzden çağıran onu geçirir.
 */
export function toVariant(
  variant: ProductVariant,
  locale: PreferredLanguage,
  ctx: ProductContext,
  shippable: boolean,
): StorefrontVariant {
  const selling = sellingOf(variant, ctx);
  const stockStatus = stockStatusOf(ctx, [variant.id], shippable);
  return {
    id: variant.id,
    // Boy etiketi ÇOK DİLLİ ("700 g tepsi" / "plateau 700 g") — burada çözülür, ekran dil bilmez.
    label: resolveLocalizedText(variant.label, locale),
    piecesCount: variant.piecesCount ?? null,
    portionKind: variant.portionKind ?? null,
    netWeightG: variant.netWeightG,
    priceCents: selling.priceCents,
    wasCents: selling.wasCents,
    comparisonCents: selling.comparisonCents,
    limitLabel: selling.limitLabel,
    stockId: selling.stockId,
    stockStatus,
    // `soldOut` YALNIZ gerçek tükenmede true — "senin deponda yok" onun cevabı değil.
    // Kargoyla gelebilen ya da başka depoda duran ürün satılabilir kalır (C3).
    soldOut: stockStatus === 'out_of_stock',
  };
}

export type CatalogProductRow = Pick<Product, 'id' | 'slug' | 'name' | 'shippable'> & ImageMeta;

/**
 * Ürünü vitrin kartına indirger.
 *
 * Kanal fiyatı YOKSA ürün satışa kapalıdır (DOMAIN §5): `priceCents` null döner, kart fiyat
 * göstermez ve aksiyonu pasifleşir.
 *
 * `purchaseMode` varyant SAYISINDAN türer: tek varyant listeden eklenir, çok varyantlı detaya
 * götürür (varyant seçimi atlanamaz — `musteri-katalog.md §3`).
 *
 * Tükendi kararı satılabilir varyantların toplam kullanılabilir stoğundan gelir; rezerve edilmiş
 * miktar `availableQty`'de zaten düşülmüştür.
 *
 * Karttaki "Fırsat" hâli near-expiry teklifinden doğar: teklif normal fiyatı YENMİŞSE (motorun
 * kararı) `wasCents` dolar ve kart turuncu etiketi, üstü çizili referansı ve adet sınırını gösterir.
 * Tek fiyat kuralı korunur — üstü çizili değer satın alınabilir bir fiyat değil, referanstır
 * (DOMAIN §5, komponent envanteri K6).
 */
export function toProduct(
  row: CatalogProductRow,
  locale: PreferredLanguage,
  ctx: ProductContext,
  /**
   * Ürünün KAPSAM kampanyası — kartın rozeti (23.08). `null` = yok ya da kesit başlığı zaten
   * söylüyor; ayrımı çağıran yapar (`catalog.ts`), çünkü "başlık söylüyor mu" sorusunun cevabı
   * okumanın bağlamında yaşar, ürünün kendisinde değil.
   */
  campaign: ScopeCampaign | null = null,
): StorefrontProduct {
  // Fiyat, ürünün EN UCUZ aktif boyundan okunur (`primaryVariantOf`) — çok boyluda bu gerçekten
  // "başlangıç fiyatı"dır. Eskiden ilk boydan okunuyordu ve o boy en ucuz olmak zorunda değildi.
  const variants = ctx.variants.filter((v) => v.isActive);
  const primary = primaryVariantOf(variants, ctx);
  const selling = primary ? sellingOf(primary, ctx) : null;
  // Stok kararı kartta ÜRÜN düzeyindedir: bir boyu biten ürün listede tükenmiş görünmemeli — bu
  // yüzden hâl tüm aktif varyantların toplamından türer.
  const stockStatus = stockStatusOf(ctx, variants.map((v) => v.id), row.shippable);

  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: primary ? resolveLocalizedText(primary.label, locale) : '',
    variantId: primary?.id ?? null,
    stockId: selling?.stockId ?? null,
    // Kartın çeşit satırının sayısı — `purchaseMode` ile AYNI kümeden (aktif boylar), ikinci bir
    // sayım yapılmaz ki ikisi bir gün çelişmesin.
    variantCount: variants.length,
    comparisonCents: selling?.comparisonCents ?? null,
    priceCents: selling?.priceCents ?? null,
    wasCents: selling?.wasCents,
    limitLabel: selling?.limitLabel ?? null,
    purchaseMode: variants.length > 1 ? 'options' : 'quick',
    stockStatus,
    // Yalnız GERÇEK tükenmede true (bkz. `StockStatus`).
    soldOut: stockStatus === 'out_of_stock',
    /* FIRSAT KAMPANYAYI YENER (kullanıcı kararı 23.08) — ve karar BURADA veriliyor, ekranda değil.
       İkisi de aynı satırda hesaplanıyor (`selling.wasCents` ve kapsam kampanyası), yani ayrımı
       burada yapmamak her yüzeyi aynı `if`i tekrar yazmaya zorlardı — üçüncü yüzey geldiği gün
       biri unuturdu.
       Gerekçe: "Fırsat" birim fiyatta GERÇEKTEN düşen, üstü çizili eski fiyatı olan kesin bir
       indirimdir; kapsam kampanyası ise sepete bağlıdır ve tutarı ancak sepet varken bilinir.
       Kesin olan, koşullu olanın önüne geçer. Kartta tek rozet yuvası olması bu kararı zorunlu
       kıldı, ama karar yuvadan bağımsız doğru: iki rozet çizilse bile hangisinin sözü bağlayıcı
       olduğu söylenmeliydi. */
    campaign: selling?.wasCents === undefined ? campaign : null,
  };
}
