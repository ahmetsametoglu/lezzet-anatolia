import type { LocalizedCopy } from '@lezzet/i18n';
import type placeMessages from '@lezzet/i18n/customer/place';

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

/** Yer işaretinin cümleleri — ortak sözlükten türer (`@lezzet/i18n/customer/place`), elle yazılmaz. */
export type PlaceMarkCopy = Pick<LocalizedCopy<typeof placeMessages>, 'shipMark' | 'awayMark' | 'lineBlocked'>;

/** İşaretin tonu — native kitin `StockMark` sözlüğü: kargo (bilgi) · bekleyen bölge · kapalı kapı. */
export type PlaceMarkTone = 'info' | 'pending' | 'blocked';

export interface PlaceMark {
  label: string;
  tone: PlaceMarkTone;
}

/**
 * **Kalemin YER işareti** — dört stok hâlinin üçünde cümle, birinde sessizlik (21.20 · terfi 14.09).
 *   `shipping`     → "Kargoyla gelir" (bilgi).
 *   `elsewhere`    → rota dışında "bu adrese teslim edemiyoruz" (kapalı kapı); rota içinde ya da yer
 *                    bilinmiyorken "bölgenizde şu an yok" (bekleyen) — ayrımı `elsewhereReasonOf` verir.
 *   `available` · `out_of_stock` → işaret YOK: iyi haber sessizdir, "Tükendi" kartın kendi rozetidir.
 *
 * Native'de doğdu (`apps/mobile/src/lib/places/place-view.ts` → `stockMarkOf`); web'in telefon görünümü
 * ikinci çağıran olunca kural buraya taşındı — iki yüzey aynı kartı aynı cümleyle çiziyor. `status` bir
 * `StockStatus`tur (`@lezzet/types`); bu paket ona bağlı değil, bakılan iki değer adıyla yazılı. `null` =
 * hâl bilinmiyor, işaret yok.
 */
export function placeMarkOf(status: string | null, place: { inRoute: boolean } | null, t: PlaceMarkCopy): PlaceMark | null {
  if (status === 'shipping') return { label: t.shipMark, tone: 'info' };
  if (status !== 'elsewhere') return null;
  return elsewhereReasonOf(place) === 'out_of_route' ? { label: t.lineBlocked, tone: 'blocked' } : { label: t.awayMark, tone: 'pending' };
}

/**
 * **Kartın yer notu** — işaretin KARTTA söylenen kısmı (kullanıcı kararı 10.08).
 *
 * "Kargoyla gelir" kartta YAZILMAZ: rota dışı müşterinin kartlarının neredeyse tamamı onu taşırdı ve her
 * kartta yazan bilgi bilgi olmaktan çıkar — cümle listenin başındaki bantta, tek yerde. Kalan iki not
 * konuşur; kapalı kapı kartı ayrıca SOLDURUR, bekleyen bölge soldurmaz (ürün gelebilir, soldurmak müşteriyi
 * olmayan bir kapıdan çevirirdi). Native katalog kartı, vitrin dairesi ve web'in telefon kartları aynı
 * elemeyi okur (native katalogun "terfi ihtiyacı" künyesi, 14.09).
 */
export function cardPlaceNoteOf(mark: PlaceMark | null): { note: string | undefined; dimmed: boolean } {
  if (mark === null || mark.tone === 'info') return { note: undefined, dimmed: false };
  return { note: mark.label, dimmed: mark.tone === 'blocked' };
}
