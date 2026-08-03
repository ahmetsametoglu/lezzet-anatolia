'use client';

import { useState, useTransition } from 'react';
import type { Locale } from '@lezzet/i18n';
import {
  b2bApplicationIssues,
  formatSiret,
  normalizeSiret,
  type B2bApplicationField,
  type B2bApplicationInput,
  type B2bApplicationKind,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { OtpCodeInput } from '@/components/customer/auth/otp-code-input';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import { sendEmailOtp } from '../../login/actions';
import { applyAsCustomerAction, checkVatAction, lookupSiretAction, verifyAndApplyAction } from '../actions';
import type { ApplicationDefaults, ApplicationStep, Messages } from '../professionals-types';
import { CompanyFacts } from './company-facts';

/**
 * B2B başvuru formu — tasarımın "Başvuru" kutusu, iki yolu ve üç adımı.
 *
 * **TEK DOSYA, iki cihaz.** Masaüstü ve mobil düzenler bu bileşeni aynı hâliyle yerleştiriyor;
 * ikisi arasındaki fark yalnız sütun genişliği ve dolgu, yani KAPSAYICININ işi. Formu çatallamak,
 * üç adımlı bir durum makinesini iki kez yazmak olurdu — cihaz forkunun amacı yerleşimi ayırmak,
 * mantığı kopyalamak değil (aynı karar: 08.6 talep formu, 08.7 değerlendirme akışı).
 *
 * ── ÜÇ ADIM ─────────────────────────────────────────────────────────────────
 * `form` → `verify` (yalnız girişsizde) → `sent`. Girişli müşteride orta adım hiç doğmaz; tasarım
 * bunu açıkça söylüyor ("mevcut hesabınızla başvurursunuz").
 *
 * ── DENETİM İKİ YERDE VE BU TEKRAR DEĞİL ─────────────────────────────────────
 * Aynı motoru (`b2bApplicationIssues`) hem burası hem server action çağırıyor. Ekranın çağırması
 * kullanıcı içindir (hangi alan kırmızı), sunucununki güvenlik içindir (forma hiç uğramadan da
 * istek atılabilir). Kopya olan KURAL değil, çağrı.
 */
interface ApplicationFormProps {
  t: Messages;
  locale: Locale;
  signedIn: boolean;
  defaults: ApplicationDefaults;
  /** Mobil yerleşim — yalnız boşluk/punto; alan sırası ve akış aynı. */
  compact?: boolean;
}

/** Boş form — iki yol da aynı şekli taşır, `kind` hangi alanların görüneceğini söyler. */
function emptyInput(defaults: ApplicationDefaults): B2bApplicationInput {
  return {
    kind: 'siret',
    siret: '',
    legalName: '',
    vatNumber: '',
    contactName: defaults.contactName,
    email: defaults.email,
    phone: defaults.phone,
    line1: '',
    postalCode: '',
    city: '',
  };
}

const NO_FACTS: B2bCompanyFacts = { activityCode: null, foundedYear: null, isActive: null };

export function ApplicationForm({ t, locale, signedIn, defaults, compact = false }: ApplicationFormProps) {
  const [step, setStep] = useState<ApplicationStep>('form');
  const [input, setInput] = useState<B2bApplicationInput>(() => emptyInput(defaults));
  const [facts, setFacts] = useState<B2bCompanyFacts>(NO_FACTS);
  /**
   * Resmî kayıt GERÇEKTEN okundu mu. `facts` yetmez: kayıt okunduğu hâlde faaliyet ve yıl boş
   * gelebilir, o zaman kutu "getirildi" demeden kaybolurdu.
   */
  const [fetched, setFetched] = useState(false);
  const [issues, setIssues] = useState<B2bApplicationField[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  /** AB numarasının doğrulama sonucu: `true`/`false`/`null` (sorulamadı) — üçü ayrı cümle. */
  const [vatValid, setVatValid] = useState<boolean | null | undefined>(undefined);
  const [pending, start] = useTransition();
  const [lookingUp, startLookup] = useTransition();
  const [checkingVat, startVat] = useTransition();

  const isSiret = input.kind === 'siret';
  const say = (key: string | null): string => t.errors[key as keyof typeof t.errors] ?? t.errors.unexpected;
  const set = (patch: Partial<B2bApplicationInput>) => setInput((prev) => ({ ...prev, ...patch }));
  /**
   * Alan alan CÜMLE yok, kırmızı işaret var — tasarımın kararı: kutunun altında tek bir
   * "işaretli alanları tamamlayın" satırı duruyor. Kitin `invalid` bayrağı tam bunun için
   * (`form-input-field` künyesi): boş bir hata metni geçirmek, içi boş bir `role="alert"`
   * doğurur ve ekran okuyucu duyurup hiçbir şey söylemez.
   */
  const invalid = (field: B2bApplicationField): boolean => issues.includes(field);

  /** Sekme değişince kimlik alanları SIFIRLANIR: iki yolun künyesi birbirinin yerine geçmez. */
  function switchKind(kind: B2bApplicationKind) {
    if (kind === input.kind) return;
    setFetched(false);
    setFacts(NO_FACTS);
    setVatValid(undefined);
    setIssues([]);
    setNotice(null);
    setInput((prev) => ({ ...prev, kind, siret: '', vatNumber: '', legalName: '', line1: '', postalCode: '', city: '' }));
  }

  function lookup() {
    setNotice(null);
    startLookup(async () => {
      const res = await lookupSiretAction(input.siret);
      if (!res.data) {
        setFetched(false);
        setFacts(NO_FACTS);
        setNotice(say(res.errorKey));
        return;
      }
      const record = res.data;
      setFetched(true);
      setFacts({ activityCode: record.activityCode, foundedYear: record.foundedYear, isActive: record.isActive });
      set({
        siret: record.siret,
        legalName: record.legalName,
        line1: record.line1,
        postalCode: record.postalCode,
        city: record.city,
      });
      // Getirilen künye eski hataları siler: aday artık farklı bir başvuru gönderiyor.
      setIssues((prev) => prev.filter((f) => !['siret', 'legalName', 'line1', 'postalCode', 'city'].includes(f)));
    });
  }

  function verifyVat(value: string) {
    if (!value.trim()) {
      setVatValid(undefined);
      return;
    }
    startVat(async () => {
      const res = await checkVatAction(value);
      setVatValid(res.data ? res.data.valid : null);
    });
  }

  /**
   * Gönder. Girişli müşteride tek adım; girişsizde önce kod gönderilir.
   *
   * **Geçersiz numara başvuruyu ENGELLEMEZ** ve bu bilinçli: doğrulama bir sinyal, kapı değil.
   * Numarası VIES'te görünmeyen meşru bir yeni şirket vardır ve kararı admin verir (`b2b-approval`
   * o sinyali `bad` tonuyla zaten gösteriyor). Ekran uyarısını yazar, yolu kapatmaz.
   */
  function submit() {
    const found = b2bApplicationIssues(input);
    setIssues(found);
    if (found.length > 0) {
      setNotice(t.errors.incomplete);
      return;
    }
    setNotice(null);

    start(async () => {
      if (signedIn) {
        const res = await applyAsCustomerAction(input, facts);
        if (!res.data) {
          setNotice(say(res.errorKey));
          return;
        }
        setStep('sent');
        return;
      }
      const sent = await sendEmailOtp(input.email);
      if (sent.errorKey) {
        setNotice(authErrorMessage(sent.errorKey, locale));
        return;
      }
      setStep('verify');
    });
  }

  if (step === 'sent') return <SentCard t={t} compact={compact} />;

  if (step === 'verify') {
    return (
      <div className="flex flex-col gap-4">
        <h2 className={`font-serif ${compact ? 'text-card-title-sm' : 'text-card-title'} text-ink`}>{t.form.verifyTitle}</h2>
        <OtpCodeInput
          email={input.email}
          locale={locale}
          onVerify={async (code) => {
            const res = await verifyAndApplyAction(input.email, code, input, facts);
            // Anahtar iki sözlükten gelebiliyor: doğrulama hataları `authErrorMessage`'ın
            // (giriş sayfasıyla ORTAK), başvuru hataları bu sayfanın. Önce kendi sözlüğüne
            // bakılıyor; yoksa auth sözlüğüne düşülüyor — iki küme kesişmiyor.
            if (res.data) return { ok: true };
            const key = res.errorKey;
            // Anahtarsız bir başarısızlık (olmaması gereken hâl) jenerik cümleye düşer — boş bir
            // hata satırı, kullanıcıya "bir şey oldu ama söylemeyeceğim" demektir.
            if (!key) return { ok: false, error: t.errors.unexpected };
            const own = key in t.errors ? t.errors[key as keyof typeof t.errors] : null;
            return { ok: false, error: own ?? authErrorMessage(key as AuthErrorKey, locale) };
          }}
          onResend={async () => {
            const again = await sendEmailOtp(input.email);
            return again.errorKey ? { ok: false, error: authErrorMessage(again.errorKey, locale) } : { ok: true };
          }}
          onSuccess={() => setStep('sent')}
        />
        <Button variant="ghost" size="sm" onClick={() => setStep('form')}>
          {t.form.back}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className={`font-serif ${compact ? 'text-card-title-sm' : 'text-card-title'} text-ink`}>{t.form.title}</h2>

      {/* İki yol — tasarımın iki hapı. `radiogroup` çünkü seçim birbirini dışlıyor. */}
      <div className="flex gap-2" role="radiogroup" aria-label={t.form.title}>
        <KindTab label={t.form.tabSiret} flag="🇫🇷" active={isSiret} onSelect={() => switchKind('siret')} />
        <KindTab label={t.form.tabVat} flag="🇩🇪" active={!isSiret} onSelect={() => switchKind('eu_vat')} />
      </div>

      {isSiret ? (
        <>
          {/* Düğme alanın YANINDA, etiketin içinde değil: `FieldShell`in etiketi `<label htmlFor>`
              ve içine buton koymak tıklamayı girdiye yönlendirir. `items-end` ikisinin ALTINI
              hizalar — üstte etiket satırı yalnız girdide var. */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormInputField
                label={t.form.siret}
                value={formatSiret(input.siret)}
                inputMode="numeric"
                autoComplete="off"
                invalid={invalid('siret')}
                // Maskeleme yazarken uygulanıyor (tasarım: "boşluklu maskeleme otomatik"); saklanan
                // değer daima rakam — biçim ekranın, kimlik verinin.
                onChange={(e) => set({ siret: normalizeSiret(e.target.value).slice(0, 14) })}
              />
            </div>
            <Button onClick={lookup} disabled={lookingUp || input.siret.length !== 14}>
              {lookingUp ? t.form.fetching : t.form.fetch}
            </Button>
          </div>
          {fetched && (
            <CompanyFacts
              t={t}
              legalName={input.legalName}
              addressLine={[input.line1, `${input.postalCode} ${input.city}`.trim()].filter(Boolean).join(', ')}
              activityCode={facts.activityCode}
              compact={compact}
            />
          )}
        </>
      ) : (
        <>
          <FormInputField
            label={t.form.legalName}
            value={input.legalName}
            invalid={invalid('legalName')}
            onChange={(e) => set({ legalName: e.target.value })}
          />
          <FormInputField
            label={t.form.vat}
            value={input.vatNumber}
            inputMode="text"
            autoComplete="off"
            invalid={invalid('vatNumber')}
            onChange={(e) => {
              set({ vatNumber: e.target.value });
              setVatValid(undefined);
            }}
            onBlur={(e) => verifyVat(e.target.value)}
            labelAside={<VatSignal t={t} checking={checkingVat} valid={vatValid} />}
          />
          <FormInputField
            label={t.form.line1}
            value={input.line1}
            invalid={invalid('line1')}
            onChange={(e) => set({ line1: e.target.value })}
          />
          <div className="grid grid-cols-[1fr_1.6fr] gap-2.5">
            <FormInputField
              label={t.form.postalCode}
              value={input.postalCode}
              inputMode="numeric"
              invalid={invalid('postalCode')}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
            <FormInputField
              label={t.form.city}
              value={input.city}
              invalid={invalid('city')}
              onChange={(e) => set({ city: e.target.value })}
            />
          </div>
        </>
      )}

      {/* İletişim — tasarımda masaüstünde ad/telefon yan yana, mobilde alt alta. */}
      <div className={compact ? 'flex flex-col gap-3.5' : 'grid grid-cols-2 gap-2.5'}>
        <FormInputField
          label={t.form.contactName}
          value={input.contactName}
          autoComplete="name"
          invalid={invalid('contactName')}
          onChange={(e) => set({ contactName: e.target.value })}
        />
        <FormInputField
          label={t.form.phone}
          value={input.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          invalid={invalid('phone')}
          onChange={(e) => set({ phone: e.target.value })}
        />
      </div>
      <FormInputField
        label={t.form.email}
        value={input.email}
        type="email"
        inputMode="email"
        autoComplete="email"
        // Girişli müşteride adres KİMLİKTİR, düzenlenmez: değiştirilseydi başvuru yine oturumun
        // hesabına yazılırdı ve ekran müşteriye başka bir adres göstermiş olurdu.
        readOnly={signedIn}
        invalid={invalid('email')}
        onChange={(e) => set({ email: e.target.value })}
      />

      {notice && (
        <p className="font-sans text-note font-semibold text-terracotta-bright" role="alert">
          {notice}
        </p>
      )}

      <Button fullWidth onClick={submit} disabled={pending}>
        {pending ? t.form.submitting : t.form.submit}
      </Button>
      <p className="text-center font-sans text-micro leading-relaxed text-muted">
        {signedIn ? t.form.noteSignedIn : t.form.note}
      </p>
    </div>
  );
}

/** Yol seçici hap — dolu hâl zeytin, boş hâl kum çerçeve (tasarım). */
function KindTab({ label, flag, active, onSelect }: { label: string; flag: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={[
        'flex-1 cursor-pointer rounded-pill px-3 py-2.5 font-sans text-note font-bold transition-colors',
        active ? 'bg-olive text-white' : 'border-[1.5px] border-sand-400 bg-card text-ink hover:border-olive',
      ].join(' ')}
    >
      {flag} {label}
    </button>
  );
}

/**
 * AB numarasının doğrulama işareti — ÜÇ hâl, iki değil.
 *
 * "Sorulamadı" hâli sessizce gizlenmiyor: aday numarasının kontrol edilmediğini bilmeli, yoksa
 * ekrandaki sessizliği "geçti" diye okur. Ama kırmızı da değil — servis arızası müşterinin kusuru
 * gibi gösterilmez.
 */
function VatSignal({ t, checking, valid }: { t: Messages; checking: boolean; valid: boolean | null | undefined }) {
  if (checking) return <span className="text-muted">{t.form.vatChecking}</span>;
  if (valid === undefined) return null;
  if (valid === true) return <span className="font-semibold text-olive">✓ {t.form.vatValid}</span>;
  if (valid === false) return <span className="font-semibold text-terracotta-bright">{t.form.vatInvalid}</span>;
  return <span className="text-honey">{t.form.vatUnknown}</span>;
}

/** Gönderildi ekranı — tasarımın "Başvurunuz alındı" kartı; formun YERİNE geçer. */
function SentCard({ t, compact }: { t: Messages; compact: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <span className="font-sans text-eyebrow-sm uppercase text-muted">{t.sent.eyebrow}</span>
      <span className="text-[30px]">📨</span>
      <h2 className={`font-serif ${compact ? 'text-card-title-sm' : 'text-card-title'} text-ink`}>{t.sent.title}</h2>
      <p className="font-sans text-body-sm leading-relaxed text-body">{t.sent.body}</p>
      {/* Çıkış yolu KATALOG, hesap değil: onay gelene kadar yapılabilecek şey alışverişe devam
          etmek (tasarım) — ve perakende fiyatla gezilebildiği hemen üstteki cümlede yazılı. */}
      <Link href="/catalog" className={buttonClass({ size: compact ? 'sm' : 'md' })}>
        {t.sent.cta}
      </Link>
    </div>
  );
}
