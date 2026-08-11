import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import {
  formatSiret,
  normalizeSiret,
  normalizeVatNumber,
  type B2bApplicationInput,
  type B2bApplicationKind,
} from '@lezzet/domain-core';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import type { Messages } from './professionals-types';

/*
  BAŞVURU FORMU (v3 `vPro`nun `pr.notSent` gövdesi) — iki yol, tek gönderim.

  ── FORM ARTIK YALNIZ ÇİZER (21.31) ─────────────────────────────────────────
  Akışın kendisi (kayıt okuma → alanları doldurma → denetim → gönderim → kimlik adımı → tekrar
  deneme) EKRANDA yaşıyor; burada kalan yalnız alanlar ve dokunuşların yukarı bildirilmesi.
  Gerekçe ölçülebilir: aynı akışın parçaları iki dosyaya bölünseydi "hangi alan hangi kaynaktan
  doldu" sorusunun cevabı ikiye ayrılırdı.

  Eski künyedeki **BEKLEYEN(21.14)** kalktı: üç ucun üçü de artık var (`GET /b2b/company/:siret` ·
  `GET /b2b/vat/:number` · `POST /me/b2b/application`).

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Şirket adresi AB yolunda elle giriliyor**, SIRET yolunda resmî kayıttan gelir. Motor adresi
     iki yolda da zorunlu tutuyor (`b2b-application` künyesi: adres yoksa onay kartının rota
     sinyali ölçülemez kalır); AB yolunda resmî kayıt muadili açık bir kaynak yok.
  2. **AB numarasının işareti artık ÖLÇÜM, tahmin değil** — v3'ün `DE`+9 biçim kuralı yerine VIES
     cevabı çiziliyor ve üç değeri de ayrı: geçerli · bulunamadı · doğrulanamadı. Sonuncusu
     başvuruyu ENGELLEMEZ (üye ülke sunucuları düzenli olarak susuyor).
  3. **Kit'te MÜREKKEP tonlu düğme yok** (birincil zeytin, ikincil çerçeveli); "Bul" düğmesinin
     yüzeyi bu yüzden ekranda kuruldu — ihtiyaç raporlandı.
*/

interface ApplicationFormProps {
  t: Messages;
  input: B2bApplicationInput;
  onChange: (patch: Partial<B2bApplicationInput>) => void;
  onKindChange: (kind: B2bApplicationKind) => void;
  /** Şirket bloğu açık mı — SIRET yolunda "Bul"dan sonra açılır, AB yolunda zaten açıktır. */
  companyOpen: boolean;
  /** Resmî kayıt sorgusu uçuşta. */
  looking: boolean;
  onLookup: () => void;
  /** `undefined` = hiç sorulmadı · `null` = sorulamadı · `true/false` = VIES'in cevabı. */
  vatValid: boolean | null | undefined;
  vatChecking: boolean;
  submitting: boolean;
  /** Tek satırlık bildirim — eksik alan, kayıt bulunamadı, gönderim düştü (cümleyi ekran kurar). */
  notice: string | null;
  /**
   * Sonucun gideceği adres — ÜÇ DEĞER (vergi işaretinin aynı deseni):
   * `string` hesabın doğrulanmış adresi · `null` misafir (adres henüz yok) · `undefined` okuma
   * sürüyor ya da düştü → satır HİÇ çizilmez. Yükleme anında misafir cümlesini göstermek,
   * girişli müşteriye bir an yanlış bir vaat okutmak olurdu (ekranın adım künyesiyle aynı ölçüt).
   */
  accountEmail: string | null | undefined;
  onSubmit: () => void;
}

