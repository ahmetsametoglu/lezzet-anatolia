import type { Instrumentation } from 'next';

/** React'in akış sunucusu, yanıtın gittiği bağlantı yayın bitmeden kapanınca bu iletiyle durur. */
const CLIENT_CLOSED_STREAM = 'The destination stream closed early.';

/**
 * Kimsenin yakalamadığı sunucu hatası (RSC, route handler, server action, middleware) buraya düşer ve hata listesine yazılır;
 * elde bağlam olarak yalnız istek vardır. Edge derlemesinde gözlemleme paketi `node:` modülleri yüzünden yüklenemez, orada iz
 * yalnız `console`dadır.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // `redirect()` ve `notFound()` fırlatılarak çalışır; akıştır, hata değil.
  const digest = (err as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_')) return;
  // Sayfadan ayrılan müşteri yarıdaki ön yüklemeyi keser; bu bir ağ olayıdır, hata listesine yazılsa her gezinme bir satır olurdu.
  if ((err as { message?: unknown })?.message === CLIENT_CLOSED_STREAM) return;

  if (process.env.NEXT_RUNTIME === 'edge') {
    console.error('[edge]', request.path, err);
    return;
  }

  try {
    // Paket ağacı (pino + Supabase istemcisi) yalnız gerçekten hata olunca yüklenir.
    const { captureError, SOURCES } = await import('@lezzet/observability');
    await captureError(err, {
      source: SOURCES.webServer,
      path: request.path,
      // Bağlam kimlik taşır, içerik taşımaz (`OBSERVABILITY §5`): istek gövdesi, çerez ve başlıklar yazılmaz.
      context: {
        method: request.method,
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
      },
    });
  } catch {
    // Kanca render ve yanıt akışını bozmamalı; `captureError` zaten yutar, bu kat paketin kendisi yüklenemezse diye.
  }
};

/** AI kullanım kaydedicisi yalnız Node'da kurulur: veritabanına yazar ve `NEXT_RUNTIME` derlemede sabitlendiği için edge paketine girmez. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node');
}
