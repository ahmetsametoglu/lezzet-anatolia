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
   *
   * **`reasons` verilirse yalnız o sebepler sayılır** (kullanıcı onayı 11.08): tavan artık tüm
   * defteri değil, YALNIZ tavana tabi eylemleri ölçüyor (`CAPPED_POINTS_REASONS`). Tümünü saysaydık
   * 500 puanlık bir getiren ödülü pencereyi tek başına doldurur ve müşteri aynı gün keşif oyundan
   * puan alamazdı — tavanın DIŞINDA tuttuğumuz bir ödül, tavanın içindekileri yemiş olurdu.
   * Süzgeç sorguda: çağıranın sonradan yapacağı bir filtreye bırakılsaydı unutan ilk çağıran eski
   * davranışa döner ve fark hiçbir yerde hata vermezdi.
   */
  async earnedToday(customerId: string, reasons?: readonly PointsReason[], now: Date = new Date()): Promise<number> {
    const dayStart = startOfBusinessDay(now);
    const rows = await this.getAll(
      reasons ? { customerId, reason: [...reasons] } : { customerId },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: dayStart.toISOString() }] },
    );
    return rows.filter((r) => r.points > 0).reduce((sum, r) => sum + r.points, 0);
  }

  /** Bu kaynaktan zaten puan verilmiş mi — tekillik ihlaline düşmeden önce sorulur. */
  async hasEntryFor(customerId: string, reason: PointsReason, refId: string): Promise<boolean> {
    return (await this.getOneBy({ customerId, reason, refId })) !== null;
  }

  /**
   * Bu kaynaktan yazılmış **ÖDÜL** satırı (pozitif) — geri almanın tutarı buradan okunur.
   *
   * İşaret süzgeci şart: aynı üçlüde artık iki satır bulunabiliyor (ödül + geri alma, ★ karar 7d)
   * ve `getOneBy` sırasızdır, yani hangisini döndüreceği belirsizdir. Geri alınacak tutar **o gün
   * yazılan** tutardır, bugünkü ayardaki değer değil: `points_referral` sonradan değişmiş olabilir
   * ve ayardan okumak defteri kendi geçmişiyle çelişkiye düşürürdü.
   */
  async findAwardFor(customerId: string, reason: PointsReason, refId: string): Promise<PointsEntry | null> {
    const rows = await this.getAll(
      { customerId, reason, refId },
      { rangeFilters: [{ field: 'points', operator: 'gt', value: 0 }], limit: 1 },
    );
    return rows[0] ?? null;
  }

  /** Bu kaynağın ödülü zaten geri alınmış mı — asıl güvence `points_entry_reversal_key`te. */
  async hasReversalFor(customerId: string, reason: PointsReason, refId: string): Promise<boolean> {
    const rows = await this.getAll(
      { customerId, reason, refId },
      { rangeFilters: [{ field: 'points', operator: 'lt', value: 0 }], limit: 1 },
    );
    return rows.length > 0;
  }

  /**
   * KAYNAKSIZ sebepler için günlük tekillik nezaketi (bugün ziyaret puanı yazıldı mı).
   *
   * **Gün İŞLETMENİN günüdür** (`startOfBusinessDay`) — `earnedToday` ve `points_entry_visit_day`
   * kısmi unique indeksiyle BİREBİR aynı tanım. Üç yerin aynı günü kullanması şart: buradaki
   * kontrol başka bir gün tanımı kullansaydı uygulama "kazanabilirsin" der, veritabanı reddederdi.
   *
   * Asıl güvence indekste; bu yalnız gereksiz bir yazma turunu önleyen nezaket.
   */
  async hasEntryOnBusinessDay(customerId: string, reason: PointsReason, now: Date = new Date()): Promise<boolean> {
    const rows = await this.getAll(
      { customerId, reason },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: startOfBusinessDay(now).toISOString() }], limit: 1 },
    );
    return rows.length > 0;
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
   *
   * **RPC üzerinden okunuyor, görünümden DEĞİL** (operasyon talebi 03.08): ekranın başlığındaki
   * "Son 30 gün" seçicisi bir dönem ister ve toplamı dönemle daraltmanın yolu parametredir —
   * görünüm parametre alamaz. `since` verilmezse fonksiyon tüm zamanları toplar, yani dönemli ve
   * dönemsiz hâl AYNI kod yolundan geçer; iki ayrı uç olsaydı biri gün gelip ötekinden farklı bir
   * kural uygular ve fark hiçbir yerde hata vermezdi.
   *
   * **`since` verildiğinde `balance` bir DELTA'dır**, cüzdan bakiyesi değil — 30 günlük pencerede
   * "bakiye" diye okunacak bir sayı yoktur. Ekranın başlığı zaten dönemi yazıyor.
   */
  async listTop(limit = 50, since?: string): Promise<PointsBalance[]> {
    const rows = await this.executeRpc<unknown[]>('points_leaderboard', { p_since: since ?? null, p_limit: limit });
    return this.parseRows(rows);
  }
}
