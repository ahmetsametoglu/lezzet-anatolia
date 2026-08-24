import { listPendingIntakes } from '@lezzet/application';
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
export async function seedTestLabels(db: Db, varyantlar: VaryantRef[]): Promise<void> {
  const barcodes = new VariantBarcodeService(db);
  const kalemServisi = new PurchaseOrderItemService(db);

  // ── Mal kabul: KABUL EDİLEBİLİR bir siparişin kendi kalemleri ───────────────────────────────
  // Hedef seed'in ara haritasından DEĞİL, veriden bulunuyor: harita `tabloDolu` guard'ıyla erken
  // dönen bir koşuda boş kalıyor ve `pnpm db:seed` ikinci kez çalıştırıldığında set çöküyordu
  // (ölçüldü 24.08). Ölçüt kimlik değil DURUM: mal kabul ekranı `sent` ve `partially_received`
  // siparişleri listeler, etiketin işe yaraması için hedefin o kümede olması yeter.
  const poId = await kabulEdilebilirSiparis(db);
  // Kalem sırası da SABİTLENİR: `listByOrder` sıra garanti etmiyor ve sırasız bir listede "ilk
  // kalem" her koşuda başka ürün demek — sabit kodun anlamı da onunla birlikte kayar.
  const kalemler = (await kalemServisi.listByOrder(poId)).sort((a, b) => a.variantId.localeCompare(b.variantId));
  if (kalemler.length < 2) throw new Error('test etiketi: kabul edilebilir siparişin en az iki kalemi olmalı');

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

  await dogrula(db, poId, acikKutulu, yabanci.id);

  // Kimlik YAZILMAZ ve gerekmez: mal kabul ekranı 24.08'den beri bekleyen sevkiyatları kendisi
  // listeliyor (`GET /warehouse/intake`), yani tur `/intake` ile açılır. Kimliği künyeye yazmak,
  // bir sonraki tazelemede yanlış olacak bir bilgiyi belgelemek olurdu.
  console.log(`✓ test etiketi: ${TEST_LABELS.length} sabit kod, bağları doğrulandı (künye: pnpm labels:test)`);
}

/**
 * **SET KENDİ VAADİNİ DOĞRULAR** (kullanıcı kararı 24.08: *"her seferinde uyumsuzluk problemleri
 * yaşamayalım"*).
 *
 * Bağlar kurulduktan sonra dört soru ölçülür ve tutmayan biri seed'i DURDURUR. Gerekçe yaşananlar:
 * etiketler bir kez kabul edilmiş bir siparişe bağlandı ve arıza ancak cihazda, boş açılan bir
 * formla görüldü — o noktada sebep de görünmüyordu ("açık kalemi yok" dedi, kimin suçu olduğunu
 * söylemedi). Uyumsuzluk artık makinede, sebebiyle birlikte çıkar.
 */
