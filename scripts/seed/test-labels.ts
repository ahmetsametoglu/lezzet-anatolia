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
export type TestLabelRole = 'paket' | 'koli' | 'toplama' | 'yabanci' | 'taninmayan';

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
    /*
      HEDEFİ DEĞİŞTİ (kullanıcı kararı 01.09): eskiden "açık kutulu SİPARİŞİN kalemi"ydi. Besleme
      artık hiç sipariş yazmıyor, dolayısıyla bağlanacak bir sipariş kalemi de yok. Kod sabit bir
      KATALOG varyantına bağlanıyor: toplama turu için o varyantı içeren bir sipariş oluşturmak
      gerekiyor — kâğıt yine çalışıyor, yalnız zemini artık kullanıcının kendi kurduğu sipariş.
    */
    role: 'toplama',
    code: '8691000030009',
    symbology: 'ean13',
    title: 'TOPLAMA',
    hint: 'Toplama · sabit bir katalog varyantı — o varyantı içeren sipariş oluştur, sonra okut',
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
  /*
    KUTU QR'I SETTEN ÇIKTI (kullanıcı kararı 01.09) — `KT-99-TESTKUTU01`.

    Kutu kodu bir KAYIT kimliğidir ve sonradan değiştirilemez (`OrderBoxUpdate` bilerek yalnız damga
    alanlarını alıyor), o yüzden kutu en baştan sabit kodla açılıyordu — ve o açılış `orders.ts`teydi.
    Besleme artık sipariş yazmadığı için açılacak kutu da yok; sette bırakılsaydı hiçbir kayda
    bağlanmayan bir QR basılırdı ve okutan kişi "tanınmayan kod" cevabı alırdı. Basılı kâğıt
    kullanıcının elinde duruyor; kutu okutmasını denemek isteyen kendi siparişini toplar, kutuyu
    kapatır ve o kutunun KENDİ etiketini bastırır (23.7 — ekran zaten bunu yapıyor).
  */
];

/** Kod arama — set sabit olduğu için rol daima bulunur (bulunmazsa seed'in kendi arızasıdır). */
export function testLabelCode(role: TestLabelRole): string {
  const label = TEST_LABELS.find((l) => l.role === role);
  if (label === undefined) throw new Error(`test etiketi: '${role}' rolü sette yok`);
  return label.code;
}

/**
 * Sabit kodları seed'in GERÇEK kayıtlarına bağlar.
 *
 * `taninmayan` hiçbir yere yazılmaz; anlamı zaten "bağlı değil". Öğretildikten sonra tanınır hâle
 * gelir — yeniden "tanınmayan" yapmak için o satırı silmek (ya da `db:refresh`) gerekir; künye
 * `pnpm labels:test` çıktısında da yazar.
 *
 * **Sipariş ARANMIYOR** (01.09): besleme sipariş yazmıyor, dolayısıyla hedefler yalnız tedarik
 * siparişinden ve katalogdan çıkıyor. `kutu` rolü setten kalktı (künye set tanımında).
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

  // ── Toplama: SATILABİLİR bir katalog varyantı ───────────────────────────────────────────────
  // Hedef artık siparişten değil katalogdan seçiliyor (künye set tanımında). Ölçüt sabit: tedarik
  // siparişinin kalemleri DIŞINDA kalan ilk satılabilir varyant — böylece paket/koli kodlarıyla
  // aynı ürüne düşüp iki etiketi ayırt edilemez hâle getirmiyor.
  /*
    SIRA SABİTLENİR — `varyantlar` sırasız gelir (ölçüldü 01.09: seed iki kez koşunca `toplama` ile
    `yabanci` AYNI varyanta bağlandı ve set kendini bozuk ilan etti). Dosyanın kendi kuralı zaten
    bu ve tedarik kalemlerine uygulanmıştı — *"sırasız bir listede 'ilk kalem' her koşuda başka
    ürün demek, sabit kodun anlamı da onunla birlikte kayar"*. Katalog seçimleri de aynı kurala
    girdi: kimliğe göre sıralanan listede "ilk uygun" her koşuda AYNI ürün.
  */
  const adaylar = varyantlar.filter((v) => v.status !== 'candidate').sort((a, b) => a.id.localeCompare(b.id));
  const poVaryantlari = new Set(kalemler.map((k) => k.variantId));
  const toplama = adaylar.find((v) => !poVaryantlari.has(v.id));
  if (toplama === undefined) throw new Error('test etiketi: toplama için satılabilir varyant bulunamadı');
  await bagla(barcodes, testLabelCode('toplama'), toplama.id, 'unit', 1);

  /*
    ── Yabancı: hiçbir kabulde OLMAYAN kayıtlı ürün ──────────────────────────────────────────
    Sabit bir indis SEÇİLMEZ, kesişim ÖLÇÜLÜR: seed'in dilimleri değişince "yabancı" sessizce
    tanıdık bir ürüne dönüşür ve ret yolu hiç sınanmaz olurdu.

    ELEME BÜTÜN TEDARİK SİPARİŞLERİNE bakar, yalnız hedefe değil (ölçüldü 01.09, seed kesildi).
    Sipariş ekseni elemeden kalkınca (besleme artık sipariş yazmıyor) aday liste başına kaydı ve
    BAŞKA bir tedarik siparişinin kalemine denk geldi; `dogrula` — doğru olarak — bütün kabullere
    baktığı için seed'i durdurdu. Ölçüt burada da doğrulamadakiyle AYNI olmalı: iki yerde iki
    farklı "yabancı" tanımı, birinin ötekini yakaladığı gün kesilen bir koşu demek.
  */
  const kullanilan = new Set<string>([...(await tedarikVaryantlari(db)), toplama.id]);
  const yabanci = adaylar.find((v) => !kullanilan.has(v.id));
  if (yabanci === undefined) throw new Error('test etiketi: hiçbir işe girmemiş varyant bulunamadı');
  await bagla(barcodes, testLabelCode('yabanci'), yabanci.id, 'unit', 1);

  await dogrula(db, poId, yabanci.id);

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
async function dogrula(db: Db, poId: string, yabanciVariantId: string): Promise<void> {
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

  // "Yabancı" olmanın tek ölçütü budur: hiçbir kabulde bulunmamak. Sipariş ekseni ARANMIYOR —
  // besleme sipariş yazmıyor, dolayısıyla her varyant zaten "hiçbir siparişte yok" (01.09).
  const { count: poSayisi } = await db
    .from('purchase_order_item')
    .select('id', { count: 'exact', head: true })
    .eq('variant_id', yabanciVariantId);
  if ((poSayisi ?? 0) > 0) {
    throw new Error('test etiketi: "yabancı ürün" tanıdık çıktı — ret yolu sınanamaz');
  }
}

/** TÜM tedarik siparişlerinin kalem varyantları — "yabancı" adayını elemenin ölçütü. */
async function tedarikVaryantlari(db: Db): Promise<string[]> {
  const { data } = await db.from('purchase_order_item').select('variant_id');
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
