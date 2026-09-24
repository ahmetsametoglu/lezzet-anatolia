import { Hono } from 'hono';
import { serviceDb } from '@lezzet/database';
import { readPublicDeliveryTerms } from '@lezzet/application';
import { DeliveryTermsSchema } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { ok } from '../../lib/respond';
import { optionalCustomerId } from './auth';

/**
 * `GET /delivery-terms`: bilgi metinlerinin ilan ettiği tutarlar; kişisel bir şey taşımadığı için açık uçtur ve hesapsız açılan ekranlar da
 * okur. Kimlik isteğe bağlıdır ama okunur, çünkü kapsamın kanal ekseni müşteriden çıkar.
 */
export const deliveryTerms = new Hono<AppEnv>();

deliveryTerms.get('/delivery-terms', async (c) => {
  const db = serviceDb();
  const customerId = await optionalCustomerId(db, c.req.header('authorization'));
  // Sözleşme kilidi + süzgeç (`catalog.ts` emsali): şekil derlemede, fazla alan çalışma zamanında.
  return ok(c, DeliveryTermsSchema.parse(await readPublicDeliveryTerms(db, customerId)));
});
