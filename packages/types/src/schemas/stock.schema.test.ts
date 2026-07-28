import { describe, expect, it } from 'vitest';
import { StockBatchDetailSchema } from './stock.schema';

/**
 * Gömülü satırların TÜRETİLMİŞ olduğunu sabitler (CLAUDE.md §1).
 *
 * Gerçek olay: `StockBatchDetailSchema` içindeki `variant` bloğu elle yazılmıştı ve boy etiketini
 * `LocalizedTextSchema` (en az bir dil ZORUNLU) ile tanımlıyordu. Oysa varlık şeması bilerek gevşek:
 * tek boylu üründe varsayılan varyantın etiketi BOŞTUR (`{}`) — "1 kg" gibi bir boy adı yoktur.
 *
 * Sonuç: o ürünün ilk partisi girildiği an stok ekranı ZodError ile 500 veriyordu. Derleyici
 * yakalamadı (iki şema da geçerli), test yoktu, hata ancak veriyle ortaya çıktı. Bu test o veriyi
 * sabitler.
 */

const batch = (variantLabel: Record<string, string>) => ({
  id: '3f3f9a5e-6b8f-4b0e-9a1e-2d0e6b7c8a11',
  variant_id: '6d70f537-83b0-49fd-aef9-e05084e0d5b2',
  physical_qty: 20,
  initial_qty: 20,
  expiry_date: '2026-08-22',
  lot_number: 'AF-20260725-0',
  purchase_price: '2.90',
  intake_id: null,
  offer_price: null,
  location: 'Soğuk oda',
  created_at: '2026-07-28T15:31:30.445047+00:00',
  variant: {
    id: '6d70f537-83b0-49fd-aef9-e05084e0d5b2',
    label: variantLabel,
    product: {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      name: { tr: 'Fıstıklı Baklava' },
      category_id: null,
      date_type: 'DLC',
      shelf_life_days: 30,
      vat_rate: '5.50',
    },
  },
});

describe('parti ayrıntısı — gömülü boy etiketi', () => {
  it('BOŞ etiketli boy geçerlidir — tek boylu üründe boy adı yoktur', () => {
    const parsed = StockBatchDetailSchema.parse(toApp(batch({})));
    expect(parsed.variant.label).toEqual({});
  });

  it('dolu etiket de geçerlidir', () => {
    const parsed = StockBatchDetailSchema.parse(toApp(batch({ tr: '1 kg' })));
    expect(parsed.variant.label).toEqual({ tr: '1 kg' });
  });

  it('sayısal alanlar metin gelse de sayıya çevrilir (numeric → number)', () => {
    const parsed = StockBatchDetailSchema.parse(toApp(batch({})));
    expect(parsed.purchasePrice).toBe(2.9);
    expect(parsed.variant.product.vatRate).toBe(5.5);
  });
});

/** DB satırı snake_case gelir; servis katmanı camelCase'e çevirir — test o çevrimi taklit eder. */
function toApp(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value !== null && typeof value === 'object' && !Array.isArray(value) ? toApp(value as Record<string, unknown>) : value;
  }
  return out;
}
