'use client';

import { useState } from 'react';
import { b2bIssueNotice, normalizeSiret, type B2bApplicationField, type B2bApplicationKind } from '@lezzet/domain-core';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { PhoneApplicationForm } from './components/phone-application-form';
import { PhoneIdentitySheet } from './components/phone-identity-sheet';
import { PhoneStatus } from './components/phone-status';
import type { ProfessionalsViewProps } from './professionals-types';
import { NETWORK_ERROR, useApplicationForm } from './use-application-form.hook';

/**
 * Telefonda native'in başvuru ekranı: tanıtım kartı, adımlar, form. Başvurusu olan aday formu görmez; misafirin kimliği gönderimde
 * açılan çekmecede kurulur ve başvuru kod doğrulanınca formdaki gövdeyle gider.
 */
export function ProfessionalsMobile({ t, copy, locale, status, rejection, signedIn, defaults, whatsappHref }: ProfessionalsViewProps) {
  const form = useApplicationForm(defaults);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [reapply, setReapply] = useState(false);

  if (sent) {
    return (
      <EmptyState
        fill
        icon={<MobileIcon name="mail" size={80} className="text-olive-dark" />}
        title={copy.sent.title}
        description={copy.sent.body}
        action={<PrimaryButton label={copy.sent.cta} href="/catalog" />}
      />
    );
  }

  if (status !== 'none' && !reapply) {
    return <PhoneStatus copy={copy} status={status} rejection={rejection} onReapply={() => setReapply(true)} />;
  }

  const steps = signedIn ? [copy.steps.review, copy.steps.priceList] : [copy.steps.signUp, copy.steps.review, copy.steps.priceList];

  const noticeFor = (issues: readonly B2bApplicationField[]): string => {
    const found = b2bIssueNotice(form.input.kind, issues);
    if (found.kind === 'siret_length') return copy.errors.siretLength;
    if (found.kind === 'account_email') return copy.errors.accountEmail;
    return copy.errors.incomplete.replace('{fields}', found.fields.map((field) => copy.form[field]).join(' · '));
  };

  const changeKind = (kind: B2bApplicationKind) => {
    if (!form.switchKind(kind)) return;
    setCompanyOpen(false);
    setNotice(null);
  };

  // Kayıt bulunamasa da şirket alanları açılır, ki aday elle devam edebilsin.
  const lookup = async () => {
    if (normalizeSiret(form.input.siret).length !== 14) {
      setNotice(copy.errors.siretLength);
      setCompanyOpen(false);
      return;
    }
    const failed = await form.lookup();
    setCompanyOpen(true);
    setNotice(
      failed === null
        ? null
        : failed === 'siret_not_found'
          ? copy.errors.siretNotFound
          : failed === 'registry_down'
            ? copy.errors.registryDown
            : failed === NETWORK_ERROR
              ? copy.errors.network
              : copy.errors.unexpected,
    );
  };

  const submit = async () => {
    // Numara tamsa şirket alanları açılır: kapalı bir bloğun eksiğini istemek müşteriyi göremediği bir alana yollardı.
    if (form.input.kind === 'siret' && normalizeSiret(form.input.siret).length === 14) setCompanyOpen(true);
    // Misafirin e-postası formda değil kimlik adımında sorulur; girişlide hesabın adresidir ve yoksa bu da söylenir.
    const issues = form.validate(signedIn ? [] : ['email']);
    if (issues.length > 0) {
      setNotice(noticeFor(issues));
      return;
    }
    setNotice(null);
    if (!signedIn) {
      setIdentityOpen(true);
      return;
    }
    const failed = await form.apply();
    if (failed === null) setSent(true);
    else setNotice(failed === NETWORK_ERROR ? copy.errors.network : copy.errors.unexpected);
  };

  return (
    <div className="flex flex-col gap-4 p-4.5 pb-7.5">
      <section className="flex flex-col gap-2.5 rounded-card bg-ink px-5 py-5.5">
        <span className="font-sans text-eyebrow-xs uppercase text-olive-light">{copy.hero.eyebrow}</span>
        <h1 className="font-serif text-h2-sm leading-[1.2] text-sand-50">{copy.hero.title}</h1>
        <p className="font-sans text-note leading-[1.6] text-on-image-soft">{copy.hero.body}</p>
      </section>

      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2.5">
            <span className="flex size-6.5 flex-none items-center justify-center rounded-full bg-olive-bg font-sans text-note font-bold text-olive-dark">
              {index + 1}
            </span>
            <span className="flex-1 font-sans text-note font-semibold text-ink">{step}</span>
          </li>
        ))}
      </ol>

      <PhoneApplicationForm
        copy={copy}
        t={t}
        form={form}
        accountEmail={signedIn ? defaults.email || undefined : null}
        companyOpen={companyOpen}
        notice={notice}
        onKindChange={changeKind}
        onLookup={() => void lookup()}
        onSubmit={() => void submit()}
        onEdit={() => setNotice(null)}
      />

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex cursor-pointer items-center justify-center gap-2 py-1 font-sans text-note font-bold text-olive-dark transition-opacity hover:opacity-75"
      >
        <MobileIcon name="whatsapp" size={17} className="text-brand-whatsapp-pure" />
        {copy.whatsapp}
      </a>

      {identityOpen && (
        <PhoneIdentitySheet
          copy={copy}
          locale={locale}
          form={form}
          onApplied={() => {
            setIdentityOpen(false);
            setSent(true);
          }}
          onClose={() => setIdentityOpen(false)}
        />
      )}
    </div>
  );
}
