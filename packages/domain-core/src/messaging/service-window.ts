/**
 * WhatsApp servis penceresi (15.1 zemini, 15.11 tüketicisi) — CHANNELS §6, ADR-005.
 *
 * Meta'nın kuralı: **müşteri yazdıktan sonra 24 saat boyunca** ona serbest metin gönderilebilir ve
 * bu ücretsizdir. Pencere kapandıktan sonra yalnız Meta-onaylı şablon (template) gidebilir ve
 * ücretlidir (pazarlama şablonu FR/DE'de ~€0,13–0,14; kategoriye göre değişir — `DOMAIN §11`).
 * "Önce müşteri yazsın" ilkesi doğrudan bu satırdan doğuyor.
 *
 * **Neden motorda, neden SQL'de değil:** pencerenin bitişi bir para kararının girdisidir ve tek
 * yerde durmalı. Süreyi RPC'ye de yazsaydık aynı kural iki dilde iki kopya olur, biri değiştiğinde
 * öteki sessizce eski kalırdı. Tablo yalnız SAKLAR (`conversation.window_expires_at`), hesaplamaz.
 *
 * **Yalnız GELEN mesaj pencere açar.** Giden mesajın pencereyi uzatması ilk bakışta zararsız
 * görünür ama sonucu şudur: ücretsiz mesajlaşma süresini kendi kendimize uzatmış oluruz, Meta
 * tarafında pencere çoktan kapanmıştır ve gönderim ya reddedilir ya da şablon ücretiyle geçer —
 * yani fatura sürpriz olur.
 */

import type { TemplateCategory } from '@lezzet/types';

/** Meta'nın kullanıcı-başlatan servis penceresi. Sabit; işletme ayarı DEĞİL — kuralı biz koymuyoruz. */
export const SERVICE_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Gelen mesajın açtığı pencerenin bitişi (ISO). Girdi mesajın anıdır, "şimdi" değil: adım 2'de
 * webhook gecikmeli düşebilir ve pencereyi işlediğimiz ana göre hesaplamak, Meta'nınkinden daha
 * geç biten bir pencere üretirdi — tam da göndermenin reddedileceği aralıkta "açık" görünürdü.
 */
export function serviceWindowExpiry(inboundAt: string | Date): string {
  const at = inboundAt instanceof Date ? inboundAt : new Date(inboundAt);
  return new Date(at.getTime() + SERVICE_WINDOW_HOURS * HOUR_MS).toISOString();
}

/**
 * Pencerenin ŞU ANKİ hâli — **ücret kararının tek kapısı**.
 *
 * `windowExpiresAt` yazılıyor ama okunmuyorsa, ölçülen ama kullanılmayan bir sayıdır: her gönderim
 * yeri "şablon mu, serbest metin mi" sorusunu kendi başına cevaplar ve biri mutlaka pencere AÇIKKEN
 * şablon gönderir — yani bedava olana para öder. Bu fonksiyon o sorunun tek cevabıdır.
 *
 * Üç durum var ve ikisi aynı sayıya düşer ama farklı şeylerdir:
 *   · `open: true`  — müşteri son 24 saatte yazdı. Serbest metin, ÜCRETSİZ.
 *   · `open: false` + `everOpened: true`  — pencere kapandı. Yalnız onaylı şablon, ÜCRETLİ.
 *   · `open: false` + `everOpened: false` — müşteri hiç yazmamış. Ortada bir konuşma yok; şablon
 *     ancak pazarlama izniyle gider (`opt_in`). "Kapandı" ile "hiç başlamadı" ayrı iki durumdur —
 *     ilki bir fırsatın kaçırılması, ikincisi henüz kurulmamış bir ilişkidir ve müdahaleleri farklı.
 */
export interface ServiceWindowState {
  open: boolean;
  /** Pencere hiç açıldı mı — yani müşteri bize bir kez olsun yazdı mı. */
  everOpened: boolean;
  /** Kapanmasına kalan süre (ms). Kapalıysa ya da hiç açılmamışsa `0`. */
  msRemaining: number;
}

export function serviceWindowState(windowExpiresAt: string | null | undefined, now: Date = new Date()): ServiceWindowState {
  if (!windowExpiresAt) return { open: false, everOpened: false, msRemaining: 0 };

  const remaining = new Date(windowExpiresAt).getTime() - now.getTime();
  // Damga varsa pencere bir zamanlar açılmıştır — kapanmış olması bunu değiştirmez.
  return { open: remaining > 0, everOpened: true, msRemaining: remaining > 0 ? remaining : 0 };
}

