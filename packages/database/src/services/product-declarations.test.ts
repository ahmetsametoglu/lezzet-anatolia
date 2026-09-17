import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { missingDeclarations, type DeclarationGap } from '@lezzet/types';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { ProductService } from './product.service';

/**
 * Beyan ölçütü iki yerde yaşar: üretilmiş `is_incomplete` kolonu (süzgeç, sayaç) ve `missingDeclarations` (ekran, asistan).
 * İkisi ayrışırsa ekran "eksik yok" derken süzgeç ürünü eksik listeler; bu test aynı ürüne aynı cevabı verdiklerini sınar.
 */
const db = serviceDb();
const products = new ProductService(db);

const STAMP = `B${Date.now()}`;
const createdProductIds: string[] = [];
const idByCase = new Map<string, string>();

const TAM: Record<string, unknown> = {
  description: { tr: 'Açıklama.', fr: 'Description.', de: 'Beschreibung.' },
  ingredients: { tr: 'Un, su.', fr: 'Farine, eau.', de: 'Mehl, Wasser.' },
  storageInstructions: { tr: 'Serin yerde.', fr: 'Au frais.', de: 'Kühl lagern.' },
  nutrition: { energyKj: 1600, energyKcal: 380, fatG: 18, saturatedFatG: 7, carbohydrateG: 45, sugarsG: 22, proteinG: 6, saltG: 0.3 },
  allergens: ['gluten'],
};

const CASES: Array<{ key: string; patch: Record<string, unknown>; gaps: DeclarationGap[] }> = [
  { key: 'tam', patch: {}, gaps: [] },
  { key: 'icindekiler yalniz tr', patch: { ingredients: { tr: 'Un, su.' } }, gaps: ['ingredients'] },
  { key: 'saklama fr bosluk', patch: { storageInstructions: { tr: 'Serin yerde.', fr: ' ', de: 'Kühl lagern.' } }, gaps: ['storage'] },
];

beforeAll(async () => {
  for (const c of CASES) {
    const { product } = await products.create({
      name: { tr: `${STAMP} ${c.key}`, fr: `${STAMP} ${c.key} fr`, de: `${STAMP} ${c.key} de` },
      ...TAM,
      ...c.patch,
    });
    createdProductIds.push(product.id);
    idByCase.set(c.key, product.id);
  }
});

afterAll(async () => {
  await purgeTestData(db, { productIds: createdProductIds });
});

describe('beyan ölçütü — motor ve üretilmiş kolon', () => {
  it('aynı ürünü aynı cevapla okur', async () => {
    const page = await products.list({ filters: { query: STAMP, onlyIncomplete: true }, limit: 50 });
    const incomplete = new Set(page.rows.map((p) => p.id));
    const rows = await products.listByIds([...idByCase.values()]);

    for (const c of CASES) {
      const row = rows.find((p) => p.id === idByCase.get(c.key));
      expect(row, c.key).toBeDefined();
      expect(missingDeclarations(row!), c.key).toEqual(c.gaps);
      expect(incomplete.has(row!.id), c.key).toBe(c.gaps.length > 0);
    }
  });
});
