import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { recordZoneNotice, resolvePlaceForPostalCode } from '@lezzet/application';
import { placeLabel, type PostalCodeResolution } from '@lezzet/domain-core';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/helper';
import { PlaceNoticeBodySchema, PlaceNoticeResultSchema, PlaceResolutionSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readJsonBody } from '../../lib/request';
import { optionalCustomerId } from './auth';
import { localeOf } from './cart-view';

/**
 * Yer uçları — onboarding'in "posta kodunuz" adımı (19.8 · 19.16b).
 *
 * **AÇIK KÜME, katalog kararının kendisi** (02-mimari §4: "oturumsuz kullanım = müşteri
 * gezinmesi"): posta kodu GİRİŞTE, hesap açılmadan sorulur — uygulamanın ilk sorusunu Bearer'ın
 * arkasına koymak, vitrini görmek için hesap açtırmak olurdu. Kimliğin bu uçta kişiselleştireceği
 * bir şey de yok: aynı kod herkes için aynı yere düşer. `router.ts`te `bearerAuth`tan ÖNCE bağlanır.
 *
 * ── DEPO KİMLİĞİ ZARFA GİRMEZ (19.9 güvenlik sınırı) ─────────────────────────
 * Çözümün depo ayağı sunucuda kalır; cihaz yalnız CEVABI saklar (`country` + `postalCode` —
 * sözleşmenin yer anahtarı) ve vitrin uçları yeri her istekte yeniden çözer. İstemcinin
 * yazabildiği bir değer hangi deponun stoğunu göstereceğimizi belirleyemez (web çerezinin
 * birebir kuralı, `place-types.ts` künyesi).
 *
 * BU DOSYA KURAL HESAPLAMAZ: belirsizlik/bilinmezlik/rota kararları saf motorda
 * (`resolvePlaceByPostalCode`), girdilerin toplanması `@lezzet/application`da
 * (`resolvePlaceForPostalCode`). Burada yalnız biçim denetimi, sözleşme indirgemesi ve zarf.
 */
export const places = new Hono<AppEnv>();

/**
 * Motor cevabı → sözleşme şekli. `route`/`shipping` tek `resolved` hâline iner ve fark `inRoute`
 * bayrağına çekilir: onboarding'in sorusu "hangi depo" değil "araç mı kargo mu". Seçenek adı
 * motorun TEK kuralından türer (`placeLabel`) — çok yerleşimli kodda ad UYDURULMAZ (19.17).
 */
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
        // Her seçenek saklanabilir bir yer anahtarı taşır (country + normalize kod): istemci
        // seçileni OLDUĞU GİBİ saklar, sorgudaki ham kodu hatırlamak zorunda kalmaz.
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
 * `GET /places/by-postal-code?code=67000` — kod nereye düşer.
 *
 * **Biçimsiz kod 400, tanınmayan kod `unknown` — ikisi AYRI şeyler:** "67 000" normalize edilip
 * denenir ama "670" ya da boş sorgu geçerli bir soru bile değildir (400 `invalid_code`); beş
 * haneli ama hiçbir ülkede geçerli olmayan kod ise geçerli bir sorunun geçerli bir CEVABIDIR
 * (`kind: 'unknown'` — büyük olasılıkla yazım hatası, ekran öyle söyler). Karıştırılsalardı
 * "kodu kontrol edin" cümlesi yanlış yerde görünürdü.
 */
places.get('/places/by-postal-code', async (c) => {
  const code = normalizePostalCode(c.req.query('code') ?? '');
  if (!isValidPostalCode(code)) return fail(c, 'invalid_code', 400);

  const resolution = await resolvePlaceForPostalCode(serviceDb(), code);
  // Sözleşme kilidi + süzgeç (`catalog.ts` emsali): şekil derlemede, fazla alan çalışma zamanında yakalanır.
  return ok(c, PlaceResolutionSchema.parse(toContract(code, resolution)));
});

/**
 * `POST /places/notice?locale=fr` — *"buraya da gelin"* kaydı (21.20).
 *
 * ── OTURUMSUZ, ÇÜNKÜ AKIŞ ORADA DOĞUYOR ─────────────────────────────────────
 * Uç `bearerAuth`ın ÖNÜNDE: düğme, müşterinin vazgeçmeye en yakın olduğu anda — bölge dışı
 * cevabının hemen altında — duruyor ve önüne giriş duvarı koymak ikinci bir engel çıkarmaktır
 * (`zone_notice.email` künyesi). Hesap ZORUNLU DEĞİL.
 *
 * ── KİMLİK VARSA SUNUCUDA ÇÖZÜLÜR, GÖVDEDEN ASLA ────────────────────────────
 * Bearer'ı uç KENDİ okur (`optionalCustomerId` — `discover.ts`in kimlik zinciri; token yoksa ya da
 * bayatsa misafir gibi davranılır, 401 hiçbir hâlde dönmez). Girişli müşteride adres PROFİLDEN
 * gelir: gövdeden gelen bir adresi hesabın kaydına yazmak, kaydı hesaba bağlarken adresi başkasına
 * ait yapmaya açık kapı olurdu. **Profilinde e-posta olmayan** müşteride (telefonla açılmış hesap)
 * gövdedeki adrese düşülür — misafirin zaten yapabildiği şeyin fazlası değil, ve tek alternatifi
 * girişli müşteriyi kayıt bırakamaz hâle getirmekti.
 *
 * ── KURAL BURADA DEĞİL ──────────────────────────────────────────────────────
 * Yer doğrulaması, yer adının dondurulması, tekillik ve anonim sayaç `@lezzet/application`ın
 * kapısında (`delivery/notice.ts` → `recordZoneNotice`) — web eyleminin okuduğu kuralın TAM AYNISI.
 * Burada yalnız gövde/sorgu çözümü, kimlik çözümü ve zarf var.
 *
 * ── SAYAÇ BU YÜZEYDE BURADA ARTAR ───────────────────────────────────────────
 * `countDemand: true`: mobilin yer çözümü ucu (`/places/by-postal-code`) sayaca dokunmuyor, yani
 * bu uç mobilin TEK sayım noktası. Web tersi (çözerken sayıyor) — ayrımın ölçümü kapının künyesinde.
 */
places.post('/places/notice', async (c) => {
  const body = PlaceNoticeBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  // Dil ZORUNLU ve varsayılansız — sepet/checkout ailesiyle AYNI okuma (`cart-view.ts` → `localeOf`).
  // Kayıt hesapsız olabildiği için haber gönderilirken dili çözecek bir profil çoğu zaman YOKTUR:
  // burada sessizce "bilinmiyor" yazmak, o müşteriye bir gün yanlış dilde mail gitmesi demekti.
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
    countDemand: true,
  });

  // Biçim retleri müşteriye ANLATILACAK bir hâl değil, geçersiz bir istektir → 400 (uçtaki yer
  // çözümüyle aynı anahtar: `invalid_code`). Kalan dördü sözleşmenin hâlleri ve hepsi 200'dür.
  if (outcome === 'postal_code_invalid') return fail(c, 'invalid_code', 400);
  if (outcome === 'email_invalid') return fail(c, 'invalid_email', 400);

  const result: z.input<typeof PlaceNoticeResultSchema> = { status: outcome };
  return ok(c, PlaceNoticeResultSchema.parse(result));
});
