import {
  BundleService,
  CategoryService,
  CollectionService,
  DeliveryZoneService,
  DiscountService,
  MoneyMovementService,
  MovementNatureService,
  ProductService,
  ProductVariantService,
  RecipeService,
  StockIntakeService,
  StockService,
} from '@lezzet/database';
import { acceptsNature, classificationTypeOf, matchNature } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseProposalPayload,
  type AssistantProposal,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type FeaturedFlagPayload,
  type MoneyDocumentPayload,
  type MoneyMovementPayload,
  type NewVariantBarcode,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type SupplierCreatePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import { createMoneyDocument } from '../accounting/document';
import { learnCode } from '../warehouse/scan';
import { openPurchaseDraft } from '../warehouse/supply';
import { createSupplier, duplicateSupplierMessage } from '../warehouse/supplier';

/**
 * Onaylanmış önerinin uygulanması (`AI_ADMIN_ASSISTANT §5`): her uygulayıcı ekrandaki server action'ların çağırdığı aynı servis
 * kapısını çağırır, çünkü kuyruğun kendi yazımı DOMAIN kurallarını atlanabilir kılardı. Öneri taze olsa da gerçek onay anında yeniden
 * doğrulanır; kayıt (`APPLIERS`) ile şema sözlüğü (`PROPOSAL_PAYLOAD_SCHEMAS`) aynı tipleri taşır ve testi bu eşliği kilitler.
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
  // Tedarikçi zorunludur, çünkü eşlenmemiş kalemlerden sipariş açılamaz ve tedarikçisiz taslak kime gideceği bilinmeden kalırdı.
  // Faturadan sipariş bu kapıdan uygulanmaz: onayı faturanın belgesini de yazar, tek doğru yol kuyruğun gövdesidir
  // (`createDraftFromProposalAction`).
  if (payload.source === 'invoice') throw new Error('Faturadan sipariş kuyruğun formundan onaylanır — fatura belgesi orada doğar.');
  if (!payload.supplierId) throw new Error('Tedarikçisi belirlenmemiş öneriden sipariş açılamaz.');
  const draft = await openPurchaseDraft(db, {
    supplierId: payload.supplierId,
    lines: payload.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      // Hedef depo kalem başına yazılır: hedefsiz sipariş hiçbir deponun eksiğini kapatmaz ve "yolda" hesabı 0 kalırdı.
      targetWarehouseId: payload.warehouseId,
    })),
    note: payload.note,
  });
  if (draft.status !== 'ok') throw new Error('Bir sipariş tek işe yazılır; QUALITE ve Lezzet depolarının kalemleri ayrı siparişle açılır.');
  return { purchaseOrderId: draft.order.id };
};

/**
 * Paket taslağı pasif doğar (`isActive: false`): onay "paketi kur" demektir, yayına almak katalog ekranının kararıdır. Payların
 * mutabakatı burada hesaplanmaz, `BundleService.create` motorun kuralını (`bundleBalance`) uygular.
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
    // Belgenin tarihi; verilmezse kapı bugüne yazar. Fatura çoğu zaman önceki günündür ve yanlış tarihe düşen kabul stok yaşını kaydırır.
    ...(payload.date ? { date: payload.date } : {}),
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
  /*
    Tür sözlükten: dilekçe sözlük slug'ını taşır ama burada yeniden eşlenir, çünkü sözlük öneri ile onay arasında değişmiş olabilir;
    bulunmazsa hareket türsüz yazılır ve izah kuyruğuna düşer. Transfer tür almaz, onu karşı hesabı açıklar (`acceptsNature`).
  */
  const nature =
    acceptsNature(payload.type) && payload.nature
      ? (matchNature(await new MovementNatureService(db).list({ activeOnly: true }), payload.nature, payload.direction)?.slug ?? null)
      : null;
  const row = await new MoneyMovementService(db).insert({
    accountId: payload.accountId,
    direction: payload.direction,
    amountCents: payload.amountCents,
    // Türlü satırın kaba tipi TÜRDEN türer (motor: `classificationTypeOf`) — elle girişin ve satır
    // seçicisinin kapısıyla aynı kural: türlü çıkış giderdir, sermaye girişi sermayedir.
    type: nature ? classificationTypeOf(payload.direction, nature) : payload.type,
    nature,
    description: payload.description,
    // Cari sunucuda tam adla çözülmüş kimliktir (`pinpointCounterparty`); tedarikçi bu tipte yok.
    counterpartyId: payload.counterpartyId,
    counterAccountId: payload.counterAccountId,
    ...(payload.valueDate ? { valueDate: payload.valueDate } : {}),
    source: 'manual',
  });
  return { moneyMovementId: row.id };
};

