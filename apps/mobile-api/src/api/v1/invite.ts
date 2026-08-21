import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  acceptNeighborInvite,
  countNeighborInviteUses,
  declineNeighborInvite,
  neighborInviteUrl,
  readInviteWelcome,
  readNeighborWelcome,
  tryAttachReferral,
  tryOpenNeighborInvite,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { NEIGHBOR_INVITE_MAX_USES } from '@lezzet/domain-core';
import { InviteWelcomeSchema, NeighborWelcomeSchema, OrderNeighborInviteSchema } from '@lezzet/types';
import { logger } from '@lezzet/observability';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { optionalCustomerId, type V1Env } from './auth';
import { localeOf } from './cart-view';

/**
 * Davet karşılaması (21.43) — `GET /api/v1/invite/:code`. Web'in `/[dil]/davet/[code]` sayfasının
 * uygulama karşılığı; ikisi de AYNI kapıyı çağırır (`@lezzet/application` → `readInviteWelcome`).
 *
 * ── AÇIK UÇ ve gerekçesi geri bildirim davetininkiyle aynı soydan ────────────
 * Bağlantıyı açan kişi TANIMLI DEĞİLDİR — davetli henüz müşterimiz değil, hesabı da yok. Bearer
 * istemek daveti kapıda karşılamak yerine kapıyı kilitlemek olurdu (`feedback.ts` künyesindeki
 * aynı ders: davet linki girişsiz açılır).
 *
 * ── AMA KİMLİK VARSA OKUNUR ──────────────────────────────────────────────────
 * `optionalCustomerId` keşif turunun kurduğu zincir: jeton varsa kim olduğu çözülür, yoksa
 * ziyaretçiye düşülür ve 401 HİÇBİR hâlde dönmez. Kimliğin cevabı değiştirdiği iki hâl var ve
 * ikisi de gerçekten oluyor: müşteri KENDİ bağlantısını açar (`self`), ya da zaten müşteriyken
 * bir tanıdığının bağlantısına dokunur (`already_customer`). Kimliği hiç sormasaydık ikisi de
 * "hoş geldin, hesap aç" ekranına düşerdi — zaten hesabı olan birine.
 *
 * ── HİÇBİR HÂL HATA DEĞİL, DÖRDÜ DE 200 ──────────────────────────────────────
 * Tanınmayan kod da 200 döner (`unknown`). Web sayfasının aynı kararı ve gerekçesi orada yazılı:
 * bağlantı WhatsApp'ta kırpılmış olabilir ve 404 vermek, kapıdaki davetliyi geri çevirmektir.
 * Ekran kodu çizmez, ama katalog kapısını açık tutar.
 *
 * **Kod bir SIR DEĞİL ama bir künyedir:** cevap yalnız getirenin adının ilk sözcüğünü taşır
 * (`InviteWelcomeSchema` künyesi); `parse` bu yüzden süzgeç olarak duruyor — motor bir gün fazla
 * alan döndürse bile zarfa giremez.
 */
export const invite = new Hono<AppEnv>();

invite.get('/invite/:code', async (c) => {
  const db = serviceDb();
  const viewerId = await optionalCustomerId(db, c.req.header('authorization'));
  const welcome = await readInviteWelcome(db, c.req.param('code'), viewerId);

  // Gövde `z.input<…>` ile tiplenir: motorun hâl kümesi sözleşmeden saparsa burası DERLENMEZ
  // (keşif destesinin kurduğu kilit) — sessiz bir uyumsuzluk yerine derleme hatası.
  const body: z.input<typeof InviteWelcomeSchema> = welcome;
  return ok(c, InviteWelcomeSchema.parse(body));
});

/**
 * **Komşu davetinin karşılaması** (21.45) — `GET /api/v1/neighbor/:token`. Web'in
 * `/[dil]/komsu/[token]` sayfasının uygulama karşılığı; ikisi de `readNeighborWelcome`i çağırır.
 *
 * Getiren davetiyle aynı kimlik rejimi (açık uç, jeton varsa okunur) ama **beş hâl**: buradaki
 * davet bir SEFERE çağırıyor, yani seferi geçebilir (`run_closed`) ve kontenjanı dolabilir
 * (`full`). Getiren davetinde ikisinin de karşılığı yok.
 *
 * **Reddedilen hâller de tarih taşır:** "sefer geçti" cümlesi hangi seferin geçtiğini
 * söyleyebilmeli — tarihsiz bir ret, komşuya neyi kaçırdığını söylemez.
 */
invite.get('/neighbor/:token', async (c) => {
  const db = serviceDb();
  const viewerId = await optionalCustomerId(db, c.req.header('authorization'));
  const welcome = await readNeighborWelcome(db, c.req.param('token'), viewerId);

  /* Motorun hâli `deliveryZoneId` de taşıyor; şemada YOK ve `parse` onu süzüyor — bölge kimliği
     operasyonun iç künyesidir, komşuya söylenecek şey gündür. Bu yüzden `z.input` kilidi de
     kurulmuyor: kapının kümesi telin kümesinden BİLEREK geniş. */
  return ok(c, NeighborWelcomeSchema.parse(welcome));
});

