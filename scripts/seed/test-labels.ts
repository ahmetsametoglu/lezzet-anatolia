import { PurchaseOrderItemService, VariantBarcodeService } from '@lezzet/database';
import type { Db, VaryantRef } from './shared';

/*
  ── FİZİKSEL TEST ETİKETLERİ (kullanıcı kararı 24.08) ────────────────────────

  NEDEN VAR: tarama akışını gerçek kamerayla sınamanın tek yolu elde KÂĞIT bir kod olmasıdır ve
  her tur için yazıcıdan yeni etiket çıkarmak kâğıt israfıdır. Bu yüzden kodların KENDİSİ
  sabitlendi: set bir kez basılır, her `db:refresh` sonrasında aynı kâğıtlar yine çalışır.

  ── SABİT OLAN KOD, ROLLE SEÇİLEN ÜRÜN ──────────────────────────────────────
  Etikette ürün adı YAZMAZ, yalnız kod ve o kodun SINADIĞI YOL yazar. Kodun hangi ürüne bağlanacağı
  katalog sırasından değil ROLDEN gelir ("kabul bekleyen siparişin ilk kalemi", "açık kutusu olan
  siparişin kalemi"). Katalog değişse, ürünler yeniden sıralansa bile etiket hep DOĞRU YERDE
  çalışır — ürün adını kâğıda yazsaydık ilk katalog değişiminde etiket yalan söylerdi.

  Eskiden kodlar `barcode.ts`'in sıra tabanlı formülünden geliyordu ve hangi etiketin hangi ekranda
  işe yaradığı TESADÜFTÜ (ölçüldü 24.08: kutulu siparişlerin kalemleriyle barkodlu varyantların
  kesişimi BOŞTU — elde kod vardı ama toplama ekranı kâğıtla hiç sınanamıyordu).

  ── SETİN TAMAMI BİR HİKÂYE ─────────────────────────────────────────────────
  Altı etiket, taramanın altı yolu: paket · koli · toplama · yabancı ürün (ret) · tanınmayan
  (öğrenme) · kutu QR'ı (yükleme + teslim). Biri eksikse o yol kâğıtla sınanamaz.

  SKU EŞLEŞMESİ BİLEREK SETTE YOK: o kodun bir varyantın SKU'sunun kendisi olması gerekir, yani
  sabitlenemez (SKU katalogun malıdır ve fiyat dosyalarının anahtarıdır — seed'in onu test için
  değiştirmesi fiyat eşlemesini bozardı). Zincirin o halkası jest + entegrasyon testlerinde ölçülü;
  kâğıt gerektiren şey kameranın DECODE etmesiydi, onu paket/koli etiketleri zaten sınıyor.
*/

/** Etiketin sınadığı yol — basılan kâğıdın üstünde bu ad yazar. */
export type TestLabelRole = 'paket' | 'koli' | 'toplama' | 'yabanci' | 'taninmayan' | 'kutu';

/**
 * Kâğıda hangi SİMGEYLE basılacağı (kullanıcı bulgusu 24.08).
 *
 * Veri için fark etmez — kapı ham metin alır ve `variant_barcode` biçim zorlamaz. Fark DECODE
 * katmanındadır: gerçek depoda paket EAN-13, koli ITF-14 okutulur ve ikisi de QR'dan çok daha
 * zordur (ince çizgi, açı ve mesafe toleransı düşük). Setin tamamı QR olsaydı sınamak istediğimiz
 * zor yol hiç sınanmazdı. QR yalnız KENDİ kodumuz için: kutu QR'ı harf taşır, EAN'a sığmaz.
 */
export type TestLabelSymbology = 'ean13' | 'itf14' | 'qr';

export interface TestLabel {
  role: TestLabelRole;
  /** Kâğıda basılan kod — SABİT; değiştirmek basılı etiketleri çöpe atar. */
  code: string;
  /** Çizgili simgelerde kod SAĞLAMA BASAMAĞIYLA geçerli olmalı; okuyucu tutmayanı sessizce yutar. */
  symbology: TestLabelSymbology;
  title: string;
  /** Kâğıdın altındaki tek satır: bu etiket ne yapar. */
  hint: string;
}

