'use client';

import { useState } from 'react';
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
  reviews: ReviewsData;
}

export function ProductClient({ t, locale, product, device, reviews }: ProductClientProps) {
  const resolved = useDevice(device);
  /* Açılış boyu sunucudan gelir (`primaryVariantId`, fiyatı olan en ucuz boy): kart o boyun fiyatını gösteriyor ve detay başka
     boyla açılırsa müşteri gördüğü fiyatı bulamaz. Alan `null` ise (fiyatlı boy yok) sıranın ilkine düşülür. */
  const [selectedId, setSelectedId] = useState(() => product.primaryVariantId ?? product.variants[0]?.id ?? '');
  const selected = product.variants.find((v) => v.id === selectedId) ?? product.variants[0] ?? null;

  // Aile bağlamı burada türetilir, iki görünümde ayrı ayrı değil: ikisi aynı iki cevabı istiyor ve iki yerde hesaplansaydı biri
  // değişince öteki sessizce eski kuralla kalırdı.
  const familyLabel = product.family.find((m) => m.isCurrent)?.label ?? null;
  const unavailable = isProductUnavailable(product.variants);

  const view = { t, locale, product, selected, onSelect: setSelectedId, familyLabel, unavailable, reviews };
  return resolved === 'mobile' ? <ProductMobile {...view} /> : <ProductDesktop {...view} />;
}
