import { describe, expect, it } from 'vitest';
import { appToDb, camelToSnake, dbToApp } from './case-transformers';

/**
 * Dönüştürücünün kanıtı — **veri katmanının en çok kullanılan parçası ve 15.08'e kadar hiç testi
 * yoktu.** `02.5` görev satırı haftalardır *"dönüştürücü birim testleri (jsonb alanı bozulmuyor)
 * geçiyor"* diyordu; ölçünce böyle bir dosya olmadığı çıktı — vaat edilmiş ama teslim edilmemiş bir
 * kanıt (`CLAUDE.md §5`).
 *
 * **Bu dosya DB'siz** ve birim projesinde koşar (`vitest.config` → `PAKET_DBSIZ`): kaynak modül
 * hiçbir şey import etmiyor, yani her şerit kendi değişikliğini saniyede sınayabilir.
 *
 * Çivilenen kural tek cümlede: **kolon adı şemanın sözlüğüdür, jsonb anahtarı uygulamanın yazdığı
 * veridir.** Adı çevirmek bir adlandırma köprüsüdür; veriyi çevirmek başka bir iştir.
 */

describe('satır düzeyi dönüşüm', () => {
  it('kolon adlarını iki yönde de çevirir', () => {
    expect(dbToApp({ unit_price_cents: 1290, created_at: 'x' })).toEqual({ unitPriceCents: 1290, createdAt: 'x' });
    expect(appToDb({ unitPriceCents: 1290, createdAt: 'x' })).toEqual({ unit_price_cents: 1290, created_at: 'x' });
  });

  it('skaler değerlere ve null/undefined\'a dokunmaz', () => {
    expect(dbToApp({ a_b: null, c_d: undefined, e_f: 0, g_h: false })).toEqual({ aB: null, cD: undefined, eF: 0, gH: false });
  });

  it('satır DİZİSİNİ de çevirir — okuma çok satır döndürebilir', () => {
    expect(dbToApp([{ a_b: 1 }, { a_b: 2 }])).toEqual([{ aB: 1 }, { aB: 2 }]);
  });
});

describe('jsonb değeri KORUNUR', () => {
  /**
   * Asıl iddia: `payload` bir kolon ADIdır (çevrilir), içindekiler VERİdir (çevrilmez).
   *
   * Eski davranışta `variant_id` okumada `variantId` oluyordu — yani uygulama bir şekil yazıp
   * başka bir şekil okuyordu. `assistant_proposal.payload` diskte ne Zod şemasına ne onu yazan MCP
   * aracının çıktısına benziyordu.
   */
  it('okurken jsonb içeriğine İNMEZ', () => {
    const satir = { proposal_id: 'p1', payload: { variant_id: 'v1', offer_price_cents: 183 } };
    expect(dbToApp(satir)).toEqual({ proposalId: 'p1', payload: { variant_id: 'v1', offer_price_cents: 183 } });
  });

  it('yazarken de İNMEZ — ne yazılırsa o saklanır', () => {
    const model = { proposalId: 'p1', payload: { variantId: 'v1', offerPriceCents: 183 } };
    expect(appToDb(model)).toEqual({ proposal_id: 'p1', payload: { variantId: 'v1', offerPriceCents: 183 } });
  });

  it('jsonb İÇİNDEKİ diziye ve iç içe nesneye de dokunmaz', () => {
    const satir = { id: 'x', items: [{ stock_id: 's1', added_at: 't' }], meta: { deep_one: { deep_two: 1 } } };
    expect(dbToApp(satir)).toEqual({
      id: 'x',
      items: [{ stock_id: 's1', added_at: 't' }],
      meta: { deep_one: { deep_two: 1 } },
    });
  });

  /**
   * **Yazma yolu HİÇBİR koşulda inmez** ve bu ayrı bir iddia: okuma yönünde gömülü ilişki diye bir
   * istisna var, yazma yönünde YOK — ilişki satırı yazılmaz. `embeds` benzeri bir parametre bile
   * almıyor, yani bu davranış çağıranın eline bırakılmış değil.
   */
  it('yazma yönünde gömme İSTİSNASI YOKTUR', () => {
    expect(appToDb({ items: [{ variantId: 'v1' }] })).toEqual({ items: [{ variantId: 'v1' }] });
  });

  /**
   * Dosyanın kendi künyesindeki rakam tuzağı (`rating_1_count` → `rating_1Count`, `rating1Count`
   * DEĞİL) kolon adlarında hâlâ geçerli ve düzeltilemez — ters yön `line1`i bozar. Ama payload'ın
   * İÇİNDE artık yapısal olarak imkânsız: tuzak kolon adları için taranmıştı, jsonb içeriği hiç
   * taranmamıştı ve oraya bir gün böyle bir anahtar girse hata şemada, sebebinden uzakta patlardı.
   */
  it('rakam tuzağı jsonb İÇİNDE artık doğmaz', () => {
    expect(dbToApp({ payload: { rating_1_count: 4, step_2: 'x' } })).toEqual({
      payload: { rating_1_count: 4, step_2: 'x' },
    });
    // Kolon adında tuzak SÜRÜYOR — kayıt olsun diye çivileniyor, davranış bilinçli.
    expect(dbToApp({ rating_1_count: 4 })).toEqual({ rating_1Count: 4 });
    expect(camelToSnake('line1')).toBe('line1');
  });
});

