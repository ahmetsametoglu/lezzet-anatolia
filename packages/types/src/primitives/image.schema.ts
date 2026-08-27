import { z } from 'zod';
import { LocalizedTextDraftSchema } from './localized-text.schema';

// Görsel oran + kırpma sistemi — Komponent Envanteri §0B + O15 (Fotoğraf bloğu). TEK KAYNAK: hem
// operasyon (yükleme/kırpma) hem müşteri (çerçeve) buradan okur; oran sayısı hiçbir bileşene gömülmez.
//
// KURAL: her nesne için TEK kaynak dosya yüklenir; müşteri yüzeyindeki çerçevelerin hepsi ondan
// `object-fit: cover` + ODAK + ZOOM ile türetilir. İkinci oran yüklenmez, kırpılmış kopya saklanmaz.
// Çerçeveler `aspect-ratio` ile kurulur — sabit px yükseklik yazılmaz.
//
// SAPMA (tasarımdan bilinçli): tasarım "dikey/oranı tutmayan dosya reddedilir, yatay çektir" diyor.
// Biz fotoğrafları üreticiden alıyoruz, yeniden çektiremeyiz → RED YOK. Operatör dikey/kare bir
// kaynaktan bile odak + zoom ile istediği yatay bölgeyi kırpar; oran uymazlığı hata değil, "şu kadarı
// kırpılacak" uyarısıdır. Kaydetme kapısı yalnız kapak görseli + alt metin varlığına bakar.

// ── Kırpma künyesi: odak + zoom ────────────────────────────────────────────────────────────────
/** Zoom yüzdesi: 100 = `cover` temeli (kaynağı olduğu gibi kapla), >100 odağa yaklaş. */
export const IMAGE_ZOOM_MIN = 100;
export const IMAGE_ZOOM_MAX = 400;

/** Odak noktası + zoom — tüm çerçeveler bu tek değerden türer (CSS object-position + transform). */
export const ImageCropSchema = z.object({
  x: z.number().int().min(0).max(100), // odak %, object-position X
  y: z.number().int().min(0).max(100), // odak %, object-position Y
  zoom: z.number().int().min(IMAGE_ZOOM_MIN).max(IMAGE_ZOOM_MAX),
});
export type ImageCrop = z.infer<typeof ImageCropSchema>;

export const CROP_CENTER: ImageCrop = { x: 50, y: 50, zoom: 100 };

// ── Oranlar ──────────────────────────────────────────────────────────────────────────────────
/** Nesne fotoğrafı: kaynak ve ana çerçeve (katalog kartı, detay, keşif, benzer ürünler). */
export const RATIO_SOURCE = 3 / 2;
/** Kare: sepet satırı, paket içeriği, sipariş satırı; daire maskesi de bu kırpmayı kullanır. */
export const RATIO_SQUARE = 1;
/** Bant: hero, kampanya bandı, koleksiyon vitrin bandı, paylaşım (OG) kartı. */
export const RATIO_BAND = 16 / 9;
/**
 * Çizim alanı: boş sepet gibi ANLATIM görselleri — bir ürünü değil bir hâli anlatır.
 *
 * Nesne oranından (3:2) daha kare, banttan (16:9) çok daha dar; müşteri yüzeyi bu oranı zaten
 * kullanıyordu (`empty-cart`) ama sabit orada gömülüydü. Operasyonun yükleme ekranı da aynı çerçeveyi
 * göstermek zorunda — iki yerde yazılsaydı operatörün kadrajladığı alan müşterininkinden farklı olurdu.
 */
export const RATIO_ILLUSTRATION = 1.3;

/** Kaynaktan türeyen görünüm çerçevesi — odak panelinin canlı önizlemesi bunları gösterir. */
export interface ImageFrame {
  ratio: number;
  label: string;
  /** Hangi ekranda göründüğü (operatöre bilgi). */
  where: string;
  /** Tam yuvarlak maske (mobil kategori şeridi) — kırpma yine kare. */
  circle?: boolean;
}

const OBJECT_FRAMES: ImageFrame[] = [
  { ratio: RATIO_SOURCE, label: '3:2', where: 'katalog kartı · detay (masaüstü)' },
  // Mobil detayın kahramanı da 1:1 (kullanıcı kararı 20.08): native ürün ekranının kahramanı
  // telefon eninde kare — çerçeve zaten burada tanımlıydı, yalnız görünürlük listesi genişledi.
  { ratio: RATIO_SQUARE, label: '1:1', where: 'sepet · paket satırı · detay kahramanı (mobil)' },
  { ratio: RATIO_SQUARE, label: '1:1', where: 'kategori dairesi', circle: true },
];

