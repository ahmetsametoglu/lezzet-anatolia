import { z } from 'zod';
import { CatalogImageSchema, CatalogProductSchema } from './catalog-api.schema';
import { RecipeSchema } from '../entities/recipe.schema';

/**
 * VİTRİN SÖZLEŞMESİ (21.14 bağlanma etabı) — mobil `GET /api/v1/home` ucunun ve onu tüketen Expo
 * vitrin ekranının ORTAK dili. Terfi gerekçesi `catalog-api.schema.ts` ile aynı (02-mimari §3.2
 * "sözleşme tek kaynak"): üreten ve tüketen aynı şemayı çağırır, alan adı değişirse iki taraf
 * birden DERLEME anında kırılır.
 *
 * ── YALNIZ MÜŞTERİDEN BAĞIMSIZ BÖLÜMLER (kullanıcı kararı 08.08) ─────────────
 * Selamlama/ad, puan, B2B rozeti, okunmamış bildirim ve süren sipariş BURADA YOK: onlar kimlikli
 * uçların işidir ve bu etapta kapsam dışı bırakıldı. Bearer bu uçta yalnız FİYATI kişiselleştirir
 * (katalog uçlarının aynı kuralı), kimliğe bağlı içerik taşımaz.
 *
 * ── OLMAYAN ALAN, DOLDURULAMAYAN BÖLÜMDÜR ────────────────────────────────────
 * `flashDeal` alanı bilinçle YOK: "günün fırsatı"nın seçim kuralı HİÇBİR yüzeyde tanımlı değil
 * (bitiş anının veri kaynağı da kararsız) — kural kararı verilmeden alan açılmaz; hep boş kalan
 * bir alan, ekranı "bölüm yok" ile "bölüm bozuk"u ayırt edemez hâlde bırakırdı.
 *
 * `featured` ve `packages` İSE VAR ama web'in kuralları KOPYALANMADAN (08.08 ikinci tur):
 *   · `featured` — kataloğun KENDİ `featured` sıralamasından ilk N (application'ın mevcut kapısı).
 *     Web'in sinyalli seçkisi (`readShowcase`: görüntüleme+sepet sinyali) DEĞİL; sinyalsiz veride
 *     ikisi aynı listeyi verir, sinyal birikince ayrışır — o gün web kuralının paket terfisiyle
 *     bu bölüm o kapıya döner (defter kaydı 08.08; BEKLEYEN(21.14)).
 *   · `packages` — yalnız İŞARETLİ (`isFeatured`) paketler; işaret yoksa bölüm boş (bant
 *     karışımının kendi ilkesi: işaret seçimdir, yedeği yoktur). Web'in "işaretsizde ilk N" yedeği
 *     (`pickFeatured`) bilerek alınmadı — o kural web'de yaşıyor, kopyası yasak (CLAUDE §1).
 */

/**
 * Bant türü — kartın açacağı katalog süzgecini belirler: `category` → `/products?category=<slug>`,
 * `collection` → katalogun koleksiyon kesiti. Tek şeritte iki tür (kullanıcı kararı 08.08, web'den
 * bilinçli sapma: web'de kategori ızgarası ile koleksiyon bandı AYRI bölümlerdir).
 */
export const HomeBandKindEnum = z.enum(['category', 'collection']);
export type HomeBandKind = z.infer<typeof HomeBandKindEnum>;

/**
 * Vitrin BANDI — 6 slot = 4 kategori + 2 koleksiyon karışımı (sabitler uçta parametrik; eksik
 * veride dizi kısalır, uydurma dolgu yapılmaz).
 */
export const HomeBandSchema = z.object({
  kind: HomeBandKindEnum,
  /** Dil-bağımsız; iki türün de kendi tablosundan gelir (`category.slug` / `collection.slug`). */
  slug: z.string(),
  name: z.string(),
  /**
   * Adın altındaki cümle — kategoride `tagline` (05.17), koleksiyonda `description`. **`null` =
   * yazılmamış** ve öyle taşınır: yedek metin UYDURULMAZ (ada düşmek "Börekler / Börekler" gibi bir
   * tekrar üretirdi — şema künyesinin kendi kuralı); ekran altyazısız çizer.
   */
  subtitle: z.string().nullable(),
  /**
   * Kaç ürün — **kataloğun sayacağıyla AYNI ölçüt** (aktif ürün; koleksiyonda aktif ÜYE). Üyelik/
   * kayıt sayısını basmak kolay olurdu ve yalan söylerdi: müşteri "14 ürün" okuyup 9 görürdü.
   *
   * `positive`, `min(0)` değil: ürünü kalmamış bant HİÇ taşınmaz (web koleksiyon bandının kuralı —
   * tıklanınca boş katalog açan bir kapı, kapı değildir). Kural gevşerse önce bu kilit gevşetilir.
   */
  productCount: z.number().int().positive(),
  image: CatalogImageSchema,
});
export type HomeBand = z.infer<typeof HomeBandSchema>;

