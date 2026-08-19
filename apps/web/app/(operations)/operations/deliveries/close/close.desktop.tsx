'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { PageHeader } from '@/components/operation/ui/page-header';
import { money, num } from '@/components/operation/ui/format';
import { toCents } from '@lezzet/helper';
import type { CourierStop } from '@/lib/courier/day';
import { CLOSE_METHODS, type CloseMethod, type DayCloseViewProps } from './close-types';
import { CLOSE_NOTES, METHOD_LABEL } from '../deliveries-labels';

// Gün kapanışı — MASAÜSTÜ. Gün listesi ve durak ekranıyla aynı dar sütun (560 px): üçü aynı yüzeyin
// üç anıdır, biri geniş biri dar olsaydı kurye her adımda başka bir ekrana geçtiğini sanırdı.

/** Beklenen tutarı bir yerden okumak: kapanmışsa dondurulmuş fotoğraf, açıksa canlı görünüm. */
function expectedOf(props: DayCloseViewProps, method: CloseMethod): number {
  const closed = props.draft.closed;
  if (closed) {
    return method === 'cash' ? closed.expectedCashCents : method === 'card' ? closed.expectedCardCents : closed.expectedChequeCents;
  }
  const live = props.draft.expected;
  return method === 'cash' ? live.cashCents : method === 'card' ? live.cardCents : live.chequeCents;
}

function countedOf(props: DayCloseViewProps, method: CloseMethod): number {
  const closed = props.draft.closed;
  if (closed) {
    return method === 'cash' ? closed.countedCashCents : method === 'card' ? closed.countedCardCents : closed.countedChequeCents;
  }
  return toCents(props.counted[method] ?? 0);
}

