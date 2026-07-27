import { OtpCodeInput } from '@/components/customer/auth/otp-code-input';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { Button } from '@/components/customer/ui/button';
import { GoogleIcon, WhatsAppIcon } from './login-icons';
import type { LoginViewProps } from './login-types';

// Sıcak degrade — tasarımdaki hero image-slot (aile sofrası fotoğrafı) yerine geçici placeholder.
// Gerçek foto gelince bu arka planı kaldırıp <img>/next<Image> ile değiştir.
// Kahraman gradyanı — token'lardan kurulur (envanter §0: bal · ara durak · mürekkep).
const HERO_BG = 'linear-gradient(150deg,var(--color-honey) 0%,var(--color-hero-mid) 45%,var(--color-ink) 100%)';

// Masaüstü sunumu — tasarım "Giris Web" / "Giris Kod Web": bölünmüş ekran (sol hero foto + sağ
// doğrulama paneli). Canvas çerçevesi (1120px/rounded/shadow) chrome'dur, atıldı; ekran pencereyi
// kaplar. Hero'nun degrade örtüsü/rozet/testimonial'ı gerçek UI, korundu.
export function LoginDesktop({ t, errors, subtitle, locale, stage, error, notice, isSending, emailInvalid, emailRef, emailField, onSubmit, onBack, onGoogle, onWhatsApp, onVerify, onResend }: LoginViewProps) {
  return (
    <main className="flex min-h-screen bg-cream text-ink">
      {/* SOL: hero — pencerenin sol panelini kaplar (tasarım 468/1120 ≈ %42) */}
      <div className="relative w-[42%] max-w-[560px] flex-none" style={{ background: HERO_BG }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(52,59,65,.42) 0%,rgba(52,59,65,0) 34%,rgba(52,59,65,.72) 100%)' }} />
        <span className="absolute left-[26px] top-[26px] rounded-[20px] bg-[rgba(250,246,236,.92)] px-3.5 py-[7px] font-sans text-xs font-semibold uppercase tracking-[.06em] text-olive">
          ❄ {t.heroPill}
        </span>
        <div className="absolute inset-x-[34px] bottom-[34px] flex flex-col gap-2.5">
          {stage.kind === 'email' ? (
            <>
              <span className="font-serif text-[27px] font-medium leading-[1.32] text-on-image">“{t.testimonialQuote}”</span>
              <span className="font-sans text-[13px] font-semibold tracking-[.04em] text-on-image-soft">{t.testimonialAuthor}</span>
            </>
          ) : (
            <span className="font-serif text-2xl font-medium leading-[1.35] text-on-image">{t.heroCodeText}</span>
          )}
        </div>
      </div>

      {/* SAĞ: doğrulama paneli — kalan genişliği kaplar, içerik ortada (max 392px) */}
      <div className="flex min-w-0 flex-1 flex-col px-13 py-10">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            {t.back}
          </Button>
          <img src="/logo.jpg" alt="Lezzet Anatolia" className="h-[46px] mix-blend-multiply" />
          <span className="w-11" />
        </div>

        <div className="mx-auto flex w-full max-w-[392px] flex-1 flex-col justify-center gap-[18px] py-7">
          {stage.kind === 'email' ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-[30px] font-semibold leading-[1.2] text-ink">{t.title}</h1>
                <p className="font-sans text-[15px] leading-[1.6] text-body">{subtitle}</p>
              </div>

              <div className="flex flex-col gap-2.5">
                <Button variant="secondary" fullWidth onClick={onGoogle}>
                  <GoogleIcon /> {t.googleCta}
                </Button>
                <Button variant="secondary" fullWidth onClick={onWhatsApp}>
                  <WhatsAppIcon /> {t.whatsappCta}
                </Button>
              </div>

              <div className="flex items-center gap-3 font-sans text-[13px] text-sand-600">
                <span className="h-px flex-1 bg-sand-300" />
                {t.orEmail}
                <span className="h-px flex-1 bg-sand-300" />
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

              {error && <p className="text-center font-sans text-[13px] font-semibold text-terracotta-bright">{error}</p>}
              {notice && <p className="text-center font-sans text-[13px] font-semibold text-olive">{notice}</p>}

              <p className="text-center font-sans text-xs leading-[1.6] text-muted">
                {t.consentBefore}
                <span className="text-olive">{t.consentLink}</span>
                {t.consentAfter}
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-[18px] text-center">
              <h1 className="font-serif text-[28px] font-semibold leading-[1.2] text-ink">{t.codeTitle}</h1>
              <OtpCodeInput email={stage.email} locale={locale} onVerify={onVerify} onResend={onResend} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
