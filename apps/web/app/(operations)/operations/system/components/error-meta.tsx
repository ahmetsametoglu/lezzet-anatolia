import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ErrorLogLevel } from '@lezzet/types';
import { shortDate, shortDateTime } from '@/components/operation/ui/format';
import type { ErrorRowView } from '../system-types';

/**
 * Hata kaydının ortak parçaları (18.5): seviye rozeti · regresyon notu · bağlam ızgarası.
 *
 * Üç yüzey aynı hatayı gösteriyor (geniş inceleme O25 · dialog O9 · telefon kartı) ve üçü de aynı
 * alanları yazıyor. Ayrı ayrı yazılsalardı biri bir gün `orderId` köprüsünü unuturdu.
 */

const LEVEL: Record<ErrorLogLevel, { cls: string; dot: string; label: string }> = {
  // `fatal` DOLU: akış tamamen koptu. Çerçeveli bir rozet, listeyi tararken `error`dan ayrışmazdı.
  fatal: { cls: 'border-ops-alarm bg-ops-alarm text-ops-alarm-ink', dot: 'bg-ops-alarm', label: 'fatal' },
  error: { cls: 'border-ops-red-line bg-ops-red-bg text-ops-red-dark', dot: 'bg-ops-red', label: 'error' },
  warning: { cls: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark', dot: 'bg-ops-amber-dot', label: 'warning' },
};

export function LevelBadge({ level }: { level: ErrorLogLevel }) {
  const t = LEVEL[level];
  return (
    <span className={`rounded-[5px] border px-2 py-[3px] font-ops-display text-[10px] font-semibold uppercase tracking-[0.07em] ${t.cls}`}>
      {t.label}
    </span>
  );
}

export function LevelDot({ level }: { level: ErrorLogLevel }) {
  return <span className={`h-[7px] w-[7px] flex-none rounded-full ${LEVEL[level].dot}`} aria-hidden="true" />;
}

/** "geri geldi" — çözülmüş bir hatanın dönüşü, hiç çözülmemiş bir hatadan FARKLI bir haberdir. */
export function RegressionChip() {
  return (
    <span className="rounded-[5px] border border-ops-amber-line bg-ops-amber-bg px-1.5 py-[2px] font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ops-amber-dark">
      geri geldi
    </span>
  );
}

export function ResolvedChip({ at, by }: { at: string; by: string | null }) {
  return (
    <span className="rounded-[5px] bg-ops-olive-bg px-2 py-[2px] font-ops-mono text-[10.5px] font-medium text-ops-olive-dark">
      çözüldü · {shortDate(at)}
      {by ? ` · ${by}` : ''}
    </span>
  );
}

/** Regresyon kutusu — satırın neden yeni açıldığını söyler (O10 uyarı kutusu deseni). */
export function RegressionNote({ row }: { row: ErrorRowView }) {
  if (!row.regression) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-[9px] border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-ops-amber" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
      <span className="font-ops-body text-ops-xs font-medium leading-[1.55] text-ops-amber-dark">
        {shortDate(row.regression.resolvedAt)} tarihinde çözüldü işaretlenmişti
        {row.regression.byName ? ` (${row.regression.byName})` : ''}; sonra yeniden geldi. Bu satır yeni açıldı — “hiç çözülmemiş bir
        hata” değil, geri gelmiş bir hata.
      </span>
    </div>
  );
}

interface MetaEntry {
  k: string;
  v: ReactNode;
}

/**
 * Bağlam ızgarası. **Kimlik taşır, içerik taşımaz** (`OBSERVABILITY §5`): sipariş numarası görünür,
 * müşterinin e-postası görünmez. Ekranın işi teşhis — teşhis için kimlik yeter, o kimlikle
 * veritabanına bakılır.
 *
 * `orderId` bir KÖPRÜDÜR: hatadan siparişe tek tıkla geçilir (`admin-sistem.md §5`). Kimliği elle
 * kopyalayıp arama kutusuna yapıştırmak, teşhisin en sık tekrar eden ve en gereksiz adımıydı.
 */
function metaEntries(row: ErrorRowView): MetaEntry[] {
  const out: MetaEntry[] = [
    { k: 'kaç kez', v: `${row.count.toLocaleString('tr-TR')} kez` },
    { k: 'ilk görülme', v: shortDateTime(row.firstSeenAt) },
    { k: 'son görülme', v: shortDateTime(row.lastSeenAt) },
    { k: 'yol', v: row.path ?? '— (istek yolu yok)' },
  ];

  for (const [key, value] of Object.entries(row.context)) {
    const metin = value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    out.push({
      k: key,
      v:
        key === 'orderId' && metin !== '—' ? (
          <Link href={`/operations/orders/${metin}`} className="text-ops-olive underline-offset-2 hover:underline">
            {metin}
          </Link>
        ) : (
          metin
        ),
    });
  }

  if (row.resolvedAt) {
    out.push({ k: 'çözüldü', v: `${shortDate(row.resolvedAt)}${row.resolvedByName ? ` · ${row.resolvedByName}` : ''}` });
  }
  return out;
}

/** `columns='auto'` geniş sütunda sarmalanan ızgara; `'two'` dialogun sabit iki kolonu. */
export function ErrorMetaGrid({ row, columns = 'auto' }: { row: ErrorRowView; columns?: 'auto' | 'two' | 'list' }) {
  const entries = metaEntries(row);

  if (columns === 'list') {
    return (
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-ops-line px-3 py-2.5">
        {entries.map((e) => (
          <div key={e.k} className="flex items-baseline gap-2.5">
            <span className="w-[88px] flex-none font-ops-body text-ops-micro text-ops-muted">{e.k}</span>
            <span className="flex-1 break-all font-ops-mono text-ops-xs font-medium text-ops-strong">{e.v}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={[
        'grid gap-x-[22px] gap-y-2.5 rounded-[10px] border border-ops-line px-4 py-3.5',
        columns === 'two' ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fit,minmax(150px,1fr))]',
      ].join(' ')}
    >
      {entries.map((e) => (
        <div key={e.k} className="flex min-w-0 flex-col gap-0.5">
          <span className="font-ops-body text-[10.5px] text-ops-muted">{e.k}</span>
          <span className="break-all font-ops-mono text-ops-sm font-medium text-ops-strong">{e.v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Bağlamın kopyalanabilir metni — telefonda "bağlamı kopyala" düğmesinin yazdığı şey.
 * Köprüler ve biçim düşer; kalan, bir yere yapıştırılabilir düz anahtar-değer listesidir.
 */
export function contextText(row: ErrorRowView): string {
  const satirlar = [
    `mesaj: ${row.message}`,
    `kaynak: ${row.source}`,
    `yol: ${row.path ?? '—'}`,
    `kez: ${row.count}`,
    `ilk: ${row.firstSeenAt}`,
    `son: ${row.lastSeenAt}`,
    ...Object.entries(row.context).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
  ];
  return satirlar.join('\n');
}
