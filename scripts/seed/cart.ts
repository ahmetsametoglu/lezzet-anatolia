import { CartService } from '@lezzet/database';
import { an, euro, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

// ── Sepet (07) ───────────────────────────────────────────────────────────────────────────────────
// Sepette stok ayrılmaz ve sepetteki fiyat bağlayıcı değildir (DOMAIN §5); bayat sepet bilerek konur, çünkü checkout'ta "fiyat değişti"
// bildirimi ancak eski fiyatlı bir sepetle denenir.

export async function seedCarts(db: Db, kisiler: Kisiler, varyantlar: VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'cart')) {
    console.log('▸ sepetler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEPET seed');
  const carts = new CartService(db);
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const { data } = await db.from('stock').select('id,variant_id').not('offer_price', 'is', null).limit(1);
  const teklif = (data ?? [])[0] as { id: string; variant_id: string } | undefined;

  const b2c = kisiler.get('b2cSadik');
  if (b2c) {
    for (const [i, v] of satilabilir.slice(0, 3).entries()) {
      await carts.addItem(b2c, { variantId: v.id, qty: 1 + i, unitPrice: euro(8 + i * 2) });
    }
    // Partiye çıpalı teklif satırı: indirim PARTİYE aittir, parti tükenirse kalem normal fiyata döner.
    if (teklif) await carts.addItem(b2c, { variantId: teklif.variant_id, qty: 2, unitPrice: 4.9, stockId: teklif.id });
  }

  const b2b = kisiler.get('b2bOnayli');
  if (b2b) {
    // Toptan sepeti: çok kalem, yüksek adet — asgari sepet ve kargo eşiği burada anlam kazanır.
    for (const [i, v] of satilabilir.slice(4, 12).entries()) {
      await carts.addItem(b2b, { variantId: v.id, qty: 6 + i * 2, unitPrice: euro(5.4 + i * 0.8) });
    }
  }

  // Bayat sepet: bir yıl önce eklenmiş ve fiyatı artık yanlış.
  const bayat = kisiler.get('b2cKapaliKapida');
  if (bayat && satilabilir[2]) {
    await carts.addItem(bayat, { variantId: satilabilir[2].id, qty: 2, unitPrice: 3.2 });
    // Tarihi geriye almanın serviste karşılığı yoktur, çünkü `updatedAt` her dokunuşta tazelenir; sepetin anahtarı `customer_id` olduğu
    // için miras `update` bu tabloda çalışmaz, ham yazım yalnız beslemenin işidir.
    const { error } = await db.from('cart').update({ updated_at: an(-380) }).eq('customer_id', bayat);
    if (error) throw error;
  }
  console.log('✓ sepet: 3 sepet (normal · toptan · BAYAT) + partiye çıpalı teklif satırı');
}
