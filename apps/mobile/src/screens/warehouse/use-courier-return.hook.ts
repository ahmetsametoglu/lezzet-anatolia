import { useCallback, useState } from 'react';
import type { ReturnDisposition } from '@lezzet/types';

import { submitWarehouseReturn } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import type { CourierReturnDrop } from './courier-return-fixture';
import { trackWarehouse } from './warehouse-status';

/*
  D6 · KURYE DÖNÜŞÜ KABULÜ (v2:483-510). `/warehouse/returns/:orderId`.

  ── MİKTAR HEDEF DEĞERDİR, FARK DEĞİL ───────────────────────────────────────
  v2 birebir: *"Miktar hedef değer olarak girilir; fark sistemde hesaplanır."* Sözleşme bunu
  taşıyor (`FulfillmentAdjustment.fulfilledQty` = kalemin KALAN karşılanan adedi) ve bu ekran ondan
  çıkarma YAPMAZ — yapsaydı aynı hesap iki yerde olurdu ve ikisi bir gün ayrışırdı.

  Tasarımda adet alanı YOK ve bu bilinçli: dönen mal KOLİNİN kendisidir, satırın tamamı geri gelir.
  O yüzden hedef değer akıbetten TÜREr:
  · `restock` / `discard` → mal geri geldi, karşılanan adet **0**,
  · `goodwill` → mal müşteride KALDI, adet **değişmez** (kapı da böyle diyor: jestte miktar aynı).

  ── "STOĞA DÖN"DE NOT ZORUNLU ───────────────────────────────────────────────
  Soğuk zincir beyanıdır ve kuralı veritabanı zorlar; ekran yalnız kapıyı boşuna zorlamamak için
  CTA'yı kapalı tutar. İmha ve jestte not serbesttir.

  ── DÖKÜM FIXTURE, KAYIT GERÇEK ─────────────────────────────────────────────
  "Bugün ne geri geldi" sorusunun kapısı yok; gerekçe `courier-return-fixture.ts` künyesinde.
  Fixture'ın kimliği gerçek olmadığı için kapı `not_found` döner ve ekran o reddi AYNEN gösterir.
*/

const t = warehouseCopy;

/** Kapının dört cevabı — sözleşmeden TÜRER, elle yazılmaz. */
type ReturnOutcome = Extract<Awaited<ReturnType<typeof submitWarehouseReturn>>, { error: null }>['data'];

interface ReturnNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

interface UseCourierReturnResult {
  dispositionOf: (orderItemId: string) => ReturnDisposition | null;
  pick: (orderItemId: string, disposition: ReturnDisposition) => void;
  noteOf: (orderItemId: string) => string;
  setNote: (orderItemId: string, note: string) => void;
  /** Her kalemde akıbet var mı ve "stoğa dön"lerin notu yazılmış mı — CTA'nın kapısı. */
  canSubmit: boolean;
  sending: boolean;
  notice: ReturnNotice | null;
  submit: () => void;
}

/**
 * Akıbet → HEDEF adet. Jestte mal müşteride kaldığı için karşılanan adet değişmez; iade ve imhada
 * mal geri geldiği için sıfırlanır. Tek satır ama kaydın anlamı bu satırda — kendi testi var.
 */
export function targetQtyOf(disposition: ReturnDisposition, deliveredQty: number): number {
  return disposition === 'goodwill' ? deliveredQty : 0;
}

export function useCourierReturn(drop: CourierReturnDrop): UseCourierReturnResult {
  const [dispositions, setDispositions] = useState<Record<string, ReturnDisposition>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<ReturnNotice>();

  const dispositionOf = useCallback(
    (orderItemId: string): ReturnDisposition | null => dispositions[orderItemId] ?? null,
    [dispositions],
  );

  const pick = useCallback((orderItemId: string, disposition: ReturnDisposition) => {
    setDispositions((current) => ({ ...current, [orderItemId]: disposition }));
    setNotice(null);
  }, []);

  const noteOf = useCallback((orderItemId: string): string => notes[orderItemId] ?? '', [notes]);

  const setNote = useCallback((orderItemId: string, note: string) => {
    setNotes((current) => ({ ...current, [orderItemId]: note }));
  }, []);

  const canSubmit = drop.lines.every((line) => {
    const disposition = dispositions[line.orderItemId];
    if (disposition === undefined) return false;
    return disposition !== 'restock' || (notes[line.orderItemId]?.trim().length ?? 0) > 0;
  });

  const submit = useCallback(() => {
    if (sending || !canSubmit) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const adjustments = drop.lines.flatMap((line) => {
        const disposition = dispositions[line.orderItemId];
        if (disposition === undefined) return [];
        const note = notes[line.orderItemId]?.trim() ?? '';
        return [
          {
            orderItemId: line.orderItemId,
            fulfilledQty: targetQtyOf(disposition, line.qty),
            returnDisposition: disposition,
            note: note.length === 0 ? null : note,
          },
        ];
      });

      const result = await trackWarehouse(submitWarehouseReturn(drop.orderId, { adjustments }));
      setSending(false);

      if (result.error !== null) {
        setNotice({
          tone: 'error',
          text:
            result.error === 'network_error'
              ? t.common.networkError
              : fillCopy(t.common.serverError, { error: result.error }),
        });
        return;
      }

      setNotice(noticeOf(result.data));
    })();
  }, [canSubmit, dispositions, drop, notes, sending]);

  return { dispositionOf, pick, noteOf, setNote, canSubmit, sending, notice, submit };
}

/**
 * Kapının cevabı → ekrandaki cümle.
 *
 * PARA ALANLARI GÖSTERİLMEZ (`refundedAmountCents`, `amountToCollectCents`): depo ekranı tutar
 * görmez — sözleşmenin kendi hükmü, o sayılar çağıranın (yönetim akışı, defter) okuduğu şey.
 * `refundBlocked` ise GÖSTERİLİR ve para değil bir DURUM bildirir: borç yazılamadı, sebebiyle.
 * Yutulsaydı iade yapılmış gibi görünürdü.
 */
function noticeOf(outcome: ReturnOutcome): ReturnNotice {
  if (outcome.status === 'stale') {
    return { tone: 'error', text: fillCopy(t.return.result.stale, { status: outcome.currentStatus }) };
  }
  if (outcome.status === 'forbidden') return { tone: 'error', text: t.common.outOfScope };
  if (outcome.status === 'not_found') return { tone: 'error', text: t.common.notFound };

  const head = fillCopy(t.return.result.ok, {
    restocked: String(outcome.restockedQty),
    discarded: String(outcome.discardedQty),
    released: String(outcome.releasedQty),
  });
  const blocked = outcome.refundBlocked === undefined ? null : t.return.refundBlocked[outcome.refundBlocked];

  return blocked === null ? { tone: 'ok', text: head } : { tone: 'warn', text: `${head} ${blocked}` };
}