/**
 * Gövde: iki davetten en az biri. **İkisi birden gelebilir ve bu gerçek bir hâl** — davetli bir
 * arkadaşının bağlantısıyla tanışıp, sonra bir komşusunun sefer davetine tıklayıp, en sonunda
 * hesabını açabilir. İkisi ayrı ayrı yazılsaydı cihaz iki tur atardı ve biri düşerse öteki de
 * yarım kalırdı.
 */
const ClaimBodySchema = z
  .object({ referralCode: z.string().min(1).optional(), neighborToken: z.string().min(1).optional() })
  .refine((body) => body.referralCode !== undefined || body.neighborToken !== undefined, {
    message: 'en az bir davet gerekli',
  });

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — komşu kapılarının istediği ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/** Profil çözümü tek middleware'de (puan uçlarının deseni); profili olmayan auth kullanıcısı 404. */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/**
 * **Bekleyen daveti hesaba bağlar** (21.44) — `POST /api/v1/me/invite/claim`, Bearer'ın ARDINDA.
 *
 * ── NEDEN AYRI BİR UÇ, OTP GÖVDESİ DURURKEN ─────────────────────────────────
 * Kod eskiden yalnız `/auth/otp/verify` gövdesinde taşınıyordu ve o cümle YALNIZ OTP için doğruydu:
 * Google akışı Supabase'e doğrudan gidiyor, profili trigger açıyor ve kodu soran hiçbir çağrı
 * yoktu. Davet bağlantısına tıklayıp *"Google ile devam et"* diyen davetli **sessizce bağsız**
 * kalıyordu — hata yok, log yok, ödül yok; üstelik en olası yol buydu (telefonda oturumu açık
 * Google hesabı). Web aynı boşluğu `auth/callback` rotasında kapattı (17.11); bu, onun mobil ikizi.
 *
 * **Çare iki yolu ayrı ayrı yamamak DEĞİL:** cihazda da tek kapı var artık
 * (`lib/invite/claimPendingInvite`) ve OTP gövdesindeki alan kaldırıldı — iki mekanizma bırakmak,
 * yarın doğacak üçüncü giriş yolunun (WhatsApp) hangisini çağıracağını belirsiz bırakırdı.
 *
 * **Kural burada DEĞİL:** "yeni müşteri" ölçütü (siparişsizlik), kendini-getirme, ilk getiren
 * kazanır ve idempotentlik `@lezzet/application`ın ortak kapısında (`attachReferralOnLogin`).
 * Yutma davranışı da orada (`tryAttachReferral`): davet yüzünden bir giriş akışı düşmez.
 *
 * **Cevap HEP 200 ve hep `true`.** Bağın kurulup kurulmadığı istemciyi ilgilendirmiyor: davetli
 * ekranda bunun için bir şey görmüyor, göstermesi de yanlış olurdu ("davetin geçersiz" demek,
 * kaydolmayı yeni bitirmiş kişiye söylenecek ilk cümle değil). Reddin gerekçesi log'a düşer —
 * "davet neden yazılmadı" sorusunun cevap kaynağı orası.
 */
export const inviteClaim = new Hono<CustomerEnv>();
inviteClaim.use('*', resolveCustomer);

inviteClaim.post('/claim', async (c) => {
  const body = ClaimBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  if (body.data.referralCode) await tryAttachReferral(serviceDb(), c.get('authUser').id, body.data.referralCode);
  if (body.data.neighborToken) await claimNeighbor(c.get('customerId'), body.data.neighborToken);
  return ok(c, true);
});

/**
 * Komşu davetini kişiye yazar — web'in `handOffInvitesToCustomer`ındaki `handOffNeighbor`ın ikizi
 * ve AYNI hükümle: **girişi asla düşürmez, ama sessiz de değil.**
 *
 * Ret gerçek ve sık: sefer geçmiş olabilir, kontenjan dolmuş olabilir, kişi kendi bağlantısını
 * açmış olabilir. Üçü de müşteriye burada söylenmez — karşılama ekranı zaten söylemişti; bu çağrı
 * yalnız kaydı kuruyor. Gerekçe log'a düşer, çünkü "davet neden yazılmadı" sorusunun tek cevap
 * kaynağı orası.
 */
async function claimNeighbor(customerId: string, token: string): Promise<void> {
  try {
    const outcome = await acceptNeighborInvite(serviceDb(), { token, customerId });
    if (outcome.status !== 'ok') {
      logger.info({ context: 'api/invite', customerId, reason: outcome.reason }, 'komşu daveti kabul edilmedi');
    }
  } catch (err) {
    logger.warn(
      { context: 'api/invite', customerId, err: err instanceof Error ? err.message : String(err) },
      'komşu daveti kişiye yazılamadı — giriş etkilenmedi',
    );
  }
}