const BAND_FRAMES: ImageFrame[] = [{ ratio: RATIO_BAND, label: '16:9', where: 'vitrin bandı · paylaşım kartı' }];

/**
 * Galeri fotoğrafı İKİ çerçevede görünür: masaüstü detay galerisi 3:2, mobil detay kahramanı 1:1
 * (kullanıcı kararı 20.08 — mobil kahraman kare). Kapaktan farkı yine duruyor: kapak dört ayrı
 * çerçeveye türediği için odak ayarı orada kritiktir; galeri fotoğrafında soru "bu iki karede
 * neresi ortada kalsın".
 */
const GALLERY_FRAMES: ImageFrame[] = [
  { ratio: RATIO_SOURCE, label: '3:2', where: 'ürün detay galerisi (masaüstü)' },
  { ratio: RATIO_SQUARE, label: '1:1', where: 'detay kahramanı (mobil)' },
];

/**
 * SAYFA GÖRSELLERİ tek çerçevede görünür (`site_image`, 09.16) — çünkü bir VARLIĞA değil bir sayfa
 * YERİNE aitler: yüklenen fotoğraf yalnız o yerde, o oranda çizilir ve başka bir karede türemez.
 * Nesne görselinin dört türevi (kart · sepet karesi · daire · paylaşım kartı) burada yok.
 *
 * `where` GENEL yazılıyor ("sayfa kahramanı"), hangi sayfa olduğu değil: aynı çerçeveyi iki slot
 * paylaşıyor (ana sayfa · Professionnels) ve sayfanın adını slot kartının kendi başlığı söylüyor.
 */
const PAGE_BAND_FRAMES: ImageFrame[] = [{ ratio: RATIO_BAND, label: '16:9', where: 'sayfa kahramanı' }];
const PAGE_WIDE_FRAMES: ImageFrame[] = [{ ratio: RATIO_SOURCE, label: '3:2', where: 'sayfa kahramanı' }];
const ILLUSTRATION_FRAMES: ImageFrame[] = [{ ratio: RATIO_ILLUSTRATION, label: '13:10', where: 'çizim alanı' }];

/** Görselin ait olduğu nesne — kaynak oranını ve türev çerçeveleri belirler (envanter O15 tablosu). */
export const ImageRoleEnum = z.enum([
  'product',
  'gallery',
  'category',
  'package',
  'collection',
  'banner',
  'page_wide',
  'illustration',
]);
export type ImageRole = z.infer<typeof ImageRoleEnum>;

interface ImageRoleSpec {
  /** Ana (kaynak) çerçevenin oranı — kırpma editörü bu oranda gösterir. */
  ratio: number;
  /** Operatöre gösterilen oran etiketi. */
  label: string;
  /** İdeal kaynak çözünürlüğü (altındaysa uyarı — RED DEĞİL). */
  minWidth: number;
  minHeight: number;
  /** Bu kaynaktan türeyen çerçeveler — kırpma editöründe canlı önizlenir. */
  frames: ImageFrame[];
}

const OBJECT_SPEC: ImageRoleSpec = { ratio: RATIO_SOURCE, label: '3:2', minWidth: 2000, minHeight: 1333, frames: OBJECT_FRAMES };
const BAND_SPEC: ImageRoleSpec = { ratio: RATIO_BAND, label: '16:9', minWidth: 2400, minHeight: 1350, frames: BAND_FRAMES };
// Kaynak beklentisi kapakla aynı, yalnız türev çerçevesi tek → OBJECT_SPEC'ten türer, kopyalanmaz.
const GALLERY_SPEC: ImageRoleSpec = { ...OBJECT_SPEC, frames: GALLERY_FRAMES };

export const IMAGE_ROLES: Record<ImageRole, ImageRoleSpec> = {
  product: OBJECT_SPEC,
  gallery: GALLERY_SPEC,
  category: OBJECT_SPEC,
  package: OBJECT_SPEC,
  collection: BAND_SPEC,
  // Sayfa kahramanı bantla AYNI kaynağı ister, yalnız türev çerçevesi tek → BAND_SPEC'ten türer.
  banner: { ...BAND_SPEC, frames: PAGE_BAND_FRAMES },
  page_wide: { ...OBJECT_SPEC, frames: PAGE_WIDE_FRAMES },
  // Çizim daha küçük bir alanda duruyor; ideal kaynak da o yüzden daha mütevazı — 2000 px istemek
  // operatöre karşılığı olmayan bir uyarı gösterirdi.
  illustration: { ratio: RATIO_ILLUSTRATION, label: '13:10', minWidth: 1200, minHeight: 920, frames: ILLUSTRATION_FRAMES },
};

