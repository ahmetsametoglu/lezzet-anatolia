import {
  AccountService,
  AssistantProposalService,
  BundleService,
  CategoryService,
  CollectionService,
  DeliveryZoneService,
  PostalCodeDemandService,
  ProductService,
  ProductVariantService,
  ReorderService,
  SettingsService,
  SupplierService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import {
  parseProposalPayload,
  resolveLocalizedText,
  type AssistantProposalKind,
  type FeaturedFlagPayload,
  type MoneyMovementPayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
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

/** Vitrin işareti önerisi: kayıt kimlikten ÇÖZÜLÜR (ad ve varlık doğrulanır). */
export async function proposeFeaturedFlag(args: Record<string, unknown>) {
  const target = String(args.target ?? '');
  const id = String(args.id ?? '');
  const isFeatured = args.isFeatured !== false;
  if (!['category', 'collection', 'bundle'].includes(target)) {
    return { error: "target 'category' | 'collection' | 'bundle' olmalı." };
  }
  if (!id) return { error: 'id zorunlu.' };

  const db = serviceDb();
  const name =
    target === 'category'
      ? (await new CategoryService(db).getById(id))?.name
      : target === 'collection'
        ? (await new CollectionService(db).getById(id))?.name
        : (await new BundleService(db).getById(id))?.name;
  if (!name) return { error: `Kayıt bulunamadı (${target}): ${id}` };

  const label = resolveLocalizedText(name, 'tr');
  const payload: FeaturedFlagPayload = { target: target as FeaturedFlagPayload['target'], id, isFeatured, name: label };
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

  const product = await new ProductService(serviceDb()).getById(productId);
  if (!product) return { error: `Ürün bulunamadı: ${productId}` };

  const payload: ProductDraftPayload = {
    productId,
    productName: resolveLocalizedText(product.name, 'tr'),
    fields: fields as ProductDraftPayload['fields'],
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

  const variantIds = rawLines.map((l) => String(l.variantId ?? '')).filter(Boolean);
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));

  const lines: StockIntakePayload['lines'] = [];
  for (const [i, raw] of rawLines.entries()) {
    const variant = byId.get(String(raw.variantId ?? ''));
    if (!variant) return { error: `lines[${i}]: varyant bulunamadı (${String(raw.variantId)}) — katalogdan doğru kimliği bulun.` };
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty <= 0) return { error: `lines[${i}]: qty pozitif tam sayı olmalı.` };
    const expiryDate = String(raw.expiryDate ?? '').trim();
    // SKT UYDURULMAZ: faturada/etikette yoksa asistan patrona sorar. Tarihsiz parti gıdada kör noktadır.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      return { error: `lines[${i}]: expiryDate 'YYYY-AA-GG' olmalı. Belgede yoksa UYDURMAYIN — yöneticiye sorun.` };
    }
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
  if (!['purchase', 'expense', 'transfer', 'capital', 'misc'].includes(type)) {
    return { error: "type 'purchase' | 'expense' | 'transfer' | 'capital' | 'misc' olmalı — sipariş tahsilatı bu yoldan yazılamaz." };
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
