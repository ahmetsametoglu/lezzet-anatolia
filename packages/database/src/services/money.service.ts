import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADVERTISING_NATURE,
  AccountSchema,
  AccountInsertSchema,
  AccountUpdateSchema,
  AccountBalanceSchema,
  AccountLedgerRowSchema,
  CounterpartyInsertSchema,
  CounterpartySchema,
  CounterpartyUpdateSchema,
  MoneyAllocationInsertSchema,
  MoneyAllocationSchema,
  MoneyDocumentBalanceSchema,
  MoneyDocumentInsertSchema,
  MoneyDocumentSchema,
  MoneyDocumentUpdateSchema,
  MoneyMovementSchema,
  MoneyMovementInsertSchema,
  MoneyMovementUpdateSchema,
  MovementNatureInsertSchema,
  MovementNatureSchema,
  MovementNatureUpdateSchema,
  MovementTagInsertSchema,
  MovementTagSchema,
  MovementTagUpdateSchema,
  OrderAmountsSchema,
  StockIntakeBalanceSchema,
  DEFAULT_PAGE_SIZE,
  type Account,
  type AccountBalance,
  type AccountInsert,
  type AccountLedgerRow,
  type AccountUpdate,
  type Counterparty,
  type CounterpartyInsert,
  type CounterpartyUpdate,
  type KeysetCursor,
  type MoneyAllocation,
  type MoneyAllocationInsert,
  type MoneyDocument,
  type MoneyDocumentBalance,
  type MoneyDocumentInsert,
  type MoneyDocumentUpdate,
  type MoneyMovement,
  type MoneyMovementInsert,
  type MoneyMovementUpdate,
  type MovementNature,
  type MovementNatureInsert,
  type MovementNatureUpdate,
  type MovementSource,
  type MovementTag,
  type MovementTagInsert,
  type MovementTagUpdate,
  type MovementType,
  type OrderAmounts,
  type Page,
  type PaymentMethod,
  type StockIntakeBalance,
} from '@lezzet/types';
import { fromCents, toCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';
import { rpcMoneyToCents } from '../utils/rpc-money';

/**
 * Hesap servisi (DOMAIN §9): kasa, bankalar ve ödeme sağlayıcısı birer hesaptır. Bakiye saklanmaz, `account_balance` görünümünden
 * okunur, çünkü saklanan bakiye bir gün kayar ve hangi hareketin kaydırdığı bulunamaz.
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
    if (!data) return { accountId, balanceCents: 0, movementCount: 0 };
    // Görünüm `balance`ı euro toplar; uygulama cent konuşur (STACK §8).
    return AccountBalanceSchema.parse(rpcMoneyToCents(dbToApp(data), ['balance']));
  }

  /** Bütün hesapların bakiyesi tek sorguda, hesap başına sorgu (N+1) yerine; dönen harita eksik anahtar bırakmaz. */
  async balances(): Promise<Map<string, AccountBalance>> {
    const { data, error } = await this.supabase.from('account_balance').select('*');
    if (error) throw error;
    const rows = (data ?? []).map((row) => AccountBalanceSchema.parse(rpcMoneyToCents(dbToApp(row), ['balance'])));
    return new Map(rows.map((row) => [row.accountId, row]));
  }
}

/**
 * Defter (`account_movement` görünümü): hareket dokunduğu her hesapta bir satır üretir, transfer iki; ekstre buradan okunur, yoksa
 * transferin karşı ucu görünmezdi. Salt okunurdur ve kendi sınıfı keyset sayfalama `tableName`'e bağlı olduğu için var.
 */
class AccountLedgerService extends BaseDbService<AccountLedgerRow, never, never> {
  /** Görünüm hareketin `amount`ını ve türetilmiş `signed_amount`ı taşır — ikisi de euro (STACK §8). */
  protected override readonly moneyFields = ['amountCents', 'signedAmountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'account_movement', AccountLedgerRowSchema, AccountLedgerRowSchema as never, AccountLedgerRowSchema as never, false);
  }

