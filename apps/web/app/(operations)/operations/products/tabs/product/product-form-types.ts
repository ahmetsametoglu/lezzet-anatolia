import type { ReactNode } from 'react';

// Ürün formunun sunum sözleşmesi. Kendi dosyasında: kabı (product-form-dialog) düzenleri import eder,
// düzenler de bu tipi — tip dialogda kalsa döngüsel bağımlılık olurdu (depcruise no-circular).

/** Kurulmuş alan elemanları — .desktop/.mobile sunumları bunları yalnız YERLEŞTİRİR (tek kaynak). */
export interface ProductFormFields {
  image: ReactNode;
  name: ReactNode;
  category: ReactNode;
  vat: ReactNode;
  dateType: ReactNode;
  shelfLife: ReactNode;
  description: ReactNode;
  allergens: ReactNode;
  variants: ReactNode;
  shippable: ReactNode;
  isActive: ReactNode;
  autoPrice: ReactNode;
  margin: ReactNode;
  priceNote: ReactNode;
}
