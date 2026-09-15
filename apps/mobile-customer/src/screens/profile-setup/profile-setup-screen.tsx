import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { updateMe } from '@lezzet/mobile-kit/src/lib/api/me';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { AddressForm, addressDefaultsOf } from '@/screens/customer-kit/address-form';
import { useAddresses } from '@/screens/customer-kit/use-addresses.hook';
import { publishMe, useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { OnboardingLogo } from '@/screens/onboarding/onboarding-logo';
import { StepDots } from '@/screens/onboarding/step-dots';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { isNameMissing, isPhoneMissing } from '@/screens/customer-kit/profile-gaps';
import messages from './messages.json';

/*
  Doğrulanmış ama künyesi eksik müşteriye ad, adres ve telefon adım adım sorulur; onboarding giriş öncesi akış olduğu için
  soramaz. Adım listesi açılışta kurulup dondurulur ki kaydedilen adım düşüp sırayı kaydırmasın, her adım yarıda kapatan
  müşterinin cevabı kaybolmasın diye ayrı kaydeder ve adres adımı atlanabilir, çünkü checkout adresi zaten sorar.
*/

type Messages = LocalizedCopy<typeof messages>;

type StepKey = 'name' | 'address' | 'phone';

interface ProfileSetupScreenProps {
  /** Akış bitince dönülecek yol; soruyu soran yer verir ki müşteri başladığı yere dönsün, verilmezse vitrin. */
  next?: string;
}

export function ProfileSetupScreen({ next = '/' }: ProfileSetupScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  // Rota tipi ilk `expo start`ta üretilir; gelen yol köprü olarak `Href`e sabitlenir.
  const exitTo = next as Href;

  const { status, me } = useMe();
  const addressBook = useAddresses(status === 'ready');

  /** Sorulacak adımlar: bir kez kurulur, sonra dondurulur. */
  const [steps, setSteps] = useState<StepKey[] | null>(null);
  const [index, setIndex] = useState(0);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (steps !== null || status !== 'ready' || me === null) return;
    // Adres okuması sürerken liste kurulmaz; düştüyse adres adımı sorulmaz, çünkü okunamayan liste "adresi yok" demek
    // değildir.
    if (addressBook.status === 'loading') return;
    const list: StepKey[] = [];
    if (isNameMissing(me)) list.push('name');
    if (addressBook.status === 'ready' && addressBook.addresses.length === 0) list.push('address');
    if (isPhoneMissing(me)) list.push('phone');
    setSteps(list);
  }, [addressBook.addresses.length, addressBook.status, me, status, steps]);

  /* Sorulacak bir şey yoksa ekran yerinde durmaz: künyesi tam müşteriye boş akış göstermek cevabı olmayan soru sormaktır. */
  const nothingToAsk = steps !== null && steps.length === 0;
  useEffect(() => {
    if (nothingToAsk) router.replace(exitTo);
  }, [exitTo, nothingToAsk, router]);

  if (steps === null || steps.length === 0) {
    return (
      <View style={styles.screen}>
        <LoadingState size="md" label={t.loading} accessibilityLabel={t.loading} testID="profile-setup-loading" />
      </View>
    );
  }

  const step = steps[index] ?? steps[steps.length - 1];
  const isLast = index === steps.length - 1;

  const advance = (): void => {
    if (isLast) {
      toastSuccess(t.doneToast);
      router.replace(exitTo);
      return;
    }
    setError(null);
    setIndex(index + 1);
  };

  /** `PATCH /me` — adlı retler (`name_required` · `phone_invalid`) cümleye çevrilir. */
  const savePatch = (patch: { name?: string; phone?: string }): void => {
    setSaving(true);
    setError(null);
    void updateMe(patch).then((result) => {
      setSaving(false);
      if (result.error !== null) {
        const known = result.error as keyof Messages['errors'];
        setError(t.errors[known] ?? t.errors.unexpected);
        return;
      }
      publishMe(result.data);
      advance();
    });
  };

  const stepBody = (): ReactNode => {
    if (step === 'name') {
      return (
        <>
          <Text style={styles.kicker}>{t.name.kicker}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {t.name.title}
          </Text>
          <Text style={styles.body}>{t.name.body}</Text>
          <TextField
            value={draftName}
            onChangeText={(value) => {
              setDraftName(value);
              setError(null);
            }}
            accessibilityLabel={t.name.field}
            placeholder={t.name.placeholder}
            content="name"
            testID="profile-setup-name"
          />
        </>
      );
    }
    if (step === 'phone') {
      return (
        <>
          <Text style={styles.kicker}>{t.phone.kicker}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {t.phone.title}
          </Text>
          <Text style={styles.body}>{t.phone.body}</Text>
          <TextField
            value={draftPhone}
            onChangeText={(value) => {
              setDraftPhone(value);
              setError(null);
            }}
            accessibilityLabel={t.phone.field}
            placeholder={t.phone.placeholder}
            content="tel"
            testID="profile-setup-phone"
          />
        </>
      );
    }
    return (
      <>
        <Text style={styles.kicker}>{t.address.kicker}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {t.address.title}
        </Text>
        <Text style={styles.body}>{t.address.body}</Text>
        {/* Adres formu hesap ekranı ve checkout'la aynı dosya; kendi Kaydet düğmesi olduğu için alt bölmede birincil düğme
            çizilmez. */}
        <AddressForm
          editing={null}
          addresses={addressBook.addresses}
          saveLabel={t.address.save}
          /* Önceki adımlar adı ve numarayı zaten yazdırdı; adres adımında yeniden sormak az önceki cevabı unutmak gibi
             görünürdü. */
          defaults={addressDefaultsOf(me)}
          onSaved={(next) => {
            addressBook.publish(next);
            advance();
          }}
        />
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* "Atla" yok: ad ve telefon zorunlu. */}
        <OnboardingLogo />
      </View>

      <View style={styles.content}>
        {stepBody()}
        {error === null ? null : <Note description={error} tone="terracotta" testID="profile-setup-error" />}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerNav}>
          <View style={styles.footerSide}>
            {index === 0 ? null : (
              /* Geri bağlantısı onboarding'inki: kitin `TextAction`ı soluk tonu bilmiyor. */
              <PressableSurface
                onPress={() => {
                  setError(null);
                  setIndex(index - 1);
                }}
                feedback="opacity"
                compact
                accessibilityLabel={t.back}
                testID="profile-setup-back"
              >
                <Text style={styles.backLink}>‹ {t.back}</Text>
              </PressableSurface>
            )}
          </View>
          <StepDots
            count={steps.length}
            active={index}
            accessibilityLabel={t.step.replace('{n}', String(index + 1)).replace('{total}', String(steps.length))}
            testID="profile-setup-dots"
          />
          <View style={styles.footerSide} />
        </View>

        {step === 'address' ? (
          <View style={styles.laterRow}>
            <TextAction label={t.address.later} onPress={advance} testID="profile-setup-address-later" />
          </View>
        ) : (
          <PrimaryButton
            label={saving ? t.saving : isLast ? t.finish : t.next}
            onPress={() => savePatch(step === 'name' ? { name: draftName.trim() } : { phone: draftPhone.trim() })}
            disabled={saving || (step === 'name' ? draftName.trim() === '' : draftPhone.trim() === '')}
            testID="profile-setup-next"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: theme.space['2xs'],
    paddingHorizontal: theme.space['6xl'],
    marginBottom: -theme.space.md,
  },
  /* Onboarding'in adım gövdesiyle aynı ölçü ve hizalama. */
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space['7xl'],
    gap: theme.space['2xl'],
  },
  kicker: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.control,
    lineHeight: theme.text.control * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  footer: {
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['2xl'],
  },
  footerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerSide: { flex: 1 },
  /** Onboarding'in geri bağlantısıyla aynı kademe (rozet çifti, soluk). */
  backLink: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
    paddingVertical: theme.space.sm,
    paddingRight: theme.space.md,
  },
  /** Birincil düğmenin yerinde duran geçiş bağlantısı — ortalanır ki alt bölme dengesi bozulmasın. */
  laterRow: { alignItems: 'center' },
}));
