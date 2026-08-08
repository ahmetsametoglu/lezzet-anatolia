'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { num } from '@/components/operation/ui/format';
import { RECEIVING_NOTES } from './receiving-labels';
import type { IntakeRow } from './receiving-types';

/**
 * **Kabulü bitir** (10.4) — fark özeti + depo seçimi.
 * `design/project/Operasyon - Depo Stok Giris.dc.html`, kare 3.
 *
 * ── DEPO: KİMLİKTEN YA DA AÇIK SEÇİMDEN, VARSAYILANDAN ASLA ─────────────────
 * Tasarım bunu ayrıca vurguluyor: *"Ön seçim yok — bağlam 'Tüm depolar' olsa bile form varsayılan
 * üretmez."* Depocu açtığında satır hiç yok (deposu kimlik bilgisidir), yönetici açtığında seçim
 * zorunlu ve boş başlar. Varsayılan bir depo, malın yanlış kapıdan girmesinin en sessiz yoludur —
 * ve stok yanlış depoda görünen sistem, olmayan malı satar (`DOMAIN §17`).
 *
 * ── FARK HATA DEĞİLDİR ──────────────────────────────────────────────────────
 * Özet farkları sayar ama kabulü engellemez: tedarikçi eksik ya da fazla göndermiş olabilir ve
 * kayıt yalnızca gerçeği yazar. Eksik kalem "gelmedi" olarak işaretlenmişse PO açık kalır.
 */
interface FinishDialogProps {
  rows: IntakeRow[];
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseOptions: { id: string; name: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (warehouseId: string) => void;
}

export function FinishDialog({ rows, warehouseId, warehouseName, warehouseOptions, busy, error, onClose, onConfirm }: FinishDialogProps) {
  // Depocuda kimlikten gelen depo; yöneticide BOŞ başlar ve seçim zorunludur.
  const [chosen, setChosen] = useState<string>(warehouseId ?? '');

  const girilen = rows.filter((row) => !row.isMissing && row.receivedQty !== null && row.receivedQty > 0);
  const farklar = rows.filter((row) => {
    if (row.isMissing) return true;
    if (row.receivedQty === null || row.expectedQty === null) return false;
    return row.receivedQty !== row.expectedQty;
  });
  // Son tarih ZORUNLU: partinin kimliği odur ve hazırlık önerisi ona göre sıralanır. Tarihsiz
  // parti, "önce tarihi yakın olan" kuralını sessizce bozardı.
  const tarihsiz = girilen.filter((row) => !row.expiryDate);

  const engel = !chosen
    ? 'Kabul edilecek depoyu seçin.'
    : tarihsiz.length > 0
      ? `${num(tarihsiz.length)} kalemde son tarih girilmemiş.`
      : girilen.length === 0
        ? 'Girilmiş kalem yok.'
        : null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={560}
      title="Kabulü bitir"
      subtitle={`${num(girilen.length)} kalem girildi · ${num(farklar.length)} kalemde fark`}
      footer={
        <>
          {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          {engel && !error ? <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">{engel}</span> : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant="primary" disabled={busy || Boolean(engel)} onClick={() => onConfirm(chosen)}>
            {busy ? 'Kaydediliyor…' : 'Kabulü tamamla'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {warehouseId ? (
          // Depocu: seçim satırı DÜŞER, deposu kimlik bilgisi olarak yazılır (tasarımın kuralı).
          <p className="rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3 py-2 font-ops-body text-ops-xs text-ops-body">
            Kabul edilen depo: <strong className="text-ops-ink">{warehouseName}</strong> — kimlik bilgisidir, seçim değil.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="font-ops-body text-ops-xs text-ops-body">{RECEIVING_NOTES.warehouseChoice}</span>
            <div className="flex flex-wrap gap-2">
              {warehouseOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setChosen(option.id)}
                  disabled={busy}
                  className={`cursor-pointer rounded-ops-btn border px-3 py-1.5 font-ops-body text-ops-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    chosen === option.id
                      ? 'border-ops-olive bg-ops-olive-bg font-semibold text-ops-olive-dark'
                      : 'border-ops-line-strong text-ops-strong hover:border-ops-olive'
                  }`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {farklar.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">
              Fark özeti — kabul yine tamamlanır
            </span>
            {farklar.map((row) => {
              const gelen = row.isMissing ? 0 : (row.receivedQty ?? 0);
              const fark = row.expectedQty === null ? null : gelen - row.expectedQty;
              return (
                <div key={row.variantId} className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-ink">{row.title}</span>
                  <span className="font-ops-mono text-ops-xs text-ops-muted">
                    {num(gelen)} / {row.expectedQty === null ? '—' : num(row.expectedQty)}
                  </span>
                  {fark !== null ? <Badge tone="amber">{fark > 0 ? `+${fark}` : `${fark}`}</Badge> : null}
                  {row.isMissing ? <Badge tone="red">gelmedi</Badge> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">{RECEIVING_NOTES.afterAccept}</p>
      </div>
    </Dialog>
  );
}
