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

    // Her üçüncü varyanta bir de KOLİ kodu: GTIN-14 görünümü (başa ambalaj hanesi), çarpan
    // çeşitli (6 · 12 · 24) — tek çarpan, "çarpan kadar öner" davranışını tek sayıyla sınardı.
    const koliKodu = `1${paketKodu}`;
    if (i % 3 === 0 && !REZERVE_KODLAR.has(koliKodu)) {
      await barcodes.insert({
        variantId: v.id,
        code: koliKodu,
        kind: 'case',
        qtyPerCode: [6, 12, 24][kasa % 3]!,
      });
      kasa += 1;
    }
  }

  console.log(`✓ barkod: ${unit} paket + ${kasa} koli kodu · biri ÖĞRENİLMİŞ (depocu) · katalogun kalanı bilinçle kodsuz`);
}
