import { PriceService } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

// ── Fiyat (03/05) ────────────────────────────────────────────────────────────────────────────────
// Aynı tablo üç işi görür: kanal listesi · müşteriye özel fiyat · tarihli geçerlilik. Üçü de
// örneklenir, yoksa fiyat çözücünün "en özgül kazanır" kuralı hiç denenmez.
//
// TABAN FARKI (DOMAIN §5): b2c satırı KDV DAHİL (TTC), b2b satırı KDV HARİÇ (HT). Aynı ürünün iki
// satırı bu yüzden birbirine eşit değildir — b2b sayısının küçük görünmesi hata değil, tabandır.

export async function seedPrices(db: Db, varyantlar: VaryantRef[], kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'price')) {
    console.log('▸ fiyatlar zaten dolu — atlandı');
    return;
  }
  console.log('▸ FİYAT seed');
  const prices = new PriceService(db);
  let satir = 0;

  for (const [i, v] of varyantlar.entries()) {
    // Aday ürün satışta değildir; fiyatı da olmasın (fiyatsız aday = gerçekçi boş durum).
    if (v.status === 'candidate') continue;

    const b2cTtc = euro(6.5 + (i % 14) * 1.75);
    // Toptan: KDV'siz tabana in, üstüne toptan indirimi uygula.
    const b2bHt = euro((b2cTtc / (1 + v.vatRate / 100)) * 0.82);

    // Her 11'incisinde ESKİ bir liste bırakılır: fiyat geçmişi ve "hangi listeden çıktı" görünür.
    if (i % 11 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(b2cTtc * 0.92), validFrom: gun(-120) });
      satir += 1;
    }
    await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(b2cTtc), validFrom: gun(-30) });
    await prices.setPrice({ variantId: v.id, channel: 'b2b', amountCents: toCents(b2bHt), validFrom: gun(-30) });
    satir += 2;

    // Her 17'ncisinde İLERİ TARİHLİ zam: "zam önceden planlanır" kuralı denenebilsin.
    if (i % 17 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(b2cTtc * 1.08), validFrom: gun(30) });
      satir += 1;
    }
  }

  // Müşteriye ÖZEL fiyat — pazarlıkla anlaşılmış satırlar; kanal listesini ezer (en özgül kazanır).
  const ozelMusteri = kisiler.get('b2bOnayli');
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  if (ozelMusteri) {
    for (const v of satilabilir.slice(0, 6)) {
      const liste = euro(6.5 + (satilabilir.indexOf(v) % 14) * 1.75);
      await prices.setPrice({
        variantId: v.id,
        channel: 'b2b',
        customerId: ozelMusteri,
        amountCents: toCents((liste / (1 + v.vatRate / 100)) * 0.74), // listeden daha iyi
        validFrom: gun(-60),
      });
      satir += 1;
    }
  }
  console.log(`✓ fiyat: ${satir} satır (b2c TTC + b2b HT · geçmiş · ileri tarihli · müşteriye özel)`);
}

