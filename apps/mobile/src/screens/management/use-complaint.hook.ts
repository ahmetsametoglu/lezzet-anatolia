import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiFail } from '@/lib/api/client';
import {
  consumeComplaintDraft,
  fetchComplaint,
  replyComplaint,
  setComplaintMode,
  setComplaintStatus,
  setComplaintType,
  triggerComplaintReturn,
} from '@/lib/api/management';
import type { ComplaintDetail, TicketHandler, TicketStatus, TicketType } from '@lezzet/types';

/*
  Y1 · ŞİKÂYET/TALEP KANCASI (21.12) — detay + üç yazma kapısı (cevap · üstlen · taslak tüket).

  HER YAZIMDAN SONRA DETAY YENİDEN OKUNUR: cevap sohbete sunucunun yazdığı hâliyle düşer (çeviri,
  damga, yazar adı) — ekranda yerel bir kopya uydurulmaz; "gönderildi" demek, sunucudan dönen
  yazışmada görmek demektir. Reddin sebebi (`reason`) ekrana taşınır, yutulmaz.

  `ticketId` verilmezse `next`: hub'ın karar satırı en taze bekleyeni açar; `complaint: null` =
  bekleyen kalmadı (iyi haber, boş hâl).
*/

type ComplaintState =
  | { status: 'loading' }
  /** Düşen çağrı taşınır (06.09 kararı — `lib/api/client` `failureCauseOf` künyesi): ekran
      "niçin" cümlesini ondan kurar. `null` = cevap 200 döndü ama gövde boştu; sebep iddia edilmez. */
  | { status: 'error'; failure: ApiFail | null }
  | { status: 'ready'; complaint: ComplaintDetail | null };

interface UseComplaintResult {
  state: ComplaintState;
  reply: string;
  setReply: (value: string) => void;
  sending: boolean;
  /** Son yazımın reddi — sunucunun cümle anahtarı; başarılı yazım sıfırlar. */
  lastError: string | null;
  sendReply: () => void;
  /** Durum geçişi — "Üstlen" bunun `in_progress` çağrısı (21.276). İzni motor verir. */
  setStatus: (to: TicketStatus) => void;
  /** Yürütücü modu (çekmece). Aynı moda geçiş sunucuda reddedilir, ekran onu zaten seçili çizer. */
  setMode: (mode: TicketHandler) => void;
  /** Talep türünün düzeltilmesi (çekmece) — sınıflandırma, iş akışı değil. */
  setType: (type: TicketType) => void;
  /** İade damgası (çekmece) — tutar ve akıbet siparişte seçilir. */
  triggerReturn: () => void;
  /** true = taslak olduğu gibi cevap olur; false = taslak metni cevap kutusuna taşınır. */
  consumeDraft: (send: boolean) => void;
  retry: () => void;
}

export function useComplaint(ticketId: string | undefined): UseComplaintResult {
  const [state, setState] = useState<ComplaintState>({ status: 'loading' });
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const generation = useRef(0);
  /** `next` ile açılan talep, ilk cevapta BAŞKA talebe kaymasın diye kimliği sabitlenir. */
  const pinnedId = useRef<string | undefined>(ticketId);

  const load = useCallback(async () => {
    const run = ++generation.current;
    // Yeniden yüklemede ekran KARARTILMAZ (21.119'un cihazda ölçülmüş dersi): iplik yerinde durur,
    // taze cevap gelince değişir. 'loading' yalnız ilk açılışın hâlidir.
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    const result = await fetchComplaint(pinnedId.current);
    if (run !== generation.current) return;
    if (result.error !== null || result.data === null) {
      setState({ status: 'error', failure: result.error !== null ? result : null });
      return;
    }
    if (result.data.complaint !== null) pinnedId.current = result.data.complaint.ticketId;
    setState({ status: 'ready', complaint: result.data.complaint });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentId = (): string | null =>
    state.status === 'ready' && state.complaint !== null ? state.complaint.ticketId : null;

  const act = (run: (id: string) => Promise<{ ok: boolean; reason: string | null } | null>) => {
    const id = currentId();
    if (id === null || sending) return;
    setSending(true);
    void (async () => {
      const outcome = await run(id);
      setSending(false);
      if (outcome === null) {
        setLastError('network');
        return;
      }
      setLastError(outcome.ok ? null : outcome.reason);
      if (outcome.ok) void load();
    })();
  };

  return {
    state,
    reply,
    setReply,
    sending,
    lastError,
    sendReply: () => {
      const body = reply.trim();
      if (body.length === 0) return;
      act(async (id) => {
        const result = await replyComplaint(id, body);
        if (result.error !== null || result.data === null) return null;
        if (result.data.ok) setReply('');
        return result.data;
      });
    },
    setStatus: (to) =>
      act(async (id) => {
        const result = await setComplaintStatus(id, to);
        return result.error !== null || result.data === null ? null : result.data;
      }),
    setMode: (mode) =>
      act(async (id) => {
        const result = await setComplaintMode(id, mode);
        return result.error !== null || result.data === null ? null : result.data;
      }),
    setType: (type) =>
      act(async (id) => {
        const result = await setComplaintType(id, type);
        return result.error !== null || result.data === null ? null : result.data;
      }),
    triggerReturn: () =>
      act(async (id) => {
        const result = await triggerComplaintReturn(id);
        return result.error !== null || result.data === null ? null : result.data;
      }),
    consumeDraft: (send) =>
      act(async (id) => {
        const result = await consumeComplaintDraft(id, send);
        if (result.error !== null || result.data === null) return null;
        // Düzenleme yolu: taslak metni cevap kutusuna taşınır — düzenleme yeri zaten orasıdır.
        if (result.data.ok && !send && result.data.draft !== null) setReply(result.data.draft);
        return result.data;
      }),
    retry: () => void load(),
  };
}
