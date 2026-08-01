import { meetsMinBasket } from '@lezzet/domain-core';
import type { CouponRejection } from '@lezzet/domain-core';
import type { LocalizedText } from '@lezzet/types';
import type { CartLineRoute } from '@lezzet/domain-core';
import type { StorefrontImage } from '@/lib/storefront/storefront-types';

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
   * Ücretsiz kargoya kalan tutar — **kargo grubundan** hesaplanır. 0 = eşik aşıldı, eşik tanımsız
   * ya da kargo grubu boş.
   *
   * Hesap burada yapılır, çağıranda değil: aynı sayı sepet ekranında ve checkout'ta görünecek ve
   * iki yerde ayrı hesaplanırsa "sepette bedava yazıyordu" şikâyeti doğar.
   */
  freeShippingRemainingCents: number;
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
  freeShippingRemainingCents: 0,
  shippingOnly: false,
};

/**
 * Satırın kimliği — aynı varyantın farklı partisi AYRI satır (React anahtarı da budur).
 * Paket kendi kimliğiyle anılır ve `b:` ile önlenir: bir paketin kimliği ile bir varyantınki
 * teorik olarak çakışmaz ama iki farklı KÜMEDEN gelirler; önek bunu okuyana da söyler.
 */
export function cartKey(ref: CartRef | CartEntry): string {
  return ref.kind === 'bundle' ? `b:${ref.bundleId}` : `${ref.variantId}:${ref.stockId ?? ''}`;
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
  return {
    ...view,
    lines,
    subtotalCents,
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
