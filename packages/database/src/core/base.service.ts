import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType, ZodTypeDef } from 'zod';
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
}
interface GetAllOptions extends FilterOptions {
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  select?: string;
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

  // ─── Ortak yardımcılar ───────────────────────────────

  protected parseRows(rows: unknown[]): TDb[] {
    return (rows ?? []).map((row) => this.dbSchema.parse(dbToApp(row)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilterOptions(query: any, options?: FilterOptions): any {
    if (!options) return query;
    for (const f of options.isNullFields ?? []) query = query.is(camelToSnake(f), null);
    for (const f of options.isNotNullFields ?? []) query = query.not(camelToSnake(f), 'is', null);
    for (const rf of options.rangeFilters ?? []) query = query[rf.operator](camelToSnake(rf.field), rf.value);
    for (const sf of options.searchFilters ?? []) query = query.ilike(camelToSnake(sf.field), `%${sf.query}%`);
    for (const group of options.orFilters ?? []) query = query.or(group);
    return query;
  }

  /**
   * Keyset koşulunu PostgREST `or=(…)` grubuna çevirir:
   *   `alan > v  VEYA  (alan = v VE id > lastId)`
   * Artan sırada `gt`, azalanda `lt`. Değer PostgREST filtre dizesine gömüldüğü için metinse
   * çift tırnakla sarılır (virgül/parantez ayrıştırmayı bozmasın).
   */
  private keysetGroup(orderBy: string, cursor: KeysetCursor, descending: boolean): string {
    const col = camelToSnake(orderBy);
    const op = descending ? 'lt' : 'gt';
    const v = typeof cursor.value === 'number' ? String(cursor.value) : `"${cursor.value}"`;
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
    return this.dbSchema.parse(dbToApp(data));
  }

  protected async getByIds(ids: string[]): Promise<TDb[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.from(this.tableName).select('*').in('id', ids);
    if (error) throw error;
    return this.parseRows(data);
  }

  /** Sorguyu kurar ve HAM satırları döner (doğrulama çağırana ait) — okuma uçlarının tek gövdesi. */
  private async selectRows(filters?: Record<string, unknown>, options?: GetAllOptions): Promise<unknown[]> {
    let query = this.supabase.from(this.tableName).select(options?.select ?? '*');
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) return [];
        query = query.in(camelToSnake(key), value);
      } else {
        query = query.eq(camelToSnake(key), value);
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
      query = query.order(camelToSnake(options.orderBy), { ascending });
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
   */
  protected async getAllAs<T>(rowSchema: ZodType<T, ZodTypeDef, unknown>, filters?: Record<string, unknown>, options?: GetAllOptions): Promise<T[]> {
    const rows = await this.selectRows(filters, options);
    return rows.map((row) => rowSchema.parse(dbToApp(row)));
  }

  /** Tek satır getirir (verilen alanlara göre) ya da null. Kimlik anahtarı aramaları için. */
  protected async getOneBy(filters: Record<string, unknown>): Promise<TDb | null> {
    const rows = await this.getAll(filters, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * `limit + 1` satırdan sayfayı ve imleci keser — `getPage`/`getPageAs` bunu paylaşır (tekrar yok).
   * Fazla satır varsa devamı vardır; imleç son DÖNEN satırdan kurulur.
   */
  private static pageOf<T>(rows: T[], limit: number, orderBy: string): Page<T> {
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1] as Record<string, unknown> | undefined;
    const nextCursor = hasMore && last ? { value: last[orderBy] as string | number, id: last.id as string } : null;
    return { rows: page, nextCursor };
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
    const rows = await this.getAll(filters, { ...options, limit: options.limit + 1, tiebreakById: true });
    return BaseDbService.pageOf(rows, options.limit, options.orderBy);
  }

  /** `getPage`'in projeksiyonlu ikizi — gömülü ilişkili satırlar (bkz. `getAllAs`). */
  protected async getPageAs<T>(
    rowSchema: ZodType<T, ZodTypeDef, unknown>,
    filters: Record<string, unknown> | undefined,
    options: GetAllOptions & { orderBy: string; limit: number; select: string },
  ): Promise<Page<T>> {
    const rows = await this.getAllAs(rowSchema, filters, { ...options, limit: options.limit + 1, tiebreakById: true });
    return BaseDbService.pageOf(rows, options.limit, options.orderBy);
  }

  /**
   * Satır sayısı — `head: true` ile satır TAŞINMADAN sayılır (indeks taraması). `options` ile eq
   * dışındaki süzgeçler de uygulanabilir: sayaçlar listeyle AYNI süzgeci kullanmak zorundadır,
   * yoksa "12 sonuç" yazıp 5 satır gösteren ekranlar doğar.
   */
  protected async count(filters?: Record<string, unknown>, options?: FilterOptions): Promise<number> {
    let query = this.supabase.from(this.tableName).select('*', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) return 0;
        query = query.in(camelToSnake(key), value);
      } else {
        query = query.eq(camelToSnake(key), value);
      }
    }
    query = this.applyFilterOptions(query, options);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  // ─── Yazma ───────────────────────────────────────────

  async insert(insertData: TInsert): Promise<TDb> {
    const dbData = appToDb(this.insertSchema.parse(insertData));
    const { data, error } = await this.supabase.from(this.tableName).insert(dbData).select().single();
    if (error) throw error;
    return this.dbSchema.parse(dbToApp(data));
  }

  protected async bulkInsert(rows: TInsert[]): Promise<TDb[]> {
    if (rows.length === 0) return [];
    const dbRows = rows.map((r) => appToDb(this.insertSchema.parse(r)));
    const { data, error } = await this.supabase.from(this.tableName).insert(dbRows).select();
    if (error) throw error;
    return this.parseRows(data ?? []);
  }

  async upsert(data: TInsert, onConflict: string): Promise<TDb> {
    const dbData = appToDb(this.insertSchema.parse(data));
    const { data: result, error } = await this.supabase.from(this.tableName).upsert(dbData, { onConflict }).select().single();
    if (error) throw error;
    return this.dbSchema.parse(dbToApp(result));
  }

  async update(updateData: TUpdate): Promise<TDb> {
    const validated = this.updateSchema.parse(updateData) as Record<string, unknown>;
    const { id } = validated as { id: string };
    // Yalnız çağrıda verilen alanları yaz (kısmi güncelleme).
    const provided = Object.keys(updateData as Record<string, unknown>).filter((k) => k !== 'id');
    const updates: Record<string, unknown> = {};
    for (const k of provided) updates[k] = validated[k];
    const { data, error } = await this.supabase.from(this.tableName).update(appToDb(updates)).eq('id', id).select().single();
    if (error) throw error;
    return this.dbSchema.parse(dbToApp(data));
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
   * Verilen id sırasına göre bir sıra-alanını 0..n-1 olarak toplu yazar (sürükle-bırak sonrası).
   * Küçük listeler için ardışık update; ilk hata fırlatılır. Alan camelCase verilir (ör. 'sortOrder').
   */
  protected async reorderBy(orderedIds: string[], field: string): Promise<void> {
    if (orderedIds.length === 0) return;
    const col = camelToSnake(field);
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

  /** Filtreye göre siler (bileşik anahtarlı tablolar için; en az bir filtre zorunlu). */
  protected async deleteWhere(filters: Record<string, unknown>): Promise<void> {
    const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) throw new Error(`[${this.tableName}] deleteWhere filtresiz çağrılamaz.`);
    let query = this.supabase.from(this.tableName).delete();
    for (const [key, value] of entries) query = query.eq(camelToSnake(key), value);
    const { error } = await query;
    if (error) throw error;
  }
}