/**
 * Bölgeye posta kodu ekleme: kapı kümeyi yazar (`replacePostalCodes`), bu yüzden uygulayıcı mevcut kodları okuyup üstüne ekler, yoksa
 * "ekle" sessizce "değiştir" olurdu. Bildirim buradan gitmez; `zone_available` uzlaştırma işi bekleyenleri kendisi bulur.
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
  // Yalnız gelen alanlar yazılır, çünkü `undefined` geçmek dolu bir beyanı sessizce boşaltır; `status` yayın kararı olduğu için geçilmez.
  // Ürün satırına yalnız dolu yama gider: alansız `update` satır döndürmez ve kapı "tek kayıt bekleniyordu" diye düşerdi.
  const productPatch = { ...declarationUpdate(payload.fields), ...identityUpdate(payload.identity) };
  if (Object.keys(productPatch).length > 0) await new ProductService(db).updateDetails(payload.productId, productPatch);
  // Boy satırı KİMLİKLE güncellenir, liste yeniden yazılmaz (`syncVariants` eksik satırı silerdi):
  // dilekçe var olan boyun boş alanını doldurur, ürünün öteki boyları yerinde kalır. Kimliksiz satır
  // YENİ boydur ve listenin sonuna eklenir — mevcut boyların sırası oynamaz.
  const variants = new ProductVariantService(db);
  const yeniler = payload.variants.filter((v) => v.variantId === undefined);
  let sira = yeniler.length === 0 ? 0 : Math.max(-1, ...(await variants.listByProduct(payload.productId)).map((v) => v.sortOrder)) + 1;
  for (const edit of payload.variants) {
    // `variantLabel` boyun OKUNUR adı (kartın işi), `barcode` ayrı bir eşleme kaydı: ikisi de kolon
    // değil, patch'e girerlerse yazma reddedilirdi.
    const patch = Object.fromEntries(
      Object.entries(edit).filter(([key, value]) => !['variantId', 'variantLabel', 'barcode'].includes(key) && value !== undefined),
    );
    const variantId = edit.variantId ?? (await variants.insert({ productId: payload.productId, ...patch, sortOrder: sira++ })).id;
    if (edit.variantId && Object.keys(patch).length > 0) await variants.update({ id: edit.variantId, ...patch });
    if (edit.barcode) await bindBarcode(db, variantId, edit.barcode);
  }
  return { productId: payload.productId };
};

/**
 * Ambalajın kodunu boya bağlar. Kod başkasına bağlıysa FIRLATIR: öneri `failed` olur ve sebebi satırda
 * kalır — sessizce atlansaydı patron kodu yazıldı sanırdı ve arıza ilk kez depoda görünürdü.
 */
async function bindBarcode(db: SupabaseClient, variantId: string, barcode: NewVariantBarcode): Promise<void> {
  const outcome = await learnCode(db, { ...barcode, variantId, actorId: null });
  if (outcome.status === 'already_bound') {
    throw new Error(
      `"${barcode.code}" kodu «${outcome.productName} ${outcome.variantLabel}» boyuna bağlı — eşleme silinmeden yeniden bağlanamaz.`,
    );
  }
}

