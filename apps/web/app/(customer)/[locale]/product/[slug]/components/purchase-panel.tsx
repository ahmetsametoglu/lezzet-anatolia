'use client';

import type { Locale } from '@lezzet/i18n';
import { formatPrice, formatWeight } from '@/lib/storefront/format';
import type { StorefrontVariant } from '@lezzet/application';
import { Badge } from '@/components/customer/ui/badge';
import { Price } from '@/components/customer/ui/price';
import { buttonClass } from '@/components/customer/ui/button';
import { QtyStepper } from '@/components/customer/ui/qty-stepper';
import { useCart } from '@/components/customer/cart/cart-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { PlaceGate } from '@/components/customer/delivery/place-gate';
import type { Messages } from '../product-types';

/**
 * Satın alma — İKİ parça: boy seçimi (`VariantPicker`, içerik akışında) ve adet + ana aksiyon
 * (`PurchaseBar`).
 *
 * Ayrı olmalarının sebebi mobil: tasarım adet+ekle çubuğunu EKRANIN ALTINA SABİTLER — "sayfa
 * kaydırılırken hep görünür, WhatsApp/sosyal medyadan gelen trafik için tek dokunuş mesafesinde".
 * Boy seçimi ise akışta kalır. Tek bileşen olsalardı çubuk boy kartlarını da aşağı taşırdı.
 * Masaüstünde ikisi arka arkaya, sağ sütunda akar.
 *
 * Seçim SAHİBİ burası değil (`product-client`): boy değişince başlıktaki stok rozeti ve besin
 * tablosundaki net ağırlık da değişir.
 *
 * Sepete ekleme GERÇEKTİR (08.4): sepet servisi ve niyet deposu hazır. Ödeme adımı hâlâ yok
 * (07.4/07.5) ama o checkout'un işi — sepete atmak için ödemenin çalışması gerekmiyor.
 *
 * ── Tasarımdan BİLİNÇLİ SAPMA (28.07, kullanıcı kararı) ──────────────────────────────────────
 * Tasarım burada adet seçici + "Sepete ekle — {toplam}" düğmesini YAN YANA gösteriyor; ekleme
 * sonrası düğme 1,5 sn "Eklendi ✓" olup eski hâline dönüyor. İki sorunu var:
 *
 *   1. Dönen hâl yine "Sepete ekle" ve seçici hâlâ aynı sayıda duruyor — ikinci kez basan müşteri
 *      adedi İKİYE KATLIYOR ve bunu göremiyor (sepet adetleri toplar). "3 ekledim, hâlâ 3 yazıyor,
 *      olmadı galiba" refleksi tam bu tuzağa basıyor.
 *   2. Sepette olmayan bir şeyin "3 adedi" hiçbir yerde karşılığı olmayan bir sayı — ekleme öncesi
 *      adet sormak, henüz var olmayan bir şeyi ölçmek.
 *
 * Yerine TEK KONTROL modeli (katalog kartıyla aynı): önce yalnız "Sepete ekle" düğmesi vardır ve
 * her zaman 1 adet ekler. Kalem sepete girince düğme yerini AYNI KUTUYU dolduran adet seçicisine
 * bırakır; seçici artık gerçek adedi gösterir ve doğrudan onu düzenler (B2B elle giriş burada da
 * açık). 0'a inmek satırı çıkarır ve düğmeyi geri getirir.
 *
 * İki kontrol de satırın tamamını kaplar ve **piksel piksel aynı kutudur** — geçiş, bir düğmenin
 * başka bir düğmeye dönüşmesi gibi görünür. Çerçeve farkı düğmeye şeffaf kenarlık verilerek kapanır.
 *
 * Düğmenin yerine "Sepete git" KONMAZ: sepete gitmenin yolu başlıkta zaten var, çubuğa ikinci bir
 * kapı koymak aynı işi iki kez sunmaktır. "Eklendi ✓" de kaldırıldı — kalıcı mod değişimi 1,5
 * sn'lik bir etiketten güçlü bir onaydır, ikisi birlikte gürültü olurdu.
 */

/** Adet tavanı: teklifte partide kalan miktar, aksi halde makul bir üst sınır (B2B hacmi sığar). */
const MAX_QTY = 99;

const capOf = (v: StorefrontVariant) => (v.limitLabel ? Number(v.limitLabel) : MAX_QTY);

