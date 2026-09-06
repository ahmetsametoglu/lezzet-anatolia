import { Asset } from 'expo-asset';
// Tip-importu çalışma zamanına GİRMEZ (erasable): native modülsüz derlemede de güvenli — gerçek
// yükleme aşağıda yoklamanın arkasında (`ScanSheet`in `import type * as ExpoCamera` deseni).
import type * as BrotherSdk from 'expo-brother-printer-sdk';

import { hasPrinterNativeModule } from './printer-availability';

/*
  BROTHER YAZICI DİKİŞİ (23.5 iğne deneyi) — SDK'ya açılan TEK kapı.

  ── NEYİ ÖLÇÜYOR ────────────────────────────────────────────────────────────
  Etüdün tek ölçülmemiş varsayımı: `expo-brother-printer-sdk`nin RN 0.86 / New Architecture
  altında BAĞLANMASI (karar §1.8 — tutmazsa `apps/mobile/modules/brother-print/` local modülü).
  Bu dosya deneyin iğnesidir: ağdan yazıcı bul + tek bir test desenini bas. Etiketin GERÇEK
  içeriği (23.7) buradan geçmez — o, biçim (PDF/PNG) kesinleşince aynı kapıya bağlanır.

  ── RULO GENİŞLİĞİ MODELDEN ─────────────────────────────────────────────────
  Elimizdeki iki yazıcı iki ayrı rulo taşıyor (karar §1.6): QL-1110NWB 103 mm, QL-820NWB 62 mm.
  Yanlış boy SDK'da hataya döner — İĞNE DENEYİ boyu kanalın model adından seçiyor ki deney iki
  yazıcıda da tek dokunuş olsun.

  ⚠ Bu yalnız DENEYİN kestirmesi. Gerçek basımda boy ENVANTERDEN geliyor (`warehouse_printer`,
  0054) ve kuralın tek sahibi `defaultLabelSizeFor` (`@lezzet/domain-core`). ~~23.7'nin
  `label_printer_*` ayarı~~ 29.08'de tabloya bıraktı. İş bölüşümü de 06.09'da düzeldi: GENİŞ
  yazıcı kargo etiketini (A6, 105 mm'lik kenar dar ruloya sığmaz), DAR yazıcı bizim kutu
  etiketimizi basıyor — 23.7'nin "4×6'nın yazıcısı" notu o gün eskidi.

  ── TEMBEL VE KORUMALI YÜKLEME ──────────────────────────────────────────────
  SDK importu yoklamanın (`hasPrinterNativeModule`) arkasında: modülsüz derlemede (bugünkü
  dev-client, jest) bu dosya yüklenebilir ama SDK'ya dokunulamaz — kamera dikişinin aynı deseni.
*/

export interface PrinterChannel {
  /** Yazıcının BULUNDUĞU yer — kimlik değil, o anki ölçüm. */
  address: string;
  modelName: string;
  /**
   * **Değişmez kimlik** (05.09) — SDK WiFi yazıcılar için veriyor (`BPChannel.serialNumber`).
   *
   * Envanterle eşleşme artık BUNDAN yapılıyor, adresten değil: DHCP kirası yenilendiğinde adres
   * değişir ve adresten eşleşen bir liste yazıcıyı "ağda görünmüyor" diye kaybeder (ölçüldü
   * 05.09: envanterde `.91` yazılıydı, gerçek yazıcı `.169`daydı). Seri numarası cihazın
   * etiketinde de basılı olduğu için depocu gözle doğrulayabiliyor — `macAddress`/`nodeName` de
   * kararlı ama insan-okunur değil.
   *
   * `null` = SDK vermedi (isteğe bağlı alan). O yazıcı adresten eşleşmeye düşer; ölçemediğimizi
   * söylüyoruz, sıfır saymıyoruz (CLAUDE §1).
   */
  serialNumber: string | null;
}

type Sdk = typeof BrotherSdk;

