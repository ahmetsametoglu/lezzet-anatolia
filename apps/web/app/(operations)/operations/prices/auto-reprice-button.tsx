'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { repriceAutoAction } from './actions';

/**
 * "Otomatik fiyatları hedefe çek" — katalog geneli toplu hizalama (09.5).
 *
 * Neden ayrı bir düğme var: otomatik fiyatın iki doğal tetiği OLAYA bağlıdır (mal kabulde maliyet
 * değişimi, diyalogda hedef değişimi). Aradan geçen sürede sapmış ürünleri hizalamak için tek tek
 * diyalog açmak gerekirdi; bu düğme aynı hesabı katalogun tamamına uygular.
 *
 * SONUÇ SAYIYLA söylenir ("7 fiyat güncellendi"): otomatik de olsa fiyat değişimi sessiz olmamalı
 * (tasarım: "sürpriz fiyat olmaz"). Hiçbir şey değişmediyse de bunu söyler — "hedefteydi zaten"
 * bilgisi, "düğme çalışmadı mı?" sorusunu önler.
 */
export function AutoRepriceButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  const run = async () => {
    setBusy(true);
    setNote(null);
    const result = await repriceAutoAction();
    setBusy(false);

    if (result.error || !result.data) {
      setNote({ text: result.error ?? 'Hizalama yapılamadı.', error: true });
      return;
    }
    const { changed, held, truncated } = result.data;
    const parts = [changed === 0 ? 'Tüm otomatik ürünler hedefte' : `${changed} fiyat hedefe çekildi`];
    // Duran satırı SÖYLEMEK şart: "0 fiyat değişti" ile "3 üründe maliyet sıçradı, durdum" aynı
    // cümle değil — ikincisi bir karar bekliyor.
    if (held > 0) parts.push(`${held} boyda maliyet sıçradı, karar sizde`);
    if (truncated) parts.push('liste sınıra dayandı, tekrar çalıştırın');
    setNote({ text: parts.join(' · '), error: false });
  };

  return (
    <div className="flex items-center gap-2.5">
      {note ? (
        <span className={`font-ops-body text-ops-xs ${note.error ? 'text-ops-red' : 'text-ops-muted'}`}>{note.text}</span>
      ) : null}
      <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
        {busy ? 'Hizalanıyor…' : 'Otomatik fiyatları hedefe çek'}
      </Button>
    </div>
  );
}
