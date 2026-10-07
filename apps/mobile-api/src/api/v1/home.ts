import { Hono } from 'hono';
import { readHome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { placeQueryOf, readPlaceOrPickup, readViewer } from './catalog';

/**
 * Vitrinin müşteriden bağımsız bölümleri tek turda; oturumsuz gezilir (Bearer yalnız fiyatı kişiselleştirir) ve kural hesaplamaz,
 * okuma web'le ortak `readHome`da. Kimlikli bölümler (selamlama, puan, süren sipariş) bu uçta yok, ekran onları kimlikli uçlardan alır.
 */
export const home = new Hono<AppEnv>();

home.get('/home', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  /* Yer istekten çözülür, depoyu sunucu bulur; gel-al seçimi kimlik istediği için önce kimlik okunur. Kod yoksa okuma depo-üstüne
     düşer. */
  const viewer = await readViewer(db, c.req.header('authorization'));
  const { place } = await readPlaceOrPickup(db, {
    ...placeQueryOf(c),
    pickupWarehouseId: c.req.query('pickupWarehouseId'),
    customerId: viewer.customerId,
  });
  return ok(c, await readHome(db, locale.data, place, viewer));
});
