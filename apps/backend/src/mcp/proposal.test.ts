import { AssistantProposalService, CategoryService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { APPLIERS, KIND_META, amountCentsOf, applyProposal, impactOf, modeOf } from '@lezzet/application';
import {
  AssistantProposalKindEnum,
  DECLARATION_GAP_LABELS,
  PROPOSAL_PAYLOAD_SCHEMAS,
  parseProposalPayload,
  resolveLocalizedText,
  type FeaturedFlagPayload,
} from '@lezzet/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HANDLERS, TOOLS } from './server-factory';

/**
 * Onay kuyruğunun GÜVENCELERİ (22.3) — kurgunun kalbi burada kilitleniyor.
 *
 * Sınanan şey davranış değil **söz**: "asistan onaysız hiçbir şey yazamaz", "bir öneri iki kez
 * uygulanamaz", "uygulama normal servis yolundan geçer", "şeması olan her tipin uygulayıcısı var".
 * Bunların biri gevşerse kuyruk bir güvenlik katmanı olmaktan çıkıp bir formaliteye döner.
 */

const db = serviceDb();
const proposals = new AssistantProposalService(db);
const stamp = Date.now();
const created: string[] = [];
let categoryId: string;

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Kuyruk testi ${stamp}` } });
  categoryId = category.id;
});

afterAll(async () => {
  await purgeTestData(db, { assistantProposalIds: created, categoryIds: [categoryId] });
});

/** Damgalı öneri — küresel sayıya bakmadan kendi satırlarımızı izleyebilmek için. */
async function queueFeatured(isFeatured: boolean) {
  const payload: FeaturedFlagPayload = { target: 'category', id: categoryId, isFeatured, name: `Kuyruk testi ${stamp}` };
  const row = await proposals.create({
    kind: 'featured_flag',
    payload,
    summary: `Kuyruk testi ${stamp} ${isFeatured ? 'vitrine' : 'vitrinden'} (${stamp})`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    sourceSession: `test-${stamp}`,
  });
  created.push(row.id);
  return row;
}

describe('kuyruk bütünlüğü', () => {
  it('öneri BEKLEYEN doğar ve hiçbir şeyi değiştirmez', async () => {
    const before = await new CategoryService(db).getById(categoryId);
    const proposal = await queueFeatured(true);

    expect(proposal.status).toBe('pending');
    expect(proposal.appliedAt).toBeNull();
    // Asıl iddia: öneri YAZMAK bir şey UYGULAMAK değildir.
    const after = await new CategoryService(db).getById(categoryId);
    expect(after?.isFeatured).toBe(before?.isFeatured);
  });

  it('aynı öneri İKİ KEZ karara bağlanamaz (yarış veritabanında çözülür)', async () => {
    const proposal = await queueFeatured(true);

    const first = await proposals.decide(proposal.id, { status: 'rejected', decidedBy: null as unknown as string, note: 'test' });
    const second = await proposals.decide(proposal.id, { status: 'rejected', decidedBy: null as unknown as string, note: 'ikinci' });

    expect(first?.status).toBe('rejected');
    // İkinci çağrı hata değil `null` döner: "bu satıra zaten karar verilmiş".
    expect(second).toBeNull();
  });

  it('süresi geçmiş öneri kuyrukta GÖRÜNMEZ ve süpürücü onu expired yapar', async () => {
    const row = await proposals.create({
      kind: 'featured_flag',
      payload: { target: 'category', id: categoryId, isFeatured: true, name: `Bayat ${stamp}` },
      summary: `Bayat öneri ${stamp}`,
      // Şemada `expires_at > created_at` kısıtı var; bir saniyelik ömür veriyoruz ve bekliyoruz.
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      sourceSession: `test-${stamp}`,
    });
    created.push(row.id);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const pending = await proposals.listPending(100);
    expect(pending.some((p) => p.id === row.id)).toBe(false);

    await proposals.expireOverdue();
    const after = await proposals.getById(row.id);
    expect(after?.status).toBe('expired');
  });
});

describe('uygulama — normal servis yolundan', () => {
  /**
   * Sıra ŞEMANIN dayattığı sıradır (`assistant_proposal_decided_status`): önce kilitle
   * (`claimForApply` — satırı kuyruktan çıkarır ve kararı damgalar), sonra uygula, sonra
   * sonucu yaz. Bu testin ilk hâli kilidi atlıyordu ve kısıt onu reddetti — yani "iki kez
   * uygulanamaz" güvencesi yalnız uygulamada değil, veride duruyor.
   */
  it('onaylanan öneri GERÇEKTEN uygulanır ve doğan kayıt satıra yazılır', async () => {
    const proposal = await queueFeatured(true);

    const claimed = await proposals.claimForApply(proposal.id, null as unknown as string);
    expect(claimed).not.toBeNull();
    const result = await applyProposal(db, claimed!);
    const applied = await proposals.markApplied(proposal.id, result);

    expect(result.categoryId).toBe(categoryId);
    expect(applied.status).toBe('applied');
    expect(applied.appliedAt).not.toBeNull();
    // Uygulama SERVİS kapısından geçti: kategori gerçekten vitrine çıktı.
    const category = await new CategoryService(db).getById(categoryId);
    expect(category?.isFeatured).toBe(true);
    expect(resolveLocalizedText(category!.name, 'tr')).toContain(String(stamp));
  });

  it('uygulama düşerse sebep satırda KALIR (sessiz başarısızlık yok)', async () => {
    const proposal = await queueFeatured(true);
    await proposals.claimForApply(proposal.id, null as unknown as string);
    const failed = await proposals.markFailed(proposal.id, 'test: motor reddetti');

    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('motor reddetti');
  });
});

describe('ekran kapısının türetmeleri (panel bunları hesaplamaz)', () => {
  it('tutar tipe göre payload’dan türer; tutar kavramı olmayan tipte null', () => {
    // Paket EURO tutuyor → cent'e çevrilir.
    expect(amountCentsOf('bundle_draft', { totalPrice: 89 })).toBe(8900);
    expect(amountCentsOf('money_movement', { amountCents: 34000 })).toBe(34000);
    // Mal kabulde toplam KALEMLERDEN; bir kalemin maliyeti bilinmiyorsa toplam UYDURULMAZ.
    expect(amountCentsOf('stock_intake', { lines: [{ qty: 2, unitCostCents: 500 }] })).toBe(1000);
    expect(amountCentsOf('stock_intake', { lines: [{ qty: 2, unitCostCents: null }] })).toBeNull();
    expect(amountCentsOf('featured_flag', { name: 'x' })).toBeNull();
  });

  it('her kind’ın ekran künyesi var ve hedef tablolar GERÇEK şema adları', () => {
    for (const kind of AssistantProposalKindEnum.options) {
      const meta = KIND_META[kind];
      expect(meta.label.length).toBeGreaterThan(2);
      expect(meta.impact.length).toBeGreaterThan(20);
      expect(meta.tables.length).toBeGreaterThan(0);
    }
    // Tasarımın fikstüründeki kurgusal adlar sızmamalı (sözleşme §2b).
    const allTables = AssistantProposalKindEnum.options.flatMap((k) => KIND_META[k].tables);
    for (const fake of ['packages', 'package_items', 'cash_entries', 'product_translations', 'stock_batches']) {
      expect(allTables).not.toContain(fake);
    }
  });

  it('bölge önerisinin etki cümlesi geri alınamazlığı SÖYLER', () => {
    expect(KIND_META.zone_extend.impact).toMatch(/GERİ ALINAMAZ/);
  });

  /**
   * Payload jsonb'ye yazılırken anahtar biçimi dönüşüyor (`appToDb`). Dönüş yolunda geri
   * çevrilmezse `remainingGaps` okunamaz ve **tamlık cümlesi sessizce yanlış olur**: eksik
   * beyanlı bir ürün "onaylarsan tam olur" diye görünür. Sessiz olduğu için de fark edilmez —
   * o yüzden gidiş-dönüş burada kilitleniyor (22.6).
   */
  it('payload GİDİŞ-DÖNÜŞÜ alan adlarını korur — tamlık cümlesi gerçek veriden kurulur', async () => {
    const row = await proposals.create({
      kind: 'product_create',
      payload: {
        name: { tr: `Kuyruk ürünü ${stamp}` },
        categoryId: null,
        categoryName: null,
        dateType: 'DDM',
        shelfLifeDays: null,
        vatRate: 5.5,
        variants: [{ label: { tr: '500 g' } }],
        ingredients: { tr: 'un, yumurta' },
        allergens: ['gluten'],
        uncertainFields: ['nutrition'],
        remainingGaps: ['lang', 'nutrition', 'storage'],
      },
      summary: `Yeni ürün: "Kuyruk ürünü ${stamp}" (500 g)`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      sourceSession: `test-${stamp}`,
    });
    created.push(row.id);

    const [read] = (await proposals.listPending(50)).filter((r) => r.id === row.id);
    const payload = read?.payload as Record<string, unknown>;
    expect(payload.remainingGaps).toEqual(['lang', 'nutrition', 'storage']);
    expect(payload.uncertainFields).toEqual(['nutrition']);
    // Şema kapısı da aynı şekli kabul etmeli — okunan payload yeniden doğrulanabilir olmalı.
    expect(() => parseProposalPayload('product_create', payload)).not.toThrow();
    // Ve cümle gerçekten eksikleri SAYAR (sabit metin değil). Beklenen metin ŞEMANIN sözlüğünden
    // okunuyor, buraya elle yazılmıyor: ilk hâli "besin künyesi" diye sabitti ve sözlük tek kaynağa
    // bağlanınca kırıldı — iki sözlük "birebir aynı" sanılıyordu, `nutrition` karşılığı farklıymış.
    expect(impactOf('product_create', payload)).toContain(DECLARATION_GAP_LABELS.nutrition);
  });

  /**
   * Kararın CİNSİ künyeden okunur (22.5). Ekran kendi tablosunu kurarsa iki gerçek doğar ve biri
   * bir gün ötekinden ayrılır — geri alınamaz bir öneri "tek tık uygula" kapısına düşer.
   */
  it('geri alınamaz tipler DEVREDİLİR, kendi formu kuyruğa gelenler İÇERİDE karar alır', () => {
    // Geri alınamaz üçlü: bildirim gider, stok/defter yazılır. Kararın konusu formda değil ekranda
    // (harita, mal kabul akışı, defter satırı) — kuyruk bunları uygulamaz, ön doldurup devreder.
    // `money_movement` 12.08'de bu kümeden ÇIKTI (22.11): finans ekranının elle hareket formu ortak
    // alana ayrılıp kuyruğa taşındı. Devrin gerekçesi ("defter silinemez, karar öncesi düzenleme
    // şart") kalkmadı — düzenleme hâlâ karardan önce, yalnız formun yeri değişti.
    for (const kind of ['zone_extend', 'stock_intake'] as const) {
      expect(modeOf(kind)).toBe('handoff');
    }
    // `inline` = gövdesi kuyruğun içinde çizilen tipler. Üçü de bir tur devredilmişti; formları
    // kuyruğa taşındıkça devir kalktı (`kind-meta` künyeleri). Yazan kapı yine varlığın kendi
    // eylemi, o yüzden `resultKey` burada da şart.
    //
    // `product_draft` 11.08'de bu kümeye geçti: ürün ekranının kendi formu 22.14'te kuyruğa taşındı
    // ama künye `draft_then_edit` kalmıştı ve alt bar olmayan bir kısıtı anlatıyordu ("kayıt pasif
    // doğar, yayına alma kendi ekranının işi") — kullanıcı bunu ekranda gördü.
    // `bundle_draft` 12.08'de bu kümeye geçti (22.11): paket formu ortak alana ayrılıp kuyruğa
    // taşındı. Etki cümlesi de düzeltildi — paket artık PASİF DOĞMUYOR, durum seçicisi formda.
    for (const kind of [
      'batch_offer',
      'discount_draft',
      'product_draft',
      'product_create',
      'bundle_draft',
      'recipe_draft',
      'money_movement',
    ] as const) {
      expect(modeOf(kind)).toBe('inline');
      expect(KIND_META[kind].resultKey).toBeTruthy();
    }
    // `product_create` gövdeye taşındı ama ADAY doğurmaya devam ediyor: satış durumu seçicisi
    // kuyrukta yok. Etki cümlesinin o kısmı bu yüzden korunuyor — mod değişti, kısıt değişmedi.
    expect(KIND_META.product_create.impact).toContain('ADAY');
    // Paketin kısıtı ise KALKTI: cümle artık "pasif doğar" demiyor, çünkü öyle olmuyor.
    expect(KIND_META.bundle_draft.impact).not.toContain('PASİF');
    // Geriye TEK devir-sonrası-düzenleme tipi kaldı: tedarik. Formu var ama RHF'siz (durumu elle
    // taşıyor), yani kuyruğa taşınması önce o formun standarda gelmesini istiyor.
    for (const kind of ['purchase_order'] as const) {
      expect(modeOf(kind)).toBe('draft_then_edit');
      // Köprü ancak doğan kaydın kimliğiyle kurulabilir; anahtar uygulayıcının döndürdüğü adla aynı olmalı.
      expect(KIND_META[kind].resultKey).toBeTruthy();
    }
    expect(modeOf('featured_flag')).toBe('apply');
  });
});

describe('kayıt eşliği — yazıp uygulayamama hâli olamaz', () => {
  it('payload şeması olan her tipin bir UYGULAYICISI var (ve tersi)', () => {
    expect(Object.keys(APPLIERS).sort()).toEqual(Object.keys(PROPOSAL_PAYLOAD_SCHEMAS).sort());
  });

  it('her propose_* aracının kuyruk tipiyle karşılığı var', () => {
    const proposeTools = TOOLS.filter((t) => t.name.startsWith('propose_')).map((t) => t.name);
    expect(proposeTools.length).toBeGreaterThan(0);
    for (const name of proposeTools) expect(HANDLERS[name]).toBeTypeOf('function');
  });

  it('ONAY ARACI YOKTUR — asistan kendi önerisini uygulayamaz', () => {
    const forbidden = TOOLS.filter((t) => /approve|apply|decide|confirm_proposal/i.test(t.name));
    expect(forbidden).toEqual([]);
  });
});

/**
 * ─── ALAN DENKLİĞİ: DİLEKÇEDE OLAN HER ALAN MODELE SORULMUŞ MU (11.08) ───────
 *
 * ── NEDEN BU TEST VAR ───────────────────────────────────────────────────────
 * Aynı arıza üç kez yaşandı ve üçünde de sessizdi: payload bir alan taşıyor, kart onu gösteriyor,
 * uygulama onu yazıyor — ama MCP aracının girdi şemasında o alan HİÇ TANIMLI DEĞİL. Model alanın
 * varlığından habersiz olduğu için hiç doldurmuyor; onay ekranında boş bir kutu görünüyor ve boş
 * kutu **"asistan atladı" diye okunuyor**, oysa gerçek "asistana sorulmadı"ydı.
 *
 * En pahalısı `money_movement` idi: `counterAccountId` işleyicide okunuyordu, araç girdisinde yoktu
 * — yani transfer önerisi kurulabiliyor ama paranın nereye gittiği hep boş kalıyordu.
 *
 * ── NEDEN OTOMATİK DEĞİL, BEYANLI ───────────────────────────────────────────
 * "Her payload alanının araçta karşılığı olsun" diye kör bir kural yazılamaz: alanların bir kısmı
 * MODELDEN GELMEZ, araç onları veritabanından çözer (`warehouseCode` → `warehouseId`) ya da motor
 * hesaplar (`lines`, `allocatedUnitPrice`). Bu yüzden karşılığı olmayan her alan aşağıda GEREKÇESİYLE
 * yazılı. Yeni bir alan eklendiğinde iki yoldan biri şart olur: ya araca da eklenir, ya buraya
 * gerekçesi yazılır. Sessiz üçüncü yol kapalı — testi kırmadan alan eklenemez.
 */
describe('alan denkliği — dilekçedeki her alan ya modelden gelir ya gerekçelidir', () => {
  /** Payload'da olup araç girdisinde KARŞILIĞI OLMAYAN alanlar; değer = neden sorulmadığı. */
  const DERIVED: Record<string, Record<string, string>> = {
    batch_offer: {
      variantId: 'batchId üzerinden partiden çözülür',
      productName: 'katalogdan okunur',
      warehouseCode: 'partinin deposu',
      expiryDate: 'partinin kendi tarihi',
      listPriceCents: 'fiyat tablosundan',
      physicalQty: 'stoktan',
    },
    featured_flag: { id: 'name ile bulunur', currentlyFeaturedCount: 'vitrin sayımı — araç hesaplar' },
    purchase_order: {
      warehouseId: 'warehouseCode ile bulunur',
      supplierId: 'supplierName ile bulunur',
      supplierName: 'tedarikçi kaydından — araç adı doğrulayıp yazar',
      lines: 'ADETLER MOTORDAN — eşik altı eksiği hesaplanır, model veremez',
    },
    bundle_draft: { items: 'kalem listesi araçta var; payların dağıtımı motorda' },
    stock_intake: {
      warehouseId: 'warehouseCode ile bulunur',
      supplierId: 'supplierName ile bulunur',
      supplierName: 'tedarikçi kaydından — araç adı doğrulayıp yazar',
      purchaseOrderId: 'purchaseOrderRef ile bulunur; tek açık sipariş varsa kendiliğinden bağlanır',
    },
    money_movement: {
      accountId: 'accountName ile bulunur',
      counterAccountId: 'counterAccountName ile bulunur',
      supplierId: 'supplierName ile bulunur',
    },
    zone_extend: { zoneId: 'zoneName ile bulunur' },
    product_create: {
      categoryId: 'categoryName ile bulunur',
      remainingGaps: 'tamlık ölçütü MOTORDAN (missingDeclarations)',
    },
    product_draft: {
      productName: 'ürün kaydından okunur',
      fields: 'araçta düz alanlar olarak sorulur (name · description · ingredients · …)',
      currentFields: 'ALANLARIN BUGÜNKÜ HÂLİ — veritabanından, üzerine yazılanı göstermek için',
      remainingGaps: 'tamlık ölçütü MOTORDAN',
    },
    discount_draft: { categoryId: 'scopeName ile bulunur', collectionId: 'scopeName ile bulunur' },
    recipe_draft: { items: 'kalem listesi araçta var; ad ve boy katalogdan yazılır' },
  };

  for (const kind of Object.keys(PROPOSAL_PAYLOAD_SCHEMAS)) {
    it(`${kind}: modele sorulmayan her alanın gerekçesi var`, () => {
      const schema = PROPOSAL_PAYLOAD_SCHEMAS[kind as keyof typeof PROPOSAL_PAYLOAD_SCHEMAS];
      const payloadFields = Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape);

      const tool = TOOLS.find((t) => t.name === `propose_${kind}`);
      expect(tool, `propose_${kind} aracı yok`).toBeTruthy();
      const toolFields = Object.keys((tool as { inputSchema: { properties: Record<string, unknown> } }).inputSchema.properties);

      const unexplained = payloadFields.filter((field) => !toolFields.includes(field) && !DERIVED[kind]?.[field]);
      // Kırıldıysa yapılacak iki şey var: alanı `propose_${kind}` girdisine ekleyin (model
      // doldurabilsin), ya da yukarıdaki DERIVED kaydına neden sorulmadığını yazın.
      expect(unexplained, `${kind}: bu alanlar dilekçede var ama modele sorulmuyor`).toEqual([]);
    });
  }
});

/**
 * ─── OKUMA YÖNÜ: MODELDEN İSTENEN KİMLİK ELDE EDİLEBİLİYOR MU (11.08) ────────
 *
 * ── ÜSTTEKİ TESTİN KÖR NOKTASI ──────────────────────────────────────────────
 * Yukarıdaki denklik yazma eksenini ölçüyor: dilekçedeki alan modele soruluyor mu. `featured_flag`
 * o testten TAM geçiyordu — ve altı tur boyunca **tek bir kez bile kullanılamadı**. Çünkü arıza
 * öteki uçtaydı: araç `id: uuid` istiyordu ve o kimliği veren hiçbir OKUMA aracı yoktu. Soru
 * soruluyordu, cevabı elde etmenin yolu yoktu.
 *
 * Aynı kopukluk ölçünce üç yerde daha çıktı (`supplierId` × 3, `purchaseOrderId`) ve ikisinin
 * bedeli sessizdi: tedarikçisiz mal kabul son alış fiyatını tazelemiyor, siparişsiz kabul siparişi
 * kapatmıyor. Hiçbir hata patlamıyor — sadece bir bağ hiç kurulmuyor.
 *
 * ── KURAL ───────────────────────────────────────────────────────────────────
 * Bir `propose_*` aracı MODELDEN uuid istiyorsa, o uuid'yi veren bir okuma aracı olmalı. Yoksa
 * alan ADLA sorulmalı ve kimliği sunucu çözmeli — projenin deseni bu. İstisna varsa aşağıya
 * gerekçesiyle yazılır.
 */
describe('okuma yönü — modelden istenen her kimliğin bir kaynağı var', () => {
  /** Okuma araçlarının modele VERDİĞİ kimlik alanları (araç adı → alan). */
  const READABLE_IDS: Record<string, string> = {
    batchId: 'stock_watch',
    variantId: 'stock_watch · catalog_lookup',
    productId: 'catalog_health · catalog_lookup',
  };

  /** Kimlik isteyen ama kaynağı OLMAYAN alanlar için gerekçe — boş olmalı, doluysa açık bir borç. */
  const ID_WITHOUT_SOURCE: Record<string, string> = {};

  const idFieldsOf = (tool: { inputSchema: { properties: Record<string, { description?: string }> } }) =>
    Object.entries(tool.inputSchema.properties)
      // Kimlik alanı: adı `Id`/`id` ile biten. `…Name`/`…Code`/`…Ref` alanları adla çözülen
      // kapılardır ve zaten aranan çözümün ta kendisi.
      .filter(([name]) => /(^id$|Id$)/.test(name))
      .map(([name]) => name);

  for (const tool of TOOLS.filter((t) => t.name.startsWith('propose_'))) {
    it(`${tool.name}: istediği kimliklerin kaynağı var`, () => {
      const orphans = idFieldsOf(tool as never).filter((field) => !READABLE_IDS[field] && !ID_WITHOUT_SOURCE[field]);
      // Kırıldıysa: ya alanı ADLA sorun (sunucu çözsün — `resolveSupplier` deseni), ya kimliği
      // veren okuma aracını `READABLE_IDS`e yazın, ya da gerçekten kaynaksız kalacaksa
      // `ID_WITHOUT_SOURCE`a gerekçesini bırakın. Sessiz dördüncü yol yok.
      expect(orphans, `${tool.name}: bu kimlikler modelden isteniyor ama hiçbir okuma aracı vermiyor`).toEqual([]);
    });
  }
});
