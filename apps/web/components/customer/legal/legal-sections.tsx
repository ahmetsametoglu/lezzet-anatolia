import { Link } from '@/i18n/navigation';
import type { LegalDocument, LegalSection } from './legal-types';

/**
 * Statik sayfanın ORTAK blokları — masaüstü ve mobil dizilişin ikisi de buradan besleniyor.
 *
 * Ayrım şu: **ne yazdığı ortak, nasıl dizildiği ayrı.** Başlık, bölüm gövdesi ve bilgi bandı iki
 * cihazda aynı şeyi söyler (yalnız punto kademesi değişir); farklılaşan tek yapı gezinmedir —
 * masaüstünde solda yapışkan bir sütun, mobilde sayfa başında yatay çip dizisi. O yüzden gezinme
 * `.desktop`/`.mobile` dosyalarında, gövde burada.
 *
 * `compact` bayrağı tasarımın mobil punto kademesini taşır (h1 38→26, h2 24→20, gövde 15.5→14).
 * Arama tablosu değil düz koşul, çünkü tek eksen ve iki değer var — tablo burada fazladan bir
 * dolaylılık olurdu.
 */

interface LegalHeaderProps {
  title: string;
  /** Zaten sayfanın dilinde biçimlenmiş cümle ("Son güncelleme: 1 Temmuz 2026"). */
  updatedLine: string;
  compact?: boolean;
}

export function LegalHeader({ title, updatedLine, compact = false }: LegalHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className={`font-serif ${compact ? 'text-page-title-sm' : 'text-page-title'} text-ink`}>{title}</h1>
      {/* Yasal metinde hangi sürümün geçerli olduğu görünür olmalı — içerik envanterinin şartı. */}
      <span className={`font-sans ${compact ? 'text-micro' : 'text-note'} text-muted`}>{updatedLine}</span>
    </div>
  );
}

interface LegalBodyProps {
  sections: LegalSection[];
  compact?: boolean;
}

export function LegalBody({ sections, compact = false }: LegalBodyProps) {
  return (
    <>
      {sections.map((section) => (
        // `scroll-mt-*`: başlığa atlayınca yapışkan üst bar başlığı örtmesin — çapa hedefi
        // görünür alanın en tepesine düşerse okuyan, atladığı başlığı göremez.
        <section key={section.id} id={section.id} className="flex flex-col gap-2.5 scroll-mt-24">
          <h2 className={`font-serif ${compact ? 'text-h2-sm' : 'text-card-title'} text-ink`}>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className={`font-sans ${compact ? 'text-body-sm' : 'text-body'} leading-relaxed text-body`}>
              {paragraph}
            </p>
          ))}
          {section.bullets && (
            <ul className={`flex list-disc flex-col gap-1.5 pl-5 font-sans ${compact ? 'text-body-sm' : 'text-body'} leading-relaxed text-body`}>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

interface LegalNoticeBandProps {
  notice: NonNullable<LegalDocument['notice']>;
  compact?: boolean;
}

/**
 * Çıkış bandı — *"statik sayfa çıkmaz sokak olmamalı"* (içerik envanteri §2).
 *
 * Buraya belirli bir soruyla gelen ziyaretçi cevabı bulamadığında gidecek bir yer görmeli. Emoji
 * müşteri evreninin işareti (operasyon çizgi SVG kullanır); metin ile bağlar tek cümlede akıyor,
 * ayrı bir düğme değil — bant bir çağrı değil, bir hatırlatma.
 */
export function LegalNoticeBand({ notice, compact = false }: LegalNoticeBandProps) {
  return (
    <div className={`rounded-card bg-olive-bg ${compact ? 'px-3.5 py-3' : 'px-5 py-4'} font-sans ${compact ? 'text-body-sm' : 'text-body'} leading-relaxed text-ink`}>
      <span>💡 {notice.text} </span>
      {notice.links.map((link, index) => (
        <span key={link.label}>
          {index > 0 && <span className="text-body"> · </span>}
          <Link href={link.href} className="cursor-pointer font-bold text-olive transition-colors hover:text-olive-dark">
            {link.label}
          </Link>
        </span>
      ))}
    </div>
  );
}
