import { BundleService, CategoryService, CollectionService, PurchaseOrderService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseProposalPayload,
  type AssistantProposal,
  type BundleDraftPayload,
  type FeaturedFlagPayload,
  type PurchaseOrderPayload,
} from '@lezzet/types';

/**
 * Onaylanmış önerinin UYGULANMASI (22.3) — `AI_ADMIN_ASSISTANT §5`.
 *
 * ── TEK KURAL: KUYRUK İKİNCİ BİR YAZMA YOLU AÇMAZ ───────────────────────────
 * Buradaki her uygulayıcı, ekrandaki server action'ların çağırdığı **AYNI servis kapısını**
 * çağırır. Kuyruk kendi `insert`ini yazsaydı, DOMAIN kuralları (paket mutabakatı, PO'nun hedef
 * deposu, vitrin işaretinin niyet/gerçek ayrımı) asistan yolunda atlanabilir olurdu — ve
 * atlanabilen kural, bir gün atlanmış kuraldır.
 *
 * ── ÖNERİ TAZE OLSA DA GERÇEK YENİDEN DOĞRULANIR ────────────────────────────
 * `expires_at` bayat öneriyi patronun ÖNÜNE koymamak içindir; buradaki motor doğrulaması ise
 * onun yerine geçmez, ardından gelir. Onay anında stok bitmiş, ürün pasifleşmiş, tedarikçi
 * silinmiş olabilir — o hâlde servis fırlatır ve öneri `failed` olur, sebebiyle birlikte.
 *
 * ── UYGULAYICI YOKSA ÖNERİ DE YOKTUR ────────────────────────────────────────
 * Kayıt (`APPLIERS`) ile payload şeması sözlüğü (`PROPOSAL_PAYLOAD_SCHEMAS`) aynı üç tipi taşır.
 * Şeması olup uygulayıcısı olmayan bir tip, panelde onaylanıp hiçbir şey yapmayan bir kalem
 * üretirdi; testi bu eşliği kilitliyor.
 */

/** Uygulamanın doğurduğu kayıtların kimlikleri — satıra yazılır ("bu paketi kim kurdu"). */
export type ApplyResult = Record<string, string | undefined>;

type Applier = (db: SupabaseClient, payload: unknown) => Promise<ApplyResult>;

/** Vitrin işareti — üç varlığın da kendi `setFeatured` kapısı var (genel `update` değil). */
const applyFeaturedFlag: Applier = async (db, raw) => {
  const payload = parseProposalPayload('featured_flag', raw) as FeaturedFlagPayload;
  if (payload.target === 'category') {
    const row = await new CategoryService(db).setFeatured(payload.id, payload.isFeatured);
    return { categoryId: row.id };
  }
  if (payload.target === 'collection') {
    const row = await new CollectionService(db).setFeatured(payload.id, payload.isFeatured);
    return { collectionId: row.id };
  }
  const row = await new BundleService(db).setFeatured(payload.id, payload.isFeatured);
  return { bundleId: row.id };
};

/**
 * Tedarik siparişi — TASLAK doğar (`draft`), gönderilmez. Gönderme ayrı ve insanlı bir adımdır:
 * onay "bu siparişi hazırla" demektir, "tedarikçiye yolla" değil.
 */
const applyPurchaseOrder: Applier = async (db, raw) => {
  const payload = parseProposalPayload('purchase_order', raw) as PurchaseOrderPayload;
  // Tedarikçi ZORUNLU ve kapının kendi kuralı: eşlenmemiş kalemlerden sipariş açılamaz. Öneri
  // tedarikçisiz geldiyse burada durur — asistanın "bir şekilde" sipariş açması, sonradan kimin
  // gönderileceği bilinmeyen bir taslak bırakırdı.
  if (!payload.supplierId) throw new Error('Tedarikçisi belirlenmemiş öneriden sipariş açılamaz.');
  const { order } = await new PurchaseOrderService(db).createDraft(
    payload.supplierId,
    payload.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      // Hedef depo kalem başına yazılır (C7): hedefsiz sipariş hiçbir deponun eksiğini kapatmaz
      // ve "yolda" hesabı tam da bu akışta sessizce 0 kalırdı.
      targetWarehouseId: payload.warehouseId,
    })),
    payload.note,
  );
  return { purchaseOrderId: order.id };
};

/**
 * Paket taslağı — **pasif doğar** (`isActive: false`). Onay "paketi kur" demektir, "vitrine çıkar"
 * değil: yayına almak ayrı bir karardır ve o karar katalog ekranında verilir. Aynı ayrım ürün ve
 * tarif taslaklarında da geçerli (taslak-varlık deseni, `AI_ADMIN_ASSISTANT §5`).
 *
 * Payların mutabakatı burada HESAPLANMAZ: `BundleService.create` kalemleri yazarken kuralı motor
 * uygular (`bundleBalance`) — ikinci bir kopya, bir gün ötekinden ayrılacak bir kuraldır.
 */
const applyBundleDraft: Applier = async (db, raw) => {
  const payload = parseProposalPayload('bundle_draft', raw) as BundleDraftPayload;
  const { bundle } = await new BundleService(db).create({
    name: payload.name,
    description: payload.description ?? null,
    totalPrice: payload.totalPrice,
    serves: payload.serves ?? null,
    isActive: false,
    items: payload.items.map((item) => ({
      variantId: item.variantId,
      qty: item.qty,
      allocatedUnitPrice: item.allocatedUnitPrice,
    })),
  });
  return { bundleId: bundle.id };
};

export const APPLIERS = {
  featured_flag: applyFeaturedFlag,
  purchase_order: applyPurchaseOrder,
  bundle_draft: applyBundleDraft,
} as const;

export type ApplicableKind = keyof typeof APPLIERS;

/** Bir öneriyi uygular. Kind desteklenmiyorsa fırlatır — sessiz "hiçbir şey olmadı" hâli yok. */
export async function applyProposal(db: SupabaseClient, proposal: AssistantProposal): Promise<ApplyResult> {
  const applier = (APPLIERS as Record<string, Applier | undefined>)[proposal.kind];
  if (!applier) throw new Error(`[assistant] '${proposal.kind}' tipi için uygulayıcı yok.`);
  return applier(db, proposal.payload);
}
