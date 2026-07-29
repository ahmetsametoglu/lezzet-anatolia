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
 * Kriptografik rastgelelik — **varsayılan üreteç budur, `Math.random` DEĞİL.**
 *
 * Gerekçe tek bir kodda değil, kodların ORTAKLIĞINDA: sipariş referansı, puan kuponu ve davet
 * token'ı aynı üreteci paylaşıyor. `Math.random` (V8'de xorshift128+) kriptografik değildir; kendi
 * sipariş referansını ve kupon kodunu gören biri üretecin iç durumunu geri çıkarıp **sonraki
 * token'ları öngörebilir**. Davet token'ı oturum yerine geçtiği için bu, başkasının siparişini
 * okumak demektir.
 *
 * `crypto` global'dir (Node 19+ ve tarayıcı) — import gerekmez, motorun saflığı bozulmaz.
 */
function secureRandom(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0]! / 2 ** 32;
}

/**
 * Okunabilir rastgele kod. Benzersizlik burada garanti EDİLMEZ (DB işi): çağıran, unique
 * ihlalinde yeniden üretir. Rastgelelik enjekte edilebilir — test aynı diziyi verip biçimi
 * doğrulayabilsin; **varsayılan daima kriptografiktir** (test kolaylığı bir güvenlik ödünü olamaz).
 */
export function readableCode(length: number = CODE_LENGTH, random: () => number = secureRandom): string {
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
