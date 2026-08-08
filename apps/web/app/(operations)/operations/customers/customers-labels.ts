import type { B2bApplicationStatus } from '@lezzet/domain-core';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { CustomerType } from '@lezzet/types';
import type { CustomerRow } from './customers-types';

// Ekran metinleri ve renk anlamları — TEK yerde; liste, panel ve diyaloglar paylaşır. Kopyalansaydı
// iki yer aynı müşteriye farklı rozet yazabilirdi.
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
  if (row.b2bStatus === 'pending') return { label: 'Onay bekliyor', tone: 'amber' };
  // REDDEDİLEN başvuru amber DEĞİL, nötr: amber "senden karar bekliyorum" demek, oysa karar
  // verilmiş. Bir tur ikisi de amber "Onay bekliyor" görünüyordu — reddettiğin başvuru listede
  // hâlâ senden karar bekler gibi duruyordu (arka uç bildirimi 03.08). Rozet KALIYOR ama: hâli
  // hiç göstermemek, aynı kişi yarın yeniden başvurduğunda geçmişi görünmez kılardı.
  if (row.b2bStatus === 'rejected') return { label: 'Reddedildi', tone: 'neutral' };
  if (row.creditEnabled) return { label: 'Vadeli', tone: 'blue' };
  return { label: 'Aktif', tone: 'olive' };
}

/**
 * B2B başvurusunun DÖRT hâli, tek sözlükte — panel ve onay diyaloğu bunu paylaşır.
 *
 * `Record<B2bApplicationStatus, …>` olması bilinçli: motora yeni bir hâl eklendiği gün derleyici
 * burayı gösterir. Bir tur her iki ekran üçlü bir `? :` zinciriyle kendi cümlesini kuruyordu ve
 * ikisi de dördüncü hâli (reddedildi) hiç bilmiyordu.
 *
 * `highlight` = kutunun amber zeminle öne çıkması. YALNIZ `pending`'de: amber "senden karar
 * bekliyorum" demek; reddedilmiş bir başvuru bir iş değil, bir geçmiştir.
 */
export const B2B_STATUS_VIEW: Record<B2bApplicationStatus, { badge: string; tone: OpsTone; sentence: string; highlight: boolean }> = {
  none: {
    badge: 'Başvuru yok',
    tone: 'neutral',
    sentence: 'Başvuru kaydı yok; şirket olarak işaretli ama onay süreci hiç başlamamış.',
    highlight: false,
  },
  pending: {
    badge: 'Bekliyor',
    tone: 'amber',
    sentence: 'Onay bekliyor — toptan fiyat görmüyor, perakende fiyatla alışveriş yapıyor.',
    highlight: true,
  },
  approved: { badge: 'Onaylı', tone: 'olive', sentence: 'Onaylı — toptan fiyatları görüyor.', highlight: false },
  rejected: {
    badge: 'Reddedildi',
    tone: 'neutral',
    // Ret SİLMEZ: kayıt B2C olarak yaşamaya devam eder ve aday künyesini düzeltip yeniden
    // başvurabilir (o gün hâl `pending`'e döner, ret kaydı geçmiş olarak kalır).
    sentence: 'Reddedildi — kayıt B2C olarak duruyor. Aday künyesini düzeltip yeniden başvurabilir.',
    highlight: false,
  },
};

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
  if (row.b2bStatus === 'pending') return 'B2B başvurusu onay bekliyor — onaylanana dek toptan fiyat görmüyor';
  if (row.b2bStatus === 'rejected') return 'B2B başvurusu reddedildi — kayıt B2C olarak duruyor, perakende fiyatla alışveriş yapabiliyor';
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

/**
 * **GDPR silme sözlüğü** (09.10). Metin ekranda değil burada, çünkü söz verilen şeyin kendisi:
 * onay diyaloğunun ne kaldığını ve ne gittiğini SAYMASI gerekiyor.
 *
 * Liste kapının davranışından türedi, tahminden değil (`UserProfileService.anonymize`): fatura
 * kayıtları ve üstündeki ad-adres Fransız hukuku gereği kalır, ürün puanı kimliksizleşir ama
 * SİLİNMEZ — silinseydi bir müşterinin ayrılması başkalarının gördüğü ürün skorunu geriye dönük
 * değiştirirdi.
 */
export const GDPR_NOTES = {
  subtitle: 'Kişisel veriler boşaltılır, kayıt silinmez — sipariş geçmişi kimliksiz olarak durur.',
  irreversible:
    'Bu işlem geri alınamaz. Yanlış müşteriye uygulanırsa telafisi yoktur; aynı müşteriye ikinci kez uygulamak ise zararsızdır (silme tarihi ilk işlemde kalır).',
  removed:
    'Ad, telefon, e-posta, adres defteri, talep yazışmaları, bildirim istekleri, puan geçmişi, kişiye özel fiyat ve kuponlar, ürün yorumlarının metni. Giriş kapanır — müşteri bir daha oturum açamaz.',
  kept: 'Sipariş ve fatura kayıtları; faturanın üstündeki ad ve adres de kalır (Fransız hukuku faturanın bunları içermesini zorunlu kılıyor). Ürün puanı kalır ama kimliksiz.',
  /** Silinmiş kaydın listedeki ve panelindeki işareti — taslak müşteriyle karışmasın diye. */
  anonymized: 'Verileri silindi',
  /** Personel kaydında silme YOK: istihdam kaydı müşteri talebiyle silinmez (kapı da fırlatır). */
  staffBlocked: 'Personel kaydına GDPR silme uygulanmaz — istihdam kaydı müşteri talebiyle silinmez.',
} as const;
