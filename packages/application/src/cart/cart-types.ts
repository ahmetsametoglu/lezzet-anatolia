import { meetsMinBasket, resolveShippingFee } from '@lezzet/domain-core';
import type { CouponRejection, ShippingFeeResult } from '@lezzet/domain-core';
import type { AnalyticsBlockedReason, CartItem } from '@lezzet/types';
import type { LocalizedText } from '@lezzet/types';
import type { CartLineRoute } from '@lezzet/domain-core';
import type { StorefrontImage } from '../catalog/storefront-types';

/**
 * **TERFİ (aşama 1/3)** — kaynağı `apps/web/lib/cart/cart-types.ts`tı; gerekçesi
 * `02-mimari §3.1` ("terfi, kopya değil") ve denetimin 07.08 notu
 * (`docs/talep/not-mobil-sepet-yarisi-web-native.md`): *çapraz-istemci kural ya veri tabanında ya
 * paylaşılan pakette yaşar.*
 *
 * Sepet sözleşmesi mobil sipariş yolunun da sözleşmesi (kullanıcı kararı 09.08): ikinci kez
 * yazmak, aynı sepetin iki yüzeyde farklı "engelli/bölünmüş/indirimli" demesi olurdu. Web kopyası
 * bugün KÖPRÜ olarak duruyor; benimsemesi web şeridinin takvimi.
 *
 * Taşımaya ait tek fark import adresleri: `StorefrontImage` artık paketin kendi katalog
 * sözlüğünden geliyor. Kurallar, künyeler ve alan adları AYNEN korundu.
 */

/**
 * Kuponun neden tutmadığı — motorun sebepleri (`CouponRejection`) + kapının iki kendi hâli.
 *
 * Sebep listesi motordan TÜRER, elle kopyalanmaz: motora yeni bir koşul eklendiğinde ekranın
 * karşılaması gereken hâl de kendiliğinden büyür.
 */
export type CouponFailure =
  | CouponRejection
  /** Böyle bir kod yok. Kişisel kuponun başkasında olması da BURAYA düşer: varlığı sızdırılmaz. */
  | 'unknown_code'
  /** Kupon geçerli ama otomatik indirim / müşteri oranı daha büyük — sepete o uygulandı. */
  | 'outranked';

/**
 * Kendiliğinden inen indirimin SEBEBİ — ekranın "neden indi" sorusunu cevaplayabilmesi için.
 *
 * Kuponda sebep zaten kodun kendisidir (tasarım: "İndirim — HOSGELDIN10"); kod girilmeden inen
 * indirimde müşterinin elinde hiçbir ipucu yoktu, satır yalnız "İndirim" diyordu. Sepetinden
 * habersizce para düşen müşteri "neden?" diye soruyor (29.07 geri bildirimi).
 *
 * **Kampanyanın İÇ ADI kullanılmaz:** `Discount.name` operatörün listede tanıdığı addır, tek dilde
 * yazılır ve müşteriye gösterilmek üzere tasarlanmamıştır — Fransız müşteriye "Baklava haftası"
 * yazmak olurdu. Sebep bu yüzden TÜRDEN doğar ve metni sayfanın kendi sözlüğünden gelir.
 *
 * Sebep, kampanyanın müşteriye görünen adının (`CartDiscount.label`) YEDEĞİDİR, alternatifi değil:
 * ad verilmişse o yazılır ("Hoş geldin indirimi"), verilmemişse tür konuşur ("kampanya %15").
 */
export type DiscountReason =
  /**
   * Otomatik kampanya. `percent` YALNIZ oran bütün sepet için doğruysa dolar (kapsam `cart` +
   * yüzde tipi): kategoriye bağlı bir %15, sepetin tamamına inmiş gibi okunursa müşteriye
   * tutmayacağı bir söz verilir — 90 €'luk sepette 4,50 € indirim gören müşteri "%15 nerede"
   * diye sorar. Oran bilinmiyorsa satır sebebi söyler, sayıyı uydurmaz.
   */
  | { kind: 'campaign'; percent: number | null }
  /** Müşterinin genel indirim oranı — kapsamı tanım gereği bütün sepettir, oran her zaman doğrudur. */
  | { kind: 'customer_rate'; percent: number };

/**
 * Sepete inen indirim ya da kuponun reddi. **Görünüm tipidir** — bu dosyada durur çünkü ekran onu
 * okur; çözümü yapan kapı sunucudadır (`lib/cart/discount.ts`, `server-only`).
 */
