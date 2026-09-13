import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADVERTISING_TAG,
  AccountSchema,
  AccountInsertSchema,
  AccountUpdateSchema,
  AccountBalanceSchema,
  AccountLedgerRowSchema,
  MoneyDocumentBalanceSchema,
  MoneyDocumentInsertSchema,
  MoneyDocumentSchema,
  MoneyDocumentUpdateSchema,
  MoneyMovementSchema,
  MoneyMovementInsertSchema,
  MoneyMovementUpdateSchema,
  MovementTagInsertSchema,
  MovementTagSchema,
  MovementTagUpdateSchema,
  OrderAmountsSchema,
  DEFAULT_PAGE_SIZE,
  type Account,
  type AccountBalance,
  type AccountInsert,
  type AccountLedgerRow,
  type AccountUpdate,
  type KeysetCursor,
  type MoneyDocument,
  type MoneyDocumentBalance,
  type MoneyDocumentInsert,
  type MoneyDocumentUpdate,
  type MoneyMovement,
  type MoneyMovementInsert,
  type MoneyMovementUpdate,
  type MovementSource,
  type MovementTag,
  type MovementTagInsert,
  type MovementTagUpdate,
  type MovementType,
  type OrderAmounts,
  type Page,
} from '@lezzet/types';
import { fromCents, toCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';
import { rpcMoneyToCents } from '../utils/rpc-money';

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
    if (!data) return { accountId, balanceCents: 0, movementCount: 0 };
    // Görünüm `balance`ı euro toplar; app cent konuşur (02.9 · STACK §8).
    return AccountBalanceSchema.parse(rpcMoneyToCents(dbToApp(data), ['balance']));
  }

  /**
   * Tüm hesapların bakiyesi TEK sorguda — hesap başına ayrı sorgu (N+1) yerine görünümün tamamı.
   * Para özeti ekranının okuması budur. Dönen harita eksik anahtar bırakmaz.
   */
  async balances(): Promise<Map<string, AccountBalance>> {
    const { data, error } = await this.supabase.from('account_balance').select('*');
    if (error) throw error;
    const rows = (data ?? []).map((row) => AccountBalanceSchema.parse(rpcMoneyToCents(dbToApp(row), ['balance'])));
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
        // **Hesap artık ZORUNLU DEĞİL, bir SÜZGEÇ** (12.4 · operasyon şeridinin talebi 04.08).
        // `admin-para.md §6`: *"tek liste, hesap yalnız bir filtredir"*. Zorunlu imza bunun tersini
        // varsayıyordu — ekran açılışta boş kalır ya da bir hesabı keyfî olarak öne alırdı.
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

  /**
   * İZAH EDİLMEMİŞ hareket SAYISI — süzgeçten bağımsız, hesap-üstü tek sayı.
   *
   * **Sayfadan sayılamaz** ve talep bunu doğru tespit etmiş: sayfa ilk N satırı taşır, ekran onu
   * sayarsa listenin kuyruğunu es geçer ve "7" yerine "20+" gibi bir şey yazar — sayaç olmayan bir
   * sayaç. Tasarım bu rozeti bir İŞ KUYRUĞU ilan ediyor ve **sıfırken de basıyor** ("her şey
   * izahlı" iyi haberdir), yani sayının doğru olması gerekiyor.
   *
   * ── `reconciled` DEĞİL `explained` (13.09) ────────────────────────────────
   * Sayaç `reconciled = false`'u sayıyordu ve o bayrak yalnız banka satırında anlam taşıyor;
   * sistemin kendi yazdığı her tahsilat, elle girilen her gider "eşleşmemiş" sayılıyordu (yerelde
   * 28 satırın 5'i banka satırıydı). Doğru soru "bu satırın ne olduğu biliniyor mu" — cevabı
   * türetilmiş `explained` kolonu veriyor.
   *
   * Ham `money_movement`'tan sayılıyor, `account_movement` görünümünden DEĞİL: görünüm transferi iki
   * satır üretir ve bir hareket iki kez sayılırdı.
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

/**
 * Defter süzgeci (12.4). **Hepsi isteğe bağlı** — süzgeçsiz çağrı defterin tamamını sayfalar.
 *
 * `accountId` bir EKSEN değil bir daraltmadır (`admin-para.md §6`): kasa ile banka aynı kavram,
 * hesap yalnız bir çip.
 */
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
  /** Yalnız İZAH edilmemiş hareketler (13.09) — ekranın "izah bekliyor" kapsamı. */
  unexplainedOnly?: boolean;
}

/** Dönem toplamı — kâr ve nakit akışı raporlarının ham girdisi (12.6). */
export interface PeriodTotal {
  type: MovementType;
  direction: 'in' | 'out';
  totalCents: number;
  count: number;
}

