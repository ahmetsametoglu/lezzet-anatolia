import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AnalyticsCampaignRevenueSchema,
  AnalyticsDailySchema,
  AnalyticsEventInsertSchema,
  AnalyticsProductDailySchema,
  AnalyticsProductSignalSchema,
  AnalyticsSearchDailySchema,
  AnalyticsSearchSignalSchema,
  AnalyticsSessionInsertSchema,
  AnalyticsSessionSchema,
  AnalyticsSourceDailySchema,
  OrderRevenueDailySchema,
  CustomerSegmentCountSchema,
  CustomerSegmentMemberSchema,
  type AnalyticsCampaignRevenue,
  type AnalyticsDaily,
  type AnalyticsEventInsert,
  type AnalyticsEventType,
  type AnalyticsProductSignal,
  type AnalyticsSearchSignal,
  type AnalyticsSession,
  type AnalyticsSessionInsert,
  type AnalyticsSourceDaily,
  type Business,
  type CustomerSegment,
  type CustomerSegmentCount,
  type CustomerSegmentMember,
  type OrderRevenueDaily,
} from '@lezzet/types';
import { z } from 'zod';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Analitik I/O: kurallar `docs/architecture/ANALYTICS.md`'dedir, burada yalnız satır getirip yazan kod durur. Üç ayrı servis, çünkü
 * defter yazılır ama okunmaz, oturum bir kez yazılır, özet okunur; tek sınıf yazma-yalnız tabloya okuma açardı.
 */

/** Ham satır şeması — yalnız yazım doğrulaması için; defter geri okunmuyor. */
const AnalyticsEventRowSchema = AnalyticsEventInsertSchema.extend({ createdAt: z.string() });

/**
 * **YAZMA-YALNIZ defter.** Okuma metodu yok ve olmayacak: ekranlar `AnalyticsDailyService`'ten
 * okur, ham defter yalnız detay içindir (`ANALYTICS §5`). Buraya bir `list()` eklendiği gün ekran
 * ham deftere bağlanır ve her hafta biraz daha yavaşlar.
 */
export class AnalyticsEventService extends BaseDbService<
  z.infer<typeof AnalyticsEventRowSchema>,
  AnalyticsEventInsert,
  never
> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'analytics_event', AnalyticsEventRowSchema, AnalyticsEventInsertSchema, AnalyticsEventInsertSchema as never, false);
  }

  /** Olayı yazar. Satır geri İSTENMEZ — en çok yazılan tabloda dönüş gövdesine kimse bakmıyor. */
  record(event: AnalyticsEventInsert): Promise<void> {
    return this.insertWithoutReturn(event);
  }
}

/**
 * Oturumun kampanya künyesi — **bir kez** yazılır.
 *
 * İkinci yazım sessizce yutulur (`insertIgnoringConflict`): UTM oturumun İLK isteğinde vardır,
 * sonraki isteklerde yoktur; "önce sorgula, yoksa yaz" deseydik eşzamanlı iki ilk-istek ikisi de
 * "yok" görür ve ikincisi birinciyi ezerdi.
 */
export class AnalyticsSessionService extends BaseDbService<AnalyticsSession, AnalyticsSessionInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'analytics_session', AnalyticsSessionSchema, AnalyticsSessionInsertSchema, AnalyticsSessionInsertSchema as never, false);
  }

  /** Künyeyi bir kez kalıcılaştırır; zaten varsa dokunmaz. */
  async remember(input: AnalyticsSessionInsert): Promise<void> {
    await this.insertIgnoringConflict(input);
  }

  /**
   * Oturumun künyesi, edinim atfının tek okuması; tablonun birincil anahtarı `session_key` olduğu için `getById` kullanılmaz.
   */
  async bySessionKey(sessionKey: string): Promise<AnalyticsSession | null> {
    const rows = await this.getAll({ sessionKey }, { limit: 1 });
    return rows[0] ?? null;
  }
}

/** Özet okumasının süzgeci — ekranın dönem ve eksen seçimi. */
export interface AnalyticsDailyFilter {
  from: string;
  to: string;
  types?: AnalyticsEventType[];
  warehouseId?: string;
  channel?: 'b2b' | 'b2c';
  business?: Business;
}