  page(opts: LedgerFilter = {}): Promise<Page<AccountLedgerRow>> {
    const rangeFilters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
    if (opts.from) rangeFilters.push({ field: 'valueDate', operator: 'gte', value: opts.from });
    if (opts.to) rangeFilters.push({ field: 'valueDate', operator: 'lte', value: opts.to });

    return this.getPage(
      {
        // Hesap zorunlu değil, bir süzgeçtir: liste tektir, zorunlu imza ekranı açılışta boş bırakır ya da bir hesabı keyfî öne alırdı.
        ledgerAccountId: opts.accountId,
        type: opts.type,
        ...(opts.unreconciledOnly ? { reconciled: false } : {}),
        ...(opts.unexplainedOnly ? { explained: false } : {}),
      },
      {
        orderBy: 'valueDate',
        orderDirection: 'desc',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
        rangeFilters,
      },
    );
  }

  /** Tek hareketin defter satırları — transferde iki (gönderen ve alan hesabın defteri). */
  rowsOf(movementId: string): Promise<AccountLedgerRow[]> {
    return this.getAll({ id: movementId });
  }

  /**
   * İzah edilmemiş hareket sayısı, süzgeçten bağımsız: sayfadan sayılsaydı kuyruğun kuyruğu atlanırdı. `reconciled` değil
   * `explained` sayılır ve ham tablodan okunur, çünkü eşleşme bayrağı yalnız banka satırında anlamlıdır ve görünüm transferi iki satır üretir.
   */
  async unexplainedCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('money_movement')
      .select('id', { count: 'exact', head: true })
      .eq('explained', false);
    if (error) throw error;
    return count ?? 0;
  }
}

/** Defter süzgeci; hepsi isteğe bağlıdır ve süzgeçsiz çağrı defterin tamamını sayfalar. `accountId` eksen değil daraltmadır. */
export interface LedgerFilter {
  accountId?: string;
  /** Hareket tipi — tasarımın süzgeç barındaki "+ tip" çipi. Kapalı enum, ek indeks istemiyor. */
  type?: MovementType;
  cursor?: KeysetCursor;
  limit?: number;
  from?: string;
  to?: string;
  /** Yalnız banka ekstresiyle eşleşmemiş satırlar — banka kuyruğunun süzgeci (yalnız `bank_import` satırında anlamlı). */
  unreconciledOnly?: boolean;
  /** Yalnız izah edilmemiş hareketler — ekranın "izah bekliyor" kapsamı. */
  unexplainedOnly?: boolean;
}

/** Dönem toplamı — kâr ve nakit akışı raporlarının ham girdisi. */
export interface PeriodTotal {
  type: MovementType;
  direction: 'in' | 'out';
  totalCents: number;
  count: number;
}

/** Kampanya başına reklam gideri — kampanya kârlılık tablosunda cironun yanına gelen sütun. */
export interface CampaignSpend {
  /** `meta.campaign` etiketi. **Etiketsiz reklam gideri `null` kovasında toplanır**, atılmaz. */
  campaign: string | null;
  /** NET gider (**cent**): çıkışlar artı, geri gelen para (reklam iadesi/kredisi) eksi. */
  totalCents: number;
  count: number;
}

/**
 * Para hareketi servisi (DOMAIN §9): bütün finans tek tablodadır, kasa ile banka hareketi yalnız hesabıyla ayrışır. Karar vermez,
 * satır getirir ve yazar; tutarlılık kararı motorda (`validateMovement`), sipariş parası RPC'de (`record_order_movement`).
 */
export class MoneyMovementService extends BaseDbService<MoneyMovement, MoneyMovementInsert, MoneyMovementUpdate> {
  /** Kolon `money_movement.amount` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents'];

  private readonly ledgerView: AccountLedgerService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'money_movement', MoneyMovementSchema, MoneyMovementInsertSchema, MoneyMovementUpdateSchema);
    this.ledgerView = new AccountLedgerService(supabase);
  }

  /**
   * Defter listesi, hesap seçili ya da hesap-üstü; değer tarihine göre en yeni önce, keyset sayfalı. Transfer "Tümü"nde de iki
   * satırdır ve toplam bu yüzden "para işletmeden çıkmadı" der; tek satır isteyen okuma ham `money_movement`a bakar.
   */
  ledger(opts: LedgerFilter = {}): Promise<Page<AccountLedgerRow>> {
    return this.ledgerView.page(opts);
  }

