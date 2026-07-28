import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADVERTISING_CATEGORY,
  AccountSchema,
  AccountInsertSchema,
  AccountUpdateSchema,
  AccountBalanceSchema,
  AccountLedgerRowSchema,
  MoneyMovementSchema,
  MoneyMovementInsertSchema,
  MoneyMovementUpdateSchema,
  OrderAmountsSchema,
  DEFAULT_PAGE_SIZE,
  type Account,
  type AccountBalance,
  type AccountInsert,
  type AccountLedgerRow,
  type AccountUpdate,
  type KeysetCursor,
  type MoneyMovement,
  type MoneyMovementInsert,
  type MoneyMovementUpdate,
  type MovementType,
  type OrderAmounts,
  type Page,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Hesap servisi (12.1) — DOMAIN §9. Kasa, bankalar ve Stripe: hepsi birer hesap; "online havuz"
 * ayrı bir kavram değildir.
 *
 * **Bakiye SAKLANMAZ**, `account_balance` görünümünden okunur — saklanan bakiye bir gün kayar ve
 * hangi hareketin kaydırdığı bulunamaz (DATA_MODEL kalıcı kararlar).
 */
export class AccountService extends BaseDbService<Account, AccountInsert, AccountUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'account', AccountSchema, AccountInsertSchema, AccountUpdateSchema);
  }

  /** Hesaplar — ada göre. Pasif hesap listede kalır (geçmişi ona bağlı), yeni harekete kapanır. */
  list(opts: { activeOnly?: boolean } = {}): Promise<Account[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }

  /** Hesap kapatma: SİLME değil pasifleştirme — kapanan banka hesabı da tarihtir. */
  deactivate(id: string): Promise<Account> {
    return this.update({ id, isActive: false });
  }

  /** Tek hesabın bakiyesi (hareketlerden türetilir). Hiç hareketi yoksa 0 döner, null değil. */
  async balance(accountId: string): Promise<AccountBalance> {
    const { data, error } = await this.supabase.from('account_balance').select('*').eq('account_id', accountId).maybeSingle();
    if (error) throw error;
    return data ? AccountBalanceSchema.parse(dbToApp(data)) : { accountId, balance: 0, movementCount: 0 };
  }

  /**
   * Tüm hesapların bakiyesi TEK sorguda — hesap başına ayrı sorgu (N+1) yerine görünümün tamamı.
   * Para özeti ekranının okuması budur. Dönen harita eksik anahtar bırakmaz.
   */
  async balances(): Promise<Map<string, AccountBalance>> {
    const { data, error } = await this.supabase.from('account_balance').select('*');
    if (error) throw error;
    const rows = (data ?? []).map((row) => AccountBalanceSchema.parse(dbToApp(row)));
    return new Map(rows.map((row) => [row.accountId, row]));
  }
}

/**
 * **Defter** (`account_movement` görünümü) — bir hareket dokunduğu HER hesapta bir satır üretir:
 * normal hareket bir, transfer iki (karşı uçta işaret ters). Hesap ekstresi bu görünümden okunur,
 * ham hareket tablosundan değil; yoksa transferin karşı ucu ekstrede hiç görünmezdi.
 *
 * **Salt okunur:** görünüme yazılmaz. Kendi sınıfı olmasının sebebi teknik: keyset sayfalama
 * `tableName`'e bağlıdır (junction tablosu = kendi alt sınıfı kuralının aynısı). Yazım tek yoldan,
 * `MoneyMovementService` üzerinden yapılır.
 */
class AccountLedgerService extends BaseDbService<AccountLedgerRow, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'account_movement', AccountLedgerRowSchema, AccountLedgerRowSchema as never, AccountLedgerRowSchema as never, false);
  }

  page(
    accountId: string,
    opts: { cursor?: KeysetCursor; limit?: number; from?: string; to?: string; unreconciledOnly?: boolean } = {},
  ): Promise<Page<AccountLedgerRow>> {
    const rangeFilters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
    if (opts.from) rangeFilters.push({ field: 'valueDate', operator: 'gte', value: opts.from });
    if (opts.to) rangeFilters.push({ field: 'valueDate', operator: 'lte', value: opts.to });

    return this.getPage(
      { ledgerAccountId: accountId, ...(opts.unreconciledOnly ? { reconciled: false } : {}) },
      {
        orderBy: 'valueDate',
        orderDirection: 'desc',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
        rangeFilters,
      },
    );
  }
}

