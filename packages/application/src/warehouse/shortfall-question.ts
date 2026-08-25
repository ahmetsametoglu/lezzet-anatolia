import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderItemService, OrderService, TicketService } from '@lezzet/database';
import { variantNames } from './names';

/**
 * **"MÜŞTERİYE SORULSUN" — eksik kalemin sorusunu hazırlar** (10.3).
 *
 * ── NEDEN BİR TALEP, YENİ BİR SİPARİŞ DURUMU DEĞİL ──────────────────────────
 * Tasarım *"sipariş cevap-bekliyor durumuna geçer"* diyordu ve `OrderStatus`ta böyle bir hâl yok.
 * Eklenmedi, çünkü bu bir DURUM değil: sipariş hâlâ hazırlanıyor, yalnız bir kalemi bir cevabı
 * bekliyor. Durum makinesine hâl eklemek her ekranı, her rozeti ve her süzgeci ilgilendirir;
 * oysa soru bir yere DÜŞSÜN diye bir kuyruk zaten var — talepler (16).
 *
 * Şema da hazırdı: `TicketSource` `admin`i, `TicketType` `question`ı baştan taşıyor. Yani
 * işletmenin açtığı, siparişe ve kaleme bağlı bir soru için yeni kolon gerekmiyor.
 *
 * ── DEPOCU MÜŞTERİ İLETİŞİMİ GÖRMEZ, AMA İŞ KAYBOLMAZ ───────────────────────
 * Altın kural duruyor (`DOMAIN §2`): depocu ne müşteri adı, ne e-posta, ne tutar görür — bu kapı
 * da hiçbirini DÖNDÜRMEZ. Depocunun yaptığı tek şey *"bu sorulsun"* demek; soruyu kimin, hangi
 * kanaldan soracağı operasyonun işi (kullanıcı kararı 25.08: müşteriye otomatik mesaj GİTMEZ —
 * müşteri, bir insanın yazmadığı bir metni okumamalı; `16.4` kararının aynısı).
 *
 * ── GÖVDE TÜRKÇE YAZILIR, MÜŞTERİ KENDİ DİLİNDE OKUR ────────────────────────
 * Üç dilli bir sözlük yazılmadı ve gerekmiyor: talep mesajları gönderim anında çevriliyor
 * (`translateTicketMessageNow`, kullanıcı kararı 17.08). Operatör Türkçe yazar, müşteri
 * Fransızca görür — bu kapının gövdesi de aynı yoldan geçer.
 *
 * ── KAPI KARAR VERİR, YAZMAZ ────────────────────────────────────────────────
 * Talebin kendisi web katmanında açılıyor (`openTicket`). Buradaki iş kapsam kontrolü, eksiğin
 * gerçekten var olduğunun ölçülmesi ve sorunun metnini kurmak — üçü de iş kuralı, üçü de
 * uygulamanın sorusu.
 */

export type ShortfallQuestionOutcome =
  | {
      status: 'ok';
      /** Talebin açılacağı müşteri — YALNIZ kimlik; ad/e-posta/telefon bu kapıdan geçmez. */
      customerId: string;
      orderId: string;
      orderItemId: string;
      missingQty: number;
      subject: string;
      body: string;
    }
  /** Sipariş ya da kalem yok. */
  | { status: 'not_found' }
  /** Sipariş çağıranın deposunda değil — `confirmPreparation`'ın aynı kapsam kararı. */
  | { status: 'out_of_scope' }
  /**
   * Kalemde eksik YOK. Depocu ekranı yenilemeden basmış ya da arada mal toplanmış olabilir; soru
   * sorulacak bir şey kalmadığında talebi yine de açmak, müşteriye olmayan bir sorunu bildirmek
   * olurdu.
   */
  | { status: 'no_shortfall' }
  /**
   * Bu kaleme zaten açık bir soru var. İkinci talebi engelleyen tek şey buydu: düğmeye iki kez
   * basmak (ya da iki depocunun aynı kalemi görmesi) müşteriye AYNI soruyu iki kez sordururdu ve
   * ikisi ayrı kuyruk satırı olarak yaşardı.
   */
  | { status: 'already_asked'; ticketId: string };

export async function shortfallQuestion(
  db: SupabaseClient,
  input: {
    orderItemId: string;
    /** Depocunun çalıştığı depo — siparişinki değilse hiçbir şey döndürülmez (`CLAUDE §1`). */
    warehouseId: string;
  },
): Promise<ShortfallQuestionOutcome> {
  const item = await new OrderItemService(db).getById(input.orderItemId);
  if (!item) return { status: 'not_found' };

  const found = await new OrderService(db).getWithItems(item.orderId);
  if (!found) return { status: 'not_found' };
  if (found.order.warehouseId !== input.warehouseId) return { status: 'out_of_scope' };

  // Eksik = istenen − fiilen toplanan. Kapının kendi hesabı: çağıranın gönderdiği bir sayıya
  // güvenmek, ekranın bayat hâlini kayda geçirmek olurdu.
  const missingQty = item.qty - item.fulfilledQty;
  if (missingQty <= 0) return { status: 'no_shortfall' };

  const open = await new TicketService(db).findOpenByOrderItem(input.orderItemId);
  if (open) return { status: 'already_asked', ticketId: open.id };

  const names = await variantNames(db, [item.variantId]);
  const name = names.get(item.variantId);
  // Ad çözülemese de soru sorulabilmeli: adsız bir cümle, hiç sorulmamış bir sorudan iyidir.
  const label = name ? [name.productName, name.variantLabel].filter(Boolean).join(' · ') : 'Ürün';

  return {
    status: 'ok',
    customerId: found.order.customerId,
    orderId: item.orderId,
    orderItemId: item.id,
    missingQty,
    subject: `Siparişinizde eksik kalan ürün — ${label}`,
    // Metin MÜŞTERİYE hitap eder (talep onun ekranında da görünür) ve iki seçeneği açıkça sorar.
    // Tutar YOK: rol duvarı burada da geçerli ve müşterinin cevabı için de gerekmiyor — fark
    // iadesi kararı zaten 07.8'de, para tarafında veriliyor.
    body:
      `Merhaba, siparişinizi hazırlarken «${label}» ürününden ${missingQty} paket eksik kaldı. ` +
      'Kalanı olduğu gibi gönderelim mi, yoksa bu ürünü siparişten çıkaralım mı? ' +
      'Cevabınıza göre hemen ilerleyelim.',
  };
}