  /** Tek hareketin defter satırları; "devamını yükle" ile gelmiş satır yazımdan sonra kendisi okunur, liste baştan çekilmez. */
  ledgerRows(movementId: string): Promise<AccountLedgerRow[]> {
    return this.ledgerView.rowsOf(movementId);
  }

  /** İzah edilmemiş hareket sayısı — süzgeçten bağımsız iş kuyruğu rozeti. */
  unexplainedCount(): Promise<number> {
    return this.ledgerView.unexplainedCount();
  }

  /**
   * İzah edilmemiş hareketler, en yeni önce ve keyset sayfalı, çünkü banka dosyası bir kerede yüzlerce satır düşürebilir. Ham
   * tablodan okunur: kuyruk bir hareketi bir kez gösterir, transfer zaten izahlıdır.
   */
  listUnexplained(opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<MoneyMovement>> {
    return this.getPage(
      { explained: false },
      { orderBy: 'valueDate', orderDirection: 'desc', keysetAfter: opts.cursor, limit: opts.limit ?? DEFAULT_PAGE_SIZE },
    );
  }

  /** Kimlik listesiyle hareketler — belge panelinin ödemeleri bağlarından tek turda okunur. */
  listByIds(ids: readonly string[]): Promise<MoneyMovement[]> {
    return this.getByIds([...ids]);
  }

  /** Siparişin para hareketleri — tahsilat ve iade toplamı (`amount_*` önbelleğinin kaynağı). */
  listByOrder(orderId: string): Promise<MoneyMovement[]> {
    return this.getAll({ orderId }, { orderBy: 'valueDate' });
  }

  /** Günün sipariş para hareketleri (tahsilat ve iade); gün sonunun günü `value_date`tir, kayıt anı değil. */
  listOrderMoneyOfDay(date: string): Promise<MoneyMovement[]> {
    return this.getAll({ type: ['order_payment', 'order_refund'], valueDate: date });
  }

  /**
   * Çok siparişin hareketleri tek turda; ödeme karnesi "ne zaman ödedi" sorusunu buradan yanıtlar. Kimlikler öbeklenir, çünkü
   * `in(...)` listesi URL'e gömülüyor.
   */
  async listByOrders(orderIds: readonly string[]): Promise<MoneyMovement[]> {
    const BATCH_SIZE = 200;
    const all: MoneyMovement[] = [];
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      all.push(...(await this.getAll({ orderId: orderIds.slice(i, i + BATCH_SIZE) }, { orderBy: 'valueDate' })));
    }
    return all;
  }

  /**
   * Sipariş tahsilatı ya da iadesi: hareket ve siparişin `amount_*` önbelleği tek işlemde (`record_order_movement`). Önbellek
   * artırılmaz, hareketlerden yeniden hesaplanır ki kaçırılan ya da tekrarlanan çağrı kalıcı sapma bırakmasın.
   */
  async recordForOrder(input: {
    orderId: string;
    accountId: string;
    amountCents: number;
    type: 'order_payment' | 'order_refund';
    valueDate?: string;
    description?: string | null;
    /** Kim yazdı: sistemin kendi akışları `system` geçer; verilmezse kolon varsayılanı `manual`. */
    source?: MovementSource;
    /** Sağlayıcı künyesi — `{ providerRef: 'pi_...' }`. İade bu referansın üzerinden döner. */
    meta?: Record<string, unknown> | null;
    /**
     * Yazımın kimliği: aynı anahtarla ikinci çağrı yazmaz, ilkin sonucunu `deduped: true` ile döndürür. Verilmezse yazım korumasızdır
     * ve bu meşrudur, elle girilen hareketin tekrarı bir karardır.
     */
    idempotencyKey?: string | null;
    /** Paranın yöntemi; sertifikalı kasa nakit, kart, çevrim içi ve havaleyi ayrı ister. */
    paymentMethod?: PaymentMethod | null;
  }): Promise<OrderAmounts> {
    const raw = await this.executeRpc('record_order_movement', {
      p_order_id: input.orderId,
      p_account_id: input.accountId,
      // RPC euro konuşuyor (kolonlarla aynı taban); uygulama cent — çevrim bu sınırda.
      p_amount: fromCents(input.amountCents),
      p_type: input.type,
      p_value_date: input.valueDate ?? new Date().toISOString().slice(0, 10),
      p_description: input.description ?? null,
      p_source: input.source ?? 'manual',
      p_meta: input.meta ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_payment_method: input.paymentMethod ?? null,
    });
    return OrderAmountsSchema.parse(rpcMoneyToCents(dbToApp(raw), ['amountCollected', 'amountRefunded']));
  }