/**
 * **Ekranların okuduğu tek yer.** Hafta/ay/yıl ve saat kırılımı buradan TÜRETİLİR — ayrı tablo
 * yazılmaz (türetilebilen ikinci kez yazılmaz).
 */
export class AnalyticsDailyService extends BaseDbService<AnalyticsDaily, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'analytics_daily', AnalyticsDailySchema, AnalyticsDailySchema as never, AnalyticsDailySchema as never, false);
  }

  /**
   * Dönemin özet satırları. Sayfalanmıyor ve bu bilinçli: özet **doğal tavanlı** bir kümedir
   * (gün × tip × boyut) ve ekran zaten toplayarak okuyor — sınırsız büyüyen bir liste değil
   * (`CLAUDE §1`'in sayfalama ölçütü).
   */
  list(filter: AnalyticsDailyFilter): Promise<AnalyticsDaily[]> {
    return this.getAll(
      { type: filter.types, warehouseId: filter.warehouseId, channel: filter.channel, business: filter.business },
      {
        orderBy: 'day',
        orderDirection: 'desc',
        rangeFilters: [
          { field: 'day', operator: 'gte', value: filter.from },
          { field: 'day', operator: 'lte', value: filter.to },
        ],
      },
    );
  }

  /**
   * Bir günün özetini ham defterden üretir (idempotent) → yazılan satır sayısı.
   *
   * RPC çünkü toplama + `on conflict` upsert PostgREST'ten söylenemez ve gün başına on binlerce
   * satırı uygulamaya çekmek zaten yanlış olurdu (`STACK §13`).
   */
  async build(day: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('build_analytics_daily', { p_day: day });
    if (error) throw error;
    return (data as number | null) ?? 0;
  }

  /** Verilen ayın bölümünü açar (yoksa). İdempotent — iş her koşuda ileriye doğru sürdürür. */
  async ensurePartition(month: string): Promise<void> {
    const { error } = await this.supabase.rpc('ensure_analytics_partition', { p_month: month });
    if (error) throw error;
  }

  /**
   * Saklama süresi dolmuş BÖLÜMLERİ düşürür → düşen bölüm adları.
   *
   * **Satır silinmiyor, bölüm düşüyor** (`ANALYTICS §5`): 25 aylık bir tabloda toplu `delete` hem
   * uzun sürer hem ölü satır bırakır; `drop table` tek metadata işlemidir.
   */
  async dropPartitionsBefore(month: string): Promise<string[]> {
    const { data, error } = await this.supabase.rpc('drop_analytics_partitions_before', { p_month: month });
    if (error) throw error;
    return ((data ?? []) as Array<{ dropped: string }>).map((r) => dbToApp<{ dropped: string }>(r).dropped);
  }

  /**
   * Ürün, arama ve kaynak özetlerini de üretir → toplam yazılan satır. Dört özet tek metotta, çünkü ayrı çağrılarda yeni özeti eklemeyi
   * unutmak hata vermez, yalnız o blok hiç dolmazdı.
   */
  async buildAll(day: string): Promise<number> {
    let toplam = await this.build(day);
    for (const fn of ['build_analytics_daily_product', 'build_analytics_daily_search', 'build_analytics_daily_source']) {
      const { data, error } = await this.supabase.rpc(fn, { p_day: day });
      if (error) throw error;
      toplam += (data as number | null) ?? 0;
    }
    return toplam;
  }

  /**
   * Saklama süresi dolmuş oturum künyelerini ve arama özetlerini siler.
   *
   * **Bölüm düşürmenin yetmediği yer burası:** `analytics_session` bölümlenmemiş ve
   * `analytics_daily_search` süresiz bir özet tablosu — ikisi de ham defterle aynı 25 ayı yaşamalı,
   * yoksa "defteri sildik" cümlesi yarım kalır (biri psödonim anahtar, öteki serbest metin taşıyor).
   */
  async purgeBefore(day: string): Promise<{ sessions: number; searches: number }> {
    const { data, error } = await this.supabase.rpc('purge_analytics_before', { p_day: day });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { sessions?: number; searches?: number } | null;
    return { sessions: row?.sessions ?? 0, searches: row?.searches ?? 0 };
  }
}

