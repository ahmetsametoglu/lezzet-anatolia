'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { QueueTab } from '@/lib/assistant/assistant-types';
import { applyProposalAction, rejectProposalAction } from './actions';
import { appliedNoteOf, inlineBodyOf } from './assistant-body';
import { notifyCountOf } from './assistant-labels';
import { AssistantDecisionDialog } from './assistant-decision-dialog';
import { AssistantDesktop } from './assistant.desktop';
import { nextProposalId, visibleRowsOf } from './assistant-queue';
import { assistantUrl, type AssistantUrlState, type KindFilter } from './assistant-url';
import type { AssistantData, ConfirmKind, DecisionKind } from './assistant-types';

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
  const [decision, setDecision] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * İki ayrı söz, çünkü iki ayrı şeye bakıyorlar: `error` AÇIK öneriye ait (yazılamadı, diyalog
   * orada kalır), `outcome` ise kararı verilmiş ÖNCEKİ öneriye. Tek alanda taşınsalardı sıradaki
   * öneri, kendisiyle ilgisi olmayan bir hata cümlesiyle açılırdı.
   */
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const go = (patch: Partial<AssistantUrlState>) => {
    startNav(() => router.replace(assistantUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  const selected = data.selected;
  const visibleRows = visibleRowsOf(data.rows, urlState.kind);

  /** Elle gezinince iki söz de düşer: başka bir sekmeye geçen operatör eski cümleyi taşımamalı. */
  const clearNotices = () => {
    setError(null);
    setOutcome(null);
  };

  /**
   * Bu öneriyle iş bitti: sıradaki öneri AYNI pencerede açılır, sıradaki yoksa pencere kapanır.
   *
   * Kuyruk arka arkaya işlenen bir iştir; her karardan sonra ızgaraya dönüp yeni bir kart aramak
   * operatörü sırayı elle takip etmeye zorluyordu. Sıra ekranda görünen sıradır (`assistant-queue`).
   *
   * ── TAZELEME İLE GEZİNME AYNI GEÇİŞTE, VE BU SIRAYLA (kullanıcı ölçümü) ───
   * `router.refresh()` bir tur geçişin DIŞINDA çağrılıyordu ve ikisi yarışıyordu: tazeleme hâlâ
   * ESKİ adresi (eski `p`) yeniliyor, dönen çıktı da gezinmenin getirdiği yeni seçimi eziyordu —
   * ekranda sıradaki öneri hiç açılmıyordu. Aynı geçişe alınınca sıra belli oluyor (önce veriyi
   * tazele, sonra adrese git) ve `navPending` ikisini birden kapsıyor: pencere geçiş boyunca
   * meşgul kalabiliyor.
   */
  const goNext = ({ refresh }: { refresh: boolean }) => {
    setDecision(null);
    setError(null);
    const next = selected ? nextProposalId(visibleRows, selected.id) : '';
    startNav(() => {
      // Atlamada tazelemeye gerek yok: hiçbir kayıt değişmedi, yalnız sıra ilerliyor.
      if (refresh) router.refresh();
      router.replace(assistantUrl({ ...urlState, p: next }), { scroll: false });
    });
  };

  /**
   * Kararın yürütülmesi.
   *
   * **Karar verilen öneri bu sekmeden DÜŞER** (uygulandı/reddedildi/uygulanamadı hepsi karar
   * geçmişine gider), yani sonuç cümlesi kartın değil KARARIN yanında durur: kart o an sıradaki
   * öneriye geçmiş olur ve cümle yanlış satırın altında görünürdü.
   *
   * **"Sonra bak" sunucuya HİÇ gitmez** ve gitmemeli — öneri zaten kuyrukta kalıyor. Yaptığı tek
   * şey sırayı ilerletmek, yani "bunu şimdi karara bağlamıyorum" demenin ekrandaki karşılığı.
   */
  const runDecision = async (kind: DecisionKind, note?: string, draft?: unknown) => {
    if (!selected || busy) return;
    if (kind === 'later') {
      // Atlanan öneri bir sonuç doğurmadı; önceki kararın cümlesi de artık geride kaldı.
      setOutcome(null);
      goNext({ refresh: false });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      /**
       * ── KUYRUĞUN İÇİNDE VERİLEN KARAR (22.8) ──────────────────────────────
       * Gövdesi olan tipte yazan kapı `applyProposalAction` DEĞİL, varlığın kendi server action'ı:
       * operatörün formda değiştirdiği değer oraya gidiyor. Genel kapıdan geçseydi asistanın
       * ÖNERDİĞİ ham dilekçe uygulanırdı — yani az önce elle düzeltilen sayı sessizce yok sayılırdı.
       * Kuyruk satırını yine o eylem kapatıyor (`withProposal`), ikinci bir yazma yolu açılmıyor.
       */
      const body = kind === 'apply' ? inlineBodyOf(selected.kind) : null;
      const payload = body ? body.parse(selected.payload) : null;
      if (body && payload !== null) {
        const { error: bodyError } = await body.submit(payload, draft, selected.id);
        if (bodyError) {
          setError(bodyError);
          return;
        }
        setOutcome(appliedNoteOf(body, payload));
        goNext({ refresh: true });
        return;
      }

      const result =
        kind === 'apply' ? await applyProposalAction(selected.id) : await rejectProposalAction(selected.id, note);

      if (result.error !== null || result.data === null) {
        setError(result.error ?? 'Karar yazılamadı.');
        return;
      }

      const written = result.data;
      if (written.status === 'gone') {
        // Hata DEĞİL bilgi: başka bir sekmede ya da başka bir personelde karar verilmiş.
        setOutcome('Bu öneriye bu arada başka bir yerde karar verilmiş — kuyruk tazelendi.');
      } else if (written.status === 'failed') {
        // Motorun reddi patronun kararı değildir; cümlesi de öyle kurulur.
        setOutcome(`Motor uygulamayı reddetti: ${written.error} — öneri "uygulanamadı" olarak geçmişe düştü.`);
      } else if (written.status === 'applied') {
        setOutcome('Uygulandı. Öneri karar geçmişine düştü; oluşan kayıtların kimlikleri teknik dökümde.');
      } else {
        setOutcome('Reddedildi. Öneri silinmedi, ret notuyla karar geçmişine düştü.');
      }

      // Action zaten `revalidatePath` çağırdı; tazeleme o taze RSC çıktısını ekrana getirir.
      goNext({ refresh: true });
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
        error={error}
        outcome={outcome}
        visibleRows={visibleRows}
        // Sekme değişince SEÇİM düşer: başka sekmede olmayan bir önerinin kimliği adreste kalırsa
        // kart "bulunamadı" der ve operatör sekmeyi değiştirdiğini değil bir şeyin bozulduğunu sanır.
        onTab={(tab: QueueTab) => {
          clearNotices();
          go({ tab, p: '' });
        }}
        // Sekme değişince tip süzgeci DURUR (yukarıdaki `p: ''` ile karıştırılmasın): süzgeç "hangi
        // işe bakıyorum" sorusunun cevabı ve o soru sekmeyle değişmiyor — stok girişlerini süzüp
        // "peki bunların kararı ne olmuştu" diye arşive geçen operatör süzgecini elde tutmalı.
        // Tanınmayan bir tip zaten adres ayrıştırmasında düşüyor; boş kalan bir ızgaranın da kendi
        // cümlesi var ("bu süzgeçte öneri yok").
        onKind={(kind: KindFilter) => {
          clearNotices();
          go({ kind });
        }}
        onSelect={(p: string) => {
          clearNotices();
          go({ p });
        }}
        // Gövdesi olan tipte onay penceresi AÇILMAZ: form zaten onay yüzeyi ve operatör değeri
        // gözüyle görüp değiştirdi. Modal koymak aynı kararı iki kez sordurmak olurdu — üstelik
        // "dialog açılmaz, konteynere gömülür" kuralının tam karşısında.
        //
        // "Sonra bak" da pencere açmaz ve bu düzeltmenin kendisi: hiçbir şey YAZMAYAN bir karara
        // onay sormak, penceredeki iki düğmeyi ("Vazgeç" ile "Kuyrukta bırak") aynı şeyi yapar
        // hâle getiriyordu — operatör iki tık sonunda başladığı yerde kalıyordu.
        onDecision={(kind, draft) => {
          setError(null);
          if (kind === 'later') {
            void runDecision('later');
            return;
          }
          if (kind === 'apply' && selected && inlineBodyOf(selected.kind)) {
            void runDecision('apply', undefined, draft);
            return;
          }
          setDecision(kind);
        }}
      />

      {decision && selected ? (
        <AssistantDecisionDialog
          kind={decision}
          summary={selected.summary}
          notifyCount={notifyCountOf(selected)}
          impact={selected.impact}
          undoHint={selected.undoHint ?? undefined}
          busy={busy}
          error={busy ? null : error}
          onClose={() => setDecision(null)}
          onConfirm={(note) => void runDecision(decision, note)}
        />
      ) : null}
    </>
  );
}
