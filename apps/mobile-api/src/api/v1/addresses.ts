import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import {
  addCustomerAddress,
  checkAddressForCustomer,
  deleteCustomerAddress,
  geocoder,
  listCustomerAddresses,
  lookupAddressOptions,
  resolveAddressOption,
  setBillingCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
  type CustomerAddressOutcome,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import {
  AddressCheckResultSchema,
  AddressLookupCheckBodySchema,
  AddressLookupCheckResultSchema,
  AddressLookupResolvedSchema,
  AddressLookupSuggestResultSchema,
  AddressWriteSchema,
  CountryEnum,
  MeAddressListSchema,
  PreferredLanguageEnum,
  type Country,
} from '@lezzet/types';
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
  ADRES ARAMA KAPILARI (21.313) — adres çekmecesinin önerisi, seçilen önerinin açılışı ve elle girilen
  adresin doğrulanması. TEK KAPI, ÜLKE PARAMETRE (kullanıcı kararı 14.09): sağlayıcıyı (FR BAN · DE
  Google) uygulama katmanı seçer, burası yalnız taşıma. Web'in aynı işi bugün sunucu eylemlerinde
  (`apps/web/lib/address/lookup-actions.ts`).

  YALNIZ GİRİŞLİ MÜŞTERİ (router'ın `bearerAuth`u + bu dosyanın profil çözümü): Google oturum başına
  ücret keser; kapıyı ziyaretçiye açmak faturayı herkese açmak olurdu (web'in aynı gerekçesi).

  4xx YALNIZ BİÇİMSİZ SORUDA. Sağlayıcı düşerse ya da anahtar yoksa boş liste / `null` döner ve
  çekmece elle girişe düşer — öneri bir kolaylık, yokluğu müşterinin işini durdurmaz.

  SIRA BİLEREK BURADA, `/:id/…` uçlarından ÖNCE: `POST /lookup/check` sonra bağlansaydı Hono "lookup"u
  adres kimliği sanıp adres doğrulamasına (`POST /:id/check`) gönderirdi.
*/

/** Cevabın dili — Google adresi o dilde biçimler. Tanınmayan değer soruyu bozmaz, Fransızcaya düşer. */
function lookupLocale(c: Context<CustomerEnv>): string {
  const parsed = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  return parsed.success ? parsed.data : 'fr';
}

/** Adres ÖNCE ülkeyle sorulur (v1 kararı 13.09) — ülkesiz soru biçimsizdir. */
function lookupCountry(c: Context<CustomerEnv>): Country | null {
  const parsed = CountryEnum.safeParse(c.req.query('country'));
  return parsed.success ? parsed.data : null;
}

addresses.get('/lookup/suggest', async (c) => {
  const country = lookupCountry(c);
  if (country === null) return fail(c, 'invalid_query', 400);
  const outcome = await lookupAddressOptions({
    country,
    query: c.req.query('query') ?? '',
    sessionToken: c.req.query('session') ?? '',
    locale: lookupLocale(c),
  });
  return ok(
    c,
    AddressLookupSuggestResultSchema.parse(
      outcome.status === 'ok' ? { options: outcome.options, busy: false } : { options: [], busy: true },
    ),
  );
});

addresses.get('/lookup/resolve', async (c) => {
  const country = lookupCountry(c);
  const id = c.req.query('id') ?? '';
  if (country === null || id === '') return fail(c, 'invalid_query', 400);
  const address = await resolveAddressOption({ country, id, sessionToken: c.req.query('session') ?? '', locale: lookupLocale(c) });
  return ok(c, AddressLookupResolvedSchema.parse(address));
});

addresses.post('/lookup/check', async (c) => {
  const body = AddressLookupCheckBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);
  const outcome = await geocoder().locate(body.data);
  return ok(
    c,
    AddressLookupCheckResultSchema.parse(
      outcome.status === 'ok'
        ? { lat: outcome.point.lat, lng: outcome.point.lng, precision: outcome.precision, source: outcome.source }
        : null,
    ),
  );
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

/**
 * **Seçilen adresin kapısı gerçekten var mı** (11.11) — SİPARİŞ ANINDA çağrılır.
 *
 * Web'in `checkCheckoutAddressAction`ıyla aynı iş, aynı kapı (`checkAddress`) — iki yüzey aynı
 * soruyu aynı yerden soruyor. `POST` çünkü YAN ETKİSİ var: kararı adres satırına yazıyor
 * (`geo_alt_label`), yani sonraki okumalar da görüyor.
 *
 * ── HİÇBİR HÂLDE 4xx DÖNMEZ ────────────────────────────────────────────────
 * Cevap bir RET değil bir BİLGİ. Servis düşerse `unknown` döner ve ekran SUSAR — doğrulama sipariş
 * anında koştuğu için bir dış servisin kesintisi satışı durduramaz (FAIL-OPEN, kullanıcı kararı
 * 02.09). Başkasının adresi de `unknown`dur: varlığını doğrulamak bilgi sızdırmak olurdu.
 */
addresses.post('/:id/check', async (c) => {
  const outcome = await checkAddressForCustomer(serviceDb(), {
    customerId: c.get('customerId'),
    addressId: c.req.param('id'),
  });
  return ok(c, AddressCheckResultSchema.parse(outcome));
});

addresses.delete('/:id', async (c) => {
  return respond(c, await deleteCustomerAddress(serviceDb(), { customerId: c.get('customerId'), addressId: c.req.param('id') }));
});

/**
 * Varsayılan seçimi KENDİ ucudur, PATCH gövdesinin alanı değil: tek satırı işaretlemek yetmez,
 * öbürlerinin bayrağı düşmek zorunda — gövdeden kabul etmek "iki varsayılan" hatasını geri getirirdi.
 */
/**
 * FATURA ADRESİNİ SEÇ (kullanıcı kararı 08.09) — `/default`ün ikizi, AYRI uç.
 *
 * Ayrı olması bilinçli: varsayılan adres *"malı nereye götürelim"*, fatura adresi *"fatura nereye
 * kesilecek"*. Biri ötekini düşürmez ve çoğu işletmede ikisi aynı satırdır. Tek uçta birleştirmek,
 * müşteriye "teslimat adresimi değiştirdim" dedirtmeden faturasını taşımak olurdu.
 */
addresses.post('/:id/billing', async (c) => {
  return respond(c, await setBillingCustomerAddress(serviceDb(), { customerId: c.get('customerId'), addressId: c.req.param('id') }));
});

addresses.post('/:id/default', async (c) => {
  return respond(c, await setDefaultCustomerAddress(serviceDb(), { customerId: c.get('customerId'), addressId: c.req.param('id') }));
});