export type CartDiscount =
  /** `codeId`: hangi KAPIDAN girildi — kota kuralın tamamına aittir, bu yalnız kullanım kaydına iz. */
  | { status: 'applied'; source: 'coupon'; code: string; codeId: string; amountCents: number; lineShares: number[]; discountId: string | null; label: LocalizedText | null }
  /** Kupon girilmeden kazanan indirim (otomatik kampanya ya da müşterinin genel oranı). */
  | { status: 'automatic'; reason: DiscountReason; amountCents: number; lineShares: number[]; discountId: string | null; label: LocalizedText | null }
  /**
   * `appliedInsteadCents`: kupon tutmasa da sepete inen indirim — müşteri onu kaybetmez.
   *
   * `appliedInstead` o indirimin KİMLİĞİDİR (adı + sebebi) ve taşınması şart: kupon reddedilince
   * sepete inen indirim değişmiyor, yalnız kupon uygulanmıyor. Taşınmadığında özet satırı
   * "İndirim — Baklava haftası" iken sırf bir kupon denendi diye "İndirim"e düşüyordu — aynı
   * indirim, iki farklı ad (29.07 kullanıcı geri bildirimi).
   */
  | {
      status: 'rejected';
      reason: CouponFailure;
      code: string;
      appliedInsteadCents: number;
      appliedInstead: { reason: DiscountReason; label: LocalizedText | null } | null;
      /**
       * Kazanan indirimin KALEM PAYLARI ve kimliği — kupon reddedilse de sipariş yazılabilsin diye.
       *
       * Eskiden taşınmıyordu ve bu, `appliedInsteadCents`'i tek başına anlamsız kılıyordu: sepet
       * "yine de 4 € indirim aldın" diyor ama o 4 €'nun kalemlere nasıl bölündüğünü söylemiyordu.
       * Sipariş yazımı payları ister — veritabanı kısıtı *"başlıktaki indirim = payların toplamı"*
       * diyor ve payı olmayan bir başlık indirimini REDDEDER (denetim A1'in testi bunu ortaya
       * çıkardı; A1 yalnız tutarı düzeltseydi sipariş hiç açılamazdı).
       */
      appliedInsteadShares: readonly number[];
      appliedInsteadId: string | null;
    }
  | { status: 'none' };

/**
 * Sepet sözleşmesi (08.4) — müşteri yüzeyinin ikinci veri kapısı.
 *
 * İKİ KATMAN vardır ve karıştırılmamalıdır:
 *   `CartEntry` → NİYET. Ne istendiği: varyant + adet + (varsa) çıpalı parti. Misafirde tarayıcıda,
 *                 girişli müşteride sunucuda (`Cart.items`) yaşar. Fiyat TAŞIMAZ.
 *   `CartLine`  → GÖRÜNÜM. O niyetin bugünkü karşılığı: ad, görsel, fiyat, tükendi, tavan. Her
 *                 okumada YENİDEN çözülür.
 *
 * Ayrım gerçek bir kuraldan doğuyor: sepetteki fiyat **bağlayıcı değildir** (DOMAIN §5). Sepet
 * sunucuda aylarca bekleyebilir; oradaki fiyatı bağlayıcı saymak maliyeti oynayan üründe zarar,
 * fiyat düştüğünde müşteriye haksızlıktır. Bağlayıcı fiyat checkout başlangıcında sabitlenir.
 * Bu yüzden görünüm niyetten TÜRETİLİR, niyetin içinde saklanmaz.
 */

/**
 * Sepetteki niyet. **İKİ TÜR satır vardır** ve kimlikleri farklı doğar:
 *   varyant satırı → `{variantId, stockId}`; aynı varyantın farklı partisi AYRI satırdır (teklif çıpası).
 *   paket satırı   → `{bundleId}`; paketin varyantı YOKTUR, satılan şey paketin kendisidir (DOMAIN §13).
 *
 * Birleşim (union) olarak yazılması bilinçli: paketin partisi ya da varyantı olamaz, varyantın da
 * paket kimliği. Tek düz nesnede dört alan tutulsaydı bu imkânsız hâller yazılabilir kalırdı ve
 * "hangisi dolu" kontrolü her çağrı yerine dağılırdı.
 */
export type CartEntry = CartVariantEntry | CartBundleEntry;

export interface CartVariantEntry {
  /**
   * Türü AÇIKÇA taşır. Kimlik alanının varlığından ("`bundleId` dolu mu") çıkarılamaz: TypeScript
   * yalnız birim tipli alanlarla daraltma yapar, `string` birim tip değildir — o yoldan gidilseydi
   * her okuma yerinde elle kontrol gerekirdi. Depoya da yazılır (tarayıcı + sunucu jsonb).
   */
  kind: 'variant';
  variantId: string;
  qty: number;
  /** Teklif kalemi hangi partiye çıpalı; normal satışta null (DOMAIN §5). */
  stockId: string | null;
  bundleId?: never;
}

export interface CartBundleEntry {
  kind: 'bundle';
  bundleId: string;
  qty: number;
  variantId?: never;
  stockId?: never;
}