async function dogrula(db: Db, poId: string, toplamaVariantId: string, yabanciVariantId: string): Promise<void> {
  const { data: po } = await db.from('purchase_order').select('status').eq('id', poId).maybeSingle();
  const durum = (po as { status: string } | null)?.status;
  // Kabul ekranı `sent` ve `partially_received` siparişleri listeler; kapanmış bir siparişe bağlanan
  // etiket kâğıtta duruyor ama hiçbir formda karşılığı olmuyor.
  if (durum !== 'sent' && durum !== 'partially_received') {
    throw new Error(`test etiketi: paket/koli kabul edilemeyecek bir siparişe bağlandı (durum: ${durum ?? 'yok'})`);
  }

  // Ekranın İLK satırı olmalı: turu kuran kişi listede en üsttekine basar. İkinci sıraya düşen bir
  // hedef, sistem doğru çalışsa bile "bu siparişin kaleminde yok" cevabı üretir (ölçüldü 24.08).
  const [ilk] = await listPendingIntakes(db, { limit: 1 });
  if (ilk?.purchaseOrderId !== poId) {
    throw new Error('test etiketi: hedef sipariş mal kabul listesinin ilk satırı değil');
  }

  const { data: acik } = await db
    .from('order_box')
    .select('id, order_id')
    .is('sealed_at', null)
    .limit(1)
    .maybeSingle();
  if (acik === null) throw new Error('test etiketi: toplama turu için açık kutu yok');

  const { data: toplamaKalem } = await db
    .from('order_item')
    .select('id')
    .eq('order_id', (acik as { order_id: string }).order_id)
    .eq('variant_id', toplamaVariantId)
    .limit(1)
    .maybeSingle();
  if (toplamaKalem === null) throw new Error('test etiketi: toplama kodu açık kutulu siparişin kaleminde değil');

  // "Yabancı" olmanın tek ölçütü budur: hiçbir kabulde ve hiçbir siparişte bulunmamak.
  const { count: poSayisi } = await db
    .from('purchase_order_item')
    .select('id', { count: 'exact', head: true })
    .eq('variant_id', yabanciVariantId);
  const { count: siparisSayisi } = await db
    .from('order_item')
    .select('id', { count: 'exact', head: true })
    .eq('variant_id', yabanciVariantId);
  if ((poSayisi ?? 0) > 0 || (siparisSayisi ?? 0) > 0) {
    throw new Error('test etiketi: "yabancı ürün" tanıdık çıktı — ret yolu sınanamaz');
  }

  const { data: kutu } = await db
    .from('order_box')
    .select('sealed_at')
    .eq('code', testLabelCode('kutu'))
    .maybeSingle();
  const muhur = (kutu as { sealed_at: string | null } | null)?.sealed_at ?? null;
  if (muhur === null) throw new Error('test etiketi: kutu QR kodu KAPALI bir kutuya bağlı değil');
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

/**
 * Etiketlerin bağlanacağı sipariş — **mal kabul ekranında EN ÜSTTE görünen**, en az iki kalemli.
 *
 * Ölçüt ekranın kendi sıralamasıdır (`listPendingIntakes`: en yeni önce). Sebebi ölçüldü (24.08):
 * "en çok kalemli"yi seçmek doğru bir sipariş buluyordu ama o sipariş listede İKİNCİ sıradaydı —
 * turu kuran kişi en üsttekine basıp "bu siparişin kaleminde yok" cevabını alıyordu. Sistem
 * doğruydu, eşleşme yanlıştı. Etiket artık listenin ilk satırında karşılığını buluyor.
 *
 * İki kalem şartı: paket ve koli AYRI kalemlere bağlanıyor; tek kalemli bir siparişte set eksik
 * kurulurdu. Şartı sağlayan yoksa hata — sessizce üçüncü sıraya kaymak, aynı tuzağı geri getirirdi.
 */
async function kabulEdilebilirSiparis(db: Db): Promise<string> {
  const { data } = await db
    .from('purchase_order')
    .select('id, created_at')
    .in('status', ['sent', 'partially_received'])
    .order('created_at', { ascending: false });
  const adaylar = (data ?? []) as Array<{ id: string }>;
  if (adaylar.length === 0) throw new Error('test etiketi: kabul edilebilir tedarik siparişi yok');

  const kalemServisi = new PurchaseOrderItemService(db);
  for (const aday of adaylar) {
    if ((await kalemServisi.listByOrder(aday.id)).length >= 2) return aday.id;
  }
  throw new Error('test etiketi: kabul edilebilir siparişlerin hiçbirinde iki kalem yok');
}

/**
 * Kodu varyanta bağlar — **tekrar koşuya dayanıklı**: kod zaten aynı yere bağlıysa dokunmaz, BAŞKA
 * yere bağlıysa durur.
 *
 * Sessizce geçmek en kötüsü olurdu: kâğıttaki etiket bir ürünü gösterirken sistem başkasını
 * tanırdı ve fark ancak depoda, yanlış mal stoğa yazıldıktan sonra görülürdü.
 */
async function bagla(
  barcodes: VariantBarcodeService,
  code: string,
  variantId: string,
  kind: 'unit' | 'case',
  qtyPerCode: number,
): Promise<void> {
  const mevcut = await barcodes.getByCode(code);
  if (mevcut !== null) {
    if (mevcut.variantId !== variantId) {
      throw new Error(`test etiketi: "${code}" başka bir varyanta bağlı — set bozulmuş, db:refresh gerekir`);
    }
    return;
  }
  await barcodes.insert({ variantId, code, kind, qtyPerCode });
}
