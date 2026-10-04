import 'server-only';
import {
  AccountService,
  BundleService,
  CategoryService,
  CollectionService,
  CounterpartyService,
  MovementNatureService,
  MovementTagService,
  ProductService,
  ProductVariantService,
  SupplierService,
  StorageAreaService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText, type StorageAreaKind } from '@lezzet/types';
import type { CounterpartyOption, NatureOption, TagOption } from '@/components/operation/form/movement-form/schema';
import type { ProductFormSource } from '@/components/operation/form/product-form/schema';
import type { VariantOption } from '@/components/operation/form/bundle-form/types';
import { variantOptionsForVariants } from '@/lib/catalog/variant-options';
import { readZoneProposalContext, type ZoneProposalContext } from '@/lib/delivery/zone-proposal-map';

/**
 * Kuyruktaki formların seçenek havuzu: dilekçe hedefin kimliğini taşır, kataloğun tamamını değil, ama form operatör değiştirmek
 * isterse seçenekleri ister. Havuz tek yerdedir ki aynı listeler tip başına ayrı okunup sıralamada ayrışmasın.
 */
export interface AssistantFormOptions {
  /**
   * Kategoriler `isFeatured` ve `isActive` ile: vitrin önerisinin gövdesi ızgaranın bugünkü hâlini düzenletir, çünkü kontenjan
   * doluyken hangi kaydın çıkacağı kuyruğun içinde verilmesi gereken bir karardır.
   */
  categories: Array<{ id: string; name: string; isFeatured: boolean; isActive: boolean }>;
  collections: Array<{ id: string; name: string; isFeatured: boolean; isActive: boolean }>;
  /** Paketler — vitrin önerisinin üçüncü hedefi (`target: 'bundle'`); aynı gerekçe. */
  bundles: Array<{ id: string; name: string; isFeatured: boolean; isActive: boolean }>;
  /**
   * Bölge önerilerinin harita bağlamı, yalnız kuyruktakiler için: dilekçe kod taşır, harita koordinat ister. Boş nesne kuyrukta
   * bölge önerisi olmadığını söyler.
   */
  zones: Record<string, ZoneProposalContext>;
  /**
   * Ürün taslağı önerilerinin konusu olan ürünlerin tam kaydı: gövde ürünün gerçek formunu açar ve form ürünün tamamını ister.
   * Kayıt okunmasaydı kaydetme, asistanın dokunmadığı alanları (kategori, varyantlar) sıfırlardı.
   */
  products: Record<string, ProductFormSourceWithImage>;
  /**
   * Paket önerilerinin kalem havuzu: dilekçedeki varyantların ve aynı ürünün öteki boylarının adı, görseli, fiyatı, maliyeti ve
   * KDV'si. Öteki boylar da gelir, çünkü operatör önerideki boyu başka boyla değiştirebilmeli.
   */
  bundleVariants: VariantOption[];
  /**
   * Para hesapları, bakiyeleriyle: seçici bütün hesapları ister, çünkü operatör asistanın seçtiği hesabı değiştirebilir. Bakiye
   * transfer formunda gösterilir, çünkü yanlış yön bakiyeleri iki kat kaydırır ve kaydetmeden önce okumak tek emniyettir.
   */
  accounts: Array<{ id: string; name: string; balanceCents: number }>;
  /** Aktif tür sözlüğü; yöne göre süzülsün diye yönünü de taşır. */
  natures: NatureOption[];
  /** Aktif cariler, varsayılan türüyle — formun "karşı taraf" seçicisi. */
  counterparties: CounterpartyOption[];
  /** Aktif serbest etiketler; pasif etiket yeni harekete verilmez. */
  tags: TagOption[];
  /**
   * Mal kabul formunun iki listesi, depo ve tedarikçi. Depo varsayılansızdır: dilekçe deposunu söyler ama operatör değiştirebilir.
   */
  warehouses: Array<{ id: string; name: string }>;
  /**
   * Ülke ve vade de taşınır: belge gövdesi faturanın KDV rejimini ülkeden, vadesini kartın vadesinden önerir (`supplierSuggestion`).
   */
  suppliers: Array<{ id: string; name: string; country: string | null; paymentTermDays: number | null }>;
  /**
   * Stoklama alanları, depo-üstü: dilekçe deposunu taşır ama operatör değiştirebilir; liste tek depoya daralsaydı depoyu
   * değiştirene boş raf listesi kalırdı.
   */
  storageAreas: Array<{ id: string; name: string; kind: StorageAreaKind }>;
}

