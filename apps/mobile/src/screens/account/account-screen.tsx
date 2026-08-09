import { formatPrice } from '@lezzet/helper';
import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { updateMe } from '@/lib/api/me';
import { signOut } from '@/lib/auth/sign-out';
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

  /* Tercihler ekranın durumunda: fixture yalnız başlangıç değeri (UI-only etap). */
  const [addresses, setAddresses] = useState(data.addresses);
  const [language, setLanguage] = useState<Locale>(data.preferredLanguage);
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

  const makeDefault = (id: string) =>
    setAddresses(addresses.map((address) => ({ ...address, isDefault: address.id === id })));

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

        {/* Adres DÜZENLEME/EKLEME bu dilimde bilerek yok: hedefi olan tek yer (ayrı düzenleme
            sayfası) kullanıcı kararıyla söküldü ve v3'ün adres çekmecesi (`shAddr`) adres uçlarıyla
            birlikte gelecek (doc 21.14 kalanlar) — kaydetmeyen bir form çizmek yalan olurdu.
            Bölüm adres VARKEN listeler (varsayılan yapma gerçek davranış), yokken hiç çizilmez. */}
        {addresses.length === 0 ? null : (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t.addresses.title}</Text>
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                copy={t.addresses}
                onMakeDefault={() => makeDefault(address.id)}
                testID={`account-address-${address.id}`}
              />
            ))}
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t.language.title}</Text>
          <View style={styles.languageRow}>
            {LOCALES.map((option) => (
              <Chip
                key={option}
                label={t.language[option]}
                selected={language === option}
                onPress={() => setLanguage(option)}
                testID={`account-language-${option}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t.marketing.title}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t.marketing.email}</Text>
            <ToggleSwitch
              value={marketingEmail}
              onToggle={() => setMarketingEmail(!marketingEmail)}
              accessibilityLabel={`${t.marketing.title} · ${t.marketing.email}`}
              testID="account-marketing-email"
            />
          </View>
          <View style={[styles.switchRow, styles.switchDivider]}>
            <Text style={styles.switchLabel}>{t.marketing.whatsapp}</Text>
            <ToggleSwitch
              value={marketingWhatsApp}
              onToggle={() => setMarketingWhatsApp(!marketingWhatsApp)}
              accessibilityLabel={`${t.marketing.title} · ${t.marketing.whatsapp}`}
              testID="account-marketing-whatsapp"
            />
          </View>
          <Text style={styles.switchNote}>{t.marketing.note}</Text>
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
    fontWeight: theme.text['page-title-sm--font-weight'],
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
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors['olive-light'],
  },
  companyName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['card-title-sm--font-weight'],
    color: theme.colors.ink,
  },
  pointsValue: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['h2-sm'],
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['field-label--font-weight'],
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
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['card-title-sm--font-weight'],
    color: theme.colors.ink,
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
    fontWeight: theme.text['field-label--font-weight'],
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
    fontWeight: theme.text['button--font-weight'],
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
