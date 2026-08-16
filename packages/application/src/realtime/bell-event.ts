/**
 * Zilin olay adı — **`bell.ts`ten AYRI durmasının tek sebebi istemci.**
 *
 * Dinleyen taraf bir tarayıcı bileşeni (`components/operation/ui/live-refresh.tsx`) ve bu sabiti o da
 * bilmek zorunda: iki yerde ayrı yazılsaydı biri değişince zil sessizce çalmaz olurdu — hiçbir test
 * kırılmadan (CLAUDE §1). Ama `bell.ts` zili ÇALAN taraftır: `node:crypto` ve service-role anahtarı
 * kullanır, tarayıcı paketine hiç girmemeli. Tek satırlık bu dosya ikisini birden sağlıyor.
 *
 * Adın kendisi de bir karar: "changed" der, NE değiştiğini söylemez — mesajın boş kalması kanalın
 * güvenlik dayanağı (`bell.ts` künyesi).
 */
export const BELL_EVENT = 'changed';
