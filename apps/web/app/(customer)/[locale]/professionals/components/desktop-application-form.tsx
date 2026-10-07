'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatSiret, normalizeSiret, vatNumberProblem, type B2bApplicationKind } from '@lezzet/domain-core';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { Link } from '@/i18n/navigation';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { AddressFields } from '@/components/customer/delivery/address-fields';
import { OtpCodeInput } from '@/components/customer/auth/otp-code-input';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import type { ApplicationDefaults, ApplicationStep, Messages } from '../professionals-types';
import { useApplicationForm } from '../use-application-form.hook';
import { DesktopCompanyFacts } from './desktop-company-facts';

/**
 * Masaüstü başvuru formu: iki yol (SIRET · vergi numarası) ve üç adım (`form` → yalnız girişsizde `verify` → `sent`). Denetim hem
 * burada (hangi alan kırmızı) hem sunucuda (güvenlik) aynı motordan okunur.
 */
interface DesktopApplicationFormProps {
  t: Messages;
  locale: Locale;
  signedIn: boolean;
  defaults: ApplicationDefaults;
}

export function DesktopApplicationForm({ t, locale, signedIn, defaults }: DesktopApplicationFormProps) {
  const form = useApplicationForm(defaults);
  const { input, set, facts, invalid } = form;
  const [step, setStep] = useState<ApplicationStep>('form');
  /** Resmî kayıt gerçekten okundu mu; faaliyet ve yıl boş gelebildiği için `facts` yetmez. */
  const [fetched, setFetched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isSiret = input.kind === 'siret';
  // Ülkesi kabul edilmeyen numaranın cümlesi yazarken görünür; biçim hatası ise gönderimde işaretlenir.
  const vatProblem = input.vatNumber.trim() ? vatNumberProblem(input.vatNumber) : null;
  const vatError =
    vatProblem === 'use_siret' ? t.form.vatUseSiret : vatProblem === 'unsupported_country' ? t.form.vatUnsupported : undefined;
  const say = (key: string | null): string => t.errors[key as keyof typeof t.errors] ?? t.errors.unexpected;

  function switchKind(kind: B2bApplicationKind) {
    if (!form.switchKind(kind)) return;
    setFetched(false);
    setNotice(null);
  }

  async function lookup() {
    setNotice(null);
    const failed = await form.lookup();
    setFetched(failed === null);
    if (failed !== null) setNotice(say(failed));
  }

  async function submit() {
    if (form.validate().length > 0) {
      setNotice(t.errors.incomplete);
      return;
    }
    setNotice(null);
    if (signedIn) {
      const failed = await form.apply();
      if (failed !== null) return setNotice(say(failed));
      setStep('sent');
      return;
    }
    const failed = await form.sendCode(input.email);
    if (failed !== null) return setNotice(authErrorMessage(failed, locale));
    setStep('verify');
  }

  if (step === 'sent') return <SentCard t={t} />;

  if (step === 'verify') {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-card-title text-ink">{t.form.verifyTitle}</h2>
        <OtpCodeInput
          email={input.email}
          locale={locale}
          onVerify={async (code) => {
            const key = await form.verifyAndApply(input.email, code);
            if (key === null) return { ok: true };
            // Doğrulama hataları giriş sayfasıyla ortak sözlükten, başvuru hataları bu sayfanınkinden; iki küme kesişmez.
            const own = key in t.errors ? t.errors[key as keyof typeof t.errors] : null;
            return { ok: false, error: own ?? authErrorMessage(key as AuthErrorKey, locale) };
          }}
          onResend={async () => {
            const failed = await form.sendCode(input.email);
            return failed ? { ok: false, error: authErrorMessage(failed, locale) } : { ok: true };
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
      <h2 className="font-serif text-card-title text-ink">{t.form.title}</h2>

      {/* Seçim birbirini dışladığı için `radiogroup`; ülke sekmenin metninde yazılı, bayrak yok. */}
      <div className="flex gap-2" role="radiogroup" aria-label={t.form.title}>
        <KindTab label={t.form.tabSiret} active={isSiret} onSelect={() => switchKind('siret')} />
        <KindTab label={t.form.tabVat} active={!isSiret} onSelect={() => switchKind('eu_vat')} />
      </div>

      {isSiret ? (
        <>
          {/* Düğme alanın yanında, etiketin içinde değil: `<label htmlFor>` içindeki düğme tıklamayı girdiye yönlendirirdi. */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormInputField
                label={t.form.siret}
                value={formatSiret(input.siret)}
                inputMode="numeric"
                autoComplete="off"
                invalid={invalid('siret')}
                // Maske yazarken uygulanır, saklanan değer daima rakamdır: biçim ekranın, kimlik verinin.
                onChange={(e) => set({ siret: normalizeSiret(e.target.value).slice(0, 14) })}
              />
            </div>
            <Button onClick={() => void lookup()} disabled={form.lookingUp || input.siret.length !== 14}>
              {form.lookingUp ? t.form.fetching : t.form.fetch}
            </Button>
          </div>
          {fetched && (
            <DesktopCompanyFacts
              t={t}
              legalName={input.legalName}
              addressLine={[input.line1, `${input.postalCode} ${input.city}`.trim()].filter(Boolean).join(', ')}
              activityCode={facts.activityCode}
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
            error={vatError}
            onChange={(e) => set({ vatNumber: e.target.value })}
            onBlur={(e) => form.checkVat(e.target.value)}
            labelAside={vatError ? null : <VatSignal t={t} checking={form.checkingVat} valid={form.vatValid} />}
          />
          {/* Sokak önerisi kapalı: bu yol Alman şirketinin ve BAN yalnız Fransız adreslerini bilir; başvuruda ülke alanı yok,
              bu yüzden `onCountryChange` geçilmez (`BEKLEYEN(BACKLOG §1)`). */}
          <AddressFields
            value={{ line1: input.line1, postalCode: input.postalCode, city: input.city }}
            onChange={(patch) => set(patch)}
            copy={t.form}
            streetSuggest={false}
            line1Invalid={invalid('line1')}
            cityInvalid={invalid('city')}
            postalInvalid={invalid('postalCode')}
          />
        </>
      )}

      <div className="grid grid-cols-2 gap-2.5">
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
        // Girişli müşteride adres kimliktir: değiştirilse de başvuru oturumun hesabına yazılır, ekran başka adres göstermiş olurdu.
        readOnly={signedIn}
        invalid={invalid('email')}
        onChange={(e) => set({ email: e.target.value })}
      />

      {notice && (
        <p className="font-sans text-note font-semibold text-terracotta-bright" role="alert">
          {notice}
        </p>
      )}

      <Button fullWidth onClick={() => void submit()} disabled={form.pending}>
        {form.pending ? t.form.submitting : t.form.submit}
      </Button>
      <p className="text-center font-sans text-micro leading-relaxed text-body">{signedIn ? t.form.noteSignedIn : t.form.note}</p>
    </div>
  );
}

/** Yol seçici hap — dolu hâl zeytin, boş hâl kum çerçeve (tasarım). */
function KindTab({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
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
      {label}
    </button>
  );
}

/**
 * Numaranın doğrulama işareti üç hâllidir: "sorulamadı" gizlenmez (sessizlik "geçti" diye okunurdu) ama kırmızı da çizilmez,
 * çünkü servis arızası müşterinin kusuru değil.
 */
function VatSignal({ t, checking, valid }: { t: Messages; checking: boolean; valid: boolean | null | undefined }) {
  if (checking) return <span className="text-muted">{t.form.vatChecking}</span>;
  if (valid === undefined) return null;
  if (valid === true) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-olive">
        <Icon name="check" size={13} />
        {t.form.vatValid}
      </span>
    );
  }
  if (valid === false) return <span className="font-semibold text-terracotta-bright">{t.form.vatInvalid}</span>;
  return <span className="text-honey">{t.form.vatUnknown}</span>;
}

/** Gönderildi kartı formun yerine geçer; çıkış katalog, çünkü onay gelene kadar yapılabilecek şey perakende fiyatla alışveriş. */
function SentCard({ t }: { t: Messages }) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <span className="font-sans text-eyebrow-sm uppercase text-muted">{t.sent.eyebrow}</span>
      <Icon name="mail" size={30} className="text-olive" />
      <h2 className="font-serif text-card-title text-ink">{t.sent.title}</h2>
      <p className="font-sans text-body-sm leading-relaxed text-body">{t.sent.body}</p>
      <Link href="/catalog" className={buttonClass({ size: 'md' })}>
        {t.sent.cta}
      </Link>
    </div>
  );
}
