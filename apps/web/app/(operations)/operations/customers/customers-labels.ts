import type { OpsTone } from '@/components/operation/ui/tone';
import type { CustomerType } from '@lezzet/types';
import type { CustomerRow } from './customers-types';

// Ekran metinleri ve renk anlamları — TEK yerde, iki cihaz görünümü paylaşır. Kopyalansaydı mobil ve
// web aynı müşteriye farklı rozet yazabilirdi.
//
// Renk ANLAM taşır (envanter §0): olive=yolunda · amber=dikkat/karar bekliyor · mavi=bilgi ·
// gri=pasif/kapanmış. Rozet seçerken sorulan soru "hangisi güzel" değil, "operatör bunu görünce ne
// yapmalı".

/** Satırın tek cümlelik durumu. Sıra ÖNEMLİ: en çok iş isteyen hâl kazanır. */
export function statusOf(row: CustomerRow): { label: string; tone: OpsTone } {
  // GECİKME en üstte ve KIRMIZI: para bekliyor. Tasarımın `stMap.gecik` hâli. Vade rozetinin altında
  // kalsa gecikmiş müşteri "Vadeli" (mavi, yolunda) görünürdü — tam tersi bir mesaj.
  if (row.hasOverdue) return { label: 'Gecikmiş', tone: 'red' };
  // Taslak: birleştirilmesi gereken bir kopya kayıt. Tonu NÖTR — amber "dikkat/karar" demek, taslak
  // ise pasif bir hâl (tasarım da gri veriyor).
  if (row.isDraft) return { label: 'Taslak', tone: 'neutral' };
  // Onay bekleyen B2B: toptan fiyatı göremiyor, yani müşteri fiilen kapıda bekliyor → amber.
  if (row.b2bApproved === false) return { label: 'Onay bekliyor', tone: 'amber' };
  if (row.creditEnabled) return { label: 'Vadeli', tone: 'blue' };
  return { label: 'Aktif', tone: 'olive' };
}

/**
 * Müşteri TİPİNİN rengi — envanter O6: "ince çip kanal — B2B amber / B2C olive".
 *
 * Nötr gri DEĞİL: kanal bu ekranda bir bilgi taşıyor (toptan mı perakende mi) ve rengi olmayan bir
 * rozet listeyi tarayan gözün hiç kullanmadığı bir rozet olur.
 */
export function typeTone(type: CustomerType): OpsTone {
  return type === 'company' ? 'amber' : 'olive';
}

/**
 * Rozetin AÇIKLAMASI — `title` olarak geçer. Rozet kısa olmak zorunda, ama "Onay bekliyor" ne
 * demek olduğunu kendi başına söylemiyor: toptan fiyatın kapalı olduğunu bilmek gerek.
 */
export function statusHint(row: CustomerRow): string {
  if (row.hasOverdue) return 'Vadesi geçmiş açık borcu var — checkout\'ta vadeli seçenek otomatik kapalı';
  if (row.isDraft) return 'WhatsApp telefonuyla kendiliğinden açılmış kayıt — eksik bilgili, birleştirme adayı';
  if (row.b2bApproved === false) return 'B2B başvurusu onay bekliyor — onaylanana dek toptan fiyat görmüyor';
  if (row.creditEnabled) return 'Vade yetkisi açık — hesaba (vadeli) sipariş verebilir';
  return 'Olağan müşteri: peşin ödeme, vade yetkisi kapalı';
}

/**
 * Ödeme durumunun RENK anlamı — kendi tanımı YOK, ortak kapıya bağlı (`ui/tone.ts`).
 *
 * İkinci bir tanım vardı ve sipariş ekranınınkinden bir dal eksikti: gecikmiş vade orada kırmızı,
 * burada değildi. Etiketler de burada değil: `PAYMENT_STATUS_LABELS` `packages/types`'ta, enum'ın
 * yanında (kopyalandığı tur ayrışmıştı — `completed`: "Kapandı" ↔ "Tamamlandı").
 *
 * Bu ekranın satırları gecikmeyi TAŞIMIYOR (`CustomerOrderRow` bir sipariş özeti, vade defteri
 * değil), o yüzden varsayılan `false` ile çağrılıyor — gecikme bilgisi listede ayrı bir rozetle
 * (`hasOverdue`) zaten söyleniyor.
 */
export { paymentTone } from '@/components/operation/ui/tone';