  /**
   * Sağlayıcı künyesinden hareketi bulur; iade olayı bize sipariş kimliğiyle değil yalnız ödeme kimliğiyle gelir. Tekillik aranmaz,
   * en yenisi alınır: aynı ödemenin bütün hareketleri aynı siparişe aittir.
   */
  async findByProviderRef(providerRef: string): Promise<MoneyMovement | null> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('*')
      .eq('meta->>providerRef', providerRef)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    // `parseRows` ile, çünkü para eşlemesi ondadır; ham `parse` euro satırı cent şemasıyla doğrulamaya kalkıp düşerdi.
    return data?.[0] ? (this.parseRows([data[0]])[0] ?? null) : null;
  }

  /** Önbelleği kaynaktan yeniden kurar; hareket silinir ya da düzeltilirse tek çağrıyla gerçeğe dönülür. */
  async resyncOrder(orderId: string): Promise<OrderAmounts> {
    const raw = await this.executeRpc('resync_order_amounts', { p_order_id: orderId });
    return OrderAmountsSchema.parse(rpcMoneyToCents(dbToApp(raw), ['amountCollected', 'amountRefunded']));
  }

  /**
   * Dönemin bütün hareketleri, ham tablodan (transfer tek satır), sayfa sayfa çekilip birleştirilir: tek sorgu PostgREST'in satır
   * tavanında (1000) sessizce kesilir ve döküm eksik çıkardı. Okuma tam okuma içindir, imleç dışarı sızmaz.
   */
  async listPeriod(from: string, to: string): Promise<MoneyMovement[]> {
    const BATCH_SIZE = 500;
    const all: MoneyMovement[] = [];
    let cursor: KeysetCursor | undefined;
    do {
      const page = await this.getPage(
        {},
        {
          orderBy: 'valueDate',
          keysetAfter: cursor,
          limit: BATCH_SIZE,
          rangeFilters: [
            { field: 'valueDate', operator: 'gte', value: from },
            { field: 'valueDate', operator: 'lte', value: to },
          ],
        },
      );
      all.push(...page.rows);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }

  /** Tedarikçiye yapılan ödemeler — borç türetimi (Σ giriş − Σ ödeme). */
  listBySupplier(supplierId: string): Promise<MoneyMovement[]> {
    return this.getAll({ supplierId }, { orderBy: 'valueDate' });
  }

  /** Dönem toplamları tipe göre — kâr ve nakit akışı raporlarının girdisi; satırlar dönemle sınırlı, toplama uygulamada. */
  async periodTotals(from: string, to: string): Promise<PeriodTotal[]> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('type,direction,amount')
      .gte('value_date', from)
      .lte('value_date', to);
    if (error) throw error;

    const buckets = new Map<string, PeriodTotal>();
    for (const row of (data ?? []) as Array<{ type: MovementType; direction: 'in' | 'out'; amount: string | number }>) {
      const key = `${row.type}:${row.direction}`;
      const current = buckets.get(key) ?? { type: row.type, direction: row.direction, totalCents: 0, count: 0 };
      // Toplama cent'te ve tamsayıda, çünkü euro toplamı her satırda kayan nokta artığı biriktirirdi.
      current.totalCents += toCents(Number(row.amount));
      current.count += 1;
      buckets.set(key, current);
    }
    return [...buckets.values()];
  }

  /**
   * Kampanya başına reklam gideri; süzgeç tip değil türdür (`reklam`), çünkü reklam kredisi `misc` olarak girer ve tipe göre süzmek
   * gideri eksik gösterirdi. Künyesiz satır `campaign: null` kovasında toplanır, atılsaydı kampanyalar kârlı görünürdü.
   */
  async campaignSpend(from: string, to: string): Promise<CampaignSpend[]> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('direction,amount,meta')
      .eq('nature', ADVERTISING_NATURE)
      .gte('value_date', from)
      .lte('value_date', to);
    if (error) throw error;

    const buckets = new Map<string | null, CampaignSpend>();
    for (const row of (data ?? []) as Array<{ direction: 'in' | 'out'; amount: string | number; meta: Record<string, unknown> | null }>) {
      const tag = row.meta?.['campaign'];
      const campaign = typeof tag === 'string' && tag.trim() ? tag.trim() : null;
      // Geri gelen para gideri AZALTIR — iptal edilen reklamın parası gider olarak kalmamalı.
      const netCents = toCents(Number(row.amount)) * (row.direction === 'out' ? 1 : -1);

      const current = buckets.get(campaign) ?? { campaign, totalCents: 0, count: 0 };
      current.totalCents += netCents;
      current.count += 1;
      buckets.set(campaign, current);
    }
    return [...buckets.values()].sort((a, b) => b.totalCents - a.totalCents);
  }

  /**
   * Karşı ucu bekleyen transfer uçları: karşı hesabı bu banka olan ve henüz hiçbir ekstre satırının sahiplenmediği transferler
   * (kasadan yatırma, payout, ortaktan dönüş). "Sahiplenilmemiş" süzgeci PostgREST'te alt sorgu isterdi; fark bellekte alınır.
   */
  async listTransferLegsAwaiting(counterAccountId: string): Promise<MoneyMovement[]> {
    const [legs, claimed] = await Promise.all([
      this.getAll({ type: 'transfer', counterAccountId }, { orderBy: 'valueDate', orderDirection: 'desc' }),
      this.getAll({ accountId: counterAccountId }, { isNotNullFields: ['counterpartMovementId'] }),
    ]);
    const taken = new Set(claimed.map((row) => row.counterpartMovementId));
    return legs.filter((leg) => !taken.has(leg.id));
  }

  /** Bu hesaba ekstre dışından (elle ya da sistem) yazılmış hareketler — "bunu zaten yazmıştım" adayları; pencere çağıranındır. */
  listProvisional(accountId: string, from: string, to: string): Promise<MoneyMovement[]> {
    return this.getAll(
      { accountId, source: ['manual', 'system'] },
      {
        orderBy: 'valueDate',
        orderDirection: 'desc',
        rangeFilters: [
          { field: 'valueDate', operator: 'gte', value: from },
          { field: 'valueDate', operator: 'lte', value: to },
        ],
      },
    );
  }

  /** Ekstre satırı elle yazılanı yutar, tek işlemde (`absorb_provisional_movement`): bağlar geçer, elle yazılan silinir, izi künyede kalır. */
  async absorbProvisional(statementId: string, provisionalId: string): Promise<MoneyMovement> {
    await this.executeRpc('absorb_provisional_movement', { p_statement_id: statementId, p_provisional_id: provisionalId });
    const row = await this.getById(statementId);
    if (!row) throw new Error(`absorb: ekstre satırı yutmadan sonra okunamadı (${statementId})`);
    return row;
  }

  /**
   * Ekstre satırının eşleşmesini geri alır, tek işlemde (`unmatch_bank_movement`): bağlar düşer, satır ekstreden geldiği hâle döner.
   * "Zaten yazmıştım" birleşmesiyse elle yazılan satır künyesinden yeniden kurulur ve kimliği döner; yoksa `null`.
   */
  async unmatchBankMovement(id: string): Promise<string | null> {
    const restored = await this.executeRpc<string | null>('unmatch_bank_movement', { p_movement_id: id });
    return restored ?? null;
  }

  /**
   * Bir kez yazar: anahtar daha önce yazılmışsa `null` döner, çünkü webhook aynı olayı tekrar gönderebilir ve kararı veritabanı
   * verir (`money_movement_idempotency_key`). Anahtarsız çağrı `insert`ten farksız olacağı için reddedilir.
   */
  async insertOnce(row: MoneyMovementInsert & { idempotencyKey: string }): Promise<MoneyMovement | null> {
    if (!row.idempotencyKey) throw new Error('insertOnce: yazım kimliği (idempotencyKey) boş olamaz');
    return this.insertIgnoringConflict(row);
  }

  /** Banka ekstresiyle eşleşti işareti — eşleşme kuyruğu bunu boşaltır. */
  markReconciled(id: string, reconciled = true): Promise<MoneyMovement> {
    return this.update({ id, reconciled });
  }

  /**
   * Banka satırlarını yazar, zaten var olanı atlar: mükerreri veritabanı karar verir (`money_movement_import_key`), çünkü "önce
   * sorgula" iki eşzamanlı yüklemede ikisini de yazardı. Dönüş yalnız gerçekten yazılanları taşır, atlanan sayısı ekranda görünür.
   */
  async insertImported(rows: MoneyMovementInsert[]): Promise<MoneyMovement[]> {
    if (rows.length === 0) return [];
    return this.bulkUpsertIgnoring(rows, 'account_id,import_fingerprint');
  }
}

