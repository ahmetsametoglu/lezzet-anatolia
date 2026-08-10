import 'server-only';
import {
  BundleService,
  CategoryService,
  CollectionService,
  ProductService,
  ProductVariantService,
  serviceDb,
} from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type {
  AssistantProposal,
  BundleDraftPayload,
  DiscountDraftPayload,
  FeaturedFlagPayload,
  ImageCrop,
  RecipeDraftPayload,
} from '@lezzet/types';
// Görsel + kırpma ikilisi ÇİZEN tarafın sözleşmesi (`SubjectImage`): burada ikinci kez tanımlansaydı
// biri bir gün alan eklerdi ve iki tanım sessizce ayrışırdı (`CLAUDE §1`).
import type { SubjectImage } from '@/components/operation/ui/subject-card';
import { productsUrl } from '@/app/(operations)/operations/products/products-url';

/**
 * ÖNERİNİN KONUSU (22.9) — "bu öneri neyle ilgili" sorusunun tek cevabı.
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Kart iki sütuna ayrılınca sağda ölü alan kaldı ve onu uydurma metinle doldurmak, tam da bu
 * ekranda azaltmaya çalıştığımız şeydi. Kullanıcının çözümü boşluğu **gerçek bilgiyle** kapatmak:
 * *"konu bir ürünle alakalıysa ürünün resmini koyabiliriz; hem ekran daha düzgün olur"*. Görsel
 * ayrıca en hızlı tanıma yolu — patron ürünü adından önce fotoğrafından tanıyor.
 *
 * ── GÖRSEL PAYLOAD'DAN OKUNMAZ, BUGÜNKÜ KAYITTAN ────────────────────────────
 * Payload bir DİLEKÇEDİR ve öneri anındaki gerçeği taşır; görsel ise "şu an ne satıyoruz"un
 * parçası. Dondurulmuş bir görsel, ürün fotoğrafı değişmişse yanlış ürünü gösterirdi. Aynı ayrım
 * `economics`te de var: payload'daki fiyat önerinin dayandığı gerçek, oradaki maliyet BUGÜNKÜ.
 *
 * ── ORTAK, ÇÜNKÜ 11 TİPİN 9'UNDA KONU VAR ───────────────────────────────────
 * Ürün · paket · kategori · koleksiyon · tarif. Yalnız `money_movement` (defter satırı) ve
 * `zone_extend` (haritası var) konusuz. Tip başına ayrı bir "başlık kartı" yazılsaydı dokuz kopya
 * doğardı — `CLAUDE §1`.
 */

/** Öneri kartının başındaki konu künyesi. `null` = bu tipin görsel bir konusu yok. */
export interface ProposalSubject {
  kind: 'product' | 'bundle' | 'category' | 'collection' | 'recipe';
  name: string;
  /** Alt satır: boy/kapsam gibi ayırt edici ek (`90g`, `Tatlı`). */
  detail: string | null;
  imageUrl: string | null;
  /** `imageUrl`in kırpma künyesi; görsel yoksa merkez (okuyan taraf bir değer beklemesin diye). */
  crop: ImageCrop;
  /**
   * Konunun ÇOĞUL görselleri — paket gibi birden çok üründen oluşan konularda kalemlerin
   * fotoğrafları (22.11).
   *
   * `imageUrl`den ayrı bir alan, çünkü iki farklı soruya cevap veriyorlar: `imageUrl` "bu konu neye
   * benziyor", bu ise "içinde ne var". Paketin kendi fotoğrafı YOKTUR — kayıt henüz doğmamıştır ve
   * doğduğunda da tek bir fotoğrafı olacaktır; taslak evresinde tanınmanın tek yolu kalemleri.
   * Tek ürünlü konularda boş dizi — `imageUrl` zaten o cevabı veriyor.
   */
  images: SubjectImage[];
  /**
   * İlgili ekran — **yeni sekmede** açılır ve bu bilinçli. Kartın bütün amacı operatörü asistan
   * sayfasından çıkarmamak (22.8); aynı sekmede gitmek az önce çözülen "ortamdan kopma" sorununu
   * geri getirirdi. `null` = gidilecek bir ekran yok.
   */
  href: string | null;
}

/**
 * Önerinin konusunu çözer. Bugün yalnız VARYANT taşıyan tipler bağlı (`batch_offer`); kalan sekiz
 * tip aynı imzayla sırayla eklenecek — desen kanıtlanmadan çoğaltılmıyor (22.8 dersi).
 */
