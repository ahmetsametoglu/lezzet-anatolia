import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb, UserProfileService } from '@lezzet/database';
import {
  listPublicDeliveryAreas,
  recordZoneNotice,
  resolvePlaceForPostalCode,
  suggestPlaces,
  UNRESOLVED_PLACE,
} from '@lezzet/application';
import { placeLabel, type PostalCodeResolution } from '@lezzet/domain-core';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/helper';
import {
  DeliveryAreaListSchema,
  PlaceNoticeBodySchema,
  PlaceNoticeResultSchema,
  PlaceResolutionSchema,
  PlaceOptionListSchema,
} from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readJsonBody } from '../../lib/request';
import { optionalCustomerId } from './auth';
import { recordNativeEvent } from '../../lib/analytics';
import { localeOf } from './cart-view';

/**
 * Oturumsuz açık uçlar (`bearerAuth`tan önce bağlanır): uygulamanın ilk sorusu posta kodu ve cevabı herkes için aynı. Depo kimliği
 * zarfa girmez; cihaz yalnız cevabı saklar, vitrin uçları yeri her istekte yeniden çözer.
 */
export const places = new Hono<AppEnv>();

/** Rota ve kargo tek `resolved` hâline iner, fark `inRoute`tadır: onboarding'in sorusu depo değil, araç mı kargo mu. */
function toContract(code: string, resolution: PostalCodeResolution): z.input<typeof PlaceResolutionSchema> {
  switch (resolution.kind) {
    case 'route':
    case 'shipping':
      return {
        kind: 'resolved',
        place: {
          country: resolution.country,
          postalCode: code,
          placeName: resolution.placeName,
          places: [...resolution.places],
          inRoute: resolution.kind === 'route',
        },
      };
    case 'ambiguous':
      return {
        kind: 'ambiguous',
        // Her seçenek saklanabilir yer anahtarı taşır ki istemci sorgudaki ham kodu hatırlamak zorunda kalmasın.
        options: resolution.candidates.map((candidate) => ({
          country: candidate.country,
          postalCode: code,
          placeName: placeLabel(candidate.places),
          places: [...candidate.places],
          inRoute: candidate.inRoute,
        })),
      };
    case 'unknown':
      return { kind: 'unknown' };
    case 'unresolved':
      return { kind: 'unresolved', reason: resolution.reason };
  }
}

/**
 * Biçimsiz kod geçerli bir soru değildir (400); hiçbir ülkede olmayan beş haneli kod ise geçerli sorunun cevabıdır (`unknown`) ve
 * ekran ikisine ayrı cümle kurar.
 */
places.get('/places/by-postal-code', async (c) => {
  const code = normalizePostalCode(c.req.query('code') ?? '');
  if (!isValidPostalCode(code)) return fail(c, 'invalid_code', 400);

  const db = serviceDb();
  const resolution = await resolvePlaceForPostalCode(db, code);

  /* Huninin ilk adımı bu uçta sayılır, öneri ucunda sayılmaz: öneri her tuşta çağrılır ve paydayı şişirirdi. Katalog uçlarının
     `null` geçtiği ülke burada biliniyor (`BEKLEYEN(21.103)`); depo çözülmez, ölçüm için ikinci tur atılmaz. */
  void recordNativeEvent(
    {
      db,
      // Çözüm fiyat taşımadığı için kanal sorulmaz; B2B müşterisi de aynı cevabı alır.
      channel: 'b2c',
      customerId: await optionalCustomerId(db, c.req.header('authorization')),
      place: UNRESOLVED_PLACE,
      // Uç dil almıyor; uydurulmuş dil yerine boş.
      locale: null,
      country: 'country' in resolution ? resolution.country : null,
    },
    { type: 'place_resolved', resolved: resolution.kind === 'route' || resolution.kind === 'shipping' },
  );

  // Şekil derlemede, fazla alan çalışma zamanında yakalanır.
  return ok(c, PlaceResolutionSchema.parse(toContract(code, resolution)));
});

/**
 * Çözüm ucundan ayrı, çünkü bu uç liste, öteki karar döner. Kısa önek geçersiz soru değil henüz hiçbir yeri işaret etmeyen
 * sorudur: 400 değil boş liste.
 */
places.get('/places/suggest', async (c) => {
  const rows = await suggestPlaces(serviceDb(), c.req.query('prefix') ?? '');
  // Boş dizi geçerli bir cevaptır.
  return ok(c, PlaceOptionListSchema.parse(rows));
});

/**
 * Ziyaretçiye açık: bölge dışı kalan müşterinin vazgeçmeye en yakın andaki sorusu. Dil almaz, çünkü döndürdüğü yer adları özel
 * addır ve çevrilmez.
 */
places.get('/places/zones', async (c) => {
  const areas = await listPublicDeliveryAreas(serviceDb());
  // Boş dizi geçerli bir cevaptır; okuma düşerse servis fırlatır ve zarf hata döner.
  return ok(c, DeliveryAreaListSchema.parse(areas));
});

/**
 * Oturumsuz, çünkü düğme bölge dışı cevabının hemen altında durur. Kimlik Bearer'dan çözülür ve girişli müşterinin adresi profilden
 * gelir; e-postası olmayan hesapta gövdedeki adrese düşülür.
 */
places.post('/places/notice', async (c) => {
  const body = PlaceNoticeBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  // Dil zorunlu: kayıt hesapsız olabildiği için haber gönderilirken dili çözecek profil çoğu zaman yoktur.
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const customerId = await optionalCustomerId(db, c.req.header('authorization'));
  const profile = customerId ? await new UserProfileService(db).getById(customerId) : null;

  const outcome = await recordZoneNotice(db, {
    postalCode: body.data.postalCode,
    country: body.data.country,
    email: profile?.email ?? body.data.email,
    customerId,
    locale: locale.data,
    source: body.data.source,
    // Mobilin tek sayım noktası: yer çözümü ucu sayaca dokunmuyor.
    countDemand: true,
  });

  // Biçim retleri geçersiz istektir (400); kalan dördü sözleşmenin hâlleri ve 200 döner.
  if (outcome === 'postal_code_invalid') return fail(c, 'invalid_code', 400);
  if (outcome === 'email_invalid') return fail(c, 'invalid_email', 400);

  const result: z.input<typeof PlaceNoticeResultSchema> = { status: outcome };
  return ok(c, PlaceNoticeResultSchema.parse(result));
});