function loadSdk(): Sdk | null {
  if (!hasPrinterNativeModule()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native varlığı yoklandı; üst düzey import modülsüz derlemeyi kırardı (camera emsali)
  return require('expo-brother-printer-sdk') as Sdk;
}

/** Ağdaki Brother yazıcılar — WiFi keşfi (SDK, mDNS/SNMP'yi kendi yürütür). */
export async function findNetworkPrinters(): Promise<PrinterChannel[]> {
  const sdk = loadSdk();
  if (!sdk) return [];
  const channels = await sdk.BrotherPrinterSDK.searchNetworkPrinters({ searchDuration: 4000 });
  return channels.map((channel) => ({
    address: channel.address,
    modelName: channel.modelName,
    // Boş dizgi de "vermedi" demektir: SDK alanı isteğe bağlı yazıyor ve boş dönen bir seri,
    // envanterdeki boş seriyle EŞLEŞİRDİ — iki ayrı yazıcıyı aynı sayardı.
    serialNumber: channel.serialNumber?.trim() || null,
  }));
}

/*
  ── KARGO ETİKETİ PDF OLARAK BASILABİLİR (ölçüldü 28.08, 07.12) ─────────────
  SDK'nın dışa açtığı dört basım kapısından İKİSİ PDF: `printPDF` / `printPDFWithURL` (native
  `printPDFAtPath`), ayarları görüntü basımıyla AYNI (`labelSize`, `autoCut`, `cutAtEnd`) ve
  sayfa seçimi de var. Yani sağlayıcının PDF etiketi için **PDF→PNG çeviren bir bağımlılık
  GEREKMİYOR** — aşağıdaki `printLabel`in PNG olması BİZİM etiketimizin SVG'den gelmesindendir,
  bir SDK sınırı değil.

  Kapı 29.08'de çağıranıyla birlikte yazıldı (aşağıda) — hazırlık ekranı gönderiyi duyurup
  etiketi bastırıyor.
*/

/**
 * **Taşıyıcının kargo etiketi** (07.12) — sağlayıcının PDF'ini ayarlı yazıcıya basar.
 *
 * ── NEDEN AYRI KAPI ─────────────────────────────────────────────────────────
 * `printLabel` PNG basar ve bu bizim kutu etiketimizin SVG'den gelmesindendir. Kargo etiketi
 * DIŞARIDAN geliyor ve PDF; SDK'nın `printPDF` kapısı ayarları görüntü basımıyla aynı tutuyor,
 * yani araya bir PDF→PNG çevirici bağımlılık koymaya gerek yok (ölçüldü 28.08 — önceki varsayım
 * yanlıştı).
 *
 * ── YALNIZ İLK SAYFA ────────────────────────────────────────────────────────
 * Kargo etiketi tek sayfadır. Sağlayıcı bir gün gümrük belgesi eklerse sayfa sınırı olmadan
 * hepsi ruloya art arda basılırdı — `pages: [1]` bunu baştan kapatıyor.
 *
 * ── ~~2 MM TAŞMA~~ KAPANDI (06.09) ─────────────────────────────────────────
 * Burada bir uyarı dururdu: *"alınan gerçek etiket A6 yatay (148×105), elimizdeki rulo 103×164 —
 * döndürülünce 2 mm taşıyor… basılan barkod okutularak doğrulanmadan bu iş bitmiş sayılmaz."*
 * Kaldırıldı, iki sebeple:
 *
 * 1. **Hesap KALIP KESİM kâğıda karşı yapılmıştı** (28.08, `kargo-kanali-tasarimi.md §4.6`) ve o
 *    kâğıt 06.09'da bıraktı: kargo yazıcısında artık SÜREKLİ RULO var (`RollW103`). Sürekli
 *    ruloda boy serbest — 164↔148 sınırı yok; geriye yalnız 105↔103 genişlik farkı (%2) kalıyor.
 * 2. **Kullanıcı böyle bir sorun gözlemlemediğini bildirdi** (06.09). Uyarı masa başında
 *    hesaplanmıştı, kâğıtta hiç görülmedi — ve bir belirti üretmeyen riski "bitmemiş iş" diye
 *    tutmak, gerçek işaretlerin arasına gürültü koymaktır.
 *
 * Ölçüm silinmiyor, yeri değişiyor: §4.6 onu kendi gününün kaydı olarak taşımaya devam ediyor.
 */
export async function printLabelPdf(
  fileUri: string,
  printer: { address: string; model: string; labelSize: string },
): Promise<void> {
  const sdk = loadSdk();
  if (!sdk) throw new Error('yazıcı modülü bu derlemede yok');

  const labelSize = sdk.BPQLLabelSize[printer.labelSize as keyof typeof sdk.BPQLLabelSize];
  if (typeof labelSize !== 'number') throw new Error(`bilinmeyen etiket boyu: ${printer.labelSize}`);

  const channel = { type: sdk.BPChannelType.WiFi, address: printer.address, modelName: printer.model };
  // Sayfa listesi AYRI parametre (SDK'nın ikinci aşırı yüklemesi), ayar nesnesinin alanı değil.
  await sdk.BrotherPrinterSDK.printPDF(fileUri, [1], channel, { labelSize, autoCut: true, cutAtEnd: true });
}

/**
 * **Gerçek etiket basımı** (23.7) — sunucunun ürettiği PNG dosyasını cihazın seçtiği yazıcıya
 * basar. Boy ENVANTERDEN gelir (`warehouse_printer.label_size`, 0054): takılı kâğıt SDK'dan
 * okunamıyor, yanlış boy `SetLabelSizeError` (23.5 ölçümü) — burada deneme listesi YOKTUR,
 * envanter doğruyu söylemekle yükümlü; hata çağırana fırlar ve ekran cümleyi gösterir.
 *
 * PNG de artık O KÂĞIDIN boyunda üretiliyor (06.09): sunucuya `?labelSize=` gidiyor ve şablon
 * orada çiziliyor. Eskiden sabit 103 mm çizilip SDK tarafından %60'a indiriliyordu ve ürün
 * satırları okunmuyordu.
 */
export async function printLabel(
  fileUri: string,
  printer: { address: string; model: string; labelSize: string },
): Promise<void> {
  const sdk = loadSdk();
  if (!sdk) throw new Error('yazıcı modülü bu derlemede yok');

  const labelSize = sdk.BPQLLabelSize[printer.labelSize as keyof typeof sdk.BPQLLabelSize];
  // Numerik enum'un ters eşlemesine düşen değer (sayı → ad, string döner) de geçersizdir.
  if (typeof labelSize !== 'number') throw new Error(`bilinmeyen etiket boyu: ${printer.labelSize}`);

  const channel = { type: sdk.BPChannelType.WiFi, address: printer.address, modelName: printer.model };
  await sdk.BrotherPrinterSDK.printImage(fileUri, channel, { labelSize, autoCut: true, cutAtEnd: true });
}

/**
 * İğne deneyi baskısı: paketlenmiş test desenini verilen yazıcıya basar. Başarı = kâğıt çıktı;
 * dönüş, tutan etiket boyunun adıdır (23.7'nin `label_printer_*` ayarına ölçülmüş değer).
 * SDK reddi fırlar ve çağıran cümleyi AYNEN gösterir (yutulmaz — arıza deneyin verisidir).
 */
export async function printNeedleTest(printer: PrinterChannel): Promise<string> {
  const sdk = loadSdk();
  if (!sdk) throw new Error('yazıcı modülü bu derlemede yok');

  // Desen yerel dosya olarak verilmek zorunda (SDK uzak URL'de sessiz düşüyor — README ölçümü);
  // `expo-asset` paketlenmiş görseli cihaz dosyasına indirir ve `file://` adresini verir.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro görsel varlığı require ile paketler; statik import png için tip taşımıyor
  const asset = Asset.fromModule(require('../../../assets/print/needle-test.png') as number);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('test deseni yerel dosyaya inmedi');

  // Takılı kâğıdı SDK'dan okuyamıyoruz; boy uyuşmazsa yazıcı `SetLabelSizeError` döndürüyor
  // (ölçüldü 22.08: sürekli rulo W102 verildi, 4×6 kalıp kesim takılıydı → red). Aday boyları
  // sırayla deniyoruz; tutan boyun adı 23.7'de depo ayarına yazılacak ölçümdür.
  const candidates: Array<[string, BrotherSdk.BPQLLabelSize]> = printer.modelName.startsWith('QL-11')
    ? [
        ['DieCutW102H152', sdk.BPQLLabelSize.DieCutW102H152],
        ['DieCutW103H164', sdk.BPQLLabelSize.DieCutW103H164],
        ['RollW102', sdk.BPQLLabelSize.RollW102],
        ['RollW103', sdk.BPQLLabelSize.RollW103],
      ]
    : [
        ['RollW62', sdk.BPQLLabelSize.RollW62],
        ['DieCutW62H100', sdk.BPQLLabelSize.DieCutW62H100],
        ['DieCutW62H29', sdk.BPQLLabelSize.DieCutW62H29],
      ];

  const channel = { type: sdk.BPChannelType.WiFi, address: printer.address, modelName: printer.modelName };
  let lastError: unknown = null;
  for (const [name, labelSize] of candidates) {
    try {
      await sdk.BrotherPrinterSDK.printImage(asset.localUri, channel, { labelSize, autoCut: true, cutAtEnd: true });
      return name;
    } catch (err) {
      // Yalnız boy uyuşmazlığında sıradaki adaya geç; başka her arıza deneyin verisidir, fırlat.
      if (!String(err).includes('SetLabelSizeError')) throw err;
      lastError = err;
    }
  }
  throw new Error(`hiçbir etiket boyu tutmadı (denenen: ${candidates.map(([n]) => n).join(', ')}) — son: ${String(lastError)}`);
}
