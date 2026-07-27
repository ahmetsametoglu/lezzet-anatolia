import { afterAll, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../client';
import { CategoryService } from './category.service';
import { CollectionService } from './collection.service';

// Entegrasyon testleri — local Supabase'e vurur (pnpm db:start + migrationlar uygulı olmalı).
const db = createServiceRoleClient();
const categories = new CategoryService(db);
const collections = new CollectionService(db);
const createdCategoryIds: string[] = [];
const createdCollectionIds: string[] = [];

afterAll(async () => {
  for (const id of createdCategoryIds) await categories.delete(id).catch(() => {});
  for (const id of createdCollectionIds) await collections.delete(id).catch(() => {});
});

describe('CategoryService', () => {
  it('oluştur → güncelle → pasifle akışı', async () => {
    const created = await categories.create({ name: { tr: 'Su Böreği', fr: 'Börek à l’eau' } });
    createdCategoryIds.push(created.id);
    expect(created.slug).toBe('su-boregi'); // slug TR adından türer (yedek zinciri TR→FR→DE)
    expect(created.isActive).toBe(true);

    // Yeni kayıt listenin SONUNA eklenir (DB default'u 0 olsaydı mevcutların arasına karışırdı):
    // ikinci kayıt daima birincinin ardında. Mutlak değer beklenmez — tabloda başka satırlar var.
    const second = await categories.create({ name: { tr: 'Su Böreği İkinci' } });
    createdCategoryIds.push(second.id);
    expect(second.sortOrder).toBeGreaterThan(created.sortOrder);

    const renamed = await categories.update({ id: created.id, name: { tr: 'Su Böreği (güncel)', fr: 'Börek à l’eau' } });
    expect(renamed.name.tr).toContain('güncel');
    expect(renamed.slug).toBe('su-boregi'); // rename slug'ı değiştirmez (URL korunur)

    const deactivated = await categories.setActive(created.id, false);
    expect(deactivated.isActive).toBe(false);
  });

  it('aynı adla ikinci kayıt farklı slug alır', async () => {
    const a = await categories.create({ name: { tr: 'Mercimek Çorbası' } });
    const b = await categories.create({ name: { tr: 'Mercimek Çorbası' } });
    createdCategoryIds.push(a.id, b.id);
    expect(a.slug).toBe('mercimek-corbasi');
    expect(b.slug).toBe('mercimek-corbasi-2');
  });

  it('list activeOnly yalnız aktifleri döndürür', async () => {
    const activeOnly = await categories.list({ activeOnly: true });
    expect(activeOnly.every((c) => c.isActive)).toBe(true);
  });
});

describe('CollectionService', () => {
  it('oluştur (sıra) → pasifle', async () => {
    const c = await collections.create({ name: { tr: 'Bayram' }, sortOrder: 5 });
    createdCollectionIds.push(c.id);
    expect(c.slug).toBe('bayram');
    expect(c.sortOrder).toBe(5);

    const off = await collections.setActive(c.id, false);
    expect(off.isActive).toBe(false);
  });
});
