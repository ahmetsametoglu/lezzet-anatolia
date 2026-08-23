import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType, ZodTypeDef } from 'zod';
import { fromCents, toCents } from '@lezzet/helper';
import type { KeysetCursor, Page } from '@lezzet/types';
import { appToDb, camelToSnake, dbToApp } from '../utils/case-transformers';

// Filtre seçenekleri — base'in iç sözleşmesi (dışa verilmez; servisler nesne literaliyle geçer).
interface RangeFilter {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number;
}
interface FilterOptions {
  isNullFields?: string[];
  isNotNullFields?: string[];
  rangeFilters?: RangeFilter[];
  searchFilters?: Array<{ field: string; query: string }>;
  /**
   * PostgREST `or=(…)` grupları. Her grup AYRI filtredir ve gruplar birbirine VE ile bağlanır —
   * bu yüzden dizi: arama grubu + keyset grubu aynı sorguda yaşayabilir (biri diğerini ezmez).
   */
  orFilters?: string[];
  /**
   * **jsonb YOL eşitliği** — `marketing_consent->email->>granted` gibi bir yolu bir değere eşitler.
   *
   * Düz `filters` ile YAPILAMAZ: orada anahtar bir ALAN ADIdır ve `column()` onu camelCase→snake
   * çevirir; yol ifadesi o dönüşümden geçemez (ok işaretleri bozulur). Bu yüzden `path` HAM verilir
   * ve dokunulmadan PostgREST'e gider — çağıranın yolu doğru yazma sorumluluğu vardır.
   *
   * Değer METİNDİR çünkü `->>` metin döndürür: mantıksal `true` için `'true'` yazılır. `->` ile
   * jsonb karşılaştırması da mümkündü ama tip eşleşmesi sağlayıcıya göre değişiyor; metin tarafı
   * her yerde aynı davranıyor.
   */
  jsonPathFilters?: Array<{ path: string; value: string }>;
  /**
   * DİZİ kolonu İÇERİR süzgeci (`@>`) — "roles dizisi 'customer' içeriyor mu" gibi.
   *
   * Düz `filters` ile YAPILAMAZ: orada dizi değer `IN (…)` demek, yani "kolon bu değerlerden birine
   * EŞİT". Dizi kolonunda eşitlik "tam olarak bu küme" anlamına gelir — `['customer']` süzgeci
   * `['customer','admin']` olan personeli düşürürdü. İçerir ile eşitlik farkı bu tabloda kritik:
   * `user_profiles` müşteriyi ve personeli birlikte taşıyor, ayıran şey rol kümesi.
   */
  containsFilters?: ReadonlyArray<{ field: string; values: readonly unknown[] }>;
  /**
   * ÖNEK süzgeci (`like 'değer%'`) — `searchFilters`'tan ayrı ve bu ayrım başarım meselesidir.
   *
   * `searchFilters` `ilike '%q%'` üretir: iki taraflı joker hiçbir btree indeksini kullanamaz,
   * tabloyu tarar. Küçük ve nadir okunan kümede sorun değil; **tuş yolunda** olan bir uç için
   * felakettir (ölçüldü: 16.9k satırda 3 harflik önek, tarama 36,9 ms → önek indeksiyle 0,11 ms).
   *
   * Büyük/küçük harfe DUYARLI (`like`), çünkü `ilike` indeksi yine devre dışı bırakırdı. Değeri
   * kolonun yazım biçimine normalleştirmek çağıranın işidir — kural veriyle birlikte yaşar
   * (posta kodu büyük harf, e-posta küçük).
   */
  prefixFilters?: ReadonlyArray<{ field: string; value: string }>;
  /**
   * Projeksiyon. Okumada "hangi kolonlar"dır; **sayımda ise bir ZORUNLULUK olabilir.**
   *
   * `count()` uzun süre `select('*')` yazıyordu ve gömülü ilişki üzerinden süzen her sayım
   * `PGRST108` ile patlıyordu (*"'collections' is not an embedded resource in this request"*) —
   * ölçüldü, ana sayfayı düşürdü. PostgREST gömülü bir alanda süzebilmek için o ilişkinin
   * **select'te de** bulunmasını ister; liste sorgusu onu zaten seçtiği için sorun yalnız sayım
   * yolunda görünüyordu, yani süzgeç listede sessizce yanlış, sayımda gürültülü yanlıştı.
   */
  select?: string;
}
interface GetAllOptions extends FilterOptions {
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  /**
   * Keyset sayfalama: bu imleçten SONRAKİ satırlar. `orderBy` ile aynı alanı işaret eder; `id`
   * ikinci sıralama anahtarı olarak eklenir (eşit değerlerde belirleyici). Offset ile birlikte
   * kullanılmaz — offset satır atlar/tekrarlar, keyset kaymaz.
   */
  keysetAfter?: KeysetCursor;
  /**
   * `id`'yi ikinci sıralama anahtarı yap. Keyset sayfalamanın ŞARTI (eşit sıralama değerlerinde satır
   * sırası belirsizse imleç kayar), ama her tabloda `id` yoktur — junction tabloları bileşik anahtarlı
   * (ör. `product_collections`). Bu yüzden zorunlu değil, `getPage` açar.
   */
  tiebreakById?: boolean;
}

