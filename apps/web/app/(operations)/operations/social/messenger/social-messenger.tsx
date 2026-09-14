'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { conversationChannelName, type KeysetCursor } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { ArrowLeftIcon, ChatIcon, XIcon } from '@/components/operation/ui/icons';
import { MessageThread } from '@/components/operation/ui/message-thread';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { useBell } from '@/components/operation/ui/use-bell.hook';
import { SOURCE_LABELS } from '@/components/operation/ui/conversation-source';
import { SocialMessengerContext, type SocialMessengerApi } from '@/components/operation/ui/use-social-messenger.hook';
import { loadMoreConversationsAction, sendOutboundAction } from '../actions';
import { WINDOW_TONE } from '../social-labels';
import { Bubble, InboxRow, NoteLine, ReplyBox } from '../social-sections';
import { SOCIAL_PATH, socialLink } from '../social-url';
import type { ConversationDetailView, InboxRowView } from '../social-types';
import { messengerAwaitingCountAction, messengerConversationAction, startWhatsappConversationAction } from './actions';

/**
 * **Yüzen mesaj penceresi** (15.32 · kullanıcı isteği 14.09) — operasyon web'inin her ekranında sağ altta bir
 * düğme; basınca küçük bir WhatsApp ekranı gibi pencere açılır: üç kanalın sohbet listesi, dokununca
 * sohbetin içi. Müşteriyle konuşmanın gerektiği ekranlarda (sipariş, müşteri kartı, talep) müşterinin
 * kanal düğmeleri durur (`CustomerChannels`) ve basınca o kanalın sohbeti doğrudan burada açılır.
 *
 * **Kural (kullanıcı, 14.09 — iki kez söylendi):** operasyon müşteriye YALNIZ uygulamanın içinden yazar;
 * `wa.me` bağlantısı ve personelin kendi telefonu yok. Bu pencere o kuralın web ayağı.
 *
 * **Ek çizim yok ve bilerek:** liste satırı ve sohbet alanı sohbet sayfasının kendi parçaları (`InboxRow`,
 * `Bubble`, `ReplyBox`) — pencere yalnız ikisi arasında geçiş. Kopya parça olsaydı sayfa ile pencere bir gün
 * aynı sohbeti farklı çizerdi. Mod anahtarı, taslak ve müşteri bağlamı tam ekranda kalır ("Tam ekran →").
 *
 * **Yalnız yönetici:** sohbet sayfasının kapısı `requireAdmin`; pencere ikinci bir yetki yolu değil, kısayol.
 * Sohbet sayfasının kendisinde düğme çizilmez — tam ekran zaten açık (ve kuyruk zilini orada sayfa dinler:
 * aynı kanala iki abonelik açılmaz).
 */

interface SocialMessengerProviderProps {
  /** Yalnız yönetici — değilse pencere de kapı da yok. */
  enabled: boolean;
  /** Kuyruk zilinin kanal adı — sunucu sırrından türer, layout'tan iner (`conversationsChannelName`). */
  inboxChannel: string | null;
  children: ReactNode;
}

