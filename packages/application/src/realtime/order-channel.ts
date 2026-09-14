/**
 * Bir siparişin canlı kanalının ADI — kapı zili, veri borusu değil (gerekçenin tamamı web künyesinde:
 * `apps/web/lib/realtime/order-channel.ts`).
 *
 * **Neden burada (07.18):** zili artık yalnız web'in Stripe webhook'u çalmıyor — arka ucun 30 dakikalık
 * zamanlayıcısı da ödemesi netleşen taslakta çalıyor. Ad iki yerde yaşarsa biri değişince zil sessizce
 * çalmaz olur; olay adının (`bell-event`) 16.8'deki dersi. Dosya bilerek bağımlılıksız: tarayıcıdaki
 * dinleyici de bu alt yoldan okuyor.
 */
export function orderChannelName(orderId: string): string {
  return `order:${orderId}`;
}
