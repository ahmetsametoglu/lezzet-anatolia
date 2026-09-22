'use client';

import { useMemo, useState } from 'react';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import type { LegalQuestion } from './legal-types';

/**
 * SSS'nin telefon dokusu, native `legal-faq`in ikizi: ikonsuz hap arama, kartlı akordeon ve altında düğmeli kesikli çıkış kutusu.
 * İlk soru kapalı açılır, çünkü telefonda açık bir cevap ekranın yarısını kaplayıp altındaki soruları görünmez yapardı.
 */
interface PhoneLegalFaqProps {
  questions: readonly LegalQuestion[];
  t: {
    searchPlaceholder: string;
    noMatch: string;
    notFoundTitle: string;
    notFoundCta: string;
  };
}

export function PhoneLegalFaq({ questions, t }: PhoneLegalFaqProps) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return questions;
    // Cevap da taranır: ziyaretçi çoğu zaman cevapta geçen kelimeyi arar.
    return questions.filter((q) => `${q.question} ${q.answer}`.toLocaleLowerCase().includes(needle));
  }, [questions, query]);

  return (
    <div className="flex flex-col gap-5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
        className="h-12.5 w-full rounded-pill border-[1.5px] border-sand-400 bg-card px-4 font-sans text-body-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-olive"
      />

      {matches.length === 0 && <p className="font-sans text-body-sm leading-[1.6] text-muted">{t.noMatch}</p>}

      <div className="flex flex-col gap-2.5">
        {matches.map((item) => {
          const open = openId === item.id;
          return (
            <div
              key={item.id}
              id={item.id}
              className="flex scroll-mt-16 flex-col gap-2.5 rounded-card border-[1.5px] border-sand-400 bg-card px-4 py-3.5"
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left transition-opacity hover:opacity-80"
              >
                <span className="font-sans text-body-sm leading-[1.6] font-semibold text-ink">{item.question}</span>
                <span aria-hidden className="flex-none font-sans text-step font-bold text-olive">
                  {open ? '−' : '＋'}
                </span>
              </button>
              {open && <p className="font-sans text-body-sm leading-[1.6] text-body">{item.answer}</p>}
            </div>
          );
        })}
      </div>

      {/* Cevabı bulunamayan soru talebe gider; SSS'ye form gömülmez. */}
      <div className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-olive-line px-4 py-3.5">
        <span className="font-sans text-control font-bold text-olive-dark">{t.notFoundTitle}</span>
        <SecondaryButton label={t.notFoundCta} href="/support/new" tone="olive" />
      </div>
    </div>
  );
}
