import type { ProductImage } from '@lezzet/types';
import type { ReactNode } from 'react';

// Ürün formunun sunum sözleşmesi. Kendi dosyasında: kabı (product-form-dialog) düzenleri import eder,
// düzenler de bu tipi — tip dialogda kalsa döngüsel bağımlılık olurdu (depcruise no-circular).

/**
 * Galeri fotoğrafının form/görünüm hâli — varlıktan TÜRER, alanları yeniden yazılmaz. Tek ek:
 * çözülmüş okuma URL'i (`imageKey` ham anahtar; adres sunucuda kurulur).
 */
export type ProductPhotoView = ProductImage & { imageUrl: string | null };

/**
 * Kurulmuş alan elemanları — .desktop/.mobile sunumları bunları yalnız YERLEŞTİRİR (tek kaynak).
 * Her sunum kendi alt kümesini kullanır: çok dilli içerik web'de tek dil kartında (`content`), mobilde
 * ayrı bölümlerde (`name` + `description`); `priceNote` yalnız mobilde.
 */
/** Form sekmeleri — uzun form tek kolonda duvara döndüğü için ikiye bölündü (05.10). */
export type ProductFormTab = 'product' | 'declaration';

export interface ProductFormFields {
  image: ReactNode;
  /** Yasal beyan (INCO) alanları — kendi sekmesinde. */
  nutrition: ReactNode;
  traces: ReactNode;
  /** İçindekiler + saklama TEK dil kartında: ikisi de çok dilli, dil bir kez seçilir (ad/açıklama gibi). */
  declarationTexts: ReactNode;
  /** Web: ad + açıklama tek dil kartında (dil sekmesi kartın başlığında). */
  content: ReactNode;
  /** Mobil: ad ve açıklama ayrı bölümlerde, her biri kendi dil sekmesiyle. */
  name: ReactNode;
  category: ReactNode;
  vat: ReactNode;
  dateType: ReactNode;
  shelfLife: ReactNode;
  description: ReactNode;
  allergens: ReactNode;
  variants: ReactNode;
  shippable: ReactNode;
  autoPrice: ReactNode;
  margin: ReactNode;
  priceNote: ReactNode;
}