export async function subjectOf(proposal: AssistantProposal): Promise<ProposalSubject | null> {
  if (proposal.kind === 'batch_offer') {
    const payload = proposal.payload as { variantId?: string };
    return typeof payload.variantId === 'string' ? variantSubject(payload.variantId) : null;
  }
  if (proposal.kind === 'discount_draft') {
    return scopeSubject(proposal.payload as DiscountDraftPayload);
  }
  if (proposal.kind === 'bundle_draft') {
    return bundleSubject(proposal.payload as BundleDraftPayload);
  }
  if (proposal.kind === 'purchase_order' || proposal.kind === 'stock_intake') {
    return supplySubject(proposal.payload as SupplyPayload, proposal.kind);
  }
  if (proposal.kind === 'product_draft') {
    const payload = proposal.payload as { productId?: string };
    return typeof payload.productId === 'string' ? productSubject(payload.productId) : null;
  }
  if (proposal.kind === 'recipe_draft') {
    return recipeSubject(proposal.payload as RecipeDraftPayload);
  }
  if (proposal.kind === 'featured_flag') {
    return featuredSubject(proposal.payload as FeaturedFlagPayload);
  }
  return null;
}

/**
 * TARİFİN yüzü MALZEMELERİ — paketle aynı gerekçe (22.11).
 *
 * Tarif de taslak evresinde doğmamış bir kayıttır ve kendi fotoğrafı yoktur; "bu ne tarifi"
 * sorusunun görsel cevabı içindeki ürünlerdir. Malzeme sırası dilekçeden korunuyor: tarifte sıra
 * rastgele değil, ana malzeme başta.
 */
async function recipeSubject(payload: RecipeDraftPayload): Promise<ProposalSubject | null> {
  const variantIds = payload.items.map((item) => item.variantId);
  if (variantIds.length === 0) return null;

  return {
    kind: 'recipe',
    name: resolveLocalizedText(payload.name, 'tr'),
    // Kaç kişilik — tarifin ölçeği. `serves` METİNdir ("4 kişilik"), sayı değil (`Recipe` modeli).
    detail: payload.serves ? resolveLocalizedText(payload.serves, 'tr') : null,
    imageUrl: null,
    crop: CROP_CENTER,
    images: await variantImages(variantIds),
    href: null,
  };
}

/**
 * VİTRİN İŞARETİNİN konusu HEDEF KAYIT — kategori, koleksiyon ya da paket (22.11).
 *
 * Üçünün de kendi fotoğrafı var (`ImageMeta` üçünde de merge edilmiş) ve vitrin kararı tam olarak
 * o fotoğrafla veriliyor: "bunu vitrine çıkaralım mı" sorusunun cevabı, kaydın müşteriye nasıl
 * görüneceğine bakmadan verilemez.
 *
 * **Ad DİLEKÇEDEN, görsel BUGÜNKÜ kayıttan.** İkisi bilinçle farklı kaynaktan: ad, "o gün neyi
 * onayladım" sorusunun cevabıdır ve kayıt yeniden adlandırılsa bile değişmemeli
 * (`FeaturedFlagPayloadSchema.name` künyesi); fotoğraf ise "şu an ne satıyoruz"un parçası.
 */
async function featuredSubject(payload: FeaturedFlagPayload): Promise<ProposalSubject | null> {
  const db = serviceDb();
  const record =
    payload.target === 'category'
      ? await new CategoryService(db).getById(payload.id)
      : payload.target === 'collection'
        ? await new CollectionService(db).getById(payload.id)
        : await new BundleService(db).getById(payload.id);
  if (!record) return null;

  return {
    kind: payload.target === 'bundle' ? 'bundle' : payload.target,
    name: payload.name,
    detail: TARGET_LABEL[payload.target],
    imageUrl: publicImageUrl(record.imageKey, record.imageUpdatedAt),
    crop: cropOf(record),
    images: [],
    href: null,
  };
}

/** Vitrin hedefinin türü — kartta ve künyede aynı kelimeyle geçsin diye tek yerde. */
const TARGET_LABEL: Record<FeaturedFlagPayload['target'], string> = {
  category: 'Kategori',
  collection: 'Koleksiyon',
  bundle: 'Paket',
};

/**
 * ÜRÜNÜN KENDİSİ — tamamlama önerisinin konusu (22.11).
 *
 * `variantSubject`ten ayrı, çünkü buradaki dilekçe VARYANT değil ÜRÜN taşıyor: tamamlanan alanlar
 * (içindekiler, alerjen, açıklama) ürün düzeyindedir, boy düzeyinde değil. Aynı fonksiyonu iki
 * anahtarla çağrılabilir yapmak, iki farklı kavramı tek imzada birleştirmek olurdu.
 */
