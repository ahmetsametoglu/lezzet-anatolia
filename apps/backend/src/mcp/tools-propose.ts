import {
  AccountService,
  AssistantProposalService,
  BundleService,
  CategoryService,
  CollectionService,
  DeliveryZoneService,
  PostalCodeDemandService,
  PriceService,
  ProductService,
  ProductVariantService,
  ReorderService,
  SettingsService,
  StockService,
  SupplierService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import { discountPercentOf, offerDecisionOf, rebalanceAllocations, suggestedOfferPriceCents } from '@lezzet/domain-core';
import {
  parseProposalPayload,
  resolveLocalizedText,
  type AssistantProposalKind,
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
 * MCP'nin YAZMA araçları (22.3) — ve hiçbiri bir tabloya yazmaz.
 *
 * Her araç `assistant_proposal` kuyruğuna bir DİLEKÇE bırakır; patron operasyon panelinden onaylar,
 * uygulama ondan sonra ve normal servis/motor yolundan koşar (`AI_ADMIN_ASSISTANT §5`). Onay aracı
 * BİLEREK YOKTUR: asistan kendi önerisini onaylayamaz — kuyruğun tek vaadi budur.
 *
 * ── ÖNERİ ÜRETİLİRKEN GERÇEK OKUNUR ─────────────────────────────────────────
 * Araçlar payload'ı modelin verdiği kimliklerle KÖRÜ KÖRÜNE kurmaz: kaydın var olduğunu ve adını
 * veritabanından doğrular. Sebebi somut — model bir uuid'yi yanlış hatırlarsa kuyruğa panelde
 * "(silinmiş kayıt)" diye çizilecek bir kalem düşer ve patron neyi onayladığını göremez.
 *
 * ── ÖZET CÜMLESİ ARACIN SORUMLULUĞU ─────────────────────────────────────────
 * `summary` panelin gösterdiği tek cümledir. Modelin serbest metnine bırakılmaz, BURADA kurulur:
 * aynı tip her zaman aynı biçimde okunsun ve cümle gerçekten yapılacak işi anlatsın.
 */

/**
 * Kimlik BİÇİMİ — veritabanına gitmeden (harici MCP denetiminin önerisi, 09.08 · tur 2).
 *
 * Bozuk bir kimliği Postgres'e sormanın iki bedeli var: boşa bir sorgu, ve operatöre modelin
 * anlamadığı bir cümle (`invalid input syntax for type uuid … 22P02`). Asıl bedel ise TOPLU HATA
 * DÖNÜŞÜNÜN ÇÖKMESİYDİ: `listByIds` tek bozuk kimlikle komple patlıyor, o yüzden öteki dört satırın
 * sorunu hiç ölçülemeden istisna dönüyordu. Biçim burada süzülünce sorgu ayakta kalır ve model
 * bütün sorunları tek turda görür.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Tekil kimlik alanı için standart ret — örnek kimlikle, ki model biçimi tahmin etmesin. */
function badIdError(field: string, value: string) {
  return {
    error: `${field} geçersiz — kimlik UUID biçiminde olmalı (örn. 550e8400-e29b-41d4-a716-446655440000), gelen: "${value}".`,
  };
}

/** Önerinin ömrü — ayarlanabilir (`DOMAIN §6`: eşik/süre parametriktir), varsayılan 24 saat. */
async function expiryIso(): Promise<string> {
  const hours = await new SettingsService(serviceDb()).getNumber('assistant_proposal_ttl_hours', 24);
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function queue(kind: AssistantProposalKind, payload: unknown, summary: string, reason?: unknown) {
  // Şema kapısı BURADA da geçilir: kuyruğa şekli bozuk bir dilekçe girerse panel onu çizemez.
  parseProposalPayload(kind, payload);
  const row = await new AssistantProposalService(serviceDb()).create({
    kind,
    payload,
    summary,
    // Gerekçe ZORUNLU DEĞİL ve öyle kalmalı: zorunlu olsaydı model gerekçe uydururdu. Boş
    // bırakılabilmesi dürüstlüğün ucuz yolu — panel onu ayrı (soluk) bir hâlle gösteriyor.
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    expiresAt: await expiryIso(),
    sourceSession: 'mcp',
  });
  return {
    proposalId: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    note: 'Öneri onay kuyruğuna yazıldı. Uygulanması için yöneticinin operasyon panelinden onaylaması gerekir — sen onaylayamazsın.',
  };
}

/**
 * Parti teklifi önerisi — SKT'si yaklaşan malı eritmenin DOĞRU aracı (kullanıcı kararı 09.08).
 *
 * ── NEDEN İNDİRİM DEĞİL, PARTİ TEKLİFİ ──────────────────────────────────────
 * Harici denetim "indirime ürün bazlı kapsam ekleyin" demişti; teşhis doğruydu (koleksiyona açılan
 * indirim tarihi uzak malı da ucuzlatıyor) ama çözüm yanlıştı. İndirim ürünün TAMAMINI kapsar;
 * oysa ucuzlaması gereken şey ürün değil **o parti**. Aynı ürünün taze partisi tam fiyatta kalmalı.
 * `stock.offer_price` tam bunun için var ve vitrinin fırsat bandı zaten onu okuyor.
 *
 * ── KARARI MOTOR VERİR, MODEL DEĞİL ─────────────────────────────────────────
 * "Bu partiye teklif açılabilir mi" sorusunu `offerDecisionOf` cevaplar: DLC'si geçmiş partiye
 * teklif YAZILAMAZ (satılamaz, tek yol imha) ve araç bunu reddeder. Model ısrar edemez — kural
 * motorda, prompt'ta değil.
 *
 * Fiyatı model verebilir ama vermek zorunda değil: boş bırakılırsa motorun önerdiği fiyat
 * (%30 indirim, parametrik) kullanılır.
 */
export async function proposeBatchOffer(args: Record<string, unknown>) {
  const db = serviceDb();
  const batchId = String(args.batchId ?? '').trim();
  if (!batchId) return { error: 'batchId zorunlu (stock_watch çıktısındaki partilerden).' };
  if (!isUuid(batchId)) return badIdError('batchId', batchId);

  const [batch] = await new StockService(db).getBatchDetails([batchId]);
  if (!batch) return { error: `Parti bulunamadı: ${batchId} — stock_watch ile güncel listeyi alın.` };
  if (batch.physicalQty <= 0) return { error: 'Bu partide mal kalmamış — teklif açmanın anlamı yok.' };

  const { decision, flag } = offerDecisionOf({
    dateType: batch.variant.product.dateType,
    expiryDate: batch.expiryDate,
    shelfLifeDays: batch.variant.product.shelfLifeDays,
    offerPriceCents: batch.offerPriceCents,
  });
  if (decision === 'must_discard') {
    return { error: `Bu partinin DLC'si geçmiş (${batch.expiryDate}) — satılamaz, tek yol imha. Teklif açılamaz.` };
  }
  if (decision === 'none') {
    return {
      error: `Bu partinin ömrü daha yeterli (${batch.expiryDate}, durum: ${flag}) — teklif kararı henüz gerekmiyor.`,
    };
  }

  const priceMap = await new PriceService(db).findApplicableMap([batch.variantId], 'b2c');
  const listPriceCents = priceMap.get(batch.variantId)?.channelPrice?.amountCents ?? null;

  // Fiyat modelden gelmediyse MOTORDAN gelir. Liste fiyatı da yoksa öneri kurulamaz: uydurma bir
  // taban üzerinden indirim, operatöre olmayan bir hesabı doğruymuş gibi gösterirdi.
  const given = typeof args.offerPriceCents === 'number' ? Math.round(args.offerPriceCents) : null;
  const offerPriceCents = given ?? suggestedOfferPriceCents(listPriceCents);
  if (!offerPriceCents || offerPriceCents <= 0) {
    return { error: 'Teklif fiyatı hesaplanamadı — bu varyantın liste fiyatı yok. offerPriceCents verin ya da fiyat tanımlayın.' };
  }
  if (listPriceCents !== null && offerPriceCents >= listPriceCents) {
    return {
      error: `Teklif liste fiyatını yenmiyor (${offerPriceCents} ≥ ${listPriceCents} cent) — indirim olmayan bir "fırsat" vitrinde de görünmez.`,
    };
  }

  const warehouses = await new WarehouseService(db).list({ activeOnly: true });
  const productName = `${resolveLocalizedText(batch.variant.product.name, 'tr')} · ${resolveLocalizedText(batch.variant.label, 'tr')}`;
  const payload: BatchOfferPayload = {
    batchId: batch.id,
    variantId: batch.variantId,
    productName,
    warehouseCode: warehouses.find((w) => w.id === batch.warehouseId)?.code ?? '?',
    expiryDate: batch.expiryDate,
    offerPriceCents,
    listPriceCents,
    physicalQty: batch.physicalQty,
  };

  const percent = discountPercentOf(listPriceCents, offerPriceCents);
  const off = listPriceCents ? ` (liste ${(listPriceCents / 100).toFixed(2)} €, %${percent === null ? '?' : Math.round(percent)} indirim)` : '';
  const summary = `${productName} — ${batch.physicalQty} adet ${(offerPriceCents / 100).toFixed(2)} € fırsat fiyatına${off}; SKT ${batch.expiryDate}`;
  return queue('batch_offer', payload, summary, args.reason);
}

/** Vitrin işareti önerisi: kayıt kimlikten ÇÖZÜLÜR (ad ve varlık doğrulanır). */
export async function proposeFeaturedFlag(args: Record<string, unknown>) {
  const target = String(args.target ?? '');
  const id = String(args.id ?? '');
  const isFeatured = args.isFeatured !== false;
  if (!['category', 'collection', 'bundle'].includes(target)) {
    return { error: "target 'category' | 'collection' | 'bundle' olmalı." };
  }
  if (!id) return { error: 'id zorunlu.' };
  if (!isUuid(id)) return badIdError('id', id);

  const db = serviceDb();
  // Vitrinin BUGÜNKÜ doluluğu da okunur: "bir tane daha ekle" ile "sekizinciyi ekle" aynı karar
  // değil — vitrin bir liste değil seçkidir, dolu olan aşağı iter (denetim taraması 09.08).
  const [name, featuredCount] = await Promise.all([
    target === 'category'
      ? new CategoryService(db).getById(id).then((r) => r?.name)
      : target === 'collection'
        ? new CollectionService(db).getById(id).then((r) => r?.name)
        : new BundleService(db).getById(id).then((r) => r?.name),
    target === 'category'
      ? new CategoryService(db).list({ activeOnly: true, featuredOnly: true }).then((r) => r.length)
      : target === 'collection'
        ? new CollectionService(db).list({ activeOnly: true, featuredOnly: true }).then((r) => r.length)
        : new BundleService(db).listAll({ activeOnly: true, featuredOnly: true }).then((r) => r.length),
  ]);
  if (!name) return { error: `Kayıt bulunamadı (${target}): ${id}` };

  const label = resolveLocalizedText(name, 'tr');
  const payload: FeaturedFlagPayload = {
    target: target as FeaturedFlagPayload['target'],
    id,
    isFeatured,
    name: label,
    currentlyFeaturedCount: featuredCount,
  };
  const verb = isFeatured ? 'vitrine çıkarılsın' : 'vitrinden çıkarılsın';
  return queue('featured_flag', payload, `${label} ${verb} (${target})`);
}

/**
 * Tedarik siparişi önerisi — kalemler eşik-altı ÖNERİSİNDEN gelir, modelden değil.
 *
 * Model yalnız "hangi depo, hangi tedarikçi" der; adetleri motor hesaplar (`ReorderService`).
 * Adedi modele bıraksaydık, eşiğin altındaki gerçek açığı değil modelin tahminini sipariş ederdik.
 */
export async function proposePurchaseOrder(args: Record<string, unknown>) {
  const db = serviceDb();
  const warehouseCode = String(args.warehouseCode ?? '').trim();
  if (!warehouseCode) return { error: 'warehouseCode zorunlu (örn. "STR").' };

  const warehouse = (await new WarehouseService(db).list({ activeOnly: true })).find((w) => w.code === warehouseCode);
  if (!warehouse) return { error: `Depo bulunamadı: ${warehouseCode}` };

  const groups = await new ReorderService(db).suggestions(warehouse.id);
  const withSupplier = groups.filter((g) => g.supplierId !== null);
  if (withSupplier.length === 0) {
    return { error: `${warehouseCode} deposunda tedarikçisi eşlenmiş, eşik altı kalem yok — sipariş önerisi kurulamıyor.` };
  }

  // Tedarikçi seçilmediyse EN BÜYÜK grup; birden çok tedarikçi varsa modele söylenir ki
  // patrona "hangisi" diye sorabilsin — sessizce birini seçmek, öbür eksiği görünmez kılardı.
  const wanted = typeof args.supplierId === 'string' ? args.supplierId : null;
  const group = wanted ? withSupplier.find((g) => g.supplierId === wanted) : [...withSupplier].sort((a, b) => b.lines.length - a.lines.length)[0];
  if (!group) return { error: `Bu tedarikçi için eşik altı kalem yok: ${wanted}` };

  const supplier = group.supplierId ? await new SupplierService(db).getById(group.supplierId) : null;
  const variants = await new ProductVariantService(db).listByIds(group.lines.map((l) => l.variantId));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const nameByVariant = new Map(
    variants.map((v) => [
      v.id,
      `${resolveLocalizedText(productById.get(v.productId)?.name ?? {}, 'tr')} · ${resolveLocalizedText(v.label, 'tr')}`,
    ]),
  );

  const payload: PurchaseOrderPayload = {
    warehouseId: warehouse.id,
    supplierId: group.supplierId,
    supplierName: supplier?.name ?? null,
    lines: group.lines.map((line) => ({
      variantId: line.variantId,
      productName: nameByVariant.get(line.variantId) ?? line.variantId,
      qty: line.suggestedQty,
    })),
    ...(typeof args.note === 'string' && args.note.trim() ? { note: args.note.trim() } : {}),
  };

  const summary = `${supplier?.name ?? 'tedarikçi'} — ${payload.lines.length} kalemlik tedarik siparişi taslağı (${warehouseCode})`;
  const queued = await queue('purchase_order', payload, summary);
  return {
    ...queued,
    // Öbür tedarikçilerin eksiği SESSİZCE düşmesin: model patrona söyleyebilsin.
    otherSuppliersPending: withSupplier.filter((g) => g.supplierId !== group.supplierId).length,
    lines: payload.lines,
  };
}

/**
 * Bölgeye posta kodu ekleme önerisi — kodlar TALEP PANOSUNDAN doğrulanır, modelin listesinden değil.
 *
 * Model "şu kodları ekle" der; araç her kodun gerçekten sorulmuş olduğunu (`postal_code_demand`)
 * ve HENÜZ KAPSANMADIĞINI doğrular. Doğrulamasaydık asistan rastgele bir kod ekletebilirdi ve
 * uygulandığı an oraya teslimat sözü verilmiş olurdu — geri alınamaz dış etki.
 */
export async function proposeZoneExtend(args: Record<string, unknown>) {
  const db = serviceDb();
  const zoneName = String(args.zoneName ?? '').trim();
  const codes = Array.isArray(args.postalCodes) ? args.postalCodes.map((c) => String(c).trim()).filter(Boolean) : [];
  if (!zoneName) return { error: 'zoneName zorunlu — hangi bölgeye eklenecek?' };
  if (codes.length === 0) return { error: 'postalCodes boş — demand_signals çıktısından kod verin.' };

  const zones = await new DeliveryZoneService(db).listWithCodes({ activeOnly: true });
  const zone = zones.find((z) => z.name.toLowerCase().includes(zoneName.toLowerCase()));
  if (!zone) return { error: `Bölge bulunamadı: '${zoneName}'. Mevcutlar: ${zones.map((z) => z.name).join(' · ')}` };

  const already = new Set(zone.postalCodes.map((c) => c.postalCode));
  const demand = new Map((await new PostalCodeDemandService(db).listTop(200)).map((d) => [d.postalCode, d.requestCount]));
  const notices = await new ZoneNoticeService(db).pendingCountByPostalCode();

  const fresh = codes.filter((c) => !already.has(c));
  if (fresh.length === 0) return { error: 'Verilen kodların hepsi bu bölgede zaten var.' };

  const payload: ZoneExtendPayload = {
    zoneId: zone.id,
    zoneName: zone.name,
    country: zone.postalCodes[0]?.country ?? 'FR',
    postalCodes: fresh.map((postalCode) => ({
      postalCode,
      placeName: null,
      requestCount: demand.get(postalCode) ?? 0,
      waitingCount: notices.get(postalCode) ?? 0,
    })),
  };
  const waiting = payload.postalCodes.reduce((sum, c) => sum + c.waitingCount, 0);
  const summary = `${zone.name} bölgesine ${fresh.length} posta kodu eklensin (${fresh.join(' · ')})`;
  const queued = await queue('zone_extend', payload, summary, args.reason);
  return {
    ...queued,
    waitingCustomers: waiting,
    warning:
      waiting > 0
        ? `Uygulanınca haber bekleyen ${waiting} müşteriye bildirim gider — GERİ ALINAMAZ. Yöneticiye bunu söyle.`
        : 'Bu kodlarda haber bekleyen müşteri yok.',
  };
}

/**
 * Ürün taslağının boş alanlarını doldurma önerisi.
 *
 * **Alerjen ve saklama BURADA YOK ve olamaz** — payload şeması onları taşımıyor (şemayla engel,
 * prompt'la değil). Gıdada makul görünen bir alerjen satırı insana zarar verebilir; o alan
 * belgeyle, insan eliyle dolar.
 */
export async function proposeProductDraft(args: Record<string, unknown>) {
  const productId = String(args.productId ?? '').trim();
  const fields = (args.fields ?? {}) as Record<string, unknown>;
  if (!productId) return { error: 'productId zorunlu (catalog_health çıktısındaki ürünlerden).' };
  if (!isUuid(productId)) return badIdError('productId', productId);

  const product = await new ProductService(serviceDb()).getById(productId);
  if (!product) return { error: `Ürün bulunamadı: ${productId}` };

  const payload: ProductDraftPayload = {
    productId,
    productName: resolveLocalizedText(product.name, 'tr'),
    fields: fields as ProductDraftPayload['fields'],
    // Bugünkü hâl ÖNERİYLE BİRLİKTE taşınır: uygulama üzerine yazıyor ve sürüm tutmuyor, yani
    // dolu bir açıklama onaylandığı an kayboluyor. Patron neyi kaybedeceğini görerek onaylasın.
    currentFields: { description: product.description ?? null, ingredients: product.ingredients ?? null },
  };
  const filled = Object.keys(payload.fields);
  const summary = `"${payload.productName}" ürününde ${filled.join(' + ')} alanı dolduruldu`;
  return queue('product_draft', payload, summary, args.reason);
}

/**
 * Mal kabul önerisi — **patronun verdiği faturadan**. Görseli MODEL okur (istemci yeteneği),
 * araç okunanı DOĞRULAR: her varyant gerçekten var mı, depo kodu geçerli mi, SKT yazılmış mı.
 *
 * Doğrulama şart çünkü buradaki hata gıdada pahalı: uydurma bir SKT ile giren parti, raftaki
 * gerçek malın tarihini yanlış gösterir. Eksik alanı araç REDDEDER — asistan patrona sorar.
 */
export async function proposeStockIntake(args: Record<string, unknown>) {
  const db = serviceDb();
  const warehouseCode = String(args.warehouseCode ?? '').trim();
  const rawLines = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : [];
  if (!warehouseCode) return { error: 'warehouseCode zorunlu — mal hangi depoya girdi?' };
  if (rawLines.length === 0) return { error: 'lines boş — faturadaki kalemleri verin.' };

  const warehouse = (await new WarehouseService(db).list({ activeOnly: true })).find((w) => w.code === warehouseCode);
  if (!warehouse) return { error: `Depo bulunamadı: ${warehouseCode}` };

  const variantIds = rawLines.map((l) => String(l.variantId ?? '')).filter(isUuid);
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));

  // ── KALEM HATALARI TOPLU DÖNER (harici MCP denetiminin önerisi, 09.08) ────
  // İlk hatada dönmek "short-circuit"tü ve teknik olarak doğruydu; ama her araç çağrısı modelin
  // bağlam bütçesinden yiyor. Beş bozuk satırı beş turda öğrenmek yerine tek turda öğrensin:
  // bunlar birbirinden BAĞIMSIZ doğrulamalar, sıralamanın bir anlamı yok.
  const lines: StockIntakePayload['lines'] = [];
  const problems: string[] = [];
  for (const [i, raw] of rawLines.entries()) {
    const rawId = String(raw.variantId ?? '');
    const variant = byId.get(rawId);
    const qty = Number(raw.qty);
    const expiryDate = String(raw.expiryDate ?? '').trim();

    if (!isUuid(rawId)) {
      problems.push(`lines[${i}]: variantId UUID biçiminde değil (gelen: "${rawId || '(boş)'}") — katalogdaki kimliği olduğu gibi kullanın.`);
    } else if (!variant) {
      problems.push(`lines[${i}]: varyant bulunamadı (${rawId}) — katalogdan doğru kimliği bulun.`);
    }
    if (!Number.isInteger(qty) || qty <= 0) problems.push(`lines[${i}]: qty pozitif tam sayı olmalı (gelen: ${String(raw.qty)}).`);
    // SKT UYDURULMAZ: faturada/etikette yoksa asistan patrona sorar. Tarihsiz parti gıdada kör noktadır.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      problems.push(`lines[${i}]: expiryDate 'YYYY-AA-GG' olmalı (gelen: ${expiryDate || '(boş)'}). Belgede yoksa UYDURMAYIN — yöneticiye sorun.`);
    }
    if (!variant || problems.length > 0) continue;

    const name = `${resolveLocalizedText(productById.get(variant.productId)?.name ?? {}, 'tr')} · ${resolveLocalizedText(variant.label, 'tr')}`;
    lines.push({
      variantId: variant.id,
      productName: name,
      qty,
      expiryDate,
      lotNumber: typeof raw.lotNumber === 'string' && raw.lotNumber.trim() ? raw.lotNumber.trim() : null,
      unitCostCents: Number.isInteger(raw.unitCostCents) ? (raw.unitCostCents as number) : null,
    });
  }
  if (problems.length > 0) return { error: `${problems.length} kalem sorunu — hepsini düzeltip tekrar gönderin:`, problems };

  const supplierId = typeof args.supplierId === 'string' ? args.supplierId : null;
  const supplier = supplierId ? await new SupplierService(db).getById(supplierId) : null;
  const payload: StockIntakePayload = {
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    supplierId: supplier?.id ?? null,
    supplierName: supplier?.name ?? null,
    purchaseOrderId: typeof args.purchaseOrderId === 'string' ? args.purchaseOrderId : null,
    documentNo: typeof args.documentNo === 'string' && args.documentNo.trim() ? args.documentNo.trim() : null,
    lines,
  };
  const doc = payload.documentNo ? ` — irsaliye ${payload.documentNo}` : '';
  return queue('stock_intake', payload, `${warehouse.code} deposuna ${lines.length} parti stok girişi${doc}`, args.reason);
}

