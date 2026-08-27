import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PaymentMethod } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@/components/ui/back-button';
import { Chip } from '@/components/ui/chip';
import { FormScroll } from '@/components/ui/form-scroll';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import { declineNeighborInvite } from '@/lib/invite/invite-api';
import { TextField } from '@/components/ui/text-field';
import type { MeAddress } from '@/lib/api/addresses';
import { placeCheckoutOrder } from '@/lib/api/checkout';
import { updateMe, type Me } from '@/lib/api/me';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';
import { hapticError, hapticSuccess } from '@/lib/haptics/haptics';
import { presentPayment } from '@/lib/payment/payment-sheet';
import { addressLine } from '@/screens/customer-kit/address-format';
import { addressDefaultsOf } from '@/screens/customer-kit/address-form';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { cartLineId, refreshCart, setPurchasePlace, useCart } from '@/screens/customer-kit/cart-store';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { selectDeliveryAddress, useSelectedDeliveryAddress } from '@/screens/customer-kit/delivery-address-store';
import { discountSummaryOf, orderDiscountSummaryOf } from '@/screens/customer-kit/discount-label';
import { OptionRow } from '@/screens/customer-kit/option-row';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { publishMe, useMe } from '@/screens/customer-kit/use-me.hook';
import { formatDeliveryDate } from '@/screens/orders/order-format';
import { isNameMissing, isPhoneMissing } from '@/screens/customer-kit/profile-gaps';
import { newOrderKey } from './order-key';
import { deliveryLabelOf, paymentFailureMessage, rejectionMessage } from './order-result-copy';
import { CheckoutSkeleton } from './checkout-skeleton';
import { useCheckout } from './use-checkout.hook';
import messages from './messages.json';

/*
  SİPARİŞİ TAMAMLA (v3 `vCheckout`) — adres · teslimat ve günü · ödeme yolu · özet · onay.

  ── EKRAN SEÇER, SUNUCU KARAR VERİR (21.14 ikinci etap) ─────────────────────
  Ekran artık GERÇEK sipariş veriyor. Uygun günler, açık ödeme yolları, kargo ücreti ve toplam
  `GET /me/checkout`ten gelir (`use-checkout.hook`); ekran kendi listesini UYDURMAZ ve gönderdiği
  tek şey SEÇİMLERDİR (`POST /me/checkout/order`) — tutar, indirim ve kalem listesi gövdede YOKTUR
  (sözleşme künyesi: aksi hâlde siparişin parasını uygulama belirlerdi).

  Yerleşim v3'ün kendisi; değişen yalnız verinin kaynağıdır. Fixture (`checkout-fixture.ts`)
  SİLİNDİ: sahte adresler, uydurma saat aralıklı teslimat günleri ("Yarın 09:00–13:00" — veri
  modelinde saat YOK) ve sabit kargo ücreti ekranın gerçekle ayrıştığı üç yerdi.

  ── TESLİMAT YOLU BİR SEÇİM DEĞİL, ADRESİN CEVABIDIR ────────────────────────
  `deliveryType` sunucuda çözülür (rota-içi ⟷ kargo). İki satır yine çiziliyor çünkü tasarım öyle
  ve öğretici: hangi yolun geçerli olduğunu ve ötekinin NEDEN geçerli olmadığını yan yana söylüyor.
  Ama dokunuş yolu değiştirmez — değiştirseydi ekranın gösterdiği ile siparişin açıldığı yol
  ayrışırdı (müşteri kapıda ödeme seçer, kasada reddedilirdi).

  ── ADRES BURADA YAZILIR, EKRAN TERK EDİLMEZ (10.08) ────────────────────────
  "＋ Yeni adres ekle" eskiden müşteriyi profil sayfasına atıyordu: sipariş akışının ortasında
  başka bir ekrana gitmek, checkout'tan çıkmaktır. Artık kitin ORTAK adres çekmecesi burada
  açılıyor (`customer-kit/address-sheet` — hesap ekranıyla aynı dosya, aynı doğrulama, aynı BAN
  önerileri) ve yazılan adres seçili hâle gelip anlık görüntüyü tazeliyor.

  ── ENGELLER TEK YERDE (`blockReason`) ──────────────────────────────────────
  Şablonun `confirmBlock`u ile aynı sıra, sunucunun gerçekleriyle genişletilmiş: doğrulama →
  adres → tazeleme → kargo engeli → asgari sepet → gün → ödeme. Sebep düğmenin ÜSTÜNDE yazılı ve
  düğme engelli: kuralı basmadan önce göstermek, kullanıcıyı denemeye zorlamaktan iyi.

  ── GELEMEYEN KALEM ENGEL DEĞİL, KAPSAM SORUSUDUR (kullanıcı kararı 10.08) ──
  Bu adrese hiç gelemeyen kalem (soğuk zincir + rota dışı adres) siparişin DIŞINDA kalır ve sepette
  bekler; sipariş gelebilecek kalemlerle açılır (`orderableLines`, `@lezzet/application`). Ekranın
  üç sonucu: kırmızı engel kutusu bilgi satırına indi, özet yalnız siparişe gireni yazar, onay
  düğmesi AÇIK kalır. Adres değişince anlık görüntü zaten tazeleniyor — bölge içi bir adres
  seçildiğinde o kalemler kendiliğinden siparişe girer, ayrıca kodlanmadı.

  ── RETLER TEK CÜMLEYE İNDİRGENMEZ ──────────────────────────────────────────
  On beş adlı ret ayrı ayrı karşılanıyor (`order-result-copy.ts`); her ret sonrası anlık görüntü
  TAZELENİR, çünkü ret çoğu zaman "ekrandaki resim eskidi" demektir.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Ödeme satırı — v3'ün `payOpts()`u; web checkout'unun kurduğu kümenin AYNISI (tek karar iki yüzey). */
interface PaymentOption {
  /** Satır anahtarı: `bank_transfer` iki kez geçer (peşin havale ⟷ vadeli), yöntem anahtar olamaz. */
  key: string;
  method: PaymentMethod;
  /** Vadeli ("hesaba") — ödeme YÖNTEMİ değil, siparişin bayrağı (enum künyesi). */
  onAccount: boolean;
  label: string;
  body: string;
  available: boolean;
}

interface CheckoutScreenProps {
  /**
   * Bölünmüş sepetin KARGO yarısı için ayrı sipariş (19.15). Bayrak TÜRETİLMEZ, rotadan gelir.
   *
   * Sepet ekranı yolu İKİ yerden açıyor: bölünmüş sepette kargo grubunun kendi düğmesi, salt-kargo
   * sepette ise yapışkan barın kendisi (`view.shippingOnly`, 27.08). Varsayılan `false` çünkü
   * parametresiz açılan checkout rota siparişidir.
   */
  shippingOrder?: boolean;
}