/**
 * Bir satırı GÖSTEREN kimlik — ekranın "şunu şu adede getir" derken tuttuğu şey.
 *
 * `CartEntry`'den ayrı durur çünkü adet TAŞIMAZ: `setQty` zaten adedi ayrı alıyor, referansın içinde
 * ikinci bir adet taşımak iki kaynağın ayrışabildiği bir yol açardı.
 */
export type CartRef = { kind: 'variant'; variantId: string; stockId: string | null; bundleId?: never } | { kind: 'bundle'; bundleId: string; variantId?: never; stockId?: never };

/**
 * Sepet satırının bugünkü görünümü — niyetten her okumada yeniden çözülür.
 *
 * Niyetin İKİ türü burada da korunur (`CartVariantEntry & …` / `CartBundleEntry & …`): birleşimin
 * kendisiyle kesişim alınsaydı TypeScript "hangi tür" sorusunu daraltamaz, her okuma yerinde elle
 * kontrol gerekirdi. Dağıtılmış hâlde `line.bundleId` tek başına türü belirler.
 */
export type CartLine = (CartVariantEntry & CartLineView) | (CartBundleEntry & CartLineView);

interface CartLineView {
  /** Ürüne dönüş bağlantısı için; paket satırında paketin slug'ı. */
  slug: string;
  name: string;
  image: StorefrontImage;
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş. */
  unitLabel: string;
  /** null = artık satışa kapalı (kanal fiyatı kalkmış) — satır çıkarılmadan devam edilemez. */
  unitPriceCents: number | null;
  /** Teklif kazandıysa üstü çizilecek referans. */
  wasCents?: number;
  /** Teklifin adet tavanı (partide kalan); tavan yoksa null. */
  limitCap: number | null;
  /**
   * **Fiyat ARTTI** — müşteriye açıkça söylenir ve onayı istenir (DOMAIN §5). Sepet aylarca
   * bekleyebilir; oradaki fiyat bağlayıcı değildir ama sessizce yükseltmek de müşteriyi kasada
   * sürprizle karşılamaktır.
   *
   * **Düşüşte bu alan DOLMAZ** ve bu bilinçlidir: düşen fiyat sessizce uygulanır — müşteriye
   * "iyi haber, onaylıyor musunuz?" diye sormak, olmayan bir kararı ona yıkmaktır.
   *
   * Yalnız SUNUCU sepetinde doğar: ziyaretçinin niyet listesi fiyat taşımaz (`CartEntry` bilerek
   * fiyatsızdır) — karşılaştırılacak bir "önceki" yoktur.
   */
  priceChange?: { previousCents: number };
  /** Satır toplamı — fiyat yoksa null. */
  lineTotalCents: number | null;
  /**
   * Bu satır çıkarılmadan checkout'a geçilemez: ürün tükenmiş ya da satışa kapanmış.
   * "Size ayrıldı" vaadi hiçbir yerde yoktur — sepet stok ayırmaz (DOMAIN §4).
   */
  blocked: boolean;
  /**
   * Bu kalem hangi yoldan gider (19.11) — karar `decideCartAgainstWarehouse` motorundan gelir,
   * ekran hesaplamaz (`STACK §4`).
   *
   * **Yolu STOK belirler, müşteri seçmez:** kendi deposunda bulunan her şey — kargolanabilir olsa
   * bile — rota siparişiyle gider; ücretsiz kapı teslimi varken paralı kargo seçtirmek ikinci bir
   * karar noktası açar ve karşılığı yoktur.
   *
   * `null` = yer bilinmiyor. O hâlde ayrım yapılamaz ve YAPILMAMALI: ziyaretçiye hangi yoldan
   * geleceğini söylemek, bilmediğimiz bir şeyi söylemektir.
   */
  route: CartLineRoute | null;
  /**
   * Bu yerde ŞU AN kaç adet var (19.7) — `route`'un işaret ettiği havuzun miktarı.
   *
   * `null` = yol bilinmiyor (yer sorulmamış ya da satır bir paket): sayı da bilinmiyor. Rota
   * dışı/kargo dışı hâllerde 0 — o satırın sorunu adet değil, kalemin kendisi.
   *
   * **Bir SÖZ DEĞİL, bir sayı.** Sepet stok ayırmıyor (DOMAIN §4); ekran "en fazla 2 adet" değil
   * **"şu an en fazla 2 adet"** demeli ve buna dayanarak kilitlememeli. Gerçek kapı checkout'ta,
   * rezervasyonda.
   *
   * Motorun `fulfillableQty` alanı bunun yerini TUTAMAZ: o `min(istenen, mevcut)` döndürüyor, yani
   * 2 isteyip 2 bulan satır ile 5 isteyip 2 bulan satır ondan ayırt edilemez.
   */
  availableHere: number | null;
  /**
   * PAKET satırının salt-okunur içeriği (K27) — varyant satırında boş dizi.
   *
   * Sepette gösterilmesi tasarımın kararı: müşteri "Bayram Sofrası"nın ne olduğunu satın alma
   * ekranında hatırlamak zorunda kalmasın. **Düzenlenemez** — paket bütün olarak satılır, kalem
   * çıkarmak diye bir şey yok. Fiyat da taşımaz (tek fiyat kuralı).
   */
  contents: { name: string; qty: number }[];
  /**
   * Bu kalem KARGOYA verilebilir mi (`Product.shippable`; pakette `!inRouteOnly`).
   *
   * Kısıtın kendisi burada DEĞİL: "gönderilebilir mi" sorusunun cevabı teslimat yerine bağlıdır ve
   * yer istemcide yaşar (`PlaceProvider`). Satır yalnız kendi gerçeğini taşır; ikisini birleştiren
   * yer ekrandır. Sunucu okuması müşterinin posta kodunu bilmez ve bilmemelidir — bilseydi sepet
   * okuması yer değiştikçe yeniden çalışmak zorunda kalırdı.
   */
  shippable: boolean;
  /**
   * KDV oranı (%). Sepet ekranı bunu GÖSTERMEZ — fiyatlar zaten KDV dahil (DOMAIN §5). Checkout'ta
   * gerekiyor: kargo ücretinin KDV'si taşıdığı malın oranını izler ve karışık sepette oransal
   * bölünür (`apportionShippingVat`). Satırın kendi gerçeği olduğu için burada durur; checkout'un
   * ürünleri ikinci kez okuması, sepet okumasıyla ayrışabilen bir ikinci kaynak yaratırdı.
   *
   * Pakette kalemlerin oranı farklı olabilir; paket satırı **en yüksek** oranı taşır — kargo
   * KDV'sini eksik hesaplamaktansa fazla hesaplamak, vergi tarafında güvenli olan yöndür.
   */
  vatRate: number;
}