/** Künye alanları — beyanla aynı kural: verilmeyen alan hiç yazılmaz, kategori `null` "kategorisiz"tir. */
function identityUpdate(identity: ProductDraftPayload['identity']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['categoryId', 'dateType', 'shelfLifeDays', 'shippable', 'storageType'] as const) {
    if (identity[key] !== undefined) out[key] = identity[key];
  }
  return out;
}

/**
 * Payload'ın beyan alanlarını `updateDetails` girdisine çevirir; verilmeyen alan hiç yazılmaz, çünkü `{ description: undefined }`
 * dolu bir açıklamayı fark edilmeden boşaltır ve ürün metinlerinde sürüm tutulmaz.
 */
function declarationUpdate(p: {
  name?: unknown;
  description?: unknown;
  ingredients?: unknown;
  storageInstructions?: unknown;
  nutrition?: unknown;
  allergens?: unknown;
  traces?: unknown;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['name', 'description', 'ingredients', 'storageInstructions', 'nutrition', 'allergens', 'traces'] as const) {
    if (p[key] !== undefined) out[key] = p[key];
  }
  return out;
}

/**
 * Ambalajdan yeni ürün: ürün aday (`candidate`) doğar ve bu payload'la değiştirilemez, çünkü beyanı doldurmak ile satışa çıkarmak ayrı
 * eksenlerdir (`AI_ADMIN_ASSISTANT §6`). Fiyat ve stok ayrı karardır; en az bir varyant şarttır, çünkü fiyat ve stok varyanta bağlıdır.
 */
const applyProductCreate: Applier = async (db, raw) => {
  const payload = parseProposalPayload('product_create', raw) as ProductCreatePayload;
  const { product, variants } = await new ProductService(db).create({
    ...declarationUpdate(payload),
    name: payload.name,
    categoryId: payload.categoryId,
    dateType: payload.dateType,
    shelfLifeDays: payload.shelfLifeDays,
    vatRate: payload.vatRate,
    status: 'candidate',
    // Kargolanabilirlik yalnız biliniyorsa yazılır: `null` "okunamadı" demektir ve kapının varsayılanı (`false`, güvenli taraf)
    // geçerli kalmalı.
    ...(payload.shippable === null ? {} : { shippable: payload.shippable }),
    // Saklama rejimi de yalnız BİLİNİYORSA yazılır; bilinmeyende kapının varsayılanı (donuk) kalır ve
    // operatör formda düzeltir — uydurma bir rejim, ürünün iade/imha kuralını sessizce değiştirirdi.
    ...(payload.storageType === null ? {} : { storageType: payload.storageType }),
    variants: payload.variants.map((v, index) => ({
      label: v.label,
      // Ambalajdan okunan ölçüler: kilo başı fiyat ve kargo hesabı bu alandan çıkar, etiket yazılıp ağırlık boş bırakılmaz.
      netQuantity: v.netQuantity,
      netUnit: v.netUnit,
      piecesCount: v.piecesCount,
      portionKind: v.portionKind,
      // Ambalajlı ürün ölçüsü — ambalajda YAZMAZ, ölçülür (şema künyesi). Model tahmin etmesin
      // diye araç künyesi açıkça uyarıyor; buraya ne geldiyse o yazılır, `null` "ölçülmedi"dir.
      packedWeightG: v.packedWeightG,
      packedLengthMm: v.packedLengthMm,
      packedWidthMm: v.packedWidthMm,
      packedHeightMm: v.packedHeightMm,
      sortOrder: index,
    })),
  } as Parameters<ProductService['create']>[0]);
  // Kod eşlemesi boylar doğduktan sonra kurulur; sıra korunur, `create` girdiyi olduğu gibi yazar.
  for (const [index, v] of payload.variants.entries()) {
    const variantId = variants[index]?.id;
    if (v.barcode && variantId) await bindBarcode(db, variantId, v.barcode);
  }
  return { productId: product.id };
};

/**
 * Kampanya pasif doğar (`isActive: false`): yayına alınan indirim sepetlere işler, yayın kararı fiyat ekranındadır. Kupon kodu burada
 * üretilmez, çünkü tekillik veritabanının işidir ve öneri anındaki kod onaya kadar başkasına verilmiş olabilir.
 */
