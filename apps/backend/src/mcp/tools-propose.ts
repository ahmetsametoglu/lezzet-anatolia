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
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import {
  acceptsNature,
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
// Para biçimi TEK YERDEN (`formatPrice`): özet cümleleri operasyon yüzeyinde okunuyor ve elle
// kurulan `(cents / 100).toFixed(2)` Türkçede yanlış ayraç veriyordu — "150.00 €" değil "150,00 €"
// (kullanıcı tespiti 12.08, onay ekranının başlığında görüldü).
import { formatPrice, stripLineOrdinals, toCents } from '@lezzet/helper';
import {
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
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type DocumentVatRegime,
  type FeaturedFlagPayload,
  type FeaturedTarget,
  type InvoiceTermsPayload,
  type MoneyDocumentPayload,
  type MoneyMovementPayload,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type SupplierCreatePayload,
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

/**
 * Dil başına metin argümanı (`{ "tr": "…", "fr": "…" }`). Model tek dil de verebilir — eksik dili
 * operatör formda tamamlar. Metin OLMAYAN değerler ve boş dizeler ayıklanır: boş bir dil "metin var"
 * gibi okunup yüzeyde boş bir etiket bırakırdı; hiçbir dil kalmazsa alan `null`.
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
 * MADDE LİSTESİ taşıyan çok dilli alan (tarif adımları · "Evinizden") — satır başındaki sıra
 * işareti SÖKÜLÜR.
 *
 * Sırayı ekran veriyor (`stripLineOrdinals` künyesi): metinde de numara olursa müşteri sayfasında
 * "1. 1. Baklavayı ısıtın" çıkıyor — ölçüldü 12.08. Araç açıklaması artık numarasız satır istiyor
 * ama kırpma yine de burada duruyor: modelin biçim alışkanlığına güvenip veriyi ona bırakmak,
 * düzeltilmesi imkânsız bir yerde (kayıtta) hata biriktirir.
 */
function linesArg(raw: unknown): Record<string, string> | null {
  const value = localizedArg(raw);
  if (!value) return null;
  return Object.fromEntries(Object.entries(value).map(([lang, text]) => [lang, stripLineOrdinals(text).trim()]));
}

/**
 * Tedarikçiyi FATURADAKİ KİMLİKLE bulur — iki aracın ortak kapısı (`stock_intake` · `purchase_order`).
 *
 * ── NOKTA ATIŞI (22.42 · kullanıcı kararı 14.09) ────────────────────────────
 * Bir tur ad PARÇASIYLA aranıyordu (`includes`) ve bulunamayınca hata MEVCUT TEDARİKÇİLERİN HEPSİNİ
 * yazıyordu; `reference_data` da listeyi zaten veriyordu. Kullanıcı ikisini de reddetti: *"yapay zekâ
 * tüm tedarikçileri ben çekeyim, veya birkaç karakterle isimde arama yapayım — bunlar doğru değil;
 * vergi numarası, telefon ya da tam ad faturanın üzerinde olur, nokta atışı arama yapması gerekir."*
 * Kimlik artık üç anahtardan biri — vergi numarası · telefon · tam ad — ve eşitlik tamdır
 * (`pinpointSupplier`). Bulunamayan kimlik HATADIR ama aday listesi DÖNMEZ: model faturaya bakar ya
 * da yöneticiye sorar; tahminle ikinci bir deneme yapmaz.
 *
 * Kimlik verilmediyse hata değil `null`: tedarikçi ikisinde de isteğe bağlı — plansız alım meşrudur.
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

/** Pozitif tam sayı argümanı; verilmediyse ya da anlamsızsa `null` ("sınır yok"). */
function positiveIntArg(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) > 0 ? (raw as number) : null;
}

/** Serbest metin argümanı — kırpılmış; boşsa ya da metin değilse `null` ("belgede yok"). */
function textArg(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * Varyantların kaydı ve okunur adı ("Ürün · Boy") — tek sorgu çifti. Tedarik siparişinin iki kipi ve mal
 * kabul aynı adı kuruyor (22.44); üç kopya, bir gün üç ayrı biçim olurdu.
 */
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
 * Cariyi NOKTA ATIŞI bulur (22.42 · kullanıcı kararı 14.09) — tam ad ya da eşleşme kelimesi
 * (`pinpointCounterparty`); cari listesi hiçbir araçtan dönmez. Para hareketi ve belge önerisinin (22.44)
 * ortak kapısı. Bulunamaması hata DEĞİL: ad kartta kalır, kimliği operatör seçer ya da Sözlük'ten açar.
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
 * Türü SÖZLÜKTEN doğrular (22.42) — slug ya da ad, yönüne uymalı (`matchNature`). Tanınmayan kelime HATADIR:
 * model `reference_data.natures`ten birini verir ya da alanı boş bırakır, türü operatör seçer. Para hareketi
 * ve belge önerisinin (22.44) ortak kapısı.
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

/** Önerinin ömrü — ayarlanabilir (`DOMAIN §6`: eşik/süre parametriktir), varsayılan 24 saat. */
async function expiryIso(): Promise<string> {
  const hours = await new SettingsService(serviceDb()).getNumber('assistant_proposal_ttl_hours', 24);
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function queue(kind: AssistantProposalKind, payload: unknown, summary: string, reason?: unknown) {
  // Şema kapısı BURADA da geçilir: kuyruğa şekli bozuk bir dilekçe girerse panel onu çizemez.
  parseProposalPayload(kind, payload);

  /**
   * **BENZER ÖNERİ UYARISI** (MCP tur 8 raporu §3.3 · 15.08).
   *
   * Kuyrukta bekleyen bir öneri varken aynı içerikli ikincisi sorunsuz kabul ediliyordu — raporun
   * kendi turunda "Gaziantep — STR" siparişi iki kez açıldı. Model kendi geçmişini hatırlamıyor ve
   * `list_proposals`'ı her yazımdan önce çağırmıyor; sonuç, patronun önüne çıkan mükerrer kalemler.
   *
   * **ENGEL DEĞİL UYARI ve bu bilinçli:** aynı özetli ikinci bir öneri meşru olabilir (ilki bayat
   * kaldı, koşullar değişti, ilki reddedilmek üzere). Reddetseydik doğru bir öneriyi de keserdik.
   * Sayım YAZMADAN ÖNCE yapılıyor ki cümle "senden önce N tane bekliyordu" olsun — kendini saymak
   * her öneriyi mükerrer gösterirdi.
   */
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
  const off = listPriceCents ? ` (liste ${formatPrice(listPriceCents, 'tr')}, %${percent === null ? '?' : Math.round(percent)} indirim)` : '';
  const summary = `${productName} — ${batch.physicalQty} adet ${formatPrice(offerPriceCents, 'tr')} fırsat fiyatına${off}; SKT ${batch.expiryDate}`;
  return queue('batch_offer', payload, summary, args.reason);
}

/**
 * Vitrin işareti önerisi — hedef **ADIYLA** bulunur (11.08 · MCP denetim raporu, madde 12).
 *
 * ── ARAÇ ALTI TUR BOYUNCA KULLANILAMADI ─────────────────────────────────────
 * Girdi `id: uuid` istiyordu ve o kimliği veren HİÇBİR okuma aracı yoktu: `catalog_health` ürün
 * ve varyant kimliği veriyor, `reference_data` kategori/koleksiyonu yalnız ADIYLA listeliyordu.
 * Yani model "Dondurma kategorisini vitrine al" isteğine karşılık gelecek öneriyi **fiziksel
 * olarak yazamıyordu** — denetim raporunda altı turun altısında `0/2` ile düştü ve on bir öneri
 * tipinden biri tamamen kapalı kaldı.
 *
 * Kopukluk bir güvenlik kuralı değildi, bir eksikti: veri vardı, asistana verilmiyordu. Çözüm de
 * projenin kendi deseni — `zone_extend` (zoneName), `money_movement` (accountName),
 * `discount_draft` (scopeName), `product_create` (categoryName) hepsi adla çözüyor. Kimlik isteyen
 * tek araç buydu.
 *
 * **Ad bulunamazsa mevcutlar YAZILIR:** model doğrusunu seçebilsin diye (öteki araçların hepsi
 * böyle yapıyor). Kimlik hâlâ payload'a yazılıyor — uygulama kimlikle çalışır, çünkü kayıt onay
 * beklerken yeniden adlandırılabilir.
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
  // Vitrinin BUGÜNKÜ doluluğu da okunur: "bir tane daha ekle" ile "sekizinciyi ekle" aynı karar
  // değil — vitrin bir liste değil seçkidir, dolu olan aşağı iter (denetim taraması 09.08).
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
  const queued = await queue('featured_flag', payload, `${match.label} ${verb} (${target})`, args.reason);

  /**
   * **IZGARANIN DOLULUĞU YANITTA** (MCP tur 8 raporu §3.9 · ölçüldü 15.08).
   *
   * Araç tanımı *"the reply tells you how many are on it today"* diye söz veriyordu ve tutmuyordu:
   * sayı `payload.currentlyFeaturedCount`a yazılıp orada kalıyor, model onu hiç görmüyordu. Vitrin
   * bir SEÇKİ — dolu bir ızgaraya ekleme yapmak sıradaki birini aşağı iter; bunu bilmeden verilen
   * öneri, etkisini bilmeden verilmiş demektir.
   *
   * **Kuyrukta bekleyen vitrin önerileri de sayılıyor** ve bu ikinci yarısı: model kendi açtığı
   * önerileri hatırlamıyor, aynı ızgaraya üst üste öneri yığabiliyordu (raporun kendi vakası — dört
   * vitrin önerisi biriktirdi). Bekleyenler henüz uygulanmadı, yani ızgarada GÖRÜNMÜYORLAR; ayrı
   * söyleniyor ki toplamla karıştırılmasın.
   *
   * Sayı ONAY ANININ değil ÖNERİNİN kurulduğu anın gerçeğidir — panel kendi hesabını yeniden yapar.
   */
  const pendingSameTarget = (await new AssistantProposalService(db).listPending()).filter(
    (row) => row.kind === 'featured_flag' && (row.payload as { target?: string }).target === target,
  ).length;
  const placement = FEATURED_PLACEMENT[target as FeaturedTarget];
  const slots = FEATURED_SLOTS[target as FeaturedTarget];

  return {
    ...queued,
    showcase: {
      target,
      // **HANGİ BÖLÜM ve HANGİ KURAL** (kullanıcı düzeltmesi 15.08): üçüne de "vitrin" deniyor ama
      // üçü ayrı yerde, ayrı mantıkla çiziliyor. Bunu söylemeyen bir yanıt, modeli koleksiyon için
      // "biri düşecek" diye yanlış uyarır — orada düşme yok, rotasyon var.
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
 * Tedarik siparişi önerisi — kalemler eşik-altı ÖNERİSİNDEN gelir, modelden değil.
 *
 * Model yalnız "hangi depo, hangi tedarikçi" der; adetleri motor hesaplar (`ReorderService`).
 * Adedi modele bıraksaydık, eşiğin altındaki gerçek açığı değil modelin tahminini sipariş ederdik.
 */
export async function proposePurchaseOrder(args: Record<string, unknown>) {
  const db = serviceDb();
  const warehouseCode = String(args.warehouseCode ?? '').trim();
  if (!warehouseCode) return { error: 'warehouseCode zorunlu (örn. "STR").' };

  // TESİS aranır (02.09): satın alma önerisi "bu deponun rafı boşalıyor" demektir, araçta raf yok.
  // Araç kodu verilirse cevap "bulunamadı" olur — doğrusu bu, çünkü orada sipariş edilecek bir şey
  // gerçekten yok; sessizce boş öneri dönmek asistanı "eşik yok" diye yanıltırdı.
  const warehouse = (await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' })).find(
    (w) => w.code === warehouseCode,
  );
  if (!warehouse) return { error: `Depo bulunamadı: ${warehouseCode}` };

  // ── FATURA KİPİ (22.44 · kullanıcı kararı 14.09) ──────────────────────────
  // Kalemleri faturanın kendisi taşıyor: eşik altı motoru devreye girmez, adet ve fiyat faturadan.
  // İki kip TEK araçta, çünkü ikisi de "bu depoya bu tedarikçiden mal gelecek" diyor — ayrı araç,
  // modelin hangisini seçeceğini tahmin etmesini isterdi. Kalemsiz fatura bir kip değil, eksik çağrıdır.
  const invoiceLines = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : [];
  if (invoiceLines.length > 0) return proposeInvoicePurchaseOrder(db, args, warehouse, invoiceLines);
  if (args.invoice !== undefined) return { error: 'invoice verildi ama lines boş — faturadan siparişte faturadaki kalemleri de verin.' };

  const groups = await new ReorderService(db).suggestions(warehouse.id);
  const withSupplier = groups.filter((g) => g.supplierId !== null);
  if (withSupplier.length === 0) {
    return { error: `${warehouseCode} deposunda tedarikçisi eşlenmiş, eşik altı kalem yok — sipariş önerisi kurulamıyor.` };
  }

  // Tedarikçi seçilmediyse EN BÜYÜK grup; birden çok tedarikçi varsa modele söylenir ki
  // patrona "hangisi" diye sorabilsin — sessizce birini seçmek, öbür eksiği görünmez kılardı.
  //
  // Seçim ADLA (11.08): burada da `supplierId: uuid` isteniyordu ve model o kimliği hiçbir okuma
  // aracından alamıyordu — yani "Anadolu Gıda'ya sipariş aç" isteği karşılanamıyor, araç her
  // seferinde en büyük gruba düşüyordu. Alan opsiyonel olduğu için arıza sessizdi: öneri kuruluyor
  // ama istenen tedarikçiye değil.
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

  // Tedarikçinin kataloğu: "bu kalem bu tedarikçiden en son kaça alınmıştı". Sipariş tutarı buradan
  // TAHMİN ediliyor — kesin fiyat mal kabulde doğuyor, ama patron kasadan ne çıkacağını görmeden
  // sipariş onaylamamalı.
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
      // Son alış fiyatı TEK sorguda (tedarikçinin kataloğu): satır başına sorgu, on dört kalemlik
      // bir siparişte on dört gidiş dönüş demekti. Eşlemesi olmayan kalemde `null` — uydurulmuyor.
      lastPurchasePriceCents: lastPriceByVariant.get(line.variantId) ?? null,
      // Eşik altı önerisinde fatura yok (22.44): birim fiyatı eşlemedeki son alış söyler, tedarikçinin
      // kalem adı ve eşleme önerisi de yok — kalemler zaten eşlemeden geliyor.
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
  const queued = await queue('purchase_order', payload, summary, args.reason);
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

  // ── ÜLKE: önce MODELİN dediği, sonra bölgenin kodları, en sonda DEPONUN ülkesi ──
  //
  // Posta kodu sınır ötesi benzersiz DEĞİL (`DeliveryZonePostalCode` künyesi: 67000 hem Fransa'da
  // hem Almanya'da var), yani ülke kararın parçası. Araç bunu hiç sormuyordu ve bölgenin İLK
  // kodundan türetiyordu — kodu olmayan yeni bir bölgede sabit `'FR'`e düşüyordu. Bir Alman
  // bölgesinin ilk kodu böyle yanlış ülkeye yazılırdı ve hata sessiz olurdu: kod görünür, kapsama
  // girmez. Sabit yerine deponun ülkesi son çare — bölge tek depoya bağlı (`DOMAIN §17`), yani
  // dayanağı olan bir cevap.
  //
  // BEKLEYEN(BACKLOG §8): `postal_code_demand` ülke taşımıyor (anahtarı yalnız `postal_code`),
  // o yüzden `demand_signals` çıktısı da ülkesiz — model ülkeyi ancak patrondan öğrenir.
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
 * Ambalajdan okunan beyan alanlarının ortak ayrıştırıcısı (22.6) — iki ürün aracı da bunu kullanır.
 *
 * **Alerjen SERBEST METİN DEĞİL**: 14'lük kapalı kümeden seçilir. Model "süt içerebilir" diye bir
 * cümle yazamaz; ya listedeki değeri işaretler ya hiç. Tanınmayan değer sessizce atılmaz, HATA
 * döner — gıdada sessiz atlama, eksik alerjenin ta kendisidir.
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

/** Modelin "net okuyamadım" dediği alanlar — ekran gözü oraya çeker (`AI_ADMIN_ASSISTANT §5`). */
function readUncertain(args: Record<string, unknown>): string[] {
  return Array.isArray(args.uncertainFields) ? args.uncertainFields.map((f) => String(f)).filter(Boolean) : [];
}

/**
 * Ürün taslağının doldurulması — 22.6'da **ambalaj fotoğrafından** okuma senaryosuna açıldı.
 *
 * Alerjen ve saklama artık YAZILABİLİR (22.3'te şemayla yasaklıydı): ambalajın fotoğrafını patron
 * veriyorsa bilgi uydurma değil belgeden okumadır — fatura senaryosunda aynı karar verilmişti.
 * Duvar ekrana taşındı; veri tarafındaki ayak (yayın kararı asistana kapalı) yerinde duruyor.
 */
export async function proposeProductDraft(args: Record<string, unknown>) {
  const productId = String(args.productId ?? '').trim();
  if (!productId) return { error: 'productId zorunlu (catalog_health çıktısındaki ürünlerden).' };
  if (!isUuid(productId)) return badIdError('productId', productId);

  const product = await new ProductService(serviceDb()).getById(productId);
  if (!product) return { error: `Ürün bulunamadı: ${productId}` };

  const { fields, problems } = readDeclarations(args);
  if (problems.length > 0) return { error: `${problems.length} alan sorunu:`, problems };
  if (Object.keys(fields).length === 0) {
    return { error: 'Hiçbir alan verilmedi — ad, açıklama, içindekiler, saklama, besin künyesi, alerjen ya da iz.' };
  }

  // TAMLIK MOTORDAN: "bu öneri uygulanırsa hangi beyanlar hâlâ eksik kalır". Araç kendi ölçütünü
  // uydurmuyor — `missingDeclarations` ekranın, sunucu süzgecinin ve sayacın da okuduğu sözlük.
  const merged = { ...product, ...fields } as Parameters<typeof missingDeclarations>[0];
  const payload: ProductDraftPayload = {
    productId,
    productName: resolveLocalizedText(product.name, 'tr'),
    fields: fields as ProductDraftPayload['fields'],
    // Bugünkü hâl ÖNERİYLE BİRLİKTE taşınır: uygulama üzerine yazıyor ve sürüm tutmuyor, yani
    // dolu bir açıklama onaylandığı an kayboluyor. Patron neyi kaybedeceğini görerek onaylasın.
    currentFields: {
      name: product.name,
      description: product.description,
      ingredients: product.ingredients,
      storageInstructions: product.storageInstructions,
      nutrition: product.nutrition,
      allergens: product.allergens,
      traces: product.traces,
    },
    uncertainFields: readUncertain(args),
    remainingGaps: missingDeclarations(merged),
  };
  const filled = Object.keys(fields);
  const summary = `"${payload.productName}" ürününde ${filled.join(' + ')} alanı dolduruldu`;
  return queue('product_draft', payload, summary, args.reason);
}

/**
 * YENİ ÜRÜN önerisi — ambalajın fotoğrafından (22.6, kullanıcı senaryosu).
 *
 * Öteki tiplerden farkı: katalogda olmayan bir şeyi doğurur. Bu yüzden iki emniyet burada
 * BİRLİKTE duruyor ve ikisi de kod tarafında:
 *
 * - **Ürün ADAY doğar** — `status` payload'da yok, uygulayıcı `candidate` yazıyor. Asistan beyanı
 *   doldurabilir ama ürünü satışa çıkaramaz; yanlış okunmuş bir alerjen vitrine düşmez.
 * - **Kategori addan ÇÖZÜLÜR ve gerçekten var olmalı.** Uydurma bir kategori adı, ürünü hiçbir
 *   yerde görünmeyen bir kovaya atardı — model kategori uuid'si de ezberlemez.
 *
 * Fiyat ve stok BİLEREK YOK: ikisi de ayrı karar, ayrı ekran. Varyant en az bir tane (şema
 * zorluyor) — varyantsız ürün satılamaz, çünkü fiyat ve stok varyanta bağlıdır.
 */
export async function proposeProductCreate(args: Record<string, unknown>) {
  const db = serviceDb();
  const name = args.name;
  if (!name || typeof name !== 'object' || !(name as Record<string, unknown>).tr) {
    return { error: 'name zorunlu ve en az Türkçesi dolu olmalı — { "tr": "…", "fr": "…", "de": "…" }.' };
  }

  const rawVariants = Array.isArray(args.variants) ? (args.variants as Record<string, unknown>[]) : [];
  if (rawVariants.length === 0) {
    return { error: 'variants boş — en az bir boy gerekir ("500 g", "1 kg"). Varyantsız ürün satılamaz: fiyat ve stok boya bağlıdır.' };
  }
  // Etiket ("500 g") ile ölçü (500) AYRI alanlar: biri müşterinin okuduğu metin, öteki kilo başı
  // fiyatın tabanı. İkisi de ambalajda yazıyor (11.08).
  //
  // **AMBALAJ ÖLÇÜSÜ AYRI BİR SINIF (28.08):** `packed*` alanları ambalajın üstünde YAZMAZ —
  // tartılıp ölçülür. Araç künyesi modele "bilmiyorsan boş bırak" diyor; buradaki okuma da
  // savunmacı: pozitif tam sayı değilse `null`, yani "ölçülmedi". Tahmin edilmiş bir sayı kargo
  // tarifesine girer ve yanlış tarife faturada düzeltilir.
  const variants = rawVariants.flatMap((v) =>
    v.label && typeof v.label === 'object'
      ? [
          {
            label: v.label as ProductCreatePayload['variants'][number]['label'],
            netWeightG: typeof v.netWeightG === 'number' && v.netWeightG > 0 ? v.netWeightG : null,
            piecesCount: Number.isInteger(v.piecesCount) && (v.piecesCount as number) > 0 ? (v.piecesCount as number) : null,
            portionKind: porsiyonTuru(v.portionKind),
            packedWeightG: pozitifTam(v.packedWeightG),
            packedLengthMm: pozitifTam(v.packedLengthMm),
            packedWidthMm: pozitifTam(v.packedWidthMm),
            packedHeightMm: pozitifTam(v.packedHeightMm),
          },
        ]
      : [],
  );
  if (variants.length !== rawVariants.length) return { error: 'Her varyantın `label` alanı olmalı — { "tr": "500 g" }.' };

  const dateType = String(args.dateType ?? '').toUpperCase();
  if (dateType !== 'DLC' && dateType !== 'DDM') {
    return { error: "dateType 'DLC' | 'DDM' olmalı. DLC = güvenlik tarihi (geçince imha), DDM = kalite tarihi (geçince hâlâ satılabilir)." };
  }

  const { fields, problems } = readDeclarations(args);
  if (problems.length > 0) return { error: `${problems.length} alan sorunu:`, problems };

  // Kategori ADLA bulunur; bulunamazsa mevcutlar yazılır ki model doğrusunu seçebilsin.
  const categoryName = typeof args.categoryName === 'string' ? args.categoryName.trim() : '';
  const categories = await new CategoryService(db).list({ activeOnly: true });
  const category = categoryName
    ? categories.find((c) => resolveLocalizedText(c.name, 'tr').toLowerCase().includes(categoryName.toLowerCase()))
    : null;
  if (categoryName && !category) {
    return { error: `Kategori bulunamadı: '${categoryName}'. Mevcutlar: ${categories.map((c) => resolveLocalizedText(c.name, 'tr')).join(' · ')}` };
  }

  const vatRate = typeof args.vatRate === 'number' ? args.vatRate : 5.5;
  const shelfLifeDays = Number.isInteger(args.shelfLifeDays) && (args.shelfLifeDays as number) > 0 ? (args.shelfLifeDays as number) : null;

  // Tamlık MOTORDAN — yeni kayıtta karşılaştırılacak eski hâl yok, payload'ın kendisi ölçülür.
  const remainingGaps = missingDeclarations({
    name: name as Parameters<typeof missingDeclarations>[0]['name'],
    ingredients: (fields.ingredients ?? null) as Parameters<typeof missingDeclarations>[0]['ingredients'],
    nutrition: (fields.nutrition ?? null) as Parameters<typeof missingDeclarations>[0]['nutrition'],
    storageInstructions: (fields.storageInstructions ?? null) as Parameters<typeof missingDeclarations>[0]['storageInstructions'],
    allergens: (fields.allergens ?? []) as Parameters<typeof missingDeclarations>[0]['allergens'],
  });

  const payload: ProductCreatePayload = {
    ...fields,
    name: name as ProductCreatePayload['name'],
    categoryId: category?.id ?? null,
    categoryName: category ? resolveLocalizedText(category.name, 'tr') : null,
    dateType,
    shelfLifeDays,
    vatRate,
    // Kargolanabilirlik ambalajdan okunur ama emin olmadan yazılmaz: `undefined` bırakmak
    // "bilmiyorum"dur ve ürün kapının varsayılanıyla doğar (11.08).
    shippable: typeof args.shippable === 'boolean' ? args.shippable : null,
    variants,
    uncertainFields: readUncertain(args),
    remainingGaps,
  };

  const boy = variants.map((v) => resolveLocalizedText(v.label, 'tr')).join(' · ');
  const summary = `Yeni ürün: "${resolveLocalizedText(payload.name, 'tr')}" (${boy})${category ? ` — ${payload.categoryName}` : ''}`;
  return queue('product_create', payload, summary, args.reason);
}

/** Fatura kalemi → varyant: eşlemeden mi geldi, öneri mi, sorun mu (22.43 · 22.44). */
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

interface ResolvedInvoiceLine {
  variantId: string;
  key: string | null;
  name: string | null;
  proposed: boolean;
  problem: string | null;
}

/**
 * FATURA KALEMLERİ TEDARİKÇİNİN ADIYLA ÇÖZÜLÜR (22.43 · kullanıcı kararı 14.09) — mal kabul ve faturadan
 * sipariş (22.44) aynı çözümü kullanır; ikinci bir kopya iki ayrı eşleşme kuralı demekti.
 *
 * Fatura kalemi tedarikçinin diliyle yazılıdır ("Druivenmelasse 650gr"); bizim varyantımıza bağ tedarikçi
 * eşlemesidir (`supplier_product`). Anahtar kod, kod yoksa adın slug'ı — motor `supplierItemKeyOf`;
 * eşitlik tamdır (`matchSupplierItem`), parça ad yok. Eşleme yoksa model katalogda bulduğu varyantı adla
 * BİRLİKTE gönderir: kalem "eşleme önerisi" olarak işaretlenir, onayda eşleme kaydedilir ve sonraki fatura
 * tam eşleşir. Model tek başına uydurmaz: adsız kalem için variantId zaten şart; adlı ama eşlemesiz kalem
 * için variantId yoksa cevap "eşleme yok".
 *
 * Eşlemeler ÇAĞIRANDAN gelir: faturadan sipariş son alış fiyatını da aynı listeden okuyor, ikinci sorgu
 * açılmaz. Tedarikçi yoksa liste boştur.
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
 * FATURANIN KDV'Sİ, REJİMİ VE VADESİ (22.44 · 12.26) — mal kabul, faturadan sipariş ve belge önerisinin
 * ORTAK doğrulaması; üç kopya üç ayrı kural olurdu.
 *
 * Rejim verilmediyse tedarikçinin ülkesinden ÖNERİLİR (`suggestVatRegime`: Fransa dışındaki tedarikçinin
 * KDV'siz faturası ters yüklemedir). Verilen rejim KDV'yle çelişiyorsa RET (`vatRegimeProblem`): ters
 * yüklemede ve muafiyette belgede KDV olmaz. KDV toplamı aşamaz ve vade belge gününden önce olamaz — belge
 * kapısının (`createMoneyDocument`) kuralları; burada yakalanmasa öneri onay anında düşerdi.
 *
 * Vade yalnız belgede yazıyorsa: model hesaplamaz. Bozuk KDV ya da vade RET — bir tur sessizce süzülüyordu
 * ve süzülen değer "belgede yok" diye okunuyordu (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
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
 * FATURANIN TOPLAMI İLE SATIRLARIN TOPLAMI — mal kabul ve faturadan siparişin ortak kontrolü (22.44).
 *
 * Karşılaştırma KDV HARİÇ: satır fiyatları KDV hariçtir, faturanın toplamı KDV dâhil — KDV biliniyorsa
 * düşülür. Bir tur düşülmüyordu ve her KDV'li faturada "fark" KDV'nin kendisi çıkıyordu. Fark varsa MODEL
 * ÖĞRENSİN: düzeltmenin ucuz anı onaydan öncesidir, sonra parti maliyetleri ve borç yazılmış olur.
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

/**
 * Eşleme sayıları (22.43) — model kaç kalemin tedarikçi eşlemesinden geldiğini, kaçının onayda eşleme olarak
 * kaydedileceğini görsün; "hepsini ben buldum" sanmasın. Mal kabul ve faturadan siparişin ortak cevabı.
 */
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

  // TESİS aranır (02.09): mal kabulün hedefi bir tesistir — araca tedarikçiden mal girmez, araç
  // transferle dolar. Web'deki kabul seçicisiyle aynı kural; asistan yolundan da atlanamamalı.
  const warehouse = (await new WarehouseService(db).list({ activeOnly: true, kind: 'facility' })).find(
    (w) => w.code === warehouseCode,
  );
  if (!warehouse) return { error: `Depo bulunamadı: ${warehouseCode}` };

  // ── TEDARİKÇİ FATURADAKİ KİMLİKLE BULUNUR (11.08 adla · 22.42 nokta atışı, `resolveSupplier`) ──
  //
  // Önce `supplierId: uuid` isteniyordu ve o kimliği veren hiçbir okuma aracı yoktu — `reference_data`
  // o gün tedarikçileri adlarıyla listeliyordu (22.42'de listeleme kalktı). Sonuç ÖLÇÜLDÜ: son turdaki
  // iki mal kabulün ikisi de tedarikçisiz yazılmıştı. Bedeli görünmez ve zincirleme: `receive_intake`
  // son alış fiyatını `where supplier_id = p_supplier_id` ile tazeliyor, yani tedarikçi boşken HİÇBİR
  // satır güncellenmiyor (0010_supply.sql:236). Fiyat tazelenmeyince `propose_purchase_order` da
  // "yaklaşık ne kadara mal olacak" sorusunu cevaplayamıyor — 22.12'de açılan alan hep boş kalırdı.
  //
  // Tedarikçi KALEMLERDEN ÖNCE çözülür (22.43): kalemler onun eşlemesinden geçiyor.
  const { supplier, error: supplierError } = await resolveSupplier(db, args);
  if (supplierError) return { error: supplierError };

  // ── KALEMLER TEDARİKÇİNİN ADIYLA ÇÖZÜLÜR (22.43) — ortak yardımcıda (`resolveInvoiceLines`):
  // faturadan sipariş de aynı çözümü kullanır (22.44), iki kopya iki ayrı eşleşme kuralı olurdu.
  // Eşlemeler bir kez okunur; kalem çözümü onlardan geçer (`resolveInvoiceLines`).
  const mappings = supplier ? await new SupplierProductService(db).listBySupplier(supplier.id) : [];
  const resolved = resolveInvoiceLines(mappings, supplier, rawLines);
  const named = await variantsWithNames(db, resolved.map((line) => line.variantId).filter(isUuid));

  // ── KALEM HATALARI TOPLU DÖNER (harici MCP denetiminin önerisi, 09.08) ────
  // İlk hatada dönmek "short-circuit"tü ve teknik olarak doğruydu; ama her araç çağrısı modelin
  // bağlam bütçesinden yiyor. Beş bozuk satırı beş turda öğrenmek yerine tek turda öğrensin:
  // bunlar birbirinden BAĞIMSIZ doğrulamalar, sıralamanın bir anlamı yok.
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

  // ── AÇIK SİPARİŞ TEDARİKÇİDEN BULUNUR, MODEL UUID TAŞIMAZ ─────────────────
  //
  // `purchaseOrderId` de elde edilemeyen bir kimlikti: açık siparişleri listeleyen okuma aracı yok.
  // Ölçüldü — son turdaki iki kabulün ikisi de siparişsizdi, yani hiçbir sipariş kapanmıyordu ve
  // "yolda" sayılan mal sonsuza dek yolda kalıyordu.
  //
  // Bağ MODELE SORULMUYOR, tedarikçiden türetiliyor: tek açık sipariş varsa bağlanır. Birden
  // fazlaysa SEÇİM MODELİNDİR ama kimlikle değil referans numarasıyla — ve seçilmezse kabul
  // bağsız yazılır (plansız alım meşrudur), ama açık siparişler cevapta SAYILIR ki bağ sessizce
  // düşmesin.
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

  // ── FATURANIN KDV'Sİ, REJİMİ VE VADESİ (22.44 · 12.26) ───────────────────
  // Toplam okunduysa fatura onayda kabule bağlı bir BELGE olarak doğar ve tedarikçi borcu o belgeden
  // türer. Rejim verilmediyse tedarikçinin ülkesinden önerilir; verilen rejim KDV'yle çelişiyorsa RET.
  // Belgenin tarihi ve toplamı (11.08). Tarih biçimi burada süzülüyor: bozuk bir tarihi geçirmek,
  // kabulü sessizce bugüne yazdırmaktan farksız olurdu. İkisi faturanın koşullarını da sınıyor —
  // KDV toplamı aşamaz, vade kabulün gününden önce olamaz (`invoiceTermsFrom`).
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
  const queued = await queue('stock_intake', payload, `${warehouse.code} deposuna ${lines.length} parti stok girişi${doc}`, args.reason);

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
    // Faturanın belgesi (22.44): toplam ve tedarikçi varsa onayda kabule bağlı belge olarak doğar.
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

  // ── HEDEF HESAP DA ADLA ÇÖZÜLÜR (11.08 · alan denkliği taraması) ──────────
  // Önce yalnız `counterAccountId` okunuyordu ve o alan araç girdisinde HİÇ TANIMLI DEĞİLDİ: kod
  // hedefi bekliyor, model onu göndermeyi bilmiyordu. Sonuç sessiz — transfer önerisi kuruluyor,
  // paranın nereye gittiği hep boş kalıyordu. Kaynağı adla bulup hedefi uuid'ye bağlamak zaten
  // yarım bir kolaylıktı; ikisi de aynı listeden, aynı biçimde çözülüyor.
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

  // ── TÜR SÖZLÜKTEN, ÖNERİ ANINDA DOĞRULANIR (22.42) ──────────────────────
  // Bir tur serbest `category` kelimesiydi ve sözlükle ancak onay ekranında karşılaştırılıyordu:
  // eşleşmeyince hareket türsüz açılıyor, giderde kaydet düğmesi kilitleniyordu. Kelime artık
  // burada sözlükle eşlenir (`resolveNature`); tanınmayan kelime HATADIR.
  const natureWord = textArg(args.nature);
  if (natureWord && !acceptsNature(type as MoneyMovementPayload['type'])) {
    return { error: 'Transfer tür almaz — onu karşı hesap açıklar. nature alanını kaldırın.' };
  }
  const { nature, error: natureError } = await resolveNature(db, natureWord, direction as MoneyMovementPayload['direction']);
  if (natureError) return { error: natureError };

  // ── CARİ NOKTA ATIŞI (22.42 · kullanıcı kararı 14.09) ─────────────────────
  // Kime ödendiği tam ad ya da eşleşme kelimesiyle bulunur (`resolveCounterparty`). Bulunamazsa öneri
  // YİNE kurulur: ad kartta yazılı kalır, kimlik boş ve seçimi operatör yapar — fiş fotoğrafındaki
  // "TotalEnergies" sözlükte yoksa bu bir hata değil, sözlüğe eklenecek yeni bir caridir. Tedarikçi bu
  // tipte YOK (payload künyesi): mal bedelinin ödemesi tedarikçinin belgesine bağlanır (12.26).
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
  const queued = await queue('money_movement', payload, summary, args.reason);
  return {
    ...queued,
    ...(nature ? { nature: nature.label } : {}),
    ...(counterpartyText && !counterparty ? { counterpartyNote: counterpartyNoteOf(counterpartyText) } : {}),
  };
}

/** Bulunamayan carinin notu — ad kartta kalır; para hareketi ve belge önerisinin (22.44) ortak cümlesi. */
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
 * FATURADAN TEDARİK SİPARİŞİ (22.44 · kullanıcı kararı 14.09) — tedarikçi faturayı mal gelmeden kesti.
 *
 * Tipik vaka e-postayla önden gelen fatura: mal yolda, SKT ve lot henüz görülmedi. Mal kabul önerisi burada
 * YANLIŞ araçtır — SKT'siz kalem kabule giremez ve uydurulamaz. Sipariş onayda GÖNDERİLMİŞ açılır
 * (`sendPurchaseOrder`; tedarikçiye mesaj gitmez), fatura siparişe bağlı bir belge olarak doğar ve tedarikçi
 * borcu o belgeden türer; mal gelince rampa bu siparişi sayar, SKT ve lotu orada girer.
 *
 * Kalemler mal kabulle AYNI yoldan çözülür (`resolveInvoiceLines`): tedarikçinin adıyla eşlemeden; eşleme
 * yoksa modelin katalogda bulduğu varyant eşleme önerisi olur. Tedarikçi ZORUNLU — faturanın sahibi o. Aynı
 * numaralı fatura aynı tedarikçiye ikinci kez yazılmaz.
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
  const queued = await queue('purchase_order', payload, summary, args.reason);

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
 * BELGE ÖNERİSİ — mal dışı fatura ya da fiş (22.44 · kullanıcı kararı 14.09): kira, muhasebeci, sigorta,
 * telefon, akaryakıt fişi. Borç ŞİMDİ doğar; ödemesi sonra hareket olarak gelir ve belgeye bağlanır.
 *
 * Asistan belgeyi okur, araç okunanı DOĞRULAR: karşı taraf nokta atışı (tedarikçi faturadaki kimlikle, cari
 * tam ad ya da kelimeyle), tür sözlükten, rejim KDV'yle çelişmez, aynı numara aynı tarafa ikinci kez
 * yazılmaz. Mal faturası bu yoldan GİRMEZ: mal geldiyse mal kabul, gelmediyse faturadan sipariş — ikisi de
 * belgeyi stok bağıyla doğurur ve borç o bağla doğru okunur. Dosya MCP'den geçmez; yönetici onay ekranında
 * bırakır.
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

  // ── KARŞI TARAF: TEDARİKÇİ YA DA CARİ, İKİSİ BİRDEN DEĞİL ─────────────────
  // Belge kapısının kuralı (`createMoneyDocument`): karşı taraf en çok bir tanedir. Tedarikçi faturadaki
  // kimlikle bulunur ve bulunamaması HATADIR; cari bulunamazsa ad kartta kalır — sözlüğe eklenecek yeni
  // bir caridir.
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
  const queued = await queue('money_document', payload, summary, args.reason);
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
 * TEDARİKÇİ ÖNERİSİ — faturanın başlığından yeni kart (22.44 · kullanıcı kararı 14.09).
 *
 * Tedarikçiler hiçbir araçtan listelenmez (22.42); yeni biri yalnız bu yoldan girer. Araç kayıtlı bir
 * tedarikçiye NOKTA ATIŞI gitmediğini doğrular: aynı vergi no, telefon ya da tam adla kayıt varsa RET ve
 * kaydın adı söylenir — pasif kayıt da sayılır, ikinci kart borcu ikiye bölerdi. Kapı onayda bir kez daha
 * sorar (`saveSupplierAction`).
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
  const queued = await queue('supplier_create', payload, `Yeni tedarikçi — ${name}${country ? ` (${country})` : ''}`, args.reason);
  return {
    ...queued,
    nextStep:
      'Yönetici kartı onaylayınca faturayı yeniden gönderin (propose_stock_intake · propose_purchase_order · propose_money_document) — tedarikçi o zaman vergi numarasıyla bulunur.',
  };
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
    // Açıklama da ÜÇ DİL (11.08): araç yalnız Türkçesini alıyordu ve paket formunun fr/de kutuları
    // hep boş açılıyordu. Paket müşteri yüzeyine çıkan bir kayıt — vitrini Fransa.
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

  // Müşteri metni ÜÇ DİLDE beklenir ama TEK DİL de kabul edilir: eksik dili operatör formda
  // tamamlar (çeviri düğmesi orada). **Hiç gelmezse öneri DOĞMAZ (26.08)** — etiketsiz indirim
  // veritabanınca reddediliyor (`discount_public_label_filled`), yani böyle bir öneri kuyruğa
  // düşse bile uygulanamazdı. Reddi buraya almak, operatörü uygulanamayacak bir öneriyi
  // incelemekten kurtarıyor; hata mesajı da ajanın neyi eksik bıraktığını söylüyor.
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
  return queue('discount_draft', payload, `${name}: ${value} indirim${where}`, args.reason);
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
    // Üçü de tarif formunun kutusu (11.08): sorulmadıkları için boş kalıyorlardı.
    duration: localizedArg(args.duration),
    meal: localizedArg(args.meal),
    // "Evinizden" de MADDE listesi (ekran her satırın başına • basar) — adımlarla aynı kırpma.
    pantry: linesArg(args.pantry),
    items,
  };

  const langs = ['tr', name.fr ? 'fr' : null, name.de ? 'de' : null].filter(Boolean);
  // Doldurulmayan kutular SAYILIR ve modele geri söylenir: tarif formunda karşılığı olan her alan
  // boş kalırsa operatörün elle dolduracağı bir kutuya dönüşür. Model neyi atladığını görmeden
  // düzeltemez — cevap "kuyruğa yazıldı" deyip susarsa eksik sessizce operatöre devrolur.
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

  const queued = await queue('recipe_draft', payload, `"${name.tr}" tarifi — ${items.length} malzeme`, args.reason);
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

/**
 * Pozitif tam sayı ya da `null` — ambalaj ölçülerinin savunmacı okuması.
 *
 * Sıfır ve negatif de `null`'a düşer: "0 mm" bir ölçü değil, ölçülmemişliğin yanlış yazılmış
 * hâlidir (`CLAUDE §1`). Ondalık da düşer — alan milimetre ve gram, ikisi de tam sayı.
 */
function pozitifTam(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

/** Porsiyon türü — kümenin dışındaki her şey `null` ("tek parça / dökme"). */
function porsiyonTuru(value: unknown): 'item' | 'slice' | null {
  return value === 'item' || value === 'slice' ? value : null;
}