/**
 * Etiket sözlüğü: işletmenin serbest işaretleri, izah sayılmaz; veritabanı tanımadığı etiketi reddeder (`check_tags_known`).
 * Anahtarı `slug` olduğu için pasifleştirme anahtarla yazan taban yöntemiyle (`updateWhereIn`) yapılır.
 */
export class MovementTagService extends BaseDbService<MovementTag, MovementTagInsert, MovementTagUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'movement_tag', MovementTagSchema, MovementTagInsertSchema, MovementTagUpdateSchema);
  }

  /** Sözlük — okunur ada göre. `activeOnly` yeni harekete sunulacak kümeyi verir; pasifler eski satırlarda kalır. */
  list(opts: { activeOnly?: boolean } = {}): Promise<MovementTag[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'label' });
  }

  /** Etiket SİLİNMEZ, pasifleşir: eski hareketler onu taşımaya devam eder (hesabın kapanmasıyla aynı). */
  async setActive(slug: string, isActive: boolean): Promise<MovementTag> {
    await this.updateWhereIn('slug', [slug], { isActive });
    const row = await this.getOneBy({ slug });
    if (!row) throw new Error(`[movement_tag] güncellenen etiket okunamadı (${slug})`);
    return row;
  }
}

/**
 * Tür sözlüğü — "bu para neyin parası": hareketin ve belgenin tek sınıflandırması (`nature`, FK), isteğe bağlı hesap planı koduyla.
 * Anahtar `slug`tır ve tür silinmez, pasifleşir.
 */
