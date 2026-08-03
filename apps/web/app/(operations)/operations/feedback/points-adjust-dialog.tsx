'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import type { PointsEntry } from '@lezzet/types';
import { shortDateTime } from '@/components/operation/ui/format';
import { adjustPointsAction, loadPointsHistoryAction } from './actions';
import { POINTS_REASON_LABELS } from './feedback-labels';

/**
 * ELLE PUAN DÜZELTME (17.4, çizimdeki modal) — jest ya da hata telafisi, **iz kaydıyla**.
 *
 * Üç alan: müşteri (sabit, listeden geldi) · değişim · sebep. Çizimde dördüncü bir kutu daha var
 * ("Yeni bakiye", salt okunur) ve o burada da duruyor: operatör "+50" yazarken sonucu görmeli —
 * eksi yazıp bakiyeyi sıfırın altına düşürmek isteyip istemediğine ancak sonucu görünce karar verir.
 *
 * **Sebep zorunlu ve kapı da bunu zorluyor** (`note_required`). Formda önden elemek bir nezaket
 * değil, aynı kuralın iki kez söylenmesi: action doğrudan da çağrılabilir ve o zaman kapı reddeder.
 * İkisi de gerekli — burada operatöre "neden gönderilmedi" açıklanır, orada veri korunur.
 *
 * Müşteri SEÇİCİSİ yok (çizimde var): pencere puan tablosunun bir satırından açılıyor, yani müşteri
 * zaten seçilmiş. Seçici koymak aynı kararı iki kez sordurur ve yanlış müşteriye puan yazma
 * ihtimalini açardı.
 */

interface PointsAdjustDialogProps {
  customerId: string;
  customerName: string;
  currentBalance: number;
  onClose: () => void;
}

export function PointsAdjustDialog({ customerId, customerName, currentBalance, onClose }: PointsAdjustDialogProps) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * GEÇMİŞ ÖNCE GELİR — pencere açılır açılmaz okunur.
   *
   * Karar sırası bunu gerektiriyor: operatör neyin üstüne yazdığını görmeden düzeltme yapmamalı.
   * Tablodaki üç kolon (bakiye · çevrilen · son) defterin ÖZETİ; "nereden geldi, ne zaman çevirdi"
   * sorusunun cevabı yalnız burada. Bu kapı bugüne dek operasyon yüzeyinde hiç çağrılmamıştı —
   * müşteri kendi hesabında geçmişini görüyordu, operatör göremiyordu.
   */
  const [history, setHistory] = useState<PointsEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPointsHistoryAction(customerId).then((result) => {
      if (!alive) return;
      if (result.error || !result.data) setHistoryError(result.error ?? 'Geçmiş okunamadı.');
      else setHistory(result.data);
    });
    // Pencere kapanırken gelen cevap durumu yazmasın: React 18'de `setState` sökülmüş bileşende
    // sessizce yutulur ama niyet açık dursun.
    return () => {
      alive = false;
    };
  }, [customerId]);

  // Boş ya da bozuk girdi 0 sayılır: "yeni bakiye" o an bakiyenin kendisidir, NaN değil.
  const parsed = Number.parseInt(delta, 10);
  const change = Number.isFinite(parsed) ? parsed : 0;
  const canSubmit = change !== 0 && reason.trim().length > 0 && !pending;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await adjustPointsAction({ customerId, delta: change, reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Puan geçmişi ve düzeltme"
      subtitle={`${customerName} · bugünkü bakiye ${currentBalance}`}
      maxWidth={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            İptal
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {pending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {error ? (
          <span className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red-dark">
            {error}
          </span>
        ) : null}

        {/* Defterin kendisi — en yeni üstte (kapının sırası). Boş geçmiş de bir bilgi: "bu müşteri
            hiç puan hareketi yapmamış" ile "okuyamadım" ayrı şeyler ve ayrı yazılıyor. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-muted">Puan geçmişi</span>
          {historyError ? (
            <span className="font-ops-body text-ops-xs text-ops-amber-dark">{historyError}</span>
          ) : history === null ? (
            <span className="font-ops-body text-ops-xs text-ops-muted">Okunuyor…</span>
          ) : history.length === 0 ? (
            <span className="font-ops-body text-ops-xs text-ops-muted">Bu müşterinin hiç puan hareketi yok.</span>
          ) : (
            <div className="flex max-h-[168px] flex-col overflow-y-auto rounded-ops-card border border-ops-line">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3 py-2 last:border-b-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate font-ops-body text-ops-xs font-medium text-ops-strong">
                      {POINTS_REASON_LABELS[entry.reason]}
                    </span>
                    {/* Elle düzeltmenin GEREKÇESİ burada görünür — defterin var oluş sebebi o. */}
                    {entry.note ? <span className="truncate font-ops-body text-ops-micro text-ops-muted">{entry.note}</span> : null}
                  </div>
                  <span className="flex-none font-ops-mono text-ops-micro text-ops-muted">{shortDateTime(entry.createdAt)}</span>
                  <span className={`w-[52px] flex-none text-right font-ops-mono text-ops-xs font-semibold ${entry.points > 0 ? 'text-ops-olive-dark' : 'text-ops-red-dark'}`}>
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <FieldShell label="Değişim (± puan)" required className="flex-1">
            <Input
              value={delta}
              mono
              inputMode="numeric"
              placeholder="+50"
              onChange={(e) => setDelta(e.target.value)}
              aria-label="Değişim"
            />
          </FieldShell>
          <FieldShell label="Yeni bakiye" className="flex-1">
            {/* Salt okunur ve öyle GÖRÜNÜYOR (`disabled`): tıklanabilir bir kutu, yazılabilir sanılır. */}
            <Input value={String(currentBalance + change)} mono disabled readOnly aria-label="Yeni bakiye" />
          </FieldShell>
        </div>

        <FieldShell label="Sebep (iz kaydına yazılır)" required>
          <Input
            value={reason}
            placeholder="Gecikme telafisi — jest"
            onChange={(e) => setReason(e.target.value)}
            aria-label="Sebep"
          />
        </FieldShell>

        <span className="font-ops-body text-ops-xs text-ops-muted">
          Bu düzeltme deftere ayrı bir hareket olarak yazılır; bakiye hareketlerden türer, üzerine yazılmaz.
        </span>
      </div>
    </Dialog>
  );
}
