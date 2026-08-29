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
  Elimizdeki iki yazıcı iki ayrı rulo taşıyor (karar §1.6): QL-1110NWB 102 mm (4×6'nın yazıcısı),
  QL-820NWB 62 mm. Yanlış boy SDK'da hataya döner — boyu kanalın model adından seçiyoruz ki iğne
  deneyi iki yazıcıda da tek dokunuş olsun. Kalıcı ayar 23.7'de `settings`e taşınacak
  (`label_printer_*`, depo başına) — burada sabit DEĞİL, modelin fiziksel gerçeği.

  ── TEMBEL VE KORUMALI YÜKLEME ──────────────────────────────────────────────
  SDK importu yoklamanın (`hasPrinterNativeModule`) arkasında: modülsüz derlemede (bugünkü
  dev-client, jest) bu dosya yüklenebilir ama SDK'ya dokunulamaz — kamera dikişinin aynı deseni.
*/

export interface PrinterChannel {
  address: string;
  modelName: string;
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
  return channels.map((channel) => ({ address: channel.address, modelName: channel.modelName }));
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
 * ⚠ **Kâğıt uyuşmazlığı GERÇEK ve ölçülü** (tasarım §4.6): alınan gerçek etiket A6 yatay
 * (148×105 mm), elimizdeki rulo 103×164 mm — döndürülünce 2 mm taşıyor. Sürücü küçültürse
 * barkod da küçülür, yani **basılan barkod okutularak doğrulanmadan bu iş bitmiş sayılmaz.**
 * Kod bunu çözemez; kâğıt kararı fizikseldir.
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
 * **Gerçek etiket basımı** (23.7) — sunucunun ürettiği PNG dosyasını deponun ayarlı yazıcısına
 * basar. Boy AYARDAN gelir (`label_printer_label_size`, Depolar ekranı): takılı kâğıt SDK'dan
 * okunamıyor, yanlış boy `SetLabelSizeError` (23.5 ölçümü) — burada deneme listesi YOKTUR, ayar
 * doğruyu söylemekle yükümlü; hata çağırana fırlar ve ekran cümleyi gösterir.
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