/**
 * Meta'nın **insan-temsilci** uzatması: Messenger/Instagram'da müşterinin son mesajından itibaren
 * 7 gün. Sabit; işletme ayarı DEĞİL — kuralı biz koymuyoruz (`developers.facebook.com` ·
 * *"Human Agent tag allows a business representative to manually respond to a person's messages
 * within a 7-day period"*).
 */
export const HUMAN_AGENT_WINDOW_DAYS = 7;

const DAY_MS = 24 * HOUR_MS;

/**
 * **İnsan-temsilci penceresinin hâli** — 24 saat kapandıktan SONRA da cevap yazılabilen aralık.
 *
 * ── NEDEN AYRI BİR PENCERE ──────────────────────────────────────────────────
 * Danışma kanalında (`CHANNELS §3b`) asıl sıkıntı şuydu: müşteri cuma akşamı yazar, cevap pazartesi
 * yazılır ve 24 saat çoktan geçmiştir. WhatsApp'ta bunun çaresi ücretli şablondur; Messenger/IG'de
 * ücret yok, **kural** var — mesaj "insan temsilci cevaplıyor" etiketiyle gider ve süre 7 güne çıkar.
 *
 * ── AYNI DAMGADAN TÜRER, İKİNCİ BİR ALAN YOK ────────────────────────────────
 * `window_expires_at` gelen mesajın anı + 24 saattir; yani mesajın anı o damgadan geriye
 * çıkarılabilir ve 7 günlük bitiş `+ 6 gün` demektir. İkinci bir kolon açmak aynı olguyu iki yerde
 * saklamak olurdu ve biri bir gün ötekini yalanlardı. Türetme burada, tek satırda ve künyeli.
 *
 * ── KANAL AYRIMI BURADA DEĞİL, ÇAĞIRANDA ────────────────────────────────────
 * Bu fonksiyon "7 gün geçti mi" sorusunu cevaplar, "bu kanalda geçerli mi" sorusunu değil. WhatsApp
 * için çağrılmamalı (orada karşılığı ücretli şablondur); kanal kararı `send.ts`in işi.
 */
export function humanAgentWindowState(
  windowExpiresAt: string | null | undefined,
  now: Date = new Date(),
): ServiceWindowState {
  if (!windowExpiresAt) return { open: false, everOpened: false, msRemaining: 0 };

  const inboundAt = new Date(windowExpiresAt).getTime() - SERVICE_WINDOW_HOURS * HOUR_MS;
  const remaining = inboundAt + HUMAN_AGENT_WINDOW_DAYS * DAY_MS - now.getTime();
  return { open: remaining > 0, everOpened: true, msRemaining: remaining > 0 ? remaining : 0 };
}

/**
 * **Bu şablon gönderilmeseydi de olur muydu** — yani bedava olana para mı ödendi?
 *
 * "Pencere açıkken şablon = israf" kestirmesi YANLIŞ ve fark kategoride:
 *
 *   · `marketing` — pencere açıkken aynı içerik serbest metinle ücretsiz giderdi. **İsraf.**
 *   · `utility`   — pencere içinde zaten ücretsiz ve ADR-005 onu orada ÖNERİYOR (sipariş onayı,
 *     kargo bildirimi). İsraf saymak, doğru davranışı uyarıyla cezalandırmak olurdu.
 *   · `authentication` — israf SAYILMIYOR ve bu bilinçli bir sınır: güvenlik kodunun şablonla
 *     gitmesi bir maliyet hatası değil bir teslim edilebilirlik kararıdır (biçim, kopyala düğmesi,
 *     tutarlı görünüm). Elimizde onu israf diye adlandıracak bir dayanak yok; olmayan bir dayanakla
 *     uyarı basmak, gerçek israfın da göz ardı edilmesine yol açar.
 *
 * Pencere kapalıyken hiçbir şablon israf değildir: alternatifi yok.
 */
export function isAvoidableTemplate(
  category: TemplateCategory | null | undefined,
  window: ServiceWindowState,
): boolean {
  return window.open && category === 'marketing';
}
