import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAGE_SIZE,
  PointsBalanceSchema,
  PointsEntryInsertSchema,
  PointsEntrySchema,
  RedemptionResultSchema,
  type KeysetCursor,
  type Page,
  type PointsBalance,
  type PointsEntry,
  type PointsEntryInsert,
  type PointsReason,
  type RedemptionResult,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/** İşletmenin saat dilimi — tek şube, Strasbourg. Gün sınırı buna göre çizilir. */
const BUSINESS_TIME_ZONE = 'Europe/Paris';

/**
 * Verilen anın **işletme gününün** başlangıcı (yerel gece yarısı), UTC anı olarak.
 *
 * `setHours(0,0,0,0)` süreç saat dilimini kullanır ve sunucu UTC'deyse gün yanlış yerde döner.
 * Bölgeyi açıkça söylemek, dağıtım ortamının sessiz bir parametreye dönüşmesini engeller.
 */
function startOfBusinessDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Yereldeki "şu an" ile gerçek an arasındaki fark = bölgenin o günkü ofseti (yaz saati dahil).
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offsetMs);
}

/**
 * Puan defteri (17.4) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * "Kim kazanır, ne kadar kazanır, tavana takıldı mı" soruları motorda (`domain-core/feedback`);
 * servis yalnız defteri tutar. `update`/`delete` YOK ve olmayacak: defter satırı düzeltilmez,
 * karşı kayıt yazılır — muhasebenin en eski kuralı.
 */
export class PointsEntryService extends BaseDbService<PointsEntry, PointsEntryInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'points_entry', PointsEntrySchema, PointsEntryInsertSchema, PointsEntrySchema as never, false);
  }

  /** Müşterinin puan geçmişi — yeniden eskiye, keyset sayfalı (defter veriyle büyür). */
  listByCustomer(customerId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<PointsEntry>> {
    return this.getPage({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor });
  }

  /**
   * Müşterinin **bugün** kazandığı puan — günlük tavanın ölçütü.
   *
   * Yalnız pozitifler sayılır: harcama tavanı serbest bırakmamalı, yoksa kupona çevirip yeniden
   * kazanmak sınırsız bir döngü olurdu.
   *
   * **"Bugün" işletmenin günüdür, sunucununki değil.** `setHours(0,0,0,0)` süreç saat dilimine göre
   * çalışır; sunucu UTC'de koşarsa gün Fransa'da 01:00/02:00'de döner ve müşteri gece yarısından
   * sonraki aksiyonunda dünün tavanına takılır. Bölge sabittir çünkü işletme tektir (Strasbourg);
   * müşterinin kendi saat dilimi burada ölçüt değil — tavan BİZİM günümüzün sınırıdır.
   */
  async earnedToday(customerId: string, now: Date = new Date()): Promise<number> {
    const dayStart = startOfBusinessDay(now);
    const rows = await this.getAll(
      { customerId },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: dayStart.toISOString() }] },
    );
    return rows.filter((r) => r.points > 0).reduce((sum, r) => sum + r.points, 0);
  }

  /** Bu kaynaktan zaten puan verilmiş mi — tekillik ihlaline düşmeden önce sorulur. */
  async hasEntryFor(customerId: string, reason: PointsReason, refId: string): Promise<boolean> {
    return (await this.getOneBy({ customerId, reason, refId })) !== null;
  }

  /**
   * **Puan → kişisel kupon** (`redeem_points`, 17.5). Puan düşümü ve kuponun doğuşu tek
   * transaction'da: ayrı olsalardı ikincisi düştüğünde müşterinin puanı gider, kuponu doğmazdı.
   *
   * `ok:false` bir hata değil bir gerçektir — yetersiz bakiye müşteriye söylenecek bir cümledir.
   */
  async redeem(input: {
    customerId: string;
    points: number;
    valueCents: number;
    minimum: number;
    code: string;
  }): Promise<RedemptionResult> {
    const raw = await this.executeRpc('redeem_points', {
      p_customer_id: input.customerId,
      p_points: input.points,
      p_value_cents: input.valueCents,
      p_minimum: input.minimum,
      p_code: input.code,
    });
    return RedemptionResultSchema.parse(dbToApp(raw));
  }
}

/**
 * `customer_points_balance` görünümü — defterden türetilen bakiye.
 *
 * Ayrı servis, çünkü görünüm yazılmaz. Bakiyeyi defter servisine metot olarak eklemek, bir gün
 * "bakiyeyi güncelle" diye bir yol açmanın davetiyesi olurdu.
 */
export class PointsBalanceService extends BaseDbService<PointsBalance, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'customer_points_balance',
      PointsBalanceSchema,
      PointsBalanceSchema as never,
      PointsBalanceSchema as never,
      false,
    );
  }

  /** Tek müşterinin bakiyesi; hiç hareketi yoksa `null` (satır yoktur). */
  async getByCustomer(customerId: string): Promise<PointsBalance | null> {
    const rows = await this.getAll({ customerId }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Operasyon puan tablosu — en çok biriktirenler önce.
   *
   * "Kim ne kadar biriktirmiş" sorusu bir istisna avı değil genel resim çizer (tasarım §4); bu
   * yüzden sıralama bakiyeye göredir, son hareket tarihine göre değil.
   */
  listTop(limit = 50): Promise<PointsBalance[]> {
    return this.getAll(undefined, { orderBy: 'balance', orderDirection: 'desc', limit });
  }
}