describe('gömülü ilişki — tek istisna', () => {
  /**
   * Gömülü ilişki (`alias:tablo(...)`) bir DEĞER değil **başka bir tablonun satırıdır**; alan
   * adlarının çevrilmesi gerekir. Beyan `BaseDbService.embeds` ile yapılır ve **çevrilmiş (app
   * tarafı) adla** karşılaştırılır — `order_item!inner(...)` için beyan `orderItem`.
   */
  it('beyan edilen gömme çevrilir, beyan edilmeyen jsonb çevrilmez', () => {
    const satir = {
      id: 'b1',
      items: [{ bundle_id: 'b1', variant_id: 'v1' }],
      meta: { free_form: 1 },
    };
    expect(dbToApp(satir, new Set(['items']))).toEqual({
      id: 'b1',
      items: [{ bundleId: 'b1', variantId: 'v1' }],
      meta: { free_form: 1 },
    });
  });

  /** İKİ KATLI gömme: `stock → variant → product`. Üst takma ad yeter, alt ağaç bütünüyle çevrilir. */
  it('gömülü alt ağaç TAMAMEN çevrilir — iki katlı gömme tek beyanla kapsanır', () => {
    const satir = { id: 's1', variant: { id: 'v1', product: { date_type: 'DDM', shelf_life_days: 30 } } };
    expect(dbToApp(satir, new Set(['variant']))).toEqual({
      id: 's1',
      variant: { id: 'v1', product: { dateType: 'DDM', shelfLifeDays: 30 } },
    });
  });

  /**
   * Beyan **çevrilmiş adla** yapılır: PostgREST anahtarı `order_item`, beyan `orderItem`.
   * `moneyFields` ile aynı düzen olsun diye — beyan eden kişi iki ad sistemi taşımasın.
   */
  it('beyan app tarafı adıyla eşleşir (order_item → orderItem)', () => {
    const satir = { id: 'x', order_item: { order_id: 'o1' } };
    expect(dbToApp(satir, new Set(['orderItem']))).toEqual({ id: 'x', orderItem: { orderId: 'o1' } });
    // Ham (DB) adla beyan edilirse EŞLEŞMEZ — kural tek yönlü ve testi burada.
    expect(dbToApp(satir, new Set(['order_item']))).toEqual({ id: 'x', orderItem: { order_id: 'o1' } });
  });

  /**
   * **Beyan unutulduğunda arıza SESSİZ DEĞİLDİR** — varsayılanın ters çevrilme gerekçesi bu.
   * Gömülü satır `snake_case` kalır ve onu okuyan şema alanı bulamaz, yani sorgu o anda patlar.
   * Bu tur birebir yaşandı (`ProductListingService` beyanı atlanmıştı, katalog okuması düştü).
   */
  it('beyan yoksa gömme HAM kalır — şema onu tanımaz ve sorgu patlar', () => {
    const satir = { id: 'x', variants: [{ product_id: 'p1' }] };
    expect(dbToApp(satir)).toEqual({ id: 'x', variants: [{ product_id: 'p1' }] });
  });
});