/**
 * Sepet ekranının tek okuma sonucu.
 *
 * Kargo satırı BURADA YOK ve bu bilinçli: kargo ücreti teslimat türüne bağlı (rota içi ücretsiz,
 * kargoda eşiğe bakılır) ve teslimat türü ADRESTEN çıkar — adres checkout'ta sorulur. Sepette
 * "Teslimat: Ücretsiz" yazıp checkout'ta 6,90 € çıkarmak, doğru olmayan bir söz vermektir.
 */
export interface CartView {
  lines: CartLine[];
  /** Kalem toplamı (cent) — kargo ve indirim HARİÇ. */
  subtotalCents: number;
  /**
   * Sepete inen indirim ya da kuponun neden inmediği (09.6). Ekranın dört ret hâli buradan çıkar;
   * karar motorundur (`domain-core/pricing`), kapı yalnız taşır.
   */
  discount: CartDiscount;
  /** Ara toplam − indirim. Kargo YOK: ücret teslimat türüne, tür adrese bağlıdır. */
  totalCents: number;
  /** Toplam adet — başlıktaki sepet rozetinin sayısı. */
  itemCount: number;
  /** Çıkarılmadan devam edilemeyecek satır var mı — "Checkout'a geç" pasifleşir. */
  hasBlocked: boolean;
  /** Asgari sepet tutuyor mu (DOMAIN §6, ayardan gelir); tutmuyorsa eksik tutar. */
  minBasketOk: boolean;
  missingForMinBasketCents: number;
  /** Eşiğin kendisi — "en az 25,00 € gerekir" cümlesi bunu yazar; ekran ayarı okumaz. */
  minBasketCents: number;
  /**
   * Ücretsiz kargo eşiği (DOMAIN §6: parametrik, ayardan gelir). Sepet bu eşiğe ne kadar
   * yaklaştığını gösterir; **ücretin uygulanıp uygulanmayacağı** teslimat türüne bağlıdır ve o
   * adreste belli olur — bu yüzden burada yalnız eşik taşınır, ücret satırı taşınmaz. 0 = eşik
   * tanımsız, ilerleme bloğu hiç çizilmez.
   */
  freeShippingCents: number;
  /**
   * KARGO grubunun toplamı (19.11) — ücretsiz kargo eşiği buna bakar, sepetin tamamına değil.
   *
   * Ücretsiz kargo eşiği bir **kargo maliyeti** kuralıdır; rota grubunun tutarının onunla ilgisi
   * yok. Bölünmeseydi 80 €'luk bir rota siparişi 5 €'luk kargo kalemini bedava taşıtırdı — kendi
   * aracımızla giden malın tutarı, bir kargo firmasına ödediğimiz ücreti karşılamaz (K37).
   *
   * Yer bilinmiyorken 0: ayrım yapılamadığı için kargo grubu diye bir şey yoktur.
   */
  shippingSubtotalCents: number;
  /**
   * Kargo TARİFESİ (cent) — ücretsiz olup olmadığına bakılmaksızın, ayardaki ham tutar.
   *
   * Karar burada DEĞİL: "bu grup ücret öder mi, eşiğe ne kadar kaldı" sorusunu motor cevaplıyor
   * (`shippingGroupFee`). Çözülmüş sayıyı da ayrıca taşısaydık aynı gerçeğin iki kopyası olurdu
   * ve biri bir gün ötekinden geride kalırdı; taşınan şey motorun GİRDİSİ.
   *
   * Özet kartının "sepette kargo satırı yok" kuralını bozmaz, sınırını çizer: o kural ücretin
   * teslimat türüne, türün de adrese bağlı olmasından doğuyor. **Kargo grubunda tür zaten belli** —
   * grubun tanımı bu. Rota grubunun ücreti hâlâ yazılmaz, orada eski gerekçe aynen geçerli.
   */
  shippingTariffCents: number;
  /**
   * Sepetin TAMAMI kargo grubunda mı (19.11). Öyleyse salt-kargo siparişi kendiliğinden doğar ve
   * müşteriye "iki sipariş vereceksiniz" DENMEZ — verilecek tek sipariş vardır.
   */
  shippingOnly: boolean;
}

