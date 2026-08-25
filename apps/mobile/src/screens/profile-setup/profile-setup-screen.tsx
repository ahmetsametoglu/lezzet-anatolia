import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { updateMe } from '@/lib/api/me';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { toastSuccess } from '@/lib/toast/toast-store';
import { AddressForm, addressDefaultsOf } from '@/screens/customer-kit/address-form';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { useAddresses } from '@/screens/customer-kit/use-addresses.hook';
import { publishMe, useMe } from '@/screens/customer-kit/use-me.hook';
import { StepDots } from '@/screens/onboarding/step-dots';
import { emToDp } from '@/theme/parse';
import { isNameMissing, isPhoneMissing } from '@/screens/customer-kit/profile-gaps';
import messages from './messages.json';

/*
  KÜNYE TAMAMLAMA — doğrulaması bitmiş ama künyesi eksik müşteriye ADIM ADIM sorulan üç bilgi:
  ad-soyad → adres → telefon (kullanıcı kararı 10.08).

  ── NİYE VAR (ölçülmüş arıza) ───────────────────────────────────────────────
  E-posta/OTP ile açılan hesapta ad HİÇ DOLMUYOR (gerekçe zinciri `profile-gaps.ts`te), telefon
  da adres de boş kalıyordu — ve uygulama hiçbir yerde sormuyordu. Onboarding soramaz: o giriş
  ÖNCESİ akıştır ve girişsiz geçilebiliyor. Kapı bu yüzden `/me` okunduktan sonra çalışır
  (`use-profile-setup-gate.hook`).

  ── ADIM LİSTESİ BİR KEZ KURULUR ────────────────────────────────────────────
  Hangi adımların sorulacağı açılışta hesaplanır ve DONDURULUR. Canlı türetilseydi ad kaydedilir
  kaydedilmez o adım listeden düşer, kalan adımların sırası kayar ve kullanıcı bir adımı atlanmış
  görürdü. Dondurma aynı zamanda "yeniden girilebilirlik"tir: yarıda bırakılan akış bir sonraki
  açılışta yalnız EKSİK KALANI sorar, tamamlanan alan bir daha sorulmaz.

  ── HER ADIM KENDİ BAŞINA KAYDEDER ──────────────────────────────────────────
  Ad ve telefon `PATCH /me`ye, adres `POST /me/addresses`e ayrı ayrı gider. Toplu kaydetseydik
  ikinci adımda uygulamayı kapatan müşterinin adı da kaybolurdu.

  ── ATLANABİLİRLİK ──────────────────────────────────────────────────────────
  Ad ve telefon zorunlu (ikisi de tek satır ve iletişimin ön koşulu); ADRES adımı "Sonra
  ekleyeceğim" ile geçilebilir — sipariş vermeyecek müşteriyi en pahalı adıma zorlamak, checkout
  zaten adresi kendi çekmecesinde sorarken gereksiz bir kapıdır.

  ── TASARIM ─────────────────────────────────────────────────────────────────
  v3'te bu akış YOK. Görsel dil ONBOARDING'in adım deseninden alındı (üstbaşlık · başlık · gövde ·
  alt bölmede nokta göstergesi ve birincil düğme) ve adres adımı `shAddr` çekmecesinin FORMUNU
  olduğu gibi kullanır (`customer-kit/address-form`) — dördüncü bir adres formu yazılmadı. Yeni
  görsel dil üretilmedi; sapma `design/KARARLAR.md` sonuna kaydedildi.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Logonun kaynak oranı (1244×602) — onboarding/login ekranlarındaki sabitin ikizi. */
const LOGO_ASPECT = 1244 / 602;

type StepKey = 'name' | 'address' | 'phone';

interface ProfileSetupScreenProps {
  /**
   * Akış bitince (ya da sorulacak bir şey kalmadığında) dönülecek yol — soruyu SORAN yer verir:
   * sepetten gelen sepete, girişten gelen vitrine döner. Cevap veren müşteriyi başladığı yerden
   * koparmamak için var; verilmezse vitrin.
   */
  next?: string;
}

export function ProfileSetupScreen({ next = '/' }: ProfileSetupScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  // Rota tipi ilk `expo start`ta üretiliyor; gelen yol köprü olarak `Href`e sabitlenir (kapının
  // `profileSetupRoute` hükmünün aynısı).
  const exitTo = next as Href;

  const { status, me } = useMe();
  const addressBook = useAddresses(status === 'ready');

  /** Sorulacak adımlar — bir kez kurulur, sonra dondurulur (dosya künyesi). */
  const [steps, setSteps] = useState<StepKey[] | null>(null);
  const [index, setIndex] = useState(0);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (steps !== null || status !== 'ready' || me === null) return;
    // Adres okuması SÜRERKEN liste kurulmaz; DÜŞTÜYSE adres adımı sorulmaz — okunamayan bir
    // liste "adresi yok" demek değildir (CLAUDE §1: ölçülemeyen değer sıfır değildir).
    if (addressBook.status === 'loading') return;
    const list: StepKey[] = [];
    if (isNameMissing(me)) list.push('name');
    if (addressBook.status === 'ready' && addressBook.addresses.length === 0) list.push('address');
    if (isPhoneMissing(me)) list.push('phone');
    setSteps(list);
  }, [addressBook.addresses.length, addressBook.status, me, status, steps]);

  /* Sorulacak bir şey kalmadıysa (ya da akışa elle girildiyse) ekran yerinde durmaz: künye tamam
     olan müşteriye boş bir akış göstermek, cevabı olmayan bir soru sormaktır. */
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
        {/* ADRES FORMU KİTTEN — hesap ekranı ve checkout ile AYNI dosya (BAN önerileri, doğrulama
            ve kaydetme dahil). Kendi Kaydet düğmesini taşıdığı için alt bölmenin birincil düğmesi
            bu adımda çizilmez; geçiş yolu "Sonra ekleyeceğim". */}
        <AddressForm
          editing={null}
          addresses={addressBook.addresses}
          saveLabel={t.address.save}
          /* Bu akışın ÖNCEKİ adımı zaten adı ve numarayı yazdırıyor — adres adımına gelindiğinde
             ikisini bir kez daha sormak, az önce verilen cevabı unutmuş gibi görünürdü (22.08). */
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
        {/* Onboarding/login ile aynı varlık ve ölçü; "Atla" YOK — ad ve telefon zorunlu. */}
        <Image
          // Statik varlık Metro'da `require` ile yüklenir (onboarding ekranındaki hükümle aynı).
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../../assets/images/logo.png')}
          style={styles.logo}
          accessibilityLabel={t.brand}
        />
      </View>

      <View style={styles.content}>
        {stepBody()}
        {error === null ? null : <Note description={error} tone="terracotta" testID="profile-setup-error" />}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerNav}>
          <View style={styles.footerSide}>
            {index === 0 ? null : (
              /* Geri bağlantısı onboarding'in kendisi: kitin `TextAction`ı yalnız zeytin/terracotta
                 biliyor, bu satır ise SOLUK gezinme künyesidir — ikinci bir ton eklemek kitin
                 sözlüğünü büyütürdü (terfi ihtiyacı raporlandı). */
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
  logo: {
    height: customerMetrics.loginLogoHeight,
    width: customerMetrics.loginLogoHeight * LOGO_ASPECT,
  },
  /* Onboarding'in adım gövdesiyle aynı ölçü ve hizalama: dikeyde ortalı, 26'lık yan boşluk. */
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
