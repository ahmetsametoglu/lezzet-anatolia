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
