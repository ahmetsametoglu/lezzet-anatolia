'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketHandler } from '@lezzet/types';
import {
  consumeConversationDraftAction,
  loadMoreConversationsAction,
  recordOutboundAction,
  setConversationModeAction,
  suggestConversationDraftAction,
} from './actions';
import { ConversationTicketDialog } from './conversation-ticket-dialog';
import { ManualDmDialog } from './manual-dm-dialog';
import { SocialDesktop } from './social.desktop';
import { socialUrl, type SocialChannelKey, type SocialFilterKey, type SocialUrlState } from './social-url';
import type { InboxRowView, SocialData } from './social-types';

// Sosyal gelen kutusu client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız;
// personelin mobil deneyimi native uygulamanın işi (`docs/uygulama`).
//
// SÜZGEÇ, KANAL ve SEÇİM gerçek gezinmedir (`?f=…&ch=…&c=…`): detay sunucuda okunuyor ve bir
// sohbetin bağlantısı paylaşılabilir olmalı — Talepler ekranı da buraya konuşma kimliğiyle
// bağlanıyor.

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

  // Liste: ilk sayfa sunucudan, devamı action ile EKLENİR. Sunucu verisi değişince (süzgeç ya da
  // yazımdan sonraki tazeleme) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin satırları kalırdı.
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
        // Hata sessiz: kuyruk olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Gelen mesaj penceresinin iki kapısı, TEK durum: `new` yeni bir WhatsApp numarası, `follow` açık
   * sohbetin devamı (anahtar kilitli, kanal-nötr). İki ayrı bayrak tutmak, ikisinin aynı anda açık
   * olabildiği bir hâl üretirdi — üstelik pencere zaten aynı pencere.
   */
  const [dmMode, setDmMode] = useState<'new' | 'follow' | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const detail = data.detail;

  /**
   * Yazma sarmalı: kilitle, hatayı göster, başarıda sunucuyu yeniden oku.
   *
   * Hata GÖRÜNÜR kalır ve kutu temizlenmez: reddedilen bir kaydın metni silinseydi operatör
   * yazdığını kaybeder ve — daha kötüsü — kaydın düştüğünü sanırdı.
   */
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
      // Action zaten `revalidatePath` çağırdı; `refresh` o taze RSC çıktısını ekrana getirir.
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
    // Kanal çipi de gerçek gezinme — devam sayfaları adresi okuyor, ölçüt tek yerde kalmalı.
    onChannel: (ch: SocialChannelKey) => go({ ch }),
    // Süzgeç değişmiyor, seçim değişiyor: aynı adres üç soruyu birden taşıyor.
    onSelect: (c: string) => go({ c }),
    onRecordOutbound: (text: string) =>
      detail ? run(() => recordOutboundAction({ conversationId: detail.id, text })) : Promise.resolve(false),
    // Mod anahtarı (16.08) — onaysız: anahtar kararın kendisi; Devral düğmesi de buradan geçer.
    onMode: (mode: TicketHandler) => {
      if (detail) void run(() => setConversationModeAction(detail.id, mode));
    },
    /** Hibrit taslağı tüket — dönen metni ekran defter kutusuna taşır (16.08). */
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
    /** Taslağı istek üzerine üret (20.4) — başarıda `refresh` taslak kartını getirir. */
    onSuggestDraft: () => {
      if (detail) void run(() => suggestConversationDraftAction(detail.id));
    },
    onIncoming: () => setDmMode('follow'),
    onNewDm: () => setDmMode('new'),
    onNewTicket: () => setTicketOpen(true),
  };

  return (
    <>
      <SocialDesktop {...view} />

      {dmMode ? (
        <ManualDmDialog
          // Devam kapısı sohbeti KİMLİĞİYLE alır, operatör anahtar yazmaz — ve yazamaz da:
          // değiştirilebilir olsaydı mesaj farkında olmadan başka birinin sohbetine düşerdi.
          existing={
            dmMode === 'follow' && detail
              ? { conversationId: detail.id, title: detail.title, source: detail.source }
              : undefined
          }
          onClose={() => setDmMode(null)}
          onOpened={(conversationId) => {
            setDmMode(null);
            // İşlenen sohbet AÇILIR: operatör onu okumak için buraya geldi, kuyrukta aramamalı.
            go({ c: conversationId });
            router.refresh();
          }}
        />
      ) : null}

      {/* Talep penceresi YALNIZ kimliği çözülmüş sohbette açılır: talep bir müşteriye açılır ve
          müşterisi olmayan bir sohbette açılacak talebin sahibi yoktur. */}
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
