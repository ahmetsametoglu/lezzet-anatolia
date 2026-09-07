import { PreferredLanguageEnum, type PreferredLanguage, type SourceLanguage } from '@lezzet/types';

/**
 * **Müşteriyle hangi dilde konuşuruz** (15.28) — saf karar, DB yok (`STACK §4`).
 *
 * ── SORUN ──────────────────────────────────────────────────────────────────
 * Operatör de ajan da TÜRKÇE yazar (operasyon yüzeyi tek dilli, `CLAUDE §2`; ajanın kuralı
 * `ticket-support` künyesinde). Talep kanalında bu sorun değildi: müşteri sitede okur ve site
 * kendi dilini bilir — çeviri torbasından o dili seçer. Sohbette ise müşteriye TEK bir metin
 * GÖNDERİLİR ve hangi dilde gönderileceğine bizim karar vermemiz gerekir. Karar buradadır.
 *
 * ── ÜÇ BASAMAKLI YEDEK ZİNCİRİ, SIRASI BİLİNÇLİ ─────────────────────────────
 *   1. **Konuşmanın dili** — müşterinin bu sohbette en son hangi dilde yazdığı. En güçlü kanıt:
 *      insan neyle yazıyorsa onunla okur.
 *   2. **Profil tercihi** — hesabındaki `preferred_language`. Daha zayıf: kayıtta operatör
 *      doldurmuş ya da varsayılanda kalmış olabilir; ama "hiç yazmadı"dan iyidir.
 *   3. **Piyasa varsayılanı** — hiçbir şey bilinmiyorsa. Değeri BU MOTOR SEÇMEZ, çağıran verir:
 *      site dilinin varsayılanı `@lezzet/i18n`de duruyor ve motor o pakete bakamaz (bağımlılık tek
 *      yönlü). İkinci bir "fr" sabiti yazmak, aynı kararın iki kopyası olurdu.
 *
 * Ters sıra (profil önce) YANLIŞ olurdu: Türk bir müşteri profilinde `fr` ile kayıtlıyken sohbette
 * Türkçe yazarsa ona Fransızca cevap giderdi — tam da çeviri katmanının önlemek için kurulduğu şey.
 *
 * ── DAYANAK DA DÖNER ───────────────────────────────────────────────────────
 * Operatör cevabını Türkçe yazıp Fransızca gönderildiğini görecek; hangi dile ve NEDEN gittiğini
 * bilmeli ("son mesajından" mı, "profilinden" mi, "varsayılan" mı). Varsayılana düşen bir sohbet,
 * operatörün dikkat etmesi gereken bir sohbettir — müşteri belki hiç yazmadı.
 */

export type OutboundLanguageBasis = 'conversation' | 'customer' | 'default';

export interface OutboundLanguage {
  language: PreferredLanguage;
  /** Kararın dayanağı — ekran bunu yazar; varsayılana düşmüş sohbet ayrıca dikkat ister. */
  basis: OutboundLanguageBasis;
}

export function outboundLanguage(
  conversation: { language: PreferredLanguage | null },
  customer: { preferredLanguage: PreferredLanguage } | null,
  fallback: PreferredLanguage,
): OutboundLanguage {
  if (conversation.language) return { language: conversation.language, basis: 'conversation' };
  if (customer) return { language: customer.preferredLanguage, basis: 'customer' };
  return { language: fallback, basis: 'default' };
}

/**
 * Tespit edilen kaynak dil konuşmanın diline YAZILABİLİR mi — yalnız konuştuğumuz üç dilden biriyse.
 *
 * Çeviri motoru serbest ISO kodu döndürür (`bs`, `en`, `und`…); konuşmanın dili ise bizim
 * KONUŞTUĞUMUZ dillerden biri olmak zorunda — Boşnakça yazan müşteriye Boşnakça cevap üretemeyiz.
 * "ok" gibi tek kelimelik bir mesaj `en` diye tespit edilirse konuşma dili değişmez; son bilinen
 * kalır. Hiçbir şey bilinmiyorsa `null` — sıfır ya da varsayılan değil, "bilinmiyor".
 */
export function spokenLanguageOf(detected: SourceLanguage | null | undefined): PreferredLanguage | null {
  const parsed = PreferredLanguageEnum.safeParse(detected);
  return parsed.success ? parsed.data : null;
}

/**
 * Bir sohbet mesajının ÇEVRİLECEK (ve okunacak) metni: sesli mesajda transkript, ötekilerde gövde
 * (fotoğrafın alt yazısı dahil). Aynı anda ikisi olmaz — WhatsApp'ta sesin alt yazısı yok.
 * `null` = çevrilecek/gösterilecek metin yok (yazısız fotoğraf, çözülememiş ses).
 *
 * Motorda, çünkü üç tüketicisi var (gelişteki çeviri · kuyruk · operasyon ekranı) ve "transkript
 * alt yazıyı yener" kuralı bir kez yazılmalı.
 */
export function translatableTextOf(message: { text: string | null; transcript: string | null }): string | null {
  return message.transcript?.trim() || message.text?.trim() || null;
}