/**
 * Fırsat kartı — katalog kartının İNDİRİMLİ daraltması: `wasCents` burada ZORUNLU (web'in
 * `StorefrontOffer extends StorefrontProduct` daraltmasının telidir). Kartın fırsat sayılmasının
 * tek ölçütü motorun teklifi kazandırmış olmasıdır; uç bu alanı hesaplamaz, yalnız süzer.
 *
 * ⚠ Yer bilinmezken teklif TUTARI hiç okunmaz (`catalog.ts` `UNKNOWN_PLACE` sözü) — mobil istemci
 * posta kodu gönderemediği sürece bu dizi BOŞ gelir; ekran bölümü çizmez. Yer çözümü
 * `@lezzet/application`a terfi edince (21.6 B) uç yeri çözer ve dizi dolmaya başlar.
 */
export const HomeOfferSchema = CatalogProductSchema.extend({ wasCents: z.number().int() });
export type HomeOffer = z.infer<typeof HomeOfferSchema>;

/**
 * Hazır paket kartı — GEZİNME kapısıdır, satın alma değil: fiyat + ad + içerik adedi taşır,
 * `soldOut`/stok TAŞIMAZ (o karar üye ürünlerin stok zincirinden çıkar ve web'in paket kartı
 * okumasıyla birlikte terfi edecek — kart basılınca paket detayı zaten gerçeği söyler).
 *
 * `itemCount` paket İÇERİĞİNİN satır sayısıdır ("5 ürün" — adet toplamı değil); `positive`:
 * içeriksiz paket kart olamaz (boş kutu satılmaz, işaretlense bile taşınmaz).
 */
export const HomePackageSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** Paketin TEK fiyatı (TTC, ham cent) — kalem toplamına eşitliği paketin kendi kısıtı. */
  priceCents: z.number().int(),
  itemCount: z.number().int().positive(),
  image: CatalogImageSchema,
});
export type HomePackage = z.infer<typeof HomePackageSchema>;

/**
 * Tarif kartı — "Sofradan Fikirler" şeridinin öğesi. İçerik kartıdır: fiyat/stok TAŞIMAZ (o
 * birleştirme tarif DETAYININ işi ve web okumasıyla birlikte terfi edecek).
 *
 * `duration`/`serves` SERBEST METİNDİR, sayı değil (05.16 veri modeli: "35 dk" · "3–4 kişilik";
 * hesap yok, birim çekimi dile bağlı). Ekranın "dakika sayısı" beklentisi şemaya bilerek
 * alınmadı — sayı tutulmuyor ki metinden sayı türetmek uydurmak olurdu.
 */
export const HomeRecipeSchema = RecipeSchema.pick({ slug: true }).extend({
  name: z.string(),
  /** Seçili dilde çözülmüş; **`null` = girilmemiş** (boş/boşluk da `null`) → rozet parçası düşer. */
  duration: z.string().nullable(),
  serves: z.string().nullable(),
  /** BİZİM ürünlerimizin satır sayısı ("1 ürün" — adet toplamı değil). */
  itemCount: z.number().int().min(0),
  /** "Evinizden" madde sayısı — satır = madde (`splitLines` kuralı). */
  pantryCount: z.number().int().min(0),
  image: CatalogImageSchema,
});
export type HomeRecipe = z.infer<typeof HomeRecipeSchema>;

/**
 * `/home` cevap zarfı — vitrinin müşteriden bağımsız bölümleri TEK turda (bölüm başına istek yok).
 * Boş dizi meşru cevaptır: ekran o bölümü HİÇ çizmez (web vitrininin aynı kuralı — boş hâl
 * gösterilmez).
 */
export const HomeSchema = z.object({
  bands: z.array(HomeBandSchema),
  offers: z.array(HomeOfferSchema),
  /** Vitrin seçkisi — kataloğun `featured` sırası (gerekçe başlıkta; kart sözleşmesi katalogla ortak). */
  featured: z.array(CatalogProductSchema),
  recipes: z.array(HomeRecipeSchema),
  packages: z.array(HomePackageSchema),
});
export type Home = z.infer<typeof HomeSchema>;
