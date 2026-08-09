import {
  BundleService,
  CategoryService,
  CollectionService,
  DeliveryZoneService,
  DiscountService,
  MoneyMovementService,
  ProductService,
  PurchaseOrderService,
  RecipeService,
  StockIntakeService,
  StockService,
} from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseProposalPayload,
  type AssistantProposal,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type FeaturedFlagPayload,
  type MoneyMovementPayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type ZoneExtendPayload,
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

/**
 * Mal kabul — `receive_intake` RPC'sinin sarmalayıcısından geçer (giriş + partiler + PO kapanışı
 * + son alış fiyatı BÖLÜNEMEZ). Uygulayıcı bunu bilmez, sadece kapıyı çağırır: bölünmezliği
 * servis/RPC garanti eder, kuyruk kendi sırasını uydurmaz.
 */
const applyStockIntake: Applier = async (db, raw) => {
  const payload = parseProposalPayload('stock_intake', raw) as StockIntakePayload;
  const result = await new StockIntakeService(db).receive({
    warehouseId: payload.warehouseId,
    supplierId: payload.supplierId,
    purchaseOrderId: payload.purchaseOrderId,
    note: payload.documentNo,
    lines: payload.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber,
      unitCostCents: line.unitCostCents,
    })),
  });
  return { stockIntakeId: result.intakeId };
};

/**
 * Para hareketi — sipariş bağlı tipler (`order_payment`/`order_refund`) şemada YOK ve olmayacak:
 * onların tek meşru kaynağı siparişin kendi akışıdır (`recordForOrder`). Asistan elle bir tahsilat
 * yazabilseydi, sipariş bakiyesi iki ayrı yerden değişir ve mutabakat sessizce bozulurdu.
 */
const applyMoneyMovement: Applier = async (db, raw) => {
  const payload = parseProposalPayload('money_movement', raw) as MoneyMovementPayload;
  const row = await new MoneyMovementService(db).insert({
    accountId: payload.accountId,
    direction: payload.direction,
    amountCents: payload.amountCents,
    type: payload.type,
    category: payload.category,
    description: payload.description,
    supplierId: payload.supplierId,
    counterAccountId: payload.counterAccountId,
    ...(payload.valueDate ? { valueDate: payload.valueDate } : {}),
    source: 'manual',
  });
  return { moneyMovementId: row.id };
};

/**
 * Bölgeye posta kodu ekleme — kapı `replacePostalCodes` yani KÜMEYİ yazar. Uygulayıcı bu yüzden
 * önce mevcut kodları okur ve üstüne ekler: doğrudan yazsaydı bölgenin var olan kodları silinirdi
 * ("ekle" denen bir öneri, sessizce "bunlarla değiştir" olurdu).
 *
 * **Bildirim buradan GİTMEZ:** `zone_available` uzlaştırma işi (saatte bir) "kapsanmış hâle gelmiş
 * ve haberi gitmemiş" bekleyişleri kendi bulur. İkinci bir gönderim yolu açmak aynı müşteriye iki
 * mesaj demekti.
 */
const applyZoneExtend: Applier = async (db, raw) => {
  const payload = parseProposalPayload('zone_extend', raw) as ZoneExtendPayload;
  const service = new DeliveryZoneService(db);
  const zones = await service.listWithCodes();
  const zone = zones.find((z) => z.id === payload.zoneId);
  if (!zone) throw new Error('Bölge bulunamadı — silinmiş olabilir.');

  const country = payload.country as (typeof zone.postalCodes)[number]['country'];
  const existing = zone.postalCodes.map((c) => ({ country: c.country, postalCode: c.postalCode }));
  const wanted = payload.postalCodes.map((c) => ({ country, postalCode: c.postalCode }));
  const merged = [...existing];
  for (const code of wanted) {
    if (!merged.some((c) => c.country === code.country && c.postalCode === code.postalCode)) merged.push(code);
  }

  await service.replacePostalCodes(payload.zoneId, merged);
  return { zoneId: payload.zoneId, addedCount: String(merged.length - existing.length) };
};

/**
 * Ürün taslağının doldurulması — ürün TASLAKTA KALIR. Alerjen/saklama zaten şemada yok (yazılamaz);
 * yayına alma da burada yapılmaz: `status` bu kapıya hiç geçilmiyor, o karar katalog ekranında.
 */
