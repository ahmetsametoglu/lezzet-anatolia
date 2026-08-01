import type { SupabaseClient } from '@supabase/supabase-js';
import {
  VariantStockNoticeSchema,
  VariantStockNoticeInsertSchema,
  VariantStockNoticeUpdateSchema,
  type VariantStockNotice,
  type VariantStockNoticeInsert,
  type VariantStockNoticeUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Varyant + yer bazlı stok bildirimi (19.12).
 *
 * `zone_notice` ile karıştırılmaz: o "bölgenize gelmiyoruz" der, bu "bölgenize geliyoruz ama bu
 * ürün burada şu an yok". İkincisi vitrinin dördüncü stok hâlidir (`elsewhere`, 19.10) — ürün ağda
 * var, müşterinin yerine ulaşamıyor.
 *
 * **Kayıt bir SÖZ değil, bir NOTTUR.** Tetikleyici (stok girince haber gönderme) bu turda
 * yazılmadı; ekran "not aldık" der, "haber göndereceğiz" demez. Söz verip tutmamak, hiç söz
 * vermemekten kötüdür.
 */
export class VariantStockNoticeService extends BaseDbService<
  VariantStockNotice,
  VariantStockNoticeInsert,
  VariantStockNoticeUpdate
> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'variant_stock_notice',
      VariantStockNoticeSchema,
      VariantStockNoticeInsertSchema,
      VariantStockNoticeUpdateSchema,
    );
  }

  /**
   * Kaydı bırakır — **aynı bekleyiş ikinci kez yazılmaz.**
   *
   * Düğmeye ikinci kez basmak yeni bir bekleyiş değil, aynı bekleyişin tekrarıdır. Kısmi unique
   * indeks bunu veride de tutuyor (`where notified_at is null`); burada önce okuyup var olanı
   * döndürmek, kullanıcıya hata göstermemek için.
   */
  async record(input: VariantStockNoticeInsert): Promise<VariantStockNotice> {
    const existing = await this.getOneBy({
      variantId: input.variantId,
      country: input.country,
      postalCode: input.postalCode,
      email: input.email,
    });
    // Haber verilmiş eski kayıt yeni bekleyişi ENGELLEMEZ: müşteri aynı ürünü aylar sonra yeniden
    // bekleyebilir ve bu yeni bir sözdür.
    if (existing && existing.notifiedAt === null) return existing;
    return this.insert(input);
  }

  /**
   * Bir varyantın belirli bir yerde bekleyenleri — tetikleyicinin okuması (bu turda çağıranı yok).
   *
   * Yer anahtarı `(ülke, kod)`: depo DEĞİL. Bölge ileride başka depoya bağlansa da söz ayakta
   * kalır ve "müşteri depoyu hiç görmez" kuralı veride korunur.
   */
  async listPending(variantId: string, country: VariantStockNotice['country'], postalCode: string): Promise<VariantStockNotice[]> {
    return this.getAll({ variantId, country, postalCode }, { isNullFields: ['notified_at'], orderBy: 'createdAt' });
  }

  /** Müşterinin beklediği ürünler — hesap sayfasının listesi. */
  async listForCustomer(customerId: string): Promise<VariantStockNotice[]> {
    return this.getAll({ customerId }, { isNullFields: ['notified_at'], orderBy: 'createdAt', orderDirection: 'desc' });
  }
}