async function productSubject(productId: string): Promise<ProposalSubject | null> {
  const db = serviceDb();
  const [product] = await new ProductService(db).listByIds([productId]);
  if (!product) return null;

  const name = resolveLocalizedText(product.name, 'tr');
  return {
    kind: 'product',
    name,
    detail: null,
    imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
    crop: cropOf(product),
    images: [],
    href: productsUrl({ tab: 'products', q: name, cat: 'all', status: 'all', incomplete: false, creating: false }),
  };
}

/**
 * VARYANT LİSTESİNİN GÖRSELLERİ — paket · tedarik · tarif, üçünün de ortak işi (22.11).
 *
 * Üç yerde aynı üç adım yazılıydı (varyantları çöz → ürünleri çöz → görsel + kırpma): dördüncüsü
 * yazılmadan birleştirildi. Ayrı kalsalardı biri bir gün kırpmayı unutur, öteki sırayı bozardı.
 *
 * **Görseller ürünün BUGÜNKÜ kaydından**, dilekçeden değil: payload öneri anındaki gerçeği taşır,
 * fotoğraf ise "şu an ne satıyoruz"un parçası. **Sıra VERİLEN sıradır** (dilekçedeki kalem sırası) —
 * `listByIds` sırayı korumaz ve koruduğunu varsaymak destede başka ürünleri gösterirdi. Görseli
 * olmayan kalem sessizce ATLANIR: yer tutucu dizmek, dört kalemli bir pakette iki fotoğraf iki boş
 * kutu gösterirdi.
 *
 * Kırpma ürünün KENDİ künyesinden — ortak bir merkez kırpma, dikey çekilmiş bir fotoğrafın ürününü
 * bandın dışında bırakırdı.
 */
async function variantImages(variantIds: string[]): Promise<SubjectImage[]> {
  const db = serviceDb();
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const byProduct = new Map(products.map((p) => [p.id, p]));

  return variantIds.flatMap((id) => {
    const product = byProduct.get(byVariant.get(id)?.productId ?? '');
    const url = product ? publicImageUrl(product.imageKey, product.imageUpdatedAt) : null;
    return url && product ? [{ url, crop: cropOf(product) }] : [];
  });
}

/** Tedarik ikilisinin ortak şekli — ikisi de "hangi varyanttan kaç adet" taşıyor. */
type SupplyPayload = { supplierName?: string | null; warehouseCode?: string | null; lines: { variantId: string }[] };

/**
 * TEDARİK KALEMLERİNİN GÖRSELLERİ (22.11).
 *
 * ── NEDEN GÖRSEL ────────────────────────────────────────────────────────────
 * Kullanıcının sorusu yerindeydi: *"bu tedarik kartlarında neden resimler yok? Belli ki ürün
 * tedarik ediyoruz."* Kalem listesinde ürünü adından önce fotoğrafı tanıtır.
 *
 * ── PAKETLE AYNI DESTE, ÇÜNKÜ AYNI SORU ─────────────────────────────────────
 * Görseller bir tur satır satır diziliyordu (küçük künye + adet). Kullanıcı düzeltti: *"bizim diğer
 * kartlardaki fotoğraf stilimiz bu değil."* Doğrusu bu — hem paket hem tedarik "bu öneride hangi
 * ürünler var" sorusuna cevap veriyor ve iki ayrı dizilim, aynı sorunun iki farklı görünüşü olurdu.
 * Kalem başına adet karta değil DİYALOĞA ait: kart "14 çeşit · 411 adet" der, hangi üründen kaç
 * tane olduğu düzenleme ekranının işi.
 *
 * **Sıra DİLEKÇEDEN**, servisin döndürdüğü sıradan değil: deste ilk üç kalemi gösteriyor ve o "ilk
 * üç" siparişin kendi sırasıdır — `listByIds` sırayı korumaz, koruduğunu varsaymak sessizce başka
 * ürünleri gösterirdi.
 */
async function supplySubject(payload: SupplyPayload, kind: 'purchase_order' | 'stock_intake'): Promise<ProposalSubject | null> {
  const variantIds = [...new Set(payload.lines.map((line) => line.variantId))];
  if (variantIds.length === 0) return null;
  const images = await variantImages(variantIds);

  return {
    kind: 'product',
    // Konu adı KİMDEN/NEREYE: siparişte tedarikçi, mal kabulde tedarikçi yoksa deponun kendisi.
    name: payload.supplierName ?? (kind === 'purchase_order' ? 'Tedarik siparişi' : 'Doğrudan mal kabul'),
    detail: payload.warehouseCode ?? null,
    imageUrl: null,
    crop: CROP_CENTER,
    images,
    href: null,
  };
}

