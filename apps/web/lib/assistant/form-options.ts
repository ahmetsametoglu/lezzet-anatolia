import 'server-only';
import { AccountService, CategoryService, CollectionService, ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText } from '@lezzet/types';
import type { ProductFormSource } from '@/components/operation/form/product-form/schema';
import type { VariantOption } from '@/components/operation/form/bundle-form/types';
import { variantOptionsForVariants } from '@/lib/catalog/variant-options';

/**
 * KUYRUKTAKİ FORMLARIN SEÇENEK HAVUZU (22.10).
 *
 * ── NEDEN AYRI BİR OKUMA ────────────────────────────────────────────────────
 * Gövde artık gerçek bir form (indirim kuralı) ve formun `Select` kutuları seçenek ister: kapsam
 * kategorisi, koleksiyon. Bunlar önerinin payload'ında YOKTUR ve olmamalı da — dilekçe hedefin
 * KİMLİĞİNİ taşır, kataloğun tamamını değil. Operatör kapsamı değiştirmek isterse (asistan
 * "Tatlı" demiş, o "Baklava" diyecek) listenin orada olması gerekir.
 *
 * ── TİPE ÖZEL DEĞİL, ORTAK ──────────────────────────────────────────────────
 * Havuz tek yerde çünkü sıradaki gövdeler de aynı iki listeyi isteyecek (ürün taslağının kategorisi,
 * paketin koleksiyonu). Tip başına ayrı okuma yazılsaydı aynı sorgu üç kez koşar ve biri bir gün
 * sıralamayı ötekinden farklı yapardı.
 *
 * ── SAYFALAMA YOK, VE BU KURALA UYGUN ───────────────────────────────────────
 * Kategori ve koleksiyon operatörün elle kurduğu, doğal tavanı olan kümeler (`CLAUDE §1`): tek turda
 * çekilir. Veriyle büyüyen bir küme olsaydı `Select` zaten yanlış kontrol olurdu.
 */
export interface AssistantFormOptions {
  categories: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
  /**
   * ÜRÜN TASLAĞI önerilerinin konusu olan ürünlerin TAM kaydı (22.14).
   *
   * Gövde ürün ekranının GERÇEK formunu açıyor ve o form ürünün tamamını ister: kategori, KDV, tarih
   * tipi, raf ömrü, kargo izni, varyantlar. Dilekçe bunların hiçbirini taşımaz ve taşımamalı —
   * asistanın dokunduğu alanlar yalnız beyan alanları, ötekiler zaten kayıtta duruyor.
   *
   * Form ürünün BUGÜNKÜ hâliyle açılıp asistanın önerisi üzerine yazılıyor. Kayıt okunmasaydı form
   * boş açılır, kaydetme de dokunulmamış alanları (kategori, varyantlar) sıfırlardı.
   */
  products: Record<string, ProductFormSourceWithImage>;
  /**
   * PAKET ÖNERİLERİNİN kalem havuzu (22.18) — dilekçedeki `variantId`lerin ve **onlarla aynı ürünün
   * öteki boylarının** seçenek verisi (ad · görsel · birim fiyat · maliyet · KDV · marj).
   *
   * Dilekçe kalemleri yalnız kimlikle taşıyor; form ise satırda adı, fiyatı ve marjı yazıyor. Havuz
   * olmadan kalem editörü adsız satırlarla açılır ve mutabakat şeridi hesaplanamaz.
   *
   * **Öteki boyların da gelmesi gereklilik:** operatör önerideki "500 g"yi "1 kg" ile değiştirmek
   * isterse seçenek listede olmalı. Katalogun tamamı yine indirilmiyor — ekleme aramayla geliyor.
   */
  bundleVariants: VariantOption[];
  /**
   * PARA hesapları (22.18) — elle hareket formunun "Hangi hesap" seçicisi.
   *
   * Dilekçe `accountId` ve `accountName` taşıyor ama SEÇİCİ tüm hesapları ister: operatör asistanın
   * seçtiği kasadan başka bir hesabı işaret etmek isteyebilir ve o an listenin orada olması gerekir.
   * Hesap kümesi operatörün elle kurduğu, doğal tavanı olan bir küme — tek turda çekilir (`CLAUDE §1`).
   *
   * **Bakiye de taşınıyor (22.22)**, çünkü transfer formu onu gösteriyor: "Kasa 1.240,00 € →
   * 740,00 € · Banka 3.100,00 € → 3.600,00 €". Transferin en sık hatası yanlış yönü seçmektir ve o
   * hata bakiyeleri İKİ KAT kaydırır; sonucu kaydetmeden önce okumak bunun tek emniyeti. Bakiye
   * saklanmaz, `account_balance` görünümünden toplanır — liste zaten okunuyordu, bir tur daha
   * eklenmedi.
   */
  accounts: Array<{ id: string; name: string; balanceCents: number }>;
}

