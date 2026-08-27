import type { SupabaseClient } from '@supabase/supabase-js';
import { UserProfileService } from '@lezzet/database';
import { revokeSelfReferralOnMerge } from '../feedback/points';

/**
 * **Müşteri birleştirmenin tek kapısı** (04.7 · 09.10) — RPC'yi doğrudan çağırma, buradan geç.
 *
 * `merge_customers` (0040) satırları taşıyan atomik işlemdir ve işini eksiksiz yapar; ama
 * birleşmenin bir sonucu daha var ve o SQL'de yapılamıyor: **kendi kendini getirmiş hâle gelen
 * kaydın getiren ödülünü geri almak.** Geri alma bakiyeye göre kırpılıyor (borç yazılmaz) ve o
 * kural TypeScript'te yazılı — SQL'de ikinci nüshasını açmak, bu depoda tekrar tekrar düzelttiğimiz
 * "kaldırılamayan nüsha" sorununu gönüllü olarak yaratmak olurdu (`STACK §13`).
 *
 * ── KAPSAM SORUSU ZATEN ÖDÜLÜN KİMLİĞİNDE — İKİNCİ BİR KOŞUL YAZILMADI ──────
 * İlk yazımda buraya *"kaynağı hedef mi davet etmiş"* diye bir `referred_by` kontrolü kondu; sonra
 * ölçüldü ve **gereksiz olduğu çıktı**: getiren ödülünün kimliği `(müşteri = getiren, kaynak =
 * getirilen)` üçlüsüdür, yani `(hedef, 'referral', kaynak)` satırının VARLIĞI zaten "hedef,
 * kaynağı getirmiş" demektir. `referred_by`e ayrıca sormak aynı soruyu iki kez sormaktı ve iki
 * nüsha bir gün ayrışırdı. Kaldırıldı — koşul silinince testlerin beşi de geçmeye devam etti, ki
 * kanıtı budur. Gerçek bir üçüncü kişi getirmişse ödül o kişinin satırındadır; buradaki arama
 * hedefin satırlarına bakar ve hiçbir şey bulmaz, dolayısıyla ödül kendiliğinden DURUR.
 *
 * ── GERİ ALMA İŞLEMİ DURDURMAZ ──────────────────────────────────────────────
 * Birleştirme geri alınamaz bir eylemdir ve tamamlanmıştır; ödül satırı yazılamazsa birleşme
 * bozulmaz. Aynı ilke `revokeReferralOnUnpaidOrder`da da yazılı (`DOMAIN §14`): *"geri alınamazsa
 * para yine iade edilmiştir."* `revokePoints` zaten sessiz — ödül hiç yazılmamışsa (tavan, B2B,
 * kapıda ödeme) ya da ters satır zaten varsa `null` döner.
 */
export interface MergeCustomersInput {
  targetId: string;
  sourceId: string;
  actorId?: string;
}

export interface MergeCustomersOutcome {
  /** Geri alınan getiren puanı — 0 ise ya kendi-getiren hâli yoktu ya ödül hiç yazılmamıştı. */
  referralRevoked: number;
}

export async function mergeCustomers(db: SupabaseClient, input: MergeCustomersInput): Promise<MergeCustomersOutcome> {
  await new UserProfileService(db).merge({
    targetId: input.targetId,
    sourceId: input.sourceId,
    actorId: input.actorId,
  });

  const ters = await revokeSelfReferralOnMerge(db, { targetId: input.targetId, sourceId: input.sourceId });
  // `points` negatiftir (ters satır); çağırana POZİTİF "şu kadar geri alındı" bilgisi gider.
  return { referralRevoked: ters ? Math.abs(ters.points) : 0 };
}