/**
 * Tüm DB servislerinin tabanı: Zod doğrulama + camelCase↔snake_case dönüşümü, throw-tabanlı.
 * Servisler HAM sorgu yazmaz — kendi domain API'lerini (findByX/list/count…) bu metodların
 * üstüne kurar. Tek-satır metodlar public; çok-satır olanlar protected (concrete servis sarar).
 *
 * ── PARA SINIRDA ÇEVRİLİR (`moneyFields`) ────────────────────────────────────
 * Servis para kolonunu **cent** olarak döndürür; euro↔cent dönüşümü burada, TEK yerde yapılır
 * (`STACK §8`). Alt sınıf yalnız `moneyFields` beyan eder, gerisi otomatiktir.
 *
 * **Projeksiyonlu okumalar da kapsam İÇİNDE** (`getAllAs`/`getPageAs`): eşleme yalnız ÜST DÜZEY
 * alanlara dokunur ve projeksiyonun üst düzeyi her zaman BU tablonun kolonlarıdır — gömülü
 * ilişkiler (`alias:tablo(...)`) başka tablonundur ve onlara dokunulmaz. Orada para varsa dönüşüm
 * okuma sınırında elle yapılır (`toCents`, elle `* 100` değil) ve alan yine `…Cents` adını taşır.
 *
 * Bu ayrım başta "projeksiyonlar tamamen dışarıda" diye çizilmişti (02.9 dilim 1) ve İKİ REJİM
 * doğuruyordu: entite şemasından türeyen bir projeksiyon (`StockAdjustmentDetailSchema`) `…Cents`
 * alanını miras alıyor ama değeri çevrilmiyordu — şema tamsayı beklerken euro geliyordu. İki rejim
 * ertelenecek bir borç değil, doğrulamada patlayan bir çelişkiydi; tek rejime indirildi (dilim 3).
 */
export abstract class BaseDbService<TDb, TInsert, TUpdate> {
  constructor(
    protected supabase: SupabaseClient,
    protected tableName: string,
    // Girdi `unknown`: şemalar DB'den gelen bilinmeyen satırı / app girdisini parse eder. Transform'lu
    // şemalarda (ör. numeric string→number) girdi tipi çıktıdan ayrılabilir; bu yüzden TDb sabitlenmez.
    protected dbSchema: ZodType<TDb, ZodTypeDef, unknown>,
    protected insertSchema: ZodType<TInsert, ZodTypeDef, unknown>,
    protected updateSchema: ZodType<TUpdate, ZodTypeDef, unknown>,
    protected allowDelete: boolean = true,
  ) {}

  // ─── Para: euro (DB `numeric`) ↔ cent (app) ───────────

  /**
   * Bu tablonun para alanları — **app tarafındaki cent adlarıyla** (`amountCents`, `unitPriceCents`).
   * Kolon adı `Cents` eki atılarak türetilir: `amountCents` → `amount`, `unitPriceCents` → `unit_price`.
   *
   * Beyan edilen alan için taban sınıf ÜÇ yerde birden çevirir — üçü de aynı hatanın ayrı yüzü:
   * okunan satır (euro → cent), yazılan satır (cent → euro) ve **süzgeç değeri** (cent → euro).
   * Süzgeç en sinsisidir: `{ amountCents: 1690 }` çevrilmezse sorgu 1690 € arar, boş döner ve hata
   * hiçbir yerde patlamaz — yalnız liste boş görünür.
   *
   * Yalnız ÜST düzey alanlara uygulanır; gömülü ilişkiler başka tablonundur (bkz. sınıf künyesi).
   */
  protected readonly moneyFields: readonly string[] = [];

  /** `amountCents` → `amount` (kolonun app yazımı). */
  private static withoutCents(field: string): string {
    return field.slice(0, -'Cents'.length);
  }

  /**
   * Bu servisin projeksiyonlarında geçen **gömülü ilişki takma adları** — app tarafı yazımıyla
   * (`items`, `variants`, `orderItem`), `moneyFields` ile aynı düzen.
   *
   * ── NEDEN BEYAN GEREKİYOR ────────────────────────────────────────────────────
   * Dönüşüm 15.08'den beri **satır düzeyinde kalıyor**: anahtarlar çevrilir, değerlerin İÇİNE
   * inilmez (`case-transformers` künyesi — jsonb anahtarı veridir, kolon adı değil). Gömülü ilişki
   * (`alias:tablo(...)`) ise değer değil **başka bir tablonun satırıdır** ve alan adlarının
   * çevrilmesi gerekir; bu yüzden tek istisna odur ve açıkça bildirilir.
   *
   * **Beyan unutulursa arıza SESSİZ DEĞİLDİR** ve varsayılanın ters çevrilme sebebi tam olarak bu:
   * iç satır `snake_case` kalır, projeksiyon şeması onu tanımaz ve sorgu **o anda** patlar. Ters
   * kurguda (jsonb'yi bildirmek) unutulan beyan veriyi sessizce bozardı.
   *
   * Boş bırakan servis hiçbir şey kaybetmez — gömülü seçimi yoksa inilecek bir şey de yok.
   */
  protected readonly embeds: readonly string[] = [];

