'use client';

import { useState, type ReactNode } from 'react';
import type { AssistantWarning, AssistantWarningLevel } from '@lezzet/types';
import { SubjectCard } from './subject-card';
import { PayloadTree } from './payload-tree';
import { labelOf } from './payload-labels';
import { ChevronDownIcon } from './icons';
import { shortDateTime } from './format';

/**
 * ÖNERİNİN SÜTUNU — konu, gerekçe, uyarılar, operatörün sapmaları ve dilekçenin tamamı (22.10).
 *
 * ── NEDEN VAR: FORMUN GÖSTERDİĞİ ŞEY DEĞİŞİYOR, DİLEKÇE DEĞİŞMİYOR ──────────
 * Form bir TASLAKTIR ve operatör ona dokundukça asistanın ne dediği kaybolur. Bu sütun o kaydı
 * tutuyor: dokunulmaz, düzenlenmez, hep öneri anındaki hâli gösterir.
 *
 * ── SEKMELER KALKTI, TEK AKIŞ (tasarım kaydı) ───────────────────────────────
 * Bir tur sütunun tepesinde iki sekme vardı (Görünüm · Metadata) ve operatör aradığı şey için
 * ikisi arasında gidip geliyordu. Sıra artık kararın sırası: **kimlik → gerekçe → uyarılar →
 * sizin değişiklikleriniz → önerinin tamamı → teknik künye.** Eski "Metadata" en alttaki katlanır
 * künyeye indi; hiçbir şey kaybolmadı, yalnız yeri okuma sırasına göre değişti.
 *
 * ── İSKELET HER TİPTE AYNI, DEĞİŞEN DEĞERİN ŞEKLİ ───────────────────────────
 * On üç öneri tipinin hepsi bu sütunu kullanıyor. Tipe göre değişen tek şey "Önerinin tamamı"
 * içindeki değerlerin şeklidir (metin · sayı · para · kalem listesi · etiket kümesi) ve o bölüm
 * dilekçeden TÜRETİLİR (`PayloadTree`), tip başına elle yazılmaz: elle yazıldığı dönemde şemaya
 * eklenen on iki alan ekranda hiç görünmemişti.
 */

/**
 * Kararın TEKNİK künyesi + sütunun kimlik bloğunu besleyen alanlar.
 *
 * Gerekçe ve uyarılar buradan taşınıyor çünkü on üç gövdenin hepsi `meta`yı zaten geçiriyor:
 * ayrı proplar açılsaydı on üç çağrı yerinin on üçü birden düzenlenecekti.
 */
export interface ProposalMeta {
  /** Öneri kimliği — konuşmada ilk sekiz hanesiyle anılır. */
  id: string;
  /** Uygulamanın yazacağı tablolar (`bundle`, `bundle_item`…). */
  targetTables: string[];
  /** Uygulama sonrası doğan kayıtların kimlikleri; karar verilmemişse `null`. */
  result: Record<string, string> | null;
  /** Tipin Türkçe rozeti ("Ürün", "Mal kabul") — sütunun kimlik bloğunda. */
  kindLabel: string;
  /** Önerinin yazıldığı an. */
  createdAt: string;
  /**
   * "Neden bu öneri" — kararın DAYANAĞI. `null` ise blok yine çizilir ve bunu söyler: gerekçesiz
   * bir öneri onaylanabilir, ama patron neye dayandığını göremediğini BİLMELİ (brief §3).
   */
  reason: string | null;
  /**
   * "Onaylamadan önce" maddeleri. Boş dizi bir CEVAPTIR ("işaretlenen bir şey yok") ve yazılır;
   * `null` aracın hiç konuşmadığı hâldir — o zaman bölüm hiç çizilmez, bir şey vaat edilmez.
   */
  warnings: AssistantWarning[] | null;
}

/**
 * Önizlemenin tek satırı. **`now` verilmişse satır YALNIZ SAPMA VARKEN çizilir** ve "Formda
 * değiştirdiniz" bölümüne düşer; verilmeyen satır dilekçeden TÜRETİLMİŞ bir özettir ("kaç dolu
 * alanın üstüne yazılacak") ve "Önerinin tamamı"nın künyesinde hep durur.
 *
 * Kural şu: **karşılaştırılabilir olan sapmada konuşur, türetilmiş olan hep konuşur.**
 */
