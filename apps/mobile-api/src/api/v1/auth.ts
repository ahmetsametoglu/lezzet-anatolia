import type { Context, Next } from 'hono';
import type { User } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { fail } from '../../lib/respond';
import { anonClient } from '../../lib/supabase';

/**
 * `/api/v1` bağlam tipi — kök `AppEnv`'den TÜRER (reqId taşımaya devam eder) ve doğrulanmış
 * kullanıcıyı ekler. Tip burada tanımlı olmak zorunda: Hono `c.set/get`'i tipe bağlıyor, yani
 * `authUser`'ı koymayı unutan bir uç derlenmez — sözleşmenin yeri kimliği üreten dosyadır
 * (apps/backend `request-log.ts` ile aynı gerekçe).
 */
export interface V1Env {
  Variables: AppEnv['Variables'] & { authUser: User };
}

/**
 * Bearer doğrulaması — web'in çerez guard'ının API karşılığı (02-mimari "duplikasyon sayılmayan"
 * taşıma katmanı adaptörü): cihazdaki supabase-js oturumunun access token'ı `Authorization:
 * Bearer <jwt>` ile gelir, Supabase auth sunucusunda doğrulanır (`auth.getUser(token)` — anon
 * istemci yeter, en az yetki).
 *
 * Geçersiz/eksik token AYNI cevabı alır (`401 unauthorized`): "token yok" ile "token çöp" ayrımı
 * çağırana bir şey kazandırmaz, saldırgana kazandırır. Doğrulanan kullanıcı bağlama konur;
 * uçlar kimliği İSTEKTEN değil bağlamdan okur.
 */
export async function bearerAuth(c: Context<V1Env>, next: Next): Promise<Response | void> {
  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
  if (!token) return fail(c, 'unauthorized', 401);

  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data.user) return fail(c, 'unauthorized', 401);

  c.set('authUser', data.user);
  await next();
}
