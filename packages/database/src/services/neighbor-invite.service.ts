import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NeighborInviteClaimInsertSchema,
  NeighborInviteClaimSchema,
  NeighborInviteInsertSchema,
  NeighborInviteSchema,
  type NeighborInvite,
  type NeighborInviteClaim,
  type NeighborInviteClaimInsert,
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
 * **Güncelleme yolu yok:** kabul olmuş bir olaydır, düzeltilmez. Silme de yok — "kaç davet kabul
 * edildi, kaçı siparişe döndü" sorusunun tek kaynağı bu tablo.
 */
export class NeighborInviteClaimService extends BaseDbService<NeighborInviteClaim, NeighborInviteClaimInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'neighbor_invite_claim',
      NeighborInviteClaimSchema,
      NeighborInviteClaimInsertSchema,
      NeighborInviteClaimSchema as never,
      false,
    );
  }

  /** Müşterinin kabul ettiği davetler, en yeniden eskiye. Sınır: bir kişi onlarca davet kabul etmez. */
  listByCustomer(customerId: string, limit = 20): Promise<NeighborInviteClaim[]> {
    return this.getAll({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc', limit });
  }

  /** Bu kişi bu daveti zaten kabul etmiş mi — ikinci tıklama yeni satır açmasın (veride de unique). */
  find(inviteId: string, customerId: string): Promise<NeighborInviteClaim | null> {
    return this.getOneBy({ inviteId, customerId });
  }
}