/** Kapak + galeride tutulabilecek EN ÇOK fotoğraf sayısı (parametrik — tek yerden değişir). */
export const PRODUCT_GALLERY_MAX = 5;

/**
 * Kategori fotoğraf havuzunun tavanı (05.23) — ürününkinden AYRI sabit ve sayısı da farklı.
 *
 * Ayrı olmasının sebebi iki listenin farklı soruya cevap vermesi: ürün galerisi müşteriye TOPLU
 * gösterilir (detay sayfasında hepsi yan yana), yani sayı arttıkça ekran uzar. Kategori havuzu
 * gösterilmez — kart tek kare çizer ve o kare GÜNE göre seçilir, yani havuz genişledikçe aynı
 * fotoğrafın tekrarı gecikir. **7 = bir hafta**: haftanın her günü başka bir kare, tekrar ancak
 * sekizinci günde. Tek sabitle yönetilseydi birinin gerekçesi ötekini kısıtlardı.
 */
export const CATEGORY_GALLERY_MAX = 7;

// ── Yükleme (yalnız kullanılamaz dosyayı ele: biçim + tavan). Oran/yön KIRPMAYLA çözülür ────────
/** Kabul edilen biçimler — animasyon/vektör dışı yaygın raster. Şeffaflık kırpma sonrası önemsiz. */
export const IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Dosya seçicinin `accept` değeri — biçim listesiyle TEK KAYNAK. */
export const IMAGE_ACCEPT_ATTR = IMAGE_ACCEPTED_TYPES.join(',');

/**
 * Yükleme tavanı — **parametrik**, tek yerden değişir (05.7).
 *
 * **8 MB seçildi ve sayı keyfî değil: Next'in Server Action gövde sınırının ALTINDA olmak zorunda**
 * (`apps/web/next.config.ts` → `serverActions.bodySizeLimit: '10mb'`). Tavan o sınırın üstünde
 * olsaydı kural okunur bir cümle üretemezdi: dosya bizim kapımıza hiç ulaşmaz, istek Next tarafında
 * kesilir ve operatör "Görsel en çok N MB olabilir" yerine anlamsız bir ağ hatası görürdü — yani
 * yazılı kural bir daha asla çalışmazdı. İkisinden biri değişirse öteki de gözden geçirilmeli;
 * bağıntı iki dosyanın künyesinde de yazılı.
 *
 * 8 MB gerçek kaynakları rahat alır (24 MP telefon/DSLR JPEG'i ~8 MB'ın altında, 2400 px PNG ~5 MB)
 * ve asıl işini yapar: yanlışlıkla seçilmiş bir video ya da tarama arşivi depoya girmez.
 */
export const IMAGE_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Yüklenen dosyanın kapıda ölçülebilen künyesi — çözünürlük GEREKMEZ, çözmeden bilinemez. */
export interface UploadedImageInfo {
  type: string;
  size: number;
}

/**
 * **Yükleme kapısının kuralı** — R2'ye yazan her eylem buradan geçer (`apps/web/lib/media/upload.ts`).
 * Uygunsa `null`, değilse operatöre gösterilecek cümle.
 *
 * **Çözünürlüğe BAKMAZ ve bakamaz:** genişlik/yükseklik ancak dosyayı çözerek öğrenilir, sunucuda
 * çözücü yok. Kalite sorusunun yeri zaten burası değil — kırpma editörü `sourceAdvisory` ile
 * UYARIR, reddetmez (operatör kadrajı görüp karar verir). Burada yalnız **kullanılamaz** dosya
 * elenir: okuyamayacağımız biçim, ve taşıyamayacağımız boy.
 *
 * **Boş dosya BURADA elenmez** — onu `readImageUpload` "dosya bulunamadı" diye ele alır, çünkü
 * sıfır baytlık bir `File` bir boyut ihlali değil, seçimin hiç yapılmamış olmasıdır.
 */
