'use server';

import { KeysetCursorSchema, type KeysetCursor } from '@lezzet/types';
import { hasLocale } from 'next-intl';
import { getCatalogData, type StorefrontProduct } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { CATALOG_SORTS, type CatalogSort } from '@lezzet/types';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { routing } from '@/i18n/routing';
import type { CatalogFilters } from './catalog-types';

/**
 * Katalogun sonraki sayfası — sonsuz kaydırmanın sunucu ucu (08.10).
 *
 * Liste RSC'de ilk sayfayla gelir; müşteri aşağı kaydırdıkça bu action bir sonrakini EKLER. Guard
 * YOK: katalog herkese açıktır (operasyon action'larındaki `requireStaff` buraya taşınmaz), ama
 * girdilerin hepsi yine de doğrulanır — dışarıdan gelen her değer şüphelidir.
 *
 * Süzgeç neden URL'de, imleç neden değil: süzgeçli liste PAYLAŞILABİLİR olmalı (kategori + arama
 * adreste yaşar), ama "3. sayfa" diye bir adres yoktur — yenilemede müşteri baştan başlar. Sonsuz
 * kaydırmanın deseni budur; operasyon tarafı da aynı ayrımı yapar.
 */
interface CatalogPageResult {
  products: StorefrontProduct[];
  nextCursor: KeysetCursor | null;
}

/**
 * Sonraki sayfanın süzgeci — **`CatalogFilters`ten türer, elle yazılmaz** (03.08).
 *
 * Bir ara burada ayrı bir arayüz duruyordu ve `onlyShippable` alanı yoktu: ilk sayfa süzgeçliydi,
 * kaydırınca gelen sayfa süzgeçsiz. Müşteri "adresime gönderilebilir"i seçmiş olmasına rağmen
 * listeye gönderilemeyen ürünler karışıyordu. Türetilen tip bunu bir daha yaşatmaz — yeni bir
 * süzgeç `CatalogFilters`e eklendiği anda bu kapı da onu istemek zorunda kalır.
 *
 * `sort` gevşetiliyor (`string`): değer istemciden geliyor ve aşağıda doğrulanıyor; tipe güvenip
 * doğrulamayı atlamak, uydurma bir sıralamayla sorguyu bozmak demekti.
 */
type CatalogPageQuery = Omit<CatalogFilters, 'sort'> & { sort?: string; search?: string };

export async function loadMoreCatalogAction(locale: string, q: CatalogPageQuery, cursor: KeysetCursor): Promise<CustomerResult<CatalogPageResult>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    /**
     * İmleç ve sıralama client'tan geliyor → doğrulanır (uydurma değer sorguyu bozmasın).
     *
     * **`safeParse`, `parse` değil** (denetim H3 · 03.08): `parse` fırlatınca ZodError funnel'a
     * düşüyor ve alan adlarıyla çok satırlı dökümü **müşterinin ekranına** basılıyordu — hem iç
     * yapıyı sızdıran hem de kimsenin okuyamayacağı bir metin.
     *
     * Bozuk imleç zaten bir ARIZA değil, geçersiz bir istek: adres çubuğuyla oynanmış ya da bir
     * bağlantı eskimiş. Doğru cevap hata göstermek değil, listeyi baştan vermek — müşterinin
     * göreceği en anlamlı sonuç o. Sıralama da bir satır aşağıda tam olarak böyle davranıyordu;
     * imleç tek istisna kalmıştı.
     */
    const parsed = KeysetCursorSchema.safeParse(cursor);
    const safeCursor = parsed.success ? parsed.data : undefined;
    const sort: CatalogSort = CATALOG_SORTS.includes(q.sort as CatalogSort) ? (q.sort as CatalogSort) : 'featured';

    const data = await getCatalogData(serviceDb(), {
      locale,
      query: {
        categorySlug: q.category,
        // Koleksiyon da bir SÜZGEÇTİR ve sonraki sayfa onu taşımak zorunda: taşımasaydı müşteri
        // koleksiyon içinde kaydırırken liste sessizce tüm kataloğa açılırdı. `CatalogPageQuery`
        // `CatalogFilters`ten türediği için bu alanı geçirmemek derleme hatası DEĞİL — künyedeki
        // `onlyShippable` vakasının aynısı, o yüzden elle bağlanıyor.
        collectionSlug: q.collection,
        search: q.search,
        sort,
        onlyOffers: q.onlyOffers,
        onlyShippable: q.onlyShippable,
        cursor: safeCursor,
      },
      place: await readPlaceWarehouses(),
      viewer: await readPricingViewer(),
      // Sayfalama çağrısında fikstür GEREKMEZ: ilk boyama kategorileri zaten bastı, burası yalnız
      // ürün sayfası çeker.
    });
    return { data: { products: data.products, nextCursor: data.nextCursor }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
