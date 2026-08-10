import 'server-only';
import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText } from '@lezzet/types';
import type { AssistantProposal, DiscountDraftPayload } from '@lezzet/types';
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
  return null;
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
    // Ürün ekranı bir DİYALOG kullanıyor, doğrudan derin bağlantısı yok; arama süzgeci en yakın
    // karşılık ve tek satırda kuruluyor (`productsUrl` — rota sözleşmesi orada, `STACK §4`).
    href: productsUrl({ tab: 'products', q: name, cat: 'all', status: 'all', incomplete: false, creating: false }),
  };
}
