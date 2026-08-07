import type { RecipeWithItems } from '@lezzet/types';

/**
 * Tarif yönetiminin görünüm tipleri (09.21) — `design/project/Operasyon - Tarifler.dc.html`.
 *
 * **Şemadan TÜRETİLİR, elle yazılmaz** (`CLAUDE §1`): `View = Entity & { extra }`. Tarifin kendi
 * alanlarını burada yeniden yazmak, bir gün şemayla ayrışan ikinci bir gerçek olurdu.
 */

/** Bir tarifin bağlı malzemesi — satır ekranda ürün adıyla okunur, varyant kimliğiyle değil. */
export interface RecipeItemView {
  id: string;
  variantId: string;
  qty: number;
  /** "Ezine Beyaz Peynir" — ürünün adı, oturum dilinde. */
  productName: string;
  /** "350 g" — boy etiketi. Bağ VARYANTA kurulur (05.16): sepete eklenebilen tek şey odur. */
  variantLabel: string;
  /**
   * Liste fiyatı (b2c) — `null` ise fiyat TANIMSIZ, bedava değil. Tarif ekranı fiyat YAZMAZ,
   * okur: fiyat ürün kaydının kararıdır (tasarım: *"Fiyat burada girilmez"*).
   */
  priceCents: number | null;
  /** Varyant bugün satılabiliyor mu — tükenen malzeme müşteride satırdan düşer, burada işaretlenir. */
  isAvailable: boolean;
}

/**
 * Listedeki ve önizlemedeki tarif.
 *
 * `languages` bir SAYAÇ değil, yayın kapısının yüzü: hangi dilin eksik olduğu tek tek görünmeli,
 * yoksa operatör "2/3" okuyup hangisini yazacağını aramak zorunda kalır.
 */
export interface RecipeView extends RecipeWithItems {
  itemViews: RecipeItemView[];
  /** Operasyon dilinde çözülmüş ad (yedek zinciri TR→FR→DE) — ham `name` ekrana yazılmaz. */
  title: string;
  /** "Akşam yemeği · 3–4 kişilik" — künye satırı; ikisi de boşsa boş dize. */
  subtitle: string;
  /** "35 dk" — serbest metin, hesap yok (05.16). Boşsa "—". */
  durationText: string;
  descriptionText: string;
  /**
   * Adımlar ve ev malzemeleri SATIRA bölünmüş hâlde.
   *
   * Veri tek metin alanı ve bölme burada yapılıyor (kullanıcı kararı 07.08, `KARARLAR §3z`):
   * satır = madde. Boş satırlar atılır — operatör iki madde arasına boşluk bırakabilir ve o
   * boşluk numaralı bir adım olarak görünmemeli.
   */
  stepLines: string[];
  pantryLines: string[];
  /** Adı dolu olan diller — yayın kapısının ölçütü (`is_active` DB kısıtı). */
  filledLocales: string[];
  /** Adı eksik diller — düğmenin NEDEN kapalı olduğunu ekran bununla söyler. */
  missingLocales: string[];
  /** Yayınlanabilir mi — kısıt veride, cümle ekranda (`missingLocales` boşsa true). */
  canPublish: boolean;
  /** Bağlı malzemelerden bugün satılamayan var mı — süzgeç çubuğundaki uyarı çipinin kaynağı. */
  hasUnavailableItem: boolean;
}

export interface RecipesData {
  recipes: RecipeView[];
  /** Yayında olan sayısı — başlık altı künyesi ("5 tarif · 3 yayında · 2 taslak"). */
  activeCount: number;
  /** Kaç tarifte tükenen malzeme var — süzgeç çubuğundaki amber çip. */
  unavailableCount: number;
}