/**
 * PAKETİN konusu KENDİSİ ama yüzü KALEMLERİ (22.11).
 *
 * Paketin fotoğrafı yoktur ve olamaz: kayıt henüz doğmamıştır (taslak). Taslak evresinde "bu ne
 * paketi" sorusunun tek görsel cevabı içindeki ürünlerdir — dört börek fotoğrafı yan yana, adı
 * okumadan da anlaşılır.
 *
 * **Görseller ürünün BUGÜNKÜ kaydından**, dilekçeden değil (`variantSubject` ile aynı gerekçe):
 * payload öneri anındaki gerçeği taşır, fotoğraf ise "şu an ne satıyoruz"un parçası.
 *
 * Sıra KORUNUR (dilekçedeki kalem sırası) ve görseli olmayan kalem sessizce ATLANIR: yer tutucu
 * dizmek, dört kalemli bir pakette iki fotoğraf iki boş kutu gösterirdi — kalemin görseli yok diye
 * paket eksik görünmemeli.
 */
async function bundleSubject(payload: BundleDraftPayload): Promise<ProposalSubject | null> {
  const variantIds = payload.items.map((item) => item.variantId);
  if (variantIds.length === 0) return null;
  const images = await variantImages(variantIds);

  const qty = payload.items.reduce((sum, item) => sum + item.qty, 0);
  return {
    kind: 'bundle',
    name: resolveLocalizedText(payload.name, 'tr'),
    // "4 çeşit · 4 kişilik" — paketin ne olduğunu iki sayı söylüyor. `serves` yoksa yalnız çeşit.
    detail: [`${payload.items.length} çeşit`, qty !== payload.items.length ? `${qty} ad.` : null, payload.serves ? `${payload.serves} kişilik` : null]
      .filter(Boolean)
      .join(' · '),
    imageUrl: null,
    crop: CROP_CENTER,
    images,
    // Paket henüz YOK — açılacak bir kaydı da yok. Bağlantı uygulandıktan sonra anlam kazanır.
    href: null,
  };
}

/**
 * İndirimin konusu KAPSAMIDIR — kuralın kendisi değil.
 *
 * "Yaz Tatlı Festivali" bir ADdır ve zaten kartın başlığında duruyor; kararın konusu *hangi malın*
 * ucuzlayacağıdır. Sepet kapsamında konu YOKTUR ve uydurulmaz: "tüm katalog" diye bir kayıt yok,
 * onu gövde kendi cümlesiyle söylüyor.
 *
 * **Kimlik değil AD okunur** ve bu bilinçli: kategori/koleksiyonun görseli yok, tıklanacak ayrı bir
 * ekranı da yok (ikisi de katalog ekranının sekmeleri). Ek bir sorgu açmak, ekrana tek satır bile
 * yeni bilgi getirmezdi — dilekçedeki `scopeName` zaten öneri anındaki adı taşıyor.
 */
function scopeSubject(payload: DiscountDraftPayload): ProposalSubject | null {
  if (payload.scope === 'cart' || !payload.scopeName) return null;
  return {
    kind: payload.scope === 'category' ? 'category' : 'collection',
    name: payload.scopeName,
    detail: payload.scope === 'category' ? 'Kategori' : 'Koleksiyon',
    imageUrl: null,
    crop: CROP_CENTER,
    images: [],
    href: null,
  };
}

/** Varyanttan ürün künyesi — görsel ÜRÜNÜN, ayırt edici ad varyantın (boy). */
async function variantSubject(variantId: string): Promise<ProposalSubject | null> {
  const db = serviceDb();
  const [variant] = await new ProductVariantService(db).listByIds([variantId]);
  if (!variant) return null;

  const [product] = await new ProductService(db).listByIds([variant.productId]);
  if (!product) return null;

  const name = resolveLocalizedText(product.name, 'tr');
  return {
    kind: 'product',
    name,
    detail: resolveLocalizedText(variant.label, 'tr') || null,
    // Sürüm damgası cache kırar (`05.11`): damgasız URL yeni yüklenen görseli bir yıl eski
    // önbelleğin arkasında bırakırdı.
    imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
    // Odak/zoom operatörün ürün ekranında seçtiği değer — dar banda oturan fotoğraf merkezden değil,
    // ürünün kendisinden kırpılıyor.
    crop: cropOf(product),
    // Tek ürünlü konuda çoğul görsel yok: `imageUrl` zaten "bu neye benziyor" cevabını veriyor.
    images: [],
    // Ürün ekranı bir DİYALOG kullanıyor, doğrudan derin bağlantısı yok; arama süzgeci en yakın
    // karşılık ve tek satırda kuruluyor (`productsUrl` — rota sözleşmesi orada, `STACK §4`).
    href: productsUrl({ tab: 'products', q: name, cat: 'all', status: 'all', incomplete: false, creating: false }),
  };
}
