/**
 * Sipariş referans numarası (03.11) — `LA-26-7K4M2P`.
 *
 * **Rastgeledir, sıralı değildir**: sıralı numara "bu yıl kaç sipariş aldınız"ı dışarıya sızdırır
 * (DATA_MODEL Kalıcı kararlar). Resmî fatura numarası DEĞİLDİR (`invoice_no` dış muhasebeden gelir).
 *
 * **İlk kalıcı duruma geçişte** üretilir — tam yolda `confirmed`, hızlı satışta `completed`
 * (bkz. `producesReferenceNo`). Sepet/draft numara almaz: terk edilen sepetler numara tüketmez.
 *
 * Saflık: üreteç rastgeleliği DIŞARIDAN alır — test aynı diziyi vererek biçimi doğrulayabilir.
 * Benzersizlik burada garanti EDİLEMEZ (DB işi): çağıran, unique ihlalinde yeniden üretir.
 */

/** Karışabilen karakterler yok: I/1, O/0, S/5, Z/2 çıkarıldı — telefonda okunabilir kalsın. */
const ALPHABET = '34679ACDEFGHJKLMNPQRTUVWXY';
const CODE_LENGTH = 6;

export interface ReferenceNoOptions {
  /** Marka öneki (varsayılan `LA` — Lezzet Anatolia). */
  prefix?: string;
  /** Siparişin yılı; iki hane kullanılır. */
  year: number;
  /** 0–1 arası rastgele üreteç — test edilebilirlik için enjekte edilir. */
  random?: () => number;
}

export function generateReferenceNo({ prefix = 'LA', year, random = Math.random }: ReferenceNoOptions): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const index = Math.floor(random() * ALPHABET.length) % ALPHABET.length;
    code += ALPHABET[index];
  }
  return `${prefix}-${String(year).slice(-2)}-${code}`;
}

/** Biçim doğrulaması — dışarıdan gelen referansın (destek talebi, WhatsApp mesajı) şekli doğru mu. */
export function isValidReferenceNo(value: string): boolean {
  return new RegExp(`^[A-Z]{2}-\\d{2}-[${ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}
