import { PATHNAMES } from '@lezzet/i18n';

/**
 * Yolu ROTA KALIBINA çevirir (13.1 · `ANALYTICS §2`) — saf, DB'siz, testli.
 *
 * **Neden hiç ham yol yazmıyoruz:** iki gerçek rota kimlik taşıyor —
 *  · `/feedback/<token>` → jeton `DATA_MODEL`'e göre **oturum yerine geçer**, yani anonim olduğunu
 *    iddia ettiğimiz deftere bir kimlik doğrulama SIRRI düşerdi; defteri okuyan o bağlantıyı açar.
 *  · `/orders/<reference>` → müşterinin bildiği sipariş numarası, doğrudan kimliklendirici.
 *
 * ── KALIP SÖZLÜĞÜ `PATHNAMES`'TEN TÜRETİLİR, ELLE YAZILMAZ (düzeltme 04.08 · denetim P2) ──
 * Önceki hâl elle yazılmış bir tablo tutuyordu ve anahtarları İÇ İngilizce kelimelerdi
 * (`product`, `catalog`); oysa gerçek URL DIŞ kelime taşıyor (`produit`, `catalogue`, `urun`).
 * Sonucu denetim canlıda ölçtü ve iki türlüydü:
 *   · aynı ekran üç dilde ÜÇ ayrı kalıp — `path` boyutu üçe katlanıyordu;
 *   · 20 karakterden kısa slug HAM yazılıyordu (`/produit/fistikli-baklava`), yani `0036`'nın
 *     özetten bilinçle uzak tuttuğu şişme deftere `path` üzerinden geri giriyordu.
 *
 * `PATHNAMES` URL'in TEK KAYNAĞI (`packages/i18n`) ve iki uygulama onu okuyor. Buradan türetmek
 * ikinci bir sözlüğü ortadan kaldırıyor: yeni bir müşteri rotası eklendiğinde ölçüm kendiliğinden
 * doğru kalıbı yazar, kimsenin ikinci bir listeyi güncellemesi gerekmez.
 *
 * **İki katman KORUNUYOR, ve ikincisi bilerek var:** önce eşleme tablosu, sonra kalan segmentlerde
 * kimlik GÖRÜNÜMLÜ olan her şey maskelenir (emniyet ağı). Tablo tek başına bırakılsaydı, tabloya
 * yazılmamış bir yol (operasyon önizlemesi, yeni rota, elle girilen adres) deftere ham değer
 * sızdırırdı — ve bu hiçbir yerde hata vermezdi.
 */

/** Dil öneki — dış URL dile göre (`/fr/...`), iç kalıp dilsizdir: aynı sayfa üç kez sayılmasın. */
const LOCALE = /^\/(tr|fr|de)(?=\/|$)/;

/** Kimlik görünümlü segment — uuid, uzun jeton, sayı, ya da sipariş numarası kalıbı. */
const KIMLIK_GORUNUMLU =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{20,}|\d+|LZA-\d+)$/i;

/** Tek bir yol kalıbı: segment listesi; `null` = değişken segment (`[slug]`). */
interface Kalip {
  /** İç kalıbın kendisi — deftere yazılan değer (`/product/[slug]`). */
  ic: string;
  segmentler: Array<string | null>;
}

/**
 * `PATHNAMES` → eşleme tablosu. Her rotanın hem iç hâli hem üç dildeki dış hâli tabloya girer;
 * hepsi AYNI iç kalıba çözülür.
 *
 * **Uzun kalıp önce denenir:** `/support/new` ile `/support/[ticket]` aynı derinlikte ve ikisi de
 * eşleşebilir — sabit segment değişkeni yenmeli, yoksa "yeni talep" sayfası bir talep kimliği
 * sanılırdı. Sıralama sabit segment sayısına göre.
 */
const KALIPLAR: Kalip[] = (() => {
  const cikti: Kalip[] = [];
  const ekle = (ic: string, yol: string) => {
    cikti.push({
      ic,
      segmentler: yol
        .split('/')
        .filter(Boolean)
        .map((s) => (s.startsWith('[') ? null : s.toLowerCase())),
    });
  };

  for (const [ic, deger] of Object.entries(PATHNAMES) as Array<[string, string | Record<string, string>]>) {
    ekle(ic, ic);
    if (typeof deger !== 'string') for (const yol of Object.values(deger)) ekle(ic, yol);
  }

  // **Uzun kalıp önce, eşitlikte SABİT segmenti çok olan önce.** İkincisi olmadan `/support/new`
  // ile `/support/[ticket]` arasında sıra rastgele olurdu ve "yeni talep" sayfası bir talep kimliği
  // sanılabilirdi — sabit segment değişkeni yenmeli.
  return cikti.sort(
    (a, b) =>
      b.segmentler.length - a.segmentler.length ||
      b.segmentler.filter((s) => s !== null).length - a.segmentler.filter((s) => s !== null).length,
  );
})();

export function routePattern(rawPath: string): string {
  // Sorgu dizesi ve çapa TÜMÜYLE düşer: ölçülecek parametre `meta`'ya adıyla girer, yola değil.
  const yol = rawPath.split('?')[0]!.split('#')[0]!.replace(LOCALE, '') || '/';
  const parcalar = yol.split('/').filter(Boolean);
  if (parcalar.length === 0) return '/';

  const kucuk = parcalar.map((p) => p.toLowerCase());
  const uyar = (k: Kalip) => k.segmentler.every((s, i) => s === null || s === kucuk[i]);

  // 1) TAM eşleşme — segment sayısı da tutuyor.
  const tam = KALIPLAR.find((k) => k.segmentler.length === kucuk.length && uyar(k));
  if (tam) return tam.ic;

  // 2) ÖNEK eşleşmesi, ama YALNIZ değişkenle biten kalıplara. `/produit/baklava/avis` aynı sayfanın
  //    bir parçasıdır ve `/product/[slug]` sayılmalı — ayrı kalıp saymak listeyi şişirir, üstelik
  //    emniyet ağına düşerse **ham slug deftere yazılır** (denetim P2'nin şikâyeti, derin yollarda).
  //
  //    **Sabit biten kalıba önek uygulanmaz** ve fark önemli: `/account` bir sayfadır, `/account/x`
  //    ONUN PARÇASI DEĞİL BAŞKA bir sayfadır. Uygulasaydık hesap altındaki her sayfa tek kovaya
  //    düşer ve rota boyutu sessizce kör olurdu.
  const onek = KALIPLAR.find(
    (k) => k.segmentler.length > 0 && k.segmentler.at(-1) === null && k.segmentler.length < kucuk.length && uyar(k),
  );
  if (onek) return onek.ic;

  // Emniyet ağı: tabloda hiç olmayan rotada (operasyon önizlemesi, elle girilen adres, yarın
  // eklenip tabloya yazılmayı unutan bir sayfa) kimlik görünümlü her segment maskelenir.
  return `/${parcalar.map((p) => (KIMLIK_GORUNUMLU.test(p) ? '[id]' : p)).join('/')}`;
}
