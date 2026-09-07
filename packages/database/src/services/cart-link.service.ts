import type { SupabaseClient } from '@supabase/supabase-js';
import { CartLinkSchema, CartLinkInsertSchema, CartLinkUpdateSchema, type CartLink, type CartLinkInsert, type CartLinkUpdate } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sepet bağlantısı jetonları (15.21) — `0055` künyesi.
 *
 * Servis yalnız SATIR getirir/yazar; jetonun ne zaman geçerli sayılacağı, açılınca kimin neye
 * bağlanacağı uygulama kapısının kararıdır (`@lezzet/application/cart/link`). Jeton hiçbir yüzeye
 * geri okutulmaz — bu servis service-role yolundadır.
 */
export class CartLinkService extends BaseDbService<CartLink, CartLinkInsert, CartLinkUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'cart_link', CartLinkSchema, CartLinkInsertSchema, CartLinkUpdateSchema);
  }

  /** Jetonla tek satır — büyük/küçük harfe duyarsız: bağlantı elle yazılırsa klavye düzeltebilir. */
  findByToken(token: string): Promise<CartLink | null> {
    const temiz = token.trim().toUpperCase();
    if (!temiz) return Promise.resolve(null);
    return this.getOneBy({ token: temiz });
  }

  /**
   * Sohbetin AÇIK bağlantılarını kapatır — yeni bağlantı üretilirken eskisi geçersizlenir.
   *
   * Satır SİLİNMEZ, süresi şimdiye çekilir: "bu sohbete kaç bağlantı üretildi, hangisi açıldı"
   * sorusu sonradan da cevaplanabilmeli (0055). Açılmış bağlantıya dokunulmaz — o zaten bitmiştir.
   */
  async expireOpen(conversationId: string): Promise<void> {
    const now = new Date();
    const acik = (await this.getAll({ conversationId })).filter((row) => !row.claimedAt && new Date(row.expiresAt) > now);
    // Satır sayısı bir sohbette bir elin parmağını geçmez; tek tek yazmak taban metodundan geçer (CLAUDE §1).
    await Promise.all(acik.map((row) => this.update({ id: row.id, expiresAt: now.toISOString() })));
  }

  /**
   * Tek kullanım damgası — **koşullu yazım**: yalnız henüz açılmamış satırı damgalar. İki sekme
   * aynı bağlantıyı aynı anda açarsa ikincisi `null` alır ve `invalid` görür; yarışın hakemi DB.
   */
  claim(id: string, customerId: string): Promise<CartLink | null> {
    return this.updateIfNull(id, 'claimedAt', { claimedAt: new Date().toISOString(), claimedBy: customerId });
  }
}