/**
 * **SETİN TEK KAYNAĞI.** Üç tüketici okur: seed (kodları bağlar), etiket basımı
 * (`pnpm labels:test`) ve mobilin simülasyon havuzu (`dev-scan-pool.ts` — kamerasız tur).
 *
 * İlk iki kod 22–24.08'de FİZİKSEL olarak basıldı ve kullanıcının elinde; değiştirilemezler.
 */
export const TEST_LABELS: readonly TestLabel[] = [
  {
    role: 'paket',
    code: '8691000007919',
    symbology: 'ean13',
    title: 'PAKET',
    hint: 'Mal kabul · tekil paket kodu — çekmece 1 adetle açılır',
  },
  {
    // 24.08: elde basılı olan `…514` GEÇERSİZ bir GTIN-14'tü (sağlama basamağı 6 olmalı) —
    // okuyucu onu sessizce yutardı. Düzeltildi; set zaten yeniden basılıyor.
    role: 'koli',
    code: '18691000047516',
    symbology: 'itf14',
    title: 'KOLİ x24',
    hint: 'Mal kabul · koli kodu — çekmece 24 adetle açılır',
  },
  {
    role: 'toplama',
    code: '8691000030009',
    symbology: 'ean13',
    title: 'TOPLAMA',
    hint: 'Toplama · açık kutulu siparişin kalemi — kutuya eklenir',
  },
  {
    role: 'yabanci',
    code: '8691000040008',
    symbology: 'ean13',
    title: 'YABANCI ÜRÜN',
    hint: 'Ret yolu · kayıtlı ürün ama bu kabulde/siparişte yok',
  },
  {
    // Tanınmayan kod da gerçek hayatta bir EAN'dır: depoya gelen yeni bir ürünün paketi.
    role: 'taninmayan',
    code: '8691000050007',
    symbology: 'ean13',
    title: 'TANINMAYAN',
    hint: 'Öğrenme · hiçbir ürüne bağlı değil ("bu kod hangi ürün?")',
  },
  {
    // BİZİM kodumuz — harf taşır, EAN'a sığmaz ve zaten QR olarak basılıyor (kutu etiketi 23.7).
    role: 'kutu',
    code: 'KT-99-TESTKUTU01',
    symbology: 'qr',
    title: 'KUTU QR',
    hint: 'Kurye · yükleme + kapıda teslim okutması (kapalı kutu)',
  },
];

/** Kod arama — set sabit olduğu için rol daima bulunur (bulunmazsa seed'in kendi arızasıdır). */
export function testLabelCode(role: TestLabelRole): string {
  const label = TEST_LABELS.find((l) => l.role === role);
  if (label === undefined) throw new Error(`test etiketi: '${role}' rolü sette yok`);
  return label.code;
}

/**
 * Sabit kodları seed'in GERÇEK kayıtlarına bağlar — siparişlerden SONRA koşar.
 *
 * `taninmayan` hiçbir yere yazılmaz; anlamı zaten "bağlı değil". Öğretildikten sonra tanınır hâle
 * gelir — yeniden "tanınmayan" yapmak için o satırı silmek (ya da `db:refresh`) gerekir; künye
 * `pnpm labels:test` çıktısında da yazar.
 *
 * `kutu` burada değil `orders.ts`te bağlanır: kutu kodu bir KAYIT kimliğidir, sonradan
 * değiştirilemez (`OrderBoxUpdate` bilerek yalnız damga alanlarını alıyor) — o yüzden kutu en
 * baştan sabit kodla açılır.
 */
