import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DiscountInsertSchema,
  DiscountSchema,
  DiscountUpdateSchema,
  type Discount,
  type DiscountInsert,
  type DiscountUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { DiscountCodeService } from './discount-code.service';

/**
 * İndirim tanımı CRUD + kullanım sayımları (05.6).
 *
 * **Bu servis KARAR VERMEZ, satır getirir/yazar** (STACK §4). "Bu sepete hangi indirim, ne kadar"
 * kararı saf motordadır (`domain-core/pricing.applyBestDiscount`); tek-en-büyük kuralı, matrah
 * muafiyetleri ve pay dağıtımı orada yaşar. Servis kuralın kendisini saklar ve motorun
 * karşılaştıracağı SAYILARI (kullanım adetleri) getirir.
 *
 * Liste SAYFALANMAZ: indirim kümesi veriyle değil **operatörün eliyle** büyür ve doğal tavanı vardır
 * (CLAUDE.md §1). Kişisel kuponlar bu tavanı zorlarsa (puan kullanımı toplu kupon üretirse) liste
 * keyset'e döner ve ekrana müşteri süzgeci gerekir.
 */
export class DiscountService extends BaseDbService<Discount, DiscountInsert, DiscountUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'discount', DiscountSchema, DiscountInsertSchema, DiscountUpdateSchema);
  }

  /** Yönetim listesi — en yeni önce. Pasifler de gelir: süresi dolmuş kupon GEÇMİŞTİR, silinmez. */
  async list(): Promise<Discount[]> {
    return this.getAll(undefined, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Sepet çözümünün adayları: AKTİF kurallar. Süzme burada dar tutulur (tarih/koşul motorun işi) —
   * "geçerli mi" sorusunun ölçütü SQL'e kopyalanırsa eşik iki yerde yaşar.
   *
   * Kişisel kuponlar yalnız sahibine gelir: `customerId` verilmezse herkese açık olanlar okunur.
   */
  async listCandidates(customerId?: string | null): Promise<Discount[]> {
    const rows = await this.getAll({ isActive: true }, { orderBy: 'createdAt', orderDirection: 'desc' });
    return rows.filter((r) => r.customerId === null || (customerId != null && r.customerId === customerId));
  }

  /**
   * Koda göre kupon — kod artık kuralın kolonu değil, `discount_code` satırıdır (bir kuponun birden
   * çok kapısı olur). Arama `DiscountCodeService`'te; burada yalnız kapının açtığı kural getirilir.
   *
   * Dönen değer kuralı **ve hangi kodun tuttuğunu** taşır: kullanım kaydı o kimliği yazar, "TR kodu
   * mu FR kodu mu tuttu" sorusu ancak böyle yanıtlanır.
   */
  async findByCode(code: string): Promise<{ discount: Discount; codeId: string; code: string } | null> {
    const match = await new DiscountCodeService(this.supabase).findByCode(code);
    if (!match) return null;
    const discount = await this.getById(match.discountId);
    return discount ? { discount, codeId: match.id, code: match.code } : null;
  }

  /** Aktiflik anahtarı — süresi dolmuş/kullanımı bitmiş kupon SİLİNMEZ, kapatılır (geçmişi kalsın). */
  setActive(id: string, isActive: boolean): Promise<Discount> {
    return this.update({ id, isActive });
  }

  /**
   * Kullanım sayıları — `discount_use` KAYITLARINDAN türetilir, sayaç kolonundan değil.
   *
   * Sayaç tutulsaydı iptal/iade sonrası düzeltmek elle bir işe dönerdi ve "kim kullandı" sorusu
   * yanıtsız kalırdı; müşteri başına sınır tam da o soruyu sorar. Tek sorgu: kuralların tamamı için
   * kayıtlar toplanır, kimlik başına sayılır (kural başına sorgu N+1 olurdu).
   *
   * **Kota KURAL seviyesindedir, kod seviyesinde değil:** `total` kuralın tüm kapılarının toplamıdır.
   * `byCode` yalnız kırılımdır — hangi kodun karşılık bulduğunu söyler, tavanı bölmez. Bölseydi üç
   * kodlu bir kuponun "100 kullanım" sınırı fiilen 300 olurdu.
   */
  async usageCounts(discountIds: readonly string[]): Promise<Map<string, DiscountUsage>> {
    const result = new Map<string, DiscountUsage>();
    if (discountIds.length === 0) return result;

    // ÜÇ KOLON okunur, satırın tamamı değil: sayım için gereken bu kadar (tutar ve tarih raporun işi).
    const { data, error } = await this.supabase
      .from('discount_use')
      .select('discount_id,customer_id,discount_code_id')
      .in('discount_id', [...discountIds]);
    if (error) throw error;

    for (const raw of data ?? []) {
      const row = raw as { discount_id: string; customer_id: string | null; discount_code_id: string | null };
      const entry = result.get(row.discount_id) ?? { total: 0, byCustomer: new Map<string, number>(), byCode: new Map<string, number>() };
      entry.total += 1;
      if (row.customer_id) entry.byCustomer.set(row.customer_id, (entry.byCustomer.get(row.customer_id) ?? 0) + 1);
      if (row.discount_code_id) entry.byCode.set(row.discount_code_id, (entry.byCode.get(row.discount_code_id) ?? 0) + 1);
      result.set(row.discount_id, entry);
    }
    return result;
  }
}

/** Bir kuralın kullanım sayıları: toplam (kota bunun üstünde durur) + müşteri ve kod kırılımı. */
export interface DiscountUsage {
  total: number;
  byCustomer: Map<string, number>;
  /** Kod kimliği → kaç kez tuttu. Kotayı BÖLMEZ; "hangi dil karşılık buldu" sorusunun cevabıdır. */
  byCode: Map<string, number>;
}