/** Dönem toplamı — kâr ve nakit akışı raporlarının ham girdisi (12.6). */
export interface PeriodTotal {
  type: MovementType;
  direction: 'in' | 'out';
  total: number;
  count: number;
}

/** Kampanya başına reklam gideri (12.5) — 13.2'nin ROI tablosunda cironun yanına gelen sütun. */
export interface CampaignSpend {
  /** `meta.campaign` etiketi. **Etiketsiz reklam gideri `null` kovasında toplanır**, atılmaz. */
  campaign: string | null;
  /** NET gider: çıkışlar artı, geri gelen para (reklam iadesi/kredisi) eksi. */
  total: number;
  count: number;
}

/**
 * Para hareketi servisi (12.1) — DOMAIN §9. **Tüm finans tek tablo:** kasa hareketi ile banka
 * hareketi aynı şeydir, yalnız hesabı farklıdır.
 *
 * **Karar vermez, satır getirir/yazar** (STACK §4). "Bu hareket tutarlı mı" kararı saf motordadır
 * (`domain-core/money.validateMovement`); ikisini birleştiren kapı uygulama katmanındadır.
 *
 * **RPC yok — bilerek:** yazım tek tabloya, tek satıra gider (transfer bile TEK satırdır). Ne
 * eşzamanlılık yarışı var (bakiye saklanmıyor ki yarışsın) ne bölünemez çok-tablolu yazım
 * (STACK §13 dar listesi). Siparişin `amount_*` cache'ini de güncelleyen yazım 12.2'de gelir;
 * RPC eşiğini o karşılar.
 */