/** Kampanya başına reklam gideri (12.5) — 13.2'nin ROI tablosunda cironun yanına gelen sütun. */
export interface CampaignSpend {
  /** `meta.campaign` etiketi. **Etiketsiz reklam gideri `null` kovasında toplanır**, atılmaz. */
  campaign: string | null;
  /** NET gider (**cent**): çıkışlar artı, geri gelen para (reklam iadesi/kredisi) eksi. */
  totalCents: number;
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
  /** Kolon `money_movement.amount` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents'];

  private readonly ledgerView: AccountLedgerService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'money_movement', MoneyMovementSchema, MoneyMovementInsertSchema, MoneyMovementUpdateSchema);
    this.ledgerView = new AccountLedgerService(supabase);
  }

  /**
   * **Defter listesi** — hesap seçili ya da HESAP-ÜSTÜ (12.4). Değer tarihine göre en yeni önce,
   * keyset sayfalı (sonsuz kaydırma).
   *
   * ── TRANSFERİN İKİ AYAĞI "TÜMÜ"NDE DE İKİ SATIRDIR (karar 04.08) ───────────
   * Görünüm transferi iki satır üretiyor (gönderende −, alanda +) ve hesap-üstü okumada ikisi de
   * kalıyor. Operasyon şeridinin görüşü kabul: transfer gerçekten iki hesabı birden etkiliyor,
   * birini seçip ötekini gizlemek keyfî olurdu ve "hangi ayak" sorusunun cevabı yok. **Toplam da
   * bu yüzden doğru çıkıyor:** iki satır birbirini götürür, yani "Tümü"nün toplamı *"para
   * işletmeden çıkmadı"* der. Tek satır isteyen okuma ham `money_movement`'a bakar.
   *
   * **Listenin toplamı buna bağlı olduğu için ekran bunu bilmek zorunda** — talep haklı olarak
   * künyeye yazılmasını istedi.
   */
  ledger(opts: LedgerFilter = {}): Promise<Page<AccountLedgerRow>> {
    return this.ledgerView.page(opts);
  }

  /** İzah edilmemiş hareket sayısı — süzgeçten bağımsız iş kuyruğu rozeti (12.4 · 13.09). */
  unexplainedCount(): Promise<number> {
    return this.ledgerView.unexplainedCount();
  }

