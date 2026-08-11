import type { ReactNode } from 'react';

// Ürün formunun sunum sözleşmesi. Kendi dosyasında: kap (ürün diyaloğu · asistan kuyruğu) düzenleri
// import eder, düzenler de bu tipi — tip kapta kalsa döngüsel bağımlılık olurdu (no-circular).
//
// GALERİ TİPİ BURADA DEĞİL (22.14): `ProductPhotoView` bir tur bu dosyadaydı, ama form ortak
// komponente taşınırken geride kaldı — galeri formun alanı değil, kabın verdiği bir slot ve canlı
// yazıyor. Tipi de onu kullananların yanında durur (`photos-types`).

/**
 * Kurulmuş alan elemanları — sunum düzenleri bunları yalnız YERLEŞTİRİR (tek kaynak).
 * Çok dilli içerik tek dil kartında (`content`).
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
  /** Ad + açıklama tek dil kartında (dil sekmesi kartın başlığında). */
  content: ReactNode;
  category: ReactNode;
  vat: ReactNode;
  dateType: ReactNode;
  shelfLife: ReactNode;
  allergens: ReactNode;
  variants: ReactNode;
  shippable: ReactNode;
  autoPrice: ReactNode;
  margin: ReactNode;
}