const OpenBodySchema = z.object({ orderId: z.string().uuid() });

/**
 * **Siparişin komşu davetini açar ve paylaşılabilir adresini döner** (21.45) —
 * `POST /api/v1/me/invite/neighbor`. Sipariş tamamlandı ekranının çağırdığı tek uç.
 *
 * ── NEDEN POST, OKUMA GİBİ GÖRÜNÜYOR OLSA DA ────────────────────────────────
 * İlk çağrı daveti ÜRETİR (`openNeighborInvite` idempotent: ikinci çağrı aynısını döner). Yani bu
 * bir yazma. GET yapsaydık, ekranı önizleyen/önyükleyen her şey sessizce satır açardı.
 *
 * **Davet peşinen açılmıyor** ve bu `getOrCreateReferralCode`un aynı kararı: müşterilerin çoğu
 * komşusunu çağırmaz, her siparişe davet satırı yazmak kullanılmayacak kayıt üretmek olurdu.
 *
 * **`inviteUrl: null` ARIZA DEĞİL, meşru hâl:** kargo siparişinde "aynı sefer" diye bir şey yok,
 * kesim saati dolmuş seferde de çağrılacak kimse kalmamıştır. Ekran o hâlde şeridi hiç çizmez.
 * Adresi sunucu üretiyor — üç yüzey kendi adresini kursa, rota adı değiştiği gün ikisi 404'e düşer.
 *
 * **Sipariş başkasınınsa da `null`:** sahiplik kontrolü kapının içinde (`not_owner`) ve dışarıya
 * ayrı bir cevap verilmiyor — "bu sipariş senin değil" demek, olmayan bir siparişin varlığını
 * doğrulamaktır (geri bildirim davetindeki aynı ders).
 */
inviteClaim.post('/neighbor', async (c) => {
  const body = OpenBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  /* Dil ZORUNLU ve varsayılansız (sepet/checkout ailesiyle aynı okuma): bağlantının dili
     PAYLAŞANIN dilidir ve sessizce Türkçeye düşmek, Alsaslı bir müşteriye Türkçe bir adres
     paylaştırmak olurdu. */
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const invite = await tryOpenNeighborInvite(db, { orderId: body.data.orderId, customerId: c.get('customerId') });
  /* KALAN HAK SUNUCUDA SAYILIR (kullanıcı kararı 21.08 — şeffaflık). Tüketim siparişlerden gelir
     (iptal olan sayılmaz) ve tavan davet satırında dondurulmuştur; ikisini istemciye taşıyıp orada
     çıkarmak o iki kuralın ikinci kopyası olurdu (sözleşme künyesi).

     Davet yoksa sayı da yok: `remainingUses: 0` ile `maxUses` tavanı — ekran zaten şeridi hiç
     çizmiyor, ama sözleşme "bilinmiyor" diye bir hâl taşımıyor ve taşımamalı. */
  const remainingUses = invite === null ? 0 : Math.max(0, invite.maxUses - (await countNeighborInviteUses(db, invite.id)));
  return ok(
    c,
    OrderNeighborInviteSchema.parse({
      inviteUrl: invite === null ? null : neighborInviteUrl(invite.token, locale.data),
      remainingUses,
      maxUses: invite?.maxUses ?? NEIGHBOR_INVITE_MAX_USES,
    }),
  );
});

/**
 * **Komşu davetinin REDDİ** — `POST /api/v1/me/invite/neighbor/decline` (kullanıcı kararı 21.08).
 *
 * Davetli, kabul ettiği bir daveti geri çevirebilir: artık gün seçicide görünmez ve sipariş ona
 * bağlanmaz. Kabul satırı SİLİNMEZ — ret de olmuş bir olaydır ve **geri alınabilir**: müşteri aynı
 * bağlantıya yeniden tıklarsa kabul öne alınır, ret damgası temizlenir (`acceptNeighborInvite`).
 *
 * **BU ROUTER'DA, `invite`ta DEĞİL:** reddin anahtarı yalnız `inviteId` ve "kim reddediyor"
 * sorusunun cevabı Bearer'dan çözülen müşteridir (`resolveCustomer`). Açık uçta dursaydı kimlik
 * gövdeden gelmek zorunda kalırdı — yani başkasının davetini reddettirmek mümkün olurdu.
 *
 * Kabul etmediği daveti reddetmek 404 döner: ortada reddedilecek kayıt yok. Ekran o hâlde sessiz
 * kalır — kullanıcı zaten görmediği bir şeyi reddetmeye çalışmıyordu.
 */
const DeclineNeighborBodySchema = z.object({ inviteId: z.string().uuid() });

inviteClaim.post('/neighbor/decline', async (c) => {
  const body = DeclineNeighborBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await declineNeighborInvite(serviceDb(), {
    inviteId: body.data.inviteId,
    customerId: c.get('customerId'),
  });
  if (outcome.status === 'rejected') return fail(c, 'invite_not_found', 404);
  return ok(c, true);
});
