'use client';

import { useState } from 'react';

/**
 * Sayısal girdilerin ODAK-TASLAK davranışı: yazarken serbest metin, odaktan çıkınca biçimli değer.
 *
 * İkisi de gerekli. Serbest yazım olmazsa "15," yazılamaz, yani ondalık hiç girilemez. Biçimlenmiş
 * çıktı olmazsa aynı ekranda `34,9` · `15.95` · `15,95` gibi üç ayrı yazım görünür.
 *
 * Odakta OLMAYAN alanın gösterimi değerin kendisinden türer — dışarıdan gelen değişiklik (paket
 * formunda payların otomatik dağıtımı, indirim yüzdesinin fiyatı doldurması) anında görünür.
 */
interface NumericDraftOptions {
  value: number | null;
  /** Odaksızken gösterilecek metin (ör. iki hane + virgül). */
  format: (value: number | null) => string;
  /** Odaklanınca düzenlemeye açılacak metin — biçimin süsü olmadan. */
  toDraft: (value: number | null) => string;
  /** Kutuya girmesine izin verilen karakterler süzülür, sonra sayıya indirilir. */
  sanitize: (raw: string) => string;
  parse: (raw: string) => number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
}

export function useNumericDraft({ value, format, toDraft, sanitize, parse, onChange, onBlur }: NumericDraftOptions) {
  // `null` = odakta değil → gösterim değerden türer. Dolu = yazılmakta olan taslak.
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? format(value),
    onFocus: () => setDraft(toDraft(value)),
    onChange: (raw: string) => {
      const next = sanitize(raw);
      setDraft(next);
      onChange(parse(next));
    },
    onBlur: () => {
      setDraft(null);
      onBlur?.();
    },
  };
}
