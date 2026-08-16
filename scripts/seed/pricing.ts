import { PriceService } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

// ── Fiyat (03/05) ────────────────────────────────────────────────────────────────────────────────
// Aynı tablo üç işi görür: kanal listesi · müşteriye özel fiyat · tarihli geçerlilik. Üçü de
// örneklenir, yoksa fiyat çözücünün "en özgül kazanır" kuralı hiç denenmez.
//
// TABAN FARKI (DOMAIN §5): b2c satırı KDV DAHİL (TTC), b2b satırı KDV HARİÇ (HT). Aynı ürünün iki
// satırı bu yüzden birbirine eşit değildir — b2b sayısının küçük görünmesi hata değil, tabandır.

/**
 * Liste fiyatı (b2c, KDV dahil) — **ağırlıktan türer** (gerçek katalog, 04.08).
 *
 * Eskiden yalnız indise bağlıydı (`6,5 + (i%14)×1,75`) ve uydurma katalogda kimse fark etmiyordu:
 * orada her varyant 500–1000 g arasındaydı. Gerçek katalogda 40 g'lık el böreği ile 2,5 kg'lık
 * baklava tepsisi yan yana duruyor — ağırlıksız bir fiyat ikisini aynı banda koyar ve **ekrandaki
 * her fiyat listesi bariz yanlış görünür**; üstelik marj, kâr ve sepet tutarı da onunla birlikte.
 *
 * Kilo başına taban + sabit paketleme payı: küçük boyun kilo fiyatı doğal olarak yüksek çıkar
 * (gerçek perakendede de öyledir). İndis yalnız ±%12'lik bir SAPMA verir — yoksa aynı gramajdaki
 * tüm ürünler kuruşu kuruşuna aynı fiyatı gösterir ve liste kopyala-yapıştır görünürdü.
 *
 * Boysuz ürün (bütün pastalar) 1 kg sayılır: tepsi ürünüdür, tek dilim değil.
 */
function listeFiyati(netWeightG: number | null, i: number): number {
  const kg = (netWeightG ?? 1000) / 1000;
  const KILO_TABANI = 14.5; // €/kg, KDV dahil
  const PAKETLEME = 1.2; // € — boydan bağımsız sabit pay
  const sapma = 1 + ((i % 7) - 3) * 0.04; // 0,88 … 1,12
  return euro(Math.max(1.5, (kg * KILO_TABANI + PAKETLEME) * sapma));
}

export async function seedPrices(db: Db, varyantlar: VaryantRef[], kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'price')) {
    console.log('▸ fiyatlar zaten dolu — atlandı');
    return;
  }
  console.log('▸ FİYAT seed');
  const prices = new PriceService(db);
  let satir = 0;
  /**
   * SATILABİLİR sıra — aday atlandıkça artar, `i` ile aynı şey DEĞİLDİR.
   *
   * Aşağıdaki "ilk 45" penceresi sipariş bölümüne verilmiş bir SÖZ ve o bölüm kalemlerini
   * `satilabilir` (adaysız) dizisinden seçiyor. Pencere `i` üzerinden sayılsaydı arada kalan her
   * aday sözü bir adım kısaltırdı: 16.08'de aday sayısı 4'ten 25'e çıkınca pencere gerçekte ~34
   * kaleme iniyordu ve **toptan siparişin son kalemleri b2b fiyatı olmayan varyantlara düşerdi.**
   * İki indis uzayını aynı sanmak — bu dosyanın da, stok dosyasının da aynı gün düzeltilen hatası.
   */
  let satilabilirSira = 0;

  for (const [i, v] of varyantlar.entries()) {
    // Aday ürün satışta değildir; fiyatı da olmasın (fiyatsız aday = gerçekçi boş durum).
    if (v.status === 'candidate') continue;
    const sira = satilabilirSira;
    satilabilirSira += 1;

    const b2cTtc = listeFiyati(v.netWeightG, i);
    // Toptan: KDV'siz tabana in, üstüne toptan indirimi uygula.
    const b2bHt = euro((b2cTtc / (1 + v.vatRate / 100)) * 0.82);

    // Her 11'incisinde ESKİ bir liste bırakılır: fiyat geçmişi ve "hangi listeden çıktı" görünür.
    if (i % 11 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(b2cTtc * 0.92), validFrom: gun(-120) });
      satir += 1;
    }
    // **b2c fiyatı HERKESE, b2b fiyatı bir bölüme (kullanıcı kararı 16.08: fiyat satırları incelsin).**
    //
    // b2c'yi seyreltmek olmazdı: fiyatsız ürün vitrinde alınamaz kart olur ve katalogun üçte biri
    // öyle olsaydı ekran boşalırdı. **b2b farklı bir soru soruyor** — "bu ürün toptan satışta mı?" —
    // ve gerçek bir katalogda cevabı her üründe evet değildir. Seyreltme burada hem satır düşürüyor
    // hem "toptan fiyatı girilmemiş ürün" hâlini doğuruyor.
    //
    // İlk 45 SATILABİLİR varyant her hâlde b2b fiyatı alır: sipariş bölümü toptan kalemlerini o
    // aralıktan seçiyor (`kalem(0…38)`) ve fiyatsız bir varyant oraya düşerse sipariş tutarı
    // sıfırlanırdı. Ölçüt `sira` — gerekçesi künyede.
    await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(b2cTtc), validFrom: gun(-30) });
    satir += 1;
    if (sira < 45 || sira % 3 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2b', amountCents: toCents(b2bHt), validFrom: gun(-30) });
      satir += 1;
    }

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
      // Liste fiyatı AYNI fonksiyondan okunur: iki formül olsaydı "özel fiyat listeden iyi" kuralı
      // bir gün kendiliğinden bozulur ve pazarlıklı müşteri listeden pahalıya alırdı.
      const liste = listeFiyati(v.netWeightG, varyantlar.indexOf(v));
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

