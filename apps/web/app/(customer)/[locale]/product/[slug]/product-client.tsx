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
  /**
   * Varsayılan: EN UCUZ boy seçili (denetim talebi 09.08) — sıranın ilki DEĞİL. Kartın gösterdiği
   * fiyat en ucuz boyunki; detay başka bir boyu açarsa müşteri gördüğü fiyatı bulamaz.
   *
   * **Ölçüt artık SUNUCUDAN geliyor** (`primaryVariantId`, 10.08): ekran hesap yapmıyor, okuyor.
   * Bir gün kart ile detay ayrışamaz, çünkü ikisi de aynı alandan besleniyor — bu şeridin geçici
   * `cheapestVariantId`'si (09.08) silindi, beş testi de kuralın kendi tarafına (`map.test.ts`)
   * bırakıldı. Seçicideki SIRA değişmiyor: `variants` operatörün `sortOrder`'ında kalır.
   *
   * Yedek `variants[0]`: alan `null` dönerse (aktif boy yok) eski davranış geçerli — o hâlde zaten
   * seçilecek daha iyi bir boy yok.
   */
  const [selectedId, setSelectedId] = useState(() => product.primaryVariantId ?? product.variants[0]?.id ?? '');
  const selected = product.variants.find((v) => v.id === selectedId) ?? product.variants[0] ?? null;

  // Aile bağlamı BURADA türetilir, iki görünümde ayrı ayrı değil (05.15): ikisi de aynı iki cevabı
  // istiyor — hangi çeşide bakılıyor, ürün hiç alınabiliyor mu. Cihaz çatalı düzeni ikiye böler,
  // KURALI bölmez; iki yerde hesaplansaydı biri değişince öteki sessizce eski kuralla kalırdı.
  const familyLabel = product.family.find((m) => m.isCurrent)?.label ?? null;
  const unavailable = isProductUnavailable(product.variants);

  const view = { t, locale, product, selected, onSelect: setSelectedId, familyLabel, unavailable, reviews };
  return resolved === 'mobile' ? <ProductMobile {...view} /> : <ProductDesktop {...view} />;
}
