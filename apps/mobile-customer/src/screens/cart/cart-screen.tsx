import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { MeCartViewLine } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { Fragment, useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { SectionHeader } from '@/components/ui/section-header';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
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
  setPurchasePlace,
  useCart,
} from '@/screens/customer-kit/cart-store';
import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';
import { discountSummaryOf } from '@/screens/customer-kit/discount-label';
import { addressLine } from '@lezzet/address';
import { AddressPickerSheet } from '@/screens/customer-kit/address-picker-sheet';
import { addressDefaultsOf } from '@/screens/customer-kit/address-form';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { selectDeliveryAddress, useSelectedDeliveryAddress } from '@/screens/customer-kit/delivery-address-store';
import { PostalCodeSheet } from '@/screens/customer-kit/postal-code-sheet';
import { useAddresses } from '@/screens/customer-kit/use-addresses.hook';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { CartLineRow } from './cart-line-row';
import { CartSkeleton } from './cart-skeleton';
import messages from '@lezzet/i18n/customer/cart';

/*
  Sepet: ekran hesap yapmaz, çizer; ara toplam, indirim, toplam, asgari sepet ve tükendi hâli sunucunun çözdüğü görünümden okunur,
  çünkü sepetteki fiyat bağlayıcı değildir ve iki yüzeyde iki hesap bir gün iki tutar gösterirdi. Grubu sözleşme söyler (`local`,
  `shipping`, `undeliverable`), gelemeyen kalem sepette işaretli bekler ve silinmez, çünkü bölge içi bir adres eklenirse yine lazım olur.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Ürünler üstte, paketler altta, ama yalnız grup içinde: teslimat grubunun sırası daha üst bir bilgidir. Sıralama kararlıdır, iki
 * ürün ya da iki paket arasında sunucunun verdiği sıra korunur.
 */
function productsFirst(lines: readonly MeCartViewLine[]): MeCartViewLine[] {
  return [...lines].sort((a, b) => Number(a.kind === 'bundle') - Number(b.kind === 'bundle'));
}