/**
 * Para hareketi önerisi — hesap ADIYLA bulunur (model uuid ezberlemez) ve tür kümesi DAR:
 * sipariş tahsilatı/iadesi bu yoldan yazılamaz (`applyMoneyMovement` künyesi).
 */
export async function proposeMoneyMovement(args: Record<string, unknown>) {
  const db = serviceDb();
  const accountName = String(args.accountName ?? '').trim();
  const amountCents = Number(args.amountCents);
  const direction = String(args.direction ?? '');
  const type = String(args.type ?? '');
  if (!accountName) return { error: 'accountName zorunlu (örn. "Kasa").' };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: 'amountCents pozitif tam sayı olmalı (cent).' };
  if (!['in', 'out'].includes(direction)) return { error: "direction 'in' | 'out' olmalı." };
  // `purchase` KÜMEDEN ÇIKTI (22.5): stok alımı mal kabule bağlıdır, motor bağsız satırı
  // `supply_link_missing` ile reddediyor — kuyruğa uygulanamayacak kalem yazmanın anlamı yok.
  if (!['expense', 'transfer', 'capital', 'misc'].includes(type)) {
    return {
      error:
        "type 'expense' | 'transfer' | 'capital' | 'misc' olmalı. Sipariş tahsilatı bu yoldan yazılamaz; MAL ALIMI da yazılamaz — alım mal kabulden geçer (propose_stock_intake).",
    };
  }

  const accounts = await new AccountService(db).list({ activeOnly: true });
  const account = accounts.find((a) => a.name.toLowerCase().includes(accountName.toLowerCase()));
  if (!account) return { error: `Hesap bulunamadı: '${accountName}'. Mevcutlar: ${accounts.map((a) => a.name).join(' · ')}` };

  const supplierId = typeof args.supplierId === 'string' ? args.supplierId : null;
  const supplier = supplierId ? await new SupplierService(db).getById(supplierId) : null;
  const payload: MoneyMovementPayload = {
    accountId: account.id,
    accountName: account.name,
    direction: direction as MoneyMovementPayload['direction'],
    amountCents,
    type: type as MoneyMovementPayload['type'],
    category: typeof args.category === 'string' && args.category.trim() ? args.category.trim() : null,
    description: typeof args.description === 'string' && args.description.trim() ? args.description.trim() : null,
    supplierId: supplier?.id ?? null,
    counterpartyName: supplier?.name ?? (typeof args.counterpartyName === 'string' ? args.counterpartyName : null),
    counterAccountId: typeof args.counterAccountId === 'string' ? args.counterAccountId : null,
    valueDate: typeof args.valueDate === 'string' ? args.valueDate : null,
  };
  const label = direction === 'out' ? 'gider' : 'tahsilat';
  const euro = (amountCents / 100).toFixed(2);
  const who = payload.counterpartyName ? ` — ${payload.counterpartyName}` : '';
  return queue('money_movement', payload, `${account.name}: ${euro} € ${label}${who}`, args.reason);
}