  /** Beyan Set'e bir kez çevrilir; her satırda yeniden kurulmasın. */
  private embedSet?: ReadonlySet<string>;

  /** Alan adını DB kolonuna çevirir; para alanında `Cents` eki düşer. */
  private column(field: string): string {
    return camelToSnake(this.moneyFields.includes(field) ? BaseDbService.withoutCents(field) : field);
  }

  /** Süzgeç/aralık değeri: para alanıysa cent → euro (kolon euro tutar). */
  private filterValue(field: string, value: unknown): unknown {
    if (!this.moneyFields.includes(field) || typeof value !== 'number') return value;
    return fromCents(value);
  }

  /** DB satırı → app modeli: snake→camel (yalnız satır düzeyi + beyan edilen gömmeler), sonra para kolonları cent'e iner. */
  private toApp(row: unknown): unknown {
    this.embedSet ??= new Set(this.embeds);
    const app = dbToApp<Record<string, unknown>>(row, this.embedSet);
    if (!this.moneyFields.length || app === null || typeof app !== 'object') return app;
    for (const field of this.moneyFields) {
      const source = BaseDbService.withoutCents(field);
      if (!(source in app)) continue;
      const value = app[source];
      delete app[source];
      // Ölçülemeyen değer sıfır değildir (CLAUDE.md §1): null kolonu null kalır.
      app[field] = value === null || value === undefined ? null : toCents(Number(value));
    }
    return app;
  }

  /** App modeli → DB satırı: para alanları euro'ya çıkar, sonra camel→snake. */
  private toDbRow(data: Record<string, unknown>): Record<string, unknown> {
    if (!this.moneyFields.length) return appToDb<Record<string, unknown>>(data);
    const out: Record<string, unknown> = { ...data };
    for (const field of this.moneyFields) {
      if (!(field in out)) continue;
      const value = out[field];
      delete out[field];
      // `undefined` KORUNUR, `null`a indirilmez: yazma yolunda "gönderme" (kolon varsayılanını alır)
      // ile "boşalt" ayrı şeylerdir; ikisini birleştirmek `not null default` kolonları kırar.
      out[BaseDbService.withoutCents(field)] = value === null || value === undefined ? value : fromCents(Number(value));
    }
    return appToDb<Record<string, unknown>>(out);
  }

  // ─── Ortak yardımcılar ───────────────────────────────