/** Salt okunur satırın yeri: uygulamadan yazılamayan bir satır türü doğarsa burada ayrılır; bugün hiçbiri salt okunur değil. */
function isReadOnly(_line: MeCartViewLine): boolean {
  return false;
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

  /* Sepetin yeri kayıtlı adrestir: satın alma tarafının tamamı (sepet ve checkout) adresle çözülür, gezinme kodu vitrinde kalır,
     böylece iki yer ayrışamaz; adresi olmayanda gezinme koduna düşülür. `me`, adres çekmecesi yeni adresi hesabın künyesiyle dolu
     açsın diye okunur. */
  const { status: meStatus, me } = useMe();
  const { addresses, publish: publishAddresses } = useAddresses(meStatus === 'ready');
  /* Seçim ORTAK depoda (`delivery-address-store`): sepette seçilen adres checkout'ta da geçerli.
     `null` = müşteri seçmedi, varsayılan geçerli — kimliğini burada saklamıyoruz (künye orada). */
  const selectedAddressId = useSelectedDeliveryAddress();
  const deliveryAddress =
    addresses.find((a) => a.id === selectedAddressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  /* Görünüm tek ve yeri adresten gelir: yer depoya bildirilir, görünüm tek yerde çözülür; ikinci bir okuma yazma turlarıyla
     tazelenmediği için ekranı dondururdu. */
  useEffect(() => {
    setPurchasePlace(deliveryAddress?.postalCode ?? null);
  }, [deliveryAddress?.postalCode]);
  const view = cart.view;
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

  /* Paket de sunucunun satırıdır: ad, fiyat ve yol ile çözülür, ayrı bir yerel blok gerekmez. */
  const lines = view.lines;

  /* Grup sözleşmeden okunur, yoldan türetilmez. Sıra tasarımın sırası: önce gelenler, sonra kargoyla gelenler, en sonda bu adrese
     gelemeyenler. */
  const localLines = productsFirst(lines.filter((line) => line.group === 'local'));
  const shippingLines = productsFirst(lines.filter((line) => line.group === 'shipping'));
  const undeliverableLines = productsFirst(lines.filter((line) => line.group === 'undeliverable'));
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
  /* Düğmeyi gelemeyen kalem kapatmaz, müşteri gelebilecekleri sipariş eder. Kapatan üç hâl: görünüm çözülemedi, satılamaz kalem var
     (`hasBlocked`) ve asgari sepet tutmuyor. */
  const checkoutBlocked = unresolved || view.hasBlocked || !view.minBasketOk;

  /*
    Kilitli düğmenin kısa gerekçesi: satılamayan kalem asgari sepetten önce söylenir, çünkü kalem çıkarılınca tutar da değişir (sıra
    sunucunun `cartBlockReason`ındakiyle aynı). Sepet çözülemediyse susar, çünkü ortada engel değil bilinmezlik vardır.
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
  /* Toplam sepette duran her şeyi sayar ama gelemeyen kalem siparişe girmez; kapsam belirsiz kalmasın diye o tutar ayrı satırda
     yazılır ve sunucudan olduğu gibi gelir. */
  const undeliverableCents = view.undeliverableSubtotalCents;
  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(view.subtotalCents, locale) },
    ...(discountSummary === null ? [] : [discountSummary]),
    ...(undeliverableCents === 0
      ? []
      : [{ key: 'undeliverable', label: t.summary.undeliverable, value: formatPrice(undeliverableCents, locale) }]),
  ];
  /* Üç katmanlı açıklama (kural, kazanan, elinin altındaki): motor adayları hesaplayıp kazananı seçer ve kaybedenleri atar, müşteri
     de hangi kampanyaların yarıştığını ve birinin bir adım ötede olduğunu buradan öğrenir. */
  const singleRuleNote = discountSummary === null ? null : t.summary.singleRule;
  const reachable = view.reachableDiscount;
  const reachableNote =
    reachable === null
      ? null
      : (reachable.label === null ? t.summary.reachableAnon : t.summary.reachable.replace('{label}', reachable.label))
          .replace('{missing}', formatPrice(reachable.missingCents, locale))
          .replace('{amount}', formatPrice(reachable.projectedCents, locale));

  /* Kural cümlesi özetin DİP NOTUNA giriyor, ayrı bir kutuya değil: indirim satırının hemen
     altında duruyor ve "neden tek indirim" sorusunu sorulduğu yerde cevaplıyor. Ayrı bir Note
     olsaydı sepette dördüncü bir kutu açardı ve bir kuralı duyuru gibi okuturdu. */
  const summaryNote = [t.summary.note, undeliverableCents === 0 ? null : t.summary.undeliverableNote, singleRuleNote]
    .filter((line): line is string => line !== null)
    .join(' ');

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

    /* Adı olmayan satıra ad verilir: sunucu çözemediği kalemi boş adla döndürür ve adsız bir kutu müşteriye neyi çıkaracağını
       söylemez. */
    const shownName = line.name === '' ? t.line.unknown : line.name;

    return (
      <CartLineRow
        key={id}
        name={shownName}
        subtitle={subtitle}
        totalLabel={line.lineTotalCents === null ? t.line.noPrice : formatPrice(line.lineTotalCents, locale)}
        quantity={line.qty}
        image={line.image}
        tone={bundle ? 'bundle' : 'product'}
        eyebrow={bundle ? t.line.bundle : undefined}
        discountLabel={line.wasCents === undefined ? undefined : t.line.discounted}
        soldOutLabel={line.blocked ? (line.unitPriceCents === null ? t.line.closed : t.line.soldOut) : undefined}
        // Satır künyesi: kalem sepette DURUYOR, yalnız bu adrese gelmiyor. Cümle "kaldırın" demez.
        awayLabel={line.group === 'undeliverable' ? t.line.undeliverable : undefined}
        noticeLabel={notice}
        readOnly={isReadOnly(line)}
        removeLabel={t.line.remove}
        removeAccessibilityLabel={t.line.removeLabel.replace('{name}', shownName)}
        decreaseLabel={t.line.decrease.replace('{name}', shownName)}
        increaseLabel={t.line.increase.replace('{name}', shownName)}
        /* PAKET KENDİ KAPISINDAN geçer: `id` paket satırında `bundleId`dir ve ürün kapısına
           verilseydi `locate` onu bir VARYANT kimliği sanardı (ikisi de çıplak uuid) — sunucu
           eşleşme bulamaz, istek 200 döner, hiçbir şey olmazdı. */
        onDecrease={() => (bundle ? setBundleQuantity(id, line.qty - 1) : setProductQuantity(id, line.qty - 1))}
        onIncrease={() => (bundle ? setBundleQuantity(id, line.qty + 1) : setProductQuantity(id, line.qty + 1))}
        onRemove={() => (bundle ? removeBundle(id) : removeProduct(id))}
        testID={`cart-line-${id}`}
      />
    );
  };

  /* İki grup iki sipariştir ve ikincisi zorunlu değil: bölünme bir seçim değil stokun sonucudur. Grup toplamlarına indirim yazılmaz,
     çünkü kupon ve kampanya checkout'ta siparişin kendi kalemlerine göre yeniden çözülür; kargo ücreti sunucudan gelir. */
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

  /* Ücretsiz kargo eşiği yalnız kargo grubu varken anlamlıdır; eşik 0 tanımsız demektir ve bölünmüş sepette aynı bilgi kargo
     grubunun kartında zaten yazılı olduğu için blok çizilmez. */
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
   * Kargo grubunun kendi eylemi, ikincil ağırlıkta: asıl akış kapıya gidendir. Asgari sepet bu gruba işlemez, çünkü kargo siparişi
   * ayrı bir sipariştir; satılamaz kalem ise sepetin tamamını durdurur.
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
        {/* Teslimat adresi sepetin neye göre değerlendirildiğini söyler; posta kodu düzenleyicisi sepette yok, çünkü iki ayrı yer
            tutmak kapattığımız ayrışmayı geri açardı. */}
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
              /* Ekran terk edilmez: adres seçici burada açılır, checkout'un aynı işi. */
              onPress={() => setPickerOpen(true)}
              testID="cart-place-address"
            />
          </View>
        )}

        {/* Gelemeyen kalemlerin tek uyarısı satırların üstünde ve `warm` tonda, çünkü bu bir hata değil adresin gerçeği; çıkış yolu
            bölge içi bir adres, "ürünü kaldırın" yazılmaz. */}
        {undeliverableLines.length === 0 ? null : (
          /* Kodu değiştirme kutunun içinde, bandın parçası olarak; uygulamada sepet tam ekran olduğu için kod burada değiştirilir ve
             kitteki kanonik çekmece açılır, üçüncü bir posta kodu girdisi yazılmaz. */
          <Note
            tone="warm"
            title={t.undeliverable.title.replace('{place}', placeLabel)}
            description={t.undeliverable.body.replace('{place}', placeLabel)}
            /* Eylem yalnız adresi olmayanda, çünkü adres varken üstteki künyenin "Değiştir"iyle aynı yere açan ikinci düğme olurdu. */
            action={
              deliveryAddress !== null ? undefined : (
                <TextAction label={t.undeliverable.change} onPress={() => setCodeSheetOpen(true)} testID="cart-change-code" />
              )
            }
            testID="cart-undeliverable"
          />
        )}

        <View style={styles.lines}>
          {/* Grubun eylemi kendi kalemlerinin hemen ardında, çünkü "kargolu ürünleri ayrıca sipariş ver" düğmesi hangi ürünlerden
              bahsettiği görünürken anlam taşır. */}
          {groups.map((group) => (
            <Fragment key={group.key}>
              {showGroupHeadings ? <SectionHeader eyebrow={group.eyebrow} testID={`cart-group-${group.key}`} /> : null}
              {group.lines.map(renderLine)}
              {group.key === 'local' ? routeSummary : null}
              {group.key === 'shipping' ? shippingAction : null}
            </Fragment>
          ))}
        </View>

        {/* Çözülmemiş sepette satırların iskeleti bekler, sayısı tahmin değil (sepet cihazda yaşar); okuma düşerse iskelet yerine tek
            satırlık ret durur. */}
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

        {/* ELİNİN ALTINDAKİ İNDİRİM — `olive`, çünkü bu bir kazanç davetidir, bir uyarı değil;
            ücretsiz kargo eşiğinin cümlesiyle aynı aile. Sunucu yalnız KAZANILABİLİR olanı
            gönderiyor: eşiğe varmak bugünkü indirimi büyütmüyorsa alan `null` gelir ve burası
            hiç çizilmez (boş vaat yerine sessizlik — sözleşme künyesi). */}
        {reachableNote === null ? null : (
          <Note tone="olive" description={reachableNote} testID="cart-discount-reachable" />
        )}

        <SummaryPanel
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(view.totalCents, locale)}
          note={summaryNote}
          testID="cart-summary"
        />

        {/* Sunucu reddinde iyimser yazım geri alındı, ekrandaki sepet sunucudakidir; geliştirmede ret anahtarı da yazılır, çünkü tek
            cümle `unauthorized` ile `invalid_response`u ayırmaz. */}
        {cart.error === null ? null : (
          <Note
            tone="terracotta"
            description={__DEV__ ? `${t.sync.failed} [${cart.error}]` : t.sync.failed}
            testID="cart-sync-error"
          />
        )}

        {view.hasBlocked ? <Note tone="error" description={t.blocked} testID="cart-blocked" /> : null}

        {/* Dipteki uyarı eksik tutarı tekrar etmez: bar eksiği (`{missing}`), burası eşiği (`{minimum}`) ve ne yapılacağını
            söyler. */}
        {view.minBasketOk || unresolved ? null : (
          <Note
            tone="terracotta"
            description={t.minimum.replace('{minimum}', formatPrice(view.minBasketCents, locale))}
            testID="cart-minimum"
          />
        )}

        <View style={styles.continueRow}>
          <TextAction label={t.continue} onPress={() => router.push('/catalog')} testID="cart-continue" />
        </View>
      </ScrollView>

      {/* Yapışkan bar kaydırma alanının DIŞINDA (RN'de `position: sticky` yok — kitin kendi kalıbı). */}
      <View style={styles.stickyBar}>
        {/* Engelin sebebi düğmenin yanında, çünkü uzun sepette dipteki açıklama ekranın çok altında kalır; sebep `cartBlockReason`dan
            gelir, dipteki uzun açıklama "ne yapmalıyım"ı anlatır. */}
        {barBlockText === null ? null : (
          <Text style={styles.barBlock} testID="cart-bar-block">
            {barBlockText}
          </Text>
        )}
        {/* Sepetin tamamı kargodaysa düğme kargo siparişini açar, yoksa sepet "kargoyla gönderilir" derken açılan sipariş kapıya
            teslim siparişi olurdu; bayrak türetilmez, rotadan gelir. */}
        <PressableSurface
          onPress={() => router.push(view.shippingOnly ? '/checkout?group=shipping' : '/checkout')}
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

      {/* Adres seçici ekranı terk etmeden açılır; seçim ortak depoya yazılır, checkout da aynı adresi okur. */}
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
        /* Yeni adres hesabın künyesiyle dolu açılır. */
        defaults={addressDefaultsOf(me)}
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
