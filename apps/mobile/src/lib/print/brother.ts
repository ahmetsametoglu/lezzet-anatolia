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
