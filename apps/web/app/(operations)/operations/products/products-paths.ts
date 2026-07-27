/** Bu ekranın rotası — tüm sekme action'ları revalidatePath için bunu kullanır (tek kaynak). */
export const PRODUCTS_PATH = '/operations/products';

// Sekme kimlikleri TEK KAYNAK: tip bu listeden TÜRETİLİR (elle union yazılmaz) ve aynı liste URL
// parametresini doğrulamak için çalışma anında da kullanılır (`?tab=` → yenilemede doğru sekme).
// Rota sabitiyle birlikte durur: ikisi de bu ekranın ADRES sözleşmesidir (view-model değil).
export const PRODUCT_TABS = ['products', 'categories', 'collections', 'packages'] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];
