import { formatPrice } from '@lezzet/helper';
import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import {
  createAddress,
  deleteAddress,
  makeDefaultAddress,
  updateAddress,
  type AddressWrite,
  type MeAddress,
} from '@/lib/api/addresses';
import { updateMe, updatePreferences } from '@/lib/api/me';
import { resolvePostalCode } from '@/lib/api/places';
import { signOut } from '@/lib/auth/sign-out';
import { FONT_SCALES, readFontScale, saveFontScale, type FontScale } from '@/lib/settings/font-scale';
import { publishToast } from '@/lib/toast/toast-store';
import { deviceLocale } from '@/lib/i18n/locale';
import { publishMe } from '@/screens/customer-kit/use-me.hook';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { NavRow } from '@/screens/customer-kit/nav-row';
import { ToggleSwitch } from '@/screens/customer-kit/toggle-switch';
import { AddressCard } from './address-card';
import {
  accountData,
  COUPON_VALUE_CENTS,
  POINTS_PER_COUPON,
  type AccountData,
  type AccountCouponView,
} from './account-fixture';
import { useAddresses } from './use-addresses.hook';
import messages from './messages.json';

/*
  HESABIM (v3 `vHesap`) — profil, profesyonel künye, puanlar, referans kodu, menü, adresler,
  dil tercihi, kampanya iletişimi, veri notu ve çıkış.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  `/api/v1/me` sözleşmesi VAR ama bu ekran ona BAĞLANMADI (görevin açık kısıtı); veri fixture'dan
  ve tercihler ekranın kendi durumunda yaşıyor — anahtarlar, dil seçimi ve puan çevirme GERÇEKTEN
  çalışıyor, yalnız kalıcı değiller. Bağlanma günü değişecek olan okuma ve üç yazma çağrısıdır.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Profil ve adres düzenleme AYRI SAYFADA** (`/account/edit`, 21.14 ikinci dilim). Şablon
     ikisini de yüzen sayfada açıyor; gerekçe o ekranın künyesinde. Buradaki üç giriş (profil
     "Düzenle", adres "Düzenle", "＋ Yeni adres ekle") artık oraya gider — ilk etapta doğrulama
     kapısına bağlıydılar.
  2. **Dil seçimi kitin `Chip`i ile.** Şablon üç eşit genişlikte kutu çiziyor; kitte tam bu rolde
     bir öğe var (seçili/boş çip) ve ikinci bir seçim kutusu türü açmak kitin sözlüğünü büyütürdü.
  3. **Dil listesi `LOCALES`ten türer**, elle yazılmaz: yeni bir dil açıldığında bu ekran
     kendiliğinden öğrenir (CLAUDE §1). Seçim UYGULAMANIN DİLİNİ ANINDA DEĞİŞTİRMEZ — cihaz dili
     `deviceLocale()` ile çözülüyor ve bunu ezmek uygulama genelinde bir karar (kabuk işi);
     ekran tercihi kaydeder, etkisi bağlanma etabında gelir.
  4. **Puan çevirme eşiğin altında ENGELLİ**, şablonda ise basılınca hiçbir şey olmuyor. Engelli
     düğme + eksik puan satırı, kuralı basmadan önce söylüyor.
*/

type Messages = LocalizedCopy<typeof messages>;

interface AccountScreenProps {
  data?: AccountData;
  /** Oturum durumu — misafirde doğrulama kapısı çıkar. */
  signedIn?: boolean;
}

