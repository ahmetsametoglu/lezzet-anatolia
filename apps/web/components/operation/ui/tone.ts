/**
 * Operasyon anlam renkleri — KAPALI liste, tek kaynak. Renk burada anlam taşır:
 * olive=yolunda, amber=dikkat/karar, red=hata/gecikme, blue=onay/aday, slate=ölçüm/nötr kayıt,
 * violet=MAKİNE konuştu (AI), neutral=kapalı/nötr.
 *
 * Yalnız SÖZLÜK ortaktır; her komponent onu kendi sınıflarına çevirir (rozet zemin+metin ister,
 * çok durumlu anahtar yalnız metin) — tek bir sınıf haritasını iki farklı işe zorlamak yerine.
 *
 * **`violet` neden ayrı bir anlam:** öteki tonlar bir DURUMU söylüyor (yolunda, dikkat, hata);
 * mor ise KİMİN konuştuğunu. Talepler ekranında AI'ın yazdığı mesaj insanınkinden ayırt edilmek
 * zorunda (`admin-talepler.md §6`: *"AI'nın yanıtları admin'e 'kendi yazmış' gibi gösterilmez"*) ve
 * bu bir durum ayrımı değil, fail ayrımı. Token'ları `globals.css`'te 27.07'den beri duruyordu
 * (`--color-ops-violet…`); sözlüğe girmediği için bir tur boyunca kullanılamadı ve o ekran yanlışlıkla
 * `slate` ile çizildi — sözlük kapalı bir liste olduğu için, palete eklenen renk buraya da girmeli.
 */
export type OpsTone = 'neutral' | 'olive' | 'amber' | 'red' | 'blue' | 'slate' | 'violet';

/**
 * Tahsilat durumunun RENK anlamı — sipariş ekranı, müşteri paneli ve sipariş özeti diyaloğu için TEK
 * kaynak. Etiketler burada değil (`PAYMENT_STATUS_LABELS`, `packages/types`); burada yalnız renk var.
 *
 * İki tanım vardı ve üç dalı aynı, biri farklıydı: sipariş ekranı gecikmiş vadeyi KIRMIZI çiziyor,
 * müşteri paneli o dalı hiç bilmiyordu. Fark bir karar değil, ikinci kez yazmanın sonucuydu — ve
 * gecikme tam da müşteri panelinde saklanmaması gereken şey.
 *
 * `overdue` AYRI bir girdi, `status`'ün bir değeri değil: vadesi geçmiş bir sipariş hâlâ "bekliyor"
 * durumundadır — gecikme durumun kendisi değil, zamanın ona kattığı şeydir. Bilinmediği yerde
 * varsayılan `false`: "vadesi geçti mi" sorusunun cevabı yoksa kırmızı yazmak uydurma olurdu.
 */
export function paymentTone(status: 'pending' | 'partial' | 'paid' | 'refunded', overdue = false): OpsTone {
  if (overdue) return 'red';
  if (status === 'paid') return 'olive';
  // Kapanmış kayıt (`refunded`) nötr: bekleyen iş değil.
  if (status === 'refunded') return 'neutral';
  // Kısmi ve bekleyen İKİSİ DE dikkat ister ama aynı şey değil; ayrımı etiket taşır, renk "bak" der.
  return 'amber';
}
