'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { StorefrontProductDetail } from '@/lib/storefront/storefront-types';
import type { Messages, ReviewsData } from './product-types';
import { ProductDesktop } from './product.desktop';
import { ProductMobile } from './product.mobile';

/**
 * Ürün detayın cihaz çatalı ve SEÇİLİ VARYANTIN sahibi.
 *
 * Seçim neden burada: boy değişince yalnız satın alma paneli değil, sayfanın başka yerleri de
 * değişir — başlıktaki stok rozeti (seçilen boy tükenmişse "Stokta" yazamaz) ve besin tablosundaki
 * net ağırlık (beyan 100 g üzerinden sabittir, paketin ağırlığı boya göre değişir). Seçim panelin
 * içinde kalsaydı bu iki yer eski boya göre kalır, ekran kendi içinde çelişirdi.
 *
 * Adet seçimi panelde kalır: onu paylaşan başka bölüm yok.
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
  // Varsayılan: EN KÜÇÜK boy seçili (tasarım etkileşim sözleşmesi) — liste zaten sortOrder'da gelir.
  const [selectedId, setSelectedId] = useState(product.variants[0]?.id ?? '');
  const selected = product.variants.find((v) => v.id === selectedId) ?? product.variants[0] ?? null;

  const view = { t, locale, product, selected, onSelect: setSelectedId, reviews };
  return resolved === 'mobile' ? <ProductMobile {...view} /> : <ProductDesktop {...view} />;
}
