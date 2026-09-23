import {
  AccountService,
  AssistantProposalService,
  BundleService,
  CategoryService,
  CollectionService,
  CounterpartyService,
  DeliveryZoneService,
  MoneyDocumentService,
  MovementNatureService,
  PostalCodeDemandService,
  PriceService,
  ProductService,
  ProductVariantService,
  PurchaseOrderService,
  ReorderService,
  SettingsService,
  StockService,
  SupplierProductService,
  SupplierService,
  VariantBarcodeService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import {
  acceptsNature,
  barcodeProblem,
  discountPercentOf,
  hasSupplierIdentity,
  matchNature,
  matchSupplierItem,
  offerDecisionOf,
  pinpointCounterparty,
  pinpointSupplier,
  rebalanceAllocations,
  suggestedOfferPriceCents,
  suggestVatRegime,
  supplierItemKeyOf,
  vatRegimeProblem,
} from '@lezzet/domain-core';
// Para biçimi tek yerden (`formatPrice`): elle `toFixed(2)` Türkçede yanlış ayraç verir ("150,00 €" yerine "150.00 €").
import { formatPrice, stripLineOrdinals, toCents } from '@lezzet/helper';
import {
  AssistantWarningSchema,
  CountryEnum,
  DocumentKindEnum,
  DocumentVatRegimeEnum,
  FEATURED_PLACEMENT,
  FEATURED_SLOTS,
  missingDeclarations,
  parseProposalPayload,
  ProductAllergenEnum,
  resolveLocalizedText,
  type AssistantProposalKind,
  type AssistantWarning,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type DocumentVatRegime,
  type FeaturedFlagPayload,
  type FeaturedTarget,
  type InvoiceTermsPayload,
  type MoneyDocumentPayload,
  type MoneyMovementPayload,
  type NewVariantBarcode,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type ProductIdentityPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type SupplierCreatePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';

/**
 * MCP'nin yazma araçları — hiçbiri tabloya yazmaz: her araç `assistant_proposal` kuyruğuna dilekçe bırakır, patron onaylayınca
 * normal servis yolu koşar; onay aracı bilerek yok. Araç kimlikleri veritabanından doğrular ve özet cümlesini kendisi kurar ki
 * panel silinmiş bir kalem ya da modelin serbest cümlesini çizmesin.
 */

/**
 * Kimlik biçimi veritabanına gitmeden süzülür: `listByIds` tek bozuk kimlikle komple patlar ve öteki satırların sorunu
 * görülemezdi; biçim burada elenince model bütün sorunları tek turda görür.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Dil başına metin argümanı (`{ "tr": "…", "fr": "…" }`); tek dil de kabul edilir, eksiği operatör formda tamamlar.
 * Metin olmayan ve boş değerler ayıklanır, çünkü boş dil yüzeyde boş etiket bırakırdı; hiç dil kalmazsa `null`.
 */
function localizedArg(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const cleaned = Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, text]) => typeof text === 'string' && text.trim())
      .map(([lang, text]) => [lang, (text as string).trim()]),
  );
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

/**
 * Madde listesi taşıyan çok dilli alan (tarif adımları, "Evinizden") — satır başındaki sıra işareti sökülür, çünkü sırayı ekran
 * verir ve metindeki numara müşteri sayfasında "1. 1." diye çıkar; modelin biçim alışkanlığına güvenilmez.
 */
function linesArg(raw: unknown): Record<string, string> | null {
  const value = localizedArg(raw);
  if (!value) return null;
  return Object.fromEntries(Object.entries(value).map(([lang, text]) => [lang, stripLineOrdinals(text).trim()]));
}

/**
 * Tedarikçiyi faturadaki kimlikle bulur (vergi no, telefon ya da tam ad; eşitlik tam, `pinpointSupplier`) — mal kabul ve
 * tedarik siparişinin ortak kapısı; kimlik verilmediyse `null`, plansız alım meşrudur.
 * Bulunamazsa hata döner ama aday listesi dönmez: tedarikçiler hiçbir araçtan listelenmez, model tahminle yeniden denemez.
 */
async function resolveSupplier(
  db: ReturnType<typeof serviceDb>,
  args: Record<string, unknown>,
): Promise<{ supplier: { id: string; name: string } | null; error?: string }> {
  const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string).trim() : null);
  const identity = { vatNumber: text('supplierVatNumber'), phone: text('supplierPhone'), name: text('supplierName') };
  if (!hasSupplierIdentity(identity)) return { supplier: null };
  const outcome = pinpointSupplier(await new SupplierService(db).list({ activeOnly: true }), identity);
  if (outcome.status === 'found') return { supplier: { id: outcome.record.id, name: outcome.record.name } };
  const given = [
    identity.vatNumber ? `vergi no '${identity.vatNumber}'` : null,
    identity.phone ? `telefon '${identity.phone}'` : null,
    identity.name ? `ad '${identity.name}'` : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  if (outcome.status === 'ambiguous') {
    return {
      supplier: null,
      error: `Verilen kimlikler (${given}) birden çok tedarikçiye gidiyor — fatura ile kayıt çelişiyor. Yalnız vergi numarasıyla tekrar deneyin ya da yöneticiye sorun.`,
    };
  }
  return {
    supplier: null,
    error: `Tedarikçi bulunamadı (${given}). Faturadaki vergi numarasını (TVA/SIRET), telefonu ya da tam unvanı OLDUĞU GİBİ verin; parça ad ya da tahminle aramayın. Kimlik doğruysa tedarikçi kayıtlı değildir — faturanın başlığından propose_supplier_create ile önerin; belgede kimlik yoksa yöneticiye sorun.`,
  };
}

/**
 * Pozitif tam sayı argümanı; verilmediyse ya da anlamsızsa `null`. Sıfır ve negatif de `null`, çünkü "0 mm" ölçülmemişliğin
 * yanlış yazılmış hâlidir; ondalık da düşer, alanlar milimetre ve gram.
 */
function positiveIntArg(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) > 0 ? (raw as number) : null;
}

/** Serbest metin argümanı — kırpılmış; boşsa ya da metin değilse `null` ("belgede yok"). */
function textArg(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** Varyantların kaydı ve okunur adı ("Ürün · Boy") — tedarik siparişinin iki kipi ve mal kabul aynı adı buradan kurar. */
async function variantsWithNames(db: ReturnType<typeof serviceDb>, variantIds: readonly string[]) {
  const variants = await new ProductVariantService(db).listByIds([...variantIds]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));
  return new Map(
    variants.map((v) => [
      v.id,
      { variant: v, name: `${resolveLocalizedText(productById.get(v.productId)?.name ?? {}, 'tr')} · ${resolveLocalizedText(v.label, 'tr')}` },
    ]),
  );
}

/**
 * Cariyi nokta atışı bulur — tam ad ya da eşleşme kelimesi (`pinpointCounterparty`); cari listesi hiçbir araçtan dönmez.
 * Bulunamaması hata değil: ad kartta kalır, kimliği operatör seçer ya da Sözlük'ten açar.
 */
async function resolveCounterparty(
  db: ReturnType<typeof serviceDb>,
  text: string | null,
): Promise<{ counterparty: { id: string; name: string } | null; error?: string }> {
  if (!text) return { counterparty: null };
  const outcome = pinpointCounterparty(await new CounterpartyService(db).list({ activeOnly: true }), text);
  if (outcome.status === 'ambiguous') return { counterparty: null, error: `'${text}' birden çok cariye gidiyor (${outcome.count}) — tam adı verin.` };
  return { counterparty: outcome.status === 'found' ? outcome.record : null };
}

/**
 * Türü sözlükten doğrular — slug ya da ad, yönüne uymalı (`matchNature`); tanınmayan kelime hatadır ki model
 * `reference_data.natures`ten birini versin ya da alanı boş bıraksın.
 */
async function resolveNature(
  db: ReturnType<typeof serviceDb>,
  word: string | null,
  direction: MoneyMovementPayload['direction'],
): Promise<{ nature: { slug: string; label: string } | null; error?: string }> {
  if (!word) return { nature: null };
  const nature = matchNature(await new MovementNatureService(db).list({ activeOnly: true }), word, direction);
  if (nature) return { nature };
  return {
    nature: null,
    error: `Tür sözlükte yok ya da bu yöne uymuyor: '${word}'. reference_data.natures listesindeki slug ya da adı OLDUĞU GİBİ verin; emin değilseniz nature alanını boş bırakın, türü yönetici seçer.`,
  };
}

/** Tekil kimlik alanı için standart ret — örnek kimlikle, ki model biçimi tahmin etmesin. */
function badIdError(field: string, value: string) {
  return {
    error: `${field} geçersiz — kimlik UUID biçiminde olmalı (örn. 550e8400-e29b-41d4-a716-446655440000), gelen: "${value}".`,
  };
}

/**
 * Uyarı listesinin kapısı — şekli tutmayan girdi ATILMAZ, REDDEDİLİR (alerjen kümesiyle aynı kural).
 *
 * Sessizce düşürmek en kötü seçenek olurdu: araç "uyardım" sanır, ekran hiçbir şey göstermez ve
 * operatör uyarılmadığı bir şeyi onaylar. Verilmemiş olması ise meşru — o hâlde `null` döner.
 */
function parseWarnings(value: unknown): AssistantWarning[] | null {
  if (value === undefined || value === null) return null;
  const parsed = AssistantWarningSchema.array().safeParse(value);
  if (!parsed.success) {
    throw new Error(
      'warnings şekli tutmuyor — her madde { field?, level, note? } olmalı ve level şunlardan biri: unclear · overwrite · untouched · irreversible.',
    );
  }
  return parsed.data;
}

