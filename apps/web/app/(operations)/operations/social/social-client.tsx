'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketHandler } from '@lezzet/types';
import {
  consumeConversationDraftAction,
  loadMoreConversationsAction,
  recordConversationOptInAction,
  sendCartLinkAction,
  sendAccountLinkAction,
  sendOutboundAction,
  setConversationModeAction,
  setDefaultConversationModeAction,
  suggestConversationDraftAction,
} from './actions';
import { ConversationTicketDialog } from './conversation-ticket-dialog';
import { SocialDesktop } from './social.desktop';
import { socialUrl, type SocialChannelKey, type SocialFilterKey, type SocialUrlState } from './social-url';
import type { InboxRowView, SocialData } from './social-types';

// Süzgeç, kanal ve seçim gerçek gezinmedir (`?f=…&ch=…&c=…`): detay sunucuda okunur ve sohbetin bağlantısı paylaşılabilir olmalı.

interface SocialClientProps {
  data: SocialData;
  urlState: SocialUrlState;
}

export function SocialClient({ data, urlState }: SocialClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const go = (patch: Partial<SocialUrlState>) => {
    startNav(() => router.replace(socialUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Sunucu verisi değişince (süzgeç ya da yazım sonrası tazeleme) eklenen sayfalar sıfırlanır; yoksa eski süzgecin satırları kalırdı.
  const [extra, setExtra] = useState<InboxRowView[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
  }, [data.rows, data.nextCursor]);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreConversationsAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: kuyruk olduğu yerde kalır ve tetikleyici yeniden denenebilir.
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const detail = data.detail;

  // Hata görünür kalır ve kutu temizlenmez: reddedilen metin silinseydi operatör yazdığını kaybeder, kaydın düştüğünü sanırdı.
  async function run(call: () => Promise<{ data: unknown; error: string | null }>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (result.error !== null || result.data === null) {
        setError(result.error ?? 'İşlem tamamlanamadı.');
        return false;
      }
      // Action `revalidatePath` çağırdı; `refresh` taze RSC çıktısını ekrana getirir.
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const view = {
    data: { ...data, rows: [...data.rows, ...extra] },
    urlState,
    navPending,
    busy,
    error,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    onFilter: (f: SocialFilterKey) => go({ f }),
    // Kanal da gerçek gezinme: devam sayfaları süzgeci adresten okur, ölçüt tek yerde kalmalı.
    onChannel: (ch: SocialChannelKey) => go({ ch }),
    onSelect: (c: string) => go({ c }),
    onSendReply: (text: string) =>
      detail ? run(() => sendOutboundAction({ conversationId: detail.id, text })) : Promise.resolve(false),
    // Onaysız: anahtar kararın kendisi.
    onMode: (mode: TicketHandler) => {
      if (detail) void run(() => setConversationModeAction(detail.id, mode));
    },
    onDefaultMode: (mode: TicketHandler) => {
      void run(() => setDefaultConversationModeAction(mode));
    },
    onConsumeDraft: async (): Promise<string | null> => {
      if (!detail) return null;
      let draft: string | null = null;
      await run(async () => {
        const result = await consumeConversationDraftAction(detail.id);
        draft = result.data?.draft ?? null;
        return result;
      });
      return draft;
    },
    onSuggestDraft: () => {
      if (detail) void run(() => suggestConversationDraftAction(detail.id));
    },
    onNewTicket: () => setTicketOpen(true),
    onOptIn: (granted: boolean) => {
      if (detail) void run(() => recordConversationOptInAction({ conversationId: detail.id, granted }));
    },
    onSendCartLink: () => {
      if (detail) void run(() => sendCartLinkAction(detail.id));
    },
    onSendAccountLink: () => {
      if (detail) void run(() => sendAccountLinkAction(detail.id));
    },
  };

  return (
    <>
      <SocialDesktop {...view} />

      {/* Talep bir müşteriye açılır: müşterisi olmayan sohbette açılacak talebin sahibi yoktur. */}
      {ticketOpen && detail?.context?.customerId ? (
        <ConversationTicketDialog
          conversationId={detail.id}
          customerId={detail.context.customerId}
          customerName={detail.context.name}
          onClose={() => setTicketOpen(false)}
          onCreated={() => {
            setTicketOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
