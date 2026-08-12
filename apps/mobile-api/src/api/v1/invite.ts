import { Hono } from 'hono';
import { z } from 'zod';
import { readInviteWelcome, tryAttachReferral } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { InviteWelcomeSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { optionalCustomerId, type V1Env } from './auth';

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

const ClaimBodySchema = z.object({ referralCode: z.string().min(1) });

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
export const inviteClaim = new Hono<V1Env>();

inviteClaim.post('/claim', async (c) => {
  const body = ClaimBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  await tryAttachReferral(serviceDb(), c.get('authUser').id, body.data.referralCode);
  return ok(c, true);
});