/** Önerinin ömrü — ayarlanabilir (`DOMAIN §6`: eşik/süre parametriktir), varsayılan 24 saat. */
async function expiryIso(): Promise<string> {
  const hours = await new SettingsService(serviceDb()).getNumber('assistant_proposal_ttl_hours', 24);
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function queue(kind: AssistantProposalKind, payload: unknown, summary: string, reason?: unknown, warnings?: unknown) {
  // Şema kapısı BURADA da geçilir: kuyruğa şekli bozuk bir dilekçe girerse panel onu çizemez.
  parseProposalPayload(kind, payload);
  const uyarilar = parseWarnings(warnings);

  // Aynı özetli bekleyen öneri engel değil uyarıdır: ikinci öneri meşru olabilir (ilki bayatladı), ama model kendi geçmişini
  // hatırlamaz. Sayım yazmadan önce yapılır ki öneri kendini saymasın.
  const service = new AssistantProposalService(serviceDb());
  const waiting = (await service.listPending()).filter((row) => row.kind === kind);
  const identical = waiting.filter((row) => row.summary === summary).length;

  const row = await service.create({
    kind,
    payload,
    summary,
    // Gerekçe ZORUNLU DEĞİL ve öyle kalmalı: zorunlu olsaydı model gerekçe uydururdu. Boş
    // bırakılabilmesi dürüstlüğün ucuz yolu — panel onu ayrı (soluk) bir hâlle gösteriyor.
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    warnings: uyarilar,
    expiresAt: await expiryIso(),
    sourceSession: 'mcp',
  });
  return {
    proposalId: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    note: 'Öneri onay kuyruğuna yazıldı. Uygulanması için yöneticinin operasyon panelinden onaylaması gerekir — sen onaylayamazsın.',
    // Satır YALNIZ bekleyen varken çizilir: her yanıta "0 bekliyor" koymak, bilgi olmayan bir alanı
    // her seferinde okutmak olurdu.
    ...(waiting.length > 0
      ? {
          queueContext: {
            pendingSameKind: waiting.length,
            identicalSummary: identical,
            note:
              identical > 0
                ? 'AYNI ÖZETLİ bir öneri zaten kuyrukta bekliyor — mükerrer olabilir. Gerekçen farklıysa sürdür, değilse yöneticiye söyle.'
                : 'Bu türden başka öneriler de kuyrukta bekliyor; patron hepsini birlikte görecek.',
          },
        }
      : {}),
  };
}

/**
 * Parti teklifi önerisi — SKT'si yaklaşan malı eritmenin aracı: indirim ürünün tamamını ucuzlatır, teklif yalnız o partiyi
 * (`stock.offer_price`). Teklif açılabilir mi kararını motor verir (`offerDecisionOf`; DLC'si geçmiş parti reddedilir), fiyat
 * verilmezse motorun önerdiği kullanılır.
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
  const off = listPriceCents ? ` (liste ${formatPrice(listPriceCents, 'tr')}, %${percent === null ? '?' : Math.round(percent)} indirim)` : '';
  const summary = `${productName} — ${batch.physicalQty} adet ${formatPrice(offerPriceCents, 'tr')} fırsat fiyatına${off}; SKT ${batch.expiryDate}`;
  return queue('batch_offer', payload, summary, args.reason, args.warnings);
}

/**
 * Vitrin işareti önerisi — hedef adıyla bulunur, çünkü model kimliği hiçbir okuma aracından alamaz; bulunamazsa mevcutlar yazılır.
 * Payload'a kimlik yazılır: kayıt onay beklerken yeniden adlandırılabilir.
 */
export async function proposeFeaturedFlag(args: Record<string, unknown>) {
  const target = String(args.target ?? '');
  const wanted = String(args.name ?? '').trim();
  const isFeatured = args.isFeatured !== false;
  if (!['category', 'collection', 'bundle'].includes(target)) {
    return { error: "target 'category' | 'collection' | 'bundle' olmalı." };
  }
  if (!wanted) return { error: 'name zorunlu — hangi kayıt? (örn. "Dondurma"). Mevcutları reference_data verir.' };

  const db = serviceDb();
  // Vitrinin bugünkü doluluğu da okunur: vitrin bir seçkidir, dolu ızgaraya ekleme sıradakini aşağı iter.
  const rows =
    target === 'category'
      ? await new CategoryService(db).list({ activeOnly: true })
      : target === 'collection'
        ? await new CollectionService(db).list({ activeOnly: true })
        : await new BundleService(db).listAll({ activeOnly: true });

  const named = rows.map((r) => ({ id: r.id, label: resolveLocalizedText(r.name, 'tr'), isFeatured: r.isFeatured }));
  const match = named.find((r) => r.label.toLowerCase().includes(wanted.toLowerCase()));
  if (!match) {
    return { error: `Kayıt bulunamadı (${target}): '${wanted}'. Mevcutlar: ${named.map((r) => r.label).join(' · ')}` };
  }

  // İSTENEN HÂL ZATEN GEÇERLİYSE öneri kurulmaz: onaylandığında hiçbir şey değiştirmeyecek bir
  // kalem, patronun onay refleksini köreltir (`money_movement`teki `purchase` ile aynı gerekçe).
  if (match.isFeatured === isFeatured) {
    return {
      error: `'${match.label}' zaten ${isFeatured ? 'vitrinde' : 'vitrin dışında'} — bu öneri uygulandığında hiçbir şey değişmezdi.`,
    };
  }

  const payload: FeaturedFlagPayload = {
    target: target as FeaturedFlagPayload['target'],
    id: match.id,
    isFeatured,
    name: match.label,
    currentlyFeaturedCount: named.filter((r) => r.isFeatured).length,
  };
  const verb = isFeatured ? 'vitrine çıkarılsın' : 'vitrinden çıkarılsın';
  const queued = await queue('featured_flag', payload, `${match.label} ${verb} (${target})`, args.reason, args.warnings);

  // Izgaranın doluluğu ve aynı hedefe bekleyen vitrin önerileri yanıtta: model etkisini bilmeden öneri vermesin ve kendi
  // açtıklarını üst üste yığmasın. Sayı önerinin kurulduğu anın gerçeğidir, panel kendi hesabını yeniden yapar.
  const pendingSameTarget = (await new AssistantProposalService(db).listPending()).filter(
    (row) => row.kind === 'featured_flag' && (row.payload as { target?: string }).target === target,
  ).length;
  const placement = FEATURED_PLACEMENT[target as FeaturedTarget];
  const slots = FEATURED_SLOTS[target as FeaturedTarget];

  return {
    ...queued,
    showcase: {
      target,
      // Hangi bölüm ve hangi kural: üç yere de "vitrin" deniyor ama çizimleri ayrı; koleksiyonda düşme yok, rotasyon var.
      section: placement.where,
      rule: placement.note,
      onShowcaseNow: payload.currentlyFeaturedCount,
      slots: slots,
      // Bu öneri de dahil: model "kaç tane bekliyor" diye sorduğunda kendi eklediğini de saymalı.
      pendingProposals: pendingSameTarget,
      note:
        payload.currentlyFeaturedCount !== undefined && isFeatured && payload.currentlyFeaturedCount >= slots
          ? placement.rotates
            ? 'Bant zaten dolu ama kayıp yok — işaretliler güne göre dönüyor, yenisi sırasını bekler.'
            : 'Izgara dolu — onaylanırsa sıradaki biri ana sayfada görünmez olur.'
          : undefined,
    },
  };
}

/**
 * Tedarik siparişi önerisi — model depo ve tedarikçiyi söyler, adetleri motor hesaplar (`ReorderService`): eşiğin altındaki
 * gerçek açık sipariş edilsin, modelin tahmini değil. Faturadan sipariş aynı araçla gelir (`proposeInvoicePurchaseOrder`).
 */
export async function proposePurchaseOrder(args: Record<string, unknown>) {
  const db = serviceDb();
  const warehouseCode = String(args.warehouseCode ?? '').trim();
  if (!warehouseCode) return { error: 'warehouseCode zorunlu (örn. "STR").' };

  // Tesis aranır: satın alma "bu deponun rafı boşalıyor" demektir, araçta raf yok; araç kodu verilirse "bulunamadı" doğru cevaptır.
  const warehouse = (await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' })).find(
    (w) => w.code === warehouseCode,
  );
  if (!warehouse) return { error: `Depo bulunamadı: ${warehouseCode}` };

  // Fatura kipi: kalemleri fatura taşır, eşik altı motoru devreye girmez. İki kip tek araçta, çünkü ikisi de "bu depoya bu
  // tedarikçiden mal gelecek" der; kalemsiz fatura bir kip değil eksik çağrıdır.
  const invoiceLines = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : [];
  if (invoiceLines.length > 0) return proposeInvoicePurchaseOrder(db, args, warehouse, invoiceLines);
  if (args.invoice !== undefined) return { error: 'invoice verildi ama lines boş — faturadan siparişte faturadaki kalemleri de verin.' };

  const groups = await new ReorderService(db).suggestions(warehouse.id);
  const withSupplier = groups.filter((g) => g.supplierId !== null);
  if (withSupplier.length === 0) {
    return { error: `${warehouseCode} deposunda tedarikçisi eşlenmiş, eşik altı kalem yok — sipariş önerisi kurulamıyor.` };
  }

  // Tedarikçi adıyla seçilir; seçilmediyse en büyük grup alınır ve başka tedarikçi varsa modele söylenir ki patrona sorabilsin.
  const { supplier: wantedSupplier, error: supplierError } = await resolveSupplier(db, args);
  if (supplierError) return { error: supplierError };
  const group = wantedSupplier
    ? withSupplier.find((g) => g.supplierId === wantedSupplier.id)
    : [...withSupplier].sort((a, b) => b.lines.length - a.lines.length)[0];
  if (!group) {
    const names = await new SupplierService(db).list({ activeOnly: true });
    const eligible = withSupplier.map((g) => names.find((s) => s.id === g.supplierId)?.name ?? '?').join(' · ');
    return { error: `'${wantedSupplier?.name}' için ${warehouseCode} deposunda eşik altı kalem yok. Eksiği olanlar: ${eligible}` };
  }

  const supplier = group.supplierId ? await new SupplierService(db).getById(group.supplierId) : null;
  const named = await variantsWithNames(db, group.lines.map((l) => l.variantId));

  // Tutar tedarikçinin kataloğundaki son alıştan tahmin edilir: kesin fiyat mal kabulde doğar ama patron kasadan ne çıkacağını görmeli.
  const lastPriceByVariant = lastPriceByVariantOf(group.supplierId ? await new SupplierProductService(db).listBySupplier(group.supplierId) : []);

  const payload: PurchaseOrderPayload = {
    warehouseId: warehouse.id,
    // Kod da yazılıyor: onay ekranı kimliği okuyamaz ve depo bu kararın DEĞİŞMEZİdir (`CLAUDE §1`).
    warehouseCode: warehouse.code,
    supplierId: group.supplierId,
    supplierName: supplier?.name ?? null,
    lines: group.lines.map((line) => ({
      variantId: line.variantId,
      productName: named.get(line.variantId)?.name ?? line.variantId,
      qty: line.suggestedQty,
      // Son alış fiyatı tedarikçinin kataloğundan tek sorguda gelir; eşlemesi olmayan kalemde `null`, uydurulmaz.
      lastPurchasePriceCents: lastPriceByVariant.get(line.variantId) ?? null,
      // Eşik altı kipinde fatura yok: birim fiyatı eşlemedeki son alış söyler, kalemler zaten eşlemeden gelir.
      unitPriceCents: null,
      supplierItemKey: null,
      supplierItemName: null,
      mappingProposed: false,
    })),
    ...(typeof args.note === 'string' && args.note.trim() ? { note: args.note.trim() } : {}),
    source: 'engine',
    invoice: null,
  };

  const summary = `${supplier?.name ?? 'tedarikçi'} — ${payload.lines.length} kalemlik tedarik siparişi taslağı (${warehouseCode})`;
  const queued = await queue('purchase_order', payload, summary, args.reason, args.warnings);
  return {
    ...queued,
    // Öbür tedarikçilerin eksiği SESSİZCE düşmesin: model patrona söyleyebilsin.
    otherSuppliersPending: withSupplier.filter((g) => g.supplierId !== group.supplierId).length,
    lines: payload.lines,
  };
}

/**
 * Bölgeye posta kodu ekleme önerisi — kodlar talep panosundan doğrulanır (sorulmuş ve henüz kapsanmamış), çünkü uygulandığı an
 * oraya teslimat sözü verilir ve bu geri alınamaz.
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

  // Ülke: önce modelin dediği, sonra bölgenin kodları, en son bölgenin deposunun ülkesi (DOMAIN §17) — posta kodu sınır ötesi
  // benzersiz değil (67000 hem FR hem DE) ve yanlış ülkeye yazılan kod görünür ama kapsama girmez.
  // BEKLEYEN(BACKLOG §8): `postal_code_demand` ülke taşımıyor, `demand_signals` çıktısı da ülkesiz — model ülkeyi patrondan öğrenir.
  const askedCountry = String(args.country ?? '').toUpperCase();
  if (askedCountry && !CountryEnum.safeParse(askedCountry).success) {
    return { error: `country geçersiz: '${askedCountry}'. Geçerli değerler: ${CountryEnum.options.join(' | ')}.` };
  }
  const warehouseCountry = (await new WarehouseService(db).getById(zone.warehouseId))?.countryCode ?? null;
  const country = (askedCountry || zone.postalCodes[0]?.country || warehouseCountry) as ZoneExtendPayload['country'] | null;
  if (!country) {
    return { error: `Bu bölgenin ülkesi çözülemedi — country alanını verin (${CountryEnum.options.join(' | ')}).` };
  }

  const payload: ZoneExtendPayload = {
    zoneId: zone.id,
    zoneName: zone.name,
    country,
    postalCodes: fresh.map((postalCode) => ({
      postalCode,
      placeName: null,
      requestCount: demand.get(postalCode) ?? 0,
      waitingCount: notices.get(postalCode) ?? 0,
    })),
  };
  const waiting = payload.postalCodes.reduce((sum, c) => sum + c.waitingCount, 0);
  const summary = `${zone.name} bölgesine ${fresh.length} posta kodu eklensin (${fresh.join(' · ')})`;
  const queued = await queue('zone_extend', payload, summary, args.reason, args.warnings);
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
 * Ambalajdan okunan beyan alanlarının ortak ayrıştırıcısı — iki ürün aracı da kullanır.
 * Alerjen kapalı kümeden seçilir; tanınmayan değer sessizce atılmaz, hata döner, çünkü gıdada sessiz atlama eksik alerjenin kendisidir.
 */
function readDeclarations(args: Record<string, unknown>): { fields: Record<string, unknown>; problems: string[] } {
  const fields: Record<string, unknown> = {};
  const problems: string[] = [];

  for (const key of ['name', 'description', 'ingredients', 'storageInstructions'] as const) {
    const value = args[key];
    if (value && typeof value === 'object') fields[key] = value;
  }
  if (args.nutrition && typeof args.nutrition === 'object') fields.nutrition = args.nutrition;

  for (const key of ['allergens', 'traces'] as const) {
    if (args[key] === undefined) continue;
    if (!Array.isArray(args[key])) {
      problems.push(`${key} dizi olmalı — ${ALLERGEN_VALUES.length} değerden seçin.`);
      continue;
    }
    const list = (args[key] as unknown[]).map((a) => String(a));
    const unknown = list.filter((a) => !ALLERGEN_VALUES.includes(a as (typeof ALLERGEN_VALUES)[number]));
    if (unknown.length > 0) {
      problems.push(`${key}: tanınmayan değer (${unknown.join(', ')}). Geçerli küme: ${ALLERGEN_VALUES.join(' · ')}`);
      continue;
    }
    fields[key] = list;
  }
  return { fields, problems };
}

const ALLERGEN_VALUES = ProductAllergenEnum.options;

/** Modelin "net okuyamadım" dediği alanlar — ekran gözü oraya çeker. */
function readUncertain(args: Record<string, unknown>): string[] {
  return Array.isArray(args.uncertainFields) ? args.uncertainFields.map((f) => String(f)).filter(Boolean) : [];
}

/** Tarih türü — kapalı küme; kümenin dışındaki değer sessizce DDM'ye düşmez, çünkü DLC geçince ürün imha edilir. */
function dateTypeArg(value: unknown): 'DLC' | 'DDM' | null {
  const upper = String(value ?? '').toUpperCase();
  return upper === 'DLC' || upper === 'DDM' ? upper : null;
}

/** Saklama rejimi — kapalı küme; `shippable` ile aynı cümleden okunur ama iade/imha kuralını bu belirler. */
function storageTypeArg(value: unknown): 'ambient' | 'chilled' | 'frozen' | null {
  return value === 'ambient' || value === 'chilled' || value === 'frozen' ? value : null;
}

/**
 * Ambalajın üstündeki kod — sağlaması tutmayan kod ÖNERİYE hiç girmez, bağlı kod ikinci kez önerilmez.
 *
 * İkisi de yazma anında değil ÖNERİ anında sorulur: modelin fotoğraftan yanlış okuduğu tek hane, onay
 * ekranında doğru görünen bir kod olarak geçerdi ve arıza ilk kez depoda görünürdü.
 */
async function readBarcode(raw: unknown, yer: string): Promise<{ barcode?: NewVariantBarcode } | { error: string }> {
  if (raw === undefined || raw === null) return {};
  const row = (typeof raw === 'string' ? { code: raw } : raw) as Record<string, unknown>;
  const code = textArg(row.code);
  if (!code) return { error: `${yer}.barcode: kod boş — ambalajdaki rakamları olduğu gibi verin.` };
  const problem = barcodeProblem(code);
  if (problem) return { error: `${yer}.barcode: ${problem}` };

  const kind = row.kind === 'case' ? 'case' : 'unit';
  // Koli kodunun çarpanı KODUN kendi bilgisidir; verilmezse kod hep 1 sayar ve depocu adedi her kabulde elle düzeltir.
  const qtyPerCode = kind === 'case' ? positiveIntArg(row.qtyPerCode) : 1;
  if (qtyPerCode === null) return { error: `${yer}.barcode.qtyPerCode koli kodunda zorunlu — bir okutma kaç paket sayacak.` };

  const bound = await new VariantBarcodeService(serviceDb()).getByCode(code);
  if (bound) return { error: `${yer}.barcode: "${code}" zaten bir boya bağlı. Eşleme panelden silinmeden aynı kod ikinci kez bağlanamaz.` };
  return { barcode: { code, kind, qtyPerCode } };
}

/** Kategori ADLA bulunur; bulunamazsa mevcutlar yazılır ki model doğrusunu seçebilsin. */
async function pickCategory(name: unknown): Promise<{ category: { id: string; name: string } | null } | { error: string }> {
  const wanted = textArg(name);
  if (!wanted) return { category: null };
  const categories = await new CategoryService(serviceDb()).list({ activeOnly: true });
  const found = categories.find((c) => resolveLocalizedText(c.name, 'tr').toLowerCase().includes(wanted.toLowerCase()));
  if (!found) {
    return {
      error: `Kategori bulunamadı: '${wanted}'. Mevcutlar: ${categories.map((c) => resolveLocalizedText(c.name, 'tr')).join(' · ')}`,
    };
  }
  return { category: { id: found.id, name: resolveLocalizedText(found.name, 'tr') } };
}

/**
 * Beyan OLMAYAN künye argümanları — kategori, tarih türü, raf ömrü, kargo izni, saklama rejimi. Verilmeyen alan hiç
 * yazılmaz; kapalı kümenin dışındaki değer sessizce düşmez, hata döner: yanlış rejim ürünün imha kuralını değiştirir.
 */
async function readIdentity(args: Record<string, unknown>): Promise<{ identity: ProductIdentityPayload } | { error: string }> {
  const identity: ProductIdentityPayload = {};
  const picked = await pickCategory(args.categoryName);
  if ('error' in picked) return picked;
  if (picked.category) {
    identity.categoryId = picked.category.id;
    identity.categoryName = picked.category.name;
  }
  if (args.dateType !== undefined) {
    const dateType = dateTypeArg(args.dateType);
    if (!dateType) {
      return { error: "dateType 'DLC' | 'DDM' olmalı. DLC = güvenlik tarihi (geçince imha), DDM = kalite tarihi (geçince hâlâ satılabilir)." };
    }
    identity.dateType = dateType;
  }
  if (args.shelfLifeDays !== undefined) {
    const days = positiveIntArg(args.shelfLifeDays);
    if (days === null) return { error: 'shelfLifeDays pozitif tam sayı olmalı — ambalajdaki toplam raf ömrü, gün.' };
    identity.shelfLifeDays = days;
  }
  if (args.shippable !== undefined) {
    if (typeof args.shippable !== 'boolean') return { error: 'shippable true/false olmalı — emin değilsen hiç verme.' };
    identity.shippable = args.shippable;
  }
  if (args.storageType !== undefined) {
    const storageType = storageTypeArg(args.storageType);
    if (!storageType) return { error: "storageType 'ambient' | 'chilled' | 'frozen' olmalı — ambalajın saklama sıcaklığından." };
    identity.storageType = storageType;
  }
  return { identity };
}

/**
 * Ürünün boy satırları — `variantId` VARSA var olan boyun künyesi, YOKSA yeni boy.
 *
 * Kimliğin kaynağı okuma araçlarıdır (`catalog_lookup` · `product_detail`); başka ürünün boyu ya da uydurma kimlik
 * reddedilir. Kimliksiz satırda etiket ve gramaj ZORUNLU: etiketsiz boy müşteriye seçtirilemez, gramajsız boy
 * satılamaz (kilo başı fiyat ondan çıkar). Var olan boyda ikisi de kayıtta durur, dilekçe yalnız eksiği tamamlar.
 */
async function readVariantEdits(
  args: Record<string, unknown>,
  productId: string,
): Promise<{ variants: ProductDraftPayload['variants'] } | { error: string }> {
  const raw = Array.isArray(args.variants) ? args.variants : [];
  if (raw.length === 0) return { variants: [] };

  const own = await new ProductVariantService(serviceDb()).listByProducts([productId]);
  const adByaId = new Map(own.map((v) => [v.id, resolveLocalizedText(v.label, 'tr') || 'etiketsiz']));
  const liste = [...adByaId].map(([id, ad]) => `${id} (${ad})`).join(' · ');
  const variants: ProductDraftPayload['variants'] = [];

  for (const [i, entry] of raw.entries()) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const variantId = textArg(row.variantId);
    const variantLabel = variantId === null ? undefined : adByaId.get(variantId);
    if (variantId !== null && !variantLabel) {
      return { error: `variants[${i}].variantId bu ürünün boyu değil. Ürünün boyları: ${liste}` };
    }

    const label = localizedArg(row.label);
    const olcu: Record<string, number> = {};
    for (const key of ['netQuantity', 'piecesCount', 'packedWeightG', 'packedLengthMm', 'packedWidthMm', 'packedHeightMm'] as const) {
      if (row[key] === undefined) continue;
      const value = positiveIntArg(row[key]);
      if (value === null) return { error: `variants[${i}].${key} pozitif tam sayı olmalı (gram ya da milimetre).` };
      olcu[key] = value;
    }
    const portionKind = row.portionKind === undefined ? undefined : porsiyonTuru(row.portionKind);
    if (row.portionKind !== undefined && portionKind === null) return { error: `variants[${i}].portionKind 'item' | 'slice' olmalı.` };
    if (row.netUnit !== undefined && row.netUnit !== 'g' && row.netUnit !== 'ml') {
      return { error: `variants[${i}].netUnit 'g' | 'ml' olmalı — şişe 500 ml der, 500 g demez.` };
    }
    const okunanKod = await readBarcode(row.barcode, `variants[${i}]`);
    if ('error' in okunanKod) return okunanKod;

    if (variantId === null) {
      if (!label) return { error: `variants[${i}] yeni boy (variantId yok) — etiket zorunlu: { "label": { "tr": "500 g kalıp" } }.` };
      if (olcu.netQuantity === undefined) return { error: `variants[${i}] yeni boy — netQuantity zorunlu, gramajsız boy satılamaz.` };
      variants.push({
        variantLabel: resolveLocalizedText(label, 'tr') || 'etiketsiz',
        label: label as ProductDraftPayload['variants'][number]['label'],
        ...olcu,
        // Birim verilmediyse gram: gramajı olan bir boyun birimi boş bırakılamaz ve katı ürün kuraldır
        // (`propose_product_create` aynı varsayımı kullanıyor).
        netUnit: row.netUnit === 'ml' ? 'ml' : 'g',
        ...(portionKind ? { portionKind } : {}),
        ...(okunanKod.barcode ? { barcode: okunanKod.barcode } : {}),
      } as ProductDraftPayload['variants'][number]);
      continue;
    }

    const edit = {
      variantId,
      variantLabel,
      ...(label ? { label } : {}),
      ...olcu,
      ...(row.netUnit === undefined ? {} : { netUnit: row.netUnit }),
      ...(portionKind ? { portionKind } : {}),
      ...(okunanKod.barcode ? { barcode: okunanKod.barcode } : {}),
    } as ProductDraftPayload['variants'][number];
    if (Object.keys(edit).length === 2) {
      return { error: `variants[${i}] boş — etiket, gramaj, adet, porsiyon türü, ambalaj ölçüsü ya da barkoddan en az biri verilmeli.` };
    }
    variants.push(edit);
  }
  return { variants };
}