export function validateImageUpload(file: UploadedImageInfo): string | null {
  if (!IMAGE_ACCEPTED_TYPES.includes(file.type as (typeof IMAGE_ACCEPTED_TYPES)[number])) {
    return 'Yalnız JPEG, PNG veya WebP yüklenebilir.';
  }
  if (file.size > IMAGE_MAX_UPLOAD_BYTES) {
    return `Görsel en çok ${Math.round(IMAGE_MAX_UPLOAD_BYTES / (1024 * 1024))} MB olabilir.`;
  }
  return null;
}

export interface SourceImageInfo {
  width: number;
  height: number;
  type: string;
}

/**
 * Kırpma sonrası kalite/kadraj UYARISI (RED değil). Operatör görür, karar verir:
 *  - kaynak dikey/kare → yatay banda kırpınca çözünürlük düşebilir
 *  - kaynak oranı ana çerçeveden çok sapıyorsa kayıp yüzdesi yazılır
 * Sorun yoksa `null`.
 */
export function sourceAdvisory(role: ImageRole, info: SourceImageInfo, zoom = IMAGE_ZOOM_MIN): string | null {
  const spec = IMAGE_ROLES[role];
  const ratio = info.width / info.height;
  // Ana çerçeveye `cover` + zoom ile oturttuğumuzda görünen kaynak bölgesinin kısa kenarı (px).
  const shownShort = shownSourceShortSide(spec.ratio, info, zoom);
  if (shownShort < Math.min(spec.minWidth, spec.minHeight)) {
    return `Kırpılan alan düşük çözünürlükte (~${Math.round(shownShort)} px kısa kenar) — büyük ekranda bulanık görünebilir. İdeal kaynak ${spec.minWidth}×${spec.minHeight}.`;
  }
  const loss = cropLossPercent(ratio, spec.ratio);
  if (loss >= 25) {
    return `Kaynak oranı ${formatRatio(ratio)}; ${spec.label} çerçeveye oturunca ~%${loss}'i kırpılır. Odak ve zoom ile doğru bölgeyi seçtiğinden emin ol.`;
  }
  return null;
}

/** Ana çerçeveye `cover` + zoom ile oturunca görünen kaynak bölgesinin kısa kenarı (px). */
function shownSourceShortSide(frameRatio: number, info: SourceImageInfo, zoom: number): number {
  const ratio = info.width / info.height;
  const z = zoom / 100;
  // cover: kaynak oranı çerçeveden genişse yükseklik sınırlar, dar ise genişlik sınırlar.
  const shortPx = ratio >= frameRatio ? info.height : info.width;
  return shortPx / z;
}