/** Boş sepet — hiç kalem yokken ve okuma yapılamadığında aynı şekil döner. */
export const EMPTY_CART: CartView = {
  lines: [],
  subtotalCents: 0,
  discount: { status: 'none' },
  totalCents: 0,
  itemCount: 0,
  hasBlocked: false,
  minBasketOk: false,
  missingForMinBasketCents: 0,
  minBasketCents: 0,
  freeShippingCents: 0,
  shippingSubtotalCents: 0,
  shippingTariffCents: 0,
  shippingOnly: false,
};

/**
 * Sepetin ilerleyememe SEBEBİ — metin değil, TİP.
 *
 * **Neden tip:** sebep üç ekranda birden lazım (özet kartı · rota grubu · mobil alt çubuk) ve üçü
 * de aynı iki koşulu kendi başına yazıyordu (`view.hasBlocked || !view.minBasketOk`). Aynı kararın
 * üç kopyası bir gün ayrışır — ayrıştığı gün ekranın biri düğmeyi açar, öteki kapatır ve hangisinin
 * doğru olduğunu söyleyecek bir yer kalmaz (`CLAUDE §1`).
 *
 * **Sıra anlamlı:** gönderilemeyen kalem asgari sepetten ÖNCE gelir, çünkü kalem çıkarılınca tutar
 * da değişir. Önce "bu ürünü çıkarın", sonra kalan tutarı konuşmak doğru sıradır; tersi müşteriye
 * karşılayamayacağı bir eşik gösterip ardından sepeti küçültmesini istemek olurdu.
 *
 * Sebebi CÜMLEYE çeviren yer ekrandır (`cart/components/cart-summary`): karar burada, metin orada.
 * Analitiğin terk sebebi de (`ANALYTICS §3` — *"sebep TİPLİDİR, serbest metin yasak"*) buradan
 * okunacak; bugün sebep yalnız yerelleştirilmiş bir cümle olarak vardı ve o cümle ölçülemez.
 *
 * Tip bilerek DIŞA AÇILMIYOR: bugün onu adıyla anan bir çağıran yok (`!== null` yetiyor) ve
 * kullanılmayan bir dışa açım `knip`'in doğru saydığı bir gürültüdür. `cart_blocked` atıcısı
 * (08.9) sebebi adıyla taşıdığı gün açılır.
 */
type CartBlockReason = 'undeliverable_line' | 'min_basket';

export function cartBlockReason(view: Pick<CartView, 'hasBlocked' | 'minBasketOk'>): CartBlockReason | null {
  if (view.hasBlocked) return 'undeliverable_line';
  if (!view.minBasketOk) return 'min_basket';
  return null;
}

/**
 * İstemcinin beyan ettiği ekleme — YALNIZ ölçüme akar (bkz. `writeCartAction`).
 *
 * Tip burada, `actions.ts`'te değil: `'use server'` dosyası bir uçtur, tip sözlüğü değil.
 *
 * **`productId` bugün TAŞINMIYOR** ve bu bilinçli bir sınır: istemcinin elindeki `CartEntry` ürünü
 * değil VARYANTI tanıyor, sunucuda doldurmak ise en sıcak yazma yoluna fazladan bir okuma eklerdi.
 * Kayıp sınırlı — `subjectId` varyantın kendisi ve ürün kırılımı varyant tablosundan çözülebiliyor;
 * denormalize alanın işi "varyant silinse de ürün okunabilsin"di. Sınır 08.9 görev satırında yazılı.
 */
export interface AddToCartIntent {
  subjectType: 'variant' | 'bundle';
  subjectId: string;
  qty: number;
}