/**
 * Ürün taslağının doldurulması — ambalaj fotoğrafından okunan beyan dahil; alerjen ve saklama yazılabilir, çünkü bilgi belgeden
 * okunur. Beyan olmayan künye ve var olan boyun ölçüsü de buradan gider: yeni üründe yazılabilen alan var olan üründe de
 * yazılabilmeli, yoksa eksik künye elde kalırdı. Denetim onay ekranında, yayın kararı asistana kapalı.
 */
export async function proposeProductDraft(args: Record<string, unknown>) {
  const productId = String(args.productId ?? '').trim();
  if (!productId) return { error: 'productId zorunlu (catalog_health çıktısındaki ürünlerden).' };
  if (!isUuid(productId)) return badIdError('productId', productId);

  const product = await new ProductService(serviceDb()).getById(productId);
  if (!product) return { error: `Ürün bulunamadı: ${productId}` };

  const { fields, problems } = readDeclarations(args);
  if (problems.length > 0) return { error: `${problems.length} alan sorunu:`, problems };
  const okunanKunye = await readIdentity(args);
  if ('error' in okunanKunye) return okunanKunye;
  const okunanBoy = await readVariantEdits(args, productId);
  if ('error' in okunanBoy) return okunanBoy;

  // Aynı değeri yeniden yazan künye alanı dilekçeye GİRMEZ: onay ekranı onu da "değişecek" diye
  // gösterir ve patronun dikkatini değişmeyen bir satırda harcardı.
  const kayit = product as unknown as Record<string, unknown>;
  const identity = Object.fromEntries(
    Object.entries(okunanKunye.identity).filter(([key, value]) => key === 'categoryName' || value !== kayit[key]),
  ) as ProductIdentityPayload;
  if (identity.categoryId === undefined) delete identity.categoryName;
  const { variants } = okunanBoy;
  if (Object.keys(fields).length === 0 && Object.keys(identity).length === 0 && variants.length === 0) {
    return {
      error:
        'Hiçbir alan verilmedi — beyan (ad, açıklama, içindekiler, saklama, besin künyesi, alerjen, iz), künye (kategori, tarih türü, raf ömrü, kargo izni, saklama rejimi) ya da boy (gramaj, adet, ambalaj ölçüsü).',
    };
  }

  // Kategorinin ESKİ adı yalnız kategori yazılıyorsa okunur: her öneride bir sorgu, sorulmayan bir soruya cevap olurdu.
  const mevcutKategori =
    identity.categoryId !== undefined && product.categoryId ? await new CategoryService(serviceDb()).getById(product.categoryId) : null;

  // Tamlık motordan (`missingDeclarations`, `is_incomplete` kolonunun aynası); araç kendi ölçütünü uydurmaz.
  const merged = { ...product, ...fields } as Parameters<typeof missingDeclarations>[0];
  const payload: ProductDraftPayload = {
    productId,
    productName: resolveLocalizedText(product.name, 'tr'),
    fields: fields as ProductDraftPayload['fields'],
    identity,
    variants,
    // Bugünkü hâl öneriyle birlikte taşınır: uygulama sürüm tutmadan üzerine yazar, patron neyi kaybedeceğini görerek onaylasın.
    currentFields: {
      name: product.name,
      description: product.description,
      ingredients: product.ingredients,
      storageInstructions: product.storageInstructions,
      nutrition: product.nutrition,
      allergens: product.allergens,
      traces: product.traces,
    },
    // Künyenin bugünkü hâli — kategori ADIYLA, çünkü kart uuid göstermez; ad yalnız kategori yazılıyorsa okunur.
    currentIdentity: {
      categoryId: product.categoryId,
      ...(mevcutKategori ? { categoryName: resolveLocalizedText(mevcutKategori.name, 'tr') } : {}),
      dateType: product.dateType,
      shelfLifeDays: product.shelfLifeDays,
      shippable: product.shippable,
      storageType: product.storageType,
    },
    uncertainFields: readUncertain(args),
    remainingGaps: missingDeclarations(merged),
  };
  const filled = [...Object.keys(fields), ...Object.keys(identity).filter((k) => k !== 'categoryId')];
  if (variants.length > 0) filled.push(`${variants.length} boy`);
  const summary = `"${payload.productName}" ürününde ${filled.join(' + ')} alanı dolduruldu`;
  return queue('product_draft', payload, summary, args.reason, args.warnings);
}

