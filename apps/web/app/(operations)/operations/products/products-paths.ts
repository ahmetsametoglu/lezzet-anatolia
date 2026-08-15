/** Bu ekranın rotası — tüm sekme action'ları revalidatePath için bunu kullanır (tek kaynak). */
export const PRODUCTS_PATH = '/operations/products';

// Sekme kimlikleri TEK KAYNAK: tip bu listeden TÜRETİLİR (elle union yazılmaz) ve aynı liste URL
// parametresini doğrulamak için çalışma anında da kullanılır (`?tab=` → yenilemede doğru sekme).
// Rota sabitiyle birlikte durur: ikisi de bu ekranın ADRES sözleşmesidir (view-model değil).
// `families` BEŞİNCİ sekme (kullanıcı kararı 04.08): aile bir ürün özelliği değil, ürünlerin
// üstünde bir KÜME — kurulacağı, adlandırılacağı ve üyelerinin sıralanacağı bir yer ister. Sıra
// ailenin bütününe ait bir karardır; tek bir üyenin diyaloğundan verilseydi o diyalog kardeşlerinin
// listesiyle şişer ve aynı karar iki yerden verilebilir olurdu.
export const PRODUCT_TABS = ['products', 'categories', 'collections', 'packages', 'families'] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

// Sekme ADLARI kimliklerin yanında (15.08): önceden `products.desktop.tsx` içindeydi ve o dosya
// `'use client'` — sunucuda çizilen `loading.tsx` oradan veri alamaz. Sonuç ölçülmüştü: iskelet
// 4 çubuk çiziyordu, gerçek çubukta 5 sekme vardı ("Aileler" eklenince iskelet güncellenmemişti)
// ve içerik gelince bar genişliyordu. Ad ile kimlik aynı dosyada durunca sekme eklemek ikisini
// birden günceller; desktop da loading de buradan okur.
export const PRODUCT_TAB_LABEL: Record<ProductTab, string> = {
  products: 'Ürünler',
  categories: 'Kategoriler',
  collections: 'Koleksiyonlar',
  packages: 'Paketler',
  families: 'Aileler',
};
