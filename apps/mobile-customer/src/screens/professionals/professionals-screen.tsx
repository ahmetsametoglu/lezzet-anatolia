import { useRouter } from 'expo-router';
import { whatsappHref } from '@lezzet/brand';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import {
  b2bApplicationIssues,
  b2bIssueNotice,
  normalizeSiret,
  type B2bApplicationField,
  type B2bApplicationInput,
  type B2bApplicationKind,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { CLIENT_ERROR } from '@lezzet/mobile-kit/src/lib/api/client';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { OtpSignInFields } from '@/screens/customer-kit/otp-sign-in-fields';
import { useOtpSignIn } from '@/screens/customer-kit/use-otp-sign-in.hook';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { ApplicationForm } from './application-form';
import { emptyApplication, type Messages } from './professionals-types';
import { useProfessionals } from './use-professionals.hook';
import messages from '@lezzet/i18n/customer/professionals';

/*
  Profesyonel başvurusu: iki hâl (gönderilmedi, gönderildi) ve başvurusu olan adayın durum blokları (`pending`, `approved`,
  `rejected`); başvurmuş birine form gösterilmez, çünkü aynı kuyruğu ikinci kez meşgul ederdi. Kimlik gönderirken istenir: misafirin
  formu gönderimde bir çekmece açar ve oturum kurulunca başvuru aynı gövdeyle kendiliğinden gider, kapının kendisi sunucuda.
*/

export function ProfessionalsScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [input, setInput] = useState<B2bApplicationInput>(emptyApplication);
  /** Resmî kaydın olguları; AB yolunda resmî kayıt olmadığı için üçü de `null` kalır. */
  const [facts, setFacts] = useState<B2bCompanyFacts>({ activityCode: null, foundedYear: null, isActive: null });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [reapply, setReapply] = useState(false);

  const b2b = useProfessionals(locale, input.vatNumber);
  const applicant = b2b.status === 'ready' ? b2b.applicant : null;

  /*
    Ön dolgu profildeki künyeden, ama yazılanı ezmeden: form okuma bitmeden çizildiği için cevap müşteri yazarken gelebilir, bu yüzden
    yalnız boş alana ve yalnız bir kez (`prefilled`) yazılır. `email` ekranda görünmez ama doldurulur, çünkü gövde sunucunun
    oturumdan yazacağı adresin aynısını taşımalı.
  */
  const prefilled = useRef(false);
  useEffect(() => {
    if (applicant === null || prefilled.current) return;
    prefilled.current = true;
    setInput((prev) => ({
      ...prev,
      contactName: prev.contactName === '' ? applicant.contactName : prev.contactName,
      email: prev.email === '' ? applicant.email : prev.email,
      phone: prev.phone === '' ? applicant.phone : prev.phone,
    }));
  }, [applicant]);

  /*
    "Kaydolun" adımı yalnız misafire gösterilir; ölçüt `b2b.status === 'guest'`, çünkü durum okuması oturumsuz çağrıda ağa çıkmadan
    `guest`e düşer ve `useMe`ye abone olmak ikinci bir ağ okuması açardı.
  */
  const steps =
    b2b.status === 'guest'
      ? [t.steps.signUp, t.steps.review, t.steps.priceList]
      : [t.steps.review, t.steps.priceList];

  /*
    Sonucun gideceği adres yeni bir okumadan değil `GET /me/b2b`nin taşıdığı künyeden gelir, sunucu da başvuruya tam o adresi
    yazar. Misafirde `null` (adres doğrulamada girilecek), okuma sürerken ya da düşünce `undefined` (satır çizilmez).
  */
  const accountEmail =
    b2b.status === 'guest' ? null : applicant !== null && applicant.email !== '' ? applicant.email : undefined;

  const noticeForIssues = useCallback(
    (issues: readonly B2bApplicationField[]): string => {
      const notice = b2bIssueNotice(input.kind, issues);
      if (notice.kind === 'siret_length') return t.errors.siretLength;
      if (notice.kind === 'account_email') return t.errors.accountEmail;
      return t.errors.incomplete.replace('{fields}', notice.fields.map((field) => t.form[field]).join(' · '));
    },
    [input.kind, t],
  );

  const send = useCallback(async () => {
    /* Numara tamsa blok kendiliğinden açılır: kapalı bir bloğun eksik alanını "tamamlayın" demek,
       kullanıcıyı göremediği bir kapıya yollardı. */
    if (input.kind === 'siret' && normalizeSiret(input.siret).length === 14) setCompanyOpen(true);

    // Denetim iki yerde: burada kullanıcı için (anında ve alan adlarıyla), sunucuda güvenlik için. `email` bu ön denetimden
    // çıkarılır, çünkü alan formda yok ve süzülmezse misafirin gönderimi ekranın kendi kapısında durur, kimlik çekmecesi açılmazdı.
    const issues = b2bApplicationIssues(input).filter((field) => field !== 'email');
    if (issues.length > 0) {
      setNotice(noticeForIssues(issues));
      return;
    }
    setNotice(null);

    const outcome = await b2b.submit(input, facts);
    if (outcome.kind === 'ok') {
      setIdentityOpen(false);
      setSent(true);
      return;
    }
    if (outcome.kind === 'unauthorized') {
      // Kimlik henüz yok: çekmece açılır ve doğrulama bitince bu fonksiyon YENİDEN çağrılır.
      setIdentityOpen(true);
      return;
    }
    if (outcome.kind === 'issues') {
      setNotice(noticeForIssues(outcome.issues));
      return;
    }
    setNotice(outcome.errorKey === CLIENT_ERROR.network ? t.errors.network : t.errors.unexpected);
  }, [b2b, facts, input, noticeForIssues, t]);

  const signIn = useOtpSignIn({
    locale,
    invalidEmailText: t.identity.emailInvalid,
    onSignedIn: () => void send(),
  });

  /** Kayıt bulunamasa da şirket bloğu açılır, ki aday elle devam edebilsin. */
  const lookup = useCallback(async () => {
    if (normalizeSiret(input.siret).length !== 14) {
      setNotice(t.errors.siretLength);
      setCompanyOpen(false);
      return;
    }
    const outcome = await b2b.lookup(input.siret);
    setCompanyOpen(true);
    if (outcome.status === 'found') {
      const company = outcome.company;
      setInput((prev) => ({
        ...prev,
        legalName: company.legalName,
        line1: company.line1,
        postalCode: company.postalCode,
        city: company.city,
      }));
      setFacts({ activityCode: company.activityCode, foundedYear: company.foundedYear, isActive: company.isActive });
      setNotice(null);
      return;
    }
    // Kayıt gelmediyse OLGULAR da gelmez: eski bir sorgunun künyesini yeni numaraya iliştirmek,
    // operatöre başka bir şirketin sinyalini gösterirdi.
    setFacts({ activityCode: null, foundedYear: null, isActive: null });
    setNotice(
      outcome.status === 'not_found'
        ? t.errors.siretNotFound
        : outcome.status === 'unavailable'
          ? t.errors.registryDown
          : t.errors.network,
    );
  }, [b2b, input.siret, t]);

  const change = (patch: Partial<B2bApplicationInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
    // Yazmaya başlayınca eski ret düşer: kapanmış bir kapının uyarısı ekranda durmaz.
    setNotice(null);
  };

  /** Yol değişince kimlik ve künye alanları SIFIRLANIR: iki yolun künyesi birbirinin yerine geçmez. */
  const changeKind = (kind: B2bApplicationKind) => {
    if (kind === input.kind) return;
    setCompanyOpen(false);
    setNotice(null);
    setFacts({ activityCode: null, foundedYear: null, isActive: null });
    setInput((prev) => ({ ...prev, kind, siret: '', vatNumber: '', legalName: '', line1: '', postalCode: '', city: '' }));
  };

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="pro-back" />}
      testID="pro-appbar"
    />
  );

  /* Başvurusu olan aday formu görmez; `rejected`te "Yeniden başvur" formu geri açar, çünkü ret silinmez, eskir. Okuma düştüyse de
     form açılır, yoksa çalışan sayfa bir okuma arızası yüzünden kapanırdı. */
  if (!sent && applicant !== null && applicant.status !== 'none' && !reapply) {
    const rejected = applicant.status === 'rejected';
    return (
      <View style={styles.screen}>
        {bar}
        <ScrollView contentContainerStyle={styles.content} testID="pro-status">
          {/* Tam ekran değil, çünkü blok kaydırma kabının içinde ve altında ret gerekçesi durabilir. */}
          <EmptyState
            fill={false}
            icon={<Icon name="mail" size={theme.size.emptyIcon} color={theme.colors['olive-dark']} />}
            title={
              applicant.status === 'pending'
                ? t.status.pendingTitle
                : applicant.status === 'approved'
                  ? t.status.approvedTitle
                  : t.status.rejectedTitle
            }
            description={
              applicant.status === 'pending'
                ? t.status.pending
                : applicant.status === 'approved'
                  ? t.status.approved
                  : t.status.rejected
            }
            action={
              <PrimaryButton
                label={rejected ? t.status.reapply : t.status.toCatalog}
                shape="pill"
                onPress={rejected ? () => setReapply(true) : () => router.push('/catalog')}
                testID="pro-status-cta"
              />
            }
            testID="pro-status-block"
          />

          {/* Gerekçe gösterilir, çünkü sebebini bilmeyen aday aynı eksikle yeniden başvurur ve aynı kuyruğu ikinci kez meşgul eder. */}
          {rejected && applicant.rejectReason !== null ? (
            <View style={styles.reason}>
              <Text style={styles.reasonTitle}>{t.status.reasonTitle}</Text>
              <Note tone="terracotta" description={applicant.rejectReason} testID="pro-reject-reason" />
              {applicant.rejectReasonTranslated ? <Text style={styles.note}>{t.status.translated}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  if (sent) {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<Icon name="mail" size={theme.size.emptyIcon} color={theme.colors['olive-dark']} />}
          title={t.sent.title}
          description={t.sent.body}
          action={
            /* Çıkış katalog, hesap değil: onay gelene kadar yapılabilecek şey perakende fiyatla alışverişe devam etmek. */
            <PrimaryButton
              label={t.sent.cta}
              shape="pill"
              onPress={() => router.push('/catalog')}
              testID="pro-sent-cta"
            />
          }
          testID="pro-sent"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {bar}
      {/* Kitin kaydırıcısı, çünkü klavye açıkken alanı görünür tutar ve ilk dokunuşu yutmaz. */}
      <FormScroll contentContainerStyle={styles.content} testID="pro-form">
        <View style={styles.hero}>
          {/* Büyük harf dilin kuralıyla, çünkü stilin `textTransform`u Android'de cihazın dilini kullanır. */}
          <Text style={styles.heroEyebrow}>{upperIn(t.hero.eyebrow, locale)}</Text>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero.title}
          </Text>
          <Text style={styles.heroBody}>{t.hero.body}</Text>
        </View>

        {/* Numara ekran okuyucuya da okunur, çünkü sıranın kendisi bilgi taşır. */}
        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow} accessible accessibilityLabel={`${index + 1}. ${step}`}>
              <View style={styles.stepDot}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.stepLabel}>{step}</Text>
            </View>
          ))}
        </View>

        <ApplicationForm
          t={t}
          input={input}
          onChange={change}
          onKindChange={changeKind}
          companyOpen={companyOpen}
          looking={b2b.looking}
          onLookup={() => void lookup()}
          vatValid={b2b.vatValid}
          vatChecking={b2b.vatChecking}
          submitting={b2b.submitting}
          notice={notice}
          accountEmail={accountEmail}
          onSubmit={() => void send()}
        />

        <PressableSurface
          onPress={() => void Linking.openURL(whatsappHref())}
          feedback="opacity"
          style={styles.whatsappRow}
          accessibilityLabel={t.whatsapp}
          testID="pro-whatsapp"
        >
          <Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors['brand-whatsapp-pure']} />
          <Text style={styles.whatsappLabel}>{t.whatsapp}</Text>
        </PressableSurface>
      </FormScroll>

      {/* Çekmece kapanırsa form olduğu gibi kalır, ki müşteri doldurduğunu kaybetmeden sonra gönderebilsin. */}
      <BottomSheet
        visible={identityOpen}
        title={t.identity.sheetTitle}
        onClose={() => {
          setIdentityOpen(false);
          signIn.reset();
        }}
        testID="pro-identity-sheet"
      >
        <View style={styles.identity}>
          {signIn.phase === 'email' ? <Text style={styles.note}>{t.identity.intro}</Text> : null}
          <OtpSignInFields signIn={signIn} copy={t.identity} testID="pro-identity" />
        </View>
      </BottomSheet>
    </View>
  );
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
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['6xl'],
    paddingHorizontal: theme.space['5xl'],
    gap: theme.space.lg,
  },
  heroEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    // Harf aralığı token'da `em`; dp'ye çeviri tek yerde (`theme/parse`), ham çarpan yazılmaz.
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    textTransform: 'uppercase',
    color: theme.colors['accent-leaf'],
  },
  heroTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    lineHeight: theme.text['h2-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors['sand-50'],
  },
  heroBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['on-image-soft'],
  },

  steps: {
    gap: theme.space.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  stepDot: {
    width: theme.size.markBox,
    height: theme.size.markBox,
    borderRadius: theme.size.markBox / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['olive-bg'],
  },
  stepNumber: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  stepLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },

  reason: {
    gap: theme.space.md,
  },
  reasonTitle: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  identity: {
    gap: theme.space.lg,
  },

  whatsappRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.xs,
  },
  whatsappLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },
}));