/**
 * **Turun künyesi** — istemci ANI beyan eder, sunucu SONUCU görür (08.9).
 *
 * Sepet uçları durum eşitler; "az önce ne oldu" bilgisi yalnız istemcide var ve sunucu onu
 * hesaplayamaz (ziyaretçide saklanmış önceki liste yok). Ölçümün ihtiyacı da tam olarak o an:
 * kupon **denendiği** turda reddedildiyse bir sinyaldir, sonraki her adet değişiminde tekrar
 * okunması gürültüdür.
 *
 * Künye YALNIZ ölçüme akar; yazma nesnesine tip düzeyinde giremez.
 */
export interface CartSignal {
  /** Bu turu ne başlattı — sebep yalnız kendi turunda sayılır. */
  trigger?: 'add' | 'coupon' | 'place';
  added?: AddToCartIntent[];
  /**
   * Tur ÖNCESİNDE sepet iki gruba bölünmüş müydü. Bölünme süregelen bir HÂLDİR; her turda
   * saysaydık tek bölünme onlarca kez sayılırdı. Ölçülen şey geçiş.
   */
  wasSplit?: boolean;
}

/**
 * Sepet iki gruba bölündü mü (19.7) — kapıya giden VE kargoyla giden kalem birlikte var.
 *
 * Müşteri için bu iki ayrı sipariş, iki ayrı ödeme demek; huninin en pahalı sürtünmelerinden biri
 * ve tasarımın "Sepeti bölünen" sayacı buradan doğuyor.
 */
export function isSplitCart(view: Pick<CartView, 'lines'>): boolean {
  const { route, shipping } = splitByRoute(view.lines);
  return route.length > 0 && shipping.length > 0;
}

/**
 * Ekranın engelini DEFTERİN sebebine çevirir (08.9 · `ANALYTICS §3`).
 *
 * Defterin kümesi ekranınkinden İNCE ve bu iyi: ekran tek cümle kurar ("çıkarılmadan devam
 * edilemez"), defter ise nedenini ayırır — `not_shippable` (buraya gönderilemiyor) ile
 * `out_of_stock` (hiçbir depoda yok) aynı rakama düşerse "neyi tedarik edelim" ile "nereye
 * genişleyelim" soruları tek kovada karışırdı. Ayrımı satırın kendi `route`'u zaten taşıyor.
 */
export function cartBlockedAnalyticsReason(view: CartView): AnalyticsBlockedReason | null {
  switch (cartBlockReason(view)) {
    case 'min_basket':
      return 'min_basket';
    case 'undeliverable_line':
      return view.lines.some((l) => l.route === 'not_shippable_here') ? 'not_shippable' : 'out_of_stock';
    case null:
      return null;
  }
}

/**
 * Sepetin İKİ GRUBU (19.7) — kapıya gidenler + kargoyla gidenler.
 *
 * **Ayrımın TEK yeri.** Üç yer birden soruyor: sepet ekranı (iki grup çizer), mobil alt çubuk
 * (yalnız rota grubunu taşır) ve checkout istemcisi (siparişe hangi kalemler girecek). Üçü ayrı
 * ayrı `route === 'shipping'` yazsaydı kural üç yerde bakıma kalırdı — ve ayrışan bir kopya
 * burada "ekranda gördüğüm kalem siparişe girmedi" demek.
 *
 * Kargo grubuna YALNIZ motorun oraya koyduğu kalem girer; geri kalan her şey — yolu çözülmemiş
 * satır, paket, engelli kalem — ana grupta kalır. Yön bilinçli: bilinmeyen bir satırı ana akıştan
 * çıkarmak, müşterinin siparişinden sessizce kalem düşürmek olurdu. Paket zaten tanım gereği
 * bölünmez (`route: null`) — yolu checkout'ta bütünü üzerinden çözülür.
 */
export function splitByRoute(lines: readonly CartLine[]): { route: CartLine[]; shipping: CartLine[] } {
  return {
    route: lines.filter((l) => l.route !== 'shipping'),
    shipping: lines.filter((l) => l.route === 'shipping'),
  };
}

/**
 * Kargo grubunun ücret kararı — **motorun kendisi**, sepetin kargo tarafına uygulanmış hâli.
 *
 * Sunucu okuması da sepet ekranı da bunu çağırır ve checkout `resolveShippingFee`'yi aynı eşikle
 * çağırır: sepette "6,90 €" ya da "ücretsiz" yazıp kasada başka bir sayı kesmek, ekranın sözünü
 * tutmamasıdır (`lib/settings-keys` künyesi bunun bir kez yaşandığını anlatıyor).
 *
 * Kargo grubu yoksa erken çıkar: motor 0 €'luk bir sepeti "eşiğin altında" okuyup ücret yazardı.
 */
