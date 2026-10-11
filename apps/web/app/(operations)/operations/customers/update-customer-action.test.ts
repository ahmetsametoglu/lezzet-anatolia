import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Database from '@lezzet/database';
import type { CustomerEditInput } from './customers-types';

type DatabaseModule = typeof Database;

/**
 * Girişe bağlı kaydın e-postası giriş anahtarıdır; eylem onu değiştirirse profil girişten ayrışır ve yeni adresle açılan giriş kayda
 * bağlanamaz. Girişsiz kayıtta ise e-posta değişikliği mirasın yoludur.
 */
const BOUND = '00000000-0000-4000-8000-0000000000e1';
const UNBOUND = '00000000-0000-4000-8000-0000000000e2';
const rows: Record<string, { id: string; authUserId: string | null; email: string | null }> = {
  [BOUND]: { id: BOUND, authUserId: '00000000-0000-4000-8000-0000000000a1', email: 'giris@example.test' },
  [UNBOUND]: { id: UNBOUND, authUserId: null, email: 'ofis@example.test' },
};
const writes: Array<{ id: string; email?: string | null }> = [];

vi.mock('@/lib/guard', () => ({ requireAdmin: async () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@lezzet/database', async (importOriginal) => ({
  ...(await importOriginal<DatabaseModule>()),
  serviceDb: () => ({}),
  UserProfileService: class {
    async getById(id: string) {
      return rows[id] ?? null;
    }
    async update(patch: { id: string; email?: string | null }) {
      writes.push(patch);
      return patch;
    }
  },
}));

const { updateCustomerAction } = await import('./actions');

function input(email: string | null): CustomerEditInput {
  return {
    name: 'Müşteri',
    phone: '+33612345678',
    email,
    preferredLanguage: 'fr',
    country: 'FR',
    type: 'company',
    vatNumber: null,
    codAllowed: true,
    pickupAllowed: false,
    business: 'lezzet',
    priceRuleBasis: null,
    priceRulePercent: null,
    priceGroupId: null,
  };
}

beforeEach(() => {
  writes.length = 0;
});

describe('müşteri düzenleme eylemi · e-posta', () => {
  it('girişe bağlı kayıtta e-posta değiştirilemez; kayıt yazılmaz', async () => {
    const sonuc = await updateCustomerAction(BOUND, input('baska@example.test'));
    expect(sonuc.error).not.toBeNull();
    expect(writes).toEqual([]);
  });

  it('girişe bağlı kayıtta e-posta aynı kalırsa öteki alanlar yazılır', async () => {
    expect((await updateCustomerAction(BOUND, input('giris@example.test'))).error).toBeNull();
    expect(writes).toHaveLength(1);
  });

  it('girişsiz kayıtta e-posta değişir', async () => {
    expect((await updateCustomerAction(UNBOUND, input('musteri@example.test'))).error).toBeNull();
    expect(writes[0]?.email).toBe('musteri@example.test');
  });
});
