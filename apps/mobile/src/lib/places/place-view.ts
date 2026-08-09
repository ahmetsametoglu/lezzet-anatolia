import { elsewhereReasonOf } from '@lezzet/helper';
import type { StockStatus } from '@lezzet/types';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';

import type { PlaceResolution } from '@/lib/api/places';
// Ton sözlüğü KİTİN (`info`/`pending`/`blocked`) — buradaki iş alan hâlini o sözlüğe çevirmek.
import type { StockMarkView } from '@/components/ui/stock-mark';
import messages from './messages.json';

/*
  YERİN EKRANDAKİ DİLİ (21.20) — çözülmüş yer + stok hâli → müşterinin okuyacağı CÜMLE.

  METİN BURADA, EKRANDA DEĞİL: aynı üç cümle katalog ızgarasında ve vitrin rayında görünüyor; iki
  `messages.json`a kopyalansaydı biri değişince öteki eskirdi (CLAUDE §1). Web de aynı deseni
  kuruyor — yer ailesinin ortak metni yer ailesinin yanında durur
  (`apps/web/components/customer/delivery/place-messages.json`).

  KARAR BURADA DEĞİL, `@lezzet/helper`TA: `elsewhere` hâlinin iki alt sebebi (kalem mi bekleniyor,
  bölge mi) tek nüsha olarak orada yaşıyor ve web ile native uygulama aynı fonksiyondan okuyor.
  Buradaki iş yalnız o kararı cümleye ve rozet tonuna çevirmek.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * **Yerin TESLİMAT KİPİ** — web'in `PlaceMode`u ile birebir aynı sözlük
 * (`apps/web/lib/delivery/read-place.ts`), yalnız kaynağı farklı: orada çerezden çözülen sunucu
 * okuması, burada `/api/v1/places/by-postal-code` cevabı.
 *
 *   `unknown`  — kod yok, tanınmadı ya da belirsiz. **Ortada "adresim" YOK**, cevaplanamayan soru
 *                sorulmaz. `ambiguous` da buraya düşer: müşteri hangi ülkeyi kastettiğini henüz
 *                söylemedi, iki adaydan birini seçmek onun yerine karar vermek olurdu.
 *   `route`    — bölge içi: rota aracı gidiyor, soğuk zincir dâhil her aktif ürün ulaşıyor.
 *   `shipping` — bölge dışı: yalnız kargolanabilir kalemler ulaşıyor.
 *
 * Tip DIŞA VERİLMEZ: adını yazan bir çağıran yok (ekran `placeModeOf(...)` sonucunu doğrudan
 * `shippableChipVisible`e geçiriyor) ve kullanılmayan bir dışa verim `knip`in ölü listesine düşer.
 * Gerekirse `ReturnType<typeof placeModeOf>` ile alınır — tek kaynak fonksiyonun kendisi kalır.
 */
type PlaceMode = 'unknown' | 'route' | 'shipping';

export function placeModeOf(place: PlaceResolution | null): PlaceMode {
  if (place?.kind !== 'resolved') return 'unknown';
  return place.place.inRoute ? 'route' : 'shipping';
}

/**
 * **"Adresime gönderilebilir" çipi çizilsin mi** (21.20 · kullanıcı kararı 09.08).
 *
 * YALNIZ `shipping` hâlinde. Öteki iki hâlde çip bir şey yapmaz ve gösterilmesi zarar verir:
 *   · `route`   — rota aracı soğuk zincir dâhil her şeyi o adrese götürüyor; süzgeç eleyecek bir
 *                 şey bulamaz. Web'de ölçüldü ve ARIZAYDI (08.08): çip adrese ULAŞABİLEN altı ürünü
 *                 gizliyordu (`apps/web/lib/delivery/place-filter.ts` künyesi).
 *   · `unknown` — adres olmadan verilen her cevap uydurmadır (`CLAUDE §1`). Web burada çipi bir
 *                 DAVETE çeviriyor (tıklayınca yer panelini açıyor); uygulamada posta kodu zaten
 *                 vitrinin hapıyla ve onboarding'le soruluyor, katalog şeridine üçüncü bir davet
 *                 koymak aynı soruyu üç yerden sormak olurdu.
 *
 * Çip GÖRÜNÜR olduğunda bile VARSAYILAN KAPALI: katalog kendiliğinden küçülmez, daraltma
 * müşterinin kendi kararıdır.
 */
export function shippableChipVisible(mode: PlaceMode): boolean {
  return mode === 'shipping';
}

/** Çip metni — web'inkiyle AYNI cümle, üç dilde (`catalog/messages.json` → `onlyShippable`). */
export function shippableChipLabel(locale: Locale): string {
  const t: Messages = messages[locale];
  return t.onlyShippable;
}

/**
 * Kartın YER işareti — dört stok hâlinin üçünde cümle, birinde sessizlik.
 *
 *   `available`    → **işaret YOK.** İyi haber sessizdir; normal ürün araçla ücretsiz gelir.
 *   `shipping`     → "Kargoyla gelir" — yerelde yok ama kargolanabiliyor.
 *   `elsewhere`    → soğuk zincir, kargoya verilemez. İKİ alt hâli var ve tek cümleye inmez:
 *                    rota içi "Bölgenizde şu an yok" (GEÇİCİ, beklenen KALEM), rota dışı
 *                    "Bu adrese gönderemiyoruz" (KALICI, beklenen BÖLGE).
 *   `out_of_stock` → **işaret BURADA basılmaz:** "Tükendi" kartın kendi durum rozetidir ve yere
 *                    bağlı değil evrensel bir hâldir. İki eksen iki ayrı yerden konuşur.
 *
 * Yer bilinmiyorken `stockStatus` zaten ağ-geneli okumadan gelir (`available` ya da
 * `out_of_stock`), yani bu fonksiyon o hâllerde kendiliğinden sessizdir.
 */
export function stockMarkOf(status: StockStatus, place: PlaceResolution | null, locale: Locale): StockMarkView | null {
  const t: Messages = messages[locale];
  if (status === 'shipping') return { label: t.shipMark, tone: 'info' };
  if (status !== 'elsewhere') return null;
  // Rota dışı mı kalem mi — kararı `@lezzet/helper` verir, ekran vermez. Çözülmemiş yer `null`
  // gider ve kural "yer bilinmiyorsa kalem" der: "gönderemiyoruz" demek için rota dışında
  // olduğunu BİLMEK gerekir.
  const reason = elsewhereReasonOf(place?.kind === 'resolved' ? place.place : null);
  return reason === 'out_of_route' ? { label: t.lineBlocked, tone: 'blocked' } : { label: t.awayMark, tone: 'pending' };
}
