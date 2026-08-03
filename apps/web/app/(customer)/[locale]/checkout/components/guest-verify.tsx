'use client';

import { useState } from 'react';
import { Button } from '@/components/customer/ui/button';
import { FormInputField } from '@/components/customer/form/form-input-field';
import type { Locale } from '@lezzet/i18n';
import { OtpCodeInput, type OtpResendResult, type OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { createClient } from '@/lib/supabase/client';
import { StepShell } from './checkout-steps';
import { GoogleIcon } from '../../login/login-icons';
import { sendEmailOtp, verifyEmailOtp } from '../../login/actions';
import type { Messages } from '../checkout-types';

/**
 * **Adım 0** · misafir hızlı doğrulama.
 *
 * Sayfanın YERİNE GEÇMEZ, en üstündeki adımdır — tasarımın etkileşim sözleşmesi "tek sayfada dikey
 * bölümler, akordeon daraltma yok" diyor. "Hesapsız sipariş yoktur" (DOMAIN §10) ama bu bir giriş
 * duvarı değil: müşteri şifre kurmaz, hesap açmaz.
 *
 * **Yerleşim GİRİŞ SAYFASININ dilinin aynısı** (`login.desktop`): Google düğmesi, altında
 * `── ya da e-posta ile ──` ayracı, altında form kiti alanı ve gönder düğmesi; hepsi ortalanmış
 * dar bir sütunda (480 px). Önce iki
 * sütun denendi (referans projenin deseni) ama bizim buton dilimizde iyi durmadı — yan yana iki
 * tam-genişlik hap, biri çerçeveli biri dolu, dengesiz okunuyordu (kullanıcı geri bildirimi).
 * Müşteri zaten aynı ayracı giriş sayfasında görüyor; iki yüzeyin aynı şeyi iki türlü sorması
 * gereksiz bir öğrenme yüküydü.
 *
 * **Ham `<input>` YOK** — form kiti (`FormInputField`, CLAUDE.md §2). Girdi köşesi/kenarı/odak
 * halkası oradan gelir; elle yazılsaydı checkout'un alanları sitenin geri kalanına benzemezdi.
 *
 * **Kod aşamasından GERİ DÖNÜLEBİLİR:** yanlış adres yazan ya da Google'a geçmek isteyen kilitli
 * kalmaz; yazdığı e-posta korunur, yalnız görünüm seçime döner.
 */
interface GuestVerifyProps {
  t: Messages;
  locale: Locale;
  compact?: boolean;
  onVerified: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GuestVerify({ t, locale, compact, onVerified }: GuestVerifyProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const validEmail = EMAIL_RE.test(trimmed);

  const google = async () => {
    setError(null);
    const supabase = createClient();
    const next = `${window.location.pathname}${window.location.search}`;
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Paylaşılan cihazda hesap SEÇTİRİLİR: bir öncekinin oturumu sessizce devralınmasın.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (failure) setError(t.verify.googleUnavailable);
  };

  const send = async () => {
    if (!validEmail || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendEmailOtp(trimmed);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSent(true);
  };

  /**
   * Kod doğrulama. Yönlendirme adresi KULLANILMAZ: müşteri checkout'ta kalmalı — giriş akışı
   * oturumu kurar, sayfa tazelenince adımlar açılır.
   *
   * Hata metnini olduğu gibi geçiriyoruz: action zaten müşterinin dilinde döndürüyor.
   */
  const verify = async (code: string): Promise<OtpVerifyResult> => {
    const result = await verifyEmailOtp(trimmed, code);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  const resend = async (): Promise<OtpResendResult> => {
    const result = await sendEmailOtp(trimmed);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  return (
    <StepShell step={t.verify.step} title={t.verify.title} hint={t.verify.hint} compact={compact}>
      <p className="font-sans text-note leading-relaxed text-body">{t.verify.quick}</p>

      {sent ? (
        // Kod gönderildi → odaklı görünüm: seçim kalkar, çünkü artık tek bir iş var.
        //
        // Kutu GİRİŞ SAYFASININ bileşeni (`OtpCodeInput`): altı ayrı hane, yapıştırma, son hanede
        // kendiliğinden gönderim, geri sayımlı yeniden gönderme. Burada tek alanlı bir kopya
        // yazılmıştı — aynı işin iki farklı hâli, biri iyileştiğinde öbürü geride kalırdı
        // (CLAUDE.md §1). Müşteri de aynı kodu iki yüzeyde iki türlü girmemeli.
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 py-1">
          <OtpCodeInput email={trimmed} locale={locale} onVerify={verify} onResend={resend} onSuccess={onVerified} />
          {/* Kilitlenmez: yanlış adres yazan ya da Google'a geçmek isteyen geri döner. */}
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            {t.verify.otherMethod}
          </Button>
        </div>
      ) : (
        // Kart genişliğinde bir düğme + girdi, adımı olduğundan ağır gösteriyordu (kullanıcı geri
        // bildirimi). Ortalanmış dar sütun: giriş sayfasının 392 px'i checkout kartının içinde fazla
        // sıkışık kaldığı için 480'e açıldı — kartın kenarlarıyla arasında nefes payı kalıyor ama
        // düğme artık bir başlık kadar geniş değil.
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-[18px] py-1">
          <Button variant="secondary" compact={compact} fullWidth onClick={() => void google()}>
            <GoogleIcon /> {t.verify.google}
          </Button>

          <div className="flex items-center gap-3 font-sans text-note text-sand-600">
            <span className="h-px flex-1 bg-sand-300" />
            {t.verify.or}
            <span className="h-px flex-1 bg-sand-300" />
          </div>

          <div className="flex flex-col gap-2.5">
            <FormInputField
              label={t.verify.email}
              hideLabel
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              placeholder={t.verify.email}
            />
            <Button compact={compact} fullWidth disabled={!validEmail || busy} onClick={() => void send()}>
              {busy ? t.verify.sending : t.verify.send}
            </Button>
          </div>
        </div>
      )}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
    </StepShell>
  );
}