export function DayCloseDesktop(props: DayCloseViewProps) {
  const { draft, busy, error } = props;
  const closed = draft.closed;
  const stopCount = draft.delivered.length + draft.pending.length + draft.returned.length;
  // Kapanışın öznesi SEFER (18.08): künye başlıkta okunur — rota adı + SF kodu. Sefer yoksa
  // sayılacak bir şey de yok; boş hâl aşağıda.
  const runLabel = draft.run ? `${draft.run.zoneName ?? 'Rota'} · ${draft.run.referenceNo}` : null;

  const rows = CLOSE_METHODS.map((method) => {
    const expected = expectedOf(props, method);
    const counted = countedOf(props, method);
    return { method, expected, counted, difference: counted - expected };
  });

  const anyExpected = rows.some((row) => row.expected > 0);
  const totalDifference = rows.reduce((sum, row) => sum + row.difference, 0);
  // Fark varsa açıklama ZORUNLU. Tasarım §3'ün "fark gizlenmez, AÇIKLANIR" cümlesinin karşılığı bu:
  // açıklamasız kaydedilen bir fark, ertesi gün kimsenin hatırlamayacağı bir sayıdır.
  const needsNote = totalDifference !== 0 && props.note.trim().length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Sefer kapanışı"
        subtitle={runLabel ? `${runLabel} · ${draft.date} · kasa mutabakatı` : `${draft.date} · kasa mutabakatı`}
        status={closed ? <Badge tone="olive">Kapandı</Badge> : <Badge tone="neutral">Açık</Badge>}
      >
        <Link
          href="/operations/deliveries"
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-ops-sm font-semibold text-ops-strong transition-colors hover:border-ops-olive"
        >
          ← Güne dön
        </Link>
      </PageHeader>

      {/* Sefersiz gün ve duraksız sefer KAPATILMAZ (tasarım §4 boş durum): kapanış bir mutabakattır,
          karşılığı olmayan bir mutabakat kaydı "sayıldı" der ve sayılacak bir şey yoktur. Düğmeyi
          açık bırakmak, olmayan bir işi yapılmış göstermenin en sessiz yoluydu. */}
      {!draft.run || (stopCount === 0 && !closed) ? (
        <EmptyState title="Kapatılacak sefer yok" description={CLOSE_NOTES.emptyDay} />
      ) : (
      <div className="mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col overflow-y-auto">
        {/* Günün dökümü — kapanış "bugün ne oldu"nun tek resmidir (tasarım §2). */}
        <div className="flex items-stretch gap-4 border-b border-ops-line-soft bg-ops-surface-sunken px-4 py-3">
          <Tally label="Teslim" value={draft.delivered.length} />
          <Tally label="Bekleyen" value={draft.pending.length} />
          <Tally label="İade" value={draft.returned.length} />
        </div>

        {draft.pending.length > 0 && !closed ? (
          <p className="border-b border-ops-amber-line bg-ops-amber-bg px-4 py-2.5 font-ops-body text-ops-xs text-ops-amber-dark">
            {CLOSE_NOTES.pending(draft.pending.length)}
          </p>
        ) : null}

        {draft.returned.length > 0 ? <StopList title="Depoya getirilen mal" stops={draft.returned} note={CLOSE_NOTES.returned} /> : null}

        {/* Para adımı: beklenen hiç yoksa doğal olarak boş geçer (tasarım §4) — üç sıfır kutusu
            göstermek, olmayan bir işi varmış gibi okutur. */}
        {anyExpected || closed ? (
          <section className="border-b border-ops-line-soft px-4 py-3">
            <div className="mb-2 grid grid-cols-[1fr_auto_auto] items-baseline gap-3">
              <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
                Mutabakat
              </span>
              <span className="w-[92px] text-right font-ops-display text-ops-micro uppercase tracking-[0.06em] text-ops-muted">
                Beklenen
              </span>
              <span className="w-[110px] text-right font-ops-display text-ops-micro uppercase tracking-[0.06em] text-ops-muted">
                Sayılan
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.method} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-ops-body text-ops-base text-ops-ink">{METHOD_LABEL[row.method]}</span>
                    {row.difference !== 0 ? (
                      <span className={`font-ops-mono text-ops-xs ${row.difference < 0 ? 'text-ops-red' : 'text-ops-amber-dark'}`}>
                        {CLOSE_NOTES.difference(row.difference)}
                      </span>
                    ) : null}
                  </div>
                  <span className="w-[92px] text-right font-ops-mono text-ops-sm text-ops-muted">{money(row.expected)}</span>
                  {closed ? (
                    <span className="w-[110px] text-right font-ops-mono text-ops-base text-ops-ink">{money(row.counted)}</span>
                  ) : (
                    <MoneyInput
                      inputSize="sm"
                      ariaLabel={`${METHOD_LABEL[row.method]} sayılan tutar`}
                      value={props.counted[row.method]}
                      onChange={(value) => props.onCounted(row.method, value)}
                      disabled={busy}
                      fullWidth={false}
                      className="w-[110px] text-right"
                    />
                  )}
                </li>
              ))}
            </ul>

            <p
              className={`mt-2.5 font-ops-body text-ops-sm ${totalDifference === 0 ? 'text-ops-olive-dark' : 'text-ops-amber-dark'}`}
            >
              {totalDifference === 0 ? CLOSE_NOTES.reconciled : CLOSE_NOTES.totalDifference(totalDifference)}
            </p>
          </section>
        ) : (
          <p className="border-b border-ops-line-soft px-4 py-3 font-ops-body text-ops-sm text-ops-faint">
            {CLOSE_NOTES.noCollection}
          </p>
        )}

        {closed ? (
          <div className="flex flex-col gap-1 px-4 py-4">
            <p className="font-ops-body text-ops-sm text-ops-muted">{CLOSE_NOTES.closedAt(closed.closedAt)}</p>
            {closed.note ? <p className="font-ops-body text-ops-sm text-ops-ink">“{closed.note}”</p> : null}
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 px-4 py-3">
              <span className="font-ops-body text-ops-sm text-ops-muted">
                Açıklama {totalDifference !== 0 ? <span className="text-ops-amber-dark">(fark var — gerekli)</span> : '(isteğe bağlı)'}
              </span>
              <Input
                value={props.note}
                onChange={(event) => props.onNote(event.target.value)}
                placeholder="ör. müşteri bozuk para veremedi, 2 € eksik"
                maxLength={300}
                disabled={busy}
              />
            </label>

            {error ? (
              <p className="mx-4 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
                {error}
              </p>
            ) : null}

            <div className="mt-auto border-t border-ops-line px-4 py-3">
              <Button variant="primary" fullWidth onClick={props.onClose} disabled={busy || needsNote}>
                Seferi kapat
              </Button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{label}</span>
      <span className="font-ops-mono text-ops-title tracking-tight text-ops-ink">{num(value)}</span>
    </div>
  );
}

/**
 * Getirilen mal listesi. **Fiziksel teslim işareti burada YOK** ve bu bilinçli: malın akıbeti
 * (rafa dönüş / imha) depocunun kararıdır (DOMAIN §8) ve depo iade girişinde sonuçlanır. Buraya bir
 * "teslim ettim" düğmesi koymak, hiçbir yere yazılmayan bir onay olurdu.
 */
function StopList({ title, stops, note }: { title: string; stops: CourierStop[]; note: string }) {
  return (
    <section className="border-b border-ops-line-soft px-4 py-3">
      <h2 className="mb-1.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{title}</h2>
      <ul className="flex flex-col gap-1">
        {stops.map((stop) => (
          <li key={stop.orderId} className="font-ops-body text-ops-sm text-ops-ink">
            {stop.customerName}
            <span className="ml-1.5 text-ops-faint">· {stop.itemCount} kalem</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 font-ops-body text-ops-xs text-ops-faint">{note}</p>
    </section>
  );
}
