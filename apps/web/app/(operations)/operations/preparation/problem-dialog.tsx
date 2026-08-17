'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { Badge } from '@/components/operation/ui/badge';
import { num } from '@/components/operation/ui/format';
import { PREP_NOTES } from './preparation-labels';
import type { PreparationLineView, PreparationOrderView } from './preparation-types';

/**
 * **"Sorun" penceresi** (10.2 + 10.3) — öneriden sapma ve eksik işaretleme.
 * `design/project/Operasyon - Depo Hazirlik.dc.html`, kare 2.
 *
 * Tasarımın üç sorunu tek pencerede toplanıyor çünkü üçü de **aynı iki sayıya** dokunuyor: hangi
 * partiden, kaç paket. *"Başka partiden aldım"* bir satırın adedini sıfırlayıp ötekini artırmaktır,
 * *"bu partide eksik var"* adedi azaltmaktır, *"kalem eksik kalacak"* toplamın istenenin altında
 * kalmasıdır. Üç ayrı pencere, aynı tablonun üç kopyası olurdu.
 *
 * ── KİLİTLİ KALEMDE PARTİ DEĞİŞMEZ ──────────────────────────────────────────
 * Teklif kalemi belirli bir partiye kilitli; tasarımın kuralı *"parti değiştirme seçeneği o satırda
 * hiç sunulmaz"*. Adet yine düzeltilebilir (o partide fiilen eksik olabilir) ama parti satırı
 * eklenemez. Kapı da aynı şeyi söylüyor (`pinned_violation`) — ekran onu önlüyor, tekrar etmiyor.
 */
interface ProblemDialogProps {
  order: PreparationOrderView;
  line: PreparationLineView;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (batches: { stockId: string; qty: number }[]) => void;
}

export function ProblemDialog({ order, line, busy, error, onClose, onConfirm }: ProblemDialogProps) {
  // Öneri BAŞLANGIÇ değeri: pencere "sistem böyle diyor, sen düzelt" diyor — boş açılsaydı
  // depocu sapmadığı hâlde her satırı elle yazmak zorunda kalırdı.
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(line.suggestion.map((batch) => [batch.stockId, batch.qty])),
  );

  const toplam = Object.values(qty).reduce((sum, value) => sum + value, 0);
  const eksik = Math.max(0, line.orderedQty - toplam);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={560}
      title={`Sorun — ${line.title}`}
      subtitle={`${order.referenceNo ?? '—'} · ${num(line.orderedQty)} paket isteniyor`}
      footer={
        <>
          {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant={eksik > 0 ? 'warning' : 'primary'}
            disabled={busy}
            onClick={() => onConfirm(Object.entries(qty).map(([stockId, value]) => ({ stockId, qty: value })).filter((b) => b.qty > 0))}
          >
            {busy ? 'Kaydediliyor…' : eksik > 0 ? `Eksik kaydet (${num(toplam)} paket)` : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {line.isPinned ? (
          <p className="rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-3 py-2 font-ops-body text-ops-xs leading-[1.5] text-ops-violet">
            Bu kalem indirimli tekliften geliyor ve {PREP_NOTES.pinned}. Adedi düzeltebilirsiniz, partiyi değiştiremezsiniz.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {line.suggestion.map((batch) => (
            <div key={batch.stockId} className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-ops-body text-ops-xs font-semibold text-ops-ink">
                  son tarih {new Date(batch.expiryDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {batch.areaName ? <Badge tone="slate">{batch.areaName}</Badge> : null}
              </span>
              <Input
                type="number"
                min={0}
                max={line.orderedQty}
                fullWidth={false}
                className="w-20 text-center"
                value={String(qty[batch.stockId] ?? 0)}
                onChange={(event) =>
                  setQty((current) => ({ ...current, [batch.stockId]: Math.max(0, Number(event.target.value) || 0) }))
                }
                disabled={busy}
              />
            </div>
          ))}
        </div>

        {/* ── Eksik kararı (10.3) — tasarımın ikinci karesi, aynı pencerede ikinci aşama ──
            Motorun tavsiyesi ONAYDAN SONRA geliyor (kapı `shortfalls` döndürüyor), o yüzden burada
            yalnız eksiğin KENDİSİ yazılıyor. Tavsiye onaydan sonra ayrı pencerede görünür. */}
        {eksik > 0 ? (
          <p className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5 font-ops-body text-ops-xs leading-[1.55] text-ops-amber-dark">
            {num(line.orderedQty)} istendi, {num(toplam)} var — <strong>{num(eksik)} paket eksik kalacak.</strong> Kaydettikten
            sonra ne yapılacağını soracağız. {PREP_NOTES.moneyHidden}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