export class MoneyMovementService extends BaseDbService<MoneyMovement, MoneyMovementInsert, MoneyMovementUpdate> {
  private readonly defter: AccountLedgerService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'money_movement', MoneyMovementSchema, MoneyMovementInsertSchema, MoneyMovementUpdateSchema);
    this.defter = new AccountLedgerService(supabase);
  }

  /**
   * **Hesap ekstresi** — defterden okunur (transferin karşı ucu dâhil, işareti ters). Değer tarihine
   * göre en yeni önce, keyset sayfalı (sonsuz kaydırma).
   */
  ledger(
    accountId: string,
    opts: { cursor?: KeysetCursor; limit?: number; from?: string; to?: string; unreconciledOnly?: boolean } = {},
  ): Promise<Page<AccountLedgerRow>> {
    return this.defter.page(accountId, opts);
  }

  /** Siparişin para hareketleri — tahsilat/iade toplamı (`amount_*` cache'inin kaynağı, 12.2). */
  listByOrder(orderId: string): Promise<MoneyMovement[]> {
    return this.getAll({ orderId }, { orderBy: 'valueDate' });
  }

  /**
   * **Sipariş tahsilatı / iadesi** (12.2) — hareket + siparişin `amount_*` cache'i tek transaction'da
   * (`record_order_movement`). Yön sebepten türer: tahsilat içeri, iade dışarı.
   *
   * Cache ARTIRILMAZ, hareketlerden yeniden hesaplanır — kaçırılan ya da tekrarlanan çağrı kalıcı
   * bir sapma bırakmasın.
   */
  async recordForOrder(input: {
    orderId: string;
    accountId: string;
    amount: number;
    type: 'order_payment' | 'order_refund';
    valueDate?: string;
    description?: string | null;
    source?: 'manual' | 'bank_import';
  }): Promise<OrderAmounts> {
    const raw = await this.executeRpc('record_order_movement', {
      p_order_id: input.orderId,
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_type: input.type,
      p_value_date: input.valueDate ?? new Date().toISOString().slice(0, 10),
      p_description: input.description ?? null,
      p_source: input.source ?? 'manual',
    });
    return OrderAmountsSchema.parse(dbToApp(raw));
  }

  /**
   * Cache'i kaynaktan yeniden kurar. Hareket silinir/düzeltilirse ya da kayma şüphesi olursa tek
   * çağrıyla gerçeğe dönülür — cache'in kendini düzeltebilmesi, saklanan sayının kabul edilebilir
   * olmasının şartıdır.
   */
  async resyncOrder(orderId: string): Promise<OrderAmounts> {
    const raw = await this.executeRpc('resync_order_amounts', { p_order_id: orderId });
    return OrderAmountsSchema.parse(dbToApp(raw));
  }

  /** Tedarikçiye yapılan ödemeler — borç türetimi (Σ giriş − Σ ödeme, 12.3). */
  listBySupplier(supplierId: string): Promise<MoneyMovement[]> {
    return this.getAll({ supplierId }, { orderBy: 'valueDate' });
  }

  /**
   * Dönem toplamları tipe göre — kâr/nakit akışı raporlarının girdisi (12.6). Tek tablo olduğu için
   * okuma-RPC eşiğini karşılamaz (STACK §13); satırlar zaten dönemle sınırlı, toplama uygulamada.
   */
  async periodTotals(from: string, to: string): Promise<PeriodTotal[]> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('type,direction,amount')
      .gte('value_date', from)
      .lte('value_date', to);
    if (error) throw error;

    const kova = new Map<string, PeriodTotal>();
    for (const row of (data ?? []) as Array<{ type: MovementType; direction: 'in' | 'out'; amount: string | number }>) {
      const key = `${row.type}:${row.direction}`;
      const mevcut = kova.get(key) ?? { type: row.type, direction: row.direction, total: 0, count: 0 };
      mevcut.total = Math.round((mevcut.total + Number(row.amount)) * 100) / 100;
      mevcut.count += 1;
      kova.set(key, mevcut);
    }
    return [...kova.values()];
  }

  /**
   * **Kampanya başına reklam gideri** (12.5) — 13.2'nin ROI tablosu bunu cironun yanına koyar.
   *
   * Süzgeç TİP değil KATEGORİDİR (`advertising`): reklam parası çoğu zaman `expense` olarak girer
   * ama ajansa yapılan bir `misc` ödeme de reklam gideridir; tipe göre süzseydik ROI'nin gider
   * tarafı olduğundan küçük, kampanya kârlı görünürdü.
   *
   * **Etiketsiz satır atılmaz**, `campaign: null` kovasında toplanır: kampanyaların toplamı ile
   * dönemin gerçek reklam gideri BİRBİRİNİ TUTMALIDIR. Etiketsizi düşürseydik rapor eksik gideri
   * hiç göstermez, ROI kendiliğinden şişerdi.
   */
  async campaignSpend(from: string, to: string): Promise<CampaignSpend[]> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('direction,amount,meta')
      .eq('category', ADVERTISING_CATEGORY)
      .gte('value_date', from)
      .lte('value_date', to);
    if (error) throw error;

    const kova = new Map<string | null, CampaignSpend>();
    for (const row of (data ?? []) as Array<{ direction: 'in' | 'out'; amount: string | number; meta: Record<string, unknown> | null }>) {
      const etiket = row.meta?.['campaign'];
      const campaign = typeof etiket === 'string' && etiket.trim() ? etiket.trim() : null;
      // Geri gelen para gideri AZALTIR — iptal edilen reklamın parası gider olarak kalmamalı.
      const net = row.direction === 'out' ? Number(row.amount) : -Number(row.amount);

      const mevcut = kova.get(campaign) ?? { campaign, total: 0, count: 0 };
      mevcut.total = Math.round((mevcut.total + net) * 100) / 100;
      mevcut.count += 1;
      kova.set(campaign, mevcut);
    }
    return [...kova.values()].sort((a, b) => b.total - a.total);
  }

  /** Banka ekstresiyle eşleşti işareti (12.4) — eşleşme kuyruğu bunu boşaltır. */
  markReconciled(id: string, reconciled = true): Promise<MoneyMovement> {
    return this.update({ id, reconciled });
  }
}
