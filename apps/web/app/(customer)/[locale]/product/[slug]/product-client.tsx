'use client';

import { useState } from 'react';
import { openingVariantOf } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { StorefrontProductDetail } from '@lezzet/application';
import { isProductUnavailable } from './components/family-block';
import type { Messages, ReviewsData } from './product-types';
import { ProductDesktop } from './product.desktop';
import { ProductMobile } from './product.mobile';

/**
 * Ürün detayın cihaz çatalı ve seçili boyun sahibi: boy değişince satın alma panelinin dışında da iki yer değişir — başlıktaki
 * stok rozeti ve besin tablosundaki net ağırlık. Seçim panelde kalsaydı bu iki yer eski boya göre kalır, ekran kendi içinde çelişirdi.
 */
interface ProductClientProps {
  t: Messages;
  locale: Locale;
  product: StorefrontProductDetail;
  device: Device;
  /** Bağlantının istediği boy (paket kalemi); `null` = kartın boyu. */
  initialVariantId: string | null;
  reviews: ReviewsData;
}

export function ProductClient({ t, locale, product, device, initialVariantId, reviews }: ProductClientProps) {
  const resolved = useDevice(device);
  /* Açılış boyu ortak kuraldan: bağlantının istediği boy, yoksa sunucunun birincil boyu — kart o boyun fiyatını gösteriyor ve
     detay başka boyla açılırsa müşteri gördüğü fiyatı bulamaz. */
  const [selectedId, setSelectedId] = useState(
    () => openingVariantOf(product.variants, initialVariantId, product.primaryVariantId)?.id ?? '',
  );
  const selected = product.variants.find((v) => v.id === selectedId) ?? product.variants[0] ?? null;

  // Aile bağlamı burada türetilir, iki görünümde ayrı ayrı değil: ikisi aynı iki cevabı istiyor ve iki yerde hesaplansaydı biri
  // değişince öteki sessizce eski kuralla kalırdı.
  const familyLabel = product.family.find((m) => m.isCurrent)?.label ?? null;
  const unavailable = isProductUnavailable(product.variants);

  const view = { t, locale, product, selected, onSelect: setSelectedId, familyLabel, unavailable, reviews };
  return resolved === 'mobile' ? <ProductMobile {...view} /> : <ProductDesktop {...view} />;
}
