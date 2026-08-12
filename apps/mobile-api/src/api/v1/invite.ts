import { Hono } from 'hono';
import type { z } from 'zod';
import { readInviteWelcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { InviteWelcomeSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { ok } from '../../lib/respond';
import { optionalCustomerId } from './auth';

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
