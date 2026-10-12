import type { ProductVariant } from '@lezzet/types';
import type { StockWarehouseSplit } from '@/lib/stock/level-rows';
import type { VariantRowDetail } from '../../products-types';

// Kırılım hücrelerinin metinleri iki katlıdır (üstte asıl değer, altta ayrıntı), çünkü dar kolonda tek satır kesilir.

export function netParts(variant: ProductVariant): { net: string; portion: string | null } {
  const net = variant.netQuantity != null && variant.netUnit ? `${variant.netQuantity} ${variant.netUnit}` : '—';
  if (variant.piecesCount == null) return { net, portion: null };
  const word = variant.portionKind === 'slice' ? 'dilim' : variant.portionKind === 'package' ? 'paket' : 'adet';
  return { net, portion: `${variant.piecesCount} ${word}` };
}

/** Dört ölçüden biri eksikse `null`, çünkü eksik ölçüyle canlı kargo teklifi alınamaz ve ekran "ölçü yok" der. */
export function packedParts(variant: ProductVariant): { weight: string; size: string } | null {
  const { packedWeightG, packedLengthMm, packedWidthMm, packedHeightMm } = variant;
  if (packedWeightG == null || packedLengthMm == null || packedWidthMm == null || packedHeightMm == null) return null;
  return { weight: `${packedWeightG} g`, size: `${packedLengthMm}×${packedWidthMm}×${packedHeightMm}` };
}

/** Kodun ortası kısalır, bütün kodlar ipucunda durur; 13 haneli kod kolonu iki katına çıkarırdı. */
export function barcodeParts(barcodes: VariantRowDetail['barcodes']): { label: string; hint: string } | null {
  const [first, ...rest] = barcodes;
  if (!first) return null;
  const short = first.code.length > 8 ? `${first.code.slice(0, 3)}…${first.code.slice(-4)}` : first.code;
  return { label: rest.length > 0 ? `${short} +${rest.length}` : short, hint: barcodes.map((b) => b.code).join('\n') };
}

/** Hücrede toplam ve depo sayısı, ipucunda depo başına adet; ikisi aynı kırılımdan okunur ki toplam ile dağılım ayrışmasın. */
export function stockParts(
  availableQty: number,
  warehouses: readonly StockWarehouseSplit[],
): { total: number; note: string; hint: string | null } {
  if (warehouses.length === 0) return { total: availableQty, note: 'stok yok', hint: null };
  return {
    total: availableQty,
    note: `${warehouses.length} depo`,
    hint: warehouses.map((w) => `${w.code} · ${w.availableQty}`).join('\n'),
  };
}
