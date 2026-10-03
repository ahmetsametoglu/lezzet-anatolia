'use client';

import { contentLineOf } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useProductPreview } from '@/lib/storefront/use-product-preview.hook';
import { PhoneProductHead } from './phone-product-head';

interface PhonePreviewTopProps {
  locale: Locale;
  /** Kart bilgisi yokken (bağlantıyla açılış) çizilen iskelet. */
  children: ReactNode;
}

/** Ürün sayfası yüklenirken üst bölüm: kartın bildiği varsa sayfanın kendi bileşeniyle, yoksa iskeletle çizilir. */
export function PhonePreviewTop({ locale, children }: PhonePreviewTopProps) {
  const { slug } = useParams<{ slug: string }>();
  const preview = useProductPreview(slug);
  if (preview === null) return children;
  // Kartın boyları fiyata göre sıralı, ilki kartın fiyatını taşıyan ve sayfanın açılacağı boy: satır veri gelince değişmez.
  const opening = preview.sizes?.[0];

  return (
    <PhoneProductHead
      locale={locale}
      productId={preview.id}
      name={preview.name}
      images={[preview.image]}
      selling={preview}
      content={preview.sizes === undefined ? undefined : opening === undefined ? null : contentLineOf(opening, locale)}
      // Filigran veriyle gelir: kartın stok hâli bütün boyların toplamı, sayfanınki açılış boyunun; ikisi farklı cümle söyleyebilir.
      placeMark={null}
      categoryLabel={preview.categoryId === null ? null : undefined}
    />
  );
}
