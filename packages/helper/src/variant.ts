import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/size';
import type { CatalogSize } from '@lezzet/types';
import { formatNetQuantity } from './format';

type SizeCopy = LocalizedCopy<typeof messages>;

/**
 * Ürün sayfasının açılış boyu: bağlantının istediği boy (paketin kalemi) ürünün aktif boyları arasındaysa o, değilse kartın
 * fiyatını taşıyan birincil boy, o da yoksa sıranın ilki. İstenen boy satıştan kalkmışsa sayfa kırılmaz, kartın boyuna düşer.
 */
export function openingVariantOf<V extends { id: string }>(
  variants: readonly V[],
  requestedId: string | null,
  primaryId: string | null,
): V | undefined {
  return variants.find((v) => v.id === requestedId) ?? variants.find((v) => v.id === primaryId) ?? variants[0];
}

interface PortionWords {
  bare: string;
  withWeight: string;
  box: string;
  boxWithWeight: string;
}

/** Porsiyon türünün kelimesi: 12 dilimlik cheesecake "12 dilim" yazar, "12 adet" 12 pasta demek olurdu. */
function portionWordsOf(kind: CatalogSize['portionKind'], t: SizeCopy): PortionWords {
  if (kind === 'slice') return { bare: t.slices, withWeight: t.slicesOf, box: t.boxSlices, boxWithWeight: t.boxSlicesOf };
  if (kind === 'package') return { bare: t.packs, withWeight: t.packsOf, box: t.boxPacks, boxWithWeight: t.boxPacksOf };
  return { bare: t.pieces, withWeight: t.piecesOf, box: t.boxPieces, boxWithWeight: t.boxPiecesOf };
}

function netQuantityOf(size: Pick<CatalogSize, 'netQuantity' | 'netUnit'>, locale: Locale): string | null {
  return size.netQuantity === null || size.netUnit === null ? null : formatNetQuantity(size.netQuantity, size.netUnit, locale);
}

/**
 * Boyun ürün sayfasındaki adı: çoklu pakette adet önde, miktar yanında ("4 adet · 420 g"), tek parçada yalnız miktar ("135 g").
 * Saklı etiket (`4x105g`) kutunun dilidir ve yalnız ölçü yokken yazılır, çünkü vitrinde müşterinin sorusu kaç tane aldığıdır.
 */
export function variantNameOf(variant: CatalogSize & { label: string }, locale: Locale): string {
  const weight = netQuantityOf(variant, locale);
  if (variant.piecesCount !== null && variant.piecesCount > 1) {
    const words = portionWordsOf(variant.portionKind, messages[locale]);
    const n = String(variant.piecesCount);
    return weight === null ? words.bare.replace('{n}', n) : words.withWeight.replace('{n}', n).replace('{weight}', weight);
  }
  return weight ?? variant.label;
}

/** Adet ve türü eski sunucunun cevabında olmayabilir; yokluk "adet bilinmiyor" sayılır. */
type ContentSize = Pick<CatalogSize, 'netQuantity' | 'netUnit'> & Partial<Pick<CatalogSize, 'piecesCount' | 'portionKind'>>;

/**
 * Ürün sayfasının içerik satırı: çoklu pakette kutunun içi ("Kutuda 5 adet · toplam 350 g"), tek parçada net miktar ("Net ağırlık
 * 800 g", sıvıda hacim); ölçüsüz boyda `null`. Kutu açıkça söylenir, çünkü yalın "5 adet" beş kutu diye de okunur.
 */
export function contentLineOf(size: ContentSize, locale: Locale): string | null {
  const t = messages[locale];
  const weight = netQuantityOf(size, locale);
  const pieces = size.piecesCount ?? null;
  if (pieces !== null && pieces > 1) {
    const words = portionWordsOf(size.portionKind ?? null, t);
    const n = String(pieces);
    return weight === null ? words.box.replace('{n}', n) : words.boxWithWeight.replace('{n}', n).replace('{weight}', weight);
  }
  if (weight === null) return null;
  return (size.netUnit === 'ml' ? t.netVolume : t.netWeight).replace('{weight}', weight);
}

/** Kartta boyun miktarı: adet varsa adet ("4 adet", "12 dilim"), yoksa net miktar ("800 g", "1,25 kg"); ölçüsüz boyda `null`. */
export function sizeQuantityOf(size: CatalogSize, locale: Locale): string | null {
  if (size.piecesCount !== null && size.piecesCount > 1) {
    return portionWordsOf(size.portionKind, messages[locale]).bare.replace('{n}', String(size.piecesCount));
  }
  return netQuantityOf(size, locale);
}

/**
 * Boyların miktarı " · " ile ("750 ml · 5 L"), kartın fiyatı tek başına kaç tane alındığını söylemediği için. Bir boyun ölçüsü
 * yoksa ya da boylar gelmediyse `undefined`: eksik liste boy seçimini gizlerdi.
 */
export function sizesLabelOf(sizes: readonly CatalogSize[] | undefined, locale: Locale): string | undefined {
  const labels = sizes?.map((size) => sizeQuantityOf(size, locale));
  if (labels === undefined || labels.length === 0 || !labels.every((label): label is string => label !== null)) return undefined;
  return labels.join(' · ');
}

/** Katalog kartının ikinci satırı: boyların miktarı, o yoksa çok boyluda boy sayısı ("3 seçenek"). */
export function cardQuantityOf(
  product: { sizes?: readonly CatalogSize[]; variantCount: number },
  t: { options: string },
  locale: Locale,
): string | undefined {
  return (
    sizesLabelOf(product.sizes, locale) ?? (product.variantCount > 1 ? t.options.replace('{n}', String(product.variantCount)) : undefined)
  );
}
