import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { HomeSchema, PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readHomeBands, readHomeFeatured, readHomeOffers } from '../../lib/home';
// Tarif/paket KARTI iki yüzeyin ortak kapısından gelir (`lib/ideas.ts`): vitrin şeridi ile Fikirler
// listesi aynı kartı çiziyor, fark yalnız sınır ve süzgeçte.
import { HOME_PACKAGE_LIMIT, HOME_RECIPE_LIMIT, readPackageCards, readRecipeCards } from '../../lib/ideas';
import { readViewer, UNKNOWN_PLACE } from './catalog';

/**
 * Vitrin ucu (21.14 bağlanma etabı) — ana ekranın MÜŞTERİDEN BAĞIMSIZ bölümleri TEK turda.
 *
 * Katalogla aynı iki karar geçerli ve gerekçeleri `catalog.ts` başlığında:
 *   · **Oturumsuz gezilir** — `router.ts`te `bearerAuth`tan ÖNCE bağlıdır; Bearer varsa yalnız
 *     fırsat FİYATINI kişiselleştirir (B2B/özel fiyat), erişimi değiştirmez. 401 yok.
 *   · **`locale` zorunlu ve varsayılansız** — eksikse 400 (sessizce Türkçeye düşmek gizli arıza;
 *     `catalog.ts` `LocaleSchema` künyesi).
 *
 * BU DOSYA KURAL HESAPLAMAZ: bölüm seçimi/sayımı/daraltması okuma kapısında (`lib/home.ts`),
 * fiyat-stok kararları `@lezzet/application`da. Burada yalnız sorgu çözümü, kimlik çözümü ve zarf.
 *
 * Selamlama · puan · rozet · süren sipariş BİLEREK YOK (kullanıcı kararı 08.08): kimlikli bölümler
 * bu etapta kapsam dışı; ekran onları kimlikli uçlardan alacak. Sözleşmede olmayan bölümlerin
 * (flash · seçki · paket) gerekçesi `home-api.schema.ts` başlığında — uç dolduramayacağını taşımaz.
 */
export const home = new Hono<AppEnv>();

home.get('/home', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const viewer = await readViewer(db, c.req.header('authorization'));
  // Bölümler birbirinden bağımsız okunur; biri ötekini bekletmez. `limit` sorgusu yok: raylar
  // editoryal seçkidir, sınırlar okuma kapısında sabittir (CLAUDE §1).
  const [bands, offers, featured, recipes, packages] = await Promise.all([
    readHomeBands(db, locale.data),
    readHomeOffers(db, locale.data, UNKNOWN_PLACE, viewer),
    readHomeFeatured(db, locale.data, UNKNOWN_PLACE, viewer),
    readRecipeCards(db, locale.data, HOME_RECIPE_LIMIT),
    // Vitrin YALNIZ işaretli paketleri taşır — işaret bir seçimdir, yedeği yoktur (sözleşme künyesi).
    readPackageCards(db, locale.data, { featuredOnly: true, limit: HOME_PACKAGE_LIMIT }),
  ]);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: okuma kapısının döndürdüğü şekiller sözleşmeye alan alan
  // uymak zorunda ve uymadığı gün burası DERLENMEZ; `parse` da süzgeçtir — fazla alan zarfa sızamaz.
  const body: z.input<typeof HomeSchema> = { bands, offers, featured, recipes, packages };
  return ok(c, HomeSchema.parse(body));
});