export function AccountScreen({ data = accountData(), signedIn = true }: AccountScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  /* DİL + KAMPANYA İZİNLERİ GERÇEK (21.16): başlangıç değeri profilden gelir (`/me`), değişim
     anında `PATCH /me/preferences`e gider ve dönen profil yayınlanır (`publishMe` — vitrin
     selamlaması ve kart aynı anda döner). İYİMSER yazım: anahtar hemen kayar, ret gelirse
     ESKİ değere döner ve satır altında söylenir — kaydedilmemiş bir seçimi kaydedilmiş
     göstermek, kullanıcıya olmayan bir izni vermiş gibi okutur. */
  const [language, setLanguage] = useState<Locale>(data.preferredLanguage);
  const [prefsFailed, setPrefsFailed] = useState(false);

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

  const pickLanguage = (next: Locale) => {
    const previous = language;
    setLanguage(next);
    savePreference({ preferredLanguage: next }, () => setLanguage(previous));
  };

  const toggleConsent = (channel: 'email' | 'whatsapp', next: boolean) => {
    const apply = channel === 'email' ? setMarketingEmail : setMarketingWhatsApp;
    apply(next);
    savePreference({ marketingConsent: { [channel]: next } }, () => apply(!next));
  };

  /* Yazı boyutu (kullanıcı kararı 09.08) — cihaz ayarı, hesaptan bağımsız GERÇEK: açılışta
     kayıtlı seçim okunur, seçim anında uygulanıp saklanır (onboarding'in aynı deposu). */
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
  const [points, setPoints] = useState(data.points);
  const [coupons, setCoupons] = useState<AccountCouponView[]>(data.coupons);

  /* Profil çekmecesi (v3 `shPf`) — GERÇEK kayıt (21.14c): taslak alanlar açılışta karttan dolar,
     Kaydet `PATCH /me`ye gider; başarı `publishMe` ile yayınlanır (kart ve vitrin selamlaması
     aynı anda döner), adlı retler (`name_required` · `phone_invalid` · `phone_taken`) cümleye
     çevrilip çekmecede söylenir. */
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const openProfileSheet = () => {
    setDraftName(data.name === data.email ? '' : data.name);
    setDraftPhone(data.phone);
    setProfileError(null);
    setProfileSheetOpen(true);
  };

  /* Adresler GERÇEK (21.15): liste `/me/addresses`ten, yazımlar v3 `shAddr` çekmecesinden.
     Her yazma cevabı GÜNCEL listedir (sözleşme kararı) — ekran ikinci bir GET atmaz, `publish`ler. */
  const addressBook = useAddresses(signedIn);

  /* BÖLGE-DIŞI TALEP BLOĞU (kullanıcı kararı 09.08) — varsayılan adres teslimat rotamızın dışına
     düşüyorsa kampanya kartı bir SORU sorar: "buraya teslimat açılsın" der misin? Ayrım kasıtlı —
     posta kodu girmek ZAYIF sinyaldir (belki merak etti), kanal açıp talep bildirmek KUVVETLİ
     sinyaldir (hattı açarsak müşteri olur) ve ikisi aynı sayılırsa yatırım kararı yanlış veriden
     çıkar. Yer sorusu gerçek uca gider (`/places/by-postal-code`), tahmin edilmez. */
  const defaultAddress = addressBook.addresses.find((a) => a.isDefault) ?? addressBook.addresses[0];
  const zipOfDefault = defaultAddress?.postalCode;
  const [outOfZone, setOutOfZone] = useState(false);
  useEffect(() => {
    if (zipOfDefault === undefined) {
      setOutOfZone(false);
      return;
    }
    let alive = true;
    void resolvePostalCode(zipOfDefault).then((result) => {
      // Çözülemeyen kod "bölge dışı" SAYILMAZ: bilinmeyeni olumsuz okumak, ölçemediğimiz şeyi
      // ölçmüş gibi göstermek olurdu (CLAUDE §1).
      if (alive && result.error === null) setOutOfZone(result.data.kind === 'resolved' && !result.data.place.inRoute);
    });
    return () => {
      alive = false;
    };
  }, [zipOfDefault]);

  const [interestSent, setInterestSent] = useState(false);
  /**
   * Kuvvetli talep. BUGÜN KAYDEDİLEN ŞEY İZİNDİR: talebin kendisi (hangi posta kodundan kaç kişi
   * istedi) için tablo YOK — `BEKLEYEN(21.15)`, web denetmene talep açıldı
   * (`docs/talep/talep-web-teslimat-talebi-kaydi.md`); tablo gelince buraya tek çağrı eklenir.
   * Düğme boş söz vermiyor: kanalı açıyor, yani hat açıldığında haber gerçekten gidebilir.
   */
  const sendZoneInterest = () => {
    setInterestSent(true);
    publishToast(t.marketing.zone.sent);
    if (!marketingEmail) toggleConsent('email', true);
  };

  const [addressSheet, setAddressSheet] = useState<{ editing: MeAddress | null } | null>(null);
  const [addressDraft, setAddressDraft] = useState({ label: '', line1: '', postalCode: '', city: '' });
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [defaultFailed, setDefaultFailed] = useState(false);

  const editAddressDraft = (patch: Partial<typeof addressDraft>) => {
    setAddressDraft((current) => ({ ...current, ...patch }));
    setAddressError(null);
  };

  const openAddressSheet = (address: MeAddress | null) => {
    setAddressDraft({
      label: address?.label ?? '',
      line1: address?.line1 ?? '',
      postalCode: address?.postalCode ?? '',
      city: address?.city ?? '',
    });
    setAddressError(null);
    setAddressSheet({ editing: address });
  };

  const saveAddress = () => {
    if (addressSheet === null) return;
    const line1 = addressDraft.line1.trim();
    const city = addressDraft.city.trim();
    if (!line1 || !city || !/^\d{5}$/.test(addressDraft.postalCode)) {
      setAddressError(t.addresses.sheet.error);
      return;
    }
    /* `line2` gövdede BİLEREK yok: çekmece göstermiyor; gönderilmeyen alana kapı dokunmaz
       (application patch kuralı) — web'den girilmiş kat/daire satırı burada kaybolmaz. */
    const body: AddressWrite = { label: addressDraft.label.trim() || null, line1, postalCode: addressDraft.postalCode, city };
    setAddressSaving(true);
    setAddressError(null);
    const call = addressSheet.editing === null ? createAddress(body) : updateAddress(addressSheet.editing.id, body);
    void call.then((result) => {
      setAddressSaving(false);
      if (result.error !== null) return setAddressError(t.addresses.sheet.unexpected);
      addressBook.publish(result.data);
      setAddressSheet(null);
    });
  };

  const removeAddress = () => {
    if (addressSheet?.editing == null) return;
    setAddressSaving(true);
    void deleteAddress(addressSheet.editing.id).then((result) => {
      setAddressSaving(false);
      if (result.error !== null) return setAddressError(t.addresses.sheet.unexpected);
      addressBook.publish(result.data);
      setAddressSheet(null);
      publishToast(t.addresses.sheet.deleted);
    });
  };

  const makeDefault = (address: MeAddress) => {
    void makeDefaultAddress(address.id).then((result) => {
      if (result.error !== null) return setDefaultFailed(true);
      setDefaultFailed(false);
      addressBook.publish(result.data);
      // Başlık kartla aynı kural: etiketsiz adreste şehir (v3'ün `a.n+' varsayılan yapıldı'`sı).
      publishToast(t.addresses.defaultDone.replace('{label}', address.label ?? address.city));
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
      publishToast(t.edit.saved);
    });
  };

  const couponValueLabel = formatPrice(COUPON_VALUE_CENTS, locale);

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
      </View>
    );
  }

  const convertPoints = () => {
    if (points === null || points < POINTS_PER_COUPON) return;
    setPoints(points - POINTS_PER_COUPON);
    setCoupons([...coupons, { code: 'PUAN5', valueLabel: t.points.couponValue.replace('{value}', couponValueLabel) }]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="account-scroll">
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>

        <View style={styles.profileCard} testID="account-profile">
          <AvatarThumb initial={data.name.slice(0, 1)} accessibilityLabel={data.name} size="lg" tone="olive" />
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{data.name}</Text>
            <Text style={styles.profileMeta}>{data.email}</Text>
            {/* Telefon girilmemişse satır çizilmez (gerçek hesapta alan boş olabilir — 21.14c). */}
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
            <Text style={styles.companyEyebrow}>{t.company.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
            <Text style={styles.companyName}>{data.company.name}</Text>
            <Text style={styles.companyMeta}>
              {t.company.identifiers.replace('{siret}', data.company.siret).replace('{vat}', data.company.vatNumber)}
            </Text>
            <Text style={styles.companyNote}>{t.company.note}</Text>
          </View>
        )}

        {points === null ? null : (
          <View style={styles.pointsCard} testID="account-points">
            <View style={styles.pointsHead}>
              <Text style={styles.cardTitle}>{t.points.title}</Text>
              <Text style={styles.pointsValue}>{t.points.value.replace('{n}', String(points))}</Text>
            </View>
            <Text style={styles.cardBody}>
              {t.points.body
                .replace('{threshold}', String(POINTS_PER_COUPON))
                .replace('{value}', couponValueLabel)}
            </Text>
            {points < POINTS_PER_COUPON ? (
              <Text style={styles.pointsGap}>{t.points.gap.replace('{n}', String(POINTS_PER_COUPON - points))}</Text>
            ) : null}
            <PrimaryButton
              label={t.points.convert
                .replace('{threshold}', String(POINTS_PER_COUPON))
                .replace('{value}', couponValueLabel)}
              onPress={convertPoints}
              disabled={points < POINTS_PER_COUPON}
              testID="account-convert"
            />
            {coupons.map((coupon) => (
              <View key={coupon.code} style={styles.couponRow} testID={`account-coupon-${coupon.code}`}>
                <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
                <Text style={styles.couponCode}>{coupon.code}</Text>
                <Text style={styles.couponValue}>{coupon.valueLabel}</Text>
              </View>
            ))}
          </View>
        )}

        {data.referralCode === null ? null : (
          <View style={styles.pointsCard} testID="account-referral">
            <Text style={styles.cardTitle}>{t.referral.title}</Text>
            <Text style={styles.cardBody}>{t.referral.body}</Text>
            <View style={styles.referralRow}>
              <Text style={styles.referralCode}>{data.referralCode}</Text>
              <SecondaryButton
                label={t.referral.share}
                onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'faq' } })}
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
            icon={<CustomerIcon name="mail" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-write"
          />
          <NavRow
            label={t.menu.delivery}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'delivery' } })}
            icon={<CustomerIcon name="truck" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-delivery"
          />
        </View>

        {/* Adresler GERÇEK (21.15, v3:857-868): bölüm koşulsuz çizilir — boş listede de başlık ve
            "＋ Yeni adres ekle" durur, ekleme kapısı adressiz müşteriye de lazım. Yüklenirken kart
            çizilmez (v3'te iskelet yok); düşen okuma/yazım tek hata satırında söylenir. */}
        {/* Adresler — "Puanlarım" kartının deseni (kullanıcı kararı 09.08): başlık KARTIN İÇİNDE,
            satırlar kesikli çizgiyle ayrılır. Adres kartının kendi zemini kalktı; kart zaten yüzey. */}
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.addresses.title}</Text>
          {addressBook.addresses.map((address, index) => (
            <View key={address.id} style={index > 0 ? styles.settingsDivider : undefined}>
              <AddressCard
                address={address}
                copy={t.addresses}
                onMakeDefault={() => makeDefault(address)}
                onEdit={() => openAddressSheet(address)}
                testID={`account-address-${address.id}`}
              />
            </View>
          ))}
          {addressBook.status === 'error' || defaultFailed ? (
            <Note
              description={addressBook.status === 'error' ? t.addresses.loadError : t.addresses.sheet.unexpected}
              tone="terracotta"
              testID="account-address-error"
            />
          ) : null}
          <View style={addressBook.addresses.length > 0 ? styles.settingsDivider : undefined}>
            <TextAction label={t.addresses.add} onPress={() => openAddressSheet(null)} testID="account-address-add" />
          </View>
        </View>

        {/* Dil + yazı boyutu TEK kartta (kullanıcı kararı 09.08): ikisi de "nasıl okuyorum"
            sorusunun cevabı; ayrı kartlara bölmek aynı konuyu iki kez sorardı. Yazı boyutu
            seçimi ANINDA uygulanır — bu kart dahil bütün ekran yeniden çizilir. */}
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.language.title}</Text>
          <View style={styles.languageRow}>
            {LOCALES.map((option) => (
              <Chip
                key={option}
                label={t.language[option]}
                selected={language === option}
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
          {/* Yazılamayan tercih SESSİZ KALMAZ: anahtar eski hâline döndü, sebep burada söylenir —
              dil ve izin aynı uca gittiği için tek satır ikisini de kapsar. */}
          {prefsFailed ? <Note description={t.marketing.saveFailed} tone="terracotta" testID="account-prefs-error" /> : null}

          {/* Bölge dışı müşteriye SORU (v3'te yok, kullanıcı kararı 09.08): gerekçe hook künyesinde. */}
          {outOfZone ? (
            <View style={styles.zoneBox}>
              <Text style={styles.zoneTitle}>{t.marketing.zone.title}</Text>
              <Text style={styles.zoneBody}>
                {t.marketing.zone.body.replace('{place}', defaultAddress?.city ?? '')}
              </Text>
              {interestSent ? (
                <Text style={styles.zoneDone}>{t.marketing.zone.done}</Text>
              ) : (
                <PrimaryButton label={t.marketing.zone.cta} onPress={sendZoneInterest} testID="account-zone-interest" />
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
        </View>

        <View style={styles.logoutRow}>
          {/* Gerçek çıkış (21.14c): oturum cihazdan silinir, `useMe` dinleyicisi vitrini misafire
              döndürür; sekme yerinde kalır ("oturumsuz kullanım = müşteri gezinmesi", 02-mimari §4).
              Çıkış hatası yutulMAZ ama ekrana da taşınmaz: depo temizliği deterministik
              (`clearStoredSession`), müşteri için sonuç aynı — çıkmıştır. */}
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

      {/* ── Profil çekmecesi (v3 `shPf`, v3:253-260) — üç alan + WhatsApp notu + Kaydet ── */}
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
            testID="profile-name"
          />
          {/* E-posta SALT OKUNUR (v3'te yazılabilir görünür): e-posta kimliğin kendisidir (auth
              anahtarı) — değişimi yeni adrese kod doğrulatan ayrı bir akış ister; sessizce
              yazılabilir göstermek kaydetmeyecek bir söz olurdu. */}
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

      {/* ── Adres çekmecesi (v3 `shAddr`, v3:203-215) — etiket + adres + posta kodu/şehir satırı +
          bölge notu + Kaydet; DÜZENLEMEDE ayrıca "Adresi sil" (v3'ün koşullu `sa.del` linki). */}
      <BottomSheet
        visible={addressSheet !== null}
        title={addressSheet?.editing == null ? t.addresses.sheet.titleNew : t.addresses.sheet.titleEdit}
        onClose={() => setAddressSheet(null)}
        testID="account-address-sheet"
      >
        <View style={styles.sheetForm}>
          <TextField
            value={addressDraft.label}
            onChangeText={(value) => editAddressDraft({ label: value })}
            accessibilityLabel={t.addresses.sheet.labelLabel}
            placeholder={t.addresses.sheet.labelPlaceholder}
            testID="address-label"
          />
          <TextField
            value={addressDraft.line1}
            onChangeText={(value) => editAddressDraft({ line1: value })}
            accessibilityLabel={t.addresses.sheet.lineLabel}
            placeholder={t.addresses.sheet.linePlaceholder}
            testID="address-line"
          />
          <View style={styles.zipRow}>
            <View style={styles.zipField}>
              <TextField
                value={addressDraft.postalCode}
                onChangeText={(value) => editAddressDraft({ postalCode: value.replace(/\D/g, '').slice(0, 5) })}
                accessibilityLabel={t.addresses.sheet.zipLabel}
                placeholder={t.addresses.sheet.zipPlaceholder}
                numeric
                testID="address-zip"
              />
            </View>
            <View style={styles.cityField}>
              <TextField
                value={addressDraft.city}
                onChangeText={(value) => editAddressDraft({ city: value })}
                accessibilityLabel={t.addresses.sheet.cityLabel}
                placeholder={t.addresses.sheet.cityPlaceholder}
                testID="address-city"
              />
            </View>
          </View>
          <Text style={styles.zipNote}>{t.addresses.sheet.zipNote}</Text>
          {addressError === null ? null : <Note description={addressError} tone="terracotta" testID="address-error" />}
          <PrimaryButton
            label={addressSaving ? t.addresses.sheet.saving : t.addresses.sheet.save}
            onPress={saveAddress}
            disabled={addressSaving}
            testID="address-save"
          />
          {addressSheet?.editing == null ? null : (
            <View style={styles.deleteRow}>
              <TextAction
                label={t.addresses.sheet.delete}
                onPress={removeAddress}
                tone="terracotta"
                disabled={addressSaving}
                testID="address-delete"
              />
            </View>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  sheetForm: {
    gap: theme.space.lg,
  },
  /* Posta kodu dar sabit sütun + şehir kalan genişlik (v3:206-209 — zip 120px, şehir flex). */
  zipRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  zipField: { width: 120 },
  cityField: { flex: 1 },
  zipNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  deleteRow: { alignItems: 'center' },
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
    fontSize: theme.text.micro,
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
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  pointsGap: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
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
  /* AYAR KARTI (kullanıcı kararı 09.08 — v3'te yok): adres/dil-yazı/izin bölümleri çıplak zeminde
     akıyor ve birbirine giriyordu. Yeni bir dil icat edilmedi — "Puanlarım" kartının deseni
     tekrarlandı (`pointsCard` ile aynı yüzey, yarıçap ve dolgu; başlık kartın İÇİNDE). */
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
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors['sand-600'],
  },

  dataCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    gap: theme.space.xs,
  },
  dataTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.ink,
  },
  dataBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  logoutRow: {
    alignItems: 'center',
    paddingVertical: theme.space.md,
  },
}));
