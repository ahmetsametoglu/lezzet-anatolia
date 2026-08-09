import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { PreferredLanguageEnum, RecipeDetailSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readRecipeDetail } from '../../lib/recipe';
import { readViewer, UNKNOWN_PLACE } from './catalog';

/**
 * Tarif detay ucu (21.14, tasarım 21) — katalogla aynı üç karar, gerekçeleri `catalog.ts` başlığında:
 *   · **Oturumsuz gezilir** — `router.ts`te `bearerAuth`tan ÖNCE bağlıdır; Bearer varsa yalnız
 *     satır FİYATINI kişiselleştirir (B2B/özel fiyat), erişimi değiştirmez. 401 yok.
 *   · **`locale` zorunlu ve varsayılansız** — eksikse 400 (sessizce Türkçeye düşmek gizli arıza).
 *   · **Yer bilinmiyor** (`UNKNOWN_PLACE`) — stok/teklif kısıtları katalogla aynı davranır.
 *
 * BU DOSYA KURAL HESAPLAMAZ: kompozisyon okuma kapısında (`lib/recipe.ts`), fiyat/stok kararları
 * `@lezzet/application`da. Burada yalnız sorgu çözümü, kimlik çözümü ve zarf.
 */
export const recipes = new Hono<AppEnv>();

/**
 * Taslak tarif doğrudan bağlantıyla da AÇILMAZ (404): vitrin şeridinde görünmeyen bir taslağın
 * linkle gezilebilir olması yayın kapısının kararını boşa çıkarırdı (`catalog.ts`in ürün emsali).
 */
recipes.get('/recipes/:slug', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const viewer = await readViewer(db, c.req.header('authorization'));
  const detail = await readRecipeDetail(db, c.req.param('slug'), locale.data, UNKNOWN_PLACE, viewer);
  if (!detail) return fail(c, 'recipe_not_found', 404);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: okuma kapısının döndürdüğü şekil sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ; `parse` da süzgeçtir — fazla alan zarfa sızamaz.
  const body: z.input<typeof RecipeDetailSchema> = detail;
  return ok(c, RecipeDetailSchema.parse(body));
});