  /**
   * İzah edilmemiş hareketler — kuyruğun kendisi (13.09). En yeni önce, keyset sayfalı: banka
   * dosyası bir kerede yüzlerce satır düşürebilir.
   *
   * Ham tablodan okunur (defter görünümünden değil): kuyruk bir hareketi bir kez gösterir,
   * transferin iki ayağını iki satır diye değil — transfer zaten izahlıdır.
   */
  listUnexplained(opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<MoneyMovement>> {
    return this.getPage(
      { explained: false },
      { orderBy: 'valueDate', orderDirection: 'desc', keysetAfter: opts.cursor, limit: opts.limit ?? DEFAULT_PAGE_SIZE },
    );
  }

  /**
   * Bir belgeye bağlı hareketler — belge kartı "hangi ödemelerle kapandı" sorusunu buradan yanıtlar.
   * Açık kalanın hesabı burada DEĞİL, `money_document_balance` görünümünde (tek yer).
   */
  listByDocument(documentId: string): Promise<MoneyMovement[]> {
    return this.getAll({ documentId }, { orderBy: 'valueDate' });
  }

  /** Siparişin para hareketleri — tahsilat/iade toplamı (`amount_*` cache'inin kaynağı, 12.2). */
  listByOrder(orderId: string): Promise<MoneyMovement[]> {
    return this.getAll({ orderId }, { orderBy: 'valueDate' });
  }

  /**
   * ÇOK siparişin hareketleri tek turda — ödeme karnesi (09.9) "ne zaman ödedi" sorusunu buradan
   * yanıtlıyor: siparişin tarihi ile tahsilatın `value_date`'i arasındaki gün sayısı.
   *
   * Sipariş başına ayrı `listByOrder` çağırmak N+1 olurdu ve karne elli siparişe bakıyor. Kimlikler
   * öbeklenir: `in(...)` listesi URL'e gömülüyor (kalem okumasıyla aynı gerekçe).
   */
  /**
   * Günün SİPARİŞ para hareketleri (tahsilat + iade) — M1 yöntem kırılımı ve M2 gün sonu (21.12).
   * Değer tarihi eşitliğiyle: gün sonu mutabakatının günü `value_date`tir, kayıt anı değil.
   */
  listOrderMoneyOfDay(date: string): Promise<MoneyMovement[]> {
    return this.getAll({ type: ['order_payment', 'order_refund'], valueDate: date });
  }

  async listByOrders(orderIds: readonly string[]): Promise<MoneyMovement[]> {
    const BATCH_SIZE = 200;
    const all: MoneyMovement[] = [];
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      all.push(...(await this.getAll({ orderId: orderIds.slice(i, i + BATCH_SIZE) }, { orderBy: 'valueDate' })));
    }
    return all;
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
    amountCents: number;
    type: 'order_payment' | 'order_refund';
    valueDate?: string;
    description?: string | null;
    /** Kim yazdı (13.09): sistemin kendi akışları `system` geçer; verilmezse kolon varsayılanı `manual`. */
    source?: MovementSource;
    /** Sağlayıcı künyesi (07.11) — `{ providerRef: 'pi_...' }`. İade bu referansın üzerinden döner. */
    meta?: Record<string, unknown> | null;
    /**
     * Yazımın kimliği (21.263) — aynı anahtarla ikinci çağrı YAZMAZ, ilkin sonucunu `deduped: true`
     * ile döndürür. Verilmezse yazım korumasızdır ve bu meşru: elle girilen hareketin tekrarı bir
     * kaza değil bir karardır. Künyesi `0018_money.sql`de.
     */
    idempotencyKey?: string | null;
  }): Promise<OrderAmounts> {
    const raw = await this.executeRpc('record_order_movement', {
      p_order_id: input.orderId,
      p_account_id: input.accountId,
      // RPC euro konuşuyor (kolonlarla aynı taban); uygulama cent — çevrim bu sınırda (02.9).
      p_amount: fromCents(input.amountCents),
      p_type: input.type,
      p_value_date: input.valueDate ?? new Date().toISOString().slice(0, 10),
      p_description: input.description ?? null,
      p_source: input.source ?? 'manual',
      p_meta: input.meta ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
    });
    return OrderAmountsSchema.parse(rpcMoneyToCents(dbToApp(raw), ['amountCollected', 'amountRefunded']));
  }

  /**
   * Sağlayıcı künyesinden hareketi bulur (07.11) — `charge.refunded` bize sipariş kimliğiyle değil
   * yalnız `pi_...` ile gelir. Panelden elle yapılan bir iadenin deftere düşebilmesi buna bağlı.
   *
   * Tekillik ARANMAZ, en yenisi alınır: aynı niyet üzerinden birden çok hareket olabilir (tahsilat +
   * sonraki iadeler); soruyu yanıtlayan şey hangi SİPARİŞE ait olduğudur ve o hepsinde aynıdır.
   */
  async findByProviderRef(providerRef: string): Promise<MoneyMovement | null> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('*')
      .eq('meta->>providerRef', providerRef)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    // `parseRows` ile: `dbSchema.parse(dbToApp(...))` para eşlemesini ATLIYORDU (02.9) ve satır
    // euro `amount` taşırken şema `amountCents` istediği için doğrulama patlıyordu. Webhook o hatayı
    // yutup `status: 'error'` dönüyordu — panelden yapılan iade deftere hiç düşmüyordu.
    return data?.[0] ? (this.parseRows([data[0]])[0] ?? null) : null;
  }

  /**
   * Cache'i kaynaktan yeniden kurar. Hareket silinir/düzeltilirse ya da kayma şüphesi olursa tek
   * çağrıyla gerçeğe dönülür — cache'in kendini düzeltebilmesi, saklanan sayının kabul edilebilir
   * olmasının şartıdır.
   */
  async resyncOrder(orderId: string): Promise<OrderAmounts> {
    const raw = await this.executeRpc('resync_order_amounts', { p_order_id: orderId });
    return OrderAmountsSchema.parse(rpcMoneyToCents(dbToApp(raw), ['amountCollected', 'amountRefunded']));
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

    const buckets = new Map<string, PeriodTotal>();
    for (const row of (data ?? []) as Array<{ type: MovementType; direction: 'in' | 'out'; amount: string | number }>) {
      const key = `${row.type}:${row.direction}`;
      const current = buckets.get(key) ?? { type: row.type, direction: row.direction, totalCents: 0, count: 0 };
      // Toplama CENT'te ve tamsayıda: `Math.round((toplam + x) * 100) / 100` her satırda kayan
      // nokta artığını süpüren bir yamaydı; tamsayıda süpürülecek artık yok (02.9).
      current.totalCents += toCents(Number(row.amount));
      current.count += 1;
      buckets.set(key, current);
    }
    return [...buckets.values()];
  }

  /**
   * **Kampanya başına reklam gideri** (12.5) — 13.2'nin ROI tablosu bunu cironun yanına koyar.
   *
   * Süzgeç TİP değil ETİKETTİR (`reklam`, 13.09; eskiden `category = advertising`): reklam parası
   * çoğu zaman `expense` olarak girer ama ajansa yapılan bir `misc` ödeme de reklam gideridir; tipe
   * göre süzseydik ROI'nin gider tarafı olduğundan küçük, kampanya kârlı görünürdü.
   *
   * **Kampanya künyesiz satır atılmaz**, `campaign: null` kovasında toplanır: kampanyaların toplamı
   * ile dönemin gerçek reklam gideri BİRBİRİNİ TUTMALIDIR. Künyesizi düşürseydik rapor eksik gideri
   * hiç göstermez, ROI kendiliğinden şişerdi.
   */
  async campaignSpend(from: string, to: string): Promise<CampaignSpend[]> {
    const { data, error } = await this.supabase
      .from('money_movement')
      .select('direction,amount,meta')
      .contains('tags', [ADVERTISING_TAG])
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

  /** Banka ekstresiyle eşleşti işareti (12.4) — eşleşme kuyruğu bunu boşaltır. */
  markReconciled(id: string, reconciled = true): Promise<MoneyMovement> {
    return this.update({ id, reconciled });
  }

  /**
   * **Banka satırlarını yazar; zaten var olanı ATLAR** (12.4).
   *
   * Mükerreri uygulamada aramayız — "önce sorgula, yoksa yaz" iki eşzamanlı yüklemede ikisini de
   * yazar. Kararı VERİTABANI verir (`money_movement_import_key` tekil indeksi); `ignoreDuplicates`
   * ile çakışan satır sessizce düşer ve dönüş yalnız GERÇEKTEN yazılanları taşır. Atlanan sayısı
   * farktan çıkar ve ekranda gösterilir — sessiz eksilme olmaz.
   */
  async insertImported(rows: MoneyMovementInsert[]): Promise<MoneyMovement[]> {
    if (rows.length === 0) return [];
    return this.bulkUpsertIgnoring(rows, 'account_id,import_fingerprint');
  }
}

