import { Hono } from 'hono';
import { serviceDb } from '@lezzet/database';
import { readPublicDeliveryTerms } from '@lezzet/application';
import { DeliveryTermsSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { ok } from '../../lib/respond';
import { optionalCustomerId } from './auth';

/**
 * `GET /delivery-terms` — bilgi metinlerinin İLAN ETTİĞİ tutarlar (18.08 · kullanıcı kararı).
 *
 * ── NEDEN AÇIK UÇ ───────────────────────────────────────────────────────────
 * `pointsRules`ın birebir gerekçesi: bunlar program kurallarıdır, kişisel hiçbir şey taşımaz.
 * Okuyan ekranların ikisi de hesapsız açılıyor — onboarding'in posta kodu adımı ve yasal
 * "Teslimat ve iade" sayfası. Bearer'ın arkasına konsaydı, hesabı olmayan ziyaretçi kargo ücretini
 * göremez ve sözlükteki donmuş sayıya geri dönmek zorunda kalırdık.
 *
 * ── KİMLİK İSTEĞE BAĞLI, AMA OKUNUYOR ───────────────────────────────────────
 * Kapsamın kanal ekseni müşteriden çıkıyor (`readPublicDeliveryTerms` künyesi): onaylı bir
 * toptancının asgari sepeti perakendeninkinden farklıdır ve SSS'te kendi şartını okumalı.
 * Ziyaretçide `null` — perakende kuralı.
 */
export const deliveryTerms = new Hono<AppEnv>();

deliveryTerms.get('/delivery-terms', async (c) => {
  const db = serviceDb();
  const customerId = await optionalCustomerId(db, c.req.header('authorization'));
  // Sözleşme kilidi + süzgeç (`catalog.ts` emsali): şekil derlemede, fazla alan çalışma zamanında.
  return ok(c, DeliveryTermsSchema.parse(await readPublicDeliveryTerms(db, customerId)));
});
