'use client';

import { useState } from 'react';
import { isValidEmail } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { cardClass } from '@/components/customer/ui/card';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { OtpCodeInput, type OtpResendResult, type OtpVerifyResult } from '@/components/customer/auth/otp-code-input';
import { GoogleIcon } from '@/components/customer/auth/provider-icons';
import { useAccount } from '@/components/customer/account/account-context';
import { useCart } from '@/components/customer/cart/cart-context';
import { AddressPickerDialog } from '@/components/customer/delivery/address-picker';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { createClient } from '@/lib/supabase/client';
import { authErrorMessage, type AuthErrorKey } from '@/lib/auth/errors';
import { sendEmailOtp, verifyEmailOtp } from '@/lib/auth/otp-actions';
import type { Messages } from '../cart-types';

/**
 * **Sepetin kimlik ve adres bloğu** — özet panelinin üstünde (kullanıcı kararı 13.09).
 *
 * Ödeme ekranına geçmeden önce iki şey belli olmalı: KİM ve NEREYE. İkisi de burada sorulur;
 * ödeme ekranı yalnız gösterir (`AddressStep` salt okunur). Ölçülen pratik de bu: Picard'da
 * sepetteki "Commander" giriş sayfasına götürüyor, REWE hesapsız sipariş almıyor.
 *
 * ── İKİ HÂL, TEK YER ────────────────────────────────────────────────────────
 * · Girişsiz → kompakt giriş bloğu. Adres alanı HİÇ görünmez (kullanıcı kararı): kimliği olmayan
 *   müşteriye adres sormak, cevabı kaydedemeyeceğimiz bir soru sormaktır.
 * · Girişli → seçili teslimat adresi + Değiştir · Düzenle; adres yoksa "+ Adres ekle". Seçim,
 *   ekleme ve düzenleme sepette biter (`AddressPickerDialog`); silme ve fatura işareti hesap
 *   sayfasında — panel dar, oraya bağ var.
 *
 * ── GİRİŞ BLOĞU ÖDEME EKRANININ ESKİ BLOĞU DEĞİL ────────────────────────────
 * Oradaki "adım 0" kartı 480 px'lik ortalanmış bir sütundu ve kullanıcı sepet için onu kaba buldu.
 * Burası özet kartının kendi dilinde: aynı kart kabuğu (`cardClass snug`), aynı başlık kademesi,
 * giriş sayfasının sırası (Google · ayraç · e-posta · gönder). Yeni bir görsel dil yok.
 *
 * **Giriş sonrası sayfa TAZELENİR, yönlendirilmez:** oturum çereze düşer, `router.refresh()` layout'u
 * yeniden çizer (hesap künyesi ve yer bağlamı iner), sepet yeniden okunur (`reload` — misafir
 * sepeti sunucuya devralınır, `readCartAction` künyesi). Müşteri sepetinden ayrılmaz.
 */
