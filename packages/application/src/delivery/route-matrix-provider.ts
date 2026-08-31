/**
 * Yol matrisi fabrikası (11.9 · Aşama 4) — portu gerçek sağlayıcıya bağlayan tek yer.
 *
 * **Bugün hiçbir sağlayıcı yapılandırılmamış ve bu bir eksiklik DEĞİL, bir karar:** kuş uçuşunun
 * nerede yanıldığı sahada ölçülmeden matris takılmayacak. Ölçümsüz optimizasyon, olmayan bir soruna
 * makine kurmaktır (`CLAUDE §0`).
 *
 * Port bugün yazıldı çünkü asıl maliyeti o taşıyor: motor bir `cost` fonksiyonu alıyor ve kaynağını
 * bilmiyor, saklama `stop_order_metric` alanında `matrix` demeyi zaten bekliyor. Sağlayıcı geldiği
 * gün değişecek tek dosya bu.
 *
 * ── SEÇENEKLER (ölçüldü 30.08) ──────────────────────────────────────────────
 * **OSRM self-host** — `/table` ucu tam olarak bu matrisi verir, hücre başına ücret yok; Alsace+Baden
 * OSM ekstresi tek konteynerde koşar. Bedeli para değil BAKIM: harita verisi tazelenmeli ve servis
 * düştüğünde yedek yol (kuş uçuşu) çalışmalı.
 * **Ticari API** — kurulum yok, ama matris **element** başına faturalanır ve karesel büyür: 60 durak
 * = 3.721 hücre. Bu yüzden `stop_order` saklanıyor — damga bir hız işi değil, para işi.
 */

import type { RouteMatrixProvider } from './route-matrix-port';

/**
 * Yapılandırılmış sağlayıcı — **`null` = yol matrisi kapalı, kuş uçuşu kullanılacak.**
 *
 * Yokluk ADLIDIR: çağıran `metric: 'haversine'` yazar ve ekran bunu söyler. Sessizce düşseydi kaba
 * bir sıra kesin sanılırdı.
 */
export function routeMatrixProvider(): RouteMatrixProvider | null {
  // Env okuması TEK YERDE (`shipping/provider.ts` gerekçesi): üç yüzey ayrı ayrı okusaydı biri env
  // adını yanlış yazdığı gün yalnız o yüzey sessizce kuş uçuşuna düşerdi.
  const base = process.env['OSRM_BASE_URL']?.trim();
  if (!base) return null;

  // BEKLEYEN(11.9): OSRM adaptörü — `/table?annotations=duration` çağrısı, zaman aşımı ve Zod
  // doğrulaması. Port ve `costOfMatrix` hazır; eksik olan yalnız HTTP tarafı.
  return null;
}

/** Yol matrisi açık mı — ekran "sıra kuş uçuşu" diyebilsin diye. */
export function routeMatrixConfigured(): boolean {
  return routeMatrixProvider() !== null;
}