export function shippingGroupFee(
  view: Pick<CartView, 'shippingSubtotalCents' | 'freeShippingCents' | 'shippingTariffCents'>,
): ShippingFeeResult {
  if (view.shippingSubtotalCents <= 0) return { feeCents: 0, freeReason: null, remainingForFreeCents: 0 };
  return resolveShippingFee({
    deliveryType: 'shipping',
    basketCents: view.shippingSubtotalCents,
    freeThresholdCents: view.freeShippingCents,
    feeCents: view.shippingTariffCents,
  });
}

/**
 * Satırın kimliği — aynı varyantın farklı partisi AYRI satır (React anahtarı da budur).
 * Paket kendi kimliğiyle anılır ve `b:` ile önlenir: bir paketin kimliği ile bir varyantınki
 * teorik olarak çakışmaz ama iki farklı KÜMEDEN gelirler; önek bunu okuyana da söyler.
 */
export function cartKey(ref: CartRef | CartEntry): string {
  return ref.kind === 'bundle' ? `b:${ref.bundleId}` : `${ref.variantId}:${ref.stockId ?? ''}`;
}

/**
 * SAKLANAN satırdan niyete — `entryOf`in ham-satır ikizi (denetim bulgusu M4, 02.08).
 *
 * `entryOf` çözülmüş görünümü (`CartLine`) alır, bu depodaki kaydı (`CartItem`). İkisi ayrı çünkü
 * girdileri ayrı; ama **ürettikleri kural aynı** ve o kural üç ayrı dosyada üç kez yazılmıştı
 * (`lib/cart/actions`, `lib/account/read`, `lib/order/reorder`). Kopya, `CartEntry`nin künyesinin
 * uyardığı şeyi yapıyordu: birleşimin hangi alanı hangi türde taşıdığı bilgisi dağılınca, paket
 * satırı bir yerde varyant satırına dönüşür.
 *
 * Tür ALANDAN değil kendi bayrağından okunur: `bundleId` doluluğu bir `string` kontrolüdür ve
 * TypeScript onunla daraltma yapamaz.
 */
export function entryOfItem(item: CartItem): CartEntry {
  return item.bundleId
    ? { kind: 'bundle', bundleId: item.bundleId, qty: item.qty }
    : { kind: 'variant', variantId: item.variantId ?? '', qty: item.qty, stockId: item.stockId ?? null };
}

/**
 * NİYET → sunucu sepeti kalemi (`entryOfItem`'in tersi).
 *
 * Fiyat PARAMETRE ve varsayılanı 0: istemciden gelen fiyat kabul edilmez, çağıran gerekiyorsa
 * kendi ÇÖZDÜĞÜ değeri geçer (`writeCartAction` yazarken, checkout taslağı zam bildirirken —
 * 07.13). İki çağıranın da aynı eşlemeyi kendi yerinde kurması, birleşimin hangi alanı hangi
 * türde taşıdığı bilgisini dağıtırdı; `entryOfItem` künyesinin uyardığı tuzak bu.
 *
 * Birim EURO, cent değil — `cart.unit_price` numeric(10,2) (`CartItem` şeması).
 */
export function itemOfEntry(entry: CartEntry, unitPrice = 0): { variantId: string | null; bundleId: string | null; qty: number; unitPrice: number; stockId: string | null } {
  return {
    variantId: entry.variantId ?? null,
    bundleId: entry.bundleId ?? null,
    qty: entry.qty,
    unitPrice,
    stockId: entry.stockId ?? null,
  };
}

/**
 * Sunucu sepetinde SAKLANAN fiyatlar (`cartKey` → cent) — bugünkü çözümle karşılaştırılır (DOMAIN §5).
 *
 * Ziyaretçide böyle bir harita YOKTUR ve olmamalı: niyet listesi bilerek fiyatsızdır, tarayıcıdan
 * gelen bir "önceki fiyat" da müşterinin belirlediği fiyat olurdu.
 *
 * **Evi `actions.ts` değil burası** (07.08): `'use server'` dosyası bir UÇTUR, tip ya da yardımcı
 * sözlüğü değil (`CLAUDE §2`). İkinci tüketici doğduğu an taşınması gerekiyordu — checkout taslağı
 * da aynı karşılaştırmayı yapıyor (07.13) ve kopyalansaydı iki "önceki fiyat" tanımı olurdu.
 */
export function storedPrices(items: readonly CartItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.unitPrice) continue; // 0 = henüz çözülmemiş, geçerli bir "önceki" değil
    map.set(cartKey(entryOfItem(item)), Math.round(item.unitPrice * 100));
  }
  return map;
}

/**
 * Çözülmüş satırdan NİYETE geri dönüş — sunucu yanıtı geldiğinde istemcinin listesi buna göre
 * tazelenir. Tek yerde durur çünkü iki tür satırın hangi alanları taşıdığı bilgisi budur; her
 * çağrı yerinde elle kurulsaydı paket satırı bir yerde varyant satırına dönüşürdü.
 */
