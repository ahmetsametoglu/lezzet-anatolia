import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { PreferredLanguageEnum, RecipeDetailSchema, RecipeListSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { RECIPE_LIST_LIMIT, readRecipeCards } from '../../lib/ideas';
import { readRecipeDetail } from '../../lib/recipe';
import { readPlace, readViewer } from './catalog';

/**
 * Tarif uçları (21.14, tasarım 21) — katalogla aynı üç karar, gerekçeleri `catalog.ts` başlığında:
 *   · **Oturumsuz gezilir** — `router.ts`te `bearerAuth`tan ÖNCE bağlıdır; Bearer varsa yalnız
 *     satır FİYATINI kişiselleştirir (B2B/özel fiyat), erişimi değiştirmez. 401 yok.
 *   · **`locale` zorunlu ve varsayılansız** — eksikse 400 (sessizce Türkçeye düşmek gizli arıza).
 *   · **Yer İSTEKTEN çözülür** (09.08, `readPlace`) — stok/teklif kısıtları katalogla aynı davranır;
 *     posta kodu gelmezse yer bilinmiyor sayılır.
 *
 * BU DOSYA KURAL HESAPLAMAZ: kompozisyon okuma kapısında (`lib/recipe.ts`), fiyat/stok kararları
 * `@lezzet/application`da. Burada yalnız sorgu çözümü, kimlik çözümü ve zarf.
 */
export const recipes = new Hono<AppEnv>();

/**
 * TARİF LİSTESİ — "Fikirler" sekmesinin tarif bölümü (09.08 bilgi mimarisi kararı).
 *
 * **SAYFALAMA YOK ve bu bilinçli** (CLAUDE §1): tarif kümesi operatörün elle kurduğu editoryal bir
 * seçkidir, veriyle büyümez → doğal tavanlı küme, tek turda çekilir. `limit`/`cursor` sorgusu da
 * yok: istemcinin büyütebileceği bir sınır, sınır değildir. Uçtaki `RECIPE_LIST_LIMIT` sayfalama
 * değil emniyet tavanıdır (gerekçesi `lib/ideas.ts` künyesinde).
 *
 * KİMLİK OKUNMAZ: kart içerik kartıdır, fiyat taşımaz — Bearer'ın kişiselleştireceği bir şey yok
 * (paket detayı ucunun aynı kısa devresi). Detay ucunun aksine `readViewer` çağrılmıyor: boşa bir
 * tur olurdu.
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
  const place = await readPlace(db, c.req.query('postalCode'));
  const detail = await readRecipeDetail(db, c.req.param('slug'), locale.data, place, viewer);
  if (!detail) return fail(c, 'recipe_not_found', 404);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: okuma kapısının döndürdüğü şekil sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ; `parse` da süzgeçtir — fazla alan zarfa sızamaz.
  const body: z.input<typeof RecipeDetailSchema> = detail;
  return ok(c, RecipeDetailSchema.parse(body));
});