/**
 * Yeni ürün önerisi — ambalaj fotoğrafından; ürün aday doğar (`status` payload'da yok), yanlış okunmuş alerjen vitrine düşmez.
 * Kategori addan çözülür ve var olmalı; fiyat ve stok ayrı karar olduğu için yok, en az bir boy şart çünkü fiyat ve stok boya bağlı.
 */
export async function proposeProductCreate(args: Record<string, unknown>) {
  const name = args.name;
  if (!name || typeof name !== 'object' || !(name as Record<string, unknown>).tr) {
    return { error: 'name zorunlu ve en az Türkçesi dolu olmalı — { "tr": "…", "fr": "…", "de": "…" }.' };
  }

  const rawVariants = Array.isArray(args.variants) ? (args.variants as Record<string, unknown>[]) : [];
  if (rawVariants.length === 0) {
    return { error: 'variants boş — en az bir boy gerekir ("500 g", "1 kg"). Varyantsız ürün satılamaz: fiyat ve stok boya bağlıdır.' };
  }
  // Etiket ("500 g") ile ölçü (500) ayrı alanlar: biri müşterinin okuduğu metin, öteki kilo başı fiyatın tabanı.
  // Ambalaj ölçüsü (`packed*`) etikette yazmaz, tartılır: pozitif tam sayı değilse `null`, çünkü tahmini sayı kargo tarifesine girer.
  if (rawVariants.some((v) => !v.label || typeof v.label !== 'object')) {
    return { error: 'Her varyantın `label` alanı olmalı — { "tr": "500 g" }.' };
  }
  const variants: ProductCreatePayload['variants'] = [];
  for (const [i, v] of rawVariants.entries()) {
    const okunanKod = await readBarcode(v.barcode, `variants[${i}]`);
    if ('error' in okunanKod) return okunanKod;
    variants.push({
      label: v.label as ProductCreatePayload['variants'][number]['label'],
      netQuantity: positiveIntArg(v.netQuantity),
      netUnit: v.netUnit === 'ml' ? 'ml' : v.netQuantity === undefined ? null : 'g',
      piecesCount: Number.isInteger(v.piecesCount) && (v.piecesCount as number) > 0 ? (v.piecesCount as number) : null,
      portionKind: porsiyonTuru(v.portionKind),
      packedWeightG: positiveIntArg(v.packedWeightG),
      packedLengthMm: positiveIntArg(v.packedLengthMm),
      packedWidthMm: positiveIntArg(v.packedWidthMm),
      packedHeightMm: positiveIntArg(v.packedHeightMm),
      ...(okunanKod.barcode ? { barcode: okunanKod.barcode } : {}),
    });
  }

  const dateType = dateTypeArg(args.dateType);
  if (!dateType) {
    return { error: "dateType 'DLC' | 'DDM' olmalı. DLC = güvenlik tarihi (geçince imha), DDM = kalite tarihi (geçince hâlâ satılabilir)." };
  }

  const { fields, problems } = readDeclarations(args);
  if (problems.length > 0) return { error: `${problems.length} alan sorunu:`, problems };

  const picked = await pickCategory(args.categoryName);
  if ('error' in picked) return picked;
  const category = picked.category;

  const vatRate = typeof args.vatRate === 'number' ? args.vatRate : 5.5;
  const shelfLifeDays = positiveIntArg(args.shelfLifeDays);

  // Tamlık MOTORDAN — yeni kayıtta karşılaştırılacak eski hâl yok, payload'ın kendisi ölçülür.
  const remainingGaps = missingDeclarations({
    name: name as Parameters<typeof missingDeclarations>[0]['name'],
    ingredients: (fields.ingredients ?? null) as Parameters<typeof missingDeclarations>[0]['ingredients'],
    nutrition: (fields.nutrition ?? null) as Parameters<typeof missingDeclarations>[0]['nutrition'],
    storageInstructions: (fields.storageInstructions ?? null) as Parameters<typeof missingDeclarations>[0]['storageInstructions'],
    allergens: (fields.allergens ?? null) as Parameters<typeof missingDeclarations>[0]['allergens'],
  });

  const payload: ProductCreatePayload = {
    ...fields,
    name: name as ProductCreatePayload['name'],
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    dateType,
    shelfLifeDays,
    vatRate,
    // Kargolanabilirlik emin olmadan yazılmaz: `null` "bilmiyorum"dur ve ürün kapının varsayılanıyla doğar.
    shippable: typeof args.shippable === 'boolean' ? args.shippable : null,
    // Saklama rejimi de öyle; ama burada varsayılan DONUK olduğu için okunabiliyorsa yazılması önemli (`0005`).
    storageType: storageTypeArg(args.storageType),
    variants,
    uncertainFields: readUncertain(args),
    remainingGaps,
  };

  const boy = variants.map((v) => resolveLocalizedText(v.label, 'tr')).join(' · ');
  const summary = `Yeni ürün: "${resolveLocalizedText(payload.name, 'tr')}" (${boy})${category ? ` — ${payload.categoryName}` : ''}`;
  return queue('product_create', payload, summary, args.reason, args.warnings);
}

