/**
 * `elsewhere` hâlinin ALT SEBEBİ (09.08 · kullanıcı kararı) — **aynı stok hâli, iki farklı gerçek.**
 *
 *   `stock`        rota İÇİNDEYİZ ama kalem bölgenin deposunda yok. GEÇİCİ: mal gelince çözülür,
 *                  beklenecek şey KALEMDİR (`variant_stock_notice`).
 *   `out_of_route` rota DIŞINDA. KALICI: ürün gelse bile oraya gidemez, çünkü soğuk zincir kargoya
 *                  verilemiyor. Beklenecek şey BÖLGENİN açılmasıdır (`zone_notice`).
 *
 * İkisini tek cümleye indirmek rota dışındaki müşteriye gelmeyecek bir malı bekletmek, ona kalem
 * notu yazdırmak ise tutulamayacak bir söz vermek olurdu. Ayrım sepetin kısıt bloğunda 01.08'den
 * beri vardı (`place-restriction`); kart ve ürün detayında 09.08'de kuruldu.
 *
 * ── NEDEN `helper`, NEDEN TEK EV (21.20) ─────────────────────────────────────
 * Kural iki YÜZEYİN de sorusu: web kartı/ürün detayı (`components/customer/delivery/stock-mark`)
 * ve native uygulamanın katalog/vitrin kartı aynı üç cümleyi kuruyor. Ev seçimini katman kuralı
 * belirledi, tercih değil:
 *   · `@lezzet/application` OLAMAZ — `apps/mobile` o pakete bağlı DEĞİL (`package.json`: yalnız
 *     brand · design-tokens · helper · i18n · types) ve bağlanması `@supabase/supabase-js`'i RN
 *     paketine sokardı. Ölçüldü, varsayılmadı.
 *   · `@lezzet/domain-core` da olamaz, aynı sebeple (mobil onu da bilmiyor).
 *   · Geriye iki yüzeyin de bildiği tek yer kalıyor: `helper`. `normalizePostalCode`in emsali
 *     birebir aynı (denetim A2) — yer/posta kodu ailesinin saf kararları burada tek nüsha yaşar,
 *     web tarafı `apps/web/lib/delivery/place-types.ts` üzerinden KÖPRÜyle okur.
 *
 * Fonksiyon saf ve girdisi tek alan: `DeliveryPlace`i (web) ya da `PlaceResolution`u (mobil)
 * içeri almıyor — iki yüzeyin yer nesnesi farklı şekilde ve ortak olan tek şey `inRoute`.
 */
export type ElsewhereReason = 'stock' | 'out_of_route';

/**
 * **Yer bilinmiyorsa `stock`** ve bu bilinçli: "gönderemiyoruz" demek için rota dışında olduğunu
 * BİLMEK gerekir. Bilinmeyeni kalıcı bir olumsuzluğa çevirmek uydurma olurdu (`CLAUDE §1`) — ve
 * pratikte bu hâl zaten oluşmaz, `elsewhere` ancak yer biliniyorken doğar.
 */
export function elsewhereReasonOf(place: { inRoute: boolean } | null): ElsewhereReason {
  return place && !place.inRoute ? 'out_of_route' : 'stock';
}