/**
 * **Etiket sözlüğü** (13.09) — hareketin ve belgenin sınıflandırma kelimeleri. Yönetilen liste:
 * operatör ekler, yazım tek kalır; veritabanı tanımadığı etiketi reddeder (`check_tags_known`).
 *
 * Anahtarı `slug`tır, `id` değil — temel servisin `update`/`getById`si `id` varsayar, o yüzden
 * bu sınıf yalnız okuma ve ekleme için temel sınıfı kullanır; pasifleştirme kendi sorgusudur.
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
    const { data, error } = await this.supabase.from('movement_tag').update({ is_active: isActive }).eq('slug', slug).select().single();
    if (error) throw error;
    return MovementTagSchema.parse(dbToApp(data));
  }
}

/**
 * **Belge servisi** (13.09) — fatura, fiş, bordro, sözleşme, dekont. Belge PARA DEĞİLDİR: borç
 * doğurur, ödeme sonra bir hareket olarak gelir ve `documentId` ile bağlanır. Açık kalan
 * SAKLANMAZ, `money_document_balance` görünümünden okunur (bakiye kararıyla aynı gerekçe).
 */
export class MoneyDocumentService extends BaseDbService<MoneyDocument, MoneyDocumentInsert, MoneyDocumentUpdate> {
  /** Kolonlar `amount` ve `vat_amount` euro `numeric`; app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents', 'vatAmountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'money_document', MoneyDocumentSchema, MoneyDocumentInsertSchema, MoneyDocumentUpdateSchema);
  }

  /** Belgeler — belge tarihine göre en yeni önce, keyset sayfalı (belge arşivi veriyle sınırsız büyür). */
  page(opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<MoneyDocument>> {
    return this.getPage(undefined, {
      orderBy: 'issuedOn',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /** Bir mal kabulün belgeleri — alım faturası mal kabulün üstünde görünsün (12.3 bağı). */
  listByIntake(stockIntakeId: string): Promise<MoneyDocument[]> {
    return this.getAll({ stockIntakeId }, { orderBy: 'issuedOn' });
  }

  /**
   * Belgelerin açık kalanı — görünümden, tek turda. Dönen harita eksik anahtar bırakmaz: hiç
   * ödemesi olmayan belge de bir satırdır (`left join`), açık kalanı tutarın kendisi.
   */
  async balances(documentIds: readonly string[]): Promise<Map<string, MoneyDocumentBalance>> {
    if (documentIds.length === 0) return new Map();
    const { data, error } = await this.supabase.from('money_document_balance').select('*').in('document_id', [...documentIds]);
    if (error) throw error;
    const rows = (data ?? []).map((row) =>
      MoneyDocumentBalanceSchema.parse(rpcMoneyToCents(dbToApp(row), ['amount', 'settled', 'openAmount'])),
    );
    return new Map(rows.map((row) => [row.documentId, row]));
  }

  /**
   * AÇIK belgeler — kapanmamış borç ve alacaklar ("ödenmemiş faturalar" listesi). Görünümden
   * süzülür: açık kalanı sıfır olmayan her belge. Sınırsız büyümez (kapanan düşer), tek turda.
   */
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