const applyProductDraft: Applier = async (db, raw) => {
  const payload = parseProposalPayload('product_draft', raw) as ProductDraftPayload;
  await new ProductService(db).updateDetails(payload.productId, payload.fields);
  return { productId: payload.productId };
};

/**
 * Kampanya/indirim — **pasif doğar** (`isActive: false`). Onay "kampanyayı hazırla" demektir,
 * "yayına al" değil: indirim yayına alındığı an sepetlere işler ve geri alınması müşterinin
 * gördüğü fiyatı değiştirir. Yayın kararı fiyat ekranında.
 *
 * Kupon KODU burada üretilmez: kod tekilliği veritabanının işi (`discount_code`) ve öneri
 * anındaki bir kod, onaya kadar geçen sürede başkasına verilmiş olabilir.
 */
const applyDiscountDraft: Applier = async (db, raw) => {
  const payload = parseProposalPayload('discount_draft', raw) as DiscountDraftPayload;
  const row = await new DiscountService(db).insert({
    name: payload.name,
    trigger: payload.trigger,
    type: payload.type,
    percent: payload.percent,
    amountCents: payload.amountCents,
    scope: payload.scope,
    categoryId: payload.categoryId,
    collectionId: payload.collectionId,
    minBasketCents: payload.minBasketCents,
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    isActive: false,
  });
  return { discountId: row.id };
};

/**
 * Sofra tarifi taslağı — **pasif doğar** ve üç dil dolmadan zaten yayınlanamaz (kural VERİDE).
 * Malzemeler varyanta bağlanır; slug addan türer (servis kapısı üretir).
 */
const applyRecipeDraft: Applier = async (db, raw) => {
  const payload = parseProposalPayload('recipe_draft', raw) as RecipeDraftPayload;
  const recipe = await new RecipeService(db).createWithItems({
    name: payload.name,
    description: payload.description ?? null,
    steps: payload.steps,
    serves: payload.serves ?? null,
    isActive: false,
    items: payload.items.map((item, index) => ({ variantId: item.variantId, qty: item.qty, sortOrder: index })),
  });
  return { recipeId: recipe.id };
};

/**
 * Parti teklifi — tek kolon (`stock.offer_price`) ama **öteki dokuzdan farklı bir şey yapıyor:
 * müşterinin gördüğü fiyatı değiştiriyor** (kullanıcı kararı 09.08). Onaylandığı an vitrinde
 * "fırsat" olarak görünür; taslak evresi yoktur.
 *
 * Parti hâlâ yerinde mi diye BAKILIR: onay anına kadar geçen sürede satılıp bitmiş ya da imha
 * edilmiş olabilir. Yoksa `failed` — olmayan bir partiye fiyat yazmak sessiz bir yalan olurdu.
 */
const applyBatchOffer: Applier = async (db, raw) => {
  const payload = parseProposalPayload('batch_offer', raw) as BatchOfferPayload;
  const service = new StockService(db);
  const [batch] = await service.getBatchDetails([payload.batchId]);
  if (!batch) throw new Error(`Parti bulunamadı ya da tükendi: ${payload.productName} (${payload.expiryDate})`);
  const row = await service.setOfferPrice(payload.batchId, payload.offerPriceCents);
  return { stockId: row.id };
};

export const APPLIERS = {
  featured_flag: applyFeaturedFlag,
  batch_offer: applyBatchOffer,
  purchase_order: applyPurchaseOrder,
  bundle_draft: applyBundleDraft,
  stock_intake: applyStockIntake,
  money_movement: applyMoneyMovement,
  zone_extend: applyZoneExtend,
  product_draft: applyProductDraft,
  discount_draft: applyDiscountDraft,
  recipe_draft: applyRecipeDraft,
} as const;

export type ApplicableKind = keyof typeof APPLIERS;

/** Bir öneriyi uygular. Kind desteklenmiyorsa fırlatır — sessiz "hiçbir şey olmadı" hâli yok. */
export async function applyProposal(db: SupabaseClient, proposal: AssistantProposal): Promise<ApplyResult> {
  const applier = (APPLIERS as Record<string, Applier | undefined>)[proposal.kind];
  if (!applier) throw new Error(`[assistant] '${proposal.kind}' tipi için uygulayıcı yok.`);
  return applier(db, proposal.payload);
}
