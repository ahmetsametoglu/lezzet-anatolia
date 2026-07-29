import 'server-only';
import { ORDER_CHANGED_EVENT, orderChannelName } from './order-channel';

/**
 * Zili çalan taraf — **sunucu**. Websocket açmaz, tek HTTP çağrısı yapar: webhook saniyeler süren
 * bir istek, oraya bir soket kurup kapatmak masrafın ta kendisi olurdu.
 *
 * **Sessizce başarısız olur ve bu bilinçli.** Zil çalmazsa ekran biraz geç güncellenir; oysa
 * burada atılan bir hata ödeme webhook'unu düşürür ve Stripe olayı tekrar tekrar gönderir.
 * Bildirim, kaydın kendisinden asla daha önemli değildir (`transitionOrder` da aynı kuralla
 * bildirimi sarmalıyor).
 */
export async function broadcastOrderChanged(orderId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      /**
       * ⚠️ YÜK BOŞ KALIR — buraya alan EKLENMEZ. Bu bir üslup tercihi değil, kanalın güvenlik
       * dayanağıdır: kanal varsayılan olarak herkese açıktır (Realtime Authorization kapalı) ve
       * güvenliği "mesaj hiçbir şey söylemiyor" olgusuna dayanır. Duruma, tutara, müşteriye dair
       * tek bir alan eklendiği an kanal, adını tahmin edene karşı sızdıran bir uca dönüşür.
       *
       * İkinci gerekçe de aynı yöne bakıyor: durum burada yazsaydı tarayıcı sunucuya hiç sormadan
       * ekranı değiştirebilirdi — kaynağın tekliği o an kaybolurdu. Mesajın tek işi ZİL ÇALMAK.
       */
      body: JSON.stringify({ messages: [{ topic: orderChannelName(orderId), event: ORDER_CHANGED_EVENT, payload: {} }] }),
    });
  } catch {
    // Yutulur — yukarıdaki gerekçe.
  }
}
