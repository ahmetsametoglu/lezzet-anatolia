import { addressTitle } from '@lezzet/address';
import { formatCompactEuro, formatPrice } from '@lezzet/helper';
import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import type { Country } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';
import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { makeBillingAddress, makeDefaultAddress, type MeAddress } from '@/lib/api/addresses';
import { redeemPoints } from '@/lib/api/points';
import { deleteAccount, updateMe, updatePreferences } from '@lezzet/mobile-kit/src/lib/api/me';
import { resolvePostalCode, submitPlaceNotice } from '@/lib/api/places';
import { signOut } from '@lezzet/mobile-kit/src/lib/auth/sign-out';
import { FONT_SCALES, readFontScale, saveFontScale, type FontScale } from '@lezzet/mobile-kit/src/lib/settings/font-scale';
import { hapticCommit, hapticError } from '@lezzet/mobile-kit/src/lib/haptics/haptics';
import { toastError, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { setAppLocale, useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import placeMessages from '@lezzet/i18n/customer/place';
import { rememberPlaceNotice, usePlaceNoticeRecord } from '@/lib/places/place-notice-store';
import { publishMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { addressDefaultsOf } from '@/screens/customer-kit/address-form';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { NavRow } from '@/screens/customer-kit/nav-row';
import { PointsEarnList } from '@/screens/customer-kit/points-earn-list';
import { ToggleSwitch } from '@/screens/customer-kit/toggle-switch';
import { LegalLinks } from '@/screens/legal/legal-links';
import { useAddresses } from '@/screens/customer-kit/use-addresses.hook';
import { AddressCard } from './address-card';
import { AccountAddressesSkeleton, AccountPointsSkeleton } from './account-skeleton';
import { accountData, type AccountData } from './account-fixture';
import { usePoints } from './use-points.hook';
import { useWhatsappLink } from './use-whatsapp-link.hook';
import messages from '@lezzet/i18n/customer/account';

/*
  Profil, künye, puanlar, davet, adresler, dil ve izinler tek ekranda; profil ve adres düzenleme bu ekranın çekmecelerinde açılır.
  Dil seçimi uygulamanın dilini anında değiştirir ve profile yazılır, çünkü dil yazışmanın dilidir.
*/

type Messages = LocalizedCopy<typeof messages>;

interface AccountScreenProps {
  data?: AccountData;
  /** Oturum durumu — misafirde doğrulama kapısı çıkar. */
  signedIn?: boolean;
  /** Ekran `/me`yi kendi okumaz, rota okur; bu yüzden kimliği tazeleyen kapı da rotanın elinde. */
  onRefreshIdentity?: () => void;
  /** Fatura adresi rolünün tek ölçütü `/me`nin `type`ı; `company` künyesinin okuma ucu yok ve rota onu `null` geçiyor. */
  companyAccount?: boolean;
}

export function AccountScreen({
  data = accountData(),
  signedIn = true,
  onRefreshIdentity,
  companyAccount = false,
}: AccountScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  /* Dil ve kampanya izinleri iyimser yazılır: anahtar hemen kayar, ret gelirse eski değere döner ve satır altında söylenir, çünkü
     kaydedilmemiş seçimi kaydedilmiş göstermek olmayan bir izni vermiş gibi okutur. */
  const [prefsFailed, setPrefsFailed] = useState(false);

  /* Hook'lar koşulsuz ve en üstte durur: aşağıdaki erken `return`ların altında kalsalar render'lar arasında hook sayısı değişirdi. */
  const [refreshing, setRefreshing] = useState(false);

  const savePreference = (patch: { preferredLanguage?: Locale; marketingConsent?: Record<string, boolean> }, revert: () => void) => {
    setPrefsFailed(false);
    void updatePreferences(patch).then((result) => {
      if (result.error !== null) {
        revert();
        setPrefsFailed(true);
        return;
      }
      publishMe(result.data);
    });
  };

  /* Davet sistem paylaşım sayfasıyla paylaşılır; kendi çekmecemiz ikinci bir paket ister ve müşterinin seçeneklerini daraltırdı.
     Paylaşılan şey kod değil sunucunun verdiği bağlantıdır, çünkü kodun girilebileceği bir ekran yok. */
  const shareReferral = () => {
    if (wallet?.inviteUrl == null) return;
    void Share.share({ message: t.referral.shareMessage.replace('{url}', wallet.inviteUrl) });
  };

  /* Dil önce yerelde anında, sonra profilde değişir; ret gelirse arayüz de eski dile döner. */
  const pickLanguage = (next: Locale) => {
    const previous = locale;
    void setAppLocale(next);
    savePreference({ preferredLanguage: next }, () => void setAppLocale(previous));
  };

  const toggleConsent = (channel: 'email' | 'whatsapp', next: boolean) => {
    const apply = channel === 'email' ? setMarketingEmail : setMarketingWhatsApp;
    apply(next);
    savePreference({ marketingConsent: { [channel]: next } }, () => apply(!next));
  };

  /* Yazı boyutu hesaptan bağımsız cihaz ayarıdır: açılışta okunur, seçim anında uygulanıp saklanır. */
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  useEffect(() => {
    void readFontScale().then(setFontScale);
  }, []);
  const pickFontScale = (next: FontScale) => {
    setFontScale(next);
    void saveFontScale(next);
  };
  const [marketingEmail, setMarketingEmail] = useState(data.marketingEmail);
  const [marketingWhatsApp, setMarketingWhatsApp] = useState(data.marketingWhatsApp);
  /* `wallet` `null` ise (B2B ya da düşen okuma) puan bölümü hiç görünmez. */
  const pointsWallet = usePoints(signedIn);
  const wallet = pointsWallet.view?.points ?? null;
  const coupons = pointsWallet.view?.coupons ?? [];
  const [redeeming, setRedeeming] = useState(false);
  const [redeemFailed, setRedeemFailed] = useState(false);
  /* "Nasıl puan kazanılır" çekmecesi: kartın merak sorusuna cevabı. */
  const [earnSheetOpen, setEarnSheetOpen] = useState(false);

  /* `deleting` düğmeyi kilitler: `anonymize` tekrarlanabilir ama ikinci çağrı silinmiş profili bulamaz ve müşteri "olmadı" sanır. */
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  /* Profil çekmecesi gerçek kayıt yapar; adlı retler cümleye çevrilip çekmecede söylenir. */
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /*
    Ad yoksa büyük satır adın eksik olduğunu söyler; e-posta orada yazılmaz, çünkü o yuva kısa bir ad için ayrılmış ve uzun adres
    ortasından bölünür. E-postanın yeri künye satırıdır ve tek yerde yazılır.
  */
  const nameMissing = data.name.trim() === '';
  /* Avatar harfi kimlikten gelir: ad yoksa e-postanın ilk harfi. */
  const avatarSource = nameMissing ? data.email : data.name;

  const openProfileSheet = () => {
    setDraftName(data.name);
    setDraftPhone(data.phone);
    setProfileError(null);
    setProfileSheetOpen(true);
  };

  /* Her yazma cevabı güncel listedir; ekran ikinci bir okuma yapmaz, dönen listeyi yayınlar. */
  const addressBook = useAddresses(signedIn);
  const whatsapp = useWhatsappLink(signedIn, t.whatsapp.message);
  const whatsappLinked = (whatsapp.numbers?.length ?? 0) > 0;

  /* Varsayılan adres rota dışındaysa kart "buraya teslimat açılsın" diye sorar. Posta kodu girmek zayıf, talep bırakmak kuvvetli
     sinyaldir ve ikisi aynı sayılırsa yatırım kararı yanlış veriden çıkar. */
  const defaultAddress = addressBook.addresses.find((a) => a.isDefault) ?? addressBook.addresses[0];
  const zipOfDefault = defaultAddress?.postalCode;
  /** Yalnız rota dışındaysa dolu; kaydın anahtarı ülke ve kod. */
  const [zonePlace, setZonePlace] = useState<{ country: Country; postalCode: string } | null>(null);
  useEffect(() => {
    if (zipOfDefault === undefined) {
      setZonePlace(null);
      return;
    }
    let alive = true;
    void resolvePostalCode(zipOfDefault).then((result) => {
      // Çözülemeyen kod "bölge dışı" sayılmaz: bilinmeyeni olumsuz okumak ölçemediğimizi ölçmüş gibi göstermek olurdu.
      if (!alive || result.error !== null) return;
      const place = result.data.kind === 'resolved' && !result.data.place.inRoute ? result.data.place : null;
      setZonePlace(place === null ? null : { country: place.country, postalCode: place.postalCode });
    });
    return () => {
      alive = false;
    };
  }, [zipOfDefault]);
  const outOfZone = zonePlace !== null;

  /*
    Kuvvetli talep bir `zone_notice` kaydıdır ve bölge açılınca haber yalnız bu kayıtlara gider; kampanya izni sessizce açılmaz.
    Hafıza ortak depoda: katalogda talep bırakan müşteri burada düğmeyi yeniden görmez.
  */
  const zoneRecord = usePlaceNoticeRecord(zonePlace?.country ?? 'FR', zonePlace?.postalCode ?? '');
  const [zoneSending, setZoneSending] = useState(false);
  const sendZoneInterest = () => {
    if (zonePlace === null) return;
    const placeCopy = placeMessages[locale].placeNotice;
    setZoneSending(true);
    void submitPlaceNotice(locale, { postalCode: zonePlace.postalCode, country: zonePlace.country, source: 'app-account' }).then(
      (result) => {
        setZoneSending(false);
        /* Dört hâlin dördü de söylenir; sessiz geçilen hâl müşteriye "sayıldım mı?" diye sordururdu. */
        if (result.error !== null) {
          toastError(placeCopy.failed);
          return;
        }
        if (result.data.status === 'place_unknown' || result.data.status === 'email_required') {
          toastError(result.data.status === 'place_unknown' ? placeCopy.placeUnknown : placeCopy.emailRequired);
          return;
        }
        rememberPlaceNotice(zonePlace.country, zonePlace.postalCode, result.data.status);
        toastSuccess(result.data.status === 'ok' ? t.marketing.zone.sent : placeCopy.alreadyRecorded);
      },
    );
  };

  /* Adres yazımı kitin ortak çekmecesinde; burada yalnız çekmecenin açılması ve dönen listenin yayınlanması var. */
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const [defaultFailed, setDefaultFailed] = useState(false);
  const [billingFailed, setBillingFailed] = useState(false);

  /* Fatura seçiminin hatası ayrı tutulur: varsayılan seçimi düşse de fatura seçimi geçerli olabilir. */
  const makeBilling = (address: MeAddress) => {
    void makeBillingAddress(address.id).then((result) => {
      if (result.error !== null) return setBillingFailed(true);
      setBillingFailed(false);
      addressBook.publish(result.data);
      toastSuccess(t.addresses.billingDone.replace('{label}', addressTitle(address)));
    });
  };

  const makeDefault = (address: MeAddress) => {
    void makeDefaultAddress(address.id).then((result) => {
      if (result.error !== null) return setDefaultFailed(true);
      setDefaultFailed(false);
      addressBook.publish(result.data);
      toastSuccess(t.addresses.defaultDone.replace('{label}', addressTitle(address)));
    });
  };

  const saveProfile = () => {
    setProfileSaving(true);
    setProfileError(null);
    void updateMe({ name: draftName, phone: draftPhone.trim() === '' ? null : draftPhone }).then((result) => {
      setProfileSaving(false);
      if (result.error !== null) {
        const known = result.error as keyof Messages['edit']['errors'];
        setProfileError(t.edit.errors[known] ?? t.edit.errors.unexpected);
        return;
      }
      publishMe(result.data);
      setProfileSheetOpen(false);
      toastSuccess(t.edit.saved);
    });
  };

  /**
   * Önce sunucu siler, sonra cihaz çıkış yapar: düşen bir silmede müşteri hesabıyla kalır ve nedenini çekmecede okur. Başarıda
   * çekmece kapatılmaz ve toast basılmaz, ekran oturum düşünce kendiliğinden misafir hâline döner.
   */
  const confirmDelete = async (): Promise<void> => {
    setDeleting(true);
    setDeleteFailed(false);
    const result = await deleteAccount();
    if (result.error !== null) {
      setDeleting(false);
      setDeleteFailed(true);
      hapticError();
      return;
    }
    /* Bu akışın toast'ı yok ve başarının tek işareti ekranın kaybolması; dokunsal geri bildirim olmasa müşteri silmenin işlediğini
       tahmin ederdi. Kutlama tonu değil: kendi hesabını silen birine "tebrikler" denmez. */
    hapticCommit();
    await signOut();
  };

  if (!signedIn) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <EmptyState
          icon={<Icon name="account" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.guest.title}
          description={t.guest.body}
          action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="account-login" />}
          testID="account-guest"
        />
        {/* Misafirin bilgi kapısı: hesabı olmayan birinin belgeleri okuyabildiği tek yer burası. */}
        <View style={styles.guestLegal}>
          <LegalLinks testID="account-legal-guest" />
        </View>
      </View>
    );
  }

  /* Çevirmede gövde yok: kaç puanın harcanacağını istemci söylemez, motor bakiyenin tamamını çevirir. */
  const convertPoints = () => {
    setRedeeming(true);
    setRedeemFailed(false);
    void redeemPoints().then((result) => {
      setRedeeming(false);
      if (result.error !== null) return setRedeemFailed(true);
      pointsWallet.publish(result.data);
      toastSuccess(t.points.converted);
    });
  };


  /* Kimlik, puan ve adres ekran açıkken eskiyebilir; kimlik rotadan tazelenir ki iki kaynak ayrışmasın. Halka üçünü birlikte
     bekler ama tek döner, çünkü üç gösterge üç ayrı yükleme izlenimi verirdi. */
  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    onRefreshIdentity?.();
    await Promise.all([pointsWallet.reload(), addressBook.reload()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            {...pullRefreshColors(theme.colors.olive)}
          />
        }
        testID="account-scroll"
      >
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>

        <View style={styles.profileCard} testID="account-profile">
          <AvatarThumb initial={avatarSource.slice(0, 1)} accessibilityLabel={avatarSource} size="lg" tone="olive" />
          <View style={styles.profileText}>
            {/* Büyük satır ad ya da adın eksik olduğudur; e-posta künye satırında, tek yerde. */}
            <Text style={styles.profileName}>{nameMissing ? t.profile.addName : data.name}</Text>
            <Text style={styles.profileMeta}>{data.email}</Text>
            {/* Telefon girilmemişse satır çizilmez. */}
            {data.phone === '' ? null : <Text style={styles.profileMeta}>{data.phone}</Text>}
          </View>
          <TextAction
            label={t.profile.edit}
            onPress={openProfileSheet}
            accessibilityHint={t.profile.editLabel}
            testID="account-edit"
          />
        </View>

        {data.company === null ? null : (
          <View style={styles.companyCard} testID="account-company">
            <Text style={styles.companyEyebrow}>{upperIn(t.company.eyebrow, locale)}</Text>
            <Text style={styles.companyName}>{data.company.name}</Text>
            <Text style={styles.companyMeta}>
              {t.company.identifiers.replace('{siret}', data.company.siret).replace('{vat}', data.company.vatNumber)}
            </Text>
            <Text style={styles.companyNote}>{t.company.note}</Text>
          </View>
        )}

        {/* Bölüm B2B'de ve okuma düşünce hiç çizilmez; sıfır bakiyede kart boş kalmaz, puan kazanılacak yere iter. Okunurken kartın
            yeri tutulur ki veri gelince altındakiler zıplamasın. */}
        {pointsWallet.status === 'loading' ? <AccountPointsSkeleton testID="account-points-loading" /> : null}

        {wallet === null ? null : (
          <View style={styles.pointsCard} testID="account-points">
            <View style={styles.pointsHead}>
              <Text style={styles.cardTitle}>{t.points.title}</Text>
              <Text style={styles.pointsValue}>{t.points.value.replace('{n}', String(wallet.balance))}</Text>
            </View>

            {/* Kazanma yolları kartta değil yalnız çekmecede; kart her bakiyede eşiği ve kalan puanı söyler. */}
            <Text style={styles.cardBody}>
              {t.points.body
                .replace('{threshold}', String(wallet.redeem.minimumPoints))
                .replace('{value}', formatCompactEuro(wallet.redeem.valueCents, locale))}
            </Text>
            {wallet.balance < wallet.redeem.minimumPoints ? (
              <Text style={styles.pointsGap}>
                {t.points.gap.replace('{n}', String(wallet.redeem.minimumPoints - wallet.balance))}
              </Text>
            ) : null}
            <PrimaryButton
              label={
                redeeming
                  ? t.points.converting
                  : t.points.convert
                      .replace('{threshold}', String(wallet.redeem.minimumPoints))
                      .replace('{value}', formatCompactEuro(wallet.redeem.valueCents, locale))
              }
              onPress={convertPoints}
              disabled={redeeming || wallet.balance < wallet.redeem.minimumPoints}
              testID="account-convert"
            />

            {redeemFailed ? <Note description={t.points.failed} tone="terracotta" testID="account-points-error" /> : null}

            {/* Kazanma yolları yalnız bu çekmecede; kart onlara buradan açılır. */}
            <TextAction
              label={t.points.howTo}
              onPress={() => setEarnSheetOpen(true)}
              testID="account-points-howto"
            />

            {/* Puan geçmişi ayrı ekranda: defter veriyle sınırsız büyür ve sonsuz kaydırma ister. Kapı kartın içinde ki B2B ölçütü
                ikinci kez yazılmasın. */}
            <TextAction
              label={t.points.history}
              onPress={() => router.push('/points-history')}
              testID="account-points-history"
            />

            {/* Kuponlar puan kartının içinde: ikisi aynı cüzdanın iki yüzü (kazanılan ↔ harcanabilir). */}
            {coupons.map((coupon) => (
              <View key={coupon.id} style={styles.couponRow} testID={`account-coupon-${coupon.code}`}>
                <Icon name="coupon" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
                <Text style={styles.couponCode}>{coupon.code}</Text>
                <Text style={styles.couponValue}>
                  {coupon.amountCents === null
                    ? t.points.couponPercent.replace('{n}', String(coupon.percent ?? 0))
                    : t.points.couponValue.replace('{value}', formatPrice(coupon.amountCents, locale))}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Koşul profilden değil cüzdandan okunur: kart kodu garantiler, profildeki ham alan boş olabilir. */}
        {wallet?.inviteUrl == null || wallet.referralCode === null ? null : (
          <View style={styles.pointsCard} testID="account-referral">
            <Text style={styles.cardTitle}>{t.referral.title}</Text>
            <Text style={styles.cardBody}>{t.referral.body}</Text>
            <View style={styles.referralRow}>
              {/* Kod görünür ama paylaşılan şey bağlantıdır: kod söylenir, bağlantı paylaşılır. */}
              <Text style={styles.referralCode}>{wallet.referralCode}</Text>
              <SecondaryButton
                label={t.referral.share}
                onPress={shareReferral}
                tone="olive"
                shape="pill"
                accessibilityHint={t.referral.shareLabel}
                testID="account-share"
              />
            </View>
          </View>
        )}

        <View style={styles.menuCard}>
          <NavRow
            label={t.menu.orders}
            onPress={() => router.push('/orders')}
            icon={<Icon name="orders" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            testID="account-menu-orders"
          />
          <NavRow
            label={t.menu.tickets}
            onPress={() => router.push('/support')}
            icon={<Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-tickets"
          />
          <NavRow
            label={t.menu.write}
            onPress={() => router.push('/support/new')}
            icon={<Icon name="mail" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-write"
          />
          <NavRow
            label={t.menu.delivery}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'delivery' } })}
            icon={<Icon name="truck" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-delivery"
          />
        </View>

        {/* Bölüm koşulsuz çizilir, çünkü ekleme kapısı adressiz müşteriye de lazım; satırlar kart içinde kesikli çizgiyle ayrılır. */}
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.addresses.title}</Text>
          {/* Rozet rolün adını söyler, bu satır ne işe yaradığını; adres yokken çizilmez, olmayan rozetin açıklaması gürültüdür. */}
          {addressBook.addresses.length === 0 ? null : (
            <Text style={styles.helperNote} testID="account-addresses-note">
              {t.addresses.note}
            </Text>
          )}
          {/* Okunurken satırların yeri tutulur: "hiç adres yok" ile "yükleniyor" aynı görünmesin. */}
          {addressBook.status === 'loading' ? <AccountAddressesSkeleton testID="account-addresses-loading" /> : null}
          {addressBook.addresses.map((address, index) => (
            <View key={address.id} style={index > 0 ? styles.settingsDivider : undefined}>
              <AddressCard
                address={address}
                copy={t.addresses}
                onMakeDefault={() => makeDefault(address)}
                /* Fatura rolü yalnız şirket hesabında; ölçüt `companyAccount`. */
                onMakeBilling={companyAccount ? () => makeBilling(address) : null}
                onEdit={() => setAddressSheet({ editing: address })}
                testID={`account-address-${address.id}`}
              />
            </View>
          ))}
          {addressBook.status === 'error' || defaultFailed || billingFailed ? (
            <Note
              description={
                addressBook.status === 'error'
                  ? t.addresses.loadError
                  : defaultFailed
                    ? t.addresses.defaultFailed
                    : t.addresses.billingFailed
              }
              tone="terracotta"
              testID="account-address-error"
            />
          ) : null}
          <View style={addressBook.addresses.length > 0 ? styles.settingsDivider : undefined}>
            <TextAction label={t.addresses.add} onPress={() => setAddressSheet({ editing: null })} testID="account-address-add" />
          </View>
        </View>

        {/* Dil ve yazı boyutu tek kartta: ikisi de "nasıl okuyorum" sorusunun cevabı. */}
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.language.title}</Text>
          <View style={styles.languageRow}>
            {LOCALES.map((option) => (
              <Chip
                key={option}
                label={t.language[option]}
                selected={locale === option}
                onPress={() => pickLanguage(option)}
                testID={`account-language-${option}`}
              />
            ))}
          </View>
          <View style={styles.settingsDivider}>
            <Text style={styles.cardTitle}>{t.fontSize.title}</Text>
          </View>
          <View style={styles.languageRow}>
            {FONT_SCALES.map((option) => (
              <Chip
                key={option}
                label={t.fontSize[option]}
                selected={fontScale === option}
                onPress={() => pickFontScale(option)}
                testID={`account-fontsize-${option}`}
              />
            ))}
          </View>
        </View>

        {/* Bağlı numaralar salt okunur: müşterinin tercihi değil, kendi hattından gönderdiği mesajın kanıtıdır. */}
        <View style={styles.settingsCard} testID="account-whatsapp">
          <View style={styles.pointsHead}>
            <Text style={styles.cardTitle}>{t.whatsapp.title}</Text>
            {whatsappLinked ? <Text style={styles.whatsappVerified}>{t.whatsapp.verified}</Text> : null}
          </View>
          <Text style={styles.cardBody}>{t.whatsapp.body}</Text>
          {(whatsapp.numbers ?? []).map((number) => (
            <Text key={number} style={styles.whatsappNumber}>
              {number}
            </Text>
          ))}
          {whatsappLinked ? (
            <TextAction
              label={whatsapp.busy ? t.whatsapp.busy : t.whatsapp.relink}
              onPress={() => void whatsapp.start()}
              disabled={whatsapp.busy}
              testID="account-whatsapp-relink"
            />
          ) : (
            <>
              <SecondaryButton
                label={whatsapp.busy ? t.whatsapp.busy : t.whatsapp.cta}
                onPress={() => void whatsapp.start()}
                disabled={whatsapp.busy}
                tone="olive"
                shape="pill"
                testID="account-whatsapp-link"
              />
              <Text style={styles.helperNote}>{t.whatsapp.hint}</Text>
            </>
          )}
          {whatsapp.failed ? <Note description={t.whatsapp.failed} tone="terracotta" testID="account-whatsapp-error" /> : null}
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.marketing.title}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t.marketing.email}</Text>
            <ToggleSwitch
              value={marketingEmail}
              onToggle={() => toggleConsent('email', !marketingEmail)}
              accessibilityLabel={`${t.marketing.title} · ${t.marketing.email}`}
              testID="account-marketing-email"
            />
          </View>
          <View style={[styles.switchRow, styles.switchDivider]}>
            <Text style={styles.switchLabel}>{t.marketing.whatsapp}</Text>
            <ToggleSwitch
              value={marketingWhatsApp}
              onToggle={() => toggleConsent('whatsapp', !marketingWhatsApp)}
              accessibilityLabel={`${t.marketing.title} · ${t.marketing.whatsapp}`}
              testID="account-marketing-whatsapp"
            />
          </View>
          <Text style={styles.switchNote}>{t.marketing.note}</Text>
          {/* Yazılamayan tercih eski hâline döner ve sebep burada söylenir; dil ve izin aynı uca gittiği için tek satır ikisini kapsar. */}
          {prefsFailed ? <Note description={t.marketing.saveFailed} tone="terracotta" testID="account-prefs-error" /> : null}

          {/* Rota dışı müşteriye talep sorusu; gerekçesi yukarıda. */}
          {outOfZone ? (
            <View style={styles.zoneBox}>
              <Text style={styles.zoneTitle}>{t.marketing.zone.title}</Text>
              <Text style={styles.zoneBody}>
                {t.marketing.zone.body.replace('{place}', defaultAddress?.city ?? '')}
              </Text>
              {zoneRecord !== null ? (
                <Text style={styles.zoneDone} testID="account-zone-done">{t.marketing.zone.done}</Text>
              ) : (
                <>
                  {/* Kayıt `zone_notice`a gider; "yalnız bu haber" izni kaydın kendisidir. */}
                  <PrimaryButton
                    label={t.marketing.zone.cta}
                    onPress={sendZoneInterest}
                    disabled={zoneSending}
                    testID="account-zone-interest"
                  />
                </>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.dataCard}>
          <Text style={styles.dataTitle}>{t.data.title}</Text>
          <Text style={styles.dataBody}>{t.data.body}</Text>
          <TextAction
            label={t.data.privacy}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'privacy' } })}
            testID="account-privacy"
          />
          {/* Hesap silme en altta ve dolgusuz: dolgulu düğme sayfanın en güçlü çağrısı olur ve müşteriyi silmeye davet ederdi. */}
          <TextAction
            label={t.deleteAccount.action}
            onPress={() => {
              setDeleteFailed(false);
              setDeleteSheetOpen(true);
            }}
            tone="terracotta"
            testID="account-delete"
          />
        </View>

        {/* Girişli hâlin bilgi kapısı: menüdeki kısayollar bağlamsaldır, burası listenin tamamı. */}
        <LegalLinks testID="account-legal" />

        <View style={styles.logoutRow}>
          {/* Oturum cihazdan silinir ve vitrin misafire döner; depo temizliği her durumda koştuğu için çıkış hatası ekrana taşınmaz. */}
          <TextAction
            label={t.logout}
            onPress={() => {
              void signOut();
            }}
            tone="terracotta"
            testID="account-logout"
          />
        </View>
      </ScrollView>

      {/* Çekmece, ayrı sayfa değil: müşteri merak sorusunun cevabını alıp bulunduğu yere dönmek ister. Çekmece yalnız kart varken
          açılabildiği için `wallet` burada `null` olmaz. */}
      <BottomSheet
        visible={earnSheetOpen && wallet !== null}
        title={t.points.howToTitle}
        onClose={() => setEarnSheetOpen(false)}
        testID="account-earn-sheet"
      >
        {wallet === null ? null : (
          <PointsEarnList
            rules={wallet}
            visitClaimedToday={wallet.visitClaimedToday}
            actions={{
              /* Her hedef önce çekmeceyi kapatır: altında açık modal bırakıp gezinmek ekranı kilitli gösterirdi. */
              referral: () => {
                setEarnSheetOpen(false);
                shareReferral();
              },
              neighbor: () => {
                setEarnSheetOpen(false);
                router.push('/orders');
              },
              review: () => {
                setEarnSheetOpen(false);
                router.push('/orders');
              },
              feedback_candidate: () => {
                setEarnSheetOpen(false);
                router.push('/discover');
              },
            }}
            showRules
            testID="account-earn-sheet-list"
          />
        )}
      </BottomSheet>

      {/* İki adım, çünkü işlem geri alınamaz ve çekmece ne olacağını söyler; kalan kayıtlar (faturadaki ad ve adres dahil) gidenlerle
          aynı ağırlıkta yazılır ki müşteri yanıltılmasın. Önce silme başarılı olur, sonra oturum kapanır. */}
      <BottomSheet
        visible={deleteSheetOpen}
        title={t.deleteAccount.title}
        onClose={() => setDeleteSheetOpen(false)}
        testID="account-delete-sheet"
      >
        <View style={styles.deleteBody}>
          <Text style={styles.deleteIntro}>{t.deleteAccount.body}</Text>

          <View style={styles.deleteBlock}>
            <Text style={styles.deleteBlockTitle}>{t.deleteAccount.goesTitle}</Text>
            <Text style={styles.deleteBlockBody}>{t.deleteAccount.goes}</Text>
          </View>

          <View style={[styles.deleteBlock, styles.deleteStays]}>
            <Text style={[styles.deleteBlockTitle, styles.deleteStaysTitle]}>{t.deleteAccount.staysTitle}</Text>
            <Text style={styles.deleteBlockBody}>{t.deleteAccount.stays}</Text>
          </View>

          <Text style={styles.deleteWarning}>{t.deleteAccount.irreversible}</Text>
          {deleteFailed ? <Note description={t.deleteAccount.failed} tone="terracotta" testID="account-delete-error" /> : null}

          {/* Hiçbiri dolgulu değil: vazgeç sessiz metin, onay dolgusuz terracotta; geri çekilme solda ve ilk okunan. */}
          <View style={styles.deleteActions}>
            <TextAction
              label={t.deleteAccount.cancel}
              onPress={() => setDeleteSheetOpen(false)}
              disabled={deleting}
              testID="account-delete-cancel"
            />
            <SecondaryButton
              label={deleting ? t.deleteAccount.deleting : t.deleteAccount.confirm}
              onPress={() => void confirmDelete()}
              disabled={deleting}
              tone="terracotta"
              shape="pill"
              testID="account-delete-confirm"
            />
          </View>
        </View>
      </BottomSheet>

      {/* Profil çekmecesi: üç alan, WhatsApp notu ve Kaydet. */}
      <BottomSheet
        visible={profileSheetOpen}
        title={t.edit.title}
        onClose={() => setProfileSheetOpen(false)}
        testID="account-profile-sheet"
      >
        <View style={styles.sheetForm}>
          <TextField
            value={draftName}
            onChangeText={(value) => {
              setDraftName(value);
              setProfileError(null);
            }}
            accessibilityLabel={t.edit.nameLabel}
            placeholder={t.edit.namePlaceholder}
            content="name"
            testID="profile-name"
          />
          {/* E-posta salt okunur: kimliğin kendisidir ve değişimi yeni adrese kod doğrulatan ayrı bir akış ister. */}
          <TextField
            value={data.email}
            onChangeText={() => undefined}
            editable={false}
            accessibilityLabel={t.edit.emailLabel}
            placeholder={t.edit.emailPlaceholder}
            testID="profile-email"
          />
          <TextField
            value={draftPhone}
            onChangeText={(value) => {
              setDraftPhone(value);
              setProfileError(null);
            }}
            accessibilityLabel={t.edit.phoneLabel}
            placeholder={t.edit.phonePlaceholder}
            helperText={t.edit.phoneNote}
            content="tel"
            testID="profile-phone"
          />
          {profileError === null ? null : <Note description={profileError} tone="terracotta" testID="profile-error" />}
          <PrimaryButton
            label={profileSaving ? t.edit.saving : t.edit.save}
            onPress={saveProfile}
            disabled={profileSaving}
            testID="profile-save"
          />
        </View>
      </BottomSheet>

      {/* Adres çekmecesi kitin ortak formu; dönen güncel liste doğrudan yayınlanır. */}
      <AddressSheet
        target={addressSheet}
        addresses={addressBook.addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={(next) => addressBook.publish(next)}
        /* Yeni adres hesabın künyesiyle dolu açılır. */
        defaults={addressDefaultsOf({ name: data.name, phone: data.phone })}
        testID="account-address-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  sheetForm: {
    gap: theme.space.lg,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['5xl'],
    gap: theme.space['2xl'],
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.ink,
    paddingTop: theme.space.sm,
    paddingHorizontal: theme.space['4xl'],
  },
  /* Misafir duvarının altındaki bilgi bloğu — gövdenin (`content`) yatay dolgusuyla aynı hizada;
     duvar hâli o kabı kullanmadığı için dolgu burada tekrar veriliyor. */
  guestLegal: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['4xl'],
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space['2xl'],
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
  },
  profileText: { flex: 1, gap: theme.space['2xs'] },
  profileName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['step-sm'],
    color: theme.colors.ink,
  },
  profileMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },

  companyCard: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.control,
    padding: theme.space['3xl'],
    gap: theme.space.xs,
  },
  companyEyebrow: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors['olive-light'],
  },
  companyName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
    color: theme.colors['sand-50'],
  },
  companyMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors['neutral-400'],
  },
  companyNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors['neutral-400'],
    marginTop: theme.space.xs,
  },

  pointsCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  pointsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  cardTitle: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  pointsValue: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['h2-sm'],
    color: theme.colors['olive-dark'],
  },
  cardBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  whatsappVerified: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors['olive-dark'],
  },
  whatsappNumber: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  pointsGap: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  /* Kart içi dipnot sönük ve küçük, çünkü kart başlığıyla aynı ağırlıkta okunmamalı. */
  helperNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  /* Puan kazanma yolları: satır düzeni ödeme ve teslimat listelerinin aynısı, ayraç kart içi kesikli çizgi. */
  earnList: { gap: theme.space.xs },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  earnText: { flex: 1, gap: theme.space['2xs'] },
  earnTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  earnBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.hairline,
    borderStyle: 'dashed',
    borderColor: theme.colors['olive-line'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  couponCode: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
  },
  couponValue: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  referralCode: {
    flex: 1,
    textAlign: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-500'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    letterSpacing: theme.text['body-sm'] * 0.06,
    color: theme.colors.ink,
    overflow: 'hidden',
  },

  menuCard: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },

  block: { gap: theme.space.md },
  blockTitle: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  /* Ayar kartı "Puanlarım" kartının yüzeyini kullanır: bölümler çıplak zeminde birbirine giriyordu ve yeni bir dil icat edilmedi. */
  settingsCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  /* Bölge-dışı talep kutusu — kartın içinde İKİNCİ bir yüzey (terracotta ailesi): "bu senin
     durumun" demenin görsel yolu; kampanya satırlarıyla aynı tonda olsaydı okunmazdı. */
  zoneBox: {
    backgroundColor: theme.colors['terracotta-bg'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    gap: theme.space.md,
    marginTop: theme.space.md,
  },
  zoneTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.terracotta,
  },
  zoneBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  zoneDone: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  /* Kart içi ayraç — menü kartının kesikli çizgisi; üstten nefes verir ki satırlar yapışmasın. */
  settingsDivider: {
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
    marginTop: theme.space.xs,
  },
  languageRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space.xl,
  },
  switchDivider: {
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  switchLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  switchNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['sand-600'],
  },

  dataCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    gap: theme.space.xs,
  },
  /* Başlık gövdeden küçük kalamaz: gövde 14'e çıkınca başlık da aynı durağa alındı, ayrım ağırlıkta duruyor (700 ↔ 400). */
  dataTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  dataBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  logoutRow: {
    alignItems: 'center',
    paddingVertical: theme.space.md,
  },

  /* Silme çekmecesinin iki bloğu aynı ağırlıkta, yalnız rengi ayrı; metinler `body-sm`in altına inmez, çünkü müşteri karar için okur. */
  deleteBody: {
    gap: theme.space.lg,
    paddingBottom: theme.space.xl,
  },
  deleteIntro: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  deleteBlock: {
    gap: theme.space.xs,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  deleteStays: {
    backgroundColor: theme.colors['honey-bg'],
    borderWidth: theme.border.hairline,
    borderColor: theme.colors['honey-line'],
  },
  deleteBlockTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  deleteStaysTitle: {
    color: theme.colors.honey,
  },
  deleteBlockBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  deleteWarning: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
  deleteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.space.lg,
  },
}));
