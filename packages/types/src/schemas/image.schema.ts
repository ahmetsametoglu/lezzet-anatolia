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
  { ratio: RATIO_SOURCE, label: '3:2', where: 'katalog kartı · detay' },
  { ratio: RATIO_SQUARE, label: '1:1', where: 'sepet · paket satırı' },
  { ratio: RATIO_SQUARE, label: '1:1', where: 'kategori dairesi', circle: true },
];

const BAND_FRAMES: ImageFrame[] = [{ ratio: RATIO_BAND, label: '16:9', where: 'vitrin bandı · paylaşım kartı' }];

/** Görselin ait olduğu nesne — kaynak oranını ve türev çerçeveleri belirler (envanter O15 tablosu). */
export const ImageRoleEnum = z.enum(['product', 'category', 'package', 'collection', 'banner']);
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

export const IMAGE_ROLES: Record<ImageRole, ImageRoleSpec> = {
  product: OBJECT_SPEC,
  category: OBJECT_SPEC,
  package: OBJECT_SPEC,
  collection: BAND_SPEC,
  banner: BAND_SPEC,
};

// ── Yükleme (yalnız kullanılamaz dosyayı ele: biçim). Oran/yön KIRPMAYLA çözülür ────────────────
/** Kabul edilen biçimler — animasyon/vektör dışı yaygın raster. Şeffaflık kırpma sonrası önemsiz. */
export const IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Dosya seçicinin `accept` değeri — biçim listesiyle TEK KAYNAK. */
export const IMAGE_ACCEPT_ATTR = IMAGE_ACCEPTED_TYPES.join(',');

export interface SourceImageInfo {
  width: number;
  height: number;
  type: string;
}

/** Yalnız gerçekten kullanılamaz dosya (yanlış biçim) reddedilir. Uygunsa `null`. */
export function validateSourceImage(info: SourceImageInfo): string | null {
  if (!IMAGE_ACCEPTED_TYPES.includes(info.type as (typeof IMAGE_ACCEPTED_TYPES)[number])) {
    return 'Yalnız JPEG, PNG veya WebP yüklenebilir.';
  }
  return null;
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
});
export type ImageMeta = z.infer<typeof ImageMetaSchema>;

/** Insert tarafı: anahtar/odak/zoom/alt hepsi DB default'lu ya da nullable → opsiyonel. */
export const ImageMetaInsertSchema = ImageMetaSchema.partial();

/** İki+bir kolonu bileşene verilen tek değere indirger — çağrı yerlerinde elle kurulmaz. */
export function cropOf(entity: Pick<ImageMeta, 'imageFocalX' | 'imageFocalY' | 'imageZoom'>): ImageCrop {
  return { x: entity.imageFocalX, y: entity.imageFocalY, zoom: entity.imageZoom };
}
