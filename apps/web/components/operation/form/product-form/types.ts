import type { ReactNode } from 'react';

// Ürün formunun sunum sözleşmesi kendi dosyasındadır: kap (ürün diyaloğu, asistan kuyruğu) düzenleri, düzenler de bu tipi okur ve tip
// kapta kalsa döngüsel bağımlılık olurdu.

/** Form sekmeleri; uzun form tek kolonda duvara döndüğü için ikiye bölünür. */
export type ProductFormTab = 'product' | 'declaration';

/** Kurulmuş alan elemanları; sunum düzenleri bunları yalnız yerleştirir. Çok dilli içerik tek dil kartındadır (`content`). */
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
  /** Öteki ülkelerin KDV oranları; formun şemasında değil, ürün ekranının verdiği slottur (kuyrukta `null`). */
  countryVat: ReactNode;
  dateType: ReactNode;
  shelfLife: ReactNode;
  allergens: ReactNode;
  variants: ReactNode;
  shippable: ReactNode;
  /** Saklama rejimi, soğuk zincirin kendisi; kargo izninin yanında ama ondan ayrı. */
  storage: ReactNode;
  autoPrice: ReactNode;
  margin: ReactNode;
}

// Satış durumu bu sözleşmede yoktur: kuyruk ürünün içeriğini yazar, satış eksenine dokunmaz. Seçici ürün ekranının alt barındadır ve
// paket bağını aynı satırda gösterir.