/**
 * Ürün kırılımı: "çok bakılıp az alınan" raporu ve vitrin seçkisi buradan okur ki "hangi ürün ilgi görüyor" sorusu iki ekranda iki
 * cevap vermesin.
 */
export class AnalyticsProductDailyService extends BaseDbService<z.infer<typeof AnalyticsProductDailySchema>, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'analytics_daily_product',
      AnalyticsProductDailySchema,
      AnalyticsProductDailySchema as never,
      AnalyticsProductDailySchema as never,
      false,
    );
  }

  /**
   * Dönemin ilk N ürünü (görüntülemeye göre) + sepete dönüşüm oranı.
   *
   * **RPC ve gerekçesi `STACK §13`:** sıralama ölçütü türetilmiş bir orandır ve ilk N ancak tüm
   * dönem toplandıktan sonra bilinir — uygulamada toplasaydık gün × ürün kadar satırı yalnız
   * atmak için taşırdık.
   */
  async signals(from: string, to: string, limit = 20, business?: Business): Promise<AnalyticsProductSignal[]> {
    const { data, error } = await this.supabase.rpc('analytics_product_signals', {
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_business: business ?? null,
    });
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => AnalyticsProductSignalSchema.parse(dbToApp(row as Record<string, unknown>)));
  }
}

/**
 * Arama sinyalleri, sistemin tek kalıcı serbest metni; tablo süresiz değil, ham defterle aynı 25 ayı yaşar (`purgeBefore`).
 */
export class AnalyticsSearchDailyService extends BaseDbService<z.infer<typeof AnalyticsSearchDailySchema>, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'analytics_daily_search',
      AnalyticsSearchDailySchema,
      AnalyticsSearchDailySchema as never,
      AnalyticsSearchDailySchema as never,
      false,
    );
  }

  /**
   * Dönemin ilk N araması. `zeroOnly` sıfır-sonuçluları süzer — **kova gruplamada KALIR**
   * (`ANALYTICS §4`): süzgeç boşluğu sık bir arayüz sinyali, arama boşluğu seyrek bir çeşit
   * sinyalidir; tek listede toplansalardı sık olan seyreği boğardı.
   */
  async signals(from: string, to: string, limit = 20, zeroOnly = false, business?: Business): Promise<AnalyticsSearchSignal[]> {
    const { data, error } = await this.supabase.rpc('analytics_search_signals', {
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_zero_only: zeroOnly,
      p_business: business ?? null,
    });
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => AnalyticsSearchSignalSchema.parse(dbToApp(row as Record<string, unknown>)));
  }
}

/**
 * Trafik kaynağı: satır sayısı doğal tavanlı (gün × kaynak bileşimi) olduğu için dönem toplaması uygulamada yapılır.
 */
export class AnalyticsSourceDailyService extends BaseDbService<AnalyticsSourceDaily, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'analytics_daily_source',
      AnalyticsSourceDailySchema,
      AnalyticsSourceDailySchema as never,
      AnalyticsSourceDailySchema as never,
      false,
    );
  }

  /** Dönemin kaynak satırları — `source: null` DOĞRUDAN trafiktir, düşürülmez. */
  list(from: string, to: string, business?: Business): Promise<AnalyticsSourceDaily[]> {
    return this.getAll(
      { business },
      {
        orderBy: 'day',
        orderDirection: 'desc',
        rangeFilters: [
          { field: 'day', operator: 'gte', value: from },
          { field: 'day', operator: 'lte', value: to },
        ],
      },
    );
  }
}

/**
 * Analitiğin defter dışı okumaları, kaynağı sipariş ve müşteri tablosu: bunlar bir tablonun satırı değil iki tablodan hesaplanan
 * raporlardır, bu yüzden `BaseDbService`'ten türemez. Segment ve ciro sorusunun yetkili kaynağı olay defteri değil siparişin kendisidir.
 */
