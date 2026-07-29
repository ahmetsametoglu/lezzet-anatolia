import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FeedbackRequestInsertSchema,
  FeedbackRequestProgressSchema,
  FeedbackRequestSchema,
  FeedbackRequestUpdateSchema,
  type FeedbackRequest,
  type FeedbackRequestInsert,
  type FeedbackRequestProgress,
  type FeedbackRequestUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Alım-sonrası geri bildirim daveti (17.2) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * "Hangi siparişe davet gitmeli, ne zaman" sorusu motorda (`domain-core/feedback`); servis yalnız
 * daveti tutar ve token'dan bulur.
 */
export class FeedbackRequestService extends BaseDbService<FeedbackRequest, FeedbackRequestInsert, FeedbackRequestUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'feedback_request', FeedbackRequestSchema, FeedbackRequestInsertSchema, FeedbackRequestUpdateSchema, false);
  }

  /**
   * Bağlantıdan daveti bulur — **akışın tek giriş kapısı.**
   *
   * Token oturum yerine geçtiği için burada başka bir kimlik sorulmaz; sahiplik zaten token'ın
   * kendisindedir (tahmin edilemez olduğu sürece).
   */
  findByToken(token: string): Promise<FeedbackRequest | null> {
    return this.getOneBy({ token });
  }

  /** Siparişin daveti — ikinci kez oluşturmadan önce sorulur (sipariş başına tek davet). */
  findByOrder(orderId: string): Promise<FeedbackRequest | null> {
    return this.getOneBy({ orderId });
  }

  /** Müşterinin davetleri — hesap sayfası ve "kaç kez katıldı" bakışı. */
  listByCustomer(customerId: string): Promise<FeedbackRequest[]> {
    return this.getAll({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Gönderilmeyi bekleyen davetler — tarama işinin kuyruğu.
   *
   * Davet OLUŞTURULUR ve ayrı bir adımda GÖNDERİLİR: e-posta sağlayıcısı düştüğünde davet kaybolmaz,
   * gönderilmemiş olarak kuyrukta kalır ve sonraki tarama onu bulur.
   */
  listUnsent(limit = 100): Promise<FeedbackRequest[]> {
    return this.getAll(undefined, { isNullFields: ['sentAt'], orderBy: 'createdAt', limit });
  }

  /** Gönderim damgası. Ayrı metot, çünkü "oluşturuldu" ile "gitti" iki ayrı gerçektir. */
  markSent(id: string, sentAt: string = new Date().toISOString()): Promise<FeedbackRequest> {
    return this.update({ id, sentAt });
  }

  /**
   * Akışı sonlandırır ve kazanılan puanı damgalar.
   *
   * İkinci çağrıda ezmez — çağıran `completedAt`'a bakıp karar verir; puanın tek kez verilmesi de
   * o kontrole bağlıdır (defterdeki tekillik ikinci bir emniyet).
   */
  markCompleted(id: string, pointsAwarded: number | null): Promise<FeedbackRequest> {
    return this.update({ id, completedAt: new Date().toISOString(), pointsAwarded });
  }
}

/**
 * `feedback_request_progress` görünümü — "2/5" ilerlemesi.
 *
 * Ayrı servis, çünkü görünüm yazılmaz. İlerlemeyi davet servisine metot olarak eklemek, bir gün
 * "ilerlemeyi güncelle" diye bir yol açmanın davetiyesi olurdu — ilerleme yazılacak bir şey değil.
 */
export class FeedbackProgressService extends BaseDbService<FeedbackRequestProgress, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'feedback_request_progress',
      FeedbackRequestProgressSchema,
      FeedbackRequestProgressSchema as never,
      FeedbackRequestProgressSchema as never,
      false,
    );
  }

  async getByRequest(feedbackRequestId: string): Promise<FeedbackRequestProgress | null> {
    const rows = await this.getAll({ feedbackRequestId }, { limit: 1 });
    return rows[0] ?? null;
  }
}