export async function seedTestLabels(db: Db, varyantlar: VaryantRef[], tedarik: Map<string, string>): Promise<void> {
  const barcodes = new VariantBarcodeService(db);
  const kalemServisi = new PurchaseOrderItemService(db);

  // ── Mal kabul: kabul BEKLEYEN tedarik siparişinin kendi kalemleri ───────────────────────────
  const poId = tedarik.get('kabulBekleyenPo');
  if (poId === undefined) throw new Error('test etiketi: kabul bekleyen tedarik siparişi yok');
  const kalemler = await kalemServisi.listByOrder(poId);
  if (kalemler.length < 2) throw new Error('test etiketi: kabul bekleyen siparişin en az iki kalemi olmalı');

  await bagla(barcodes, testLabelCode('paket'), kalemler[0]!.variantId, 'unit', 1);
  await bagla(barcodes, testLabelCode('koli'), kalemler[1]!.variantId, 'case', 24);

  // ── Toplama: AÇIK kutusu olan siparişin bir kalemi ──────────────────────────────────────────
  const acikKutulu = await acikKutuluSiparisVaryanti(db);
  await bagla(barcodes, testLabelCode('toplama'), acikKutulu, 'unit', 1);

  // ── Yabancı: hiçbir kabulde/siparişte OLMAYAN kayıtlı ürün ──────────────────────────────────
  // Sabit bir indis SEÇİLMEZ, kesişim ÖLÇÜLÜR: seed'in dilimleri değişince "yabancı" sessizce
  // tanıdık bir ürüne dönüşür ve ret yolu hiç sınanmaz olurdu.
  const kullanilan = new Set<string>([...kalemler.map((k) => k.variantId), acikKutulu]);
  for (const v of await siparisVaryantlari(db)) kullanilan.add(v);
  const yabanci = varyantlar.find((v) => v.status !== 'candidate' && !kullanilan.has(v.id));
  if (yabanci === undefined) throw new Error('test etiketi: hiçbir işe girmemiş varyant bulunamadı');
  await bagla(barcodes, testLabelCode('yabanci'), yabanci.id, 'unit', 1);

  // Kodlar sabit ama BAĞLANDIKLARI KAYIT her koşuda yeni kimlik alır; turu kuran kişi (ya da ajan)
  // mal kabul formunu bu kimlikle açar — kimliği aramak için DB'ye inmek zorunda kalmasın.
  console.log(`✓ test etiketi: ${TEST_LABELS.length} sabit kod (fiziksel set — künye: pnpm labels:test)`);
  console.log(`  · mal kabul turu: /intake?purchaseOrderId=${poId}`);
}

/** Açık (mühürsüz) kutusu olan siparişin ilk kaleminin varyantı — toplama etiketinin hedefi. */
async function acikKutuluSiparisVaryanti(db: Db): Promise<string> {
  const { data: kutu } = await db.from('order_box').select('order_id').is('sealed_at', null).limit(1).maybeSingle();
  const orderId = (kutu as { order_id: string } | null)?.order_id;
  if (orderId === undefined) throw new Error('test etiketi: açık kutulu sipariş yok');

  const { data: kalem } = await db.from('order_item').select('variant_id').eq('order_id', orderId).limit(1).maybeSingle();
  const variantId = (kalem as { variant_id: string } | null)?.variant_id;
  if (variantId === undefined) throw new Error('test etiketi: açık kutulu siparişin kalemi yok');
  return variantId;
}

/** Tüm sipariş kalemlerinin varyantları — "yabancı" adayını elemek için. */
async function siparisVaryantlari(db: Db): Promise<string[]> {
  const { data } = await db.from('order_item').select('variant_id');
  return ((data ?? []) as Array<{ variant_id: string }>).map((r) => r.variant_id);
}

async function bagla(
  barcodes: VariantBarcodeService,
  code: string,
  variantId: string,
  kind: 'unit' | 'case',
  qtyPerCode: number,
): Promise<void> {
  // Kod GLOBAL unique. Genel kodlama (`barcode.ts`) bu sabitleri üretmez (biçimleri ayrık), ama bir
  // gün çakışırsa sessizce geçmesin: hata seed'i durdurur, etiket yanlış ürüne bağlanmaz.
  await barcodes.insert({ variantId, code, kind, qtyPerCode });
}
