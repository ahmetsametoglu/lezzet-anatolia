import type { Instrumentation } from 'next';

/**
 * Sunucu tarafı hataların OTOMATİK yakalanması (18.5) — `OBSERVABILITY §2`.
 *
 * `onRequestError` Next'in kancası: RSC render'ında, route handler'da, server action'da ve
 * middleware'de fırlatılan her hata buraya düşer. Elle `try/catch` serpmeye gerek yok —
 * **yakalama altyapının işi, bağlam eklemek çağıranın işi.** Kapı kendi bağlamını
 * `captureError`'a doğrudan verir (`orderId` gibi); buraya düşen hatalar ise "kimse yakalamadı"
 * sınıfıdır ve elimizdeki tek bağlam istektir.
 *
 * **`NEXT_*` digest'li hatalar ATLANIR.** `redirect()` ve `notFound()` Next'te fırlatılarak çalışır;
 * onlar akıştır, hata değil. Süzülmezse hata listesi her yönlendirmede bir satır alır ve gerçek
 * hatalar o gürültünün içinde kaybolur.
 *
 * **Dinamik import** iki gerekçeyle: (1) instrumentation modülü en hafif hâlde yüklenir; (2) paket
 * ağacı (pino + Supabase istemcisi) yalnız gerçekten bir hata olduğunda çözülür.
 *
 * **EDGE'DE KAYIT YOK, `console` var.** Bu dosya Next tarafından **edge çalışma zamanı için de**
 * derleniyor (projede `middleware.ts` var). Edge'de `node:` şemalı modül yoktur; gözlemleme paketi
 * ise `pino` ve Supabase istemcisi taşıyor. Ayrım yapılmazsa derleme
 * *"UnhandledSchemeError: node:crypto"* ile kırılıyor — yaşandı (30.07). Kaynak `@lezzet/database`
 * barrel'ıydı: kökü her servisi yeniden dışa açıyor ve içlerinden biri (`email-verification.service`)
 * `node:crypto` kullanıyor. Köprü artık alt yol import'u kullanıyor ama **bu kapı da kendi tarafını
 * korumalı**: bugün pino'nun, yarın başka bir paketin node bağımlılığı aynı duvara çarpar.
 *
 * Edge'de kaybedilen şey `error_log` satırıdır, iz değil: `console.error` stdout'a yazar ve süreç
 * yöneticisi onu da dosyaya alır. Bugün edge'de yalnız middleware çalışıyor; oradaki bir hata zaten
 * en sık görülecek hata sınıfı değil.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest = (err as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_')) return;

  if (process.env.NEXT_RUNTIME === 'edge') {
    console.error('[edge]', request.path, err);
    return;
  }

  try {
    const { captureError, SOURCES } = await import('@lezzet/observability');
    await captureError(err, {
      source: SOURCES.webServer,
      path: request.path,
      // Bağlam KİMLİK taşır, içerik taşımaz (`OBSERVABILITY §5`): istek gövdesi, çerez ve başlıklar
      // buraya girmez — müşterinin oturum çerezi bir teşhis verisi değildir.
      context: {
        method: request.method,
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
      },
    });
  } catch {
    // Kancanın kendisi render/cevap akışını BOZMAZ. `captureError` zaten yutuyor; bu kat, import'un
    // kendisi patlarsa (paket çözülemedi) diye.
  }
};