/** Tedarikçinin kalem eşlemesi — `supplier_product` satırı. */
type SupplierMapping = Awaited<ReturnType<SupplierProductService['listBySupplier']>>[number];

/** Eşlemedeki son alış fiyatı, varyant başına — fiyatı olmayan eşleme haritaya girmez (uydurulmaz, `null` kalır). */
function lastPriceByVariantOf(mappings: readonly SupplierMapping[]): Map<string, number> {
  return new Map(
    mappings
      .filter((mapping) => mapping.lastPurchasePriceCents !== null)
      .map((mapping) => [mapping.variantId, mapping.lastPurchasePriceCents as number]),
  );
}

/** Fatura kalemi → varyant: eşlemeden mi geldi, eşleme önerisi mi, sorunu var mı. */
interface ResolvedInvoiceLine {
  variantId: string;
  key: string | null;
  name: string | null;
  proposed: boolean;
  problem: string | null;
}

/**
 * Fatura kalemlerini tedarikçinin adıyla çözer — mal kabul ve faturadan siparişin ortak yolu: bağ tedarikçi eşlemesidir
 * (`supplier_product`; anahtar kod, yoksa adın slug'ı; eşitlik tam). Eşleme yoksa modelin katalogda bulduğu varyant "eşleme
 * önerisi" olur ve onayda kaydedilir; adlı ama eşlemesiz kalem varyantsız gelirse cevap "eşleme yok".
 */
function resolveInvoiceLines(
  mappings: readonly SupplierMapping[],
  supplier: { id: string; name: string } | null,
  rawLines: Record<string, unknown>[],
): ResolvedInvoiceLine[] {
  return rawLines.map((raw, i) => {
    const givenId = typeof raw.variantId === 'string' ? raw.variantId.trim() : '';
    const item = {
      code: typeof raw.supplierItemCode === 'string' && raw.supplierItemCode.trim() ? raw.supplierItemCode.trim() : null,
      name: typeof raw.supplierItemName === 'string' && raw.supplierItemName.trim() ? raw.supplierItemName.trim() : null,
    };
    const key = supplierItemKeyOf(item.code, item.name);
    const label = item.name ?? item.code ?? '';
    const base: ResolvedInvoiceLine = { variantId: givenId, key, name: item.name, proposed: false, problem: null };
    if (!key) {
      return givenId ? base : { ...base, problem: `lines[${i}]: variantId ya da tedarikçinin kalem adı/kodu (supplierItemName · supplierItemCode) gerekli.` };
    }
    if (!supplier) {
      return givenId
        ? base
        : { ...base, problem: `lines[${i}]: '${label}' tedarikçi verilmeden çözülemez — supplierVatNumber / supplierPhone / supplierName verin ya da variantId gönderin.` };
    }
    const match = matchSupplierItem(mappings, item);
    if (match.status === 'found') {
      if (givenId && givenId !== match.record.variantId) {
        return { ...base, problem: `lines[${i}]: '${label}' eşlemede başka bir varyanta bağlı — eşleme doğruysa variantId göndermeyin, yanlışsa yönetici eşlemeyi düzeltsin.` };
      }
      return { ...base, variantId: match.record.variantId };
    }
    if (match.status === 'ambiguous') {
      return { ...base, problem: `lines[${i}]: '${label}' bu tedarikçide birden çok eşlemeye gidiyor (${match.count}) — kodla gönderin ya da yöneticiye sorun.` };
    }
    if (!givenId) {
      return {
        ...base,
        problem: `lines[${i}]: '${label}' için eşleme yok. Ürünü catalog_lookup ile bulup variantId'yi bu adla BİRLİKTE gönderin — onayda eşleme kaydedilir. Bulamazsanız yöneticiye sorun, uydurmayın.`,
      };
    }
    return { ...base, proposed: true };
  });
}

