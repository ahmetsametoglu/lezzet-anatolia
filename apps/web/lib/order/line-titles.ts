import { ProductService, ProductVariantService, type serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';

/**
 * Sipariş kaleminin OPERASYON künyesi: varyant kimliği → "Fıstıklı Baklava · 1 kg".
 *
 * Neden ayrı dosya: `order_item` yalnız `variant_id` taşır, ürün adının anlık görüntüsünü TUTMAZ
 * (bilinçli — ürün yeniden adlandırılınca geçmiş siparişler de yeni adı gösterir). Yani adı ekrana
 * getirmek her seferinde varyant → ürün zincirini çözmek demek. Zinciri yalnız BAŞLIK için isteyen
 * çağıranlar bunu paylaşır; bugün sipariş özeti diyaloğu (`summary`), yarın elle sipariş girişi (09.8).
 *
 * **Sipariş DETAY okuması bunu kullanmaz** ve bu bilinçli: o okuma varyantları ve ürünleri kendi
 * başka haritaları için (boy alt etiketi, parti izi arama anahtarı) zaten çekiyor — yardımcıyı
 * çağırmak aynı iki sorguyu ikinci kez sormak olurdu. Ortaklaşan şey `titleOf` formatlayıcısıdır;
 * bu yardımcı YALNIZ başlık isteyen çağıran içindir.
 *
 * Müşteri yüzeyinin karşılığı AYRI ve öyle kalmalı (`lib/order/customer-lines`): orada ad seçili dile
 * göre çözülür ve görsel de gelir. Burada yüzey Türkçe, görsel gerekmiyor — birleştirmek operasyona
 * dil parametresi, müşteriye Türkçe varsayılan taşımak olurdu.
 *
 * İKİ tur atar, kalem sayısı kadar değil (N+1 yok): bir tur varyantlar, bir tur onların ürünleri.
 */
export async function readVariantTitles(
  db: ReturnType<typeof serviceDb>,
  variantIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return new Map();

  const variants = await new ProductVariantService(db).listByIds(ids);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productNames = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));

  // Ürünü silinmiş varyantta ad yerine "—": boş dize, başlık üretecinde ayracı da yutup okunmaz bir
  // etiket bırakırdı ("· 1 kg").
  return new Map(
    variants.map((v) => [v.id, titleOf(productNames.get(v.productId) ?? '—', resolveLocalizedText(v.label))]),
  );
}
