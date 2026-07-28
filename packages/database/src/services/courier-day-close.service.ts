import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CourierDayCloseResultSchema,
  CourierDayCloseSchema,
  CourierDayCollectionSchema,
  type CourierDayClose,
  type CourierDayCloseResult,
  type CourierDayCollection,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Kurye gün kapanışı (11.6) — mutabakat kaydı. **Karar vermez, satır getirir/yazar** (STACK §4).
 *
 * Yazım tek yoldan, RPC üzerinden gider: beklenen toplamlar, günün sipariş listeleri ve kapanış
 * satırı tek anın fotoğrafıdır. Elle `insert` açık bırakılsaydı ikinci bir yazım yolu doğardı ve
 * beklenen tutarlar sessizce başka yerde hesaplanırdı.
 */
export class CourierDayCloseService extends BaseDbService<CourierDayClose, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'courier_day_close', CourierDayCloseSchema, CourierDayCloseSchema as never, CourierDayCloseSchema as never, false);
  }

  /** Günün kapanışı — yoksa gün henüz açıktır. */
  getByDay(courierId: string, date: string): Promise<CourierDayClose | null> {
    return this.getOneBy({ courierId, date });
  }

  /** Kuryenin kapanmış günleri — en yeni önce. */
  listByCourier(courierId: string, limit = 30): Promise<CourierDayClose[]> {
    return this.getAll({ courierId }, { orderBy: 'date', orderDirection: 'desc', limit });
  }

  /**
   * **Günü kapat.** `ok:false` + `already_closed` bir hata değildir: kapanmış gün salt-okunurdur,
   * ikinci çağrı ezmez.
   */
  async close(input: {
    courierId: string;
    date: string;
    countedCash?: number;
    countedCard?: number;
    countedCheque?: number;
    note?: string | null;
    actorId?: string | null;
  }): Promise<CourierDayCloseResult> {
    const raw = await this.executeRpc('close_courier_day', {
      p_courier_id: input.courierId,
      p_date: input.date,
      p_counted_cash: input.countedCash ?? 0,
      p_counted_card: input.countedCard ?? 0,
      p_counted_cheque: input.countedCheque ?? 0,
      p_note: input.note ?? null,
      p_actor_id: input.actorId ?? null,
    });
    return CourierDayCloseResultSchema.parse(dbToApp(raw));
  }
}

/**
 * Beklenen tahsilat görünümü — kapanış öncesi ekranın okuması. Kendi sınıfı olmasının sebebi
 * teknik: okuma `tableName`'e bağlıdır (`OrderSaleService` ile aynı gerekçe).
 */
export class CourierDayCollectionService extends BaseDbService<CourierDayCollection, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'courier_day_collection',
      CourierDayCollectionSchema,
      CourierDayCollectionSchema as never,
      CourierDayCollectionSchema as never,
      false,
    );
  }

  /** Günün beklenen tahsilatı; hiç kapıda ödeme yoksa satır doğmaz → sıfır kabul edilir. */
  getByDay(courierId: string, date: string): Promise<CourierDayCollection | null> {
    return this.getOneBy({ courierId, date });
  }
}
