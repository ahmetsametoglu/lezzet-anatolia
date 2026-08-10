import 'server-only';
import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { cropOf, CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type { AssistantProposal, BundleDraftPayload, DiscountDraftPayload, ImageCrop } from '@lezzet/types';
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
  return null;
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
  const db = serviceDb();
  const variantIds = payload.items.map((item) => item.variantId);
  if (variantIds.length === 0) return null;

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const byProduct = new Map(products.map((p) => [p.id, p]));

  const images = variantIds.flatMap((id) => {
    const product = byProduct.get(byVariant.get(id)?.productId ?? '');
    const url = product ? publicImageUrl(product.imageKey, product.imageUpdatedAt) : null;
    // Kırpma ürünün KENDİ künyesinden: her kalem kendi odağıyla oturuyor. Ortak bir merkez kırpma
    // vermek, dikey çekilmiş bir fotoğrafın ürününü bandın dışında bırakırdı.
    return url && product ? [{ url, crop: cropOf(product) }] : [];
  });

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
