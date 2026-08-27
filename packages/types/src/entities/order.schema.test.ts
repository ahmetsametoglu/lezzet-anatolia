import { describe, expect, it } from 'vitest';
import { OrderInsertSchema, OrderUpdateSchema } from './order.schema';

/**
 * Siparişin DEĞİŞMEZ alanı: kanal (27.08, `03.12`).
 *
 * Kanal sipariş açılırken müşteri tipinden bir kez türetilir (`deriveChannel`) ve donar. Kural
 * motorda yazılıydı (`canChangeChannel`, hep `false`) ama 27.08'e kadar onu ne soran ne zorlayan
 * vardı — şema tam `partial()` olduğu için kanal sonradan yazılabilir bir alandı.
 *
 * **Neden önemli:** kanal `vat_treatment`ı ve fiyat kademesini belirliyor. Kapanmış bir siparişin
 * kanalını oynatmak, parası alınmış bir belgenin vergisini geriye dönük değiştirmek demektir.
 *
 * **Bu testin sınırı, açıkça:** asıl reddi TİP SİSTEMİ verir — `OrderUpdate` artık `channel`
 * taşımıyor, yani yazmaya çalışan kod derlenmez. Çalışma anında zod fazla alanı **sessizce
 * DÜŞÜRÜR** (varsayılan `strip`), reddetmez; aşağıdaki iddia da onu — "yazılmaz"ı — çiviliyor,
 * "patlar"ı değil. Şemayı hiç görmeyen yol (doğrudan SQL, besleme betiği, elle müdahale) için
 * ikinci savunma veritabanındadır: `order_channel_frozen` tetikleyicisi (`0012_order.sql`).
 */
describe('OrderUpdateSchema — kanal DONAR', () => {
  const ORDER_ID = '00000000-0000-0000-0000-000000000001';

  it('kanal güncelleme çıktısında YER ALMAZ — yani yazılmaz', () => {
    const cikti = OrderUpdateSchema.parse({ id: ORDER_ID, channel: 'b2b' });
    expect(cikti).not.toHaveProperty('channel');
    expect(cikti).toEqual({ id: ORDER_ID });
  });

  it('kanalı değiştirmeye çalışmak öteki alanları BOZMAZ', () => {
    // Aynı çağrıda geçerli bir alan da varsa o yazılmalı: koruma bir kalkan, kesici değil.
    const cikti = OrderUpdateSchema.parse({ id: ORDER_ID, channel: 'b2b', paymentStatus: 'paid' });
    expect(cikti).toMatchObject({ id: ORDER_ID, paymentStatus: 'paid' });
    expect(cikti).not.toHaveProperty('channel');
  });

  it('AÇILIŞTA kanal hâlâ zorunlu — donmak "hiç yazılmaz" demek değil', () => {
    // Değişmezliğin anlamı budur: bir kez yazılır, sonra sabit. Insert'ten de düşseydi kanal
    // hiç doğmazdı ve türetim (`deriveChannel`) sonuçsuz kalırdı.
    expect(OrderInsertSchema.safeParse({ customerId: ORDER_ID, warehouseId: ORDER_ID }).success).toBe(false);
    expect('channel' in OrderInsertSchema.shape).toBe(true);
  });
});