const applyDiscountDraft: Applier = async (db, raw) => {
  const payload = parseProposalPayload('discount_draft', raw) as DiscountDraftPayload;
  const row = await new DiscountService(db).insert({
    name: payload.name,
    // Müşterinin sepette gördüğü indirim etiketi bu alandan gelir; verilmezse "İndirim · Kampanya" yazar. Kural veride de durur,
    // burası uygulama tarafıdır.
    publicLabel: payload.publicLabel,
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
    // Süre, öğün ve evden gerekenler dilekçede doldurulduysa burada da yazılır, yoksa tarif eksik doğar.
    duration: payload.duration ?? null,
    meal: payload.meal ?? null,
    pantry: payload.pantry ?? null,
    isActive: false,
    items: payload.items.map((item, index) => ({ variantId: item.variantId, qty: item.qty, sortOrder: index })),
  });
  return { recipeId: recipe.id };
};

/**
 * Parti teklifi müşterinin gördüğü fiyatı değiştirir: onaylandığı an vitrinde fırsat olarak görünür, taslak evresi yoktur. Partinin
 * hâlâ yerinde olduğuna bakılır, yoksa `failed` döner, çünkü olmayan partiye fiyat yazmak sessiz bir yalan olurdu.
 */
const applyBatchOffer: Applier = async (db, raw) => {
  const payload = parseProposalPayload('batch_offer', raw) as BatchOfferPayload;
  const service = new StockService(db);
  const [batch] = await service.getBatchDetails([payload.batchId]);
  if (!batch) throw new Error(`Parti bulunamadı ya da tükendi: ${payload.productName} (${payload.expiryDate})`);
  const row = await service.setOfferPrice(payload.batchId, payload.offerPriceCents);
  return { stockId: row.id };
};

/**
 * Belge, belge kapısından (`createMoneyDocument`): Para ekranının eylemiyle aynı kurallar uygulanır. Dilekçe iş taşımaz, kapı onu karşı
 * tarafın varsayılanından kurar; cari çözülemediyse ya da varsayılan yoksa kapı reddeder ve seçim kuyruğun formunda yapılır.
 */
const applyMoneyDocument: Applier = async (db, raw) => {
  const payload = parseProposalPayload('money_document', raw) as MoneyDocumentPayload;
  const outcome = await createMoneyDocument(db, {
    kind: payload.kind,
    number: payload.number,
    issuedOn: payload.issuedOn,
    dueOn: payload.dueOn,
    supplierId: payload.supplierId,
    counterpartyId: payload.counterpartyId,
    direction: payload.direction,
    nature: payload.nature,
    amountCents: payload.amountCents,
    vatLines: payload.vatLines,
    vatRegime: payload.vatRegime,
    note: payload.note,
  });
  if (outcome.status === 'invalid') throw new Error(`Belge yazılamadı (${outcome.reason}).`);
  return { moneyDocumentId: outcome.document.id };
};

/** Tedarikçi, Tedarik ekranının kapısından (`createSupplier`): nokta atışı mükerrer yoklamasıyla. */
const applySupplierCreate: Applier = async (db, raw) => {
  const payload = parseProposalPayload('supplier_create', raw) as SupplierCreatePayload;
  const outcome = await createSupplier(db, { ...payload, isActive: true });
  if (outcome.status === 'duplicate') throw new Error(duplicateSupplierMessage(outcome.existingName));
  return { supplierId: outcome.supplierId };
};

export const APPLIERS = {
  featured_flag: applyFeaturedFlag,
  money_document: applyMoneyDocument,
  supplier_create: applySupplierCreate,
  batch_offer: applyBatchOffer,
  purchase_order: applyPurchaseOrder,
  bundle_draft: applyBundleDraft,
  stock_intake: applyStockIntake,
  money_movement: applyMoneyMovement,
  zone_extend: applyZoneExtend,
  product_draft: applyProductDraft,
  product_create: applyProductCreate,
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