/** `YYYY-AA-GG` biçiminde bir gün mü — bozuk tarih süzülür; sessizce bugün yazmak, olmayan bir günü yazmaktır. */
function isIsoDay(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Faturanın KDV'si, rejimi ve vadesi — mal kabul, faturadan sipariş ve belge önerisinin ortak doğrulaması; rejim verilmediyse
 * tedarikçinin ülkesinden önerilir (`suggestVatRegime`), KDV'yle çelişen rejim, toplamı aşan KDV ve belgeden önceki vade reddedilir.
 * Bozuk değer süzülmez, reddedilir: süzülen değer "belgede yok" diye okunurdu (CLAUDE §1).
 */
async function invoiceTermsFrom(
  db: ReturnType<typeof serviceDb>,
  args: Record<string, unknown>,
  supplier: { id: string } | null,
  document: { totalCents: number | null; issuedOn: string | null },
): Promise<{ vatAmountCents: number | null; vatRegime: DocumentVatRegime; dueOn: string | null } | { error: string }> {
  const given = (value: unknown) => value !== undefined && value !== null;
  const vatAmountCents = Number.isInteger(args.vatAmountCents) && (args.vatAmountCents as number) >= 0 ? (args.vatAmountCents as number) : null;
  if (given(args.vatAmountCents) && vatAmountCents === null) {
    return { error: `vatAmountCents cent cinsinden tam sayı olmalı (gelen: '${String(args.vatAmountCents)}') — belgede KDV yazmıyorsa göndermeyin.` };
  }
  if (vatAmountCents !== null && document.totalCents !== null && vatAmountCents > document.totalCents) {
    return { error: 'KDV toplamdan büyük olamaz — toplam KDV dâhil tutardır; iki sayıyı belgeden yeniden okuyun.' };
  }
  const regimeArg = typeof args.vatRegime === 'string' ? args.vatRegime.trim() : '';
  const parsed = DocumentVatRegimeEnum.safeParse(regimeArg);
  if (regimeArg && !parsed.success) return { error: `vatRegime 'standard' | 'reverse_charge' | 'exempt' olmalı (gelen: '${regimeArg}').` };
  const supplierCountry = supplier ? ((await new SupplierService(db).getById(supplier.id))?.country ?? null) : null;
  const vatRegime: DocumentVatRegime = parsed.success ? parsed.data : suggestVatRegime({ supplierCountry, vatAmountCents });
  if (vatRegimeProblem(vatRegime, vatAmountCents)) {
    return {
      error: `Rejim '${vatRegime}' iken belgede KDV olamaz — faturada KDV yazıyorsa rejim 'standard'dır; yazmıyorsa vatAmountCents göndermeyin.`,
    };
  }
  if (given(args.dueOn) && !isIsoDay(args.dueOn)) {
    return { error: `dueOn 'YYYY-AA-GG' olmalı (gelen: '${String(args.dueOn)}') — belgede vade yazmıyorsa göndermeyin.` };
  }
  const dueOn = isIsoDay(args.dueOn) ? String(args.dueOn) : null;
  if (dueOn && document.issuedOn && dueOn < document.issuedOn) {
    return { error: `Vade (${dueOn}) belge gününden (${document.issuedOn}) önce olamaz — iki tarihi belgeden yeniden okuyun.` };
  }
  return { vatAmountCents, vatRegime, dueOn };
}

/**
 * Faturanın toplamı ile satırların toplamı — mal kabul ve faturadan siparişin ortak kontrolü; satırlar KDV hariç olduğu için
 * KDV biliniyorsa toplamdan düşülür. Fark modele söylenir, çünkü düzeltmenin ucuz anı onaydan öncesidir.
 */
function invoiceTotalCheck(input: { totalAmountCents: number; vatAmountCents: number | null; vatRegime: DocumentVatRegime; linesCents: number }) {
  const gap = input.totalAmountCents - (input.vatAmountCents ?? 0) - input.linesCents;
  return {
    documentCents: input.totalAmountCents,
    vatCents: input.vatAmountCents,
    linesCents: input.linesCents,
    gapCents: gap,
    note:
      gap === 0
        ? 'Satırların toplamı faturanın KDV hariç tutarını tutuyor.'
        : `DİKKAT: satırların toplamı faturanın KDV hariç tutarından ${Math.abs(gap)} cent ${gap > 0 ? 'AZ' : 'FAZLA'}. Olası sebepler: okunamamış bir satır, nakliye kalemi, iskonto${
            input.vatAmountCents === null && input.vatRegime === 'standard' ? ' ya da okunmamış KDV (vatAmountCents gönderilmedi)' : ''
          }. Yöneticiye söyleyin.`,
  };
}

/** Eşleme sayıları — model kaç kalemin eşlemeden geldiğini, kaçının onayda eşleme olarak kaydedileceğini görsün. */
function mappingCountsOf(lines: ReadonlyArray<{ supplierItemKey: string | null; mappingProposed: boolean }>, approval: string) {
  const mappedFromSupplier = lines.filter((line) => line.supplierItemKey && !line.mappingProposed).length;
  const proposals = lines.filter((line) => line.mappingProposed).length;
  return {
    ...(mappedFromSupplier > 0 ? { mappedFromSupplier } : {}),
    ...(proposals > 0
      ? { mappingNote: `${proposals} kalemin tedarikçi eşlemesi yoktu; yönetici ${approval} onaylayınca eşleme bu adlarla kaydedilir ve sonraki fatura kendiliğinden eşleşir.` }
      : {}),
  };
}

/**
 * Mal kabul önerisi — faturayı model okur, araç doğrular (varyant var mı, depo kodu geçerli mi, SKT yazılmış mı).
 * Eksik alan reddedilir ve asistan patrona sorar, çünkü uydurma SKT ile giren parti raftaki malın tarihini yanlış gösterir.
 */
export async function proposeStockIntake(args: Record<string, unknown>) {
  const db = serviceDb();
  const warehouseCode = String(args.warehouseCode ?? '').trim();
  const rawLines = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : [];
  if (!warehouseCode) return { error: 'warehouseCode zorunlu — mal hangi depoya girdi?' };
  if (rawLines.length === 0) return { error: 'lines boş — faturadaki kalemleri verin.' };

  // Tesis aranır: araca tedarikçiden mal girmez, araç transferle dolar; web'deki kabul seçicisiyle aynı kural.
  const warehouse = (await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' })).find(
    (w) => w.code === warehouseCode,
  );
  if (!warehouse) return { error: `Depo bulunamadı: ${warehouseCode}` };

  // Tedarikçi faturadaki kimlikle ve kalemlerden önce çözülür (kalemler onun eşlemesinden geçer). Tedarikçisiz kabul son alış
  // fiyatını tazelemez (`receive_intake`), sonraki tedarik siparişi de tahmini tutar veremez.
  const { supplier, error: supplierError } = await resolveSupplier(db, args);
  if (supplierError) return { error: supplierError };

  // Eşlemeler bir kez okunur; kalem çözümü onlardan geçer (`resolveInvoiceLines`).
  const mappings = supplier ? await new SupplierProductService(db).listBySupplier(supplier.id) : [];
  const resolved = resolveInvoiceLines(mappings, supplier, rawLines);
  const named = await variantsWithNames(db, resolved.map((line) => line.variantId).filter(isUuid));

  // Kalem hataları toplu döner: doğrulamalar birbirinden bağımsız ve model bozuk satırların hepsini tek turda görmeli.
  const lines: StockIntakePayload['lines'] = [];
  const problems: string[] = [];
  for (const [i, raw] of rawLines.entries()) {
    const line = resolved[i]!;
    const found = named.get(line.variantId);
    const qty = Number(raw.qty);
    const expiryDate = String(raw.expiryDate ?? '').trim();

    problems.push(...invoiceLineProblems(i, line, found !== undefined, raw.qty));
    // SKT UYDURULMAZ: faturada/etikette yoksa asistan patrona sorar. Tarihsiz parti gıdada kör noktadır.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      problems.push(`lines[${i}]: expiryDate 'YYYY-AA-GG' olmalı (gelen: ${expiryDate || '(boş)'}). Belgede yoksa UYDURMAYIN — yöneticiye sorun.`);
    }
    if (!found || problems.length > 0) continue;

    lines.push({
      variantId: found.variant.id,
      productName: found.name,
      qty,
      expiryDate,
      lotNumber: typeof raw.lotNumber === 'string' && raw.lotNumber.trim() ? raw.lotNumber.trim() : null,
      unitCostCents: Number.isInteger(raw.unitCostCents) ? (raw.unitCostCents as number) : null,
      supplierItemKey: line.key,
      supplierItemName: line.name,
      mappingProposed: line.proposed,
    });
  }
  if (problems.length > 0) return { error: `${problems.length} kalem sorunu — hepsini düzeltip tekrar gönderin:`, problems };

  // Açık sipariş tedarikçiden bulunur, model kimlik taşımaz: tek açık sipariş varsa bağlanır, birden fazlaysa model referans
  // numarasıyla seçer. Seçilmezse kabul bağsız yazılır (plansız alım meşru) ama açık siparişler cevapta sayılır.
  const openOrders = supplier ? await new PurchaseOrderService(db).listOpenBySupplier(supplier.id) : [];
  const wantedRef = typeof args.purchaseOrderRef === 'string' ? args.purchaseOrderRef.trim() : '';
  const linkedOrder = wantedRef
    ? openOrders.find((o) => (o.referenceNo ?? '').toLowerCase() === wantedRef.toLowerCase())
    : openOrders.length === 1
      ? openOrders[0]
      : undefined;
  if (wantedRef && !linkedOrder) {
    const refs = openOrders.map((o) => o.referenceNo ?? `(numarasız · ${o.status})`).join(' · ');
    return { error: `Açık sipariş bulunamadı: '${wantedRef}'. ${supplier?.name} için açık olanlar: ${refs || 'yok'}` };
  }

  // Belgenin tarihi ve toplamı: bozuk tarih süzülür, çünkü geçirmek kabulü sessizce bugüne yazdırırdı. Toplam okunduysa fatura
  // onayda kabule bağlı belge olarak doğar ve tedarikçi borcu ondan türer; koşulları `invoiceTermsFrom` sınar.
  const date = isIsoDay(args.date) ? String(args.date) : null;
  const totalAmountCents =
    Number.isInteger(args.totalAmountCents) && (args.totalAmountCents as number) >= 0 ? (args.totalAmountCents as number) : null;
  const terms = await invoiceTermsFrom(db, args, supplier, { totalCents: totalAmountCents, issuedOn: date });
  if ('error' in terms) return { error: terms.error };

  const payload: StockIntakePayload = {
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    supplierId: supplier?.id ?? null,
    supplierName: supplier?.name ?? null,
    purchaseOrderId: linkedOrder?.id ?? null,
    documentNo: typeof args.documentNo === 'string' && args.documentNo.trim() ? args.documentNo.trim() : null,
    date,
    totalAmountCents,
    vatAmountCents: terms.vatAmountCents,
    vatRegime: terms.vatRegime,
    dueOn: terms.dueOn,
    lines,
  };
  const doc = payload.documentNo ? ` — irsaliye ${payload.documentNo}` : '';
  const queued = await queue(
    'stock_intake',
    payload,
    `${warehouse.code} deposuna ${lines.length} parti stok girişi${doc}`,
    args.reason,
    args.warnings,
  );

  // Belgenin toplamı ile bizimki (`invoiceTotalCheck`) — ancak bir kalemin bile maliyeti okunduysa.
  const anyCost = lines.some((line) => line.unitCostCents !== null);
  const totalCheck =
    totalAmountCents !== null && anyCost
      ? invoiceTotalCheck({
          totalAmountCents,
          vatAmountCents: terms.vatAmountCents,
          vatRegime: terms.vatRegime,
          linesCents: lines.reduce((sum, line) => sum + (line.unitCostCents ?? 0) * line.qty, 0),
        })
      : null;
  return {
    ...queued,
    ...mappingCountsOf(lines, 'girişi'),
    ...(payload.date ? {} : { dateNote: 'Belge tarihi verilmedi — kabul BUGÜNE yazılacak. Fatura dünküyse date alanını doldurun.' }),
    // Tedarikçi bağı: kurulmadıysa SESSİZ KALINMAZ. Bedeli görünmez ve zincirleme — son alış fiyatı
    // tazelenmez, sonraki tedarik siparişi tahmini tutar veremez.
    ...(supplier
      ? { supplier: supplier.name }
      : {
          supplierNote:
            'Tedarikçi bağlanmadı — bu kabul son alış fiyatını TAZELEMEZ ve sonraki sipariş önerisi "yaklaşık ne kadar" diyemez. Faturada tedarikçi yazıyorsa vergi numarasıyla (supplierVatNumber), telefonla (supplierPhone) ya da tam unvanla (supplierName) gönderin; kayıtlı değilse propose_supplier_create ile önerin.',
        }),
    ...(linkedOrder
      ? { linkedPurchaseOrder: linkedOrder.referenceNo ?? '(numarasız taslak)' }
      : openOrders.length > 1
        ? {
            openPurchaseOrders: openOrders.map((o) => o.referenceNo ?? `(numarasız · ${o.status})`),
            purchaseOrderNote: `${supplier?.name} için ${openOrders.length} açık sipariş var; hangisini karşıladığını purchaseOrderRef ile söyleyin, yoksa hiçbiri kapanmaz.`,
          }
        : {}),
    ...(totalCheck ? { totalCheck } : {}),
    // Faturanın belgesi: toplam ve tedarikçi varsa onayda kabule bağlı belge olarak doğar.
    ...(payload.totalAmountCents === null
      ? {}
      : {
          invoiceDocument: supplier
            ? `Onayda fatura kabule bağlı belge olarak doğar (rejim: ${payload.vatRegime}); tedarikçi borcu o belgeden türer. Dosyasını yönetici onay ekranında bırakır.`
            : 'Tedarikçi bağlanmadığı için fatura belge olarak DOĞMAZ — tedarikçiyi faturadaki kimlikle verin ya da propose_supplier_create ile önerin.',
        }),
  };
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
  // `purchase` kümede yok: stok alımı mal kabule bağlıdır ve motor bağsız satırı reddeder (`supply_link_missing`).
  if (!['expense', 'transfer', 'capital', 'misc'].includes(type)) {
    return {
      error:
        "type 'expense' | 'transfer' | 'capital' | 'misc' olmalı. Sipariş tahsilatı bu yoldan yazılamaz; MAL ALIMI da yazılamaz — alım mal kabulden geçer (propose_stock_intake).",
    };
  }

  const accounts = await new AccountService(db).list({ activeOnly: true });
  const account = accounts.find((a) => a.name.toLowerCase().includes(accountName.toLowerCase()));
  if (!account) return { error: `Hesap bulunamadı: '${accountName}'. Mevcutlar: ${accounts.map((a) => a.name).join(' · ')}` };

  // Hedef hesap da kaynakla aynı listeden adla çözülür; model uuid bilmez.
  const counterName = typeof args.counterAccountName === 'string' ? args.counterAccountName.trim() : '';
  const counterAccount = counterName ? (accounts.find((a) => a.name.toLowerCase().includes(counterName.toLowerCase())) ?? null) : null;
  if (counterName && !counterAccount) {
    return { error: `Hedef hesap bulunamadı: '${counterName}'. Mevcutlar: ${accounts.map((a) => a.name).join(' · ')}` };
  }
  if (counterAccount && counterAccount.id === account.id) {
    return { error: 'Kaynak ve hedef aynı hesap — transfer iki AYRI hesap arasında olur.' };
  }
  // Hedefsiz transfer YAZILMAZ: uygulanınca paranın gittiği yer kayıtsız kalır ve mutabakat
  // "bir hesaptan çıkmış ama hiçbir hesaba girmemiş" bir tutarla bozulur.
  if (type === 'transfer' && !counterAccount) {
    return {
      error: `Transferde counterAccountName zorunlu — para hangi hesaba gidiyor? Mevcutlar: ${accounts.map((a) => a.name).join(' · ')}`,
    };
  }

  // Tür öneri anında sözlükle eşlenir (`resolveNature`): onay ekranına kadar beklese türsüz hareket açılır, giderde kayıt kilitlenirdi.
  const natureWord = textArg(args.nature);
  if (natureWord && !acceptsNature(type as MoneyMovementPayload['type'])) {
    return { error: 'Transfer tür almaz — onu karşı hesap açıklar. nature alanını kaldırın.' };
  }
  const { nature, error: natureError } = await resolveNature(db, natureWord, direction as MoneyMovementPayload['direction']);
  if (natureError) return { error: natureError };

  // Kime ödendiği nokta atışı bulunur (`resolveCounterparty`); bulunamazsa öneri yine kurulur, ad kartta kalır — sözlüğe eklenecek
  // yeni bir caridir. Tedarikçi bu tipte yok: mal bedelinin ödemesi tedarikçinin belgesine bağlanır.
  const counterpartyText = textArg(args.counterpartyName);
  const { counterparty, error: counterpartyError } = await resolveCounterparty(db, counterpartyText);
  if (counterpartyError) return { error: counterpartyError };
  const payload: MoneyMovementPayload = {
    accountId: account.id,
    accountName: account.name,
    direction: direction as MoneyMovementPayload['direction'],
    amountCents,
    type: type as MoneyMovementPayload['type'],
    nature: nature?.slug ?? null,
    description: typeof args.description === 'string' && args.description.trim() ? args.description.trim() : null,
    counterpartyId: counterparty?.id ?? null,
    // Bulunduysa KAYITTAKİ ad (dilekçe kanonik adı taşısın), bulunmadıysa modelin yazdığı.
    counterpartyName: counterparty?.name ?? counterpartyText,
    counterAccountId: counterAccount?.id ?? null,
    // Hedef hesabın ADI da yazılıyor: kimlik tek başına okunamaz ve onay ekranı "Kasa → uuid" diye
    // bir transferi kimseye sunamaz. Liste zaten elde, ikinci sorgu açılmıyor.
    counterAccountName: counterAccount?.name ?? null,
    valueDate: typeof args.valueDate === 'string' ? args.valueDate : null,
  };
  const euro = formatPrice(amountCents, 'tr');
  // Transferin özeti YÖN cümlesidir ("Kasa → Banka"), gider/tahsilat değil: para şirketten
  // çıkmıyor, yer değiştiriyor. Aynı cümleyle anlatmak iki farklı işi tek görünüşe indirirdi.
  const summary = payload.counterAccountName
    ? `${account.name} → ${payload.counterAccountName}: ${euro} transfer`
    : `${account.name}: ${euro} ${direction === 'out' ? 'gider' : 'tahsilat'}${payload.counterpartyName ? ` — ${payload.counterpartyName}` : ''}`;
  const queued = await queue('money_movement', payload, summary, args.reason, args.warnings);
  return {
    ...queued,
    ...(nature ? { nature: nature.label } : {}),
    ...(counterpartyText && !counterparty ? { counterpartyNote: counterpartyNoteOf(counterpartyText) } : {}),
  };
}

