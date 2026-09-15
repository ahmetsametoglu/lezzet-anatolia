'use client';

import { useEffect, useRef } from 'react';

/*
  TEK KOD ALANI — native müşteri girişinin kod alanının (`CodeField`, `packages/mobile-kit/src/screens/login/code-field.tsx`)
  web telefon ikizi (15.09, `Musteri Mobil.dc.html` "Hızlı Doğrulama" karesinin kod adımı): altı rakam TEK girdide,
  ortalı ve rakamlar arası nefesli (tasarımın `.22em`i), 62'lik gövde (native `codeFieldHeight`), zeytin çerçeve, sayfa
  başlığı kademesinde kalın rakam.

  Kutulu alan (`auth/otp-code-input`) masaüstünün ve sepetin çizimi; bu alan telefon tasarımınınki. Tek girdi olduğu için
  yapıştırma ve tarayıcının kod önerisi (`autocomplete="one-time-code"`) kendiliğinden çalışır. Alan yalnız rakamı ve
  en çok `length` haneyi geçirir; müşteri biçim hatası görmez (native aynı kural).

  Ham `<input>` burada son çare değil, kitin kendisi: form kitinin öteki alanları etiket kabuğu taşıyor, karede etiket
  yok — ad ekran okuyucuya `label` ile gider.
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
  // Kod adımı açılınca imleç alanda: müşteri bir dokunuş daha yapmadan yazar (masaüstünün kutulu alanı da ilk kutuya
  // odaklanıyor).
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
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