/**
 * Paket taslağı önerisi — **payları MODEL DEĞİL MOTOR dağıtır.**
 *
 * Model kalemleri ve paketin tek fiyatını verir; kaleme düşen birim fiyatı `rebalanceAllocations`
 * hesaplar (liste fiyatlarına oransal — `DOMAIN §13`). Modele bıraksaydık toplamı tutmayan paylar
 * üretirdi ve mutabakat uygulama anında patlardı; üstelik "pahalı kalem indirimin çoğunu taşır"
 * kuralı da kaybolurdu.
 *
 * **Mutabakat tutmazsa öneri YİNE kurulur ama fark SÖYLENİR:** birim fiyatlar tam kuruş olduğu
 * için bazı hedefler matematiksel olarak tutturulamaz (motorun künyesi). Sessizce yuvarlamak,
 * faturayı bir kuruş kaydırıp kimsenin bulamayacağı bir fark bırakmak olurdu.
 */
export async function proposeBundleDraft(args: Record<string, unknown>) {
  const db = serviceDb();
  const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
  const totalPrice = Number(args.totalPrice);
  const nameTr = String(args.nameTr ?? '').trim();
  if (!nameTr) return { error: 'nameTr zorunlu — paketin Türkçe adı.' };
  if (!(totalPrice > 0)) return { error: 'totalPrice pozitif olmalı (euro).' };
  if (rawItems.length < 2) return { error: 'items en az İKİ kalem içermeli — tek ürünlük paket, paket değildir.' };

  const variantIds = rawItems.map((i) => String(i.variantId ?? '')).filter(isUuid);
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));
  // Liste fiyatı AYRI tabloda (kanal/tarih boyutlu) — payların oransal dağıtımının tabanı b2c
  // taban fiyatıdır (paket B2C-yalnızdır, `DOMAIN §13`).
  const priceMap = await new PriceService(db).findApplicableMap(variants.map((v) => v.id), 'b2c');

  const problems: string[] = [];
  const prepared: Array<{ variantId: string; productName: string; qty: number; listPriceCents: number }> = [];
  for (const [i, raw] of rawItems.entries()) {
    const rawId = String(raw.variantId ?? '');
    const variant = byId.get(rawId);
    const qty = Number(raw.qty ?? 1);
    if (!isUuid(rawId)) problems.push(`items[${i}]: variantId UUID biçiminde değil (gelen: "${rawId || '(boş)'}").`);
    else if (!variant) problems.push(`items[${i}]: varyant bulunamadı (${rawId}).`);
    if (!Number.isInteger(qty) || qty <= 0) problems.push(`items[${i}]: qty pozitif tam sayı olmalı.`);
    if (!variant) continue;
    const product = productById.get(variant.productId);
    prepared.push({
      variantId: variant.id,
      productName: `${resolveLocalizedText(product?.name ?? {}, 'tr')} · ${resolveLocalizedText(variant.label, 'tr')}`,
      qty,
      // Fiyatı olmayan varyant 0 taban alır; motor kalanı öteki kalemlere dağıtır.
      listPriceCents: priceMap.get(variant.id)?.channelPrice?.amountCents ?? 0,
    });
  }
  if (problems.length > 0) return { error: `${problems.length} kalem sorunu:`, problems };

  // Dağıtım MOTORDA: önce liste fiyatlarına oransal bir başlangıç, sonra hedefe göre denge.
  const targetCents = Math.round(totalPrice * 100);
  const seed = prepared.map((p) => ({ qty: p.qty, allocatedUnitPriceCents: p.listPriceCents }));
  const balanced = rebalanceAllocations(seed, targetCents);

  const payload: BundleDraftPayload = {
    name: { tr: nameTr, ...(typeof args.nameFr === 'string' ? { fr: args.nameFr } : {}), ...(typeof args.nameDe === 'string' ? { de: args.nameDe } : {}) },
    description: typeof args.descriptionTr === 'string' && args.descriptionTr.trim() ? { tr: args.descriptionTr.trim() } : null,
    totalPrice,
    serves: Number.isInteger(args.serves) ? (args.serves as number) : null,
    items: prepared.map((p, i) => ({
      variantId: p.variantId,
      productName: p.productName,
      qty: p.qty,
      // Motorun verdiği cent → euro (paket ailesi euro tutuyor; çevrim tek yerde).
      allocatedUnitPrice: (balanced.unitPricesCents[i] ?? 0) / 100,
    })),
  };

  const queued = await queue('bundle_draft', payload, `${nameTr} — ${prepared.length} kalemlik paket, ${totalPrice.toFixed(2)} €`, args.reason);
  return {
    ...queued,
    allocation: {
      targetCents,
      achievedTotalCents: balanced.achievedTotalCents,
      residualCents: balanced.residualCents,
      // Kalan varsa KARAR OPERATÖRÜNDE: paketi 1 kuruş oynatmak ya da bir kalemin adedini
      // değiştirmek. Asistan bunu patrona SÖYLEMELİ, sessizce geçmemeli.
      note:
        balanced.residualCents === 0
          ? 'Paylar paket fiyatını tam tutuyor.'
          : `DİKKAT: paylar hedefi ${balanced.residualCents} cent farkla tutuyor — birim fiyatlar tam kuruş olduğu için bu hedef tam tutturulamıyor. Yöneticiye söyle: paket fiyatını bir kuruş oynatmak ya da bir kalemin adedini değiştirmek çözer.`,
    },
  };
}

