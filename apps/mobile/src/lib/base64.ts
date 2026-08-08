/*
  BASE64 → BAYT — teslim kanıtının kovaya yüklenebilmesi için gereken TEK dönüşüm.

  ── NEDEN GEREKİYOR ─────────────────────────────────────────────────────────
  İmza uygulama içinde SVG olarak çiziliyor ama kovaya SVG YÜKLENEMEZ: kabul edilen uzantılar
  motorda sayılı (`domain-core/support/ticket-flow.ts` → jpg·jpeg·png·webp·heic) ve imzalı adres
  içerik türüne BAĞLIDIR — uyuşmazsa yükleme R2 tarafında reddedilir. `react-native-svg`in
  `toDataURL`ı tuvali PNG olarak verir ama BASE64 dizesi olarak verir; ağa giden ise ham bayttır.

  ── NEDEN ELDE YAZILDI ──────────────────────────────────────────────────────
  Ölçüldü (08.08): `atob` RN'in küresel sözlüğünde YOK, `Buffer` yok, `expo-file-system` kurulu
  değil. `base64-js` react-native'in KENDİ bağımlılığı olarak node_modules'ta duruyor ama o
  geçişli bir bağımlılıktır — doğrudan import etmek, bir gün RN onu bıraktığında sessizce kırılan
  bir bağ kurmak olurdu. Yeni bir paket eklemek ise dev-client'ı yeniden derletmeden çözülebilecek
  bir iş için lock dosyasını oynatmak demekti.

  Gövde saf ve testlidir: karar yok, dönüşüm var.
*/

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Karakter → 6 bitlik değer. Bir kez kurulur; her çağrıda dizede arama yapmak O(n·64) olurdu. */
const VALUE_OF = new Map<string, number>([...ALPHABET].map((char, index) => [char, index]));

/**
 * Standart base64 dizesini bayt dizisine çevirir. Dolgu (`=`) ve satır sonları yok sayılır.
 *
 * Tanınmayan karakterde SESSİZCE atlamaz, FIRLATIR: yarım çözülmüş bir görsel "yüklendi" diye
 * kovaya yazılır ve bunu ancak ihtilaf gününde öğrenirdik (CLAUDE §1 — belirtiyi susturan
 * düzeltme, arızayı gözden saklar).
 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\s=]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));

  let bitBuffer = 0;
  let bitCount = 0;
  let written = 0;

  for (const char of clean) {
    const value = VALUE_OF.get(char);
    if (value === undefined) throw new Error(`base64 dizesinde tanınmayan karakter: ${char}`);

    bitBuffer = (bitBuffer << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[written] = (bitBuffer >> bitCount) & 0xff;
      written += 1;
    }
  }

  return bytes;
}
