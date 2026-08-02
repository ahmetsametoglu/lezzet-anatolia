/**
 * Ekranların URL SÖZLEŞMESİ için ortak yardımcılar (denetim O7).
 *
 * Yedi `*-url.ts` dosyası aynı iki parçayı yeniden yazıyordu: `RawParams` tipi ve "diziyi tek
 * değere indir" fonksiyonu — biri Türkçe adıyla (`tekil`), altısı `one` diye. Aynı işin yedi
 * kopyası, adı bile ayrışmaya başlamış hâlde (CLAUDE.md §1).
 *
 * **Kapsam bilinçli olarak DAR:** yalnız ayrıştırmanın mekanik kısmı burada. Her ekranın sözleşmesi
 * (hangi parametre, hangi varsayılan, hangi kısaltma) kendi dosyasında kalır — onları da tek bir
 * "jenerik URL kuralı"na sıkıştırmak, okunması güç bir soyutlama üretir ve süzgeç eklemeyi
 * zorlaştırırdı. Tekrarı öldürülen şey mekanik, karar değil.
 *
 * Yüzeyden bağımsız (`lib/`): müşteri yüzeyi de aynı ayrıştırmayı yapıyor, oraya da açık.
 */

/** Next.js `searchParams`'ın ham biçimi — aynı anahtar birden çok kez gelebilir, o yüzden dizi. */
export type RawParams = Record<string, string | string[] | undefined>;

/**
 * Ham parametreyi tek değere indirir: `?tab=a&tab=b` → `'a'`, yok → `''`.
 *
 * İLKİ kazanır, sonuncusu değil: elle düzenlenen bir adreste tekrarlanan anahtar bir hatadır ve
 * hangisinin kazandığı sabit olmalı — "sonuncusu" seçilseydi aynı bağlantı, kopyalanırken sona
 * eklenen bir parametreyle sessizce başka bir ekran açardı.
 */
export function one(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
}

/**
 * Ham parametreyi TANIMLI bir değer kümesine indirger; uymayan değer varsayılana düşer.
 *
 * Bozuk ya da eski bir bağlantı ekranı KIRMAZ — bu, yedi dosyanın da tek tek yazdığı kuraldı
 * (`TABS.find((t) => t === raw) ?? DEFAULT`, 14 yerde). Sessiz düşüş burada doğrudur çünkü kayıp
 * bir süzgeçtir, veri değil; kapsam dışı DEPO süzgeci ise sessizce düşmez, kullanıcıya bildirilir
 * (depo ekseni kural 7 — o karar ekranın, bu yardımcının değil).
 */
export function oneOf<T extends string>(raw: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const value = one(raw);
  return allowed.find((item) => item === value) ?? fallback;
}