interface CartIdentityProps {
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

export function CartIdentity({ t, locale, compact = false }: CartIdentityProps) {
  const account = useAccount();
  return account ? <CartAddress t={t} locale={locale} compact={compact} /> : <CartLogin t={t} locale={locale} compact={compact} />;
}

function CartLogin({ t, locale, compact }: Required<CartIdentityProps>) {
  const c = t.identity;
  const router = useRouter();
  const { reload } = useCart();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const validEmail = isValidEmail(trimmed);

  /** Anahtar → cümle. `authErrorMessage` saf tablo; çeviri ekranda yapılıyor (denetim S1). */
  const say = (key: AuthErrorKey | null): string => (key ? authErrorMessage(key, locale) : c.googleUnavailable);

  const google = async () => {
    setError(null);
    const supabase = createClient();
    const next = `${window.location.pathname}${window.location.search}`;
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Dönüşte müşteri SEPETE döner, giriş sayfasına savrulmaz.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Paylaşılan cihazda hesap SEÇTİRİLİR: bir öncekinin oturumu sessizce devralınmasın.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (failure) setError(c.googleUnavailable);
  };

  const send = async () => {
    if (!validEmail || busy) return;
    setBusy(true);
    setError(null);
    const { data, errorKey } = await sendEmailOtp(trimmed);
    setBusy(false);
    if (!data) return setError(say(errorKey));
    setSent(true);
  };

  /** Yönlendirme adresi KULLANILMAZ: müşteri sepette kalır, sayfa tazelenince blok adrese döner. */
  const verify = async (code: string): Promise<OtpVerifyResult> => {
    const { data, errorKey } = await verifyEmailOtp(trimmed, code);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  };

  const resend = async (): Promise<OtpResendResult> => {
    const { data, errorKey } = await sendEmailOtp(trimmed);
    return data ? { ok: true } : { ok: false, error: say(errorKey) };
  };

  const verified = () => {
    // Sıra önemli: önce sepet (misafir listesi sunucuya devralınır), sonra sunucu kareleri.
    reload();
    router.refresh();
  };

  return (
    <div className={cardClass({ compact, pad: 'snug', compactPad: 'sm', gap: compact ? 'xs' : 'md' })}>
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{c.loginTitle}</span>
      <p className="font-sans text-note leading-relaxed text-body">{c.loginBody}</p>

      {sent ? (
        // Kod gönderildi → odaklı görünüm: seçim kalkar, tek iş var. Kutu GİRİŞ SAYFASININ bileşeni.
        <div className="flex flex-col gap-3">
          <OtpCodeInput email={trimmed} locale={locale} onVerify={verify} onResend={resend} onSuccess={verified} />
          {/* Kilitlenmez: yanlış adres yazan ya da Google'a geçmek isteyen geri döner. */}
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            {c.otherMethod}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="secondary" compact={compact} fullWidth onClick={() => void google()}>
            <GoogleIcon /> {c.google}
          </Button>

          <div className="flex items-center gap-3 font-sans text-note text-sand-600">
            <span className="h-px flex-1 bg-sand-300" />
            {c.or}
            <span className="h-px flex-1 bg-sand-300" />
          </div>

          <div className="flex flex-col gap-2.5">
            <FormInputField
              label={c.email}
              hideLabel
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              placeholder={c.email}
            />
            <Button compact={compact} fullWidth disabled={!validEmail || busy} onClick={() => void send()}>
              {busy ? c.sending : c.send}
            </Button>
          </div>
        </div>
      )}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
    </div>
  );
}

function CartAddress({ t, locale, compact }: Required<CartIdentityProps>) {
  const c = t.identity;
  const { address } = useDeliveryPlace();
  const [open, setOpen] = useState<'list' | 'new' | 'edit' | null>(null);

  return (
    <div className={cardClass({ compact, pad: 'snug', compactPad: 'sm', gap: compact ? 'xs' : 'md' })}>
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{c.addressTitle}</span>

      {address ? (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-body-sm font-bold text-ink">{address.label || address.city}</span>
            <span className="font-sans text-note leading-relaxed text-body">
              {address.line1}
              {address.line2 && `, ${address.line2}`}
            </span>
            <span className="font-sans text-note leading-relaxed text-body">
              {address.postalCode} {address.city}
            </span>
          </div>
          <span className="font-sans text-micro text-muted">{c.addressBody}</span>
          {/* İki metin bağı, düğme değil: panel dar, eylemler ikincil — asıl eylem aşağıdaki
              "Ödemeye geç". Hesap sayfasının adres satırıyla aynı dil. */}
          <div className="flex flex-wrap items-center gap-3 font-sans text-note font-semibold">
            <button type="button" onClick={() => setOpen('list')} className="cursor-pointer text-olive underline hover:text-olive-dark">
              {c.addressChange}
            </button>
            <button type="button" onClick={() => setOpen('edit')} className="cursor-pointer text-muted underline hover:text-olive">
              {c.addressEdit}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-sans text-note leading-relaxed text-body">{c.addressEmpty}</p>
          <Button variant="secondary" size="sm" compact={compact} onClick={() => setOpen('new')}>
            {c.addressAdd}
          </Button>
        </>
      )}

      {open && <AddressPickerDialog locale={locale} compact={compact} initialMode={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