  protected parseRows(rows: unknown[]): TDb[] {
    return (rows ?? []).map((row) => this.dbSchema.parse(this.toApp(row)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilterOptions(query: any, options?: FilterOptions): any {
    if (!options) return query;
    for (const f of options.isNullFields ?? []) query = query.is(this.column(f), null);
    for (const f of options.isNotNullFields ?? []) query = query.not(this.column(f), 'is', null);
    for (const rf of options.rangeFilters ?? []) {
      query = query[rf.operator](this.column(rf.field), this.filterValue(rf.field, rf.value));
    }
    // Yol HAM gider: `column()` çağrılmaz (bkz. `jsonPathFilters` künyesi).
    for (const jf of options.jsonPathFilters ?? []) query = query.eq(jf.path, jf.value);
    for (const sf of options.searchFilters ?? []) query = query.ilike(this.column(sf.field), `%${sf.query}%`);
    for (const pf of options.prefixFilters ?? []) query = query.like(this.column(pf.field), `${pf.value}%`);
    for (const cf of options.containsFilters ?? []) query = query.contains(this.column(cf.field), [...cf.values]);
    for (const group of options.orFilters ?? []) query = query.or(group);
    return query;
  }

  /**
   * Keyset koşulunu PostgREST `or=(…)` grubuna çevirir:
   *   `alan > v  VEYA  (alan = v VE id > lastId)`
   * Artan sırada `gt`, azalanda `lt`. Değer PostgREST filtre dizesine gömüldüğü için metinse
   * çift tırnakla sarılır (virgül/parantez ayrıştırmayı bozmasın).
   *
   * Para alanına göre sıralanan sayfada imleç değeri de cent'tir (`pageOf` öyle üretir) — burada
   * euro'ya iner. Uygulamanın gördüğü her para sayısı cent kalır, imleç dahil.
   */
  private keysetGroup(orderBy: string, cursor: KeysetCursor, descending: boolean): string {
    const col = this.column(orderBy);
    const op = descending ? 'lt' : 'gt';
    const value = this.filterValue(orderBy, cursor.value);
    const v = typeof value === 'number' ? String(value) : `"${value as string}"`;
    return `${col}.${op}.${v},and(${col}.eq.${v},id.${op}.${cursor.id})`;
  }

  protected async executeRpc<T = unknown>(rpcName: string, params: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(rpcName, params);
    if (error) throw error;
    return data as T;
  }

  // ─── Okuma ───────────────────────────────────────────

  async getById(id: string): Promise<TDb | null> {
    const { data, error } = await this.supabase.from(this.tableName).select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null; // satır yok
      throw error;
    }
    return this.dbSchema.parse(this.toApp(data));
  }

  protected async getByIds(ids: string[]): Promise<TDb[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.from(this.tableName).select('*').in('id', ids);
    if (error) throw error;
    return this.parseRows(data);
  }

  /**
   * Sorguyu kurar ve HAM satırları döner (doğrulama çağırana ait) — okuma uçlarının tek gövdesi.
   *
   * **`protected`, çünkü bazı okumaların çıktısı bir VARLIK değil** (02.8): gömülü ilişkilerden
   * türetilen şekiller (geri çağırma isabeti, kalem maliyeti) toplandıktan SONRA doğrulanıyor.
   * Aradaki ham şekli bir Zod şemasıyla geçirmek, yalnız araya girmek için var olan bir tip
   * üretirdi. Yine de bu bir HAM SORGU KAPISI DEĞİL: sorguyu taban sınıf kuruyor, alt sınıf
   * yalnız süzgeç ve `select` veriyor — yani `STACK §6`'nın yasakladığı "servis ham
   * `this.supabase` yazar" hâli açılmıyor.
   */
  protected async selectRows(filters?: Record<string, unknown>, options?: GetAllOptions): Promise<unknown[]> {
    let query = this.supabase.from(this.tableName).select(options?.select ?? '*');
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) return [];
        query = query.in(this.column(key), value.map((v) => this.filterValue(key, v)));
      } else {
        query = query.eq(this.column(key), this.filterValue(key, value));
      }
    }
    const ascending = options?.orderDirection !== 'desc';
    // Keyset imleci varsa koşulu `or` grubu olarak eklenir (mevcut or gruplarını ezmez).
    if (options?.keysetAfter && options.orderBy) {
      const group = this.keysetGroup(options.orderBy, options.keysetAfter, !ascending);
      options = { ...options, orFilters: [...(options.orFilters ?? []), group] };
    }
    query = this.applyFilterOptions(query, options);
    if (options?.orderBy) {
      query = query.order(this.column(options.orderBy), { ascending });
      if (options.tiebreakById) query = query.order('id', { ascending });
    }
    if (options?.offset !== undefined && options?.limit !== undefined) {
      query = query.range(options.offset, options.offset + options.limit - 1);
    } else if (options?.limit) {
      query = query.limit(options.limit);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown[];
  }

  protected async getAll(filters?: Record<string, unknown>, options?: GetAllOptions): Promise<TDb[]> {
    return this.parseRows(await this.selectRows(filters, options));
  }

  /**
   * PROJEKSİYONLU okuma: `select` gömülü ilişki (`alias:tablo(...)`) içerdiğinde satır artık `TDb`
   * değildir → kendi şemasıyla doğrulanır. İlişkileri satır başına ayrı sorguyla çekmek (N+1) yerine
   * TEK sorguda getirmenin yolu budur — STACK §13: N+1'i kırmanın ilk aracı gömülü select, RPC değil.
   *
   * Para eşlemesi ÜST DÜZEYDE burada da çalışır (sınıf künyesi): projeksiyonun üst düzeyi bu
   * tablonun kolonlarıdır. Gömülü ilişkideki para, o okumanın kendi sınırında çevrilir.
   */
  protected async getAllAs<T>(rowSchema: ZodType<T, ZodTypeDef, unknown>, filters?: Record<string, unknown>, options?: GetAllOptions): Promise<T[]> {
    const rows = await this.selectRows(filters, options);
    return rows.map((row) => rowSchema.parse(this.toApp(row)));
  }

