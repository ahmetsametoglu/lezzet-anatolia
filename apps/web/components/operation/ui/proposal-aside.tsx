import type { ReactNode } from 'react';
import { SubjectCard } from './subject-card';
import { PayloadTree } from './payload-tree';

/**
 * ÖNERİNİN ÖNİZLEMESİ — konu kartı + asistanın dilekçesi, formun YANINDA (22.10).
 *
 * ── NEDEN VAR: FORMUN GÖSTERDİĞİ ŞEY DEĞİŞİYOR, DİLEKÇE DEĞİŞMİYOR ──────────
 * Kullanıcının kendi cümlesi (10.08): *"Formda bazı değişiklikler yapsam bile formun varsayılan
 * değeri önerilen şekilde dolar; ama ben değiştirdiğim zaman önerinin ne olduğunu unutmam."*
 * Form bir TASLAKTIR ve operatör ona dokundukça asistanın ne dediği kaybolur. Bu sütun o kaydı
 * tutuyor: dokunulmaz, düzenlenmez, hep öneri anındaki hâli gösterir.
 *
 * ── SİLİNEN ÖNİZLEMEYLE AYNI ŞEY DEĞİL ──────────────────────────────────────
 * `assistant-preview` formun YERİNE anlatıyordu — bu yüzden silindi (aynı kararın iki dili). Bu
 * sütun formun YANINDA duruyor ve başka bir soruya cevap veriyor: "ne yazıyorum" değil, "asistan
 * ne demişti". İkisi aynı anda doğru olabilir ve ayrıştıkları an da zaten ekranda görünür.
 *
 * ── SAPMA SATIRDA GÖRÜNÜR ───────────────────────────────────────────────────
 * Operatör bir kutuyu değiştirince o satır iki değer taşır: asistanınki sönük, yenisi güçlü.
 * Ayrı bir "değişiklikler listesi" kurulmuyor — fark, ait olduğu satırın üstünde durur.
 *
 * ── ORTAK, ÇÜNKÜ ONBİR TİPİN ORTAK KURGUSU BU ───────────────────────────────
 * Kullanıcı kararı (10.08): *"Bu diğer öneri tiplerinde de olsun… özetle bir önerinin önizlemesi
 * olacak, bir de kategori/koleksiyon/ürün her ne ile ilgiliyse onunla alakalı bir tanıtım kartı,
 * bir de form."* Tip başına yazılsaydı on bir kopya doğardı ve üçüncüsünde biri sapmayı göstermeyi
 * unuturdu.
 */

/** Önizlemenin tek satırı. `now` doluysa ve `value`dan farklıysa satır sapmayı gösterir. */
export interface ProposalFact {
  label: string;
  /** ASİSTANIN önerdiği değer — değişmez. */
  value: string;
  /** Operatörün şu anki değeri; yalnız farklıysa çizilir. */
  now?: string | null;
}

interface ProposalAsideProps {
  /** Kararın konusu (ürün · kategori · koleksiyon…). `null` ise `fallbackTitle` yazılır. */
  subject: {
    name: string;
    detail: string | null;
    imageUrl: string | null;
    href: string | null;
  } | null;
  /** Konusu olmayan öneride tek satırlık karşılık ("Sepetin tamamı") — uydurma kart çizilmez. */
  fallbackTitle: string;
  /**
   * Elle kurulmuş künye satırları — tipin ÖNE ÇIKARDIĞI birkaç değer (fırsatta teklif ve liste
   * fiyatı gibi). Dilekçenin tamamı ayrıca `payload` ile basılıyor; buradaki satırlar onun yerine
   * değil, ÜSTÜNDE durur.
   */
  facts?: ProposalFact[];
  /**
   * Ham dilekçe — okunur bir ağaca çevrilip basılır (`PayloadTree`, 22.15).
   *
   * Kullanıcı kararı 11.08: *"ajandan gelen bilginin en sağda bir sütun şeklinde özeti olsun… JSON'ın
   * daha okunabilir şekilde çevrilmiş hâli. Bu tüm öneri diyaloglarında standart olacak."* Tip başına
   * elle künye yazmak şemaya eklenen alanı sessizce görünmez kılıyordu (22.12'de on iki alan açıldı,
   * hiçbiri kendiliğinden ekrana çıkmadı).
   */
  payload?: unknown;
  /** Karara özel ek not (tipin kendi uyarısı). */
  footer?: ReactNode;
}

export function ProposalAside({ subject, fallbackTitle, facts, payload, footer }: ProposalAsideProps) {
  return (
    // `min-h-0` ŞART: sütun kendi içinde kaydırıyor (dilekçe ağacı uzun olabiliyor) ve flexbox'ın
    // varsayılan `min-height: auto`'su altındaki `overflow-y-auto`yu etkisiz kılardı — Dialog
    // gövdesinde yaşanan arızanın aynısı (`dialog.tsx` künyesi, 11.08).
    <div className="flex min-h-0 min-w-[15rem] flex-1 basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">
        Asistanın önerisi
      </span>

      {subject ? (
        <SubjectCard
          name={subject.name}
          detail={subject.detail}
          imageUrl={subject.imageUrl}
          href={subject.href}
          size={96}
        />
      ) : (
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{fallbackTitle}</span>
      )}

      {facts && facts.length > 0 ? (
        <dl className="flex flex-col gap-1 border-t border-ops-line pt-2 font-ops-body text-ops-base text-ops-body">
          {facts.map((fact) => (
            <Row key={fact.label} fact={fact} />
          ))}
        </dl>
      ) : null}

      {/* Dilekçenin TAMAMI — kaydırılabilir, çünkü tip başına uzunluğu değişiyor (tarifin malzeme
          listesi ile vitrin işaretinin üç satırı aynı sütunda yaşıyor). Sütunun kendisi büyüyüp
          formu aşağı itmemeli. */}
      {payload !== undefined ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-ops-line pt-2">
          <PayloadTree payload={payload} />
        </div>
      ) : null}

      {footer ? <div className="pt-1">{footer}</div> : null}
    </div>
  );
}

/**
 * Künye satırı — etiket solda sönük, değer sağda mono (fırsat kartıyla aynı okuma biçimi).
 *
 * Sapmada asistanın değeri ÜSTÜ ÇİZİLİ kalır, silinmez: "ne önerilmişti" sorusunun cevabı tam da
 * değiştirildiği anda değerlenir.
 */
function Row({ fact }: { fact: ProposalFact }) {
  const changed = fact.now != null && fact.now !== fact.value;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ops-sm text-ops-muted">{fact.label}</dt>
      <dd className="flex items-baseline gap-1.5 text-right">
        <span
          className={
            changed
              ? 'font-ops-mono text-ops-sm text-ops-faint line-through'
              : 'whitespace-nowrap font-ops-mono font-semibold text-ops-ink'
          }
        >
          {fact.value}
        </span>
        {changed ? (
          <span className="whitespace-nowrap font-ops-mono font-semibold text-ops-violet">{fact.now}</span>
        ) : null}
      </dd>
    </div>
  );
}
