/**
 * WhatsApp servis penceresi (15.1 zemini, 15.11 tüketicisi) — CHANNELS §6, ADR-005.
 *
 * Meta'nın kuralı: **müşteri yazdıktan sonra 24 saat boyunca** ona serbest metin gönderilebilir ve
 * bu ücretsizdir. Pencere kapandıktan sonra yalnız Meta-onaylı şablon (template) gidebilir ve
 * ücretlidir (~€0,13 FR/DE). "Önce müşteri yazsın" ilkesi doğrudan bu satırdan doğuyor.
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
