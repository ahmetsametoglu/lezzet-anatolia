import { z } from 'zod';
import { FRAME_RATIOS, frameKeyForRatio, type FrameKey } from './image.schema';

// ── CDN ÇERÇEVE KAYNAKLARI: ŞEKİL VE SEÇİM — web · native · sunucu TEK kapıdan (05.37 · 21.303) ──────
//
// Kadrajın MATEMATİĞİ (`cropTrim`, `FRAME_RATIOS`, `IMAGE_WIDTHS`, `frameKeyForRatio`) `image.schema.ts`te
// duruyor; bu dosya o matematiğin ürettiği adres kümesinin ŞEKLİNİ ve bir kutu için içinden SEÇİMİ tutar.
// İki soru ayrı olduğu için iki dosya: "kadraj nasıl kesilir" ile "kesilmiş türevlerden hangisi bu kutuya
// gider".
//
// Seçim bugün yalnız native'de KODLA yapılıyor — web'de tarayıcı `srcset` + `sizes` ile kendisi seçer
// (`apps/web/components/media/framed-image.tsx`). Yine de kural BURADA durur, uygulamanın içinde değil:
// girdileri (çerçeve kümesi, merdiven, `srcSet` biçimi) buradaki tiplerle tanımlı, çerçeveyi seçen
// fonksiyon (`frameKeyForRatio`) web'in kullandığının AYNISI. Native'e ikinci bir seçim mantığı yazılsaydı
// iki yüzey aynı görseli bir gün farklı çerçeveden çekerdi (kullanıcı kararı 10.09: "merkezi kütüphane,
// web ile kod tekrarı yok").

/** Bir çerçevenin CDN kaynakları — `src` tek adres, `srcSet` merdivenin tamamı (`url Nw, url Nw`). */
const ImageFrameSourceSchema = z.object({ src: z.string(), srcSet: z.string() });
export type ImageFrameSource = z.infer<typeof ImageFrameSourceSchema>;

/**
 * Çerçeve başına kaynaklar. Anahtar kümesi `FRAME_RATIOS`tan TÜRER: çerçeve eklenince şema da onu ister,
 * elle yazılmış ikinci bir liste yok. Sunucu (`frameSourcesOf`) ve native sözleşmesi (`CatalogImageSchema`)
 * bu tek şekli taşır.
 */
export const ImageFrameSourcesSchema = z.object(
  Object.fromEntries((Object.keys(FRAME_RATIOS) as FrameKey[]).map((key) => [key, ImageFrameSourceSchema])) as Record<
    FrameKey,
    typeof ImageFrameSourceSchema
  >,
);
export type ImageFrameSources = z.infer<typeof ImageFrameSourcesSchema>;

/** `srcSet` girdisi — adres ve basamak genişliği (px). */
export interface SrcSetEntry {
  url: string;
  width: number;
}

/**
 * **`srcSet` biçiminin tek tanımı** — `url Nw, url Nw`. Web `<img srcset>` onu doğrudan okur; native
 * `frameUrlFor` aynı biçimi geri açar. Ayraç `, ` (virgül + boşluk): CDN adresinin kendisi virgül içerir
 * (`width=200,fit=scale-down`) ama boşluk içermez, yani ayraç adresin içinde hiç doğmaz — RN'in kendi
 * `srcSet` ayrıştırıcısı da aynı ayracı kullanıyor (`Libraries/Image/ImageSourceUtils.js`).
 */
export function srcSetOf(entries: readonly SrcSetEntry[]): string {
  return entries.map((entry) => `${entry.url} ${entry.width}w`).join(', ');
}

/** `srcSetOf`un tersi, artan genişlikte. Biçimi tanınmayan parça ELENİR — tahminle genişlik uydurulmaz. */
function srcSetEntries(srcSet: string): SrcSetEntry[] {
  return srcSet
    .split(', ')
    .map((part) => {
      const at = part.lastIndexOf(' ');
      const width = at > 0 ? /^(\d+)w$/.exec(part.slice(at + 1)) : null;
      return width ? { url: part.slice(0, at), width: Number(width[1]) } : null;
    })
    .filter((entry): entry is SrcSetEntry => entry !== null)
    .sort((a, b) => a.width - b.width);
}

/** Görselin çizileceği kutu — ekran birimiyle (RN dp · CSS px). */
export interface FrameBox {
  width: number;
  height: number;
}

/**
 * Bir kutuya giden adres. Çerçeve kutunun ORANINDAN seçilir (en yakın adlı çerçeve — web `FramedImage`in
 * aynı `frameKeyForRatio`su), basamak kutunun BOYUNDAN:
 *
 * · Türev çerçevenin oranında gelir; kutuyu `cover` ile doldurmak için gereken görsel genişliği
 *   `max(kutu genişliği, kutu yüksekliği × çerçeve oranı) × scale` — kutu çerçeveden genişse genişlik,
 *   darsa yükseklik bağlar.
 * · Merdivenden gerekeni karşılayan EN KÜÇÜK basamak alınır; hiçbiri yetmiyorsa en büyüğü. **Asla aşağı
 *   yuvarlanmaz** (kullanıcı kararı 10.09): aşağı basamak kutuda büyütülür ve bulanık görünür. Yakın bir
 *   üst basamak zaten varsa YENİ ölçü istenmez — farklı cihazlar aynı merdivene oturur, aynı dönüşümü
 *   paylaşır.
 *
 * `scale` ekranın piksel oranı — çağıranın ortamından gelir (RN `PixelRatio.get()`); burada okunmaz ki
 * fonksiyon saf kalsın ve iki platformda aynı sonucu versin.
 *
 * `frames` yoksa (CDN yok ya da kaynak ölçüsü bilinmiyor) → özgün `url`: çağıran kutuya `cover` ile
 * oturtur, kadraj merkezde kalır. Alanın hiç GELMEDİĞİ hâl de (`undefined` — alanı tanımayan eski bir
 * cevap) aynı yedeğe düşer; yoksa ilk erişimde çökerdi. Kutu henüz ölçülmediyse (`0`) → `null`: yanlış
 * basamak istemektense ölçümü beklemek ucuz.
 */
export function frameUrlFor(image: { url: string | null; frames: ImageFrameSources | null }, box: FrameBox, scale: number): string | null {
  if (!image.frames) return image.url;
  if (!(box.width > 0) || !(box.height > 0)) return null;
  const key = frameKeyForRatio(box.width / box.height);
  const source = image.frames[key];
  const required = Math.ceil(Math.max(box.width, box.height * FRAME_RATIOS[key]) * scale);
  const steps = srcSetEntries(source.srcSet);
  return (steps.find((step) => step.width >= required) ?? steps[steps.length - 1])?.url ?? source.src;
}
