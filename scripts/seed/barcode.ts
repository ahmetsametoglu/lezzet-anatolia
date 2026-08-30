import { VariantBarcodeService } from '@lezzet/database';
import { tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';
import { TEST_LABELS } from './test-labels';

// ── Ürün barkodları (Modül 23) ───────────────────────────────────────────────────────────────────
// İki kural, iki hâl: paket kodu (`unit`, çarpan 1) ile koli kodu (`case`, çarpan kolinin adedi) —
// tarama zinciri ve mal kabulün "koli okutunca çarpan kadar öner" davranışı ancak ikisi birden
// varken sınanır. Bir kod da ÖĞRENİLMİŞTİR (`created_by` dolu): öğrenen eşlemenin izi (kim öğretti)
// ile sistem kaydının (seed/içe aktarım — iz yok) ekrandaki ayrımı ancak böyle görünür.
//
// **Katalogun tamamına kod YAZILMAZ ve bu bilinçli:** gerçek dünyada kod tablosu kabulde kendini
// doldurur (karar §1.3) — "tanınmayan kod" hâli seed'de kodsuz kalan varyantlarla yaşar. Hepsine
// kod verseydik öğrenen eşleme ekranı hiçbir koşuda açılmazdı.

/**
 * Sentetik EAN-13 benzeri kod — GERÇEK GS1 kodu değil ve olmamalı: gerçek bir EAN yazmak, günün
 * birinde sahici bir ürünün koduyla çakışmak demektir. `869` Türkiye önekiyle başlar (görünüş
 * gerçekçi), gövde varyant sırasından türer (deterministik — iki koşu aynı kodu üretir, guard'lı
 * seed'de çakışma doğmaz). Kontrol hanesi hesaplanmaz; sistem biçim zorlamıyor (şema künyesi).
 *
 * **AYNASI VAR:** mobilin simülasyon havuzu (`apps/mobile/src/components/scan/dev-scan-pool.ts`)
 * aynı formülü taşıyor — scripts mobile'a bağlanamadığı için bilinçli kopya. Formül değişirse iki
 * taraf birlikte değişir; ayrışırsa havuz çipleri "tanınmayan kod"a düşer (kırılmaz, söyler).
 */
const eanBenzeri = (n: number): string => `869${String(1000000000 + n * 7919).slice(-10)}`;

/**
 * **FİZİKSEL etiketlerin kodları burada ÜRETİLMEZ** (24.08). İki tanesi (`8691000007919` ve
 * `18691000047514`) bu formülün ürettiği kodlardı ve kâğıda basıldılar; sonra sabit test seti
 * kuruldu (`test-labels.ts`) ve o set kodları KENDİ seçtiği varyantlara bağlıyor. İkisi birden
 * yazmaya çalışınca kod global unique kısıtına takılıyordu (ölçüldü: `23505` — seed durdu).
 *
 * Rezerve kümesi seti tek kaynaktan okur: yeni bir test etiketi eklendiğinde burası kendiliğinden
 * ondan da uzak durur. Rezerve bir koda denk gelen varyant KODSUZ kalır ve bu zararsız — katalogun
 * tamamına zaten kod yazılmıyor ("tanınmayan kod" hâli o kodsuzlarla yaşıyor, künye yukarıda).
 */
const REZERVE_KODLAR = new Set(TEST_LABELS.map((l) => l.code));

export async function seedBarcodes(db: Db, varyantlar: VaryantRef[], kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'variant_barcode')) {
    console.log('▸ barkodlar zaten dolu — atlandı');
    return;
  }
  console.log('▸ BARKOD seed');
  const barcodes = new VariantBarcodeService(db);

  // Satılabilir varyantların İLK sekizi: sipariş kalemleri de bu aralıktan seçiliyor, yani kodlu
  // varyantlar mal kabul ve toplama akışlarında gerçekten karşımıza çıkacak olanlar.
  const kodlanacak = varyantlar.filter((v) => v.status !== 'candidate').slice(0, 8);
  const depocu = kisiler.get('depocu') ?? null;

  let unit = 0;
  let kasa = 0;
  /** Kaç VARYANT koli kodu aldı — ilk çarpanın rotasyonu buna bağlı (satır sayısına değil). */
  let koliliVaryant = 0;
  for (const [i, v] of kodlanacak.entries()) {
    const paketKodu = eanBenzeri(i);
    if (!REZERVE_KODLAR.has(paketKodu)) {
      await barcodes.insert({
        variantId: v.id,
        code: paketKodu,
        // Sondaki paket kodu depocunun ÖĞRETTİĞİ kayıt: `created_by` dolu — ekran "kim öğretti"
        // izini ancak böyle bir satırla gösterebilir.
        createdBy: i === kodlanacak.length - 1 ? depocu : null,
      });
      unit += 1;
    }

    // Her üçüncü varyanta KOLİ kodu: GTIN-14 görünümü (başa ambalaj hanesi), çarpan çeşitli
    // (6 · 12 · 24) — tek çarpan, "çarpan kadar öner" davranışını tek sayıyla sınardı.
    //
    // ── ÜRÜNÜN BİRDEN ÇOK KOLİ BOYU VAR (kullanıcı bulgusu 30.08) ───────────
    // Eskiden varyant başına TEK boy yazılıyordu ve mal kabulün adet çekmecesi bu yüzden hiçbir
    // koşuda gerçek hâlini göstermiyordu: tasarımın "KAÇ KOLİ GELDİ" listesi ürün kartında
    // kayıtlı BÜTÜN boyları sayıyor (şablonun kendi örneği: KT-04 · KL-12 · KL-24) ve tek satırlık
    // bir liste o ekranı sınamıyor. Gerçek dünyada da böyle: aynı ürün altılı kutuyla da gelir,
    // yirmi dörtlü koliyle de — çarpan KODUN kendi alanıdır, varyantın değil (entity künyesi §1.2).
    //
    // İlk boy KODUYLA ve ÇARPANIYLA aynen korundu (`1` + paket kodu): okutma testleri onu okutuyor
    // ve değiştirilseydi tohumdan gelen bir davranış sessizce kayardı. Ek boylar ayrı ambalaj
    // hanesiyle (`2`/`3`) doğuyor — GTIN-14'te o hane zaten "hangi ambalaj kademesi" demek.
    const koliKodu = `1${paketKodu}`;
    if (i % 3 === 0 && !REZERVE_KODLAR.has(koliKodu)) {
      // Rotasyon VARYANT başına döner, satır başına değil: `kasa` artık varyant başına üç kez
      // artıyor ve onunla dönseydi ilk çarpan hep aynı kalırdı.
      const ilkCarpan = [6, 12, 24][koliliVaryant % 3]!;
      koliliVaryant += 1;
      // Ek boylar ilk çarpandan FARKLI olanlar: aynı çarpanı iki kez yazmak, çekmecede ayırt
      // edilemeyen iki satır demekti.
      const carpanlar = [ilkCarpan, ...[4, 12, 24].filter((n) => n !== ilkCarpan)];
      for (const [k, carpan] of carpanlar.entries()) {
        const kod = `${k + 1}${paketKodu}`;
        if (REZERVE_KODLAR.has(kod)) continue;
        await barcodes.insert({ variantId: v.id, code: kod, kind: 'case', qtyPerCode: carpan });
        kasa += 1;
      }
    }
  }

  console.log(
    `✓ barkod: ${unit} paket + ${kasa} koli kodu (${koliliVaryant} varyant, çok boylu) · biri ÖĞRENİLMİŞ (depocu) · katalogun kalanı bilinçle kodsuz`,
  );
}
