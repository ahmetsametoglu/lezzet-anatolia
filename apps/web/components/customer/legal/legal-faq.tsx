'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { pillInputClass } from '@/components/customer/form/pill-input';
import type { LegalQuestion } from './legal-types';

/**
 * SSS dokusu: arama, akordeon ve çıkış kutusu. Arama adrese yazılmaz (her tuş geçmişe kayıt bırakırdı) ve istemcide süzer,
 * çünkü soru kümesi operatörün elle kurduğu, tamamı sayfada duran küçük bir küme.
 */
interface LegalFaqProps {
  questions: LegalQuestion[];
  t: {
    searchPlaceholder: string;
    noMatch: string;
    notFoundTitle: string;
    notFoundCta: string;
  };
  compact?: boolean;
}

export function LegalFaq({ questions, t, compact = false }: LegalFaqProps) {
  const [query, setQuery] = useState('');
  // Açık olan TEK soru: akordeon aynı anda bir cevap gösterir, yoksa uzun cevaplarda ekran
  // kayıp bir metin duvarına döner ve "hangi soruyu okuyordum" sorusu doğar.
  const [openId, setOpenId] = useState<string | null>(questions[0]?.id ?? null);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return questions;
    // Soru VE cevap taranır: ziyaretçi çoğu zaman cevapta geçen kelimeyi arar ("soğuk zincir"),
    // sorunun kendi cümlesini değil.
    return questions.filter((q) => `${q.question} ${q.answer}`.toLocaleLowerCase().includes(needle));
  }, [questions, query]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* `SearchField` kullanılmıyor: o katalogun arama kutusu ve gönderimde `/catalog`a yönlendirir, burada ise canlı süzme var. */}
      <label className={`flex items-center gap-2 ${pillInputClass(compact ? 'w-full py-2.5' : 'w-[340px] py-2.5')}`}>
        <Icon name="search" size={16} strokeWidth={2.1} className="text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full bg-transparent font-sans text-body-sm text-ink outline-none placeholder:text-sand-600"
        />
      </label>

      {matches.length === 0 ? (
        <span className={`font-sans ${compact ? 'text-body-sm' : 'text-body'} text-muted`}>{t.noMatch}</span>
      ) : (
        matches.map((item) => {
          const open = openId === item.id;
          return (
            <div key={item.id} id={item.id} className="scroll-mt-24 rounded-card border border-sand-200 bg-card">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 ${compact ? 'px-4 py-3.5' : 'px-5 py-4'} text-left transition-colors hover:bg-hover-bg`}
              >
                <span className={`font-sans ${compact ? 'text-body-sm' : 'text-body'} font-bold text-ink`}>{item.question}</span>
                <span aria-hidden="true" className="flex-none font-sans text-body text-muted">
                  {open ? '▴' : '▾'}
                </span>
              </button>
              {open && (
                <p className={`font-sans ${compact ? 'px-4 pb-3.5 text-body-sm' : 'px-5 pb-4 text-body-sm'} leading-relaxed text-body`}>
                  {item.answer}
                </p>
              )}
            </div>
          );
        })
      )}

      {/* Kesikli çerçeve: bu bir cevap kartı değil, listenin bittiği yerdeki çıkış; cevabı bulunamayan soru talebe gider, form gömülmez. */}
      <div
        className={`flex items-center justify-between gap-3 rounded-card border-[1.5px] border-dashed border-sand-500 ${compact ? 'px-4 py-3' : 'px-5 py-3.5'}`}
      >
        <span className={`font-sans ${compact ? 'text-body-sm' : 'text-body'} text-body`}>{t.notFoundTitle}</span>
        <Link href="/support/new" className={buttonClass({ size: 'sm', compact, className: 'flex-none' })}>
          {t.notFoundCta}
        </Link>
      </div>
    </div>
  );
}
