import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import {
  b2bApplicationIssues,
  normalizeSiret,
  type B2bApplicationField,
  type B2bApplicationInput,
  type B2bApplicationKind,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { CLIENT_ERROR } from '@/lib/api/client';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { publishToast } from '@/lib/toast/toast-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { OtpSignInFields } from '@/screens/customer-kit/otp-sign-in-fields';
import { useOtpSignIn } from '@/screens/customer-kit/use-otp-sign-in.hook';
import { emToDp } from '@/theme/parse';
import { ApplicationForm } from './application-form';
import { emptyApplication, type FieldLabelKey, type Messages } from './professionals-types';
import { useProfessionals } from './use-professionals.hook';
import messages from './messages.json';

/*
  PROFESYONEL BAŞVURUSU (v3 `vPro`) — vitrindeki davet kutusunun hedefi.

  İKİ HÂL, şablonun kendi ayrımı: `pr.notSent` (tanıtım + adımlar + form + WhatsApp satırı) ve
  `pr.sent` (ortalanmış onay bloğu). Onay hâli gövdenin TAMAMINI değiştirir — tanıtım da düşer,
  çünkü başvurmuş birine "başvurun" demenin anlamı yok (v3:66-73).

  ── AKIŞ BURADA, ALANLAR FORMDA (21.31) ─────────────────────────────────────
  Üç uç bağlandı (`GET /b2b/company/:siret` · `GET /b2b/vat/:number` · `POST /me/b2b/application`)
  ve akışın tamamı bu dosyada: resmî kaydı getir → alanları doldur → motorla denetle → gönder →
  gerekirse kimlik adımını aç → aynı gövdeyle tekrar dene. Form yalnız çizer.

  **DÖRT HÂL DAHA VAR** ve ikisi başvurudan önce gelir (`GET /me/b2b`): `pending` (inceleniyor),
  `approved` (onaylandı), `rejected` (gerekçesiyle) — başvurmuş birine yeniden form göstermek,
  aynı kuyruğu ikinci kez meşgul etmeye davet olurdu. `none` ve misafir formu görür.

  ── KİMLİK, GÖNDERİRKEN İSTENİR ─────────────────────────────────────────────
  Kullanıcı kararı (11.08): "kullanıcı başvurmadan önce giriş yaparsa daha iyi olur, ama başvuru
  formunda da giriş yöntemini seçip OTP kodunu girebilir". İkisi de karşılanıyor: girişli müşteri
  hiçbir ek adım görmez (jeton zaten var), misafirin formu ise gönderirken bir çekmece açar —
  e-posta → altı haneli kod → oturum → başvuru KENDİLİĞİNDEN gider. Yeni altyapı yok: bölge talebi
  çekmecesinin mekaniği (`use-otp-sign-in`) ve alanları (`otp-sign-in-fields`) paylaşılan.
  Kapının kendisi SUNUCUDA: `POST /me/b2b/application` Bearer istiyor, ekran 401'i "önce kimlik"
  diye okuyor — yani doğrulama istemcinin iyi niyetine bağlı değil.

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **Onay bloğu kitin `EmptyState`i.** v3'ün ölçüleri (`padding:70px 32px`, ortalanmış ikon ·
     başlık · gövde · hap düğme) kitin boş durumuyla zaten aynı iskelet; ikinci bir ortalanmış
     blok yazmak aynı yerleşimin ikinci kopyası olurdu. Başlık kitin kademesinde (18) kalıyor,
     şablonun 22'sinde değil — ekran başlığı kademesi kite ait bir karar.
  2. **İkon zarf, kâğıt uçak değil.** v3 bir kâğıt uçak çiziyor; o geometri ne kitin sözlüğünde
     ne müşteri tamamlayıcısında var ve ikisi de bu şeridin yazma alanı dışında. Zarf hem mevcut
     hem cümlenin kendisiyle aynı şeyi söylüyor ("sonucu e-posta ile bildireceğiz"); webin onay
     kartı da zarf kullanıyor (📨). İhtiyaç raporlandı.
  3. **WhatsApp satırı sohbeti AÇMAZ, "çok yakında" der.** Numara `@lezzet/brand`te ve o paket
     `apps/mobile`ın bağımlılığı değil; uydurma bir numaraya bağlantı kurmaktansa giriş ekranının
     kurulu davranışı tekrarlandı (`login-screen` WhatsApp düğmesi — web'le de aynı bilgi).
     Mesaj v3'ün kendi toast'ıyla veriliyor (v3:854 `pr.wa`).
*/

export function ProfessionalsScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [input, setInput] = useState<B2bApplicationInput>(emptyApplication);
  /** Resmî kayıttan gelen olgular — aday YAZMAZ, taşır (sözleşme künyesi); AB yolunda üçü de null. */
  const [facts, setFacts] = useState<B2bCompanyFacts>({ activityCode: null, foundedYear: null, isActive: null });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  /** Reddedilen aday "Yeniden başvur"a bastı — durum bloğu kalkar, form geri gelir. */
  const [reapply, setReapply] = useState(false);

  const b2b = useProfessionals(locale, input.vatNumber);
  const applicant = b2b.status === 'ready' ? b2b.applicant : null;

  /*
    ── ÖN DOLGU: PROFİLDEKİ KÜNYE, AMA YAZILANI EZMEDEN (MB-05) ──────────────
    Sözleşme üç alanı zaten taşıyor ve künyesi "form ön dolgusu" diyor
    (`b2b-api.schema.ts` `B2bApplicantSchema`); ekran okuyordu ama kullanmıyordu — girişli müşteri
    sistemin bildiği üç şeyi yeniden yazıyordu.

    İKİ KORUMA VAR ve ikisi de ölçülen bir yarışa karşı: form okuma BİTMEDEN çiziliyor (`loading`
    hâlinde de `pro-form` görünür — beklemeyi kaldırmak yerine formu göstermemek çalışan bir
    sayfayı bir okuma gecikmesine bağlamak olurdu), dolayısıyla cevap müşteri yazarken gelebilir.
    · Alan bazlı: yalnız BOŞ alana yazılır — dolu alan müşterinin kendi metnidir, üstüne yazmak
      klavyenin altındaki bir alanı sessizce değiştirmek olurdu.
    · Bir kereye mahsus: `prefilled` bayrağı. Gönderim sonrası `applicant` yeniden set ediliyor
      (`use-professionals` `submit`); bayrak olmasaydı boşaltılmış bir alan o anda geri dolardı.

    `email` artık EKRANDA GÖRÜNMÜYOR (MB-04) ama dolduruluyor: sözleşmede alan duruyor (motor ve
    şema web'le ortak, kaldırma kararı iki yüzeyin) ve gövdenin yalan taşımaması gerek — girişli
    müşterinin gövdesindeki adres, sunucunun oturumdan yazacağı adresin AYNISI olur. Misafirde
    boş gider; sunucu zaten gövdeye bakmıyor.
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
    ── ÜÇ ADIM, GİRİŞLİYE İKİ (MB-08) ───────────────────────────────────────
    "Kaydolun" adımı yalnız MİSAFİRE gösterilir: hesabı olana kayıt anlatmak, yapılmış bir işi
    yapılacak gibi göstermektir.

    Ölçüt `b2b.status === 'guest'` ve bu bilerek `useMe` DEĞİL: durum okuması (`GET /me/b2b`)
    zaten Bearer istiyor ve oturumsuz çağrı ağa hiç çıkmadan yerel 401 ile `guest`e düşüyor
    (kancanın künyesi) — yani cevap elimizde, `useMe`ye abone olmak İKİNCİ bir ağ okuması açardı
    (`use-me.hook`: "abone olmak ağa çıkmaktır"). `loading`/`error` hâllerinde adım ÇİZİLMEZ:
    misafirden bir adımı bir an gizlemek zararsız, girişliye kayıt adımı göstermek ise
    düzeltmeye çalıştığımız arızanın kendisi.
  */
  const steps =
    b2b.status === 'guest'
      ? [t.steps.signUp, t.steps.review, t.steps.priceList]
      : [t.steps.review, t.steps.priceList];

  /*
    ── SONUÇ HANGİ ADRESE GİDİYOR (MB-04) ────────────────────────────────────
    Adres YENİ BİR OKUMADAN gelmiyor: `GET /me/b2b` zaten profildeki künyeyi taşıyor
    (`B2bApplicantSchema.email` = `user_profiles.email`, `readB2bApplicant`) ve sunucu başvuruya
    da tam o adresi yazıyor — yani ekranda gösterilen ile kayda giren AYNI kaynak. `useMe`ye
    abone olmak İKİNCİ bir ağ turu açardı (adım künyesindeki ölçütün aynısı).

    Üç değer: misafirde `null` (adres henüz yok, doğrulama adımında girilecek), okuma sürerken ya
    da düştüğünde `undefined` (satır çizilmez — bir an yanlış vaat okutmaktansa hiç okutmamak).
  */
  const accountEmail =
    b2b.status === 'guest' ? null : applicant !== null && applicant.email !== '' ? applicant.email : undefined;

  /** Motorun alan adları → sözlük anahtarları; `kind` bir alan değil, yol (tipte de ayrık). */
  const noticeForIssues = useCallback(
    (issues: readonly B2bApplicationField[]): string => {
      if (input.kind === 'siret' && issues.includes('siret')) return t.errors.siretLength;
      const labels = issues
        // `email` de dışarıda: formda o kutu YOK (MB-04), müşterinin düzeltebileceği bir yer
        // göstermeyen bir alan adını cümleye yazmak, olmayan bir kutuyu aramaya yollamaktır.
        .filter((field): field is FieldLabelKey => field !== 'kind' && field !== 'email')
        .map((field) => t.form[field]);
      /* Geriye ad kalmadıysa ret HESABIN adresindendir (profilde e-posta yok — telefonla açılmış
         taslak kayıt). Sessiz geçilemez: "Şu alanları kontrol edin: " diye boş biten bir cümle,
         müşteriye gösterilecek en kötü şeydi. Çözüm müşterinin elinde: yeniden giriş. */
      if (labels.length === 0) return t.errors.accountEmail;
      return t.errors.incomplete.replace('{fields}', labels.join(' · '));
    },
    [input.kind, t],
  );

  /** Gönderim — kimlik gerekirse çekmeceyi açar; oturum kurulunca aynı gövde tekrar yola çıkar. */
  const send = useCallback(async () => {
    /* Numara tamsa blok kendiliğinden açılır: kapalı bir bloğun eksik alanını "tamamlayın" demek,
       kullanıcıyı göremediği bir kapıya yollamaktı. */
    if (input.kind === 'siret' && normalizeSiret(input.siret).length === 14) setCompanyOpen(true);

    // Denetim İKİ yerde ve bu tekrar değil: buradaki kullanıcı için (anında ve alan adlarıyla),
    // sunucudaki güvenlik için (form atlanarak da o kapıya istek atılabilir).
    //
    /* `email` bu ön denetimden ÇIKARILIR (MB-04) ve gerekçe ölçüldü: motor alanı zorunlu tutuyor
       (`b2bApplicationIssues` → `isValidEmail`), alan ise formdan kalktı. Süzmeseydik misafirin
       `input.email`i boş kalacağı için gönderim ekranın kendi kapısında durur, istek uca HİÇ
       çıkmaz, 401 gelmez ve KİMLİK ÇEKMECESİ AÇILMAZDI — yani başvuru yolu tamamen kapanırdı.
       Kural gevşemiyor, yalnız yer değiştiriyor: adresi sunucu oturumdan yazıyor ve aynı motoru
       orada bir kez daha koşuyor (gövdeden gelen değerin önemi yok, ezilir). */
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

  /** "Bul" — resmî kayıt; bulunamasa da blok AÇILIR, aday elle devam edebilsin (kapının künyesi). */
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

  /* BAŞVURUSU OLAN ADAY FORMU GÖRMEZ. `rejected`te "Yeniden başvur" formu geri açar — ret SİLMEZ,
     ESKİR (motorun künyesi: yeniden başvuru damgası ret damgasının önüne geçer). `none` ve misafir
     doğrudan forma düşer; okuma düştüyse de form açılır — beklemeyi kaldırmak yerine formu
     göstermemek, çalışan bir sayfayı bir okuma arızası yüzünden kapatmak olurdu. */
  if (!sent && applicant !== null && applicant.status !== 'none' && !reapply) {
    const rejected = applicant.status === 'rejected';
    return (
      <View style={styles.screen}>
        {bar}
        <ScrollView contentContainerStyle={styles.content} testID="pro-status">
          <EmptyState
            icon={<CustomerIcon name="mail" size={theme.size.emptyIcon} color={theme.colors['olive-dark']} />}
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

          {/* Gerekçe bir nezaket değil akışın kendisi: sebebini bilmeyen aday aynı eksikle yeniden
              başvurur ve aynı kuyruğu ikinci kez meşgul eder (okuma kapısının künyesi). */}
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
          icon={<CustomerIcon name="mail" size={theme.size.emptyIcon} color={theme.colors['olive-dark']} />}
          title={t.sent.title}
          description={t.sent.body}
          action={
            /* Çıkış KATALOG, hesap değil: onay gelene kadar yapılabilecek şey alışverişe devam
               etmek — ve perakende fiyatla gezilebildiği hemen üstteki cümlede yazılı. */
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
      {/* Kaydırıcı KİTTEN: klavye açıkken hem alanı görünür tutar hem ilk dokunuşu yutmaz
          (`form-scroll` künyesi — ikisi de bu ekranda ölçülmüş arızalar). */}
      <FormScroll contentContainerStyle={styles.content} testID="pro-form">
        {/* Tanıtım kartı — v3'ün mürekkep bloğu: üstbaşlık · vaat · gerekçe. */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t.hero.eyebrow}</Text>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero.title}
          </Text>
          <Text style={styles.heroBody}>{t.hero.body}</Text>
        </View>

        {/* Adımlar — numara dairesi, sıranın kendisi bilgi taşıdığı için ekran okuyucuya da gider.
            Kaç adım olduğunu kimlik belirler (yukarıdaki künye); numara listeden türer, sabit değil. */}
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
          onPress={() => publishToast(t.whatsappSoon)}
          feedback="opacity"
          style={styles.whatsappRow}
          accessibilityLabel={t.whatsapp}
          testID="pro-whatsapp"
        >
          <Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors['brand-whatsapp-pure']} />
          <Text style={styles.whatsappLabel}>{t.whatsapp}</Text>
        </PressableSurface>
      </FormScroll>

      {/* KİMLİK ADIMI — yalnız misafirde ve yalnız GÖNDERİM anında. Kapanırsa form olduğu gibi
          durur: doldurulan alanlar kaybolmaz, müşteri isterse sonra gönderir. */}
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
  /* v3: `padding:18px` · `gap:16px` — ikisi de ölçekten aynen (4xl · 3xl). */
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },

  /* v3: mürekkep zemin · `radius:20` · `padding:22px 20px` · `gap:10`. */
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

  /* v3: satırlar `gap:8`, satır içi `gap:10`, daire 26 zeytin zeminli. */
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

  /** Ret gerekçesi bloğu — durum kutusunun altında, kendi başlığıyla. */
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
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
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