/** Kampanya/indirim önerisi — kapsam adı çözülür, kupon kodu ÜRETİLMEZ (tekillik veritabanında). */
export async function proposeDiscountDraft(args: Record<string, unknown>) {
  const db = serviceDb();
  const name = String(args.name ?? '').trim();
  const trigger = String(args.trigger ?? 'automatic');
  const type = String(args.type ?? '');
  const scope = String(args.scope ?? 'cart');
  if (!name) return { error: 'name zorunlu — kampanyanın adı (operatör bunu listede görecek).' };
  if (!['coupon', 'automatic'].includes(trigger)) return { error: "trigger 'coupon' | 'automatic' olmalı." };
  if (!['percent', 'fixed'].includes(type)) return { error: "type 'percent' | 'fixed' olmalı." };
  if (!['cart', 'category', 'collection'].includes(scope)) return { error: "scope 'cart' | 'category' | 'collection' olmalı." };
  // Kupon DAİMA sepet düzeyindedir (DOMAIN §5) — kural veride ve motorda; araç da erken söyler.
  if (trigger === 'coupon' && scope !== 'cart') {
    return { error: "Kupon daima sepet düzeyindedir (DOMAIN §5): trigger 'coupon' ise scope 'cart' olmalı." };
  }

  const percent = type === 'percent' ? Number(args.percent) : null;
  const amountCents = type === 'fixed' ? Number(args.amountCents) : null;
  if (type === 'percent' && !(percent! > 0 && percent! <= 100)) return { error: 'percent 0-100 arasında olmalı.' };
  if (type === 'fixed' && !(Number.isInteger(amountCents) && amountCents! > 0)) return { error: 'amountCents pozitif tam sayı olmalı (cent).' };

  let categoryId: string | null = null;
  let collectionId: string | null = null;
  let scopeName: string | null = null;
  if (scope === 'category') {
    const wanted = String(args.scopeName ?? '').trim();
    const found = (await new CategoryService(db).list({ activeOnly: true })).find((c) =>
      resolveLocalizedText(c.name, 'tr').toLowerCase().includes(wanted.toLowerCase()),
    );
    if (!found) return { error: `Kategori bulunamadı: '${wanted}'` };
    categoryId = found.id;
    scopeName = resolveLocalizedText(found.name, 'tr');
  }
  if (scope === 'collection') {
    const wanted = String(args.scopeName ?? '').trim();
    const found = (await new CollectionService(db).list({ activeOnly: true })).find((c) =>
      resolveLocalizedText(c.name, 'tr').toLowerCase().includes(wanted.toLowerCase()),
    );
    if (!found) return { error: `Koleksiyon bulunamadı: '${wanted}'` };
    collectionId = found.id;
    scopeName = resolveLocalizedText(found.name, 'tr');
  }

  const payload: DiscountDraftPayload = {
    name,
    trigger: trigger as DiscountDraftPayload['trigger'],
    type: type as DiscountDraftPayload['type'],
    percent,
    amountCents,
    scope: scope as DiscountDraftPayload['scope'],
    categoryId,
    collectionId,
    scopeName,
    minBasketCents: Number.isInteger(args.minBasketCents) ? (args.minBasketCents as number) : null,
    validFrom: typeof args.validFrom === 'string' ? args.validFrom : null,
    validTo: typeof args.validTo === 'string' ? args.validTo : null,
    code: typeof args.code === 'string' && args.code.trim() ? args.code.trim().toUpperCase() : null,
  };

  const value = type === 'percent' ? `%${percent}` : `${((amountCents ?? 0) / 100).toFixed(2)} €`;
  const where = scopeName ? ` (${scopeName})` : '';
  return queue('discount_draft', payload, `${name}: ${value} indirim${where}`, args.reason);
}