interface VariantPickerProps {
  t: Messages;
  locale: Locale;
  variants: StorefrontVariant[];
  selected: StorefrontVariant;
  onSelect: (variantId: string) => void;
  /**
   * Bakılan çeşidin aile içi etiketi ("Fıstıklı") — yalnız aileli üründe dolu.
   *
   * Boy başlığına bağlam ekler ("Fıstıklı çeşidin boyları"): hemen üstte çeşit kartları varken
   * çıplak "Boy seçin" başlığı hangi çeşidin boyu olduğunu söylemiyordu ve iki seçici arka arkaya
   * durduğu için tam da karışması istenmeyen yer burasıydı.
   */
  familyLabel?: string | null;
  compact?: boolean;
}

/**
 * Boyun MÜŞTERİYE GÖRÜNEN adı — yapısal alanlardan türer, saklı etiketten DEĞİL (kullanıcı kararı 19.08).
 *
 * *"Kullanıcı varyant isminde adet mantıklıysa adet görmeli, gramaj mantıklıysa gramaj. Zaten
 * toplam gramajı da adedi de bir yere yazıyoruz; etiketin tekrar etmesine gerek yok."*
 *
 * Saklı `label` kaynağın kendi dizgisidir (`4x105g`) ve kutunun üstünde öyle yazar — mal kabulde,
 * sayımda, tedarikçiyle konuşurken doğru olan o. Ama vitrinde müşterinin sorusu başka: **kaç tane
 * alıyorum.** Türetim iki alandan yapılıyor, ikisi de zaten dolu:
 *   · `piecesCount > 1` → "4 adet · 420 g"  (adet önde, ağırlık yanında)
 *   · yoksa             → "135 g"           (tek parça; adet yazmak bilgi eklemez)
 *
 * Gramaj kaybolmuyor: çoklu pakette ikinci sıraya geçiyor, çünkü 420 g tek başına 4 simidi mi bir
 * kocaman simidi mi anlattığını söylemiyordu.
 */
function boyAdi(
  v: { piecesCount: number | null; portionKind: 'item' | 'slice' | null; netWeightG: number | null; label: string },
  t: Messages,
  locale: Locale,
): string {
  const agirlik = v.netWeightG !== null ? formatWeight(v.netWeightG, locale) : null;
  if (v.piecesCount !== null && v.piecesCount > 1) {
    const n = String(v.piecesCount);
    // KELİME porsiyon TÜRÜNDEN gelir: 4'lü simit paketi "4 adet", 12 dilimlik cheesecake "12 dilim".
    // İkisine de "adet" yazmak müşteriye 12 cheesecake aldığını söylerdi (künye `portion_kind`, 0005).
    const dilim = v.portionKind === 'slice';
    const tek = (dilim ? t.size.slices : t.size.pieces).replace('{n}', n);
    const cift = (dilim ? t.size.slicesOf : t.size.piecesOf).replace('{n}', n);
    return agirlik ? cift.replace('{weight}', agirlik) : tek;
  }
  return agirlik ?? v.label;
}

/**
 * K22 · Boy seçimi. Fiyatın nerede gösterildiği varyant SAYISINA bağlıdır ve bu tasarımın kararıdır:
 *   çok boylu → fiyat her boy kartının içinde (kıyas kartlar arasında yapılır)
 *   tek boylu → seçilecek bir şey yok, fiyat tek başına durur ("7,50 € / 500 g · 15,00 €/kg")
 * İkisini birden göstermek fiyatı iki kez yazardı; hiçbirini göstermemek tek boylu ürünü fiyatsız
 * bırakırdı (ilk kodlamada bu oldu).
 */
