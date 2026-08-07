import type { Context, Next } from 'hono';
import type { User } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { anonDb } from '@lezzet/database';
import { fail } from '../../lib/respond';

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
 * `Authorization: Bearer <jwt>` başlığından ham token — **ayrıştırma tek yerde**.
 *
 * İki çağıranı var ve ikisinin KARARI farklı: `bearerAuth` token yoksa kapıyı kapatır (401),
 * katalog uçları ziyaretçiye düşer (200). Ayrıştırmanın kendisi ise aynı ve iki kez yazılsaydı
 * biri gün gelip `Bearer` önekini ya da boşluk kırpmayı ötekinden farklı ele alırdı.
 *
 * Hono başlığı imzasız verdiği için parametre ham dize: bağlam tipine (`AppEnv`/`V1Env`) bağlanmak
 * bu yardımcıyı iki ayrı Hono kuşağına da bağlardı.
 */
export function bearerTokenOf(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
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
  const token = bearerTokenOf(c.req.header('authorization'));
  if (!token) return fail(c, 'unauthorized', 401);

  const { data, error } = await anonDb().auth.getUser(token);
  if (error || !data.user) return fail(c, 'unauthorized', 401);

  c.set('authUser', data.user);
  await next();
}
