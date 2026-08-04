'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Dialog } from '@/components/operation/ui/dialog';
import { amount, dayMonth, percent } from '@/components/operation/ui/format';
import type { MatchRowView } from './finance-types';

// **Aday seçimi** — kuyruğun "Seç" (çoklu aday) ve "Düzelt" (öneri yanlış) yolları.
//
// İkisi TEK pencere ve bu bilinçli: sordukları soru aynı — *"bu banka satırı hangi siparişin
// parası"*. Ayrı pencereler yazsaydık aday listesi, puan gösterimi ve onay çağrısı iki kez
// yazılırdı ve bir gün ayrışırlardı.
//
// **"Düzelt"in olmaması gerçek bir açıktı:** güçlü ama YANLIŞ bir öneri yalnız onaylanabiliyor ya
// da atlanabiliyordu. Atlamak satırı kuyruktan düşürüyor, yani yanlış öneri yüzünden doğru
// eşleşme de kaybediliyordu — çizimde o düğme boşuna durmuyormuş.

interface MatchDialogProps {
  row: MatchRowView;
  busy: boolean;
  onPick: (orderId: string) => void;
  onClose: () => void;
}

export function MatchDialog({ row, busy, onPick, onClose }: MatchDialogProps) {
  const [selected, setSelected] = useState<string | null>(row.candidates[0]?.orderId ?? null);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Bu satır hangi siparişin parası?"
      subtitle={`${row.bankLine} · ${amount(row.signedAmountCents)} · ${dayMonth(row.valueDate)}`}
      maxWidth={560}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-ops-btn border border-ops-line px-3.5 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => selected && onPick(selected)}
            className="cursor-pointer rounded-ops-btn bg-ops-olive px-3.5 py-2 font-ops-display text-ops-xs font-semibold text-ops-on-olive transition-colors hover:bg-ops-olive-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Bağlanıyor…' : 'Seçileni bağla'}
          </button>
        </div>
      }
    >
      {row.candidates.length === 0 ? (
        // Motorun eşiği altında kalan adaylar hiç gelmiyor (`MATCH_THRESHOLD`) — zayıf öneri
        // operatörü yanlış onaya sürükler. Burada gösterecek bir şey yoksa doğrusu susmaktır.
        <p className="font-ops-body text-ops-sm text-ops-muted">
          Bu satıra uyan sipariş bulunamadı. Referans numarasını bilerek bağlamak için sipariş
          araması gerekiyor — o kapı henüz yok (<span className="font-ops-mono">BEKLEYEN(12.8)</span>). Şimdilik satırı
          gider olarak sınıflayabilir ya da kuyruktan düşürebilirsiniz.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {row.candidates.map((candidate) => {
            const active = selected === candidate.orderId;
            return (
              <li key={candidate.orderId}>
                <button
                  type="button"
                  onClick={() => setSelected(candidate.orderId)}
                  aria-pressed={active}
                  className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-ops-card border p-3.5 text-left transition-colors ${
                    active ? 'border-ops-olive bg-ops-olive-bg' : 'border-ops-line hover:border-ops-line-strong'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-ops-mono text-ops-sm text-ops-ink">{candidate.referenceNo}</span>
                    {/* Puan bir KARAR değil, sıralama: motorun künyesi bunu yazıyor ("yüksek olması
                        onayı kaldırmaz, yalnız sıraya koyar"). Ekran da öyle sunuyor. */}
                    <span className="font-ops-mono text-ops-micro text-ops-faint">uyum {percent(candidate.score * 100)}</span>
                  </div>
                  {candidate.reasons.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.reasons.map((reason) => (
                        <Badge key={reason} tone="neutral" outline>
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