export interface ProposalFact {
  label: string;
  /** ASİSTANIN önerdiği değer — değişmez. */
  value: string;
  /** Operatörün şu anki değeri; verilirse satır karşılaştırma olur. */
  now?: string | null;
}

interface ProposalAsideProps {
  /** Kararın konusu (ürün · kategori · tedarikçi…). `null` ise `fallbackTitle` yazılır. */
  subject: {
    name: string;
    detail: string | null;
    imageUrl: string | null;
    href: string | null;
  } | null;
  /** Konusu olmayan öneride tek satırlık karşılık ("Defter satırı") — uydurma kart çizilmez. */
  fallbackTitle: string;
  /** Tipin öne çıkardığı değerler; dilekçenin tamamı ayrıca basılır. */
  facts?: ProposalFact[];
  /** Ham dilekçe — okunur bir ağaca çevrilip basılır (`PayloadTree`). */
  payload?: unknown;
  meta?: ProposalMeta;
  /** Karara özel ek not (tipin kendi uyarısı). */
  footer?: ReactNode;
}

export function ProposalAside({ subject, fallbackTitle, facts, payload, meta, footer }: ProposalAsideProps) {
  const changed = (facts ?? []).filter((fact) => fact.now != null && fact.now !== fact.value);
  const derived = (facts ?? []).filter((fact) => fact.now == null);

  return (
    <div className="flex min-h-0 min-w-[15rem] flex-1 basis-0 flex-col overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
      {/* ── YAPIŞKAN BAŞLIK: kimlik + gerekçe ───────────────────────────────────
          Uzun bir dilekçede aşağı inen operatör neyin üstünde çalıştığını kaybetmemeli; kararın
          konusu ve dayanağı kaydırmanın dışında kalıyor. */}
      <div className="flex flex-none flex-col gap-2.5 border-b border-ops-line bg-ops-subtle px-3.5 py-3">
        <span className="flex items-center justify-between gap-2">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">
            Asistanın önerisi
          </span>
          {/* İnsan-okunur numara YOK (sözleşme §2d): bunun muhatabı yalnız patron ve bu ekran;
              kimliğin ilk sekiz hanesi konuşmada anılmaya yeter. */}
          {meta ? <span className="font-ops-mono text-ops-micro text-ops-faint">{meta.id.slice(0, 8).toUpperCase()}</span> : null}
        </span>

        {subject ? (
          <SubjectCard name={subject.name} detail={subject.detail} imageUrl={subject.imageUrl} href={subject.href} size={42} />
        ) : (
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{fallbackTitle}</span>
        )}

        {meta ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-1.5 py-px font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-violet">
              {meta.kindLabel}
            </span>
            <span className="font-ops-body text-ops-micro text-ops-muted">{shortDateTime(meta.createdAt)}</span>
          </span>
        ) : null}
      </div>

      {meta ? <ReasonBlock reason={meta.reason} /> : null}

      <div className="-mr-3 flex min-h-0 flex-auto flex-col gap-0 overflow-y-auto pr-3">
        {meta?.warnings ? <WarningsBlock warnings={meta.warnings} /> : null}

        {changed.length > 0 ? (
          <Section title="Formda değiştirdiniz" count={changed.length}>
            {changed.map((fact) => (
              <ChangedRow key={fact.label} fact={fact} />
            ))}
            <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">
              Uygulanacak değer sağdakidir; asistanın önerisi kayıtta iz olarak kalır.
            </span>
          </Section>
        ) : null}

        {payload !== undefined ? (
          <Section title="Önerinin tamamı">
            {derived.length > 0 ? (
              <dl className="flex flex-col gap-1 font-ops-body text-ops-base text-ops-body">
                {derived.map((fact) => (
                  <span key={fact.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ops-sm text-ops-muted">{fact.label}</dt>
                    <dd className="text-right font-ops-mono font-semibold text-ops-ink">{fact.value}</dd>
                  </span>
                ))}
              </dl>
            ) : null}
            <PayloadTree payload={payload} />
          </Section>
        ) : null}
      </div>

      {meta ? <TechnicalBlock meta={meta} payload={payload} /> : null}
      {footer ? <div className="flex-none border-t border-ops-line px-3.5 py-2">{footer}</div> : null}
    </div>
  );
}

