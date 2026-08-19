'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toCents } from '@lezzet/helper';
import type { DayCloseDraft } from '@/lib/courier/day-close';
import { closeDayAction } from './actions';
import { DayCloseDesktop } from './close.desktop';
import type { CountedDraft } from './close-types';

/**
 * Gün kapanışının istemci kökü.
 *
 * **Sayılan tutarlar BOŞ başlar (`null`), sıfır değil.** Beklenen tutarla doldurmak en "yardımsever"
 * seçenekti ve en tehlikelisi: kurye kutulara bakmadan onaylar, mutabakat kendi kendini doğrular ve
 * fark hiç doğmaz. Bu ekranın varlık sebebi tam olarak o farkı görünür kılmak; sayımı yapmayan bir
 * kapanış boş bir imzadır. Sıfır yazmak da yanlış olurdu — "saydım, hiç yok" ile "henüz saymadım"
 * aynı şey değil (CLAUDE.md §1: ölçülemeyen değer sıfır değildir).
 *
 * URL durumu YOK: kapanış tek bir günün tek bir anıdır, paylaşılacak bir görünüm değil.
 */
export function DayCloseClient({ draft }: { draft: DayCloseDraft }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState<CountedDraft>({ cash: null, card: null, cheque: null });
  const [note, setNote] = useState('');

  const close = () => {
    // Sefer yoksa kapanacak bir şey de yok — ekran zaten boş hâli gösteriyor, düğme hiç çizilmiyor.
    if (!draft.run) return;
    setError(null);
    const runId = draft.run.runId;
    startTransition(async () => {
      const { error: failed } = await closeDayAction({
        runId,
        countedCashCents: toCents(counted.cash ?? 0),
        countedCardCents: toCents(counted.card ?? 0),
        countedChequeCents: toCents(counted.cheque ?? 0),
        note: note.trim() || null,
      });
      if (failed) {
        setError(failed);
        return;
      }
      // Kapanmış gün SALT-OKUNUR: aynı ekran tazelenip kapanmış hâliyle açılır, başka yere
      // götürülmez — kurye ne kaydettiğini görmeden ekrandan çıkmamalı.
      router.refresh();
    });
  };

  return (
    <DayCloseDesktop
      draft={draft}
      counted={counted}
      onCounted={(method, euros) => setCounted((current) => ({ ...current, [method]: euros }))}
      note={note}
      onNote={setNote}
      busy={busy}
      error={error}
      onClose={close}
    />
  );
}