export function SocialMessengerProvider({ enabled, inboxChannel, children }: SocialMessengerProviderProps) {
  const pathname = usePathname();
  const onSocialPage = pathname?.startsWith(SOCIAL_PATH) ?? false;

  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // `null` = HENÜZ ÖLÇÜLMEDİ — rozet uydurulmaz: "0" iş yok derdi (bildirim zilinin kuralı).
  const [awaiting, setAwaiting] = useState<number | null>(null);
  // Kuyruk zili TEK yerde dinlenir, liste bu sayaçla haberdar olur — aynı kanala iki abonelik açılmasın.
  const [inboxTick, setInboxTick] = useState(0);

  const refreshCount = useCallback(() => {
    void messengerAwaitingCountAction().then(({ data }) => {
      if (data !== null) setAwaiting(data);
    });
  }, []);

  useEffect(() => {
    if (enabled && !onSocialPage) refreshCount();
  }, [enabled, onSocialPage, refreshCount]);

  useBell(enabled && !onSocialPage ? inboxChannel : null, () => {
    refreshCount();
    setInboxTick((tick) => tick + 1);
  });

  const openConversation = useCallback((id: string) => {
    setOpen(true);
    setNotice(null);
    setConversationId(id);
  }, []);

  const startWhatsapp = useCallback((customerId: string) => {
    setOpen(true);
    setConversationId(null);
    setNotice(null);
    setOpening(true);
    void startWhatsappConversationAction(customerId).then(({ data, error }) => {
      setOpening(false);
      // Açılamadıysa SEBEBİ söylenir (numara okunamadı, iki kayda çıkıyor) — sessiz boş pencere değil.
      if (!data) {
        setNotice(error ?? 'WhatsApp sohbeti açılamadı.');
        return;
      }
      setConversationId(data.conversationId);
    });
  }, []);

  const api = useMemo<SocialMessengerApi | null>(
    () => (enabled ? { openConversation, startWhatsapp } : null),
    [enabled, openConversation, startWhatsapp],
  );

  const close = () => {
    setOpen(false);
    setNotice(null);
  };

  return (
    <SocialMessengerContext.Provider value={api}>
      {children}
      {/* Sohbet sayfasında pencere de çizilmez: aynı sohbet iki yerde açık kalır ve aynı zile iki abonelik düşerdi. */}
      {enabled && open && !onSocialPage ? (
        <section
          role="dialog"
          aria-label="Mesajlar"
          className="fixed right-5 bottom-[84px] z-40 flex h-[min(600px,calc(100vh-110px))] w-[380px] flex-col overflow-hidden rounded-ops-card border border-ops-line bg-ops-card shadow-[0_24px_70px_rgba(20,22,18,0.4)] print:hidden"
        >
          {conversationId ? (
            <ConversationView key={conversationId} conversationId={conversationId} onBack={() => setConversationId(null)} onClose={close} />
          ) : (
            <ListView
              opening={opening}
              notice={notice}
              awaiting={awaiting}
              tick={inboxTick}
              onSelect={(id) => {
                setNotice(null);
                setConversationId(id);
              }}
              onClose={close}
            />
          )}
        </section>
      ) : null}
      {enabled && !onSocialPage ? <MessengerFab open={open} awaiting={awaiting} onToggle={() => (open ? close() : setOpen(true))} /> : null}
    </SocialMessengerContext.Provider>
  );
}

interface MessengerFabProps {
  open: boolean;
  awaiting: number | null;
  onToggle: () => void;
}

/** Sağ alttaki düğme — cevap bekleyen sohbet varsa sayısı üstünde (tavan sığdırma: "99+"). */
function MessengerFab({ open, awaiting, onToggle }: MessengerFabProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Mesaj penceresini kapat' : 'Mesajlar'}
      aria-expanded={open}
      className="fixed right-5 bottom-5 z-40 flex h-13 w-13 cursor-pointer items-center justify-center rounded-full bg-ops-olive text-ops-card shadow-[0_8px_24px_rgba(20,22,18,0.12)] transition-colors hover:bg-ops-olive-dark print:hidden"
    >
      {open ? <XIcon size={20} /> : <ChatIcon size={22} />}
      {!open && awaiting !== null && awaiting > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ops-red px-1 font-ops-mono text-ops-micro font-semibold text-ops-card">
          {awaiting > 99 ? '99+' : awaiting}
        </span>
      ) : null}
    </button>
  );
}

interface CloseButtonProps {
  onClose: () => void;
}

function CloseButton({ onClose }: CloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Pencereyi kapat"
      className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-ops-btn text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
    >
      <XIcon size={14} />
    </button>
  );
}

