/**
 * Yolu ROTA KALIBINA çevirir (13.1 · `ANALYTICS §2`) — saf, DB'siz, testli.
 *
 * **Neden hiç ham yol yazmıyoruz:** iki gerçek rota kimlik taşıyor —
 *  · `/feedback/<token>` → jeton `DATA_MODEL`'e göre **oturum yerine geçer**, yani anonim olduğunu
 *    iddia ettiğimiz deftere bir kimlik doğrulama SIRRI düşerdi; defteri okuyan o bağlantıyı açar.
 *  · `/orders/<reference>` → müşterinin bildiği sipariş numarası, doğrudan kimliklendirici.
 *
 * **İki katman, ve ikincisi bilerek var:** önce bilinen dinamik rotalar eşlenir (beyaz liste), sonra
 * kalan segmentlerde kimlik GÖRÜNÜMLÜ olan her şey maskelenir (emniyet ağı). Beyaz liste tek başına
 * bırakılsaydı, yarın eklenen bir dinamik rota listeye yazılmayı unutulduğu gün deftere ham değer
 * sızardı — ve bu hiçbir yerde hata vermezdi.
 */

/** Dil öneki — dış URL dile göre (`/fr/...`), iç kalıp dilsizdir: aynı sayfa üç kez sayılmasın. */
const LOCALE = /^\/(tr|fr|de)(?=\/|$)/;

/** Bilinen dinamik rotalar: ilk segment → kalıbın ikinci parçası. */
const DINAMIK: Record<string, string> = {
  product: '[slug]',
  package: '[slug]',
  collection: '[slug]',
  catalog: '[category]',
  orders: '[reference]',
  feedback: '[token]',
  checkout: '[reference]',
  support: '[id]',
};

/** Kimlik görünümlü segment — uuid, uzun jeton, sayı, ya da sipariş numarası kalıbı. */
const KIMLIK_GORUNUMLU =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{20,}|\d+|LZA-\d+)$/i;

export function routePattern(rawPath: string): string {
  // Sorgu dizesi ve çapa TÜMÜYLE düşer: ölçülecek parametre `meta`'ya adıyla girer, yola değil.
  const yol = rawPath.split('?')[0]!.split('#')[0]!.replace(LOCALE, '') || '/';
  const parcalar = yol.split('/').filter(Boolean);
  if (parcalar.length === 0) return '/';

  const [ilk, ...kalan] = parcalar;
  const kalip = DINAMIK[ilk!];

  // Bilinen dinamik rota: ikinci segment kalıba döner, derinlik BURADA KESİLİR. Daha derin yollar
  // (`/product/x/reviews`) aynı sayfanın parçalarıdır; ayrı kalıp saymak listeyi şişirirdi.
  if (kalip && kalan.length > 0) return `/${ilk}/${kalip}`;

  // Emniyet ağı: bilinmeyen rotada kimlik görünümlü her segment maskelenir.
  return `/${[ilk, ...kalan.map((p) => (KIMLIK_GORUNUMLU.test(p) ? '[id]' : p))].join('/')}`;
}
