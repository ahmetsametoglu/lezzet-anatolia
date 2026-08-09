import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import {
  applicationIssues,
  emptyApplication,
  formatSiret,
  isGermanVatNumber,
  normalizeSiret,
  normalizeVatNumber,
  type ApplicationField,
  type ApplicationInput,
  type ApplicationKind,
  type Messages,
} from './professionals-types';

/*
  BAŞVURU FORMU (v3 `vPro`nun `pr.notSent` gövdesi) — iki yol, tek gönderim.

  ── BEKLEYEN(21.14): GÖNDERİM UCU YOK ───────────────────────────────────────
  `apps/mobile-api` bugün B2B başvurusu için ÜÇ ucun hiçbirini taşımıyor: resmî kayıt okuması
  (webin `lookupSiretAction`), AB vergi numarası doğrulaması (`checkVatAction`) ve başvurunun
  kendisi (`applyAsCustomerAction`/`verifyAndApplyAction`). Uydurma bir uç ÇAĞRILMADI; gönderim
  ekranın durumunda kalıyor ve onay bloğuna dönüyor — 21.14'ün "uç yoksa ekran TAM çalışır"
  kuralının aynısı (talep formunun kararıyla da aynı: `screens/support/new-ticket-screen`).

  ── ŞABLONDAN SAPMALAR, hepsi eksik ucun sonucu ─────────────────────────────
  1. **"Bul" düğmesi kayıt OKUMAZ, formu AÇAR.** v3'te düğme resmî kayıttan künyeyi getirip
     onay kartına yazıyor (v3:34-42). Kayıt kapısı yokken o kartı çizmek, olmayan bir kaynaktan
     geldiğini söyleyen bir veri göstermek olurdu. Düğme yerinde ve gerçek iş yapıyor: numaranın
     biçimini denetliyor ve şirket bloğunu açıyor — künye aynı yerde beliriyor, farkı YAZAN
     tarafın kim olduğu. Metin bunu açıkça söylüyor (`form.siretNote`).
  2. **Şirket adresi İKİ yolda da elle giriliyor.** Motor adresi iki yolda da zorunlu tutuyor
     (`b2b-application` künyesi: adres yoksa onay kartının rota sinyali ölçülemez kalır); SIRET
     yolunda web onu kayıttan dolduruyor, biz dolduramıyoruz. Alanları hiç sormamak, sunucuya
     eksik bir başvuru göndermek demekti.
  3. **AB numarasının ✓ işareti BİÇİM işareti** (v3'ün `DE`+9 kuralı), servis doğrulaması değil;
     ayrımın gerekçesi `professionals-types` künyesinde.
  4. **"Gönderiliyor…" ara hâli YOK** — bekleyecek bir ağ turu yok. Uç bağlandığında düğmenin
     `disabled` kapısı ve webin `form.submitting` metni birlikte gelir.
*/

interface ApplicationFormProps {
  t: Messages;
  /** Gönderim tamamlandı — ekran onay bloğuna geçer (v3'te `pr.sent`). */
  onSubmitted: () => void;
}

