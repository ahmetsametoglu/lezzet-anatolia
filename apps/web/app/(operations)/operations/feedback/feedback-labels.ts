import type { PointsReason } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';

// Geri Bildirim ekranının sözlüğü — sayı → insan dili. Tasarımın kuralı (§6): iç terim yok.
// "swipe", "dwell", "redemption", "sinyal ağırlığı katsayısı" arayüzde geçmez.

/**
 * GÜVENİLİRLİK — `CandidateSignal.trust` (0–1) → operatörün okuyacağı kelime.
 *
 * Sayının kendisi gösterilmez ve bu bilinçli: "0,62 güven" bir operatöre hiçbir şey söylemez, üstüne
 * yanlış bir kesinlik hissi verir. Üç kova yeter çünkü karar da üç türlü: bu adayı getir · biraz
 * daha bekle · bu sayıya güvenme.
 *
 * **Eşikler burada, motorda değil.** Motor ağırlığı hesaplar (`signal-quality`), "yüksek sayılır mı"
 * bir SUNUM kararıdır — pano yarın dört kova isterse motor değişmemeli.
 */
const TRUST_STEPS = [
  { min: 0.7, label: 'yüksek', tone: 'olive' as OpsTone },
  { min: 0.4, label: 'orta', tone: 'neutral' as OpsTone },
  { min: 0, label: 'düşük', tone: 'amber' as OpsTone },
];

export function trustLabel(trust: number): { label: string; tone: OpsTone } {
  const step = TRUST_STEPS.find((s) => trust >= s.min) ?? TRUST_STEPS[TRUST_STEPS.length - 1]!;
  return { label: step.label, tone: step.tone };
}

/**
 * YILDIZIN RENGİ — çizimin `scoreFg`'si: ≥4 olive · 3 amber · altı kırmızı.
 *
 * Renk burada süs değil sıra: moderatör kuyruğu tararken önce kötü puanlı yorumu okumalı, çünkü
 * karar gerektiren o. Sabit renkte hepsi aynı ağırlıkta görünüyordu.
 */
export function ratingTone(rating: number | null): string {
  if (rating === null) return 'text-ops-muted';
  if (rating >= 4) return 'text-ops-olive-dark';
  return rating >= 3 ? 'text-ops-amber-dark' : 'text-ops-red-dark';
}

/**
 * Beğeni sayısının işaretli gösterimi — "+184", "−12".
 *
 * İşaret ŞART: pano hem sevileni hem sevilmeyeni taşıyor ve "12" ile "−12" arasındaki fark, ürünü
 * getirmekle getirmemek arasındaki farktır. `Intl` kullanılmıyor çünkü bu bir para/ölçü değil, bir
 * oy farkı — binlik ayracı burada gürültü olurdu.
 */
export function signedCount(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Moderasyon kartının alt satırı — kararın SONUCUNU söyler, kuralı değil.
 *
 * Üç yığın üç ayrı cümle ister: bekleyende "onaylarsan ne olur", yayındakinde "geri çekersen ne
 * olur", reddedilende "bu kayıt nerede duruyor". Tek cümle yazılsaydı yayındaki bir yorumun altında
 * "onaylanınca görünür" derdi — okuyanı yanıltan bir doğru.
 */
export const STACK_HINTS: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'Onaylanınca ürün sayfasında görünür · metin düzenlenmez',
  approved: 'Ürün sayfasında yayında · geri çekilirse görünmez olur',
  rejected: 'Yayınlanmadı · yeniden onaylanabilir',
};

/**
 * PUAN HAREKETİNİN SEBEBİ — defter anahtarı → operatörün okuyacağı cümle.
 *
 * Tasarımın kuralı (§6): iç terim yok. Defter `feedback_candidate` yazar, ekran "keşifte kaydırdı"
 * der. `Record<PointsReason, …>` olması şart: sözlük kapalı liste ve dokuzuncu bir sebep eklendiği
 * gün karşılığını yazmayı unutmak derlemede durur — enum'ın yanına sözlük koymanın bütün amacı bu.
 *
 * Cümleler MÜŞTERİNİN yaptığı işi anlatıyor ("yorum yazdı"), sistemin yaptığını değil ("puan
 * verildi"): operatör listeye "bu kişi ne yapmış" diye bakıyor.
 */
export const POINTS_REASON_LABELS: Record<PointsReason, string> = {
  review: 'yorum yazdı',
  feedback_purchase: 'aldığını değerlendirdi',
  feedback_candidate: 'keşifte kaydırdı',
  order: 'sipariş verdi',
  referral: 'yeni müşteri getirdi',
  // İki davet, iki ayrı cümle — operatör "hangisi" diye sormamalı: getiren yeni bir MÜŞTERİ
  // kazandırdı, komşu var olan bir SEFERE sipariş ekletti (17.10).
  neighbor: 'komşusunu sefere çağırdı',
  visit: 'günlük ziyaret',
  redemption: 'kupona çevirdi',
  manual: 'elle düzeltme',
};