export function ApplicationForm({
  t,
  input,
  onChange,
  onKindChange,
  companyOpen,
  looking,
  onLookup,
  vatValid,
  vatChecking,
  submitting,
  notice,
  accountEmail,
  onSubmit,
}: ApplicationFormProps) {
  const isSiret = input.kind === 'siret';
  const showCompany = companyOpen || !isSiret;

  /** VIES'in üç cevabı + "hiç sorulmadı" — dördüncüsünde işaret HİÇ çizilmez. */
  const vatMark = vatChecking
    ? t.form.vatChecking
    : vatValid === true
      ? t.form.vatValid
      : vatValid === false
        ? t.form.vatInvalid
        : vatValid === null
          ? t.form.vatUnknown
          : null;

  return (
    <View style={styles.form}>
      {/* İki yol — seçim birbirini dışlıyor, o yüzden `tab` rolü ve `selected` bayrağı. */}
      <View style={styles.tabs}>
        <KindTab label={t.form.tabSiret} active={isSiret} onPress={() => onKindChange('siret')} testID="pro-tab-siret" />
        <KindTab label={t.form.tabVat} active={!isSiret} onPress={() => onKindChange('eu_vat')} testID="pro-tab-vat" />
      </View>

      {isSiret ? (
        <View style={styles.block}>
          <Text style={styles.note}>{t.form.siretNote}</Text>
          <TextField
            value={formatSiret(input.siret)}
            onChangeText={(value) => onChange({ siret: normalizeSiret(value).slice(0, 14) })}
            accessibilityLabel={t.form.siret}
            placeholder={t.form.siret}
            shape="pill"
            numeric
            trailing={
              <PressableSurface
                onPress={onLookup}
                feedback="scale-small"
                disabled={looking}
                style={styles.fetch}
                accessibilityLabel={t.form.fetch}
                testID="pro-fetch"
              >
                <Text style={styles.fetchLabel}>{looking ? t.form.fetching : t.form.fetch}</Text>
              </PressableSurface>
            }
            testID="pro-siret"
          />
        </View>
      ) : (
        <View style={styles.block}>
          <TextField
            value={input.vatNumber}
            onChangeText={(value) => onChange({ vatNumber: normalizeVatNumber(value).slice(0, 14) })}
            accessibilityLabel={t.form.vatNumber}
            placeholder={t.form.vatNumber}
            shape="pill"
            trailing={
              vatMark === null ? null : (
                <Text style={[styles.vatMark, vatValid === false ? styles.vatMarkBad : null]} testID="pro-vat-mark">
                  {vatMark}
                </Text>
              )
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
            onChangeText={(value) => onChange({ legalName: value })}
            accessibilityLabel={t.form.legalName}
            placeholder={t.form.legalName}
            shape="pill"
            testID="pro-legal-name"
          />
          <TextField
            value={input.line1}
            onChangeText={(value) => onChange({ line1: value })}
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
                onChangeText={(value) => onChange({ postalCode: value })}
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
                onChangeText={(value) => onChange({ city: value })}
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
          onChangeText={(value) => onChange({ contactName: value })}
          accessibilityLabel={t.form.contactName}
          placeholder={t.form.contactName}
          shape="pill"
          testID="pro-contact-name"
        />
        {/* ── E-POSTA ARTIK SORULMUYOR, GÖSTERİLİYOR (MB-04) ────────────────────────
            Kullanıcı kararı (11.08): *"profesyonel müşteriler bir kere oturum açsın, mailini
            girsin, OTP kodu gelsin ve onaylasın; bu bizim mail adresimiz olsun."* Yani başvurunun
            adresi bir GİRDİ değil, kimliğin kendisi — sunucu da kayda oturumun sahibinin adresini
            yazıyor (`apps/mobile-api/.../b2b.ts`), gövdeden geleni yok sayıyor.

            Kutu yerine satır konmasının sebebi ölçülmüş bir çelişkiydi: müşteri buraya yazdığı
            adrese cevap bekliyordu, cevap ise hesabın adresine gidiyordu. Boş bırakmak da olmazdı
            — onay ekranı "sonucu e-posta ile bildireceğiz" diyor; NEREYE olduğunu söylemeyen bir
            vaat, müşteriyi kendi gelen kutusunu tahmin etmeye bırakır. */}
        {accountEmail === undefined ? null : (
          <View style={styles.mailTo} testID="pro-mail-to">
            <Text style={styles.note}>{accountEmail === null ? t.form.resultToGuest : t.form.resultTo}</Text>
            {accountEmail === null ? null : (
              <Text style={styles.mailToValue} testID="pro-account-email">
                {accountEmail}
              </Text>
            )}
          </View>
        )}
        <TextField
          value={input.phone}
          onChangeText={(value) => onChange({ phone: value })}
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

      <PrimaryButton
        label={submitting ? t.form.submitting : t.form.submit}
        onPress={onSubmit}
        disabled={submitting}
        testID="pro-submit"
      />
    </View>
  );
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
 *
 * ── ROZETİN BOZUKLUĞUNUN SEBEBİ ÖLÇÜLDÜ (MB-07) ────────────────────────────
 * Şikâyet "yatay dolgu yok, metin kenarlığa yapışıyor"du; sebep dolgu DEĞİL, `flex: 1`in hiç
 * uygulanmamasıydı: `PressableSurface` çağıranın stilini İÇ yüzeye veriyor, dış `Pressable`a
 * geçmiyor — iç yüzeyin `flex: 1`i ise dikey eksene düşüyor. Sonuç: her hap ekranın yarısını
 * değil kendi METNİ kadar yer kaplıyor ve çerçeve etiketin dibine oturuyor. Kitin kendi çözümü
 * var ve aynı tuzağın künyesi orada yazılı (`bottom-tab-bar`: "genişliği YUVA dağıtır") — yuva
 * buraya da o desenle kondu, ikinci bir yol icat edilmedi.
 *
 * Ölçüldü (Karla 700, 13.5 dp — `theme.text.control`): en uzun etiket "Französische Firma"
 * 125,9 dp; 360 dp'lik ekranda yuvanın içi 158 dp. Yani yarım-ekran yuva geri gelince etiket
 * varsayılan ölçekte rahat sığıyor; `space.lg` yatay dolgu (tasarımın aynı sayfadaki mobil
 * çipi `padding:9px` diyor, ölçek kuralıyla 10) yazı ölçeği büyütülmüş cihazda da metnin
 * çerçeveye değmesini engelliyor. v3 yatay dolguyu 0 yazabiliyor çünkü HTML'de span SATIRA
 * BÖLÜNÜR; RN'de tek satıra kilitli etiket bölünemez — o yüzden sınır iki satır.
 */
function KindTab({ label, active, onPress, testID }: KindTabProps) {
  return (
    /* Genişliği YUVA dağıtır (yukarıdaki künye) — iki hap ekranı eşit böler. Yuvanın kendi
       kimliği var (`bottom-tab-bar`in `-glass` deseni): kaybolan `flex` ancak burada ölçülebilir,
       hapın stiline bakan test yuvayı hiç görmez. */
    <View style={styles.tabSlot} testID={`${testID}-slot`}>
      <PressableSurface
        onPress={onPress}
        feedback="scale-small"
        selected={active}
        accessibilityRole="tab"
        accessibilityLabel={label}
        style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
        testID={testID}
      >
        <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle]} numberOfLines={2}>
          {label}
        </Text>
      </PressableSurface>
    </View>
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
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },

  /* v3: iki hap yan yana, `gap:8`, her biri `flex:1` · `padding:12px 0` · `radius:14` ·
     `border:1.5px solid ink`. Yarıçap resmî sete çekildi (14 → kontrol 16); yatay dolgu 0 yerine
     `space.lg` (tasarımın aynı sayfadaki mobil çipi `padding:9px`) — gerekçe `KindTab` künyesinde. */
  tabs: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  /** `flex: 1` BURADA durur, hapın kendisinde değil — gerekçe `KindTab` künyesinde. */
  tabSlot: {
    flex: 1,
  },
  tab: {
    justifyContent: 'center',
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space.lg,
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
    // v3'ün `text-align:center`i — hizayı artık etiket kendi kutusunda kurar (kutu yarım ekran).
    textAlign: 'center',
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
  /** Geçersiz numara uyarı tonunda; "doğrulanamadı" NÖTR kalır — o bir suçlama değil, bir boşluk. */
  vatMarkBad: { color: theme.colors['terracotta-bright'] },

  /* Kaldırılan kutunun yerindeki satır — kutu değil, çünkü müşteri burada bir şey YAZMIYOR.
     Boşluk `xs`: cümle ile adres tek bir bilgi, iki blok değil (alan aralığı `block`un `lg`si). */
  mailTo: {
    gap: theme.space.xs,
  },
  mailToValue: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
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
