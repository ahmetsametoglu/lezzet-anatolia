import type { SHARED_ERROR_KEYS } from './customer-error';

/**
 * **Hata anahtarının ekrandaki karşılığı** — `lib/customer-error`in istemci yüzü (denetim H1/H2).
 *
 * Sunucu ANAHTAR döner, cümleyi ekran kurar; kuran satır ise her ekranda birebir aynıydı
 * (`t.errors[key] ?? t.errors.unexpected`). Yedi yerde kopyalanacaktı ve kopyaların biri bir gün
 * `unexpected` yedeğini unutacaktı — o ekran, tanımadığı bir anahtarda müşteriye BOŞ bir hata
 * satırı gösterirdi. Tek satırlık bir işin bile tek yeri olur (CLAUDE.md §1).
 *
 * Eşi `server-only` olduğu için ayrı dosyada: bu fonksiyon istemci komponentlerinden çağrılıyor ve
 * oradan `customer-error`ü import etmek paketleyici hatası verirdi.
 *
 * Sözlük sayfanın kendi `messages.json`'undan gelir — `unexpected` ve `session_expired` her
 * sözlükte ZORUNLUDUR (`SHARED_ERROR_KEYS`).
 */
export function errorText(errors: CustomerErrorMessages, key: string | null): string {
  // `||` bilinçli, `??` değil: sözlükte var ama BOŞ bir anahtar da jenerik cümleye düşmeli —
  // ekranda hiçbir hâlde boş bir kırmızı satır durmaz.
  return (key && errors[key]) || errors.unexpected;
}

/**
 * Zorunlu anahtarlar AYRI yazılıyor, indeksin içinde değil: yalnız `Record<string, string>` olsaydı
 * `noUncheckedIndexedAccess` altında yedeğin kendisi de `undefined` olabilirdi — yani "her hâlde
 * bir cümle" sözünü tip düzeyinde veremezdik.
 *
 * Liste `SHARED_ERROR_KEYS`ten TÜRETİLİR, elle yazılmaz: sözleşme sunucu tarafında duruyor
 * (`unexpected` · `session_expired`) ve iki yerde yazılsaydı biri yeni bir zorunlu anahtar öğrenip
 * öteki öğrenmezdi. Tip-import: kaynak `server-only`, ama tip bağları derlemede silinir.
 */
type CustomerErrorMessages = Record<(typeof SHARED_ERROR_KEYS)[number], string> & Record<string, string>;