/**
 * Formun okuduğu ürün ve kapak görselinin adresi; adres sunucuda kurulur, çünkü `publicImageUrl`in okuduğu env tarayıcıya gitmez.
 */
export type ProductFormSourceWithImage = ProductFormSource & { imageUrl: string | null };

export async function readAssistantFormOptions(
  productIds: string[] = [],
  /** Paket önerilerinin kalem kimlikleri — havuz bunlardan türer (`bundleVariants`). */
  bundleVariantIds: string[] = [],
  /**
   * Bölge önerilerinin bölge kimlikleri ve önerdikleri kodlar; kodlar ayrıca verilir, çünkü henüz hiçbir bölgede olmadıkları için
   * bölge okumasından gelmezler.
   */
  zoneRequests: ReadonlyArray<{ zoneId: string; postalCodes: string[] }> = [],
): Promise<AssistantFormOptions> {
  const db = serviceDb();
  const wanted = [...new Set(productIds)];
  const accountService = new AccountService(db);
  const [categories, collections, bundles, products, bundleVariants, accounts, balances, natures, counterparties, tags, warehouses, suppliers] =
    await Promise.all([
    new CategoryService(db).list(),
    new CollectionService(db).list(),
    new BundleService(db).listAll(),
    wanted.length > 0 ? new ProductService(db).listByIds(wanted) : Promise.resolve([]),
    // Kalem havuzu kendi okumasını yapıyor (`variant-options`): paket formunun ve kuyruğun gördüğü
    // fiyat/maliyet aynı yerden gelsin — ikisi ayrışırsa aynı kalem iki ekranda iki marj gösterir.
    variantOptionsForVariants(db, bundleVariantIds),
    accountService.list(),
    accountService.balances(),
    new MovementNatureService(db).list({ activeOnly: true }),
    new CounterpartyService(db).list({ activeOnly: true }),
    new MovementTagService(db).list({ activeOnly: true }),
    // Kabul yalnız açık tesise yazılır, çünkü kapalı depoda kimsenin bakmadığı rafa mal girerdi; araca mal tedarikçiden değil
    // transferle girer.
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
    new SupplierService(db).list({ activeOnly: true }),
  ]);

  // Alanlar depolardan SONRA: kapsam aktif depoların kimliğinden çıkıyor. Kapalı deponun rafı
  // listeye girmemeli — depo listesinin kendi gerekçesinin devamı.
  const storageAreas = await new StorageAreaService(db).listByWarehouses(
    warehouses.map((w) => w.id),
    { activeOnly: true },
  );

  // Varyantlar AYRI okunur ve tek turda: form varyant satırlarını da düzenletiyor, ürün kaydı onları
  // taşımıyor. Ürün başına sorgu açmak listenin uzunluğu kadar tur demekti (`STACK §13`).
  const variants = products.length > 0 ? await new ProductVariantService(db).listByProducts(products.map((p) => p.id)) : [];

  // Bölge bağlamı yalnız İSTENİRSE okunur: kuyrukta bölge önerisi yoksa üç sorgu hiç açılmaz.
  const zones = await readZoneProposalContext(
    zoneRequests.map((request) => request.zoneId),
    zoneRequests.flatMap((request) => request.postalCodes),
  );

  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: resolveLocalizedText(c.name),
      isFeatured: c.isFeatured,
      isActive: c.isActive,
    })),
    collections: collections.map((c) => ({
      id: c.id,
      name: resolveLocalizedText(c.name),
      isFeatured: c.isFeatured,
      isActive: c.isActive,
    })),
    bundles: bundles.map((b) => ({
      id: b.id,
      name: resolveLocalizedText(b.name),
      isFeatured: b.isFeatured,
      isActive: b.isActive,
    })),
    zones,
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
    natures: natures.map((nature) => ({ value: nature.slug, label: nature.label, direction: nature.direction })),
    counterparties: counterparties.map((counterparty) => ({ value: counterparty.id, label: counterparty.name, defaultNature: counterparty.defaultNature })),
    tags: tags.map((tag) => ({ value: tag.slug, label: tag.label })),
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, country: s.country, paymentTermDays: s.paymentTermDays })),
    storageAreas: storageAreas.map((a) => ({ id: a.id, name: a.name, kind: a.kind })),
  };
}
