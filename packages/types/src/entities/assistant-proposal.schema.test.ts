import { describe, expect, it } from 'vitest';
import { ProductDraftPayloadSchema } from './assistant-proposal.schema';

/**
 * **Boş bir ürün beyanı teklifi kuyruğa giremez.**
 *
 * Bu öneri tipi ürünün alanlarını ÜZERİNE YAZAR (22.5) — yani onaylanan her teklif bir kaybı da
 * göze alır. Hiçbir alan taşımayan bir teklif onaylandığında ise ortada kazanç YOKTUR, yalnız
 * patronun bir kararı harcanmıştır: ekran "öneri var" der, açılır, içi boştur.
 */
describe('ProductDraftPayload — en az bir alan dolu', () => {
  const temel = {
    productId: '77777777-7777-4777-8777-777777777777',
    productName: 'Kayısı reçeli',
  };

  it('hiçbir alan doldurulmadıysa REDDEDİLİR', () => {
    expect(ProductDraftPayloadSchema.safeParse({ ...temel, fields: {} }).success).toBe(false);
  });

  it('tek alan yeter', () => {
    expect(ProductDraftPayloadSchema.safeParse({ ...temel, fields: { allergens: ['gluten'] } }).success).toBe(true);
  });

  /** `name` çok dilli ve kendi kuralını taşır — boş bir ad teklifi ALAN sayılmaz. */
  it('adı boş çok dilli metinle doldurmak geçmez', () => {
    expect(ProductDraftPayloadSchema.safeParse({ ...temel, fields: { name: { tr: '  ' } } }).success).toBe(false);
    expect(ProductDraftPayloadSchema.safeParse({ ...temel, fields: { name: { tr: 'Kayısı reçeli' } } }).success).toBe(true);
  });
});