/**
 * Formun okuduğu ürün + KAPAK GÖRSELİNİN adresi.
 *
 * `imageUrl` formun alanı değil (kırpma dışında görsel formla kaydedilmiyor) ama görsel bloğu onu
 * ister ve adres SUNUCUDA kurulmak zorunda: `publicImageUrl` `R2_PUBLIC_BASE_URL`i okuyor, o env
 * tarayıcıya gitmiyor. Ürün ekranı da aynısını yapıyor (`ProductView.imageUrl`) — kuyruk kendi
 * yolunu icat etmiyor, aynı türevi aynı yerde kuruyor.
 */
export type ProductFormSourceWithImage = ProductFormSource & { imageUrl: string | null };

export async function readAssistantFormOptions(
  productIds: string[] = [],
  /** Paket önerilerinin kalem kimlikleri — havuz bunlardan türer (`bundleVariants`). */
  bundleVariantIds: string[] = [],
): Promise<AssistantFormOptions> {
  const db = serviceDb();
  const wanted = [...new Set(productIds)];
  const accountService = new AccountService(db);
  const [categories, collections, products, bundleVariants, accounts, balances] = await Promise.all([
    new CategoryService(db).list(),
    new CollectionService(db).list(),
    wanted.length > 0 ? new ProductService(db).listByIds(wanted) : Promise.resolve([]),
    // Kalem havuzu kendi okumasını yapıyor (`variant-options`): paket formunun ve kuyruğun gördüğü
    // fiyat/maliyet aynı yerden gelsin — ikisi ayrışırsa aynı kalem iki ekranda iki marj gösterir.
    variantOptionsForVariants(db, bundleVariantIds),
    accountService.list(),
    accountService.balances(),
  ]);

  // Varyantlar AYRI okunur ve tek turda: form varyant satırlarını da düzenletiyor, ürün kaydı onları
  // taşımıyor. Ürün başına sorgu açmak listenin uzunluğu kadar tur demekti (`STACK §13`).
  const variants = products.length > 0 ? await new ProductVariantService(db).listByProducts(products.map((p) => p.id)) : [];

  return {
    categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    collections: collections.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    products: Object.fromEntries(
      products.map((p) => [
        p.id,
        {
          ...p,
          variants: variants.filter((v) => v.productId === p.id),
          // Adres SUNUCUDA kurulur (env tarayıcıda yok) ve sürüm damgası satırın kendi
          // `imageUpdatedAt`'inden gelir — yeni yüklenen kapak önbellekten dönmesin.
          imageUrl: publicImageUrl(p.imageKey, p.imageUpdatedAt),
        },
      ]),
    ),
    bundleVariants,
    // Bakiyesi olmayan hesap 0 DEĞİL, hiç hareket görmemiş hesaptır — görünüm o satırı üretmiyor
    // ve `balances()` de onu taşımıyor. Sıfır yazmak burada doğru: defterde hareketi olmayan
    // hesabın bakiyesi gerçekten sıfırdır (`AccountService.balance` aynı cevabı veriyor).
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balanceCents: balances.get(a.id)?.balanceCents ?? 0 })),
  };
}