/** Bulunamayan carinin notu — ad kartta kalır; para hareketi ve belge önerisinin ortak cümlesi. */
function counterpartyNoteOf(text: string): string {
  return `Cari bulunamadı: '${text}' — ad kartta duracak, kimliği yönetici seçer ya da Sözlük'ten açar. Tam adı ya da eşleşme kelimesini biliyorsanız onunla tekrar gönderin.`;
}

/**
 * Fatura kaleminin ORTAK sorunları — eşleşme, varyant kimliği ve adet (mal kabul ve faturadan sipariş).
 * Kalemin eşleşme sorunu varsa kimlik cümlesi yazılmaz: aynı kusur iki kez okunmasın.
 */
function invoiceLineProblems(i: number, line: ResolvedInvoiceLine, known: boolean, rawQty: unknown): string[] {
  const problems: string[] = [];
  if (line.problem) {
    problems.push(line.problem);
  } else if (!isUuid(line.variantId)) {
    problems.push(`lines[${i}]: variantId UUID biçiminde değil (gelen: "${line.variantId || '(boş)'}") — katalogdaki kimliği olduğu gibi kullanın.`);
  } else if (!known) {
    problems.push(`lines[${i}]: varyant bulunamadı (${line.variantId}) — katalogdan doğru kimliği bulun.`);
  }
  const qty = Number(rawQty);
  if (!Number.isInteger(qty) || qty <= 0) problems.push(`lines[${i}]: qty pozitif tam sayı olmalı (gelen: ${String(rawQty)}).`);
  return problems;
}

/**
 * Faturadan tedarik siparişi — tedarikçi faturayı mal gelmeden kesti; SKT ve lot henüz görülmediği için mal kabul yanlış araçtır.
 * Sipariş onayda gönderilmiş açılır (tedarikçiye mesaj gitmez), fatura siparişe bağlı belge olarak doğar ve mal gelince rampa
 * bu siparişi sayar; tedarikçi zorunlu, aynı numaralı fatura aynı tedarikçiye ikinci kez yazılmaz.
 */
async function proposeInvoicePurchaseOrder(
  db: ReturnType<typeof serviceDb>,
  args: Record<string, unknown>,
  warehouse: { id: string; code: string },
  rawLines: Record<string, unknown>[],
) {
  const { supplier, error: supplierError } = await resolveSupplier(db, args);
  if (supplierError) return { error: supplierError };
  if (!supplier) {
    return {
      error:
        'Faturadan siparişte tedarikçi zorunlu — faturadaki vergi numarasını (supplierVatNumber), telefonu (supplierPhone) ya da tam unvanı (supplierName) verin. Kayıtlı değilse önce propose_supplier_create ile önerin.',
    };
  }

  const invoiceArgs = typeof args.invoice === 'object' && args.invoice !== null ? (args.invoice as Record<string, unknown>) : null;
  if (!invoiceArgs) return { error: 'invoice zorunlu — faturadan siparişte faturanın tarihi (issuedOn) ve toplamı (totalAmountCents) gerekli.' };
  const totalAmountCents = invoiceArgs.totalAmountCents;
  if (!Number.isInteger(totalAmountCents) || (totalAmountCents as number) <= 0) {
    return { error: 'invoice.totalAmountCents faturanın yazdığı KDV dâhil toplam olmalı (cent, pozitif tam sayı) — satırların toplamı değil.' };
  }
  if (!isIsoDay(invoiceArgs.issuedOn)) return { error: "invoice.issuedOn 'YYYY-AA-GG' olmalı — faturanın üzerindeki tarih." };
  const issuedOn = String(invoiceArgs.issuedOn);
  const terms = await invoiceTermsFrom(db, invoiceArgs, supplier, { totalCents: totalAmountCents as number, issuedOn });
  if ('error' in terms) return { error: terms.error };
  const number = textArg(invoiceArgs.number);
  if (number && (await new MoneyDocumentService(db).listByNumber(number)).some((doc) => doc.supplierId === supplier.id)) {
    return { error: `${supplier.name} için '${number}' numaralı belge zaten kayıtlı — aynı fatura ikinci kez yazılmaz. Yöneticiye sorun.` };
  }

  // Eşlemeler bir kez okunur: kalem çözümü ve son alış fiyatı aynı listeden.
  const mappings = await new SupplierProductService(db).listBySupplier(supplier.id);
  const resolved = resolveInvoiceLines(mappings, supplier, rawLines);
  const named = await variantsWithNames(db, resolved.map((line) => line.variantId).filter(isUuid));
  const lastPriceByVariant = lastPriceByVariantOf(mappings);

  // Kalem hataları TOPLU döner (mal kabulün aynı gerekçesi): model bütün sorunları tek turda görsün.
  const lines: PurchaseOrderPayload['lines'] = [];
  const problems: string[] = [];
  for (const [i, raw] of rawLines.entries()) {
    const line = resolved[i]!;
    const found = named.get(line.variantId);
    problems.push(...invoiceLineProblems(i, line, found !== undefined, raw.qty));
    const price = raw.unitPriceCents;
    const priceGiven = price !== undefined && price !== null;
    if (priceGiven && (!Number.isInteger(price) || (price as number) < 0)) {
      problems.push(`lines[${i}]: unitPriceCents faturadaki KDV hariç birim fiyat olmalı (cent, tam sayı; gelen: ${String(price)}).`);
    }
    if (!found || problems.length > 0) continue;
    lines.push({
      variantId: found.variant.id,
      productName: found.name,
      qty: Number(raw.qty),
      lastPurchasePriceCents: lastPriceByVariant.get(found.variant.id) ?? null,
      // Faturanın birim fiyatı; okunmadıysa `null` ve kapı eşlemedeki son alışı yazar — uydurulmaz.
      unitPriceCents: priceGiven ? (price as number) : null,
      supplierItemKey: line.key,
      supplierItemName: line.name,
      mappingProposed: line.proposed,
    });
  }
  if (problems.length > 0) return { error: `${problems.length} kalem sorunu — hepsini düzeltip tekrar gönderin:`, problems };

  const invoice: InvoiceTermsPayload = {
    number,
    issuedOn,
    dueOn: terms.dueOn,
    totalAmountCents: totalAmountCents as number,
    vatAmountCents: terms.vatAmountCents,
    vatRegime: terms.vatRegime,
  };
  const note = textArg(args.note);
  const payload: PurchaseOrderPayload = {
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    supplierId: supplier.id,
    supplierName: supplier.name,
    lines,
    ...(note ? { note } : {}),
    source: 'invoice',
    invoice,
  };
  const summary = `${supplier.name} — fatura${number ? ` ${number}` : ''}: ${lines.length} kalemlik sipariş, mal bekleniyor (${warehouse.code})`;
  const queued = await queue('purchase_order', payload, summary, args.reason, args.warnings);

  const anyPrice = lines.some((line) => line.unitPriceCents !== null);
  return {
    ...queued,
    supplier: supplier.name,
    ...mappingCountsOf(lines, 'siparişi'),
    ...(anyPrice
      ? {
          totalCheck: invoiceTotalCheck({
            totalAmountCents: invoice.totalAmountCents,
            vatAmountCents: invoice.vatAmountCents,
            vatRegime: invoice.vatRegime,
            linesCents: lines.reduce((sum, line) => sum + (line.unitPriceCents ?? 0) * line.qty, 0),
          }),
        }
      : {}),
    invoiceDocument: `Onayda sipariş GÖNDERİLMİŞ açılır (tedarikçiye mesaj gitmez) ve fatura siparişe bağlı belge olarak doğar (rejim: ${invoice.vatRegime}); tedarikçi borcu o belgeden türer. Mal gelince rampa sayar, SKT ve lotu orada girer. Dosyasını yönetici onay ekranında bırakır.`,
  };
}

/**
 * Belge önerisi — mal dışı fatura ya da fiş (kira, muhasebeci, sigorta, akaryakıt); borç şimdi doğar, ödemesi sonra hareket
 * olarak gelip belgeye bağlanır. Mal faturası bu yoldan girmez: mal kabul ya da faturadan sipariş belgeyi stok bağıyla doğurur.
 */
