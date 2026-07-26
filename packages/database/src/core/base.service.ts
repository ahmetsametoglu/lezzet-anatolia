import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType, ZodTypeDef } from 'zod';
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
  orFilter?: string;
}
interface GetAllOptions extends FilterOptions {
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  select?: string;
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
    if (options.orFilter) query = query.or(options.orFilter);
    return query;
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

  protected async getAll(filters?: Record<string, unknown>, options?: GetAllOptions): Promise<TDb[]> {
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
    query = this.applyFilterOptions(query, options);
    if (options?.orderBy) {
      query = query.order(camelToSnake(options.orderBy), { ascending: options.orderDirection !== 'desc' });
    }
    if (options?.offset !== undefined && options?.limit !== undefined) {
      query = query.range(options.offset, options.offset + options.limit - 1);
    } else if (options?.limit) {
      query = query.limit(options.limit);
    }
    const { data, error } = await query;
    if (error) throw error;
    return this.parseRows(data as unknown[]);
  }

  /** Tek satır getirir (verilen alanlara göre) ya da null. Kimlik anahtarı aramaları için. */
  protected async getOneBy(filters: Record<string, unknown>): Promise<TDb | null> {
    const rows = await this.getAll(filters, { limit: 1 });
    return rows[0] ?? null;
  }

  protected async count(filters?: Record<string, unknown>): Promise<number> {
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
