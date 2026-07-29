/**
 * Satılabilir birimin EKRANDA GÖRÜNEN adı: "Ürün · boy".
 *
 * Boy etiketi BOŞ olabilir (tek boylu üründe varsayılan varyantın etiketi boştur) — o zaman ayraç da
 * yazılmaz, yoksa her satır "Künefe · " diye biterdi.
 *
 * **Neden ortak:** aynı gövde fiyat ekranında ve stok ekranında ayrı ayrı yazılmıştı, sipariş detayı
 * da fiyat ekranının tip dosyasından çekiyordu (bir ekran ötekinin iç dosyasına bağımlıydı) ve ürün
 * okuması aynı kuralı satır içinde bir kez daha kuruyordu. Dört kopya, tek cümle: bir gün biri
 * ayracı değiştirir ve aynı kalem iki ekranda iki adla görünürdü.
 */
export function titleOf(productName: string, variantLabel: string): string {
  return variantLabel ? `${productName} · ${variantLabel}` : productName;
}
