'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ShortfallSuggestion } from '@lezzet/domain-core';
import { confirmPreparationAction } from './preparation-actions';
import { PreparationDesktop } from './preparation.desktop';
import { ProblemDialog } from './problem-dialog';
import { ShortfallDialog } from './shortfall-dialog';
import type { PreparationData, PreparationLineView, PreparationOrderView } from './preparation-types';

/**
 * Hazırlık masasının istemci kökü (10.1–10.3).
 *
 * ── TEK KALEM, TEK YAZIM ────────────────────────────────────────────────────
 * Onay kalem başına gidiyor: depocu bir kalemi toplayınca o kalem yazılır. Toplu onay
 * (*"hepsini hazırladım"*) bilerek yok — bir siparişin altı kalemini tek tuşla onaylamak, fiilen
 * sayılmamış partileri sayılmış gibi kaydetmenin en kolay yoludur.
 *
 * ── EKSİK KARARI ONAYDAN SONRA ──────────────────────────────────────────────
 * Motorun tavsiyesi ancak yazımdan sonra doğuyor (kapı `shortfalls` döndürüyor) ve bu doğru sıra:
 * tavsiye, fiilen kaydedilmiş eksiğe göre verilmeli — kaydedilmeden verilen tavsiye, henüz
 * olmamış bir duruma dair olurdu.
 */
export function PreparationClient({ data }: { data: PreparationData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(data.orders[0]?.orderId ?? null);
  const [problem, setProblem] = useState<{ order: PreparationOrderView; line: PreparationLineView } | null>(null);
  const [shortfall, setShortfall] = useState<{ title: string; suggestion: ShortfallSuggestion } | null>(null);

  /**
   * Kalemi yazar. `batches` verilmezse SİSTEM ÖNERİSİ gider — "Hazırlandı" tuşunun anlamı tam
   * olarak budur: öneriye dokunmadım, olduğu gibi topladım.
   */
  const confirm = (order: PreparationOrderView, line: PreparationLineView, batches?: { stockId: string; qty: number }[]) => {
    const picks = [
      {
        orderItemId: line.itemId,
        batches: batches ?? line.suggestion.map((batch) => ({ stockId: batch.stockId, qty: batch.qty })),
      },
    ];

    setError(null);
    startTransition(async () => {
      const { data: result, error: failed } = await confirmPreparationAction(order.orderId, picks);
      if (failed || !result) {
        setError(failed ?? 'Kalem kaydedilemedi.');
        return;
      }

      setProblem(null);
      // Eksik varsa kararı SOR — sessizce geçmek, depocunun vermesi gereken kararı sistemin
      // yerine vermesi olurdu. Kapı tavsiyeyi dönüyor, karar burada soruluyor.
      const eksik = result.shortfalls.find((row) => row.itemId === line.itemId);
      if (eksik) setShortfall({ title: line.title, suggestion: eksik.suggestion as ShortfallSuggestion });

      router.refresh();
    });
  };

  return (
    <>
      <PreparationDesktop
        data={data}
        selectedId={selectedId}
        onSelect={setSelectedId}
        busy={busy}
        error={error}
        onConfirmLine={(order, line) => confirm(order, line)}
        onProblem={(order, line) => {
          setError(null);
          setProblem({ order, line });
        }}
      />

      {problem ? (
        <ProblemDialog
          key={problem.line.itemId}
          order={problem.order}
          line={problem.line}
          busy={busy}
          error={error}
          onClose={() => setProblem(null)}
          onConfirm={(batches) => confirm(problem.order, problem.line, batches)}
        />
      ) : null}

      {shortfall ? (
        <ShortfallDialog
          title={shortfall.title}
          suggestion={shortfall.suggestion}
          busy={busy}
          onClose={() => setShortfall(null)}
          // "Kalanı gönder" AYRI BİR YAZIM DEĞİL: eksik zaten kaydedildi (kalem toplanan adetle
          // yazıldı) ve siparişin geri kalanı normal akışında sürüyor. Burada yapılacak tek şey
          // kararı kapatmak — ikinci bir yazım aynı eksiği iki kez kaydetmek olurdu.
          onShipRest={() => setShortfall(null)}
        />
      ) : null}
    </>
  );
}
