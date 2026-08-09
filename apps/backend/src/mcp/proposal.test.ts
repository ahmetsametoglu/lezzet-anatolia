import { AssistantProposalService, CategoryService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { APPLIERS, KIND_META, amountCentsOf, applyProposal, impactOf, modeOf } from '@lezzet/application';
import {
  AssistantProposalKindEnum,
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
    // Ve cümle gerçekten eksikleri SAYAR (sabit metin değil).
    expect(impactOf('product_create', payload)).toMatch(/besin künyesi/);
  });

  /**
   * Kararın CİNSİ künyeden okunur (22.5). Ekran kendi tablosunu kurarsa iki gerçek doğar ve biri
   * bir gün ötekinden ayrılır — geri alınamaz bir öneri "tek tık uygula" kapısına düşer.
   */
  it('geri alınamaz DÖRT tip DEVREDİLİR, taslak doğuran tipler KÖPRÜ verir', () => {
    // `batch_offer` de burada: fiyatın üç yüzü (tutar · indirim · marj) yalnız teklif diyaloğunda
    // birlikte görünür; kuyrukta tek sayı onaylamak marjı görmeden fiyat onaylamaktır.
    for (const kind of ['zone_extend', 'stock_intake', 'money_movement', 'batch_offer'] as const) {
      expect(modeOf(kind)).toBe('handoff');
    }
    for (const kind of ['bundle_draft', 'discount_draft', 'recipe_draft', 'product_draft', 'purchase_order'] as const) {
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