export class MovementNatureService extends BaseDbService<MovementNature, MovementNatureInsert, MovementNatureUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'movement_nature', MovementNatureSchema, MovementNatureInsertSchema, MovementNatureUpdateSchema);
  }

  /** Sözlük — okunur ada göre; doğal tavanlı (operatörün kurduğu küme), tek turda. */
  list(opts: { activeOnly?: boolean } = {}): Promise<MovementNature[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'label' });
  }

  /** Adı, yönü, kodu ve etkinliği yazar; slug DEĞİŞMEZ — hareketler ve belgeler onu taşıyor. */
  async updateBySlug(
    slug: string,
    patch: Partial<Pick<MovementNature, 'label' | 'direction' | 'accountCode' | 'isActive'>>,
  ): Promise<MovementNature> {
    await this.updateWhereIn('slug', [slug], patch);
    const row = await this.getOneBy({ slug });
    if (!row) throw new Error(`[movement_nature] güncellenen tür okunamadı (${slug})`);
    return row;
  }
}

/**
 * Cari: kurum, hizmet veren, çalışan; tedarikçi (stok modülünün `supplier`ı) ve ortak (cari hesabı) burada değil. Silinmez,
 * pasifleşir, çünkü geçmiş hareketleri ve belgeleri ona bağlıdır.
 */
export class CounterpartyService extends BaseDbService<Counterparty, CounterpartyInsert, CounterpartyUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'counterparty', CounterpartySchema, CounterpartyInsertSchema, CounterpartyUpdateSchema);
  }

  /** Cariler — ada göre; doğal tavanlı (işletmenin elle kurduğu liste), tek turda. */
  list(opts: { activeOnly?: boolean } = {}): Promise<Counterparty[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }
}