export function ApplicationForm({ t, onSubmitted }: ApplicationFormProps) {
  const [input, setInput] = useState<ApplicationInput>(emptyApplication);
  /**
   * Şirket bloğu açık mı. SIRET yolunda "Bul"la açılır; AB yolunda zaten açıktır (orada künye
   * ZATEN elle giriliyor, web de öyle yapıyor — açılacak bir şey yok).
   */
  const [companyOpen, setCompanyOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isSiret = input.kind === 'siret';
  const showCompany = companyOpen || !isSiret;

  const set = (patch: Partial<ApplicationInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
    // Yazmaya başlayınca eski ret düşer: kapanmış bir kapının uyarısı ekranda durmaz.
    setNotice(null);
  };

  /** Yol değişince kimlik alanları SIFIRLANIR: iki yolun künyesi birbirinin yerine geçmez. */
  const switchKind = (kind: ApplicationKind) => {
    if (kind === input.kind) return;
    setCompanyOpen(false);
    setNotice(null);
    setInput((prev) => ({ ...prev, kind, siret: '', vatNumber: '', legalName: '', line1: '', postalCode: '', city: '' }));
  };

  /** Şablonun "Bul"u — kayıt okuyamadığı için numarayı denetler ve künye bloğunu açar. */
  const openCompany = () => {
    if (normalizeSiret(input.siret).length !== 14) {
      setNotice(t.errors.siretLength);
      setCompanyOpen(false);
      return;
    }
    setNotice(null);
    setCompanyOpen(true);
  };

  const submit = () => {
    /* Numara tamsa blok kendiliğinden açılır: kapalı bir bloğun eksik alanını "tamamlayın" demek,
       kullanıcıyı göremediği bir kapıya yollamaktı. */
    if (isSiret && normalizeSiret(input.siret).length === 14) setCompanyOpen(true);

    const issues = applicationIssues(input);
    if (issues.length > 0) {
      setNotice(retFor(issues, input.kind, t));
      return;
    }
    setNotice(null);
    // BEKLEYEN(21.14): gönderim ucu bağlandığında çağrı buraya girer; bugün onay ekranda kalır.
    onSubmitted();
  };

  return (
    <View style={styles.form}>
      {/* İki yol — seçim birbirini dışlıyor, o yüzden `tab` rolü ve `selected` bayrağı. */}
      <View style={styles.tabs}>
        <KindTab label={t.form.tabSiret} active={isSiret} onPress={() => switchKind('siret')} testID="pro-tab-siret" />
        <KindTab label={t.form.tabVat} active={!isSiret} onPress={() => switchKind('eu_vat')} testID="pro-tab-vat" />
      </View>

      {isSiret ? (
        <View style={styles.block}>
          <Text style={styles.note}>{t.form.siretNote}</Text>
          <TextField
            value={formatSiret(input.siret)}
            onChangeText={(value) => set({ siret: normalizeSiret(value).slice(0, 14) })}
            accessibilityLabel={t.form.siret}
            placeholder={t.form.siret}
            shape="pill"
            numeric
            trailing={
              <PressableSurface
                onPress={openCompany}
                feedback="scale-small"
                style={styles.fetch}
                accessibilityLabel={t.form.fetch}
                testID="pro-fetch"
              >
                <Text style={styles.fetchLabel}>{t.form.fetch}</Text>
              </PressableSurface>
            }
            testID="pro-siret"
          />
        </View>
      ) : (
        <View style={styles.block}>
          <TextField
            value={input.vatNumber}
            onChangeText={(value) => set({ vatNumber: normalizeVatNumber(value).slice(0, 11) })}
            accessibilityLabel={t.form.vatNumber}
            placeholder={t.form.vatNumber}
            shape="pill"
            trailing={
              isGermanVatNumber(input.vatNumber) ? (
                <Text style={styles.vatMark} testID="pro-vat-valid">
                  {t.form.vatValid}
                </Text>
              ) : null
            }
            testID="pro-vat"
          />
          <Text style={styles.note}>{t.form.vatNote}</Text>
        </View>
      )}

      {showCompany ? (
        <View style={styles.block} testID="pro-company">
          <Text style={styles.heading} accessibilityRole="header">
            {t.form.companyTitle}
          </Text>
          <TextField
            value={input.legalName}
            onChangeText={(value) => set({ legalName: value })}
            accessibilityLabel={t.form.legalName}
            placeholder={t.form.legalName}
            shape="pill"
            testID="pro-legal-name"
          />
          <TextField
            value={input.line1}
            onChangeText={(value) => set({ line1: value })}
            accessibilityLabel={t.form.line1}
            placeholder={t.form.line1}
            shape="pill"
            testID="pro-line1"
          />
          {/* Posta kodu dar, şehir geniş — webin 1 : 1,6 oranı (kod beş hane, şehir adı uzun). */}
          <View style={styles.pairRow}>
            <View style={styles.pairNarrow}>
              <TextField
                value={input.postalCode}
                onChangeText={(value) => set({ postalCode: value })}
                accessibilityLabel={t.form.postalCode}
                placeholder={t.form.postalCode}
                shape="pill"
                numeric
                testID="pro-postal-code"
              />
            </View>
            <View style={styles.pairWide}>
              <TextField
                value={input.city}
                onChangeText={(value) => set({ city: value })}
                accessibilityLabel={t.form.city}
                placeholder={t.form.city}
                shape="pill"
                testID="pro-city"
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.heading} accessibilityRole="header">
          {t.form.contactTitle}
        </Text>
        <TextField
          value={input.contactName}
          onChangeText={(value) => set({ contactName: value })}
          accessibilityLabel={t.form.contactName}
          placeholder={t.form.contactName}
          shape="pill"
          testID="pro-contact-name"
        />
        <TextField
          value={input.email}
          onChangeText={(value) => set({ email: value })}
          accessibilityLabel={t.form.email}
          placeholder={t.form.email}
          shape="pill"
          content="email"
          testID="pro-email"
        />
        <TextField
          value={input.phone}
          onChangeText={(value) => set({ phone: value })}
          accessibilityLabel={t.form.phone}
          placeholder={t.form.phone}
          shape="pill"
          testID="pro-phone"
        />
      </View>

      {notice === null ? null : (
        <Text style={styles.notice} accessibilityRole="alert" testID="pro-notice">
          {notice}
        </Text>
      )}

      <PrimaryButton label={t.form.submit} onPress={submit} testID="pro-submit" />
    </View>
  );
}

/**
 * Ret CÜMLESİ — tek satır, ama NE eksik olduğunu söyleyen bir satır.
 *
 * v3 de tek satır basıyor (`pr.err`) ve o satır her seferinde eksiği ADIYLA anıyor ("Ad soyad ve
 * geçerli bir e-posta gerekli."). Şablonun üç sabit cümlesi yerine alan adları sözlükten
 * toplanıyor: hangi alanların sorulduğu değişince cümle kendiliğinden doğru kalıyor. SIRET'in
 * kendi cümlesi korundu — "14 hane" bilgisi bir alan adından çıkmaz.
 */
function retFor(issues: readonly ApplicationField[], kind: ApplicationKind, t: Messages): string {
  if (kind === 'siret' && issues.includes('siret')) return t.errors.siretLength;
  // Alan adı = sözlük anahtarı (`form.email`, `form.postalCode`…); ikinci bir eşleme tablosu yok.
  return t.errors.incomplete.replace('{fields}', issues.map((field) => t.form[field]).join(' · '));
}

interface KindTabProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}

/**
 * Yol seçici hap — v3: iki hap, `flex:1`, seçili olan zeytin dolgu (v3:26-27).
 *
 * Kitin `Chip`i KULLANILMADI: `alignSelf:'flex-start'` ile içeriği kadar genişliyor ve bu ekranda
 * iki hap ekranı EŞİT bölmek zorunda (bir sekme çiftidir, iki süzgeç çipi değil). Kite tam
 * genişlikli bir ikili seçici ihtiyacı raporlandı.
 */
function KindTab({ label, active, onPress, testID }: KindTabProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale-small"
      selected={active}
      accessibilityRole="tab"
      accessibilityLabel={label}
      style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
      testID={testID}
    >
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle]} numberOfLines={1}>
        {label}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space['3xl'],
  },
  block: {
    gap: theme.space.lg,
  },
  heading: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },

  /* v3: iki hap yan yana, `gap:8`, her biri `flex:1` · `padding:12px 0` · `radius:14` ·
     `border:1.5px solid ink`. Yarıçap resmî sete çekildi (14 → kontrol 16). */
  tabs: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space.xl,
    borderWidth: theme.border.base,
    borderRadius: theme.radius.control,
  },
  tabIdle: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.ink,
  },
  tabActive: {
    backgroundColor: theme.colors.olive,
    borderColor: theme.colors.ink,
  },
  tabLabel: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.control,
  },
  tabLabelIdle: { color: theme.colors.ink },
  tabLabelActive: { color: theme.colors.card },

  /* v3: `height:50 · padding:0 20 · radius:22 · bg ink · color #f3efe2 · 700 13px`. Kitte MÜREKKEP
     tonlu düğme yok (birincil zeytin, ikincil çerçeveli) — ihtiyaç raporlandı. */
  fetch: {
    height: theme.size.controlMd,
    justifyContent: 'center',
    paddingHorizontal: theme.space['5xl'],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.ink,
  },
  fetchLabel: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors['sand-50'],
  },

  vatMark: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors['olive-dark'],
  },

  pairRow: {
    flexDirection: 'row',
    gap: theme.space.lg,
  },
  pairNarrow: { flex: 1 },
  pairWide: { flex: 1.6 },

  notice: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['terracotta-bright'],
  },
}));
