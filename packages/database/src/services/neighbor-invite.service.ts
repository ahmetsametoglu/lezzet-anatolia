import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NeighborInviteClaimInsertSchema,
  NeighborInviteClaimSchema,
  NeighborInviteClaimUpdateSchema,
  NeighborInviteInsertSchema,
  NeighborInviteSchema,
  type NeighborInvite,
  type NeighborInviteClaim,
  type NeighborInviteClaimInsert,
  type NeighborInviteClaimUpdate,
  type NeighborInviteInsert,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Komşu daveti (17.10) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * "Bu davet hâlâ geçerli mi", "kaç komşu kullanabilir", "ödül doğar mı" sorularının hiçbiri burada
 * yanıtlanmaz: hepsi seferin bugünkü hâline ve kesim saatine bağlı, yani uygulama katmanının işi
 * (`@lezzet/application/customer/neighbor`).
 *
 * **Güncelleme yolu YOK ve bilerek:** davet doğduğu andaki seferin fotoğrafıdır. Günü ya da sınırı
 * sonradan değiştirilebilseydi, paylaşılmış bir bağlantının sözü sahibinin haberi olmadan
 * değişirdi. Yanlış açılmış davet düzeltilmez — süresi geçer ya da yenisi açılır.
 */
export class NeighborInviteService extends BaseDbService<NeighborInvite, NeighborInviteInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'neighbor_invite', NeighborInviteSchema, NeighborInviteInsertSchema, NeighborInviteSchema as never, false);
  }

  /**
   * Bağlantıdan daveti bulur — karşılama sayfasının tek giriş kapısı.
   *
   * **Süre süzgeci BURADA YOK** ve bu `FeedbackRequestService.findByToken`ın tersi bir karar,
   * bilerek: orada süresi geçmiş belirteç "yok" ile aynı cevabı veriyor çünkü söylenecek başka bir
   * şey kalmıyor. Burada ise geçmiş bir seferin daveti okunabilmeli — komşuya "bu sefer geçti,
   * ama alışverişe devam edebilirsin" demek, 404 vermekten iyidir ve o cümleyi kurmak için satırı
   * görmek gerekir. Geçerlilik kararı motorda (`inviteWindowOf`).
   */
  findByToken(token: string): Promise<NeighborInvite | null> {
    return this.getOneBy({ token: token.trim() });
  }

  /** Siparişin daveti — ikinci kez açmadan önce sorulur (sipariş başına TEK davet, veride unique). */
  findByOrder(orderId: string): Promise<NeighborInvite | null> {
    return this.getOneBy({ orderId });
  }

  /** Müşterinin davetleri, en yakın seferden başlayarak — hesap ve sipariş ekranı. */
  listByInviter(inviterId: string, limit = 20): Promise<NeighborInvite[]> {
    return this.getAll({ inviterId }, { orderBy: 'deliveryDate', orderDirection: 'desc', limit });
  }

  /** Kimliklerden davetler — kabul kayıtları çözülürken tek turda okunur (N+1 olmasın). */
  async listByIds(ids: readonly string[]): Promise<NeighborInvite[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
  }
}

/**
 * **Kabul edilmiş komşu daveti** (12.08 kullanıcı sorusu) — davetin kişiye yapıştığı yer.
 *
 * Servis yine karar vermez: "bu kabul hâlâ bekliyor mu" sorusu seferin penceresine ve o daveti
 * taşıyan siparişlere bakıyor, yani uygulama katmanının işi (`customer/neighbor.ts`).
 *
 * **Silme yok** — "kaç davet kabul edildi, kaçı siparişe döndü" sorusunun tek kaynağı bu tablo.
 *
 * **Güncelleme İKİ ALANLA SINIRLI** (kullanıcı kararı 21.08). Bu satır bir süre *"güncelleme yolu
 * yok: kabul olmuş bir olaydır, düzeltilmez"* diyordu ve olayın kendisi için hâlâ doğru — değişen,
 * satırın ikinci bir işi daha olması: hangi davetin SEÇİLİ olduğunu da o taşıyor. Seçim olay değil
 * tercihtir ve tercih değişir; müşteri önceki davet bağlantısına yeniden tıklayabilir ya da daveti
 * reddedebilir. Kimlik alanları ve `createdAt` yine dokunulamaz (`…ClaimUpdateSchema` künyesi).
 */
export class NeighborInviteClaimService extends BaseDbService<NeighborInviteClaim, NeighborInviteClaimInsert, NeighborInviteClaimUpdate> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'neighbor_invite_claim',
      NeighborInviteClaimSchema,
      NeighborInviteClaimInsertSchema,
      NeighborInviteClaimUpdateSchema,
      false,
    );
  }

  /**
   * Müşterinin kabul ettiği davetler — **SON SEÇİLENDEN eskiye** (`chosenAt`, `createdAt` değil).
   *
   * Sıra kararın kendisidir, sunum tercihi değil: aynı gün + aynı bölgeye iki davet varsa kazanan
   * listenin BAŞIDIR (kullanıcı kararı 21.08 — "son kabul edilen kazanır"). Eskiden `createdAt`e
   * göre sıralanıyordu ve okuyan taraf zaten sıraya güvenmiyordu; belirsizliğin kökü oydu.
   *
   * Sınır: bir kişi onlarca davet kabul etmez.
   */
  listByCustomer(customerId: string, limit = 20): Promise<NeighborInviteClaim[]> {
    return this.getAll({ customerId }, { orderBy: 'chosenAt', orderDirection: 'desc', limit });
  }

  /** Bu kişi bu daveti zaten kabul etmiş mi — ikinci tıklama yeni satır açmasın (veride de unique). */
  find(inviteId: string, customerId: string): Promise<NeighborInviteClaim | null> {
    return this.getOneBy({ inviteId, customerId });
  }

  /**
   * **Tekrar kabul — kaydı ÖNE ALIR.** Önceki davet bağlantısına yeniden tıklayan müşteri seçimini
   * değiştirmiş olur (kullanıcı kararı 21.08: *"isterse bir önceki davet linkine yine tıklayabilir"*).
   * Reddi de temizler: yeniden kabul, reddin geri alınmasıdır.
   *
   * `createdAt`e DOKUNULMAZ — o satırın doğduğu andır ve dönüşüm ölçümünün tarihidir.
   */
  async reselect(id: string): Promise<void> {
    await this.update({ id, chosenAt: new Date().toISOString(), declinedAt: null });
  }

  /** **Ret** — davetli daveti geri çevirir; seçime girmez. Satır silinmez (kabul olmuş bir olaydır). */
  async decline(id: string): Promise<void> {
    await this.update({ id, declinedAt: new Date().toISOString() });
  }
}
