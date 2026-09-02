import { CartService } from '@lezzet/database';
import { an, euro, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

/*
  ── Sepet (07) ─────────────────────────────────────────────────────────────────────────────────
  Sepette stok AYRILMAZ ve sepetteki fiyat BAĞLAYICI DEĞİLDİR (DOMAIN §5): gösterimdir. Bayat sepet
  bilinçli konuyor — checkout'ta "fiyat değişti" bildirimi ancak eski fiyatlı bir sepetle denenir.

  ── NİÇİN AYRI DOSYA (kullanıcı kararı 01.09) ──────────────────────────────────────────────────
  Sepet eskiden `orders.ts`in başındaydı ve o dosya beslemenin sipariş kurgusunu taşıyordu. Sipariş
  beslemeden tamamen kalktı (künye `seed.ts` başlığında); sepet ise KALDI, çünkü sepet bir sipariş
  DEĞİL, siparişten önceki hâldir — müşteri yüzeyi onu siparişsiz de göstermek zorunda.
*/

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

  // BAYAT sepet: bir yıl önce eklenmiş, fiyatı artık yanlış. "Sepette bekleyen fiyat bağlayıcı
  // değildir" kararının (DOMAIN §5) görünür kanıtı.
  const bayat = kisiler.get('b2cKapaliKapida');
  if (bayat && satilabilir[2]) {
    await carts.addItem(bayat, { variantId: satilabilir[2].id, qty: 2, unitPrice: 3.2 });
    // Tarihi geriye almanın SERVİSTE karşılığı yok ve olmamalı: `updatedAt` her dokunuşta tazelenir
    // (sepet kurtarma zamanlaması ona bakar). Geriye almak yalnız seed'in derdi — o yüzden burada,
    // doğrudan. Sepetin anahtarı `customer_id`'dir (id yok), miras `update` bu tabloda çalışmaz.
    const { error } = await db.from('cart').update({ updated_at: an(-380) }).eq('customer_id', bayat);
    if (error) throw error;

    /**
     * ── KARMA SEPET: aynı sepette YEREL + KARGO (19.25) ───────────────────────────────────────
     *
     * Bu müşterinin öteki satırları yalnız STR'de duruyor, yani Bordeaux'lu bir yer için hepsi kargo
     * grubuna düşüyor — tek gruplu bir sepet, bölünmenin hiçbir şeyini göstermez. Burada eklenen
     * satır BDX deposunda BULUNAN bir varyant: sepet ikiye ayrılıyor ve o ana kadar hiç koşmamış
     * davranışlar birden görünür oluyor — iki grup başlığı, "kargolu ürünleri ayrıca sipariş ver"
     * ikinci siparişi, kargo eşiğinin KENDİ matrahından hesabı, "iki grup toplanmaz" cümlesi.
     *
     * **Varyant SORGUYLA seçiliyor, indisle değil:** stok bölümü BDX'e hangi varyantları koyduğunu
     * kendi kuralıyla belirliyor (`stock.ts`, her dördüncü + iki soğuk zincir) ve buraya sabit bir
     * indis yazmak, o kural değiştiği gün sessizce kargo grubuna düşen bir satır bırakırdı — sepet
     * yine tek gruplu olur, kimse fark etmezdi.
     *
     * **Bölünmeyi görmek için yerin 33000 olması gerekir** (çerez ya da Bordeaux adresi): grup kararı
     * müşterinin YERİNE bağlı, sepetin kendisine değil. Adres seed'de hazır (`delivery.ts`).
     *
     * *(01.09'a kadar bu depo COLMAR'dı; 60 km'lik bir "uzak depo" ikna edici olmadığı için
     * Bordeaux'ya taşındı — kullanıcı kararı, künye `seed/warehouse.ts` başında.)*
     */
    const { data: bdxDepo } = await db.from('warehouse').select('id').eq('code', 'BDX').limit(1);
    const bdxId = ((bdxDepo ?? [])[0] as { id: string } | undefined)?.id;
    if (bdxId) {
      const { data: bdxStok } = await db
        .from('stock')
        .select('variant_id')
        .eq('warehouse_id', bdxId)
        .gt('physical_qty', 0)
        .limit(1);
      const yerelVaryant = ((bdxStok ?? [])[0] as { variant_id: string } | undefined)?.variant_id;
      if (yerelVaryant) await carts.addItem(bayat, { variantId: yerelVaryant, qty: 1, unitPrice: euro(6.5) });
      else console.log('  ⚠ BDX stoğu yok — karma sepet hâli bu koşuda doğmayacak (19.25)');
    }
  }
  console.log('✓ sepet: 3 sepet (normal · toptan · BAYAT+KARMA) + partiye çıpalı teklif satırı');
}
