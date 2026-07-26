'use client';

import { resolveLocalizedText } from '@lezzet/types';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { ImageUploadButton } from './image-upload-button';
import type { ProductView } from '../../products-types';

// Ürün formu görsel bloğu: büyük önizleme (Thumbnail fluid → sütunu doldurur). Düzenlemede "Görseli
// değiştir" yalnız HOVER'da resmin üzerinde koyu örtüyle belirir (hep durmaz). Yeni üründe
// (product=null) henüz kayıt yok → yükleme sonraki adım (R2 anahtarı slug'a bağlı) → placeholder.

export function ProductImageField({ product }: { product: ProductView | null }) {
  if (!product) {
    return (
      <div className="flex flex-col gap-2.5">
        <Thumbnail src={null} alt="" fluid iconSize={48} />
        <span className="font-ops-body text-[11px] leading-[1.5] text-ops-faint">
          Ürünü kaydedince görsel eklenebilir — R2 anahtarı slug&apos;a bağlı.
        </span>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-[10px]">
      <Thumbnail src={product.imageUrl} alt={resolveLocalizedText(product.name)} fluid iconSize={48} />
      {/* Örtü buton: normalde şeffaf, hover'da koyu örtü + yazı belirir; tıklama dosya seçtirir. */}
      <ImageUploadButton
        productId={product.id}
        className="absolute inset-0 flex cursor-pointer items-center justify-center bg-[rgba(30,33,27,0)] font-ops-display text-[12.5px] font-semibold text-transparent transition-colors duration-150 group-hover:bg-[rgba(30,33,27,0.5)] group-hover:text-white"
      >
        {product.imageUrl ? 'Görseli değiştir' : 'Görsel yükle'}
      </ImageUploadButton>
    </div>
  );
}
