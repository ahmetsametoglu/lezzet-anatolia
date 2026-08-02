import { PRODUCT_STATUS_LABELS, type ProductStatus } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import type { OpsTone } from '@/components/operation/ui/tone';

/**
 * Ürün durum rozeti — üç durumun TEK rozeti.
 *
 * İki kopyası vardı ve **aynı klasördeydi** (`product-preview` ↔ `product-tab.desktop`), üstelik
 * etiket sözlüğü üçüncü kez durum seçicisinde yazılıydı. Kopyalar ayrışmıştı: rozet "Aktif" derken
 * seçici "Satışta" diyordu — aynı ürün aynı ekranda iki ad taşıyordu.
 *
 * Etiket artık `packages/types`'ta (`PRODUCT_STATUS_LABELS`), enum'un yanında: yeni bir durum
 * eklenirse karşılığı yazılmadan derlenmez. Renk burada kalır — `OpsTone` bir arayüz sözlüğüdür,
 * `packages/types` onu bilmez ve bilmemeli.
 *
 * Ton, durum seçicisindeki hapla AYNI: "Aday" formda mavi, listedeki rozette de mavi.
 */
const TONE: Record<ProductStatus, OpsTone> = {
  active: 'olive',
  passive: 'neutral',
  candidate: 'blue',
};

interface StatusBadgeProps {
  status: ProductStatus;
  /** Liste satırında noktalı biçim (tablonun kendi dili); önizleme panelinde düz rozet. */
  dot?: boolean;
}

export function StatusBadge({ status, dot }: StatusBadgeProps) {
  return (
    <Badge tone={TONE[status]} dot={dot}>
      {PRODUCT_STATUS_LABELS[status]}
    </Badge>
  );
}
