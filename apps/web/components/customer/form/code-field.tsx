'use client';

import { useEffect, useRef } from 'react';

/*
  Telefon tasarımının tek girdili kod alanı; kutulu `auth/otp-code-input` masaüstünün ve sepetin çizimidir. Tek girdi olduğu
  için yapıştırma ve tarayıcının kod önerisi kendiliğinden çalışır; kural native eşiyle
  (`apps/mobile-customer/src/screens/login/code-field.tsx`) aynı: yalnız rakam, en çok `length` hane.
*/
interface CodeFieldProps {
  value: string;
  /** Yalnız rakamlar, en çok `length` hane. */
  onChange: (digits: string) => void;
  /** Ekran okuyucu adı ("Tek kullanımlık kod") — çeviri çağıranda çözülür. */
  label: string;
  placeholder: string;
  length: number;
  /** Doğrulama reddettiyse kırmızı çerçeve — cümle çağıranın satırında. */
  invalid?: boolean;
}

export function CodeField({ value, onChange, label, placeholder, length, invalid = false }: CodeFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  // Kod adımı açılınca imleç alanda: müşteri bir dokunuş daha yapmadan yazar.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    // Ham girdi: form kitinin alanları etiket kabuğu taşır, tasarımda etiket yok; ad ekran okuyucuya `label` ile gider.
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={length}
      value={value}
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, length))}
      className={[
        'h-15.5 w-full rounded-card border-[1.5px] bg-card px-6 text-center font-sans text-page-title-sm font-bold tracking-[0.22em] text-ink outline-none transition-colors placeholder:text-muted focus:ring-[0.5px] focus:ring-inset',
        invalid ? 'border-terracotta-bright focus:ring-terracotta-bright' : 'border-olive focus:ring-olive',
      ].join(' ')}
    />
  );
}