/**
 * "Neden bu öneri" — kararın dayanağı, olive zeminde ve yapışkan başlığın hemen altında.
 *
 * **Gerekçesiz öneri de bir şey söyler ve söylemeye devam ediyor** (brief §3): blok gizlenmiyor,
 * içinde eksikliğin kendisi yazıyor. Gizlenseydi operatör gerekçeyi aramaz, olduğunu sanırdı.
 */
function ReasonBlock({ reason }: { reason: string | null }) {
  return (
    <div className="flex flex-none flex-col gap-1 border-b border-ops-line border-l-[3px] border-l-ops-olive bg-ops-olive-bg px-3.5 py-2.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-olive-dark">Neden bu öneri</span>
      <span className={`font-ops-body text-ops-sm leading-relaxed ${reason ? 'text-ops-strong' : 'text-ops-muted'}`}>
        {reason ?? 'Asistan bir sinyal yazmadı — onaylayabilirsiniz, ama neye dayandığını göremiyorsunuz.'}
      </span>
    </div>
  );
}

/**
 * "Onaylamadan önce" — asistanın MADDE MADDE uyarıları (`0042`, tasarım kaydı).
 *
 * Bir tur bunların hepsi tek bir gerekçe cümlesine sıkışıyordu ve üçü birden okunmuyordu. Şiddet
 * RENKTEN okunuyor ve kırmızı yalnız geri alınamaz olanındır: kehribar "dikkat et" derken kırmızı
 * "bundan dönüş yok" diyor — ikisi aynı tonda çizilseydi gerçekten tehlikeli olan kaybolurdu.
 *
 * **Boş liste de yazılır:** "işaretlenen bir şey yok" bir cevaptır ve sessizlikten ayrıdır.
 */
function WarningsBlock({ warnings }: { warnings: AssistantWarning[] }) {
  if (warnings.length === 0) {
    return (
      <Section title="Onaylamadan önce">
        <span className="flex items-center gap-2 font-ops-body text-ops-sm font-medium text-ops-olive-dark">
          <span aria-hidden className="size-1.5 flex-none rounded-full bg-ops-olive" />
          Asistanın işaretlediği bir şey yok.
        </span>
      </Section>
    );
  }
  return (
    <Section title="Onaylamadan önce" count={warnings.length} countTone="amber">
      {warnings.map((warning, i) => (
        <div
          key={`${warning.level}-${warning.field ?? i}`}
          className={`flex flex-col gap-1 rounded-ops-card px-3 py-2.5 ${LEVEL_SKIN[warning.level]}`}
        >
          <span className="font-ops-display text-ops-sm font-semibold">{titleOf(warning)}</span>
          {warning.note ? <span className="font-ops-body text-ops-sm leading-relaxed text-ops-body">{warning.note}</span> : null}
        </div>
      ))}
    </Section>
  );
}

/**
 * Uyarının kabuğu. `untouched` KESİKLİ ve zeminsiz: "dokunmadım" bir risk değil, bir bilgidir —
 * dolu bir zemin ona hak etmediği ağırlığı verirdi.
 */
const LEVEL_SKIN: Record<AssistantWarningLevel, string> = {
  unclear: 'border border-l-[3px] border-ops-amber-line border-l-ops-amber bg-ops-amber-bg text-ops-amber-dark',
  overwrite: 'border border-l-[3px] border-ops-blue-line border-l-ops-blue bg-ops-blue-bg text-ops-blue-dark',
  untouched: 'border border-dashed border-ops-line-strong text-ops-body',
  irreversible: 'border border-l-[3px] border-ops-red-line border-l-ops-red bg-ops-red-bg text-ops-red-dark',
};

