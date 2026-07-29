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

/**
 * Karışabilen karakterler yok: I/1, O/0, S/5, Z/2 çıkarıldı — telefonda okunabilir kalsın.
 *
 * Dışa açık, çünkü müşteriye okunacak her kod aynı alfabeyi kullanmalı (sipariş referansı, puan
 * kuponu…). İkinci bir alfabe tanımlamak, aynı kararı iki yerde tutmak olurdu.
 */
export const READABLE_ALPHABET = '34679ACDEFGHJKLMNPQRTUVWXY';
const ALPHABET = READABLE_ALPHABET;
const CODE_LENGTH = 6;

/**
 * Okunabilir rastgele kod. Benzersizlik burada garanti EDİLMEZ (DB işi): çağıran, unique
 * ihlalinde yeniden üretir. Rastgelelik dışarıdan alınır — test aynı diziyi verip biçimi
 * doğrulayabilsin.
 */
export function readableCode(length: number = CODE_LENGTH, random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return code;
}

export interface ReferenceNoOptions {
  /** Marka öneki (varsayılan `LA` — Lezzet Anatolia). */
  prefix?: string;
  /** Siparişin yılı; iki hane kullanılır. */
  year: number;
  /** 0–1 arası rastgele üreteç — test edilebilirlik için enjekte edilir. */
  random?: () => number;
}

export function generateReferenceNo({ prefix = 'LA', year, random = Math.random }: ReferenceNoOptions): string {
  return `${prefix}-${String(year).slice(-2)}-${readableCode(CODE_LENGTH, random)}`;
}

/** Biçim doğrulaması — dışarıdan gelen referansın (destek talebi, WhatsApp mesajı) şekli doğru mu. */
export function isValidReferenceNo(value: string): boolean {
  return new RegExp(`^[A-Z]{2}-\\d{2}-[${ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}
