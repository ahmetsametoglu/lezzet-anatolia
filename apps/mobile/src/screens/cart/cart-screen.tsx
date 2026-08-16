import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { MeCartViewLine } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { Fragment, useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { SectionHeader } from '@/components/ui/section-header';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import {
  applyCoupon,
  cartCount,
  cartLineId,
  removeBundle,
  removeCoupon,
  removeProduct,
  setBundleQuantity,
  setProductQuantity,
  useCart,
} from '@/screens/customer-kit/cart-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { discountSummaryOf } from '@/screens/customer-kit/discount-label';
import { addressLine } from '@/screens/customer-kit/address-format';
import { AddressPickerSheet } from '@/screens/customer-kit/address-picker-sheet';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { selectDeliveryAddress, useSelectedDeliveryAddress } from '@/screens/customer-kit/delivery-address-store';
import { PostalCodeSheet } from '@/screens/customer-kit/postal-code-sheet';
import { useAddressCartView } from '@/screens/customer-kit/use-address-cart.hook';
import { useAddresses } from '@/screens/customer-kit/use-addresses.hook';
import { useMe } from '@/screens/customer-kit/use-me.hook';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { CartLineRow } from './cart-line-row';
import { CartSkeleton } from './cart-skeleton';
import messages from './messages.json';

/*
  SEPET (v3 `vCart`) — satırlar, kupon, tutar özeti ve yapışkan "siparişi tamamla" barı.

  ── EKRAN HESAP YAPMAZ, ÇİZER ───────────────────────────────────────────────
  Ara toplam · indirim · toplam · asgari sepet · ücretsiz kargo eşiği · "tükendi, çıkarın" hâli —
  hepsi SUNUCUNUN çözdüğü görünümden (`MeCartView`) okunur. Ekranın kendi aritmetiği YOK ve kupon
  sözlüğü YOK: sepetteki fiyat bağlayıcı değildir, her okumada yeniden çözülür (DOMAIN §5) ve iki
  yüzeyde iki ayrı hesap bir gün iki farklı tutar gösterirdi. Görünümü misafirde de sunucu çözer
  (`POST /cart/view`) — aynı sepet misafirken bir, giriş yapınca başka bir tutar göstermesin.

  Deponun kaynağını (sunucu ⟷ cihaz) ekran BİLMEZ; sunucu turunu da o AÇMAZ (`useCartSync` müşteri
  sekme kabuğunda takılı — `app/(tabs)/_layout`; ikinci kez takmak aynı aboneliği iki yerden
  yönetmek olurdu).

  ── SEPETİN ÜÇ GRUBU (kullanıcı kararı 10.08) ───────────────────────────────
  Grubu SÖZLEŞME söyler (`line.group`), ekran türetmez: `local` kapıya teslim (bizim aracımız —
  soğuk zincir ürün buradan gider), `shipping` NORMAL kargo, `undeliverable` bu adrese HİÇ gelemez.

  ELLE SÜZGEÇ SÖKÜLDÜ ve sebebi ölçüldü (10.08, cihazda): ekran `route !== 'shipping'` diyerek
  teslim edilemeyen kalemi "kapıya teslim" grubuna sokuyordu. Sepette üç satır, 38,36 € ve YEŞİL
  bir "Siparişi tamamla" duruyordu; engel ancak bir dokunuş sonra checkout'ta kırmızı bir kutuyla
  çıkıyordu — müşteri gidemeyecek kalemi son adımda öğreniyordu. Karar artık tek yerde
  (`cartGroupOf`, `@lezzet/application`) ve cevabı sunucu taşıyor.

  Başlıklar YALNIZ birden çok grup doluyken çizilir (web sepetinin aynı hükmü, `cart-group.tsx`):
  tek yolu olan sepette başlık, olmayan bir seçimi varmış gibi gösterir.

  KALEM SİLİNMEZ, SİLDİRİLMEZ: gelemeyen satır sepette işaretli bekler — yarın bölge içi bir adres
  eklenirse o kalem yine lazım. "Kaldır" eylemi satırda duruyor (müşterinin kendi kararı) ama ekran
  onu teşvik etmez ve "şunu çıkarın" demez.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Kupon sayfası kitin `BottomSheet`i.** Şablonun kupon yüzeni (`shCoupon`) aynı yerleşimi
     kullanıyor; ikinci bir yüzen sayfa kurmak yerine kitteki kullanıldı.
  2. **Kuponun REDDİ artık sunucudan gelir ve alanın altında değil, sepette yazar.** Doğrulama bir
     ağ turudur; yüzen sayfayı cevabı beklerken açık tutmak, müşteriyi boş bir formun başında
     bekletirdi. Alanın kendi hata satırı duruyor ama tek işi kalıyor: boş kodu göndermemek.
     Sebep CÜMLESİ gerçek (`süresi dolmuş` ⟷ `asgari sepet` ⟷ `hakkı bitmiş` üç ayrı şeydir ve
     ikincisinde müşteri sepetine ürün ekleyerek kuponu kullanabilir).
  3. **Asgari tutar uyarısı `Note` ile** (kitteki terracotta tonu) — şablonun kum-turuncu kutusu
     birebir aynı rol. Yapışkan bardaki düğme o sırada ENGELLİ değil: şablon da tıklatınca uyarıyı
     gösteriyor, yani engel checkout'un kapısında değil sepetin kendisindedir. Burada uyarı ZATEN
     görünür olduğu için düğme kapatıldı — görünmeyen bir kuralı düğmeye basınca öğrenmek yerine
     kural ekranda duruyor.
  4. **Tükendi satırı otomatik silinmez.** Şablon da silmiyor: müşteriye "şunu kaldırın" diyor.
     Sessizce kaldırmak, sepetten haber vermeden ürün çıkarmak olurdu.
  5. **Grup başlıkları ve bölünme uyarısı kitin `SectionHeader`/`Note`u ile.** Mobil tasarımda
     sepetin bölünmesi çizilmemiş; yeni bir görsel dil üretmek yerine ekranın zaten kullandığı iki
     bileşen kullanıldı — bilgi web sepetiyle aynı, biçim mobilin kendi kiti.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * SUNUCUDAN GELEN PAKET SATIRI UYGULAMADAN DÜZENLENEMEZ. Sebep 21.21'de DEĞİŞTİ ve ölçüldü: yazma
 * gövdesi paket dalını artık kabul ediyor (ekleme çalışıyor, adet birleşiyor) ama satırın ADRESİ
 * yok — `PATCH`/`DELETE` yolu varyant + parti ile adresliyor ve paket kimliğiyle atılan `DELETE`
 * satırı bulamıyor (canlı ölçüm: sepet aynen döndü). Basılınca hiçbir şey yapmayan bir sayaç,
 * müşteriye arızalı bir uygulama gösterirdi.
 *
 * Satır GİZLENMEZ — sepettedir ve müşteri neyi taşıdığını görmeli. BEKLEYEN(21.14):
 * `CartService.setQty`/`removeItem` satır anahtarına (`CartRef`) geçince bu süzgeç kalkar.
 */
function isReadOnly(line: MeCartViewLine): boolean {
  return line.kind === 'bundle';
}

export function CartScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const cart = useCart();

  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  /* Adres YOKKEN düşülen yer — gezinme kodu. Bandın andığı yer ile görünümü çözen yer DAİMA aynı
     olmalı; başka bir kaynaktan yazılsaydı ekran, arkasındaki hesabın dayanmadığı bir yeri
     suçlardı. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const browsingCode = onboarding?.postalCode ?? '';

  /* ── SEPETİN YERİ: KAYITLI ADRES (kullanıcı kararı 10.08) ──────────────────
     Posta kodu çekmecesinin kendi cümlesi *"Bu kod yalnız vitrini gezmek içindir; siparişte
     kayıtlı adresiniz kullanılır"* diyor — sepet bu sözü tutmuyordu ve grupları GEZİNME koduyla
     çözüyordu. Ölçülen bedeli üç ayrı arızaydı (grup · toplam · tahsilat): müşteri 67000 ile gezip
     sepette "her şey yolunda" görüyor, adresi 67380 olduğu için checkout'ta başka bir gerçekle
     karşılaşıyordu.

     İki yeri yan yana yazıp farkı UYARIYLA yönetmek yerine kaynak TEKE indirildi: satın alma
     tarafının tamamı (sepet + checkout) adresle çözülür, gezinme kodu vitrinde kalır. Ayrışma artık
     yapısal olarak imkânsız; açıklanacak bir fark yok.

     ADRESİ OLMAYANDA gezinme koduna düşülür (misafir ya da hiç adres eklememiş müşteri) — orada
     zaten iki kaynak yok, çelişki de yok. */
  const { status: meStatus } = useMe();
  const { addresses, publish: publishAddresses } = useAddresses(meStatus === 'ready');
  /* Seçim ORTAK depoda (`delivery-address-store`): sepette seçilen adres checkout'ta da geçerli.
     `null` = müşteri seçmedi, varsayılan geçerli — kimliğini burada saklamıyoruz (künye orada). */
  const selectedAddressId = useSelectedDeliveryAddress();
  const deliveryAddress =
    addresses.find((a) => a.id === selectedAddressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const addressView = useAddressCartView(locale, deliveryAddress?.postalCode ?? null, cart.couponCode);
  const view = addressView ?? cart.view;
  /** Bandın ve künyenin andığı yer — adres varsa onun kodu, yoksa gezinme kodu. */
  const placeLabel = deliveryAddress?.postalCode ?? browsingCode;

  const [couponSheetOpen, setCouponSheetOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  const count = cartCount(cart);
  const isEmpty = count === 0;

  /* Cihazda niyet var ama görünüm henüz yok: sepet ÇÖZÜLEMEDİ. Tutar gösterilmez ve sipariş
     tamamlanamaz — boş bir görünümü "toplam 0,00 €" diye çizmek, ölçülemeyen değeri sıfır saymak
     olurdu (CLAUDE §1). */
  const unresolved = cart.products.length > 0 && view.lines.length === 0;

  /* AYNI PAKET İKİ KEZ ÇİZİLMEZ. Cihazdaki paket kaydı ile sunucunun görünüm satırı aynı satırın
     iki yüzüdür ve 21.21'den beri aynı kimliği taşıyorlar (paketin uuid'si). Çizilen YEREL kayıttır:
     sunucu paketi bugün çözemiyor (`CartBundlePort` mobil uçlarda geçilmiyor — adı boş, fiyatı
     `null` döner), yereldeki ise adını ve fiyatını taşıyor. Süzgeç olmasaydı müşteri aynı paketi
     biri adsız iki satır hâlinde görürdü. */
  const localBundleIds = new Set(cart.bundles.map((bundle) => bundle.id));
  const lines = view.lines.filter((line) => line.kind !== 'bundle' || !localBundleIds.has(line.bundleId));

  /* GRUP SÖZLEŞMEDEN OKUNUR, yoldan TÜRETİLMEZ (künye: elle süzgecin ölçülmüş arızası). Sıra
     tasarımın sırası: önce gelenler, sonra kargoyla gelenler, en sonda bu adrese gelemeyenler. */
  const localLines = lines.filter((line) => line.group === 'local');
  const shippingLines = lines.filter((line) => line.group === 'shipping');
  const undeliverableLines = lines.filter((line) => line.group === 'undeliverable');
  const groups = [
    { key: 'local', eyebrow: t.group.local, lines: localLines },
    { key: 'shipping', eyebrow: t.group.shipping, lines: shippingLines },
    { key: 'undeliverable', eyebrow: t.group.undeliverable, lines: undeliverableLines },
  ].filter((group) => group.lines.length > 0);
  /* Başlık ancak AYRILACAK bir şey varken bilgidir; tek gruplu sepette olmayan bir seçimi varmış
     gibi gösterirdi. Karar grup SAYISINDAN doğar — `shippingOnly` ayrıca sorulmaz, salt-kargo
     sepette zaten tek grup kalır. */
  const showGroupHeadings = groups.length > 1;
  /* İKİ SİPARİŞ uyarısı yalnız gerçekten iki sipariş doğacaksa: gelemeyen kalem bir sipariş
     açmaz, sepette bekler. */
  const split = localLines.length > 0 && shippingLines.length > 0;

  const discount = view.discount;
  /* DÜĞMEYİ GELEMEYEN KALEM KAPATMAZ (kullanıcı kararı 10.08): müşteri gelebilecek kalemleri
     sipariş eder, ötekiler sepette işaretli bekler. Kapatan üç hâl duruyor — görünüm çözülemedi,
     SATILAMAZ kalem var (`hasBlocked` — tükendi/satışa kapandı, teslim edilebilirlikle ilgisi yok)
     ve asgari sepet tutmuyor (eşiğin matrahından gelemeyen kalemler zaten sunucuda düşülüyor). */
  const checkoutBlocked = unresolved || view.hasBlocked || !view.minBasketOk;

  /*
    Kilitli düğmenin GEREKÇESİ — kısa hâli, barın içinde.

    SIRA ANLAMLI: satılamayan kalem asgari sepetten ÖNCE söylenir, çünkü kalem çıkarılınca tutar da
    değişir. Önce "şu kalemi çıkarın", sonra kalan tutarı konuşmak doğru sıra; tersi müşteriye
    karşılayamayacağı bir eşik gösterip ardından sepeti küçültmesini istemek olurdu. Aynı sıra
    sunucunun `cartBlockReason`ında da yazılı — mobil o paketi (`@lezzet/application`) bilmiyor,
    bu yüzden sıra burada tekrar ediyor.

    `unresolved` hâlinde SUSAR: sepet daha getirilemediyse ortada bir engel değil, bir bilinmezlik
    var ve onun kendi bloğu yukarıda çiziliyor (CLAUDE §1: ölçülemeyen değer sıfır değildir).
  */
  const barBlockText = ((): string | null => {
    if (unresolved) return null;
    if (view.hasBlocked) return t.barBlock.blocked;
    if (!view.minBasketOk) {
      return t.barBlock.minimum.replace('{missing}', formatPrice(view.missingForMinBasketCents, locale));
    }
    return null;
  })();

  /* Künye TÜRETMESİ kitte (`discountSummaryOf`): aynı indirim sipariş özetinde de anılıyor ve iki
     ekranın aynı kampanyaya iki farklı ad vermesi, müşteriye "bu aynı indirim mi" diye sayıları
     karşılaştırtırdı. Ekranın kendi işi yalnız öneki koymak — o metin ekranın sözlüğünde. */
  const discountRow = (): SummaryRow | null => {
    const summary = discountSummaryOf(discount, locale);
    if (summary === null) return null;
    return {
      key: 'discount',
      label: summary.name === null ? t.summary.discount : `${t.summary.discount} · ${summary.name}`,
      // İndirim EKSİ yazılır: özetteki tek çıkarma satırı odur ve işaretsiz yazılırsa
      // toplamla aritmetiği tutmuyormuş gibi okunur.
      value: `−${formatPrice(summary.amountCents, locale)}`,
      tone: 'olive',
    };
  };

  const rejection = discount.status === 'rejected' ? discount : null;
  const rejectionText =
    rejection === null
      ? null
      : rejection.reason === 'outranked'
        ? t.coupon.rejected.outranked.replace('{amount}', formatPrice(rejection.appliedInsteadCents, locale))
        : t.coupon.rejected[rejection.reason];

  const discountSummary = discountRow();
  /* Toplam SEPETTE DURAN her şeyi sayar (sözleşmenin hükmü: ekran müşterinin sepetini eksiksiz
     göstermeli) — ama gelemeyen kalem siparişe girmiyor. Kapsam belirsiz kalmasın diye tutar ayrı
     bir satırda yazılır ve panelin dip notu ne demek olduğunu söyler. Hesap YOK: sayı sunucudan
     olduğu gibi geliyor (`undeliverableSubtotalCents`). */
  const undeliverableCents = view.undeliverableSubtotalCents;
  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(view.subtotalCents, locale) },
    ...(discountSummary === null ? [] : [discountSummary]),
    ...(undeliverableCents === 0
      ? []
      : [{ key: 'undeliverable', label: t.summary.undeliverable, value: formatPrice(undeliverableCents, locale) }]),
  ];
  const summaryNote = undeliverableCents === 0 ? t.summary.note : `${t.summary.note} ${t.summary.undeliverableNote}`;

  const submitCoupon = () => {
    /* Kod bir KİMLİKTİR, dilin harf kuralına tabi değil: `toLocaleUpperCase('tr')` "i"yi "İ" yapar
       ve sunucudaki kodu bulamaz hâle getirirdi. */
    const code = couponInput.trim().toUpperCase();
    if (code === '') {
      setCouponError(t.coupon.empty);
      return;
    }
    applyCoupon(code);
    setCouponInput('');
    setCouponError(null);
    setCouponSheetOpen(false);
  };

  const renderLine = (line: MeCartViewLine) => {
    const id = cartLineId(line);
    const bundle = line.kind === 'bundle';
    const priceLabel = line.unitPriceCents === null ? null : formatPrice(line.unitPriceCents, locale);
    const contents = line.contents.map((item) => `${item.name} ×${item.qty}`).join(' · ');

    const subtitle =
      bundle && contents !== ''
        ? contents
        : priceLabel === null
          ? line.unitLabel === ''
            ? t.line.noPrice
            : line.unitLabel
          : line.unitLabel === ''
            ? priceLabel
            : t.line.unit.replace('{variant}', line.unitLabel).replace('{price}', priceLabel);

    /* Fiyat ARTTIYSA önce o söylenir (DOMAIN §5: müşteriye açıkça söylenir); düzenlenemezlik ikinci
       derecede bir bilgidir ve ancak başka uyarı yokken yer alır. */
    const notice =
      line.priceChange !== undefined
        ? t.line.priceUp.replace('{price}', formatPrice(line.priceChange.previousCents, locale))
        : isReadOnly(line)
          ? t.line.readOnly
          : undefined;

    return (
      <CartLineRow
        key={id}
        name={line.name}
        subtitle={subtitle}
        totalLabel={line.lineTotalCents === null ? t.line.noPrice : formatPrice(line.lineTotalCents, locale)}
        quantity={line.qty}
        photoUri={line.image.url}
        tone={bundle ? 'bundle' : 'product'}
        eyebrow={bundle ? t.line.bundle : undefined}
        discountLabel={line.wasCents === undefined ? undefined : t.line.discounted}
        soldOutLabel={line.blocked ? (line.unitPriceCents === null ? t.line.closed : t.line.soldOut) : undefined}
        // Satır künyesi: kalem sepette DURUYOR, yalnız bu adrese gelmiyor. Cümle "kaldırın" demez.
        awayLabel={line.group === 'undeliverable' ? t.line.undeliverable : undefined}
        noticeLabel={notice}
        readOnly={isReadOnly(line)}
        removeLabel={t.line.remove}
        removeAccessibilityLabel={t.line.removeLabel.replace('{name}', line.name)}
        decreaseLabel={t.line.decrease.replace('{name}', line.name)}
        increaseLabel={t.line.increase.replace('{name}', line.name)}
        onDecrease={() => setProductQuantity(id, line.qty - 1)}
        onIncrease={() => setProductQuantity(id, line.qty + 1)}
        onRemove={() => removeProduct(id)}
        testID={`cart-line-${id}`}
      />
    );
  };

  /* ── İKİ GRUP = İKİ SİPARİŞ (web'in hükmü, `cart-group.tsx`) ───────────────
     *"Tek sepet, iki grup, iki checkout"* — ikinci sipariş ZORUNLU DEĞİL: müşteri vermezse o
     kalemler sepette bekler, kapıya siparişi hiç etkilenmez. Bölünmenin kendisi bir seçim değil,
     stokun sonucu: rota deposunda bulunan her şey — kargolanabilir olsa bile — araçla gider.

     GRUP TOPLAMLARI satırlardan toplanır ve İNDİRİM bu toplamlara yazılmaz; web'in aynı kararı ve
     aynı gerekçesi: kupon/kampanya siparişin kendi kalemlerine göre checkout'ta yeniden çözülüyor,
     sepette bir gruba düşecek payı kesin bilemeyiz. Dökümün yeri özet kartı.

     KARGO ÜCRETİ SUNUCUDAN (`shippingGroupFeeCents`): eşikle tarifeyi karşılaştırma kararı iş
     kuralıdır, istemcide tekrarlanmaz (sözleşme künyesi). */
  const localItemsCents = localLines.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0);
  const shippingItemsCents = shippingLines.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0);
  const shippingFeeCents = view.shippingGroupFeeCents;

  const shippingBreakdown = [
    shippingFeeCents > 0
      ? t.group.shippingFee
          .replace('{items}', formatPrice(shippingItemsCents, locale))
          .replace('{fee}', formatPrice(shippingFeeCents, locale))
      : t.group.shippingFeeFree.replace('{items}', formatPrice(shippingItemsCents, locale)),
    view.shippingFreeRemainingCents > 0
      ? t.group.shippingRemaining.replace('{amount}', formatPrice(view.shippingFreeRemainingCents, locale))
      : null,
    t.group.shippingPayment,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  /* Ücretsiz kargo eşiği YALNIZ kargo grubu varken anlamlıdır: kapıya teslimde kargo ücreti diye
     bir şey yok ve eşiği orada göstermek olmayan bir hedefi varmış gibi okuturdu. Eşik 0 =
     "tanımsız" (sözleşmenin hükmü) — blok hiç çizilmez. BÖLÜNMÜŞ sepette çizilmez çünkü aynı bilgi
     kargo grubunun kendi kartında, tutarıyla birlikte zaten yazılı. */
  const freeShippingNote =
    view.freeShippingCents === 0 || shippingLines.length === 0 || split ? null : view.shippingFreeRemainingCents > 0 ? (
      <Note
        tone="warm"
        description={t.freeShipping.remaining.replace('{amount}', formatPrice(view.shippingFreeRemainingCents, locale))}
        testID="cart-free-shipping"
      />
    ) : (
      <Note tone="olive" description={t.freeShipping.reached} testID="cart-free-shipping" />
    );

  /**
   * Kargo grubunun KENDİ eylemi — çerçeveli düğme, ikincil ağırlık (web'in aynı hiyerarşisi):
   * asıl akış kapıya gidendir, bu isteğe bağlı ikinci siparıştir.
   *
   * ASGARİ SEPET BU GRUBA İŞLEMEZ (web'in kararı): eşik siparişin kendi tutarına bakar ve kargo
   * siparişi ayrı bir siparıştir — rota grubunun eksiği yüzünden kargo siparişini kilitlemek,
   * olmayan bir bağ kurmak olurdu. SATILAMAZ kalem ise sepetin tamamını durdurur (`hasBlocked`).
   */
  const shippingAction = !split ? null : (
    <View style={styles.groupCard} testID="cart-shipping-group">
      <Text style={styles.groupTotal}>
        {t.group.shippingTotal.replace('{amount}', formatPrice(shippingItemsCents + shippingFeeCents, locale))}
      </Text>
      <Text style={styles.groupNote}>{shippingBreakdown}</Text>
      <SecondaryButton
        label={t.group.shippingCta}
        onPress={() => router.push('/checkout?group=shipping')}
        disabled={view.hasBlocked}
        testID="cart-shipping-checkout"
      />
    </View>
  );

  /** Rota grubunun künyesi — düğmesi yapışkan bardadır, bu kart yalnız tutarı ve vaadi söyler. */
  const routeSummary = !split ? null : (
    <View style={styles.groupCard} testID="cart-route-group">
      <Text style={styles.groupTotal}>{t.group.routeTotal.replace('{amount}', formatPrice(localItemsCents, locale))}</Text>
      <Text style={styles.groupNote}>{t.group.routeNote}</Text>
    </View>
  );

  const header = (
    <View style={styles.header}>
      <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="cart-back" />
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
      <Text style={styles.count}>{t.count.replace('{n}', String(count))}</Text>
    </View>
  );

  if (isEmpty) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon={<CustomerIcon name="cart" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.empty.title}
          description={t.empty.body}
          action={<PrimaryButton label={t.empty.cta} shape="pill" onPress={() => router.push('/catalog')} testID="cart-browse" />}
          testID="cart-empty"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.content} testID="cart-scroll">
        {/* TESLİMAT ADRESİ — SEPETİN YERİNİ SÖYLER (kullanıcı kararı 10.08).
            Sepetin neye göre değerlendirildiği ekranda YAZILI olmalı: müşteri az önce katalogda
            başka bir posta koduyla geziyor olabilir ve kalemlerin neden bu hâle geldiğini burada
            görmeli. Posta kodu düzenleyicisi sepette YOK — başka bir yere gönderecekse adres seçer
            ya da ekler; iki ayrı yer tutmak, az önce kapattığımız ayrışmayı geri açardı. */}
        {deliveryAddress === null ? (
          browsingCode === '' ? null : (
            <View style={styles.place}>
              <Text style={styles.placeEyebrow}>{t.address.eyebrow}</Text>
              <Text style={styles.placeNote}>{t.address.none.replace('{code}', browsingCode)}</Text>
              <TextAction label={t.undeliverable.change} onPress={() => setCodeSheetOpen(true)} testID="cart-place-code" />
            </View>
          )
        ) : (
          <View style={styles.place}>
            <Text style={styles.placeEyebrow}>{t.address.eyebrow}</Text>
            <Text style={styles.placeLine}>{addressLine(deliveryAddress)}</Text>
            <Text style={styles.placeNote}>{t.address.note}</Text>
            <TextAction
              label={t.address.change}
              /* EKRAN TERK EDİLMEZ (kullanıcı bulgusu 10.08): burası eskiden `/account`a
                 yönlendiriyordu ve müşteri Hesabım'ın tepesine düşüp adres bölümünü arıyor, geri
                 dönünce de sepete değil vitrine çıkıyordu (sekme değiştiği için). Checkout aynı işi
                 kendi ekranında yapıyor; sepetin ondan farkı yok. */
              onPress={() => setPickerOpen(true)}
              testID="cart-place-address"
            />
          </View>
        )}

        {/* GELEMEYEN KALEMLERİN TEK UYARISI, satırların ÜSTÜNDE: müşteri sepetini okumadan önce
            neyle karşılaşacağını bilsin. Ton `warm` — bu bir HATA değil, adresin gerçeği; `error`
            kırmızısı müşteriye yanlış bir şey yaptığını söylerdi. Çıkış yolu da burada yazılı:
            bölge içi bir adres. "Ürünü kaldırın" YAZILMAZ (kullanıcı kararı 10.08). */}
        {undeliverableLines.length === 0 ? null : (
          /* KODU DEĞİŞTİRME KUTUNUN İÇİNDE (kullanıcı bulgusu 10.08): bağlantı kutunun ALTINDA
             dururken bandın parçası gibi değil, bağımsız bir eylem gibi okunuyordu. `Note`un kendi
             eylem yuvası zaten kutunun içinde çiziyor.

             Web sepette bunu hiç sunmuyor çünkü orada kod sitenin tepesindeki kanonik panelde ve
             hep görünür; uygulamada sepet TAM EKRAN, müşteri problemi burada görüyor ve kodu
             değiştirecek yer ekranda yok. Üçüncü bir posta kodu girdisi YAZILMIYOR: kitteki kanonik
             çekmece açılıyor (web'in aynı gerekçesi — aynı doğrulamayı üç yerde bakıma bırakmamak). */
          <Note
            tone="warm"
            title={t.undeliverable.title.replace('{place}', placeLabel)}
            description={t.undeliverable.body.replace('{place}', placeLabel)}
            /* EYLEM YALNIZ ADRESİ OLMAYANDA (kullanıcı bulgusu 10.08): adres varken bandın içine de
               "adresi değiştir" koymak, hemen üstündeki künyenin "Değiştir"iyle AYNI yere açan ikinci
               bir düğme demekti. Aynı işi yapan iki eylem, müşteriye "acaba farklı bir şey mi
               yapıyorlar" diye düşündürür. Adres yokken bandın kendi çıkışı gerekli — o hâlde
               yukarıdaki künye de kod künyesidir. */
            action={
              deliveryAddress !== null ? undefined : (
                <TextAction label={t.undeliverable.change} onPress={() => setCodeSheetOpen(true)} testID="cart-change-code" />
              )
            }
            testID="cart-undeliverable"
          />
        )}

        <View style={styles.lines}>
          {/* Cihazda duran hazır paket satırları — depo onları henüz sunucuya bağlamıyor (iki ölçülmüş
              engel: satır çözülemiyor, satır silinemiyor — `cart-store` künyesi). */}
          {cart.bundles.map((bundle) => (
            <CartLineRow
              key={bundle.id}
              name={bundle.name}
              subtitle={bundle.contentLabel}
              totalLabel={formatPrice(bundle.unitCents * bundle.quantity, locale)}
              quantity={bundle.quantity}
              photoUri={bundle.photoUri}
              tone="bundle"
              eyebrow={t.line.bundle}
              removeLabel={t.line.remove}
              removeAccessibilityLabel={t.line.removeLabel.replace('{name}', bundle.name)}
              decreaseLabel={t.line.decrease.replace('{name}', bundle.name)}
              increaseLabel={t.line.increase.replace('{name}', bundle.name)}
              onDecrease={() => setBundleQuantity(bundle.id, bundle.quantity - 1)}
              onIncrease={() => setBundleQuantity(bundle.id, bundle.quantity + 1)}
              onRemove={() => removeBundle(bundle.id)}
              testID={`cart-bundle-${bundle.id}`}
            />
          ))}

          {/* Grubun EYLEMİ kendi kalemlerinin hemen ardında: web'in yerleşimi ve gerekçesi aynı —
              "kargolu ürünleri ayrıca sipariş ver" düğmesi, hangi ürünlerden bahsettiği görünürken
              anlam taşır. Rota grubunun düğmesi yapışkan bardadır, burada yalnız künyesi durur. */}
          {groups.map((group) => (
            <Fragment key={group.key}>
              {showGroupHeadings ? <SectionHeader eyebrow={group.eyebrow} testID={`cart-group-${group.key}`} /> : null}
              {group.lines.map(renderLine)}
              {group.key === 'local' ? routeSummary : null}
              {group.key === 'shipping' ? shippingAction : null}
            </Fragment>
          ))}
        </View>

        {/* ÇÖZÜLMEMİŞ SEPET: elimizde ürün var ama satırları henüz kuramadık. Bu bir işlem değil
            YERLEŞİM beklemesidir (ölçüldü 10.08) — eskiden halka dönüyordu ve liste boş
            duruyordu; satırlar gelince kupon daveti, özet ve bar aşağı zıplıyordu. Satır sayısı
            TAHMİN DEĞİL: sepet cihazda yaşıyor, kaç ürün olduğunu biliyoruz (skeleton künyesi).
            Okuma DÜŞERSE skeleton yerine tek satırlık ret durur — bekleme bitti, cevap yok. */}
        {unresolved ? (
          cart.resolving ? (
            <CartSkeleton
              count={cart.products.length}
              testID="cart-loading"
            />
          ) : (
            <Note tone="terracotta" description={t.unresolved.failed} testID="cart-unresolved" />
          )
        ) : null}

        {freeShippingNote}

        {/* Bölünme SEPETİN kendi hâlidir, bir seçim değil: müşteri kalem taşımaz, yol seçmez. */}
        {split ? <Note tone="warm" description={t.group.split} testID="cart-split" /> : null}

        {discount.status === 'applied' ? (
          <View style={styles.couponApplied} testID="cart-coupon-applied">
            <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
            <Text style={styles.couponAppliedLabel}>{t.coupon.applied.replace('{code}', discount.code)}</Text>
            <TextAction
              label={t.coupon.remove}
              onPress={removeCoupon}
              accessibilityHint={t.coupon.removeLabel}
              testID="cart-coupon-remove"
            />
          </View>
        ) : (
          <PressableSurface
            onPress={() => setCouponSheetOpen(true)}
            feedback="scale"
            style={styles.couponInvite}
            accessibilityLabel={t.coupon.add}
            testID="cart-coupon-open"
          >
            <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
            <Text style={styles.couponInviteLabel}>{t.coupon.add}</Text>
            <Text style={styles.couponChevron}>›</Text>
          </PressableSurface>
        )}

        {rejectionText === null ? null : (
          <Note tone="terracotta" description={rejectionText} testID="cart-coupon-rejected" />
        )}

        <SummaryPanel
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(view.totalCents, locale)}
          note={summaryNote}
          testID="cart-summary"
        />

        {/* Sunucu reddi: iyimser yazım geri alındı, yani ekrandaki sepet SUNUCUDAKİ sepettir.
            GELİŞTİRMEDE RET ANAHTARI DA YAZILIR: müşteriye tek cümle yeter ama biz o cümleyle
            arızayı teşhis edemiyorduk — "eşitlenemedi" `unauthorized`ı da `invalid_response`u da
            aynı görünüşe indiriyor ve hangisi olduğu ancak cihazda tekrar üretilerek anlaşılıyor
            (09.08). Anahtar depoda zaten duruyordu, ekran onu atıyordu. */}
        {cart.error === null ? null : (
          <Note
            tone="terracotta"
            description={__DEV__ ? `${t.sync.failed} [${cart.error}]` : t.sync.failed}
            testID="cart-sync-error"
          />
        )}

        {view.hasBlocked ? <Note tone="error" description={t.blocked} testID="cart-blocked" /> : null}

        {view.minBasketOk || unresolved ? null : (
          <Note
            tone="terracotta"
            description={t.minimum
              .replace('{minimum}', formatPrice(view.minBasketCents, locale))
              .replace('{missing}', formatPrice(view.missingForMinBasketCents, locale))}
            testID="cart-minimum"
          />
        )}

        <View style={styles.continueRow}>
          <TextAction label={t.continue} onPress={() => router.push('/catalog')} testID="cart-continue" />
        </View>
      </ScrollView>

      {/* Yapışkan bar kaydırma alanının DIŞINDA (RN'de `position: sticky` yok — kitin kendi kalıbı). */}
      <View style={styles.stickyBar}>
        {/*
          ENGELİN SEBEBİ DÜĞMENİN YANINDA (kullanıcı bulgusu 16.08, cihazda ölçüldü).

          Sebep zaten yazılıydı — ama kaydırma alanının EN DİBİNDE, kalemlerin ve özet tablosunun
          altında. Tek kalemlik sepette görünüyor; 23 kalemlik sepette ekranın çok altında kalıyor.
          Müşterinin gördüğü tek şey kilitli bir düğme oluyor ve düğme neden kilitli olduğunu
          söylemiyordu. Kullanıcının cümlesi: *"sepet hazırken uyarmıyoruz, ödemeye kalkınca
          uyarıyoruz"* — uyarı vardı, kararın verildiği yerde değildi.

          Sebep TİPTEN geliyor (`cartBlockReason`, `@lezzet/application`), ekranın kendi `if`inden
          değil: aynı iki koşul üç ekranda birden sorulacaktı ve ayrıştıkları gün biri düğmeyi açıp
          öteki kapatırdı. Dipteki uzun açıklama KALIYOR — orası "ne yapmalıyım"ı anlatıyor, burası
          yalnız "neden basamıyorum"u.
        */}
        {barBlockText === null ? null : (
          <Text style={styles.barBlock} testID="cart-bar-block">
            {barBlockText}
          </Text>
        )}
        <PressableSurface
          onPress={() => router.push('/checkout')}
          feedback="shadow"
          disabled={checkoutBlocked}
          style={[styles.checkoutButton, checkoutBlocked ? styles.checkoutDisabled : styles.checkoutEnabled]}
          accessibilityLabel={t.checkout}
          testID="cart-checkout"
        >
          <Text style={styles.checkoutLabel}>{t.checkout}</Text>
          <View style={styles.checkoutTotal}>
            {/* BÖLÜNMÜŞ sepette bar ROTA siparişinin tutarını yazar: düğme o siparişi açıyor ve
                sepetin tamamını yazmak, basılınca başka bir tutarla karşılaşmak demekti. */}
            <Text style={styles.checkoutLabel}>{formatPrice(split ? localItemsCents : view.totalCents, locale)}</Text>
          </View>
        </PressableSurface>
      </View>

      {/* Kupon yüzeni kendi katmanını kurar (kitteki `BottomSheet`), ekranın yerleşimine karışmaz. */}
      <BottomSheet
        visible={couponSheetOpen}
        title={t.coupon.sheetTitle}
        onClose={() => setCouponSheetOpen(false)}
        testID="cart-coupon-sheet"
      >
        <View style={styles.couponForm}>
          <TextField
            value={couponInput}
            onChangeText={(value) => {
              setCouponInput(value);
              // Yazmaya başlayınca hata düşer: eski bir reddin yeni kodun üstünde durması yanlış olurdu.
              setCouponError(null);
            }}
            accessibilityLabel={t.coupon.field}
            placeholder={t.coupon.placeholder}
            errorText={couponError ?? undefined}
            testID="cart-coupon-input"
          />
          <PrimaryButton label={t.coupon.apply} onPress={submitCoupon} testID="cart-coupon-apply" />
        </View>
      </BottomSheet>

      {/* Kanonik posta kodu çekmecesi — vitrinle AYNI dosya, aynı doğrulama, aynı kaydetme.
          Kapanınca `useCartSync` yeni kodu görüp görünümü yeniden çözdürüyor; ekranın ayrıca bir şey
          yapması gerekmiyor. */}
      {/* Adres seçici — ekranı terk etmeden (künyesi `address-picker-sheet`). Seçim ortak depoya
          yazılır, yani checkout da aynı adresi okur. */}
      <AddressPickerSheet
        visible={pickerOpen}
        addresses={addresses}
        selectedId={deliveryAddress?.id ?? null}
        onSelect={selectDeliveryAddress}
        onAddNew={() => {
          setPickerOpen(false);
          setAddressSheet({ editing: null });
        }}
        onClose={() => setPickerOpen(false)}
        testID="cart-address-picker"
      />

      {/* Adres YAZMA kitin ortak formu — hesap ve checkout ekranlarıyla AYNI dosya. Yazılan adres
          hem listeye girer hem SEÇİLİ hâle gelir: müşteri onu az önce bu sepet için yazdı. */}
      <AddressSheet
        target={addressSheet}
        addresses={addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={(next, savedId) => {
          publishAddresses(next);
          // `savedId` silmede `null` gelir — o hâlde seçim varsayılana düşsün, silinmiş bir kimliğe değil.
          selectDeliveryAddress(savedId);
          setAddressSheet(null);
        }}
        testID="cart-address-sheet"
      />

      <PostalCodeSheet
        visible={codeSheetOpen}
        code={browsingCode === '' ? null : browsingCode}
        onClose={() => setCodeSheetOpen(false)}
        // "Nerelere gidiyorsunuz?" ÇİZİLİR: müşteri tam da bu soruyu sorduğu anda burada.
        showZonesLink
        testID="cart-postal-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  /* Teslimat adresi bloğu — kutu DEĞİL: sepetin başında duran bir künye. Kutuya alsaydık uyarı
     gibi okunurdu, oysa bu bir durum bildirimi. */
  place: {
    gap: theme.space['2xs'],
    paddingHorizontal: theme.space['3xl'],
    paddingBottom: theme.space.lg,
  },
  placeEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  placeLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  /* Grup künyesi — kutu, ama satırların çerçevesinden ayrı: kalemler kendi kartlarında kalsın,
     ikinci bir çerçeve sepeti kutu içinde kutu yapardı (web'in aynı kararı). */
  groupCard: {
    gap: theme.space.sm,
    padding: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-100'],
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-300'],
  },
  groupTotal: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  groupNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  placeNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space['3xl'],
    paddingTop: theme.space.sm,
  },
  title: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },
  count: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  content: {
    padding: theme.space['4xl'],
    gap: theme.space.xl,
    // Yapışkan barın altında kalan son satır için nefes (şablon: 120 px'lik boşluk bloğu).
    paddingBottom: theme.space['9xl'] + theme.space['5xl'],
  },
  lines: { gap: theme.space.lg },

  couponInvite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    padding: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-250'],
  },
  couponInviteLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  couponChevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['sand-600'],
  },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    padding: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors['sand-150'],
  },
  couponAppliedLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  continueRow: { alignItems: 'center' },

  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['6xl'],
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    backgroundColor: theme.colors['cream-glass'],
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: theme.size.controlLg,
    paddingLeft: theme.space['5xl'],
    paddingRight: theme.space.md,
    borderRadius: theme.radius.control,
    boxShadow: theme.shadow.hard,
  },
  /* Barın kendi zemini `cream-glass`; uyarı onun üstünde okunaklı kalsın diye terracotta metin —
     kutu YOK: bar zaten çerçeveli ve ikinci bir çerçeve düğmeyi aşağı iterdi. */
  barBlock: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
    paddingBottom: theme.space.lg,
    textAlign: 'center',
  },
  checkoutEnabled: { backgroundColor: theme.colors.olive },
  checkoutDisabled: { backgroundColor: theme.colors['disabled-fill'] },
  checkoutLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['step-sm'],
    color: theme.colors.card,
  },
  checkoutTotal: {
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['scrim-soft'],
  },
  couponForm: { gap: theme.space.xl },
}));
