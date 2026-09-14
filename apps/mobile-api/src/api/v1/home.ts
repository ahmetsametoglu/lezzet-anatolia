import { Hono } from 'hono';
import { readHome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readPlace, readViewer } from './catalog';

/**
 * Vitrin ucu (21.14 bağlanma etabı) — ana ekranın MÜŞTERİDEN BAĞIMSIZ bölümleri TEK turda.
 *
 * Katalogla aynı iki karar geçerli ve gerekçeleri `catalog.ts` başlığında:
 *   · **Oturumsuz gezilir** — `router.ts`te `bearerAuth`tan ÖNCE bağlıdır; Bearer varsa yalnız
 *     fırsat FİYATINI kişiselleştirir (B2B/özel fiyat), erişimi değiştirmez. 401 yok.
 *   · **`locale` zorunlu ve varsayılansız** — eksikse 400 (sessizce Türkçeye düşmek gizli arıza;
 *     `catalog.ts` `LocaleSchema` künyesi).
 *
 * BU DOSYA KURAL HESAPLAMAZ: bölümlerin okuması, seçimi/sayımı/daraltması ve sözleşme süzgeci
 * `@lezzet/application`da (`readHome` — 14.09'da `lib/home.ts` · `lib/ideas.ts` ·
 * `lib/campaign-wire.ts`ten pakete terfi etti; web telefon görünümü de AYNI okumayı çağırıyor).
 * Burada yalnız sorgu çözümü, kimlik çözümü ve zarf.
 *
 * Selamlama · puan · rozet · süren sipariş BİLEREK YOK (kullanıcı kararı 08.08): kimlikli bölümler
 * bu uçta kapsam dışı; ekran onları kimlikli uçlardan alır. Sözleşmede olmayan bölümlerin
 * (flash · seçki · paket) gerekçesi `home-api.schema.ts` başlığında — uç dolduramayacağını taşımaz.
 */
export const home = new Hono<AppEnv>();

home.get('/home', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  /* Yer İSTEKTEN çözülür (09.08): istemci posta kodunu gönderir, sunucu depoyu bulur. Kimlikle
     birlikte tek turda okunur — biri ötekini bekletmez. Gerekçe `catalog.ts` `readPlace`
     künyesinde; kod yoksa iki `null` döner ve okuma depo-üstüne düşer. */
  const [viewer, place] = await Promise.all([
    readViewer(db, c.req.header('authorization')),
    readPlace(db, c.req.query('postalCode')),
  ]);
  return ok(c, await readHome(db, locale.data, place, viewer));
});