/** "1,73:1" gibi okunur oran metni (operatöre gösterilir). */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace('.', ',')}:1`;
}

/** `cover` ile bir çerçeveye oturarken kaynağın kaybolan yüzdesi (denetim şeridi "kayıp %"). */
export function cropLossPercent(sourceRatio: number, frameRatio: number): number {
  const lo = Math.min(sourceRatio, frameRatio);
  const hi = Math.max(sourceRatio, frameRatio);
  return Math.round((1 - lo / hi) * 100);
}

// ── Varlık alanları ──────────────────────────────────────────────────────────────────────────
/**
 * Görsel taşıyan her varlığın ortak alanları — entity şemaları bunu `.merge()` ile alır, alanları
 * yeniden yazmaz (no-duplication). `imageAlt` müşteri yüzeyinde görünen erişilebilirlik/SEO metni
 * olduğu için çok dillidir; kart görseli için zorunluluk form seviyesinde denetlenir.
 */
export const ImageMetaSchema = z.object({
  imageKey: z.string().nullable(),
  imageFocalX: z.number().int().min(0).max(100),
  imageFocalY: z.number().int().min(0).max(100),
  imageZoom: z.number().int().min(IMAGE_ZOOM_MIN).max(IMAGE_ZOOM_MAX),
  imageAlt: LocalizedTextDraftSchema.nullable(),
  /**
   * Görsel DOSYASININ son değişme anı — okuma URL'inin sürüm damgası (`?v=…`). Anahtar deterministik
   * olduğu için (aynı slug → aynı obje, üzerine yazılır) dosya değişse de URL değişmez; public
   * `immutable` cache bunu bir yıl eski gösterir. Damga o cache'i kırar. Kırpma (odak/zoom) dosyayı
   * DEĞİŞTİRMEZ — CSS'te uygulanır — bu yüzden damga yalnız yükleme akışında yazılır.
   */
  imageUpdatedAt: z.string().nullable(),
});
export type ImageMeta = z.infer<typeof ImageMetaSchema>;

/** Insert tarafı: anahtar/odak/zoom/alt hepsi DB default'lu ya da nullable → opsiyonel. */
export const ImageMetaInsertSchema = ImageMetaSchema.partial();

/**
 * DÜZENLENEBİLİR kırpma alanları — dosyanın kendisi (imageKey) ve alt metin AYRI akışlardadır; form,
 * action ve servis katmanları görsel künyesinden yalnız BUNLARI taşır. TEK KAYNAK: `imageFocalX/Y/Zoom`
 * hiçbir form şemasında, action/servis girdisinde elle yazılmaz — bu şema `.merge()` ile enjekte edilir.
 */
export const ImageCropFieldsSchema = ImageMetaSchema.pick({ imageFocalX: true, imageFocalY: true, imageZoom: true });
export type ImageCropFields = z.infer<typeof ImageCropFieldsSchema>;

/** Yeni nesnenin varsayılan kırpması (merkez, zoom yok) — form defaultları bunu SPREAD eder. */
export const DEFAULT_CROP_FIELDS: ImageCropFields = { imageFocalX: 50, imageFocalY: 50, imageZoom: IMAGE_ZOOM_MIN };

const IMAGE_CROP_KEYS = ['imageFocalX', 'imageFocalY', 'imageZoom'] as const;

/** Bir varlıktan yalnız kırpma alanlarını seçer — form/action geçişlerinde tek satırla taşınır. */
export function pickCropFields(e: ImageCropFields): ImageCropFields {
  return { imageFocalX: e.imageFocalX, imageFocalY: e.imageFocalY, imageZoom: e.imageZoom };
}

/**
 * KISMİ kırpma künyesi — tanımsız alanlar atlanır. Action→servis geçişinde kullanılır ("yalnız
 * verilen alan yazılır" sözleşmesi): girdinin adı/üyeliği gibi kolon-olmayan alanları taşımaz.
 */
export function pickCropFieldsPartial(e: Partial<ImageCropFields>): Partial<ImageCropFields> {
  const out: Partial<ImageCropFields> = {};
  for (const k of IMAGE_CROP_KEYS) {
    if (e[k] !== undefined) out[k] = e[k];
  }
  return out;
}

/**
 * TÜM görsel künyesini (dosya + kırpma + alt + damga) tek parça taşır. Kapak ile galeri fotoğrafının
 * yerini değiştirirken (`makeCover`) künye bir bütün olarak el değiştirmeli — alan alan kopyalamak
 * hem tekrar hem de "birini unutma" hatasıdır.
 */
export function pickImageMeta(e: ImageMeta): ImageMeta {
  return {
    imageKey: e.imageKey,
    imageFocalX: e.imageFocalX,
    imageFocalY: e.imageFocalY,
    imageZoom: e.imageZoom,
    imageAlt: e.imageAlt,
    imageUpdatedAt: e.imageUpdatedAt,
  };
}

/** Kırpma alanlarını (flat) bileşenin beklediği {x,y,zoom} biçimine indirger. */
export function cropOf(e: ImageCropFields): ImageCrop {
  return { x: e.imageFocalX, y: e.imageFocalY, zoom: e.imageZoom };
}

// ── Galeri satırı: bir varlığa asılı ÇOK fotoğraf ────────────────────────────────────────────
/**
 * Kendi satırında duran fotoğrafın ortak gövdesi — `product_image` ve `category_image` (05.23)
 * bunu `.extend()` ile alır ve yalnız **hangi varlığa asıldığını** ekler.
 *
 * Ortaklaştırıldı çünkü ikisi aynı işi yapıyor: dosya + kırpma künyesi + sıra. Ayrı yazılsalardı
 * bir gün birine eklenen alan ötekinde eksik kalırdı ve fark ancak müşteri ekranında görünürdü —
 * kırpması olan ama alt metni olmayan bir galeri gibi.
 *
 * `imageKey` burada ZORUNLU: ortak `ImageMetaSchema`'da nullable, çünkü orada "henüz görseli olmayan
 * ürün" meşru bir durum. Galeride değil — dosyası olmayan galeri satırı diye bir şey yok.
 */
export const GalleryImageSchema = z
  .object({
    id: z.string().uuid(),
    sortOrder: z.number().int(),
    createdAt: z.string(),
  })
  .merge(ImageMetaSchema)
  .extend({ imageKey: z.string() });
export type GalleryImage = z.infer<typeof GalleryImageSchema>;
