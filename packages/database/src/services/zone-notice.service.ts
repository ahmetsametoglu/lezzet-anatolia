import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ZoneNoticeInsertSchema,
  ZoneNoticeSchema,
  ZoneNoticeUpdateSchema,
  type ZoneNotice,
  type ZoneNoticeInsert,
  type ZoneNoticeUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Bölge haberi (`zone_notice`, 0030) — *"bölgenize henüz gelmiyoruz, açılınca haber verelim."*
 *
 * `variant_stock_notice` ile karıştırılmaz: o "geliyoruz ama bu ürün burada yok" der, bu "hiç
 * gelmiyoruz" der.
 *
 * ── NEDEN SERVİS (denetim A4) ────────────────────────────────────────────────
 * Tablo üç app dosyasından HAM okunuyordu ve okuma tarafının künyesi *"kendi servisi yok ve
 * gerekmiyor — üzerinde iş kuralı taşımıyor"* diyordu. Gerekçe eksikti: mesele iş kuralı değil,
 * **sözleşme**. Ham erişim ad dönüşümünü ve doğrulamayı her çağrının kendi sorumluluğuna
 * bırakıyordu — okuma `row.postal_code as string` diye elle çeviriyordu, yani kolon adı değişse
 * derleyici değil çalışma zamanı haber verirdi. `STACK §6`'nın kapattığı sınıf tam bu.
 *
 * **Silme AÇIK** (`allowDelete`): müşteri bekleme kaydını hesabından kaldırabiliyor. Bu, verdiğimiz
 * sözü geri alması demek; yumuşak silme tutmanın bir faydası yok.
 */
export class ZoneNoticeService extends BaseDbService<ZoneNotice, ZoneNoticeInsert, ZoneNoticeUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'zone_notice', ZoneNoticeSchema, ZoneNoticeInsertSchema, ZoneNoticeUpdateSchema);
  }

  /**
   * Kaydı bırakır — **aynı bekleyiş ikinci kez yazılmaz.**
   *
   * Düğmeye ikinci kez basmak yeni bir bekleyiş değil, aynı bekleyişin tekrarıdır. Tekillik veride
   * de var (`zone_notice_unique_idx` — `(postal_code, lower(email))`); burada çakışmayı hata
   * saymamak, kullanıcıya sebepsiz bir uyarı göstermemek için.
   *
   * `insertIgnoringConflict` "önce sorgula, yoksa yaz" DEĞİL: iki eşzamanlı tıklama aynı anda
   * sorgularsa ikisi de "yok" görür ve ikisi de yazar. Karar veritabanında kalır.
   */
  async record(input: ZoneNoticeInsert): Promise<ZoneNotice | null> {
    return this.insertIgnoringConflict(input);
  }

  /**
   * Müşterinin beklediği bölgeler — hesap sayfasının listesi, en eski önce.
   *
   * Ziyaretçi kaydı da olabilir (`customerId` null) ama burada YALNIZ müşteriye bağlı olanlar
   * okunur; kimlik oturumdan gelir, parametreden değil.
   */
  listForCustomer(customerId: string): Promise<ZoneNotice[]> {
    return this.getAll({ customerId }, { orderBy: 'createdAt' });
  }

  /** Müşteri bekleme kaydını kaldırır — verdiğimiz sözü geri alması. */
  async removeForCustomer(customerId: string, postalCode: string): Promise<void> {
    await this.deleteWhere({ customerId, postalCode });
  }
}
