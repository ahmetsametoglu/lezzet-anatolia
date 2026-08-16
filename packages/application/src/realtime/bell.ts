import { createHash } from 'node:crypto';
import { BELL_EVENT } from './bell-event';

/*
  CANLI ZİL — **kapı zili, veri borusu değil** (16.8).

  Kaynağı `apps/web/lib/realtime/broadcast.ts`in sipariş ziliydi; buraya TERFİ etti çünkü zili çalan
  taraf artık üç ayrı süreç: operasyon web'i, mobil arka uç (`apps/mobile-api` — müşteri mobilden
  yazınca) ve zamanlanmış işler (`apps/backend` — AI cevabı). Üçü de aynı HTTP çağrısını yapacaktı;
  ikinci bir kopya yazmak, bir gün birinin başlığını değiştirip ötekini unutmak demekti (CLAUDE §1).

  ── NEDEN `postgres_changes` DEĞİL ──────────────────────────────────────────
  Projede RLS yok; her okuma sunucuda service-role ile yapılıyor (STACK §6). Tarayıcıyı `ticket` ya
  da `ticket_message` tablosuna abone etmek o duvarda ilk delik olurdu — tablo yayına açılır, satır
  güvenliği yazmak zorunda kalırdık ve tek bir yanlış politika bütün müşteri yazışmasını açardı.
  Broadcast'te tablo hiç görünmez: sunucu boş bir "değişti" mesajı atar, tarayıcı duyunca sayfayı
  SUNUCUDAN yeniden ister. Veri yine tek kapıdan çıkar ve kimin neyi görebileceğine yine guard karar
  verir.

  ── YÜK DAİMA BOŞ ───────────────────────────────────────────────────────────
  Realtime Authorization kapalı: kanal, adını bilen herkese açık. Güvenliğin dayanağı "mesaj hiçbir
  şey söylemiyor" olgusudur. Yüke tek bir alan (talep kimliği, müşteri adı, mesaj metni) eklendiği
  an kanal, adını ele geçirene karşı sızdıran bir uca dönüşür. İkinci gerekçe aynı yöne bakar: durum
  mesajda yazsaydı tarayıcı sunucuya hiç sormadan ekranı değiştirebilirdi — kaynağın tekliği o an
  kaybolurdu.
*/

// Olay adı komşu dosyada ve gerekçesi orada: dinleyen taraf tarayıcıdır, bu dosya ise `node:crypto`
// ve service-role anahtarı taşır — istemci paketine girmemeli.
export { BELL_EVENT } from './bell-event';

/**
 * Zili çalar. **Websocket açmaz, tek HTTP çağrısı yapar:** çağıran bir server action ya da Hono
 * isteği; oraya bir soket kurup kapatmak masrafın ta kendisi olurdu.
 *
 * **Sessizce başarısız olur ve bu bilinçli.** Zil çalmazsa ekran biraz geç güncellenir (operatör
 * zaten sayfayı yenileyebilir); oysa buradan fırlayan bir hata müşterinin AZ ÖNCE KAYDEDİLMİŞ
 * mesajını "gönderilemedi" gösterir ve ikinci kez yazdırırdı. Bildirim, kaydın kendisinden asla
 * daha önemli değildir (`broadcastOrderChanged`ın ve `runEffect`in aynı kararı).
 */
export async function ringBell(channel: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      // ⚠️ `payload` BOŞ KALIR — yukarıdaki "yük daima boş" gerekçesi. Buraya alan eklenmez.
      body: JSON.stringify({ messages: [{ topic: channel, event: BELL_EVENT, payload: {} }] }),
    });
  } catch {
    // Yutulur — yukarıdaki gerekçe.
  }
}

/**
 * Operasyon kuyruklarının kanal adı — **tahmin edilemez olmalı.**
 *
 * Sipariş zilinin adı siparişin UUID'siydi: tahmin edilemez, çünkü ortada doğal bir sır vardı.
 * Operasyon kuyruğunun böyle bir kimliği yok; `ops:tickets` yazsaydık anon anahtarı olan herkes
 * (anahtar istemci paketinde, yani herkes) abone olup "müşteri desteğine şu an mesaj düştü" ZAMAN
 * BİLGİSİNİ okuyabilirdi. İçerik sızmazdı ama trafik sızardı.
 *
 * Bu yüzden ad sunucudaki sırdan TÜRETİLİR: tek yönlü özet, anahtarı geri vermez. Adı yalnız guard'ın
 * arkasındaki sayfa öğrenir (sunucu bileşeni prop olarak geçirir) — yani zaten kuyruğu görmeye
 * yetkili olan taraf.
 *
 * Sır yoksa (test, env'siz koşu) sabit bir ada düşer: `ringBell` zaten sırsız çalmıyor, ortada
 * dinlenecek bir kanal da olmuyor.
 */
function opsChannel(name: string): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return `ops:${name}:local`;
  return `ops:${name}:${createHash('sha256').update(`${secret}:${name}`).digest('hex').slice(0, 16)}`;
}

/**
 * Talep kuyruğunun zili — **tek kanal, iki iş.** Operasyon Talepler ekranı kuyruğu VE seçili
 * yazışmayı tek sunucu render'ında çiziyor (`?t=` adreste), yani "liste değişti" ile "açık yazışmaya
 * mesaj geldi" ayrı iki zil istemiyor: ikisinin de cevabı aynı `router.refresh()`.
 *
 * Talep başına ayrı kanal AÇILMADI ve bu bilinçli: operatör kuyruğu izlerken hangi talebe mesaj
 * geleceğini bilmiyor, yani hepsine birden abone olmak gerekirdi — yüzlerce kanal, tek bir
 * "yenile" için.
 */
export function ticketsChannelName(): string {
  return opsChannel('tickets');
}

/** Talep tarafında bir şey değişti — kuyruğu izleyen operatör ekranı sunucudan yeniden istesin. */
export async function ringTicketsBell(): Promise<void> {
  await ringBell(ticketsChannelName());
}

/**
 * WhatsApp kuyruğunun zili — **talep ziliyle AYNI kanal değil ve bilerek.** İki ekran ayrı
 * kuyruklar: her müşteri mesajında WhatsApp ekranını da tazelemek, o an konuşmayı okuyan operatörün
 * altından sayfayı çekmek olurdu. Ayrı kanal, ayrı sebep.
 */
export function conversationsChannelName(): string {
  return opsChannel('conversations');
}

/** WhatsApp tarafında bir şey değişti (bugün: AI taslağını cron yazdı). */
export async function ringConversationsBell(): Promise<void> {
  await ringBell(conversationsChannelName());
}