  /** Tek satır getirir (verilen alanlara göre) ya da null. Kimlik anahtarı aramaları için. */
  protected async getOneBy(filters: Record<string, unknown>, options?: FilterOptions): Promise<TDb | null> {
    const rows = await this.getAll(filters, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * `limit + 1` satırdan sayfayı ve imleci keser — `getPage`/`getPageAs` bunu paylaşır (tekrar yok).
   * Fazla satır varsa devamı vardır; imleç son DÖNEN satırdan kurulur.
   *
   * ── İMLEÇ HAM SATIRDAN KURULUR, doğrulanmıştan değil (09.17) ────────────────
   * `getPageAs` dar bir şemayla doğruluyor ve Zod tanımadığı alanları DÜŞÜRÜYOR. Sıralama alanı o
   * şemada yoksa imleç `{ value: undefined }` olarak doğuyordu; ikinci sayfa isteği PostgREST'te
   * `invalid input syntax for type integer: "undefined"` ile düşüyor, çağıran hatayı yuttuğu için
   * liste sessizce birinci sayfada kalıyor ve "Daha fazla yükle" sonsuza kadar ekranda duruyordu.
   * Fiyat ve stok listeleri tam olarak bu yüzden ikinci sayfayı hiç yükleyemedi.
   *
   * Sıralama alanı bir GÖRÜNÜM alanı değil, sayfalamanın altyapısı: dar şemaya onu taşıtmak yükü
   * yanlış yere bindirmek olurdu. Ham satırda okunur, `select`'te bulunması yeter.
   *
   * Eksikse SESSİZ geçilmez, fırlatılır. Eski hâl ikinci sayfada ve yalnız yeterince veri varken
   * görünüyordu — yani hatanın kendisi, onu bulmayı en zor kılan yerde saklanıyordu.
   */
  private pageOf<T>(rows: T[], rawRows: unknown[], limit: number, orderBy: string): Page<T> {
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    if (!hasMore) return { rows: page, nextCursor: null };

    const col = this.column(orderBy);
    const last = rawRows[page.length - 1] as Record<string, unknown> | undefined;
    const raw = last?.[col];
    if (raw === undefined || raw === null) {
      throw new Error(
        `Keyset imleci kurulamadı: sıralama alanı "${col}" okunan satırda yok. Projeksiyonlu okumada (getPageAs) sıralama alanı da select'e yazılmalı.`,
      );
    }
    // Para alanına göre sıralamada imleç de cent'tir — `keysetGroup` geri çevirir (bkz. orası).
    const value = this.moneyFields.includes(orderBy) ? toCents(Number(raw)) : (raw as string | number);
    return { rows: page, nextCursor: { value, id: last!.id as string } };
  }

  /**
   * Keyset sayfası — infinite scroll'un tek okuma primitifi (CLAUDE.md: tüm listeler infinite scroll).
   * `limit + 1` satır çeker: fazlası varsa devam eden sayfa vardır → EKSTRA "toplam sayı" sorgusu yok.
   * `nextCursor` son DÖNEN satırdan kurulur; çağıran onu bir sonraki turda geri verir.
   *
   * `orderBy` zorunlu: imleç bir sıralama alanına dayanır. Sıra deterministiktir (alan + id).
   */
  protected async getPage(
    filters: Record<string, unknown> | undefined,
    options: GetAllOptions & { orderBy: string; limit: number },
  ): Promise<Page<TDb>> {
    // tiebreakById: imleç `id` ikilisine dayanır → sıra deterministik OLMALI (bkz. GetAllOptions).
    const raw = await this.selectRows(filters, { ...options, limit: options.limit + 1, tiebreakById: true });
    return this.pageOf(this.parseRows(raw), raw, options.limit, options.orderBy);
  }

  /**
   * `getPage`'in projeksiyonlu ikizi — gömülü ilişkili satırlar (bkz. `getAllAs`).
   *
   * `getAllAs` gibi: para eşlemesi ÜST DÜZEYDE çalışır, gömülü ilişkilerde çalışmaz.
   */
  protected async getPageAs<T>(
    rowSchema: ZodType<T, ZodTypeDef, unknown>,
    filters: Record<string, unknown> | undefined,
    options: GetAllOptions & { orderBy: string; limit: number; select: string },
  ): Promise<Page<T>> {
    const raw = await this.selectRows(filters, { ...options, limit: options.limit + 1, tiebreakById: true });
    const rows = raw.map((row) => rowSchema.parse(this.toApp(row)));
    return this.pageOf(rows, raw, options.limit, options.orderBy);
  }

  /**
   * Satır sayısı — `head: true` ile satır TAŞINMADAN sayılır (indeks taraması). `options` ile eq
   * dışındaki süzgeçler de uygulanabilir: sayaçlar listeyle AYNI süzgeci kullanmak zorundadır,
   * yoksa "12 sonuç" yazıp 5 satır gösteren ekranlar doğar.
   */
  protected async count(filters?: Record<string, unknown>, options?: FilterOptions): Promise<number> {
    // `head: true` gövdeyi getirmez ama projeksiyon yine de GEÇERLİ olmalı — gömülü süzgeç için
    // ilişkinin select'te bulunması şart (seçenek künyesinde ölçümüyle birlikte).
    let query = this.supabase.from(this.tableName).select(options?.select ?? '*', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) return 0;
        query = query.in(this.column(key), value.map((v) => this.filterValue(key, v)));
      } else {
        query = query.eq(this.column(key), this.filterValue(key, value));
      }
    }
    query = this.applyFilterOptions(query, options);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  // ─── Yazma ───────────────────────────────────────────

  async insert(insertData: TInsert): Promise<TDb> {
    const dbData = this.toDbRow(this.insertSchema.parse(insertData) as Record<string, unknown>);
    const { data, error } = await this.supabase.from(this.tableName).insert(dbData).select().single();
    if (error) throw error;
    return this.dbSchema.parse(this.toApp(data));
  }

  /**
   * Tek satır yazar ve **SATIRI GERİ İSTEMEZ** (`select()` yok).
   *
   * `insert()` yazdığı satırı geri okur ve şemayla doğrular — çoğu tabloda doğru davranış, çünkü
   * kimliği ve varsayılanları çağıran kullanır. Ama **yazılıp bir daha okunmayan** tablolarda
   * (olay defteri gibi) o dönüş yolu bedava değil: en çok yazılan tabloda her satır için gereksiz
   * bir gövde taşınır ve hiçbir çağıran ona bakmaz.
   *
   * Doğrulama yine YAPILIR (`insertSchema.parse`) — atlanmayan tek şey dönüşün doğrulanmasıdır.
   */
  protected async insertWithoutReturn(insertData: TInsert): Promise<void> {
    const dbData = this.toDbRow(this.insertSchema.parse(insertData) as Record<string, unknown>);
    const { error } = await this.supabase.from(this.tableName).insert(dbData);
    if (error) throw error;
  }

  /**
   * Tek satır yazar; **TEKİLLİK çakışmasını hata saymaz** (`null` döner).
   *
   * İdempotent yazımların primitifi: aynı olayı iki kez kaydetmeye çalışan bir yol (yeniden denenen
   * checkout, iki kez gelen webhook) ikinci kaydı yazmaz ve bunu bir hata gibi de yaşamaz.
   *
   * **"Önce sorgula, yoksa yaz" DEĞİL** — iki eşzamanlı deneme aynı anda sorgularsa ikisi de "yok"
   * görür ve ikisi de yazar. Karar veritabanında kalır (`bulkUpsertIgnoring` ile aynı gerekçe).
   *
   * `upsert`/`on conflict` yerine HATA KODU yakalanıyor çünkü çakışmayı tutan tekil indeks KISMİ
   * olabilir (`… where order_id is not null` gibi) ve Postgres kısmi bir indeksi `on conflict (…)`
   * ile çıkarsayamaz — indeksin yüklemi ifadede tekrarlanmadıkça. PostgREST o yüklemi yazmaya izin
   * vermediği için `upsert` yolu böyle indekslerde kapalı; hata kodu her indeks şeklinde çalışır.
   */
  protected async insertIgnoringConflict(insertData: TInsert): Promise<TDb | null> {
    const dbData = this.toDbRow(this.insertSchema.parse(insertData) as Record<string, unknown>);
    const { data, error } = await this.supabase.from(this.tableName).insert(dbData).select().single();
    if (error) {
      // 23505 = unique_violation. Başka her hata yukarı gider: "sessizce atla" yalnız MÜKERRER için.
      if (error.code === '23505') return null;
      throw error;
    }
    return this.dbSchema.parse(this.toApp(data));
  }

  protected async bulkInsert(rows: TInsert[]): Promise<TDb[]> {
    if (rows.length === 0) return [];
    const dbRows = rows.map((r) => this.toDbRow(this.insertSchema.parse(r) as Record<string, unknown>));
    const { data, error } = await this.supabase.from(this.tableName).insert(dbRows).select();
    if (error) throw error;
    return this.parseRows(data ?? []);
  }

  /**
   * Toplu yazım, **çakışanı sessizce atlayarak**. Dönüş yalnız GERÇEKTEN yazılan satırlardır —
   * atlanan sayısı çağıranda `girdi − dönüş` farkından çıkar.
   *
   * Mükerreri uygulamada aramak yerine (önce sorgula, yoksa yaz) kararı veritabanına bırakır: iki
   * eşzamanlı yükleme aynı satırı sorguladığında ikisi de "yok" görür ve ikisi de yazardı.
   */
  protected async bulkUpsertIgnoring(rows: TInsert[], onConflict: string): Promise<TDb[]> {
    if (rows.length === 0) return [];
    const dbRows = rows.map((r) => this.toDbRow(this.insertSchema.parse(r) as Record<string, unknown>));
    const { data, error } = await this.supabase
      .from(this.tableName)
      .upsert(dbRows, { onConflict, ignoreDuplicates: true })
      .select();
    if (error) throw error;
    return this.parseRows(data ?? []);
  }

  async upsert(data: TInsert, onConflict: string): Promise<TDb> {
    const dbData = this.toDbRow(this.insertSchema.parse(data) as Record<string, unknown>);
    const { data: result, error } = await this.supabase.from(this.tableName).upsert(dbData, { onConflict }).select().single();
    if (error) throw error;
    return this.dbSchema.parse(this.toApp(result));
  }

  async update(updateData: TUpdate): Promise<TDb> {
    const validated = this.updateSchema.parse(updateData) as Record<string, unknown>;
    const { id } = validated as { id: string };
    // Yalnız çağrıda verilen alanları yaz (kısmi güncelleme).
    const provided = Object.keys(updateData as Record<string, unknown>).filter((k) => k !== 'id');
    const updates: Record<string, unknown> = {};
    for (const k of provided) updates[k] = validated[k];
    const { data, error } = await this.supabase.from(this.tableName).update(this.toDbRow(updates)).eq('id', id).select().single();
    if (error) throw error;
    return this.dbSchema.parse(this.toApp(data));
  }

  /**
   * Görsel dosyasını varlığa bağlar: anahtar **ve sürüm damgası** aynı yazımda gider. Damga public
   * okuma URL'inin cache'ini kırar (`publicImageUrl` — 05.11); anahtar deterministik olduğu için
   * damga olmadan yeni yüklenen dosya bir yıl eski cache'in arkasında kalır. Kuralın üç ayrı
   * serviste (kategori/koleksiyon/ürün) tekrarlanmaması için burada durur.
   *
   * Yalnız görsel taşıyan varlıklarda anlamlı → `protected`; alt sınıf `setImageKey` olarak açar.
   * Tek `as TUpdate`: alan adları jenerik imzada görünmez, ama üç Update şeması da tam varlık
   * şemasından türediği için (`.partial()`) alanlar orada MEVCUT — eksik olsa Zod sessizce atardı.
   */
  protected async writeImageKey(id: string, imageKey: string): Promise<TDb> {
    return this.update({ id, imageKey, imageUpdatedAt: new Date().toISOString() } as TUpdate);
  }

  /**
   * "Grup içinde tek bayrak" kuralı: kardeşleri düşürür, kendini işaretler. Varsayılan adres,
   * tercihli tedarikçi — aynı algoritma, değişen yalnız üç ad.
   *
   * **Neden tabana çıktı:** `STACK §6`'nın eşiği "ikinci tüketici" ve o çıktı (`address.setDefault`
   * ↔ `supplier.setPreferred` satır satır aynıydı, K4-1). Kapsam değerini çağırandan istemiyoruz:
   * `getById` zaten satırın tamamını getiriyor, kapsam alanı onun içinde — çağıranın ikinci kez
   * okuması hem tur hem hata payı olurdu.
   *
   * **SIRA bilinçli: önce temizle, sonra işaretle.** Tersi bir an için İKİ bayraklı bir grup
   * üretir; bu sıra bir an için SIFIR bayraklı üretir. İkisi de kusurlu ama simetrik değil: sıfır
   * bayrak "seçim yok" diye okunur (checkout kullanıcıya sorar), iki bayrak "hangisi?" diye —
   * sessizce yanlış olanı seçilebilir. Ayrıca bu sıra, kuralın bir gün kısmi unique index'e
   * taşınmasıyla uyumlu olan TEK sıradır; tersi index'i anında ihlal ederdi.
   *
   * İki yazım arasında hata olursa grup bayraksız kalır — PostgREST tek turda koşullu yazım
   * (`set flag = (id = $1) where scope = $2`) ifade edemediği için gerçek atomiklik ancak RPC ile
   * gelir. Kayıt `denetim-K4-veri-semasi` Cevap'ında; bugünkü veride ihlal yok (ölçüldü 10.08:
   * address 6 grup, supplier_product 18 grup, çoklu 0 · bayraksız 0).
   *
   * Alanlar camelCase verilir (`isDefault`, `customerId`); çevrimi taban yapar. İkisi de düz
   * `string` olduğu için derleyici yanlış adı yakalayamaz — bu yüzden **iki bekçi** var: kapsam
   * alanı satırda yoksa ve bayrak yazımı tutmadıysa fonksiyon fırlatır. Bekçisiz hâlde yanlış ad
   * sessiz kalırdı: `update()` Zod'dan geçiyor ve şemada olmayan alanı **atarak** yazıyor, yani
   * çağrı başarılı döner ve hiçbir bayrak değişmez (`writeImageKey` künyesindeki aynı tuzak).
   */
  protected async setExclusiveFlag(id: string, flagField: string, scopeField: string): Promise<TDb> {
    const row = await this.getById(id);
    if (!row) throw new Error(`[${this.tableName}] ${id} bulunamadı`);
    const scopeValue = (row as Record<string, unknown>)[scopeField];
    if (scopeValue === undefined) {
      throw new Error(`[${this.tableName}] setExclusiveFlag: '${scopeField}' kapsam alanı satırda yok`);
    }

    const { error } = await this.supabase
      .from(this.tableName)
      .update({ [this.column(flagField)]: false })
      .eq(this.column(scopeField), this.filterValue(scopeField, scopeValue));
    if (error) throw error;

    const updated = await this.update({ id, [flagField]: true } as TUpdate);
    if ((updated as Record<string, unknown>)[flagField] !== true) {
      throw new Error(`[${this.tableName}] setExclusiveFlag: '${flagField}' yazılamadı — Update şemasında yok`);
    }
    return updated;
  }

  /**
   * Verilen id sırasına göre bir sıra-alanını 0..n-1 olarak toplu yazar (sürükle-bırak sonrası).
   * Küçük listeler için ardışık update; ilk hata fırlatılır. Alan camelCase verilir (ör. 'sortOrder').
   */
  protected async reorderBy(orderedIds: string[], field: string): Promise<void> {
    if (orderedIds.length === 0) return;
    const col = this.column(field);
    const results = await Promise.all(
      orderedIds.map((id, index) => this.supabase.from(this.tableName).update({ [col]: index }).eq('id', id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  // ─── Silme ───────────────────────────────────────────

  async delete(id: string): Promise<void> {
    if (!this.allowDelete) {
      throw new Error(`[${this.tableName}] delete kapalı. Ters kayıt ya da RPC kullan.`);
    }
    const { error } = await this.supabase.from(this.tableName).delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Aynı yamayı BİRÇOK satıra tek turda yazar (`in (…)`) — damga atma işlerinin yolu.
   *
   * **Neden tabana eklendi, alt sınıfta ham yazılmadı:** `STACK §6` "kendi tablosuna tabanı
   * atlayarak yazmak" için MUTLAK istisna koyuyor — doğrulama ve para eşlemesi atlanır. Tek
   * çağıranı olduğu için (YAGNI) alt sınıfta bırakmak isterdim; ama oradaki tek seçenek ham yazım
   * olurdu ve o yasak. Kural ile kolaylık çatıştığında kural kazanır, taban büyür.
   *
   * Alternatifi satır başına bir `update()` turuydu: 500 alıcılı bir bildirimde 500 istek.
   *
   * Dönüş `void` ve satır SAYISI da dönmüyor: bu bir damga işidir, "kaç satır damgalandı" sorusunu
   * çağıran zaten biliyor (elindeki kimlik listesi). Sayı gerekseydi `select()` eklenirdi.
   */
  protected async updateWhereIn(field: string, values: readonly string[], patch: Record<string, unknown>): Promise<void> {
    if (values.length === 0) return;
    const { error } = await this.supabase
      .from(this.tableName)
      .update(this.toDbRow(patch))
      .in(this.column(field), values as string[]);
    if (error) throw error;
  }

  /**
   * **Boş alanı SAHİPLENEN güncelleme** — yalnız `nullField` HÂLÂ boşken yazar; doluysa hiçbir şey
   * yazmaz ve `null` döner.
   *
   * **Neden oku-sonra-yaz değil:** iki operatör aynı kimliksiz kaydı aynı anda bağlarsa ikisi de
   * "boş" görür ve ikincisi birincinin yazdığını sessizce ezer. Kimlik bağlama bir BİRLEŞTİRME
   * kararıdır ve insana aittir (DOMAIN §10) — sessizce ezilen bir karar, hiç sorulmamış bir karardır.
   * Koşul veritabanına bırakılınca kazananı DB seçer ve kaybeden görünür bir `null` alır.
   *
   * **Neden tabana eklendi, alt sınıfta ham yazılmadı:** `updateWhereIn`in aynı gerekçesi —
   * `STACK §6` tabanı atlayan ham yazımı yasaklıyor (doğrulama ve para eşlemesi atlanır), taban da
   * koşullu güncellemeyi bilmiyordu. Kural ile kolaylık çatıştığında kural kazanır, taban büyür.
   *
   * Dönüş GÜNCEL SATIRDIR, boolean değil: çağıran çoğu zaman yazdığı satırı okumak zorunda
   * (ekranı tazelemek, sonucu doğrulamak) ve ikinci bir tur atmak aynı soruyu iki kez sormaktır.
   */
  protected async updateIfNull(id: string, nullField: string, patch: Record<string, unknown>): Promise<TDb | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(this.toDbRow(patch))
      .eq('id', id)
      .is(this.column(nullField), null)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? this.dbSchema.parse(this.toApp(data)) : null;
  }

  /**
   * Filtreye göre siler (bileşik anahtarlı tablolar için; en az bir filtre zorunlu).
   *
   * `isNullFields` = "bu kolon boş olan satırlar" (`getAll`in aynı adlı seçeneği). Eşitlik
   * filtresiyle ifade edilemez: `eq(col, null)` PostgREST'te satır getirmez/silmez, `is null`
   * gerekir. **Filtre sayısına dahil DEĞİL** — tek başına bir `is null` ile silmek, bir kolonun
   * boş olduğu HER satırı silmek olurdu.
   */
  protected async deleteWhere(
    filters: Record<string, unknown>,
    options?: { isNullFields?: readonly string[] },
  ): Promise<void> {
    const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) throw new Error(`[${this.tableName}] deleteWhere filtresiz çağrılamaz.`);
    let query = this.supabase.from(this.tableName).delete();
    for (const [key, value] of entries) query = query.eq(this.column(key), this.filterValue(key, value));
    for (const field of options?.isNullFields ?? []) query = query.is(this.column(field), null);
    const { error } = await query;
    if (error) throw error;
  }
}