/**
 * Belge bağı, hareket ↔ belge tutarıyla: bir havale birkaç faturayı, bir fatura birkaç ödemeyi kapatır. Bağlar hareketin tutarını
 * aşamaz ve kararı veritabanı verir (`check_allocation_within_movement`); kapı yalnız okunur bir ret için önce sorar.
 */
export class MoneyAllocationService extends BaseDbService<MoneyAllocation, MoneyAllocationInsert, never> {
  /** Kolon `amount` euro `numeric`; app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'money_allocation', MoneyAllocationSchema, MoneyAllocationInsertSchema, MoneyAllocationSchema as never);
  }

  /** Çok hareketin bağları tek turda — defter ve döküm "hangi belge" sorusunu buradan yanıtlar; kimlikler öbeklenir. */
  async listByMovements(movementIds: readonly string[]): Promise<MoneyAllocation[]> {
    const BATCH_SIZE = 200;
    const all: MoneyAllocation[] = [];
    for (let i = 0; i < movementIds.length; i += BATCH_SIZE) {
      all.push(...(await this.getAll({ movementId: movementIds.slice(i, i + BATCH_SIZE) }, { orderBy: 'createdAt' })));
    }
    return all;
  }

  /** Belgelerin bağları tek turda — belge paneli "hangi hareketlerle kapandı" sorusunu buradan yanıtlar; kimlikler öbeklenir. */
  async listByDocuments(documentIds: readonly string[]): Promise<MoneyAllocation[]> {
    const BATCH_SIZE = 200;
    const all: MoneyAllocation[] = [];
    for (let i = 0; i < documentIds.length; i += BATCH_SIZE) {
      all.push(...(await this.getAll({ documentId: documentIds.slice(i, i + BATCH_SIZE) }, { orderBy: 'createdAt' })));
    }
    return all;
  }

  /** Bir bağı kaldırır — hareket ve belge kalır. Kaldırılacak bağ yoksa `false` (çağıran "bulunamadı" der). */
  async remove(movementId: string, documentId: string): Promise<boolean> {
    if (!(await this.getOneBy({ movementId, documentId }))) return false;
    await this.deleteWhere({ movementId, documentId });
    return true;
  }
}

/**
 * Belge servisi: fatura, fiş, bordro, sözleşme, dekont. Belge para değildir, borç doğurur ve ödeme bağla (`money_allocation`)
 * bağlanır; açık kalan saklanmaz, `money_document_balance` görünümünden okunur.
 */