export function CheckoutScreen({ shippingOrder = false }: CheckoutScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  const cart = useCart();
  const { status: meStatus, me, refresh: refreshMe } = useMe();
  /**
   * Doğrulanmış müşteri — YALNIZ `ready` hâlinde dolu.
   *
   * `null` olmasının ÜÇ ayrı sebebi var ve bunlar aynı şey DEĞİL: misafir (`guest` — cevap),
   * okunamadı (`error` — cevapsızlık), henüz okunmadı (`loading` — sorulmamış soru). Ekran üçünü
   * ayrı karşılar; eskiden hepsi "misafir" sayılıyordu ve arıza buydu (aşağıdaki blok künyesi).
   */
  const customer = meStatus === 'ready' ? me : null;

  /** Seçili adres; `null` = "sunucu karar versin" (varsayılan, yoksa ilk adres — uç künyesi). */
  /* ADRES SEÇİMİ ORTAK DEPODA (kullanıcı kararı 10.08) — ekran içi `useState` DEĞİL. Sepet de aynı
     adresi okuyor ve orada da değiştirilebiliyor; iki ekran ayrı state tutsaydı sepette seçilen
     adres checkout'a taşınmaz ve az önce kapatılan ayrışma (sepette bir gerçek, burada başka) geri
     açılırdı. `null` = müşteri seçmedi, varsayılan geçerli (deponun künyesi). */
  const addressId = useSelectedDeliveryAddress();
  const setAddressId = selectDeliveryAddress;
  /** Adres çekmecesi — kitin ortak formu, hesap ekranıyla AYNI (10.08). Kapalıyken `null`. */
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Sunucunun ya da ödeme kartının söylediği son şey. `warm` = hata değil (vazgeçilen ödeme). */
  const [notice, setNotice] = useState<{ tone: 'error' | 'warm'; text: string } | null>(null);

  /* ── İLETİŞİM KÜNYESİ: AD + TELEFON, İLK SİPARİŞTE (kullanıcı kararı 15.08) ──────────────────
     Bu alanlar eskiden GİRİŞTEN hemen sonra zorunlu bir akışta isteniyordu (`/profile-setup`;
     üç kapı: OTP dönüşü, OAuth dönüşü, sepete giriş). Kullanıcının kararı ikisini de değiştirdi:
     *"kullanıcı adresini ve adını vermek istemeyebilir giriş yaptığında, bu bizim için problem
     olmamalı"* ve *"bunu ilk sipariş verdiği zaman talep edelim… sizinle iletişime geçebilmek için
     telefon numaranıza ihtiyacımız var gibi bir şey diyerekten konuyu açalım."*

     Gerekçe ürünün kendisinde: kimliğini yeni kuran kişiden, ona daha hiçbir şey vermeden künye
     istemek bir bedeldir; siparişin içinde ise aynı bilgi ANLAMLIDIR ve karşılığı görünür — kurye
     kapıya gelecek, bildirim gidecek. Metin bunu söylüyor, alanı gerekçesiz istemiyor.

     ALANLAR SEPETTE DEĞİL BURADA: sepet gezinmenin parçası (bakıp vazgeçilebilir), ödeme ekranı
     ise "siparişi tamamlıyorum" anı — adres, gün ve ödeme de burada seçiliyor.

     Yazım AYRI bir adım (kendi düğmesi), sipariş gönderimine iliştirilmedi: `updateMe`nin adlı
     retleri var (`phone_invalid`) ve bunlar siparişin değil künyenin sorunudur.
     Tek çağrıda birleştirilseydi geçersiz bir telefon "siparişiniz açılamadı" diye görünürdü. */
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  /* TEKRAR ANAHTARI EKRAN AÇILIŞINDA BİR KEZ (`useState`in tembel başlatıcısı): seçimler değişse
     de KORUNUR — çift dokunuş ve ağın yeniden denemesi aynı niyettir. Başarıdan sonra ekran
     `replace` ile kapanır ve bir sonraki açılış yeni anahtar üretir; sepete dönüp değiştiren
     müşteride de ekran sökülür. Gerekçenin tamamı `order-key.ts`te. */
  const [orderKey] = useState(newOrderKey);

  const checkout = useCheckout(locale, addressId, cart.couponCode, shippingOrder);
  const snapshot = checkout.snapshot;
  const addresses = snapshot?.addresses ?? [];
  const delivery = snapshot?.delivery ?? null;
  const payment = snapshot?.payment ?? null;

  /* Seçili adres SUNUCUYLA AYNI kuralla çözülür (varsayılan → ilk): ekranda işaretli satır ile
     ücreti hesaplanan adres ancak böyle aynı olur. Ekran açılışta bir seçim YAZMAZ — yazsaydı
     kullanıcının yapmadığı bir seçim, cevabın gecikmesine bağlı olarak doğardı. */
  const selectedAddress = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  /**
   * Çekmece bir adres yazdı (ekleme · düzenleme · silme). İKİ ŞEY birden olmalı: yazılan adres
   * SEÇİLİ hâle gelir ve anlık görüntü ONUNLA yeniden okunur — teslimat günleri, kargo ücreti ve
   * ödeme yolları adrese bağlıdır; eski cevapla devam etmek ekranı kendi kendisiyle çelişkiye
   * düşürürdü (müşteri kapıda ödeme görür, sunucu reddederdi).
   *
   * Okuma TEK turda yapılır: `addressId` değişimi hook'un bağımlılığıdır ve zaten yeniden okutur;
   * seçim değişmiyorsa (aynı adres düzenlendi ya da bir adres silindi) tazeleme AÇIKÇA istenir.
   * Silinen adres seçiliyse seçim bırakılır — kararı yine sunucu verir (varsayılan → ilk).
   */
  const applyAddressWrite = (list: MeAddress[], savedId: string | null): void => {
    const next = savedId ?? (addressId !== null && list.some((a) => a.id === addressId) ? addressId : null);
    if (next === addressId) checkout.reload();
    else setAddressId(next);
  };

  const isRoute = delivery?.deliveryType === 'route';
  const dates = delivery?.availableDates ?? [];

  /* KOMŞU DAVETİ (21.45) — kabul edilmiş ve seferi hâlâ açık bir davet varsa sunucu buraya koyar.
     Alan cihazdan değil KİŞİDEN geliyor: davetli web'de kabul edip uygulamayı sonra yüklemiş
     olabilir (kullanıcı kararı 12.08). Süzgeç de sunucuda — gün `availableDates` içinde değilse
     alan zaten `null`, yani ekran seçilemeyen bir günü hiç görmüyor. */
  const neighborInvites = delivery?.neighborInvites ?? [];

  /* SEÇİLEN GÜN TÜRETİLİR, saklanan değer körü körüne kullanılmaz: adres değişince eski gün artık
     uygun günlerden biri olmayabilir. Tek gün varsa seçim SUNULMAZ, o gün kullanılır
     (`requiresDateChoice` — sözleşmenin hükmü: seçeneksiz bir seçim sahte karardır).

     DAVETİN GÜNÜ ÖNSEÇİLİ ama KİLİTLİ DEĞİL: müşteri henüz bir gün seçmediyse komşusunun günü
     gelir; dokunduğu an kendi seçimi geçerlidir. Davet bir ÇAĞRIDIR — seçimi elinden almak,
     "komşunla aynı gün" kolaylığını bir kısıtlamaya çevirirdi. Sıra da bu yüzden böyle: müşterinin
     kendi seçimi (`deliveryDate`) her zaman önce sorulur. */
  /* Önseçim EN YAKIN davetli gündür: liste sunucudan gün sırasında geliyor (sözleşme künyesi),
     yani baştaki. Ötekiler kaybolmuyor — her biri kendi satırıyla aşağıda duruyor. */
  const firstInvitedDate = neighborInvites.find((invite) => dates.includes(invite.deliveryDate))?.deliveryDate ?? null;
  const chosenDate =
    deliveryDate !== null && dates.includes(deliveryDate)
      ? deliveryDate
      : firstInvitedDate !== null
        ? firstInvitedDate
        : delivery !== null && !delivery.requiresDateChoice
          ? (dates[0] ?? null)
          : null;

  const methods = payment?.methods ?? [];
  const codBlockedReason = payment?.codBlockedReason ?? null;
  const paymentOptions: PaymentOption[] = [
    // `online` = Stripe yolu (peşin, yerel ödeme kartı). `cash` KAPIDA ödemedir; müşteri burada
    // "kapıda öderim" der, hangi aracı kullandığını (nakit/kart/çek) kurye kapanışta yazar.
    {
      key: 'online',
      method: 'online',
      onAccount: false,
      label: t.payment.online,
      body: t.payment.onlineBody,
      available: methods.includes('online'),
    },
    {
      key: 'cod',
      method: 'cash',
      onAccount: false,
      label: t.payment.onDelivery,
      // Kapalı yöntemin SEBEBİ yazılır: "kapıda ödeme yok" ile "bu tutarda sunulamıyor" farklı
      // cümlelerdir ve ikincisinde müşteri sepetini küçültüp yöntemi açabilir (sözleşme künyesi).
      body: codBlockedReason === null ? t.payment.onDeliveryBody : t.payment.codBlocked[codBlockedReason],
      available: methods.includes('cash') && codBlockedReason === null,
    },
  ];
  if (methods.includes('bank_transfer')) {
    paymentOptions.push({
      key: 'transfer',
      method: 'bank_transfer',
      onAccount: false,
      label: t.payment.transfer,
      body: t.payment.transferBody,
      available: true,
    });
  }
  // Vadeli YALNIZ açıksa çizilir (web'in aynı kararı): kapalıyken göstermek, B2C müşteriye
  // anlamı olmayan bir kapı açardı.
  if (payment?.creditAvailable === true) {
    paymentOptions.push({
      key: 'credit',
      method: 'bank_transfer',
      onAccount: true,
      label: t.payment.credit,
      body: t.payment.creditBody,
      available: true,
    });
  }
  /** Seçim de türetilir: adres değişip yöntem kapanınca seçili kalması "kapalıyı seçtim" olurdu. */
  const selectedPayment = paymentOptions.find((option) => option.key === paymentKey && option.available) ?? null;

  /* ── SEPET GÖRÜNÜMÜ (özet + küçük resimler) ───────────────────────────────
     Kaynak SUNUCUNUN çözdüğü görünüm — PAKET DAHİL (20.08). Buradaki yerel süzgeç, sunucunun
     paketi çözemediği döneme aitti: yerel kayıt çiziliyor, sunucunun adsız satırı eleniyordu.
     Paket sunucuya bağlanınca gerekçe düştü ve süzgeç KALKTI — kalsaydı bu kez paket satırı
     özetten hiç çizilmez, üstelik toplama giren satırla listelenen satır ayrışırdı. */
  /* SEPET ADRESLE ÇÖZÜLÜR (kullanıcı kararı 10.08) — ama yer artık DEPOYA bildiriliyor, ekrana
     ikinci bir okuma eklenerek değil (künye: `cart-store` → `purchasePostalCode`, 20.08). İkinci
     okuma yazma turlarını duymuyordu ve ekranı dondurmuştu. Adres henüz bilinmiyorsa depo gezinme
     koduna düşer; ekranı boş bırakmaktansa bir adım eski bir doğru. */
  useEffect(() => {
    setPurchasePlace(selectedAddress?.postalCode ?? null);
  }, [selectedAddress?.postalCode]);
  const view = cart.view;
  const viewLines = view.lines;

  /* ── BU SİPARİŞİN KAPSAMI (kullanıcı kararı 10.08) ────────────────────────
     Bu adrese hiç gelemeyen kalem siparişe GİRMEZ ama sepetten de silinmez; sunucu onu kapsam
     dışında bırakıp siparişi açıyor (`orderableLines`, `@lezzet/application`).

     GRUP ARTIK ADRESİN CEVABI (`addressView`) — eski iki koşullu süzgeç SÖKÜLDÜ ve sebebi ölçüldü
     (10.08, cihazda): grup gezinme koduyla çözülüyordu, kod rota İÇİ olduğu an hiçbir satır
     `undeliverable` olmuyor ve süzgeç hiçbir şey düşürmüyordu. Sepet 67000 ile kurulup adres 67380
     seçilince özet dört kalemi de yazıyordu (76,95 €) — ekranın kendi uyarısı aynı anda "bu
     kalemler siparişe eklenmiyor" derken. Tek kaynak, tek cevap: satırın grubu.

     Kalem GİZLENMEZ, üstü çizilir (kullanıcı kararı 10.08): özetten sessizce çıkan kalem,
     müşteriye "herhâlde bunları alıyorum" dedirtiyordu — uyarı özetten uzakta, adresin yanındaydı
     ve uyarı gibi okunmuyordu. Artık kararın kendisi özetin İÇİNDE yazılı. */
  const droppedLines = viewLines.filter((line) => line.group === 'undeliverable');
  const orderedLines = viewLines.filter((line) => line.group !== 'undeliverable');

  /**
   * Özetin ara toplamı — SİPARİŞE GİREN kalemlerin toplamı.
   *
   * İki sunucu sayısının farkı; ekranın kendi aritmetiği DEĞİL: matrahı sunucu da tam olarak böyle
   * kuruyor (`subtotalCents − undeliverableSubtotalCents`, asgari sepet eşiğinin girdisi) ve
   * sözleşme bu alanı zaten "ekran yazabilir" diye taşıyor. Ham çıkarma yerine listelenen satırları
   * toplasaydık, fiyatı çözülememiş bir satır (`lineTotalCents: null`) sessizce sıfır sayılırdı.
   */
  const orderedSubtotalCents = view.subtotalCents - view.undeliverableSubtotalCents;

  /*
    ── DÖKÜM VE TOPLAM AYNI OKUMADAN (kullanıcı kararı 21.08) ──────────────────
    Buradaki kural TEK CÜMLE: **özet varsa hem satırlar hem toplam ondan gelir; yoksa ikisi de
    yerel sepetten. Asla karışık.**

    Karışıktı ve cihazda ölçüldü (21.08): satırlar `view`den, toplam `payment`ten geliyordu. Sepet
    SUNUCUDA yaşayıp iki yüzeyde paylaşıldığı için ikisi ayrışabiliyor — ekran `2× kek + 8× börek`
    listelerken genel toplam `16,00 €` yazdı (börek o sırada sunucudaki sepetten çıkmıştı). Kalemler
    63,47 € topluyordu; hangisinin doğru olduğunu söyleyen hiçbir şey yoktu. Doğru olan TOPLAMDI —
    bayat olan listeydi, ve asgari sepet uyarısı da doğru sayıya göre çıkıp müşteriye anlamsız
    görünüyordu ("63 €'luk listeye bakıyorum, neden 24 € daha isteniyor?").

    Adres SEÇİLMEDEN özet yoktur (sunucu kapsamı çözemez) ve o hâlde yerel sepete düşmek DOĞRUdur:
    ekran "sepetin şu, şimdi adres seç" der. Yanlış olan tek şey ikisini aynı anda karıştırmaktı.
  */
  const summary = snapshot?.summary ?? null;
  const summaryLines: { key: string; name: string; qty: number; lineTotalCents: number | null }[] =
    summary === null
      ? orderedLines.map((line) => ({ key: cartLineId(line), name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.lines.map((line, index) => ({ key: `order-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));
  /* Sipariş DIŞI kalanlar da aynı kaynaktan — özetin yarısını yerelden çizmek, düzeltilen
     ayrışmayı yarı yolda bırakmaktı. */
  const droppedRows: { key: string; name: string; qty: number; lineTotalCents: number | null }[] =
    summary === null
      ? droppedLines.map((line) => ({ key: `dropped-${cartLineId(line)}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.excludedLines.map((line, index) => ({ key: `dropped-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));

  /* Hangi kalemler olduğu SÖYLENİR ama ancak biliniyorsa: sepet görünümü başka bir posta koduyla
     çözülmüşse elimizde ad yoktur ve uydurulmuş bir liste, yanlış ürünü aratırdı. */
  const undeliverableText =
    droppedRows.length === 0
      ? t.undeliverable.body
      : `${t.undeliverable.body} ${t.undeliverable.items.replace('{items}', droppedRows.map((line) => line.name).join(', '))}`;

  const shippingFeeLabel =
    payment === null ? t.summary.pending : payment.shippingFeeCents === 0 ? t.summary.free : formatPrice(payment.shippingFeeCents, locale);
  /**
   * Ödenecek TOPLAM sunucunun kararıdır; adres seçilmeden yalnız kalem toplamı bilinir.
   *
   * Anlık görüntü artık siparişin KAPSAMINI matrah alıyor (10.08): `readCheckoutSnapshot` hem
   * kalemleri `orderableLines` ile süzüyor hem eşiği `totalCents − undeliverableSubtotalCents`
   * üzerinden ölçüyor — yani bu sayı taslağın tahsil edeceğiyle aynı kapsamdan çıkıyor. Ekran onu
   * kendi hesaplamaz ve hesaplamamalı: indirim ve kargo ücreti sunucunun kararı, istemci uydurursa
   * kasada kesilenden başka bir sayı gösterir.
   */
  const grandTotalCents = payment?.orderTotalCents ?? view.totalCents;

  /* İndirim de aynı kaynaktan: özet varsa onun çözülmüş indirimi, yoksa sepetinki. `reasonLabel`
     ikisinde de ORTAK (künyesi kitte) — adı olmayan bir kampanya sepette "Kampanya · %8" iken
     özette başka türlü yazamaz. */
  const discountSummary = summary === null ? discountSummaryOf(view.discount, locale) : orderDiscountSummaryOf(summary.discount, locale);

  /* Paket satırı artık `orderedLines`ın içinde (sunucu çözüyor) — ayrı bir yerel blok YOK.
     Vardı ve 20.08'de söküldü: yerelden yazılan satır toplamı ekranın kendi çarpımıydı, oysa
     tahsil edilecek tutarı sunucu hesaplıyor; ikisi bir gün ayrışırdı. */
  const summaryRows: SummaryRow[] = [
    ...summaryLines.map((line) => ({
      key: line.key,
      label: t.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name),
      // Fiyatı olmayan satır SIFIR yazılmaz (CLAUDE §1): satışa kapanmış kalem "bedava" değildir.
      value: line.lineTotalCents === null ? t.summary.noPrice : formatPrice(line.lineTotalCents, locale),
    })),
    /* GELEMEYEN KALEM ÖZETTEN GİZLENMEZ, ÜSTÜ ÇİZİLİR (kullanıcı kararı 10.08).
       Gizlemek "herhâlde bunları alıyorum" dedirtiyordu: karar özetin uzağında, adresin yanında
       duruyor ve bir uyarı gibi okunmuyordu. Artık kalem gözün gittiği yerde, kırmızı ve üstü
       çizili; hemen altında da NEDEN olduğu yazılı. Satırlar ara toplamın ÜSTÜNDE duruyor ki
       "bunlar bu listenin parçasıydı ama düştü" okunsun. */
    ...droppedRows.map((line) => ({
      key: line.key,
      label: t.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name),
      value: line.lineTotalCents === null ? t.summary.noPrice : formatPrice(line.lineTotalCents, locale),
      tone: 'danger' as const,
      strike: true,
    })),
    ...(droppedRows.length === 0
      ? []
      : [{ key: 'undeliverable-note', label: t.summary.undeliverableNote, value: '', tone: 'danger' as const }]),
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(summary?.subtotalCents ?? orderedSubtotalCents, locale) },
    /* İndirimin KÜNYESİ de yazılır, yalnız tutarı değil (kullanıcı kararı 10.08 — web'in aynı
       hükmü): sepette "İndirim · Baklava haftası" okuyan müşteri burada sadece "İndirim" görürse
       aynı indirimden bahsedildiğini ancak sayıları karşılaştırarak anlar. Ad çok dilli bir alandan
       (`discount.public_label`) SUNUCUDA çözülüyor; türetme ise sepetle ORTAK
       (`discountSummaryOf`) — iki ekranın aynı kampanyaya iki ad vermesi imkânsız olsun. */
    ...(discountSummary === null
      ? []
      : [
          {
            key: 'discount',
            label:
              discountSummary.name === null
                ? t.summary.discount
                : `${t.summary.discount} · ${discountSummary.name}`,
            value: `−${formatPrice(discountSummary.amountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]),
    { key: 'delivery', label: t.summary.delivery, value: shippingFeeLabel },
  ];

  // Küçük resimler de siparişin kendisini gösterir: kapsam dışı bir kalemin fotoğrafı, "bunlar
  // geliyor" diye okunurdu.
  /* FOTOĞRAF DA GEÇİLİR (kullanıcı bulgusu 10.08): yuvarlaklar baş harf çiziyordu çünkü `photoUri`
     hiç verilmiyordu — `AvatarThumb` onu zaten destekliyor. Baş harf yedek olarak kalır: fotoğrafı
     olmayan ürün boş bir daire değil, adının ilk harfi olur. */
  const thumbs = [
    ...cart.bundles.map((bundle) => ({ key: `bundle-${bundle.id}`, name: bundle.name, photoUri: bundle.photoUri })),
    ...orderedLines.map((line) => ({ key: cartLineId(line), name: line.name, photoUri: line.image.url })),
  ].slice(0, 4);

  /* YALNIZ EKSİK OLAN ALAN ÇİZİLİR — dolu olanı yeniden sormak, müşteriye zaten verdiği bilgiyi
     tekrar yazdırmaktır. Bu aynı zamanda "mevcut değeri forma doldurma" işini gereksiz kılıyor:
     çizilen alan her zaman boştur. */
  const nameMissing = customer !== null && isNameMissing(customer);
  const phoneMissing = customer !== null && isPhoneMissing(customer);
  const contactMissing = nameMissing || phoneMissing;

  const saveContact = (): void => {
    if (savingContact) return;
    setContactError(null);
    setSavingContact(true);
    void updateMe({
      // Gönderilmeyen alana DOKUNULMAZ (`MeUpdateSchema` künyesi) — dolu olan alanı boşuna yazmayız.
      ...(nameMissing ? { name: contactName.trim() } : {}),
      ...(phoneMissing ? { phone: contactPhone.trim() } : {}),
    }).then((result) => {
      setSavingContact(false);
      if (result.error !== null) {
        // Adlı retler sözleşmede anahtar, cümle burada (`MeUpdateErrorEnum`); tanınmayan anahtar
        // genel cümleye düşer — ekran sunucunun sözlüğünü ezberlemek zorunda değil.
        setContactError(t.contact.errors[result.error as keyof typeof t.contact.errors] ?? t.contact.errors.generic);
        return;
      }
      // Yayınlanan profil `blocked`ı da açar: kapı `customer`ı okuyor, ikinci bir bayrak tutulmuyor.
      publishMe(result.data);
    });
  };

  /** Onayı engelleyen İLK sebep; yoksa `null`. Sıra şablonun sırası, gerçekler sunucunun. */
  const blockReason = (): string | null => {
    if (customer === null) return t.block.login;
    /* İLETİŞİM KÜNYESİ ZORUNLU (kullanıcı kararı 15.08): numara olmadan kurye kapıda ulaşamaz ve
       teslimat bildirimi yalnız e-postadan gider. Engel adres kontrolünden ÖNCE çünkü bölüm de
       ekranın en üstünde — söylenen sıra ile uygulanan sıra aynı olmalı. */
    if (contactMissing) return t.block.contact;
    // Okuma düştüyse onay KAPALI ve sebep açıkça söylenir: "seçenekleriniz güncelleniyor" demek,
    // bitmeyecek bir bekleyiş vaat etmek olurdu (yukarıda ayrıca "yeniden dene" duruyor).
    if (checkout.status === 'error') return t.state.failed;
    // Yükleme/tazeleme boyunca da kapalı: eski ücretle onaylanan sipariş, gösterilenden başka bir
    // tutarla açılırdı.
    if (checkout.status === 'loading' || checkout.refreshing) return t.block.loading;
    if (selectedAddress === null) return t.block.address;
    // Adres var ama teslimat/ödeme dilimi yoksa karar VERİLMEMİŞ demektir; tahmin yürütülmez.
    if (payment === null) return t.block.loading;
    /* GELEMEYEN KALEM ARTIK ONAYI KAPATMAZ (kullanıcı kararı 10.08): sunucu onu siparişin
       kapsamından çıkarıp siparişi açıyor — tek bir soğuk zincir ürünü yüzünden bütün sepeti
       kilitlemek, müşteriyi çıkışsız bırakmaktı. Engel YALNIZ kargo siparişinde gerçek: o sipariş
       soğuk zincir kalemi taşıyamaz ve sunucu onu reddeder (`cold_chain_unshippable`). */
    if (shippingOrder && delivery?.blocked === true) return t.block.shipping;
    if (!payment.minBasketOk) {
      return t.block.minBasket
        .replace('{place}', payment.placeLabel)
        .replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale));
    }
    if (isRoute && chosenDate === null) return t.block.day;
    if (selectedPayment === null) return t.block.payment;
    return null;
  };
  const blocked = blockReason();

  /**
   * Sipariş açıldı: onay ekranına SUNUCUNUN tutarı ve seçilen künyeler taşınır.
   *
   * **SİPARİŞ NUMARASI ARTIK TAŞINIYOR (27.08)** — sözleşme `placed` dalında `referenceNo`
   * döndürüyor ve numara geçişin kendi cevabından geliyor (`transitionOrder`, ek okuma yok).
   * Önceki hâlde cevapta yalnız uuid vardı; uuid'i "sipariş no" diye yazmak müşteriye telefonda
   * okuyamayacağı bir numara vermek olurdu, o yüzden satır hiç çizilmiyordu.
   *
   * **KART YOLUNDA `null` GEÇER ve bu doğru:** numara ilk kalıcı durumda doğar (`confirmed`) ve
   * kart yolunda sipariş ödeme kartı kapandığı an hâlâ TASLAKTIR — onayı webhook yazar, saniyeler
   * sonra. O anda bir numara uydurmak yerine ekran satırı çizmez; müşteri numarayı "Siparişlerim"de
   * görür. Ölçülemeyen değer boş bırakılır (CLAUDE §1).
   *
   * **`orderId` TAŞINIYOR ama gösterilmiyor** (21.45): onay ekranı komşu davetini onunla açıyor
   * (`POST /me/invite/neighbor`). Müşteriye çizilmiyor — uuid onun kullanabileceği bir numara
   * değil; ekranın gerekçesi yukarıda. Yalnız ROTA siparişinde anlamlı, ama süzgeç ekranda değil
   * SUNUCUDA: kargo siparişinde davet zaten açılmıyor ve cevap `null` dönüyor. İki yerde süzmek,
   * "hangi sipariş komşu çağırabilir" kuralının ikinci kopyası olurdu.
   */
  const finish = (
    orderId: string,
    totalCents: number,
    deliveryType: 'route' | 'shipping',
    referenceNo: string | null,
  ): void => {
    /* SEPET YERELDE BOŞALTILMAZ, SUNUCUDAN TAZELENİR (21.29a): sunucu o siparişin kalemlerini
       zaten düşürdü (`placeOrder` → `clearOrderedLines`) ve `resetCart()` iki gruplu sepette kargo
       yarısını da silerdi — müşterinin henüz sipariş etmediği kalemleri.

       Eksik olan tek şey deponun HABERİYDİ: sunucu turunu yalnız dil/yer/oturum değişimi
       tetikliyordu, sipariş bunların hiçbiri değil. Ölçüldü (kullanıcı bulgusu 10.08): sipariş
       verildikten sonra rozet eski sayıyı göstermeye devam ediyordu. Kapı artık var. */
    /* SİPARİŞ OLDU — uygulamanın en çok beklenen anı; ekran değişmeden ÖNCE titrer ki onay,
       geçiş animasyonunun altında kaybolmasın. */
    hapticSuccess();
    refreshCart();
    router.replace({
      pathname: '/checkout/confirmed',
      params: {
        orderId,
        /* Numarası olmayan geçişte parametre HİÇ YAZILMAZ (boş dize değil): boş dize de bir
           değerdir ve ekranın "bilinmiyor" dalını kaçırırdı. */
        ...(referenceNo === null ? {} : { reference: referenceNo }),
        total: String(totalCents),
        delivery: deliveryLabelOf(deliveryType, chosenDate, t, locale),
        payment: selectedPayment?.label ?? '',
      },
    });
  };

  /*
    RET VE ARIZANIN FİZİKSEL KARŞILIĞI TEK YERDE — `setNotice` artık doğrudan çağrılmıyor.
    Üç ayrı yerde ret kuruluyor (taşıma arızası · ödeme başarısızlığı · sunucu reddi) ve üçüne
    tek tek titreşim yazmak, dördüncüsü eklendiğinde unutulacak bir desen olurdu.

    `warm` SESSİZ: ödeme kartını müşteri KENDİSİ kapattığında bu bir başarısızlık değil, onun
    kararıdır — kendi hareketini ona hata gibi geri bildirmeyiz.
  */
  const showNotice = (next: { tone: 'error' | 'warm'; text: string }): void => {
    if (next.tone === 'error') hapticError();
    setNotice(next);
  };

  const confirm = async (): Promise<void> => {
    if (blocked !== null || submitting || selectedAddress === null || selectedPayment === null) return;
    setSubmitting(true);
    setNotice(null);

    const result = await placeCheckoutOrder(locale, {
      addressId: selectedAddress.id,
      // Kargoda gün SORULMAZ ve gönderilmez: tarih taşıyıcıya bağlıdır, söz verilmez.
      deliveryDate: isRoute ? chosenDate : null,
      paymentMethod: selectedPayment.method,
      onAccount: selectedPayment.onAccount,
      couponCode: cart.couponCode,
      idempotencyKey: orderKey,
      marketingConsent: marketing,
      shippingOrder,
      /* EKRANIN GÖSTERDİĞİ SEPETİN İMZASI (21.08) — sunucunun verdiği değer, olduğu gibi geri
         gidiyor. Sepet iki yüzeyde paylaşıldığı için son okumamızla bu dokunuş arasında değişmiş
         olabilir; değiştiyse sunucu `cart_changed` ile reddeder ve müşteri yeni listeyi görüp
         bilerek onaylar. Özet yoksa imza da yok: o hâlde zaten adres seçilmemiştir ve buraya
         gelinemez. */
      expectedCartFingerprint: summary?.fingerprint ?? null,
    });

    if (result.error !== null) {
      // TAŞIMA arızası (ağ, bozuk gövde, kimliksizlik) — retlerden ayrı: sipariş açıldı mı
      // BİLİNMİYOR. Anahtar korunduğu için tekrar denemek ikinci sipariş açmaz.
      setSubmitting(false);
      showNotice({ tone: 'error', text: result.status === 401 ? t.reject.session : t.reject.transport });
      return;
    }

    const outcome = result.data;
    if (outcome.status === 'placed') {
      finish(outcome.orderId, outcome.totalCents, outcome.deliveryType, outcome.referenceNo);
      return;
    }
    if (outcome.status === 'payment_required') {
      /* YEREL ÖDEME KARTI (sağlayıcının kendi yüzeyi) — ayrı bir ekran YAZILMAZ. Üç sonuç ayrı
         karşılanır: iptal bir HATA DEĞİLDİR (müşteri vazgeçti, sipariş taslak kalır ve ekran
         yerinde durur), başarısızlık sebebiyle söylenir. */
      const sheet = await presentPayment({ clientSecret: outcome.clientSecret });
      if (sheet.status === 'succeeded') {
        /* Numara YOK ve olamaz: sipariş bu anda hâlâ taslak, onayı webhook yazacak (`finish`
           künyesi). `null` geçiyoruz, ekran satırı çizmiyor. */
        finish(outcome.orderId, outcome.totalCents, outcome.deliveryType, null);
        return;
      }
      setSubmitting(false);
      showNotice(
        sheet.status === 'canceled'
          ? { tone: 'warm', text: t.paymentSheet.canceled }
          : { tone: 'error', text: paymentFailureMessage(sheet, t) },
      );
      return;
    }

    setSubmitting(false);
    showNotice({
      tone: 'error',
      // Ürün adı SEPET GÖRÜNÜMÜNDEN çözülür — sunucudan ikinci kez istemek, istemcinin bildiği
      // bir şeyi ona geri okutmak olurdu (sözleşme künyesi).
      text: rejectionMessage(outcome, t, locale, (variantId) =>
        viewLines.find((line) => line.kind === 'variant' && line.variantId === variantId)?.name ?? null,
      ),
    });
    // Her ret "ekrandaki resim eskidi" ihtimalidir (gün düştü, yöntem kapandı, fiyat değişti):
    // anlık görüntü tazelenir ki müşteri düzeltmeyi GÜNCEL seçeneklerle yapsın.
    checkout.reload();
  };

  const confirmLabel = (selectedPayment?.method === 'online' ? t.confirmPay : t.confirm).replace(
    '{total}',
    formatPrice(grandTotalCents, locale),
  );

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="checkout-back" />}
        testID="checkout-appbar"
      />
      {/*
        KLAVYE KORUMALI KAP (27.08 · 21.57'nin bekçisi bunu yakaladı).

        Ekran ham `ScrollView` kullanıyordu ve 11.08'de bu DOĞRUYDU — o gün içinde metin alanı
        yoktu. İletişim künyesi bölümü 15.08'de eklendi (ad + telefon) ve kaydırıcının içine
        düştü; koruma ise ekranla birlikte gelmedi. Sonuç, müşterinin ödeme yaptığı ekranda iki
        açık arızaydı: odaklanan alan klavyenin altında kalıyor (MB-02) ve klavye açıkken
        düğmeye ilk dokunuş yutuluyordu (MB-01). Kimse hata yapmadı — kural o gün makinede
        değildi; artık `lib/keyboard-scroll-guard.test.ts` onu her koşuda soruyor.

        Kap ikisini birlikte taşıyor ve yerleşim değişmiyor: `FormScroll` da kabuğun kalan
        yüksekliğini dolduruyor (`flex: 1`), onay düğmesi zaten kaydırıcının içinde — yapışkan
        bar yok, itilecek bir yerleşim de yok.
      */}
      <FormScroll contentContainerStyle={styles.content} testID="checkout-scroll">
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero}
          </Text>
          <View style={styles.thumbs}>
            {thumbs.map((thumb) => (
              <AvatarThumb
                key={thumb.key}
                initial={thumb.name.slice(0, 1)}
                accessibilityLabel={thumb.name}
                photoUri={thumb.photoUri}
                size="sm"
                stacked
              />
            ))}
          </View>
        </View>

        {/* KİMLİK DÖRT HÂLDİR, İKİ DEĞİL (kullanıcı bulgusu 10.08 — cihazda ölçüldü).
            Bu blok eskiden `me === null` diye tek soru soruyordu ve `loading`/`error` hâllerini de
            MİSAFİR sayıyordu: uç kısa süre düştüğünde giriş yapmış müşteri, adresi ekranda dururken
            "siparişinizi tamamlamak için hızlı doğrulama" davetini görüyordu — sistem, bildiği bir
            şeyi bilmiyormuş gibi davranıp müşteriyi kendi hesabından şüpheye düşürüyordu.
            CLAUDE §1'in kuralı: ölçülemeyen değer SIFIR değildir. `guest` bir CEVAPTIR, `error`
            cevapsızlıktır, `loading` henüz sorulmamış sorudur; üçü aynı şeyi söyleyemez. */}
        {/* ŞERİT ADSIZ HESABI DA KARŞILAR (ölçüldü cihazda 16.08). Eskiden `{name}` doğrudan
            basılıyordu ve OTP ile açılan hesapta ad BOŞ DİZGEDİR (`profile-gaps` künyesi: tetik adı
            sağlayıcı künyesinden okuyor, o yolda orası boş) — ekranda yalnız çıplak bir "✓ "
            kalıyordu. Kusur eskiydi ama GÖRÜNMEZDİ: künye kapısı adsız müşteriyi ödeme ekranına hiç
            bırakmıyordu; kapı 15.08'de kalkınca ortaya çıktı.
            Sıra: ad → e-posta → adsız cümle. Şeridin işi "hangi hesapla buradasın" demek; adı
            yoksa e-posta o soruyu yanıtlar, o da yoksa cümle kimliksiz kurulur — boş bir işaret
            müşteriye hiçbir şey söylemez. */}
        {meStatus === 'ready' && customer !== null ? (
          <View style={styles.signedIn} testID="checkout-signed-in">
            <Text style={styles.signedInLabel}>{signedInLabel(t, customer)}</Text>
          </View>
        ) : meStatus === 'error' ? (
          <View style={styles.signedIn} testID="checkout-me-error">
            <Note tone="error" description={t.meUnreadable} testID="checkout-me-error-note" />
            <TextAction label={t.meRetry} onPress={refreshMe} testID="checkout-me-retry" />
          </View>
        ) : meStatus === 'guest' ? (
          <DashedInvite
            layout="stack"
            title={t.guest.title}
            description={t.guest.body}
            action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="checkout-login" />}
            testID="checkout-guest"
          />
        ) : /* `loading`: hiçbir şey çizilmez — cevabı gelmemiş bir soruyu ekrana yazmak, kimliği
              olan müşteriye bir an için "misafirsiniz" demektir. */ null}

        {/* Seçenekler okunamadıysa ekran SESSİZ KALMAZ: hangi hâlde olduğunu söyler ve aynı
            sorguyu tekrar etme yolunu verir. */}
        {/* Halka yerine ÜÇ BÖLÜMÜN yeri tutulur (kullanıcı kararı 10.08): burada bekleyen şey bir
            işlem değil, gelecek olan teslim adresi · teslimat yolu · ödeme yöntemi. Halka
            hiçbirinin yerini tutmuyor, cevap gelince üçü birden giriyor ve tutar özetiyle onay
            barı aşağı zıplıyordu (skeleton künyesi). */}
        {checkout.status === 'loading' ? <CheckoutSkeleton testID="checkout-loading" /> : null}
        {checkout.status === 'error' ? (
          <View style={styles.section} testID="checkout-failed">
            <Note tone="error" description={t.state.failed} />
            <SecondaryButton label={t.state.retry} onPress={checkout.retry} testID="checkout-retry" />
          </View>
        ) : null}

        {checkout.status === 'ready' ? (
          <>
            {/* İLETİŞİM — yalnız künyesi eksikken ve EN ÜSTTE (kullanıcı kararı 15.08). Bölüm
                gerekçesiyle açılıyor: alanı sormadan önce NEDEN sorulduğu yazılı. Künye tamamsa
                bölüm hiç çizilmez — ikinci siparişte müşteri bunu bir daha görmez. */}
            {contactMissing ? (
              <View style={styles.section} testID="checkout-contact">
                <Text style={styles.eyebrow}>{upperIn(t.contact.eyebrow, locale)}</Text>
                <Text style={styles.contactReason}>{t.contact.reason}</Text>
                {nameMissing ? (
                  <TextField
                    label={t.contact.name}
                    accessibilityLabel={t.contact.name}
                    value={contactName}
                    onChangeText={setContactName}
                    // `content` tek kavram, üç RN prop'una açılıyor (kitin künyesi): otomatik
                    // doldurma, klavye ve büyük harf davranışı buradan geliyor.
                    content="name"
                    testID="checkout-contact-name"
                  />
                ) : null}
                {phoneMissing ? (
                  <TextField
                    label={t.contact.phone}
                    accessibilityLabel={t.contact.phone}
                    value={contactPhone}
                    onChangeText={setContactPhone}
                    content="tel"
                    testID="checkout-contact-phone"
                  />
                ) : null}
                {contactError === null ? null : (
                  <Note tone="terracotta" description={contactError} testID="checkout-contact-error" />
                )}
                <PrimaryButton
                  label={savingContact ? t.contact.saving : t.contact.save}
                  shape="pill"
                  onPress={saveContact}
                  /* Boş alanla yazım denemesi yapılmaz: sunucu zaten `name_required` derdi ama bir
                     tur ağ gidip gelmesi, dokunduğu anda anlaşılabilecek bir şey için. */
                  disabled={
                    savingContact ||
                    (nameMissing && contactName.trim() === '') ||
                    (phoneMissing && contactPhone.trim() === '')
                  }
                  testID="checkout-contact-save"
                />
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.eyebrow}>{upperIn(t.address.eyebrow, locale)}</Text>
              {/* HİÇ ADRES YOKSA burası bir DAVETTİR, bir uyarı değil (10.08): eskiden kuru bir
                  not ve profil sayfasına atan bir bağlantı vardı — müşteri siparişin ortasında
                  başka bir ekrana düşüyordu. Kutu misafir bloğunun kalıbı (`DashedInvite`),
                  düğme aynı çekmeceyi ORADA açar. */}
              {addresses.map((candidate) => (
                <OptionRow
                  key={candidate.id}
                  // Etiketsiz adreste başlık ŞEHİRDİR — uydurma etiket yazılmaz (entity künyesi).
                  label={candidate.label ?? candidate.city}
                  description={addressLine(candidate)}
                  selected={candidate.id === selectedAddress?.id}
                  onPress={() => setAddressId(candidate.id)}
                  trailing={candidate.isDefault ? <Text style={styles.defaultBadge}>{t.address.default}</Text> : undefined}
                  testID={`checkout-address-${candidate.id}`}
                />
              ))}
              {/* Adres YAZIMI kitin ortak çekmecesinde (tek form, tek doğrulama) — hesap
                  ekranıyla aynı dosya; burada ikinci bir kopyası yok. */}
              {addresses.length === 0 ? (
                <DashedInvite
                  layout="stack"
                  title={t.address.empty}
                  description={t.address.emptyBody}
                  action={
                    <PrimaryButton
                      label={t.address.add}
                      shape="pill"
                      onPress={() => setAddressSheet({ editing: null })}
                      testID="checkout-address-add"
                    />
                  }
                  testID="checkout-address-empty"
                />
              ) : (
                <TextAction label={t.address.add} onPress={() => setAddressSheet({ editing: null })} testID="checkout-address-add" />
              )}
            </View>

            {/* ENGEL DEĞİL, BİLGİ (kullanıcı kararı 10.08). Kutu eskiden KIRMIZIYDI ve "bu adrese
                teslim edemiyoruz, o kalemleri sepetten çıkarın" diyordu — bugün yanlış: sunucu o
                kalemleri siparişin dışında bırakıyor, siparişi reddetmiyor. Cümle artık ne olduğunu
                söylüyor: bu siparişe girmiyorlar, SEPETTE bekliyorlar, bölge içi bir adres seçilirse
                dahil olurlar. Ton `warm`; hata kırmızısı müşteriye düzeltmesi gereken bir yanlış
                yaptığını söylerdi. */}
            {droppedRows.length === 0 ? null : (
              <Note tone="warm" title={t.undeliverable.title} description={undeliverableText} testID="checkout-undeliverable" />
            )}

            {delivery === null ? null : (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{upperIn(t.delivery.eyebrow, locale)}</Text>
                <OptionRow
                  label={t.delivery.door}
                  description={isRoute ? t.delivery.doorBody.replace('{fee}', shippingFeeLabel) : t.delivery.doorUnavailable}
                  selected={isRoute}
                  disabled={!isRoute}
                  /* SEBEP KIRMIZI (kullanıcı kararı 10.08): soluklaşma "kapalı" der ama NEDEN
                     kapalı olduğunu söylemez; sebep soluk griyle yazılınca müşteri onu fark
                     etmiyordu. Yalnız KAPALI hâlde kırmızı — açık seçenekte sebep yok. */
                  descriptionTone={isRoute ? 'muted' : 'danger'}
                  // Yol adresin cevabı: dokunuş bir şey değiştirmez (dosya künyesi).
                  onPress={keepDelivery}
                  testID="checkout-mode-door"
                />
                <OptionRow
                  label={t.delivery.shipping}
                  description={isRoute ? t.delivery.shippingUnavailable : t.delivery.shippingBody.replace('{fee}', shippingFeeLabel)}
                  selected={!isRoute}
                  disabled={isRoute}
                  descriptionTone={isRoute ? 'danger' : 'muted'}
                  onPress={keepDelivery}
                  testID="checkout-mode-shipping"
                />
                {/* KOMŞU DAVETİ — gün seçiminin HEMEN ÜSTÜNDE ve bilerek: cümle o seçimin
                    gerekçesidir. Aşağıda dursaydı müşteri günü çoktan seçmiş olurdu; kullanıcının
                    "kaybolmaması lazım" dediği şey tam olarak bu bağ. "Sefer" kelimesi geçmez —
                    müşteriye gün söylenir. */}
                {/* HER DAVET KENDİ SATIRINDA (MB-61, kullanıcı kararı 21.08): müşteriyi birden çok
                    komşusu birden çok güne çağırmış olabilir ve eskiden sunucu yalnız en yakın günü
                    dönüyordu — ikinci davet ekranda HİÇ görünmüyordu. Aynı gün + aynı bölgeye iki
                    davet varsa sunucu zaten tekini gönderir (son kabul edilen kazanır), yani burada
                    gün başına tek satır çizilir. */}
                {isRoute
                  ? neighborInvites.map((neighborInvite) => (
                  <Note
                    key={neighborInvite.inviteId}
                    tone="olive"
                    /* CÜMLE SEÇİME BAĞLI (12.08 · cihazda ölçüldü). Tek metin yazılmıştı ve müşteri
                       başka güne dokununca *"o gün sizin için seçili"* yalana dönüyordu — üstelik
                       zararsız değil: davet YALNIZ tam gün eşleşmesinde bağlanıyor
                       (`matchNeighborInviteForOrder`), yani müşteri komşusunun seferine katıldığını
                       sanırken ödül hiç yazılmayacaktı. İkinci cümle bir uyarı değil ÇAĞRIDIR:
                       seçimi geri almıyor, o güne dönmenin ne kazandırdığını söylüyor. */
                    description={(chosenDate === neighborInvite.deliveryDate ? t.delivery.neighborInvite : t.delivery.neighborInviteOtherDay)
                      .replace('{name}', neighborInvite.inviterName || t.delivery.neighborSomeone)
                      .replace('{day}', formatDeliveryDate(neighborInvite.deliveryDate, locale))}
                    /* RET KUTUNUN İÇİNDE (kullanıcı kararı 21.08) — dışına konsaydı kutu bir cümleye
                       inip denetim sayfaya dökülürdü (`Note` yuvasının künyesi). Metin "sil" değil
                       "kaldır": kayıt silinmiyor, ret geri alınabilir — aynı bağlantıya yeniden
                       tıklamak daveti geri getirir ve öne alır.

                       Ekran YEREL BİR LİSTE TUTMAZ: ret yazıldıktan sonra anlık görüntü yeniden
                       okunuyor (`checkout.reload`). İkinci bir doğruluk kaynağı açsaydık, sunucu
                       reddi kabul etmediğinde ekran onu kabul etmiş gibi görünürdü. */
                    action={
                      <TextAction
                        label={t.delivery.neighborDecline}
                        tone="terracotta"
                        onPress={() => {
                          void declineNeighborInvite(neighborInvite.inviteId).then((result) => {
                            if (result.error === null) checkout.reload();
                          });
                        }}
                        testID="checkout-neighbor-decline"
                      />
                    }
                    testID="checkout-neighbor-invite"
                  />
                    ))
                  : null}

                {/* Gün YALNIZ rota-içi teslimatta: kargonun günü müşterinin kararı değil. */}
                {isRoute && dates.length > 0 ? (
                  delivery.requiresDateChoice ? (
                    <View style={styles.dayRow}>
                      {dates.map((date) => (
                        <Chip
                          key={date}
                          label={formatDeliveryDate(date, locale)}
                          selected={chosenDate === date}
                          onPress={() => setDeliveryDate(date)}
                          testID={`checkout-day-${date}`}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.dayLine} testID="checkout-day-single">
                      {t.delivery.dayLabel.replace('{day}', formatDeliveryDate(dates[0] ?? '', locale))}
                    </Text>
                  )
                ) : null}
              </View>
            )}

            {payment === null ? null : (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{upperIn(t.payment.eyebrow, locale)}</Text>
                {paymentOptions.map((option) => (
                  <OptionRow
                    key={option.key}
                    label={option.label}
                    description={option.body}
                    selected={selectedPayment?.key === option.key}
                    disabled={!option.available}
                    /* Kapalı ödeme yolunun sebebi de kırmızı — "kapıda ödeme yalnız kendi
                       aracımızla getirdiğimiz adreslerde" cümlesi aynı sebeple soluk kalıyordu. */
                    descriptionTone={option.available ? 'muted' : 'danger'}
                    onPress={() => setPaymentKey(option.key)}
                    testID={`checkout-payment-${option.key}`}
                  />
                ))}
                {/* Tavan üstü tutarda kural TEK cümleyle söylenir; nakit sınırı ise yalnız o yol
                    seçiliyken — seçilmeyen bir yöntemin uyarısı gürültüdür. */}
                {codBlockedReason === 'over_limit' ? (
                  <Text style={styles.paymentNote} testID="checkout-payment-online-required">
                    {t.payment.onlineRequired}
                  </Text>
                ) : null}
                {selectedPayment?.method === 'cash' && payment.cashWarning ? (
                  <Text style={styles.paymentNote} testID="checkout-payment-cash-warning">
                    {t.payment.cashWarning}
                  </Text>
                ) : null}
              </View>
            )}
          </>
        ) : null}

        <SummaryPanel
          eyebrow={upperIn(t.summary.eyebrow, locale)}
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(grandTotalCents, locale)}
          totalTone="terracotta"
          testID="checkout-summary"
        />

        <PressableSurface
          onPress={() => setMarketing(!marketing)}
          feedback="opacity"
          selected={marketing}
          style={styles.consentRow}
          accessibilityLabel={t.marketing}
          testID="checkout-marketing"
        >
          <View style={[styles.checkbox, marketing ? styles.checkboxOn : styles.checkboxOff]}>
            <Text style={styles.checkboxMark}>{marketing ? '✓' : ' '}</Text>
          </View>
          <Text style={styles.consentLabel}>{t.marketing}</Text>
        </PressableSurface>

        {notice === null ? null : <Note tone={notice.tone} description={notice.text} testID="checkout-notice" />}

        {blocked === null ? null : <Text style={styles.blockLine}>{blocked}</Text>}

        <PrimaryButton
          label={submitting ? t.submitting : confirmLabel}
          onPress={() => void confirm()}
          disabled={blocked !== null || submitting}
          testID="checkout-confirm"
        />

        {/* SATIŞ KOŞULLARI — düğmenin ALTINDA, web'in birebir yeri ve birebir cümlesi
            (`checkout-steps.tsx:596`). Native'de yoktu (ölçüldü 19.08, MB-76): müşteri "onaylayarak
            kabul etmiş olursunuz" cümlesini görmeden sipariş veriyordu ve kabul ettiği metnin
            okunacağı yer de uygulamada hiç açılmıyordu. Cümle ile bağ AYRI satır: yerelleştirilmiş
            cümleyi parçalayıp içine bağ gömmek üç dilde de kırılgan olurdu (web künyesinin gerekçesi). */}
        <View style={styles.termsBlock}>
          <Text style={styles.termsLine}>{t.terms}</Text>
          <TextAction
            label={t.termsLink}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'sales' } })}
            testID="checkout-terms"
          />
        </View>
      </FormScroll>

      {/* Adres çekmecesi — hesap ekranının kullandığı KİT bileşeni. Sipariş akışı kesilmez:
          müşteri adresini burada yazar, seçili hâle gelir ve görüntü onunla yenilenir. */}
      <AddressSheet
        target={addressSheet}
        addresses={addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={applyAddressWrite}
        /* Yeni adres hesabın künyesiyle DOLU açılır (22.08); `me` bu ekranda zaten okunuyor. */
        defaults={addressDefaultsOf(me)}
        testID="checkout-address-sheet"
      />
    </View>
  );
}

/**
 * "Hangi hesapla buradasın" şeridinin metni — ad yoksa e-posta, o da yoksa adsız cümle.
 *
 * Ölçütü ekran kendi kurmuyor, `isNameMissing`i çağırıyor: "ad = e-posta" hâli de adsızlıktır ve o
 * kural iki yerde tutulursa bir gün ayrışır (kitin künyesi).
 */
function signedInLabel(t: Messages, customer: Me): string {
  if (!isNameMissing(customer)) return t.signedIn.replace('{name}', customer.name);
  const email = customer.email?.trim() ?? '';
  return email === '' ? t.signedInAnon : t.signedIn.replace('{name}', email);
}

/** Teslimat satırlarının dokunuşu — yol adresin cevabı olduğu için bir şey DEĞİŞTİRMEZ. */
function keepDelivery(): void {
  return undefined;
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  heroTitle: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  thumbs: {
    flexDirection: 'row',
    paddingLeft: theme.space.lg,
  },
  signedIn: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  signedInLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  section: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  /** İletişim bölümünün GEREKÇE cümlesi — alanların üstünde, gövde tonunda; uyarı değil izah. */
  contactReason: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  defaultBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  dayLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors['olive-dark'],
  },
  paymentNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  checkbox: {
    width: theme.size.markBox,
    height: theme.size.markBox,
    borderRadius: theme.radius.badge,
    borderWidth: theme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: theme.colors.olive,
    borderColor: theme.colors.olive,
  },
  checkboxOff: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors['sand-500'],
  },
  checkboxMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.card,
  },
  consentLabel: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  termsBlock: {
    alignItems: 'center',
    gap: theme.space.xs,
  },
  /* `body-sm` (14), `helper` DEĞİL — MB-46'nın ölçütü: müşterinin KARAR için okuduğu metin 14'ün
     altına inmez. Hemen üstteki kampanya onayı `helper`da kalıyor çünkü o isteğe bağlı; bu satır
     siparişin hukuki çerçevesini söylüyor. Web'in `text-micro`su taşınmadı: orada altbilgi ve
     imleçle büyütülebilen bir yüzey var, burada yok. */
  termsLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  blockLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
}));
