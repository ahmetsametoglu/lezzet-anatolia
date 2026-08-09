'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { QueueTab } from '@/lib/assistant/assistant-types';
import { applyProposalAction, rejectProposalAction } from './actions';
import { notifyCountOf } from './assistant-labels';
import { AssistantDecisionDialog } from './assistant-decision-dialog';
import { AssistantDesktop } from './assistant.desktop';
import { assistantUrl, type AssistantUrlState } from './assistant-url';
import type { AssistantData, DecisionKind } from './assistant-types';

// Asistan onay kuyruğu client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız.
//
// SEKME ve SEÇİM gerçek gezinmedir (`?tab=…&p=…`): kart sunucuda okunuyor ve bir önerinin bağlantısı
// paylaşılabilir olmalı ("şuna bir bak, onaylıyor muyuz?").

interface AssistantClientProps {
  data: AssistantData;
  urlState: AssistantUrlState;
}

export function AssistantClient({ data, urlState }: AssistantClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [busy, setBusy] = useState(false);
  /** Karardan SONRA söylenecek söz — hata da olabilir, bilgi de ("başka yerde karar verilmiş"). */
  const [notice, setNotice] = useState<string | null>(null);

  const go = (patch: Partial<AssistantUrlState>) => {
    startNav(() => router.replace(assistantUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  const selected = data.selected;

  /**
   * Kararın yürütülmesi.
   *
   * **Karar verilen öneri bu sekmeden DÜŞER** (uygulandı/reddedildi/uygulanamadı hepsi karar
   * geçmişine gider), yani seçim de düşer. Bu yüzden sonuç cümlesi karttan bağımsız tutuluyor:
   * kartta gösterilseydi, kart o an başka bir öneriye geçmiş olacağı için cümle YANLIŞ satırın
   * altında görünürdü.
   *
   * "Sonra bak" sunucuya hiç gitmez — öneri zaten kuyrukta kalıyor; pencerenin işi o kararın
   * sonucunu söylemek, bir şey yapmak değil.
   */
  const runDecision = async (kind: DecisionKind, note?: string) => {
    if (!selected || busy) return;
    if (kind === 'later') {
      setDecision(null);
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const result =
        kind === 'apply' ? await applyProposalAction(selected.id) : await rejectProposalAction(selected.id, note);

      if (result.error !== null || result.data === null) {
        setNotice(result.error ?? 'Karar yazılamadı.');
        return;
      }

      const outcome = result.data;
      if (outcome.status === 'gone') {
        // Hata DEĞİL bilgi: başka bir sekmede ya da başka bir personelde karar verilmiş.
        setNotice('Bu öneriye bu arada başka bir yerde karar verilmiş — kuyruk tazelendi.');
      } else if (outcome.status === 'failed') {
        // Motorun reddi patronun kararı değildir; cümlesi de öyle kurulur.
        setNotice(`Motor uygulamayı reddetti: ${outcome.error} — öneri "uygulanamadı" olarak geçmişe düştü.`);
      } else if (outcome.status === 'applied') {
        setNotice('Uygulandı. Öneri karar geçmişine düştü; oluşan kayıtların kimlikleri teknik dökümde.');
      } else {
        setNotice('Reddedildi. Öneri silinmedi, ret notuyla karar geçmişine düştü.');
      }

      setDecision(null);
      // Action zaten `revalidatePath` çağırdı; `refresh` o taze RSC çıktısını ekrana getirir.
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AssistantDesktop
        data={data}
        urlState={urlState}
        navPending={navPending}
        busy={busy}
        error={notice}
        // Sekme değişince SEÇİM düşer: başka sekmede olmayan bir önerinin kimliği adreste kalırsa
        // kart "bulunamadı" der ve operatör sekmeyi değiştirdiğini değil bir şeyin bozulduğunu sanır.
        onTab={(tab: QueueTab) => {
          setNotice(null);
          go({ tab, p: '' });
        }}
        onSelect={(p: string) => {
          setNotice(null);
          go({ p });
        }}
        onDecision={(kind) => {
          setNotice(null);
          setDecision(kind);
        }}
      />

      {decision && selected ? (
        <AssistantDecisionDialog
          kind={decision}
          summary={selected.summary}
          notifyCount={notifyCountOf(selected)}
          busy={busy}
          error={busy ? null : notice}
          onClose={() => setDecision(null)}
          onConfirm={(note) => void runDecision(decision, note)}
        />
      ) : null}
    </>
  );
}
