import { Hono } from 'hono';
import type { z } from 'zod';
import { recordStockNotice } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { PlaceNoticeResultSchema, StockNoticeBodySchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { readJsonBody } from '../../lib/request';
import type { V1Env } from './auth';

/**
 * `POST /me/stock-notices` — "gelince haber ver" kaydı (19.12 · native bağı 21.306).
 *
 * Bölge kaydının (`places.ts` → `POST /places/notice`) kardeşi, bir farkla: bu uç Bearer'ın
 * ARKASINDA. Bölge kaydı ziyaretçiye açık kalmak zorundaydı (web'in hesapsız formu da aynı kapıyı
 * kullanıyor); native'de ise misafir kaydı bırakmadan ÖNCE çekmecede e-posta + kodla hesabını
 * doğruluyor (kullanıcı kararı 10.08 — "gelen her talep bir hesaptır"). Yani bu uca gelen her istek
 * zaten kimlikli ve e-posta gövdeden değil PROFİLDEN çözülür.
 *
 * ── KURAL BURADA DEĞİL ──────────────────────────────────────────────────────
 * Biçim, yer doğrulaması ve tekrar kapısı `@lezzet/application`da (`recordStockNotice`). Burada
 * gövde çözümü, kimlik ve zarf var.
 *
 * Biçim retleri müşteriye ANLATILACAK bir hâl değil, geçersiz bir istektir → 400 (bölge kaydının
 * aynı anahtarları). Kalan dördü sözleşmenin hâlleri ve hepsi 200'dür.
 */
export const stockNotices = new Hono<V1Env>();

stockNotices.post('/', async (c) => {
  const body = StockNoticeBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  // `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kayıt ikincisine bağlanır.
  // Profili olmayan auth kullanıcısı `/me`nin aynı cevabını alır: uydurma bir kimlikle kayıt açılmaz.
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  const outcome = await recordStockNotice(db, {
    variantId: body.data.variantId,
    postalCode: body.data.postalCode,
    country: body.data.country,
    // Telefonla açılmış hesapta adres YOK: `email_required` döner ve ekran bunu söyler — bir
    // adres uydurulmaz, gövdeden de alınmaz.
    email: profile.email ?? null,
    customerId: profile.id,
  });

  if (outcome === 'postal_code_invalid') return fail(c, 'invalid_code', 400);
  if (outcome === 'email_invalid') return fail(c, 'invalid_email', 400);

  const result: z.input<typeof PlaceNoticeResultSchema> = { status: outcome };
  return ok(c, PlaceNoticeResultSchema.parse(result));
});
