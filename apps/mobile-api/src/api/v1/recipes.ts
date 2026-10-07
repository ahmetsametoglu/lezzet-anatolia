import { Hono } from 'hono';
import type { z } from 'zod';
import { customerBusiness, RECIPE_LIST_LIMIT, readRecipeCards } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { PreferredLanguageEnum, RecipeDetailSchema, RecipeListSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readRecipeDetail } from '../../lib/recipe';
import { placeQueryOf, readPlace, readViewer } from './catalog';

/**
 * Tarif uçları katalogla aynı üç kararı uygular (gerekçeleri `catalog.ts` başlığında): oturumsuz gezilir, `locale` zorunludur ve yer
 * istekten çözülür. Bu dosya kural hesaplamaz; kompozisyon `lib/recipe.ts`te, fiyat ve stok kararları `@lezzet/application`dadır.
 */
export const recipes = new Hono<AppEnv>();

/**
 * Tarif listesi, "Fikirler" sekmesinin tarif bölümü: tarif kümesi operatörün kurduğu editoryal seçki olduğu için sayfalanmaz,
 * `RECIPE_LIST_LIMIT` yalnız emniyet tavanıdır. Kimlik okunmaz, çünkü kart fiyat taşımaz.
 */
recipes.get('/recipes', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const list = await readRecipeCards(serviceDb(), locale.data, RECIPE_LIST_LIMIT);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  const body: z.input<typeof RecipeListSchema> = { recipes: list };
  return ok(c, RecipeListSchema.parse(body));
});

/**
 * Taslak tarif doğrudan bağlantıyla da AÇILMAZ (404): vitrin şeridinde görünmeyen bir taslağın
 * linkle gezilebilir olması yayın kapısının kararını boşa çıkarırdı (`catalog.ts`in ürün emsali).
 */
recipes.get('/recipes/:slug', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const viewer = await readViewer(db, c.req.header('authorization'));
  const { postalCode, country } = placeQueryOf(c);
  const place = await readPlace(db, postalCode, await customerBusiness(db, viewer.customerId), country);
  const detail = await readRecipeDetail(db, c.req.param('slug'), locale.data, place, viewer);
  if (!detail) return fail(c, 'recipe_not_found', 404);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: okuma kapısının döndürdüğü şekil sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ; `parse` da süzgeçtir — fazla alan zarfa sızamaz.
  const body: z.input<typeof RecipeDetailSchema> = detail;
  return ok(c, RecipeDetailSchema.parse(body));
});