export function VariantPicker({ t, locale, variants, selected, onSelect, familyLabel = null, compact = false }: VariantPickerProps) {
  const multi = variants.length > 1;

  /** "500 g · 15,00 €/kg" — boy adı ve kıyas fiyatı; ikisi de yoksa satır hiç çizilmez. */
  const unitLine = [boyAdi(selected, t, locale), selected.comparisonCents !== null ? `${formatPrice(selected.comparisonCents, locale)}/kg` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-3">
      {/* Tek boylu üründe seçim adımı HİÇ gösterilmez (`musteri-urun-detay.md §2`) — yerine fiyat. */}
      {multi ? (
        <div className="flex flex-col gap-2.5">
          <span className="flex flex-col gap-0.5">
            <span className={['font-sans font-bold text-ink', compact ? 'text-body-sm' : 'text-body'].join(' ')}>{t.chooseSize}</span>
            {familyLabel && (
              <span className="font-sans text-micro text-muted">{t.family.sizesOf.replace('{label}', familyLabel)}</span>
            )}
          </span>
          {/* Mobilde kartlar İKİ SÜTUNLU IZGARADA — tasarım iki boyla çizmişti (`flex:1` yan yana),
              katalog dört boyla geldi ve sarmasız satır 390px viewport'ta 410'a TAŞIYORDU (ölçüldü
              20.08, cevizli-baklava). Izgara kıyası bozmaz: komşu kartlar yine yan yana, fazlası
              alt satıra iner. */}
          <div className={compact ? 'grid grid-cols-2 gap-2.5' : 'flex flex-wrap gap-3'}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                aria-pressed={v.id === selected.id}
                className={[
                  'flex cursor-pointer flex-col gap-0.5 bg-card text-left transition-colors',
                  // 194 = tasarımın 150px İÇERİK genişliği + 40 ped + 4 çerçeve. Tasarım `content-box`,
                  // Tailwind `border-box` — aynı sayıyı yazmak kartı 44 px dar bırakıyordu (yaşandı).
                  compact ? 'rounded-soft px-3.5 py-2.5' : 'min-w-[194px] rounded-card px-5 py-3.5',
                  v.id === selected.id ? 'border-2 border-olive' : 'border-2 border-sand-200 hover:border-sand-400',
                  v.soldOut ? 'opacity-55' : '',
                ].join(' ')}
              >
                <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body'].join(' ')}>{boyAdi(v, t, locale)}</span>
                {/* Fırsat rozeti FİYATIN YANINDA (tasarım): hangi boyun indirimli olduğu ancak o
                    boyun fiyatının yanında görünür — kartların altındaki ortak satır bunu söyleyemez. */}
                <span className="flex flex-wrap items-center gap-2">
                  <Price cents={v.priceCents} wasCents={v.wasCents} locale={locale} size="md" />
                  {v.wasCents !== undefined && (
                    <Badge tone="offer" variant="filled">
                      {t.offer}
                    </Badge>
                  )}
                </span>
                {v.comparisonCents !== null && (
                  <span className="font-sans text-micro text-muted">{formatPrice(v.comparisonCents, locale)}/kg</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2.5">
            <Price cents={selected.priceCents} wasCents={selected.wasCents} locale={locale} size="xl" />
            {selected.wasCents !== undefined && (
              <Badge tone="offer" variant="filled">
                {t.offer}
              </Badge>
            )}
          </span>
          {unitLine && <span className="font-sans text-micro text-muted">{unitLine}</span>}
        </div>
      )}

      {/* Adet sınırı KENDİ SATIRINDA durur (tasarım "İndirimli teklif" durumu): fiyatın altında tek
          bir çip. Fırsat rozetiyle yan yana dizilince iki kırmızı etiket birbirini bastırıyordu. */}
      {selected.limitLabel && <Badge tone="offer">{t.limit.replace('{n}', selected.limitLabel)}</Badge>}
    </div>
  );
}

interface PurchaseBarProps {
  t: Messages;
  locale: Locale;
  selected: StorefrontVariant;
  /**
   * Ürün YALNIZ kapıya teslim edilebiliyor mu (`!product.shippable` — soğuk zincir).
   *
   * Yer bilinmiyorken bu ürünün satın alınabilirliğini söyleyemeyiz: rota deposundan gidiyor ve
   * müşterinin rota içinde olup olmadığını bilmiyoruz. O hâlde eylem yerini posta kodu isteğine
   * bırakır (`PlaceGate`).
   */
  routeOnly?: boolean;
  /**
   * Mobil AKIŞ yerleşimi: kontrol tam genişlik — karar bölgesinin son satırı. Eskiden mobilde
   * ekranın altına sabit koyu çubuk vardı; SÖKÜLDÜ (kullanıcı kararı 20.08, sekizinci tur) —
   * yerini bu satır + çerçevenin yüzen sepet düğmesi (`CartFab`, native deseni) aldı.
   */
  flow?: boolean;
  /**
   * **Üçüncül hâl — "Yine de sepete ekle"** (tasarım `.dc.html`, kullanıcı kararı 19.08).
   *
   * Ürün bu adrese gönderilemiyorken satın alma yolu KAPANMAZ (*"müşteri bölge içindeki birine
   * gönderiyor olabilir"*) ama BİRİNCİL de olamaz: o hâlde ekranın birincil eylemi "kargolanabilir
   * benzerleri gör"dür. Düğme nötr çerçeveye iner ve adı değişir — çünkü artık farklı bir şey
   * yapıyor: bir uyarıya rağmen devam etmek.
   *
   * İki dolu yeşil düğme yan yana durduğunda hiçbiri birincil olmuyordu (kullanıcı bildirimi,
   * ekran görüntüsüyle); tasarım bu sırayı zaten çizmişti, uygulama sapmıştı.
   */
  deemphasized?: boolean;
}

export function PurchaseBar({ t, locale, selected, routeOnly = false, flow = false, deemphasized = false }: PurchaseBarProps) {
  const { add, setQty: setCartQty, lineOf } = useCart();
  const { place, ready } = useDeliveryPlace();
  const cap = capOf(selected);
  const sellable = selected.priceCents !== null && !selected.soldOut;

  /**
   * Yer sorulmadan satın alma eylemi çizilmez — ama YALNIZ rota-only üründe.
   *
   * Kargolanabilen ürün Fransa'nın her yerine gidiyor; orada kodu sormanın bu aşamada bir sonucu
   * yok ve karşılıksız bir soru olurdu (`place-prompt`in sepetteki koşuluyla aynı gerekçe).
   *
   * `ready` beklenir: ilk karede yer henüz okunmamışken kapıyı göstermek, kodu zaten kayıtlı olan
   * müşteriye bir an "önce posta kodu" demek olurdu.
   */
  const gated = routeOnly && ready && !place;

  // SEÇİLİ BOYUN sepetteki satırı — boy değişince bu da değişir. Varyantlı üründe "3 adet" bilgisi
  // ürüne değil BOYA aittir: 500 g'dan 3 alıp 1 kg'a geçen müşteriye hâlâ 3 göstermek yalan olur.
  const inCart = sellable ? lineOf({ variantId: selected.id }) : null;

  // Ekleme HER ZAMAN 1 adettir; ayarlama eklendikten sonra yapılır. Öncesinde adet sormanın anlamı
  // yok: sepette olmayan bir şeyin "3 adedi" hiçbir yerde karşılığı olmayan bir sayıdır. Sepete
  // girdikten sonra ise aynı seçici gerçek adedi düzenler (B2B elle giriş orada da açık).
  const qty = inCart ? inCart.qty : 1;
  const setQty = (next: number) => inCart && setCartQty({ kind: 'variant', variantId: selected.id, stockId: inCart.stockId }, next);

  // Düğme TOPLAM YAZMAZ. Tasarımda yazıyordu çünkü ekleme öncesi adet seçilebiliyordu ("2 × 16,90"
  // gerçek bir hesaptı). Adet artık hep 1 olduğu için toplam birim fiyata eşit — yani düğme, hemen
  // üstündeki fiyatı ikinci kez basıyordu. Aynı sayıyı iki kez yazmak hiyerarşiyi de bozuyordu.
  const label = !sellable ? (selected.priceCents === null ? t.closed : t.soldOut) : deemphasized ? t.addToCartAnyway : t.addToCart;

  // Tek kontrol, tek kutu. İkisi de satırın tamamını kaplar ve aynı yüksekliktedir; çerçeve farkı
  // düğmeye ŞEFFAF kenarlık verilerek kapanır — yoksa geçişte kutu birkaç piksel zıplıyor.
  const control = gated ? (
    <PlaceGate locale={locale} />
  ) : inCart ? (
    <QtyStepper
      value={qty}
      onChange={setQty}
      // 0'a inmek satırı sepetten ÇIKARIR ve ekran ekleme moduna döner — "vazgeçtim" yolu bu.
      min={0}
      max={cap}
      size="lg"
      fullWidth
    />
  ) : (
    <button
      type="button"
      onClick={() => add({ kind: 'variant', variantId: selected.id, qty: 1, stockId: selected.stockId })}
      disabled={!sellable}
      className={buttonClass({
        // Üçüncül hâlde NÖTR çerçeve (tasarım: gri kenar, koyu metin) — yeşilin hiçbir tonu
        // değil, çünkü yeşil bu kutuda zaten iki kez konuşuyor (birincil + ikincil).
        variant: deemphasized ? 'secondary' : 'primary',
        size: 'lg',
        fullWidth: true,
        // `text-lead`in 1.6 satır aralığı bir düğme etiketinde ~9 px fazladan yükseklik demek
        // (tasarım: 17/1.2). Seçici de aynı ölçüyü kullanır, iki kutu aynı kalır.
        className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50',
      })}
    >
      {label}
    </button>
  );

  // Masaüstünde kontrol sütunun YARISINI kaplar. Tam genişlik hem düğmeyi gereğinden iri yapıyor
  // hem de seçicinin üç bölgesini birbirinden koparıyordu — kutu daralınca oran kendiliğinden
  // düzeliyor. `min-w-56` dar sütunda kontrolün ezilmesini engeller.
  //
  // Üçüncül hâlde TAM GENİŞLİK: düğme artık sütunda değil karar kutusunun içinde ve üstündeki iki
  // düğmeyle aynı genişlikte olmalı — yarım kalan bir üçüncü düğme, sıralı bir yığını bozar.
  // Akış yerleşimi de tam genişlik: dar ekranda yarım düğme, dokunması küçük bir yetimdir.
  return <div className={flow || deemphasized ? 'w-full' : 'w-1/2 min-w-56'}>{control}</div>;
}
