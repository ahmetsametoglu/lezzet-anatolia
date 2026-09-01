import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import {
  addCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  setDefaultCustomerAddress,
  updateCustomerAddress,
  type CustomerAddressOutcome,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { AddressWriteSchema, MeAddressListSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/*
  `/me/addresses` (21.15) — hesap ekranının adres bölümü + v3 `shAddr` çekmecesi. KURAL BURADA
  DEĞİL: sahiplik, `isDefault` sızdırmazlığı, "varsayılan silinirse en yeni devralır" ve sıralama
  `@lezzet/application`ın adres kapısında (web hesap sayfasıyla TEK kural — `customer/addresses.ts`
  künyesi). Bu dosya taşıma katmanıdır: gövdeyi süzer, kimliği çözer, sonucu zarfa koyar.

  Cevap HER uçta güncel listedir (`MeAddressListSchema` süzgeciyle — pick dışı alan zarfa sızamaz);
  gerekçe sözleşme dosyasında: yazımlar komşu satırları da oynatır, tek kayıt dönmek istemciyi
  ikinci tura mecbur bırakırdı.
*/

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü TEK middleware'de: beş uç aynı satırları tekrar etmesin. Profili olmayan auth
 * kullanıcısı `PATCH /me` ile aynı cevabı alır (`profile_not_found`, 404) — trigger boşluğu ya da
 * silinmiş kayıt; boş liste uydurmak arızayı görünmez kılardı (router'daki gerekçenin aynısı).
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/** Kapının adlı retleri → HTTP; başarı hep süzülmüş liste. */
function respond(c: Context<CustomerEnv>, outcome: CustomerAddressOutcome): Response {
  if (outcome.status !== 'ok') return fail(c, outcome.status, outcome.status === 'not_found' ? 404 : 400);
  return ok(c, MeAddressListSchema.parse(outcome.addresses));
}

export const addresses = new Hono<CustomerEnv>();
addresses.use('*', resolveCustomer);

addresses.get('/', async (c) => {
  const rows = await listCustomerAddresses(serviceDb(), c.get('customerId'));
  return ok(c, MeAddressListSchema.parse(rows));
});

/*
  NOKTA GÖVDENİN İÇİNDE GELİR AMA YAZMA ALANI DEĞİLDİR (11.9 · 01.09) — bu yüzden `point` gövdeden
  AYRIŞTIRILIP kapıya kendi parametresiyle veriliyor, `patch` içinde taşınmıyor.

  Web'de aynı ayrım imzada duruyor (`addAddress(…, point)`); orada araya HTTP girmediği için nokta
  gövdeye hiç konmadı. Burada konmak zorunda — ve tam o yüzden burada AYIRMAK gerekiyor: `patch`
  olduğu gibi geçseydi kapının "yazılabilir alanlar" tipi ile gövde ayrışır, `point` bir gün
  `address` satırına düz bir alan gibi akardı. Süzgeci (`plausiblePoint`) atlayan ikinci yol böyle
  doğar.
*/
addresses.post('/', async (c) => {
  const body = AddressWriteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);
  const { point, ...write } = body.data;
  return respond(c, await addCustomerAddress(serviceDb(), { customerId: c.get('customerId'), point, ...write }));
});

addresses.patch('/:id', async (c) => {
  const body = AddressWriteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);
  const { point, ...patch } = body.data;
  return respond(
    c,
    await updateCustomerAddress(serviceDb(), {
      customerId: c.get('customerId'),
      addressId: c.req.param('id'),
      patch,
      point,
    }),
  );
});

addresses.delete('/:id', async (c) => {
  return respond(c, await deleteCustomerAddress(serviceDb(), { customerId: c.get('customerId'), addressId: c.req.param('id') }));
});

/**
 * Varsayılan seçimi KENDİ ucudur, PATCH gövdesinin alanı değil: tek satırı işaretlemek yetmez,
 * öbürlerinin bayrağı düşmek zorunda — gövdeden kabul etmek "iki varsayılan" hatasını geri getirirdi.
 */
addresses.post('/:id/default', async (c) => {
  return respond(c, await setDefaultCustomerAddress(serviceDb(), { customerId: c.get('customerId'), addressId: c.req.param('id') }));
});