export function entryOf(line: CartLine): CartEntry {
  return line.kind === 'bundle'
    ? { kind: 'bundle', bundleId: line.bundleId, qty: line.qty }
    : { kind: 'variant', variantId: line.variantId, qty: line.qty, stockId: line.stockId };
}

/**
 * Sunucudan gelen görünümü BUGÜNKÜ NİYETLE tazeler.
 *
 * Neden gerekli: adet değişimi ekranda **anında** görünmeli (tasarım: "satır toplamı + özet anında
 * güncellenir"). Sunucu turunu beklemek yarım saniyelik ölü bir arayüz demek — bunu maskelemek için
 * düğmeleri kilitlemek de tüm satırları birden donduruyordu (yaşandı, 28.07).
 *
 * Burada hesaplanan tek şey adet × BİLİNEN birim fiyat. Fiyatın kendisi, tükendi bilgisi ve teklif
 * tavanı sunucudan gelmeye devam eder — istemci fiyat ÇÖZMEZ, yalnız çarpar.
 */
/**
 * Toplamdan düşen tutar. Reddedilen kuponda **kazanan indirim** düşer: kupon tutmadı diye müşteri
 * hak ettiği otomatik indirimi kaybetmez (`appliedInsteadCents`).
 *
 * Sunucu okuması da (`lib/cart/read.ts`) ekran da bunu kullanır — tek yerde, çünkü iki kopya
 * ayrıştığında ekranın gösterdiği indirim ile tahsil edilen tutar farklılaşır.
 */
export function discountAmountOf(discount: CartDiscount): number {
  if (discount.status === 'applied' || discount.status === 'automatic') return discount.amountCents;
  return discount.status === 'rejected' ? discount.appliedInsteadCents : 0;
}

export function viewWithEntries(view: CartView, entries: readonly CartEntry[]): CartView {
  const wanted = new Map(entries.map((e) => [cartKey(e), e.qty]));
  const lines = view.lines
    .filter((l) => wanted.has(cartKey(l)))
    .map((l) => {
      const qty = wanted.get(cartKey(l)) ?? l.qty;
      return qty === l.qty ? l : { ...l, qty, lineTotalCents: l.unitPriceCents === null ? null : l.unitPriceCents * qty };
    });
  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  // Eşik kuralı MOTORDAN sorulur, burada yeniden yazılmaz — sunucu okumasıyla aynı karar.
  const basket = meetsMinBasket(subtotalCents, view.minBasketCents);
  /**
   * KARGO grubunun sayıları da tazelenir. Yoksa kargo satırının adedini artıran müşteri, sunucu
   * turu dönene kadar eski grup toplamını ve "ücretsiz kargoya X kaldı" cümlesini okur — üstelik
   * o X'i çoktan eklemiştir. Ücretin kendisi burada TUTULMAZ, motora sorulur (`shippingGroupFee`).
   *
   * Son kargo satırı silinince `shippingOnly` de düşmeli: kalan tek grup rotaysa ekran hâlâ
   * "kargolu ürünleri ayrıca sipariş ver" diyor olurdu.
   */
  const shippingSubtotalCents = lines.reduce((sum, l) => (l.route === 'shipping' ? sum + (l.lineTotalCents ?? 0) : sum), 0);
  const hasShipping = lines.some((l) => l.route === 'shipping');
  return {
    ...view,
    lines,
    subtotalCents,
    shippingSubtotalCents,
    shippingOnly: hasShipping && !lines.some((l) => l.route === 'local'),
    /**
     * Toplam da BURADA yeniden kurulur. Kurulmazsa sunucunun ESKİ toplamı yerinde kalıyor ve
     * özet kartı indirimi `ara toplam − toplam` farkından türettiği için ekranda **olmayan bir
     * indirim** beliriyordu: 10 €'luk satırın adedini 2'ye çıkaran müşteri, sunucu turu dönene
     * kadar "İndirim −10,00 €" ve yarı fiyat bir toplam görüyordu (29.07 denetimi).
     *
     * İndirim tutarı sunucunun son kararıdır ve bir sonraki turda tazelenir; burada yalnız
     * TAŞINIR, yeniden hesaplanmaz — indirim kuralı istemcinin bilgisi değil.
     */
    totalCents: Math.max(0, subtotalCents - discountAmountOf(view.discount)),
    // Sayaç NİYETTEN sayılır, satırlardan değil: katalogdan yeni eklenen ürünün henüz çözülmüş
    // satırı yoktur ama sepette vardır — rozet onu beklemeden göstermeli.
    itemCount: entries.reduce((sum, e) => sum + e.qty, 0),
    hasBlocked: lines.some((l) => l.blocked),
    minBasketOk: basket.ok,
    missingForMinBasketCents: basket.missingCents,
  };
}
