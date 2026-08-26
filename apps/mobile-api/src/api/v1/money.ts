import { Hono } from 'hono';
import { z } from 'zod';
import { readMoneyDayEnd, readMoneyOverview } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { MoneyDayEndSchema, MoneyOverviewSchema } from '@lezzet/types';
import { ok } from '../../lib/respond';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * **PARA BÖLÜMÜ UÇLARI** (21.12) — M1 tahsilat izleme · M2 gün sonu mutabakat özeti.
 *
 * SALT OKUMA: bu yönlendiricide POST yoktur ve olmayacak — tasarımın altın kuralı ("'bakiye
 * düzeltme' diye bir kavram yok"; uyuşmazlık masada, yazma masaüstünde çözülür). Yazma ucu
 * isteyen bir iş önce o tasarım kararını değiştirmeli.
 *
 * Kapı `accounting` + `admin` (doc 04: Para sekmesi muhasebe rolünün mobildeki karşılığı; admin
 * her bölüme girer — kabuk kuralı). Depo süzgeci yok: para depo boyutu taşımaz, defter işletmenin.
 */
export const money = new Hono<StaffEnv>();

money.use('*', requireStaffRole('accounting', 'admin'));

money.get('/overview', async (c) => {
  const overview = await readMoneyOverview(serviceDb());
  return ok(c, MoneyOverviewSchema.parse(overview satisfies z.input<typeof MoneyOverviewSchema>));
});

money.get('/day-end', async (c) => {
  const dayEnd = await readMoneyDayEnd(serviceDb());
  return ok(c, MoneyDayEndSchema.parse(dayEnd satisfies z.input<typeof MoneyDayEndSchema>));
});