interface ListViewProps {
  /** WhatsApp sohbeti açılıyor (`startWhatsapp`). */
  opening: boolean;
  /** Açılamamanın sebebi — liste yine görünür, operatör başka sohbete geçebilir. */
  notice: string | null;
  awaiting: number | null;
  /** Kuyruk zilinin sayacı — değişince liste sunucudan yeniden okunur. */
  tick: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function ListView({ opening, notice, awaiting, tick, onSelect, onClose }: ListViewProps) {
  // `null` = ilk okuma bitmedi — "sohbet yok" yazılmaz, iskelet çizilir (yükleme yokluk gibi okunmasın).
  const [rows, setRows] = useState<InboxRowView[] | null>(null);
  const [cursor, setCursor] = useState<KeysetCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Zil gelince sayfalar SIFIRLANIR: sıra son gelen mesaja göre, yeni mesaj bir satırı tepeye taşımış olabilir.
  useEffect(() => {
    // Süzgeçsiz (boş adres): pencere üç kanalın TÜMÜNÜ gösterir, kuyruğun sırasıyla (son GELEN mesaj).
    void loadMoreConversationsAction('', null).then(({ data, error: actionError }) => {
      if (!data) {
        setError(actionError ?? 'Sohbetler okunamadı.');
        return;
      }
      setError(null);
      setRows(data.rows);
      setCursor(data.nextCursor);
    });
  }, [tick]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreConversationsAction('', cursor)
      .then(({ data }) => {
        // Düşen devam sessiz değil: düğme yerinde kalır ve yeniden denenebilir (sunucu = gerçek).
        if (!data) return;
        setRows((prev) => [...(prev ?? []), ...data.rows]);
        setCursor(data.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  return (
    <>
      <header className="flex flex-none items-center gap-2 border-b border-ops-line px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">Mesajlar</span>
          {awaiting !== null ? <span className="font-ops-body text-ops-micro text-ops-muted">{awaiting} cevap bekliyor</span> : null}
        </div>
        <Link
          href={SOCIAL_PATH}
          onClick={onClose}
          className="flex-none cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline"
        >
          Tümü →
        </Link>
        <CloseButton onClose={onClose} />
      </header>
      {opening ? (
        <p className="flex-none border-b border-ops-line px-4 py-2 font-ops-body text-ops-xs text-ops-muted">WhatsApp sohbeti açılıyor…</p>
      ) : null}
      {notice ? (
        <p
          role="alert"
          className="flex-none border-b border-ops-amber-line bg-ops-amber-bg px-4 py-2 font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark"
        >
          {notice}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {error ? (
          <p className="px-4 py-3 font-ops-body text-ops-xs text-ops-red">{error}</p>
        ) : rows === null ? (
          <div className="flex flex-col gap-3 px-4 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-3 font-ops-body text-ops-xs text-ops-muted">Henüz sohbet yok.</p>
        ) : (
          rows.map((row) => <InboxRow key={row.id} row={row} active={false} onSelect={onSelect} />)
        )}
        {cursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="cursor-pointer px-4 py-2.5 text-left font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? 'Yükleniyor…' : 'Daha eski sohbetler'}
          </button>
        ) : null}
      </div>
    </>
  );
}

interface ConversationViewProps {
  conversationId: string;
  onBack: () => void;
  onClose: () => void;
}

function ConversationView({ conversationId, onBack, onClose }: ConversationViewProps) {
  const [detail, setDetail] = useState<ConversationDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(() => {
    void messengerConversationAction(conversationId).then(({ data, error: actionError }) => {
      if (!data) {
        setError(actionError ?? 'Sohbet okunamadı.');
        return;
      }
      setError(null);
      setDetail(data);
    });
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);
  // Sohbetin KENDİ zili: transkript ve çeviri mesajdan saniyeler sonra yazılır (sohbet sayfasının künyesi).
  useBell(conversationChannelName(conversationId), load);

  const onSendReply = async (text: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setSendError(null);
    const { data, error: actionError } = await sendOutboundAction({ conversationId, text });
    setBusy(false);
    // Red GÖRÜNÜR kalır ve kutu temizlenmez (sayfanın kuralı): operatör yazdığını kaybetmesin.
    if (data === null) {
      setSendError(actionError ?? 'Gönderilemedi.');
      return false;
    }
    load();
    return true;
  };

  return (
    <>
      <header className="flex flex-none items-center gap-2 border-b border-ops-line px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Sohbet listesine dön"
          className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-ops-btn text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
        >
          <ArrowLeftIcon size={15} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{detail?.title ?? 'Sohbet'}</span>
          {detail ? (
            <span className="flex items-center gap-1.5 font-ops-body text-ops-micro text-ops-muted">
              {SOURCE_LABELS[detail.source]}
              <Badge tone={WINDOW_TONE[detail.window.tone]}>{detail.window.chip}</Badge>
            </span>
          ) : null}
        </div>
        <Link
          href={socialLink(conversationId)}
          onClick={onClose}
          className="flex-none cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline"
        >
          Tam ekran →
        </Link>
        <CloseButton onClose={onClose} />
      </header>
      {error ? (
        <p className="px-4 py-3 font-ops-body text-ops-xs text-ops-red">{error}</p>
      ) : detail === null ? (
        <div className="flex flex-1 flex-col gap-3 bg-ops-gray-25 px-4 py-3">
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="ml-auto h-8 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      ) : (
        <>
          {detail.thread.length === 0 ? (
            <p className="flex flex-1 items-center justify-center bg-ops-gray-25 px-4 font-ops-body text-ops-xs text-ops-muted">
              Bu sohbette henüz mesaj yok.
            </p>
          ) : (
            <MessageThread className="bg-ops-gray-25 px-3 py-3">
              {detail.thread.map((item) =>
                item.kind === 'message' ? (
                  <Bubble key={item.message.id} message={item.message} />
                ) : (
                  <NoteLine key={item.note.id} note={item.note} />
                ),
              )}
            </MessageThread>
          )}
          <ReplyBox
            source={detail.source}
            window={detail.window}
            language={detail.language}
            busy={busy}
            error={sendError}
            onSendReply={onSendReply}
          />
        </>
      )}
    </>
  );
}