export class AnalyticsReportService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Kampanya cirosu, ilk temas atfı: satır "o kampanyanın kazandırdığı müşterilerin o dönemki siparişleri"dir. Başka türlüsü oturum
   * anahtarını siparişe yazmayı gerektirir ve anonim defteri geriye dönük kimliklendirirdi.
   */
  async campaignRevenue(from: string, to: string, business?: Business): Promise<AnalyticsCampaignRevenue[]> {
    const { data, error } = await this.supabase.rpc('analytics_campaign_revenue', { p_from: from, p_to: to, p_business: business ?? null });
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => AnalyticsCampaignRevenueSchema.parse(dbToApp(row as Record<string, unknown>)));
  }

  /**
   * Dönem cirosu gün × kanal: tek çağrı dönem toplamını, B2C/B2B ayrımını ve günlük seriyi karşılar. Süzgeç sipariş tarihindedir, teslim
   * gününe göre okunan ciro kampanya giderinin dönemiyle hizalanmazdı.
   */
  async orderRevenue(from: string, to: string, business?: Business): Promise<OrderRevenueDaily[]> {
    const { data, error } = await this.supabase.rpc('analytics_order_revenue', { p_from: from, p_to: to, p_business: business ?? null });
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => OrderRevenueDailySchema.parse(dbToApp(row as Record<string, unknown>)));
  }

  /**
   * Posta kodu başına sipariş ve ciro, talep sayacının karşı ucu: anahtar `address_snapshot`tır, çünkü düzeltilen adres geçmiş oranları
   * değiştirirdi. Kod listesi zorunludur, boş liste verilirse sorgu koşmaz.
   */
  async postalCodeOrders(codes: readonly string[]): Promise<Map<string, { orderCount: number; revenueCents: number }>> {
    if (codes.length === 0) return new Map();
    const { data, error } = await this.supabase.rpc('analytics_postal_code_orders', { p_codes: codes });
    if (error) throw error;
    const rows = (data ?? []) as Array<{ postal_code: string; order_count: number; revenue_cents: number | string }>;
    return new Map(rows.map((r) => [r.postal_code, { orderCount: r.order_count, revenueCents: Number(r.revenue_cents) }]));
  }

  /**
   * Segment sayıları (`ANALYTICS §6`): eşikler parametriktir (uyuyan sınırı, yeni penceresi, şampiyon sipariş sayısı) ve varsayılanlar
   * yalnız SQL tarafındadır, iki yerde tutulsa ayrışırdı.
   */
  async customerSegments(options: SegmentOptions = {}): Promise<CustomerSegmentCount[]> {
    const { data, error } = await this.supabase.rpc('analytics_customer_segments', segmentArgs(options));
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => CustomerSegmentCountSchema.parse(dbToApp(row as Record<string, unknown>)));
  }

  /**
   * Bir segmentin üyeleri, Müşteriler köprüsünün "kim" tarafı ve dışa almanın kaynağı. Sayfalıdır ve sıra son siparişe göredir, en yeni
   * uyuyanın geri kazanma şansı en yüksektir.
   */
  async segmentMembers(segment: CustomerSegment, limit = 50, offset = 0, options: SegmentOptions = {}): Promise<CustomerSegmentMember[]> {
    const { data, error } = await this.supabase.rpc('analytics_segment_members', {
      p_segment: segment,
      p_limit: limit,
      p_offset: offset,
      ...segmentArgs(options),
    });
    if (error) throw error;
    return ((data ?? []) as unknown[]).map((row) => CustomerSegmentMemberSchema.parse(dbToApp(row as Record<string, unknown>)));
  }
}

/** Segment eşikleri — verilmeyen SQL varsayılanına düşer (tek yerde durur). */
export interface SegmentOptions {
  /** Hangi güne göre "bugün" — geçmiş bir tarihe bakmak dönem kıyası için gerekli. */
  reference?: string;
  dormantDays?: number;
  newDays?: number;
  championOrders?: number;
  business?: Business;
}

function segmentArgs(o: SegmentOptions): Record<string, unknown> {
  // Tanımsız alan gönderilmez: PostgREST'e `null` geçmek SQL varsayılanını EZERDİ ve eşik `null`
  // olunca her karşılaştırma `null` döner — tüm müşteriler sessizce `lost` sayılırdı.
  const args: Record<string, unknown> = {};
  if (o.reference) args.p_reference = o.reference;
  if (o.dormantDays !== undefined) args.p_dormant_days = o.dormantDays;
  if (o.newDays !== undefined) args.p_new_days = o.newDays;
  if (o.championOrders !== undefined) args.p_champion_orders = o.championOrders;
  if (o.business) args.p_business = o.business;
  return args;
}