/** Sofra tarifi taslağı — malzeme bağı VARYANTA; üç dil dolmadan yayınlanamaz (kural veride). */
export async function proposeRecipeDraft(args: Record<string, unknown>) {
  const db = serviceDb();
  const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
  const nameTr = String(args.nameTr ?? '').trim();
  const stepsTr = String(args.stepsTr ?? '').trim();
  if (!nameTr) return { error: 'nameTr zorunlu — tarifin Türkçe adı.' };
  if (!stepsTr) return { error: 'stepsTr zorunlu — hazırlanış adımları.' };
  if (rawItems.length === 0) return { error: 'items boş — tarifin malzemeleri (varyant kimlikleriyle).' };

  const variantIds = rawItems.map((i) => String(i.variantId ?? '')).filter(isUuid);
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));

  const problems: string[] = [];
  const items: RecipeDraftPayload['items'] = [];
  for (const [i, raw] of rawItems.entries()) {
    const rawId = String(raw.variantId ?? '');
    const variant = byId.get(rawId);
    const qty = Number(raw.qty ?? 1);
    if (!isUuid(rawId)) problems.push(`items[${i}]: variantId UUID biçiminde değil (gelen: "${rawId || '(boş)'}").`);
    else if (!variant) problems.push(`items[${i}]: varyant bulunamadı (${rawId}) — malzeme BOY satırına bağlanır ("350 g"), ürüne değil.`);
    if (!Number.isInteger(qty) || qty <= 0) problems.push(`items[${i}]: qty pozitif tam sayı olmalı.`);
    if (!variant) continue;
    items.push({
      variantId: variant.id,
      productName: `${resolveLocalizedText(productById.get(variant.productId)?.name ?? {}, 'tr')} · ${resolveLocalizedText(variant.label, 'tr')}`,
      qty,
    });
  }
  if (problems.length > 0) return { error: `${problems.length} malzeme sorunu:`, problems };

  const localized = (tr: string, fr: unknown, de: unknown) => ({
    tr,
    ...(typeof fr === 'string' && fr.trim() ? { fr: fr.trim() } : {}),
    ...(typeof de === 'string' && de.trim() ? { de: de.trim() } : {}),
  });

  const payload: RecipeDraftPayload = {
    name: localized(nameTr, args.nameFr, args.nameDe),
    description:
      typeof args.descriptionTr === 'string' && args.descriptionTr.trim()
        ? localized(args.descriptionTr.trim(), args.descriptionFr, args.descriptionDe)
        : null,
    steps: localized(stepsTr, args.stepsFr, args.stepsDe),
    serves: typeof args.servesTr === 'string' && args.servesTr.trim() ? localized(args.servesTr.trim(), args.servesFr, args.servesDe) : null,
    items,
  };

  const langs = ['tr', typeof args.nameFr === 'string' ? 'fr' : null, typeof args.nameDe === 'string' ? 'de' : null].filter(Boolean);
  const queued = await queue('recipe_draft', payload, `"${nameTr}" tarifi — ${items.length} malzeme`, args.reason);
  return {
    ...queued,
    languages: langs,
    // Üç dil dolmadan tarif YAYINLANAMAZ (kural veride). Asistan bunu baştan söylesin ki patron
    // onaylayıp "neden görünmüyor" demesin.
    publishNote:
      langs.length === 3
        ? 'Üç dil de dolu — onaydan sonra yayına alınabilir.'
        : `Yalnız ${langs.join('/')} dolu. Tarif üç dil dolmadan YAYINLANAMAZ; taslak olarak kalır.`,
  };
}

/** Bekleyen kuyruğun okuması — asistan kendi önerdiklerini görebilmeli (onaylayamaz). */
export async function listProposals(limit: number) {
  const clamped = Math.max(1, Math.min(50, Math.floor(limit)));
  const service = new AssistantProposalService(serviceDb());
  const [pending, decided] = await Promise.all([service.listPending(clamped), service.listDecided(10)]);
  return {
    pending: pending.map((p) => ({ id: p.id, kind: p.kind, summary: p.summary, createdAt: p.createdAt, expiresAt: p.expiresAt })),
    recentlyDecided: decided.map((p) => ({
      kind: p.kind,
      summary: p.summary,
      status: p.status,
      decidedAt: p.decidedAt,
      note: p.decidedNote,
      error: p.error,
    })),
  };
}
