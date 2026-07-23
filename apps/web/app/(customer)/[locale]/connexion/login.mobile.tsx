import { OtpCodeInput } from '@/components/auth/otp-code-input';
import { FormInputField } from '@/components/form/form-input-field';
import { Button } from '@/components/ui/button';
import { GoogleIcon, WhatsAppIcon } from './login-icons';
import type { LoginViewProps } from './login-client';

// Sıcak degrade — tasarımdaki hero image-slot yerine geçici placeholder (gerçek foto gelince değişir).
const HERO_BG = 'linear-gradient(150deg,#8a6b2a 0%,#6f7d3f 45%,#3a4147 100%)';

// Mobil sunumu (birincil biçim) — tasarım "Giris Mobil" (üstte hero'lu e-posta adımı) ve "Giris Kod"
// (hero'suz başlık barlı kod adımı). Canvas çerçevesi (390px kart/rounded/shadow) chrome, atıldı;
// ekran cihazı kaplar, sabit genişlik yok (yatay taşma olmaz).
export function LoginMobile({ t, errors, subtitle, locale, stage, error, notice, isSending, emailInvalid, emailRef, emailField, onSubmit, onBack, onGoogle, onWhatsApp, onVerify, onResend }: LoginViewProps) {
  if (stage.kind === 'code') {
    return (
      <main className="flex min-h-screen flex-col bg-cream">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            {t.back}
          </Button>
          <img src="/logo.jpg" alt="Lezzet Anatolia" className="h-[38px] mix-blend-multiply" />
          <span className="w-10" />
        </div>
        <div className="flex flex-col gap-4 px-6 pt-[22px] pb-10 text-center">
          <h1 className="font-serif text-2xl font-semibold leading-[1.25] text-ink">{t.codeTitle}</h1>
          <OtpCodeInput email={stage.email} locale={locale} onVerify={onVerify} onResend={onResend} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      {/* Hero (üst şerit) — foto + degrade cream'e iner; beyaz Geri + tazelik rozeti */}
      <div className="relative h-[150px] flex-none" style={{ background: HERO_BG }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(52,59,65,.34) 0%,rgba(52,59,65,0) 55%,rgba(250,246,236,.96) 100%)' }} />
        <div className="absolute inset-x-4 top-3.5 flex items-center justify-between">
          <button type="button" onClick={onBack} className="cursor-pointer font-sans text-sm font-bold text-[#f5f1e6]">
            {t.back}
          </button>
          <span className="rounded-2xl bg-[rgba(250,246,236,.92)] px-[11px] py-[5px] font-sans text-[11px] font-semibold uppercase tracking-[.05em] text-olive">❄ {t.heroPillShort}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="-mt-1 flex flex-col gap-[18px] px-6 pt-1 pb-10" noValidate>
        <div className="flex flex-col gap-2 text-center">
          <img src="/logo.jpg" alt="Lezzet Anatolia" className="mx-auto h-11 mix-blend-multiply" />
          <h1 className="font-serif text-[26px] font-semibold leading-[1.25] text-ink">{t.title}</h1>
          <p className="font-sans text-sm leading-[1.6] text-body">{subtitle}</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button variant="secondary" fullWidth onClick={onGoogle}>
            <GoogleIcon /> {t.googleCta}
          </Button>
          <Button variant="secondary" fullWidth onClick={onWhatsApp}>
            <WhatsAppIcon /> {t.whatsappCta}
          </Button>
        </div>

        <div className="flex items-center gap-3 font-sans text-[13px] text-faint">
          <span className="h-px flex-1 bg-line-soft" />
          {t.orEmail}
          <span className="h-px flex-1 bg-line-soft" />
        </div>

        <div className="flex flex-col gap-2.5">
          <FormInputField
            label={t.emailPlaceholder}
            hideLabel
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t.emailPlaceholder}
            error={emailInvalid ? errors.invalidEmail : undefined}
            inputRef={emailRef}
            {...emailField}
          />
          <Button type="submit" fullWidth disabled={isSending}>
            {isSending ? t.sending : t.sendCta}
          </Button>
        </div>

        {error && <p className="text-center font-sans text-[13px] font-semibold text-danger">{error}</p>}
        {notice && <p className="text-center font-sans text-[13px] font-semibold text-olive">{notice}</p>}

        <p className="text-center font-sans text-xs leading-[1.6] text-muted">
          {t.consentBefore}
          <span className="text-olive">{t.consentLink}</span>
          {t.consentAfter}
        </p>
      </form>
    </main>
  );
}