/**
 * Uyarının BAŞLIĞI — seviyeden ve alandan kurulur, araca yazdırılmaz.
 *
 * Başlığı da modele bıraksaydık on üç araç on üç farklı cümle kurardı ve aynı şey ekranda her
 * seferinde başka türlü okunurdu. Araçtan gelen `note` cümlenin AYRINTISI; başlık sistemin dili.
 */
function titleOf(warning: AssistantWarning): string {
  const alan = warning.field ? labelOf(warning.field) : null;
  switch (warning.level) {
    case 'unclear':
      return alan ? `${alan} net okunamadı` : 'Bir alan net okunamadı';
    case 'overwrite':
      return alan ? `${alan} dolu — üzerine yazılacak` : 'Dolu alanların üzerine yazılacak';
    case 'untouched':
      return alan ? `${alan} alanına dokunulmadı` : 'Asistan bazı alanlara dokunmadı';
    case 'irreversible':
      return alan ? `${alan}: uygulanınca geri alınamaz` : 'Uygulanınca geri alınamaz';
  }
}

/** Sütunun bölüm kabuğu — başlık + sayaç + gövde; kenarlık bölümler arasında tek çizgi. */
function Section({
  title,
  count,
  countTone = 'neutral',
  children,
}: {
  title: string;
  count?: number;
  countTone?: 'neutral' | 'amber';
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-ops-line px-3.5 py-3 last:border-b-0">
      <span className="flex items-center gap-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">{title}</span>
        {count !== undefined ? (
          <span
            className={`rounded-ops-chip px-1.5 font-ops-display text-ops-micro font-semibold ${
              countTone === 'amber' ? 'border border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark' : 'bg-ops-line-soft text-ops-body'
            }`}
          >
            {count}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

/**
 * Sapma satırı — asistanın değeri ÜSTÜ ÇİZİLİ kalır, silinmez: "ne önerilmişti" sorusunun cevabı
 * tam da değiştirildiği anda değerlenir.
 */
function ChangedRow({ fact }: { fact: ProposalFact }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-ops-body text-ops-micro text-ops-muted">{fact.label}</span>
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="font-ops-mono text-ops-sm text-ops-faint line-through">{fact.value}</span>
        <span aria-hidden className="font-ops-body text-ops-xs text-ops-faint">
          →
        </span>
        <span className="rounded-ops-chip border border-ops-olive-line bg-ops-olive-bg px-1.5 font-ops-mono text-ops-sm font-semibold text-ops-olive-dark">
          {fact.now}
        </span>
      </span>
    </div>
  );
}

/**
 * Teknik künye — eski "Metadata" sekmesinin yeni yeri: en altta, KATLI.
 *
 * Sekmeyken sütunun yarısını tutuyordu ve operatör aradığı şey için gidip geliyordu; burada
 * kapalı duruyor, arayan açıyor. İçinde ne istendi (dilekçe) ve ne oluştu (`result`) yan yana —
 * ikisi birlikte okununca kararın izi tamamlanıyor.
 */
function TechnicalBlock({ meta, payload }: { meta: ProposalMeta; payload: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex-none border-t border-ops-line bg-ops-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <span className={`flex-none text-ops-body transition-transform ${open ? '' : '-rotate-90'}`}>
          <ChevronDownIcon size={11} />
        </span>
        <span className="font-ops-display text-ops-micro font-semibold text-ops-body">Teknik künye</span>
        <span className="font-ops-body text-ops-micro text-ops-faint">kimlik · tablolar · JSON</span>
      </button>
      {open ? (
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto border-t border-ops-line-soft px-3.5 py-2.5">
          <span className="font-ops-body text-ops-micro text-ops-muted">
            Hedef tablolar: <span className="font-ops-mono text-ops-strong">{meta.targetTables.join(', ') || '—'}</span>
          </span>
          <pre className="m-0 whitespace-pre-wrap break-words font-ops-mono text-ops-micro leading-relaxed text-ops-strong">
            {JSON.stringify(payload, null, 2)}
          </pre>
          {meta.result ? (
            <pre className="m-0 whitespace-pre-wrap break-words border-t border-ops-line-soft pt-2 font-ops-mono text-ops-micro leading-relaxed text-ops-strong">
              {JSON.stringify(meta.result, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
