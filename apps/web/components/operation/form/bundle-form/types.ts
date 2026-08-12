import type { BundleListRow } from '@lezzet/types';

/*
  PAKET FORMUNUN KENDİ GİRDİ TİPLERİ (22.18) — `products-types.ts`ten TAŞINDI, kopyalanmadı.

  Form ortak alana çıkınca (kuyruk da aynı formu kullanıyor) tipleri sayfa klasöründen okumaya devam
  edemezdi: `components/` → `app/` yönünde bir import bağımlılığı ters yöndür ve `docs:check §3e`
  kardeş sayfadan import etmeyi zaten yasaklıyor. Kopyalamak da olmazdı — aynı şeklin iki tanımı bir
  gün ayrışır ve havuz satırı bir yüzeyde adsız kalırdı.

  Tanım artık BURADA; ürün sayfası bunları `products-types`ten yeniden ihraç ederek okuyor, yani
  sayfa kodunun tek satırı bile değişmedi ve tek tanım korundu.
*/

/**
 * Paket LİSTE satırı — `BundleListRow`'u türetir: kalemleri değil, kalemlerden türeyen ÖZETİ taşır
 * (sayılar veritabanında toplandı, bkz. `bundle_list_rows()`). Kalemlerin kendisi ancak form
 * açılınca okunur; liste için katalogun fiyatlarını ve parti satırlarını taşımaya gerek yok.
 *
 * `itemLabels` ham adlardan sayfada çözülür — dil yedek zinciri (TR→FR→DE) tek yerde kalsın.
 */
export type BundleView = BundleListRow & {
  imageUrl: string | null;
  itemLabels: string[];
};

/**
 * Bir satılabilir birim — "Ürün · boy". Ürün listesi SAYFALI olduğu için paket seçicisi ona
 * dayanamaz (ikinci sayfadaki ürün pakete eklenemezdi); bu havuz ayrı ve TAM okunur. Havuz sayfa
 * açılışında DEĞİL, paket formu açılınca okunur (listenin ona ihtiyacı yok).
 *
 * HAVUZ İKİ İŞ GÖRÜR ve kümeleri AYNI DEĞİL: (a) pakete YENİ eklenebilecekler — yalnız aktif,
 * (b) pakette DURAN kalemin adı — hepsi. Havuz aktifle sınırlıyken pasif ürünün kalemi adsız kalıyor
 * ve ekran onu "silinmiş" sanıyordu; oysa `bundle_item.variant_id` FK'si `restrict`, yani pakette
 * duran varyant SİLİNEMEZ. Bu yüzden havuz artık pasifi de taşır, eklenebilirliği `addable` söyler.
 */
export interface VariantOption {
  variantId: string;
  label: string;
  imageUrl: string | null;
  /**
   * Kalemin TEK BAŞINA satıldığı fiyat (b2c, KDV dahil, **cent**) — paketin verdiği indirim ancak
   * buna göre görülebilir. `null` = o varyanta henüz fiyat girilmemiş; sayı UYDURULMAZ, ekran
   * eksikliği söyler.
   */
  listPriceCents: number | null;
  /**
   * Tahmini birim maliyet (KDV hariç, **cent**) — eldeki partilerin ağırlıklı ortalama alış fiyatı.
   * Gerçek COGS parti başına belli ve sipariş anında kesinleşir; bu, fiyat verirken bakılan tahmindir.
   * `null` = fiyatlı parti yok → marj hesaplanmaz (0 saymak marjı şişirirdi).
   *
   * Alan `unitCost` adıyla ve euro künyesiyle duruyordu; kaynağı (`unitCostCentsMap`) dilim 3'te
   * cent'e geçtiği hâlde tüketici üstüne bir kez daha `toCents` uyguluyordu — paket kalem maliyeti
   * 100 KAT şişiyor ve her kalem "marj altı" sayılıyordu. Adı doğru olsaydı hata satıra bakınca
   * görünürdü; `STACK §8`'in adlandırma kuralının varlık sebebi tam olarak bu.
   */
  unitCostCents: number | null;
  /** Ürünün KDV oranı — paketin tek oranı yoktur, HT'ye iniş kalem kalem yapılır. */
  vatRate: number;
  /** Ürünün hedef kâr marjı (%) — kalemin payı bunun altına düşerse şerit sayar. */
  targetMarginPercent: number | null;
  /** Pakete YENİ eklenebilir mi (ürün aktif + boy aktif). Pasif olan yine adıyla görünür. */
  addable: boolean;
  /** Eklenemiyorsa sebebi — "pasif ürün" · "aday ürün" · "pasif boy". Duran kalemde işaret olur. */
  blockedReason: string | null;
}