export async function proposeMoneyDocument(args: Record<string, unknown>) {
  const db = serviceDb();
  const kind = DocumentKindEnum.safeParse(textArg(args.kind));
  if (!kind.success) return { error: `kind ${DocumentKindEnum.options.map((option) => `'${option}'`).join(' | ')} olmalı.` };
  const direction = textArg(args.direction);
  if (direction !== 'in' && direction !== 'out') {
    return { error: "direction 'out' (biz ödeyeceğiz — neredeyse hep) ya da 'in' (bize ödenecek: iade, alacak dekontu) olmalı." };
  }
  if (!isIsoDay(args.issuedOn)) return { error: "issuedOn 'YYYY-AA-GG' olmalı — belgenin üzerindeki tarih." };
  const issuedOn = String(args.issuedOn);
  const amountCents = args.amountCents;
  if (!Number.isInteger(amountCents) || (amountCents as number) <= 0) {
    return { error: 'amountCents belgenin yazdığı KDV dâhil toplam olmalı (cent, pozitif tam sayı).' };
  }

  // Karşı taraf en çok bir tanedir (`createMoneyDocument`): tedarikçi bulunamazsa hata, cari bulunamazsa ad kartta kalır.
  const counterpartyText = textArg(args.counterpartyName);
  const { supplier, error: supplierError } = await resolveSupplier(db, args);
  if (supplierError) return { error: supplierError };
  if (supplier && counterpartyText) {
    return {
      error: 'Belgenin tek karşı tarafı olur — tedarikçi kimliği ile counterpartyName birlikte verilmez. Belgeyi kesen tedarikçimizse yalnız tedarikçi kimliğini verin.',
    };
  }
  if (!supplier && !counterpartyText) {
    return {
      error: 'Karşı taraf gerekli — belgeyi kesen tedarikçimizse supplierVatNumber / supplierPhone / supplierName, değilse counterpartyName (belgedeki ad, olduğu gibi).',
    };
  }
  const { counterparty, error: counterpartyError } = await resolveCounterparty(db, counterpartyText);
  if (counterpartyError) return { error: counterpartyError };

  const { nature, error: natureError } = await resolveNature(db, textArg(args.nature), direction);
  if (natureError) return { error: natureError };

  const terms = await invoiceTermsFrom(db, args, supplier, { totalCents: amountCents as number, issuedOn });
  if ('error' in terms) return { error: terms.error };

  // Aynı numara aynı tarafa ikinci kez yazılmaz. Numara tekil DEĞİL (iki taraf aynı numarayı kesebilir),
  // bu yüzden karşı tarafla süzülür; cari bulunamadıysa kimlikle kıyaslanamaz — onayda operatör görür.
  const number = textArg(args.number);
  if (number && (supplier || counterparty)) {
    const booked = (await new MoneyDocumentService(db).listByNumber(number)).some((doc) =>
      supplier ? doc.supplierId === supplier.id : doc.counterpartyId === counterparty?.id,
    );
    if (booked) {
      return { error: `'${number}' numaralı belge ${supplier?.name ?? counterparty?.name} için zaten kayıtlı — aynı belge ikinci kez yazılmaz. Yöneticiye sorun.` };
    }
  }

  const payload: MoneyDocumentPayload = {
    kind: kind.data,
    number,
    issuedOn,
    dueOn: terms.dueOn,
    direction,
    supplierId: supplier?.id ?? null,
    supplierName: supplier?.name ?? null,
    counterpartyId: counterparty?.id ?? null,
    // Bulunduysa KAYITTAKİ ad, bulunmadıysa belgede yazan — para hareketi önerisinin aynı sözleşmesi.
    counterpartyName: counterparty?.name ?? counterpartyText,
    nature: nature?.slug ?? null,
    amountCents: amountCents as number,
    vatAmountCents: terms.vatAmountCents,
    vatRegime: terms.vatRegime,
    note: textArg(args.note),
  };
  const party = payload.supplierName ?? payload.counterpartyName ?? '';
  const summary = `Belge — ${party}: ${formatPrice(payload.amountCents, 'tr')}${nature ? ` (${nature.label})` : ''}`;
  const queued = await queue('money_document', payload, summary, args.reason, args.warnings);
  return {
    ...queued,
    ...(supplier ? { supplier: supplier.name } : {}),
    ...(nature ? { nature: nature.label } : {}),
    // Rejim verilmediyse sunucu önerdi — model neyin yazılacağını görsün.
    vatRegime: terms.vatRegime,
    ...(counterpartyText && !counterparty ? { counterpartyNote: counterpartyNoteOf(counterpartyText) } : {}),
    fileNote: 'Belgenin dosyası bu araçtan geçmez — yönetici onay ekranında bırakır.',
  };
}

/**
 * Tedarikçi önerisi — faturanın başlığından yeni kart; tedarikçiler hiçbir araçtan listelenmediği için yeni biri yalnız buradan girer.
 * Aynı vergi no, telefon ya da tam adla kayıt varsa (pasif de) ret ve kaydın adı söylenir, çünkü ikinci kart borcu ikiye bölerdi.
 */
export async function proposeSupplierCreate(args: Record<string, unknown>) {
  const db = serviceDb();
  const name = textArg(args.name);
  if (!name) return { error: 'name zorunlu — faturadaki tam unvan, olduğu gibi.' };
  const country = textArg(args.country)?.toUpperCase() ?? null;
  if (country && !/^[A-Z]{2}$/.test(country)) {
    return { error: `country ISO 3166-1 iki harfli kod olmalı (BE, TR, FR…; gelen: '${country}').` };
  }
  const term = args.paymentTermDays;
  const termGiven = term !== undefined && term !== null;
  if (termGiven && (!Number.isInteger(term) || (term as number) < 0)) {
    return { error: `paymentTermDays gün sayısı olmalı (tam sayı, 0 ya da büyük; gelen: '${String(term)}') — peşinse göndermeyin.` };
  }

  const identity = { vatNumber: textArg(args.vatNumber), phone: textArg(args.phone), name };
  const existing = pinpointSupplier(await new SupplierService(db).list(), identity);
  if (existing.status === 'found') {
    return { error: `Bu tedarikçi zaten kayıtlı: '${existing.record.name}'. Faturayı o kayıtla işleyin — vergi numarası ya da tam adıyla.` };
  }
  if (existing.status === 'ambiguous') {
    return { error: `Verilen kimlikler (vergi no, telefon, ad) ${existing.count} kayıtlı tedarikçiye gidiyor — tedarikçi zaten kayıtlı. Yöneticiye sorun.` };
  }

  const payload: SupplierCreatePayload = {
    name,
    vatNumber: identity.vatNumber,
    phone: identity.phone,
    email: textArg(args.email),
    address: textArg(args.address),
    country,
    paymentTermDays: termGiven ? (term as number) : null,
    note: textArg(args.note),
  };
  const queued = await queue(
    'supplier_create',
    payload,
    `Yeni tedarikçi — ${name}${country ? ` (${country})` : ''}`,
    args.reason,
    args.warnings,
  );
  return {
    ...queued,
    nextStep:
      'Yönetici kartı onaylayınca faturayı yeniden gönderin (propose_stock_intake · propose_purchase_order · propose_money_document) — tedarikçi o zaman vergi numarasıyla bulunur.',
  };
}

/**
 * Paket taslağı önerisi — model kalemleri ve tek fiyatı verir, payları motor dağıtır (`rebalanceAllocations`, liste fiyatlarına
 * oransal), çünkü modelin payları toplamı tutturmaz. Tam kuruş yüzünden tutmayan hedefte öneri yine kurulur ama fark söylenir.
 */
export async function proposeBundleDraft(args: Record<string, unknown>) {
  const db = serviceDb();
  const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
  const totalPrice = Number(args.totalPrice);
  const name = localizedArg(args.name);
  if (!name?.tr) return { error: 'name zorunlu — en az Türkçesi: { "tr": "Kahvaltı Paketi" }.' };
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
    name,
    // Açıklama üç dilde: paket müşteri yüzeyine çıkar ve vitrin Fransa.
    description: localizedArg(args.description),
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

  // `toCents` ŞART: paket ailesi EURO taşıyor, `formatPrice` ise cent istiyor (şemanın künyesi).
  const queued = await queue(
    'bundle_draft',
    payload,
    `${name.tr} — ${prepared.length} kalemlik paket, ${formatPrice(toCents(totalPrice), 'tr')}`,
    args.reason,
  );
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

  // Müşteri metni tek dilde de kabul edilir, eksik dili operatör formda tamamlar; hiç gelmezse öneri doğmaz, çünkü etiketsiz
  // indirimi veritabanı reddeder (`discount_public_label_filled`) ve kuyruğa uygulanamayacak kalem düşerdi.
  const publicLabel = localizedArg(args.publicLabel);
  if (!publicLabel) {
    return { error: 'publicLabel gerekli — müşterinin sepette okuyacağı ad. En az bir dil dolu olmalı.' };
  }

  const payload: DiscountDraftPayload = {
    name,
    publicLabel,
    trigger: trigger as DiscountDraftPayload['trigger'],
    type: type as DiscountDraftPayload['type'],
    percent,
    amountCents,
    scope: scope as DiscountDraftPayload['scope'],
    categoryId,
    collectionId,
    scopeName,
    minBasketCents: Number.isInteger(args.minBasketCents) ? (args.minBasketCents as number) : null,
    firstOrderOnly: args.firstOrderOnly === true,
    maxUses: positiveIntArg(args.maxUses),
    perCustomerLimit: positiveIntArg(args.perCustomerLimit),
    validFrom: typeof args.validFrom === 'string' ? args.validFrom : null,
    validTo: typeof args.validTo === 'string' ? args.validTo : null,
    code: typeof args.code === 'string' && args.code.trim() ? args.code.trim().toUpperCase() : null,
  };

  const value = type === 'percent' ? `%${percent}` : formatPrice(amountCents ?? 0, 'tr');
  const where = scopeName ? ` (${scopeName})` : '';
  return queue('discount_draft', payload, `${name}: ${value} indirim${where}`, args.reason, args.warnings);
}

/** Sofra tarifi taslağı — malzeme bağı VARYANTA; üç dil dolmadan yayınlanamaz (kural veride). */
export async function proposeRecipeDraft(args: Record<string, unknown>) {
  const db = serviceDb();
  const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
  const name = localizedArg(args.name);
  const steps = linesArg(args.steps);
  if (!name?.tr) return { error: 'name zorunlu — en az Türkçesi: { "tr": "Kuru Fasulye" }.' };
  if (!steps?.tr)
    return { error: 'steps zorunlu — hazırlanış adımları, her satır bir adım, NUMARASIZ: { "tr": "Fasulyeyi ıslatın\\nSoğanı kavurun" }.' };
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

  const payload: RecipeDraftPayload = {
    name,
    description: localizedArg(args.description),
    steps,
    serves: localizedArg(args.serves),
    // Süre, porsiyon ve öğün tarif formunun kutuları; sorulmazlarsa boş kalırlar.
    duration: localizedArg(args.duration),
    meal: localizedArg(args.meal),
    // "Evinizden" de MADDE listesi (ekran her satırın başına • basar) — adımlarla aynı kırpma.
    pantry: linesArg(args.pantry),
    items,
  };

  const langs = ['tr', name.fr ? 'fr' : null, name.de ? 'de' : null].filter(Boolean);
  // Doldurulmayan kutular sayılıp modele söylenir: model neyi atladığını görmezse eksik sessizce operatöre devrolur.
  const blanks = (
    [
      ['description', payload.description],
      ['duration', payload.duration],
      ['serves', payload.serves],
      ['meal', payload.meal],
      ['pantry', payload.pantry],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([field]) => field);

  const queued = await queue('recipe_draft', payload, `"${name.tr}" tarifi — ${items.length} malzeme`, args.reason, args.warnings);
  return {
    ...queued,
    languages: langs,
    // Üç dil dolmadan tarif YAYINLANAMAZ (kural veride). Asistan bunu baştan söylesin ki patron
    // onaylayıp "neden görünmüyor" demesin.
    publishNote:
      langs.length === 3
        ? 'Üç dil de dolu — onaydan sonra yayına alınabilir.'
        : `Yalnız ${langs.join('/')} dolu. Tarif üç dil dolmadan YAYINLANAMAZ; taslak olarak kalır.`,
    ...(blanks.length > 0
      ? {
          emptyFields: blanks,
          emptyFieldsNote: `Şu alanlar boş kaldı ve onay ekranında boş kutu olarak görünecek: ${blanks.join(' · ')}. Bilgin varsa öneriyi yeniden kur; yoksa yöneticiye hangilerini elle dolduracağını söyle.`,
        }
      : {}),
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

/** Porsiyon türü — kümenin dışındaki her şey `null` ("tek parça / dökme"). */
function porsiyonTuru(value: unknown): 'item' | 'slice' | 'package' | null {
  return value === 'item' || value === 'slice' || value === 'package' ? value : null;
}
