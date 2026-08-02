import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { BaseDbService } from './base.service';

/**
 * `moneyFields` eşlemesi (02.9 · STACK §8) — **DB'siz**, sorgu kaydedici bir istemciyle.
 *
 * Neden gerçek veritabanı değil: burada doğrulanan şey satırın yazılıp okunması değil, kurulan
 * SORGUNUN kendisi — hangi kolon adı, hangi birimde değer. Süzgeç birimi yanlışsa gerçek DB testi
 * "boş liste" döner ve BU DA GEÇERLİ bir sonuç gibi görünür; hatanın kendisini görmenin tek yolu
 * PostgREST'e giden çağrıya bakmak. Servis sınırının gidiş-dönüşü ayrıca gerçek DB üstünde
 * doğrulanır (`services/price.test.ts` — "euro↔cent sınırı").
 */

interface Call {
  method: string;
  args: unknown[];
}

const CHAINED = [
  'select', 'eq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte',
  'ilike', 'like', 'contains', 'or', 'order', 'limit', 'range',
  'insert', 'update', 'upsert', 'delete',
];

/** `from(...)` zincirini kaydeden sahte istemci; `await` edildiğinde verilen satırları döner. */
function recorder(rows: unknown[]): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  let single = false;
  const query: Record<string, unknown> = {
    single: (...args: unknown[]) => {
      calls.push({ method: 'single', args });
      single = true;
      return query;
    },
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: single ? (rows[0] ?? null) : rows, error: null }),
  };
  for (const method of CHAINED) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const RowSchema = z.object({
  id: z.string(),
  amountCents: z.number().int().nullable(),
  label: z.string(),
});
type Row = z.infer<typeof RowSchema>;

const InsertSchema = RowSchema.omit({ id: true });
type Insert = z.infer<typeof InsertSchema>;

/** Para beyanı olan servis — `amountCents` ↔ `amount` kolonu. */
class MoneyService extends BaseDbService<Row, Insert, never> {
  protected override readonly moneyFields = ['amountCents'];

  constructor(client: SupabaseClient) {
    super(client, 'thing', RowSchema, InsertSchema, z.never());
  }

  read(filters: Record<string, unknown>, amountAtLeastCents?: number) {
    return this.getAll(filters, {
      orderBy: 'amountCents',
      rangeFilters: amountAtLeastCents === undefined ? [] : [{ field: 'amountCents', operator: 'gte', value: amountAtLeastCents }],
    });
  }
}

/** Beyansız servis — aynı taban, para dokunuşu YOK (kural yalnız beyan edene uygulanır). */
class PlainService extends BaseDbService<{ id: string; amount: number }, never, never> {
  constructor(client: SupabaseClient) {
    super(client, 'thing', z.object({ id: z.string(), amount: z.number() }), z.never(), z.never());
  }

  read() {
    return this.getAll({ amount: 12.5 });
  }
}

const argsOf = (calls: Call[], method: string): unknown[][] => calls.filter((c) => c.method === method).map((c) => c.args);

describe('BaseDbService — para alanı eşlemesi', () => {
  it('okumada euro kolonu cent alanına iner', async () => {
    const { client } = recorder([{ id: 'a', amount: '16.90', label: 'x' }]);
    const [row] = await new MoneyService(client).read({});
    expect(row).toEqual<Row>({ id: 'a', amountCents: 1690, label: 'x' });
  });

  it('null kolon null kalır — ölçülemeyen değer sıfır değildir', async () => {
    const { client } = recorder([{ id: 'a', amount: null, label: 'x' }]);
    const [row] = await new MoneyService(client).read({});
    expect(row?.amountCents).toBeNull();
  });

  it('yazmada cent alanı euro kolonuna çıkar', async () => {
    const { client, calls } = recorder([{ id: 'a', amount: '12.34', label: 'x' }]);
    await new MoneyService(client).insert({ amountCents: 1234, label: 'x' });
    expect(argsOf(calls, 'insert')[0]?.[0]).toEqual({ amount: 12.34, label: 'x' });
  });

  it('eşitlik süzgecinde hem kolon adı hem BİRİM çevrilir', async () => {
    // Çevrilmezse sorgu `amount = 1690` (1690 €) arar: satır bulunmaz, hata da patlamaz —
    // liste sessizce boş kalır. Bu yüzden süzgeç ayrı bir iddiadır.
    const { client, calls } = recorder([]);
    await new MoneyService(client).read({ amountCents: 1690 });
    expect(argsOf(calls, 'eq')).toContainEqual(['amount', 16.9]);
  });

  it('aralık süzgeci ve sıralama da kolon adını kullanır', async () => {
    const { client, calls } = recorder([]);
    await new MoneyService(client).read({}, 500);
    expect(argsOf(calls, 'gte')).toContainEqual(['amount', 5]);
    expect(argsOf(calls, 'order')[0]?.[0]).toBe('amount');
  });

  it('beyan etmeyen serviste para alanına DOKUNULMAZ', async () => {
    const { client, calls } = recorder([{ id: 'a', amount: 12.5 }]);
    const [row] = await new PlainService(client).read();
    expect(row?.amount).toBe(12.5);
    expect(argsOf(calls, 'eq')).toContainEqual(['amount', 12.5]);
  });
});
