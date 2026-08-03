'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { pillInputClass } from '@/components/customer/form/pill-input';
import type { LegalQuestion } from './legal-types';

/**
 * SSS dokusu — arama + akordeon + çıkış kutusu (tasarım: "SSS dokusu (aynı şablon, soru-cevap
 * içerik)").
 *
 * **Arama URL'e YAZILMAZ**, katalogun aksine. Katalogda süzgeç adreste yaşar çünkü süzülmüş bir
 * liste paylaşılabilir bir şeydir; SSS'de arama ise bir gezinme hareketidir — ziyaretçi "iade"
 * yazıp cevabı okur ve o adresi kimseye göndermez. Adrese yazmak her tuşta geçmişe bir kayıt
 * bırakırdı ve geri düğmesi harf harf geri saymaya başlardı.
 *
 * **Süzme istemcide ve bu bilinçli:** soru sayısının doğal bir tavanı var (operatörün elle kurduğu
 * küme — `CLAUDE.md §1`'in "sayfalama ölçütü sınırsız büyümek" ayrımı), tamamı zaten sayfada.
 * Sunucuya sormak, elimizde duran veriyi ikinci kez istemek olurdu.
 *
 * **İçine form GÖMÜLMEZ** (içerik envanteri §6): cevabı bulunamayan soru talebe yönlendirilir, SSS
 * destek talebinin yerine geçirilmez.
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
      {/* `SearchField` KULLANILMIYOR ve sebebi işlevsel: o bileşen katalogun arama kutusu, gönderimde
          `/catalog`a yönlendiriyor. Buradaki arama bir gezinme değil canlı bir süzme — aynı ada
          sahip iki farklı davranış. Kitin hap girdisi (`pillInputClass`) doğru zemin. */}
      <label className={`flex items-center gap-2 ${pillInputClass(compact ? 'w-full py-2.5' : 'w-[340px] py-2.5')}`}>
        <span aria-hidden="true" className="flex-none text-body-sm">🔍</span>
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

      {/* Kesikli çerçeve tasarımın kararı: bu bir cevap kartı DEĞİL, listenin bittiği yerdeki çıkış. */}
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