export class MoneyDocumentService extends BaseDbService<MoneyDocument, MoneyDocumentInsert, MoneyDocumentUpdate> {
  /** Kolonlar `amount` ve `vat_amount` euro `numeric`; app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents', 'vatAmountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'money_document', MoneyDocumentSchema, MoneyDocumentInsertSchema, MoneyDocumentUpdateSchema);
  }

  /** Belgeler — belge tarihine göre en yeni önce, keyset sayfalı (arşiv sınırsız büyür); `from`/`to` belge gününü süzer. */
  page(opts: { from?: string; to?: string; cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<MoneyDocument>> {
    const rangeFilters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
    if (opts.from) rangeFilters.push({ field: 'issuedOn', operator: 'gte', value: opts.from });
    if (opts.to) rangeFilters.push({ field: 'issuedOn', operator: 'lte', value: opts.to });
    return this.getPage(undefined, {
      orderBy: 'issuedOn',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      rangeFilters,
    });
  }

  /** Kimlik listesiyle belgeler — hareket dökümü satırların belgelerini tek turda okur. */
  listByIds(ids: readonly string[]): Promise<MoneyDocument[]> {
    return this.getByIds([...ids]);
  }

  /** Bir mal kabulün belgeleri — alım faturası mal kabulün üstünde görünsün. */
  listByIntake(stockIntakeId: string): Promise<MoneyDocument[]> {
    return this.getAll({ stockIntakeId }, { orderBy: 'issuedOn' });
  }

  /** Tedarik siparişlerinin belgeleri tek turda; faturası girilmiş sipariş "neyin faturası" seçicisinde bir daha önerilmez. */
  listByPurchaseOrders(purchaseOrderIds: readonly string[]): Promise<MoneyDocument[]> {
    if (purchaseOrderIds.length === 0) return Promise.resolve([]);
    // Dizi değer PostgREST'te `IN (…)` demektir (`FilterOptions` künyesi).
    return this.getAll({ purchaseOrderId: [...purchaseOrderIds] }, { orderBy: 'issuedOn' });
  }

  /** Numarasıyla belgeler, aynı faturanın ikinci kez girilmesini yakalamak için; numara tekil değildir, karşı tarafı çağıran süzer. */
  listByNumber(number: string): Promise<MoneyDocument[]> {
    return this.getAll({ number }, { orderBy: 'issuedOn' });
  }

  /** Belgelerin açık kalanı, görünümden tek turda; hiç ödemesi olmayan belge de satırdır (`left join`), açık kalanı tutarın kendisi. */
  async balances(documentIds: readonly string[]): Promise<Map<string, MoneyDocumentBalance>> {
    if (documentIds.length === 0) return new Map();
    const { data, error } = await this.supabase.from('money_document_balance').select('*').in('document_id', [...documentIds]);
    if (error) throw error;
    const rows = (data ?? []).map((row) =>
      MoneyDocumentBalanceSchema.parse(rpcMoneyToCents(dbToApp(row), ['amount', 'settled', 'openAmount'])),
    );
    return new Map(rows.map((row) => [row.documentId, row]));
  }

  /** Açık belgeler — kapanmamış borç ve alacaklar; açık kalanı sıfır olmayan her belge, kapanan düştüğü için tek turda. */
  async listOpen(): Promise<Array<MoneyDocument & { balance: MoneyDocumentBalance }>> {
    const { data, error } = await this.supabase.from('money_document_balance').select('*').neq('open_amount', 0);
    if (error) throw error;
    const balances = (data ?? []).map((row) =>
      MoneyDocumentBalanceSchema.parse(rpcMoneyToCents(dbToApp(row), ['amount', 'settled', 'openAmount'])),
    );
    if (balances.length === 0) return [];
    const docs = await this.getAll({ id: balances.map((b) => b.documentId) }, { orderBy: 'issuedOn' });
    const balanceOf = new Map(balances.map((b) => [b.documentId, b]));
    return docs.flatMap((doc) => {
      const balance = balanceOf.get(doc.id);
      return balance ? [{ ...doc, balance }] : [];
    });
  }
}

/**
 * Mal kabulün açık kalanı (`stock_intake_balance`): tedarikçi borcunun kabul başına türetimi, kabul tutarından kabule bağlı alım
 * ödemeleri düşülür. Görünüm salt okunurdur; kabul yazımı `StockIntakeService`ten, ödeme yazımı para kapısından geçer.
 */
export class StockIntakeBalanceService extends BaseDbService<StockIntakeBalance, never, never> {
  /** Görünüm kolonları `amount` / `paid` / `open_amount` euro `numeric`; app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents', 'paidCents', 'openAmountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'stock_intake_balance', StockIntakeBalanceSchema, StockIntakeBalanceSchema as never, StockIntakeBalanceSchema as never, false);
  }

  /** Ödenmemiş ve belgesiz kabuller; belgeli kabulün borcu belgede durur, burada ikinci kez aday olmaz. Doğal tavanlı, tek turda. */
  listOpen(): Promise<StockIntakeBalance[]> {
    return this.getAll(
      { hasDocument: false },
      { orderBy: 'date', orderDirection: 'desc', rangeFilters: [{ field: 'openAmountCents', operator: 'gt', value: 0 }] },
    );
  }

  /**
   * Bir tedarikçinin faturası girilmemiş kabulleri; açık kalanına bakılmaz, çünkü maliyetsiz yapılan kabulün tutarı sıfırdır ve
   * faturası tam da girilmesi gerekendir. Küme sınırsız büyür, seçici en yeni `limit` kabulü sabit sınırla sunar.
   */
  listWithoutDocument(supplierId: string, limit = 30): Promise<StockIntakeBalance[]> {
    return this.getAll({ supplierId, hasDocument: false }, { orderBy: 'date', orderDirection: 'desc', limit });
  }

  /** Tek kabulün borç satırı — belge kapısı "bu kabulün faturası zaten var mı" diye sorar. */
  findByIntake(stockIntakeId: string): Promise<StockIntakeBalance | null> {
    return this.getOneBy({ stockIntakeId });
  }
}
