import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ConversationHandler } from '@lezzet/types';

import {
  consumeSocialDraft,
  fetchSocialConversation,
  generateSocialDraft,
  recordSocialReply,
  setSocialMode,
  type SocialConversationDetail,
  type SocialMessage,
  type SocialRow,
} from '@/lib/api/social';

/*
  TEK SOHBETİN VERİSİ VE YAZMA KAPILARI — `use-tickets.hook.ts` yükleme deseni + eylem sonuçları.

  ── MESAJLAR TELDE YENİDEN ESKİYE, EKRANA ESKİDEN YENİYE ────────────────────
  Uç `listRecent`ten okur (ilk sayfa = EN YENİ mesajlar; iki aylık sohbet "merhaba"dan açılmaz —
  servis künyesindeki ölçülmüş yön hatası). Sohbet penceresi ise en yeniyi ALTTA gösterir; ters
  çevirme SUNUM işidir ve tek yerde, burada yapılır: `messages` state'i hep ESKİDEN YENİYE durur,
  ekran diziyi olduğu gibi çizer. "Daha eski" (`loadOlder`) gelen sayfayı BAŞA ekler.

  ── HER EYLEMİN DÖNÜŞÜ GERÇEĞİN KENDİSİDİR ──────────────────────────────────
  `reply` güncel detayı döndürür (uç kararı) — state komple onunla değişir; mesaj geçmişi ilk
  sayfaya döner ve bu kabul edilir bir bedel: cevap yazan operatör sohbetin en yenisine bakıyordur.
  `draft`/`mode` eylemlerinden sonra detay YENİDEN OKUNUR: taslak satırda yaşar, yerel kopyayı
  elle güncellemek iki gerçek yaratırdı.

  Eylem retleri fırlatılmaz, `lastError` ANAHTAR olarak ekrana çıkar (zarf sözleşmesi: metin
  ekranın sözlüğünde) — kaybolan tek durum yok: yarış retleri (`mode_unchanged`, `no_draft`)
  de görünür, ardından detay tazelenip gerçek hâl ekrana iner.
*/

type ConversationStatus = 'loading' | 'ready' | 'error';

interface UseSocialConversationResult {
  status: ConversationStatus;
  conversation: SocialRow | null;
  /** ESKİDEN YENİYE — ekran olduğu gibi çizer, en yeni altta. */
  messages: SocialMessage[];
  hasOlder: boolean;
  loadingOlder: boolean;
  /** Son eylemin ret anahtarı — ekran sözlüğünden cümleye çevrilir; yeni eylem başlarken temizlenir. */
  lastError: string | null;
  sending: boolean;
  busy: boolean;
  retry: () => void;
  loadOlder: () => void;
  /** Cevabı deftere işler; başarıda `true` — ekran giriş kutusunu o zaman boşaltır. */
  reply: (text: string) => Promise<boolean>;
  changeMode: (mode: ConversationHandler) => Promise<void>;
  suggestDraft: () => Promise<void>;
  /** Taslağı tüketir; dönen metin cevap kutusuna taşınır (`null` = tüketilemedi, sebep `lastError`). */
  takeDraft: () => Promise<string | null>;
}

export function useSocialConversation(conversationId: string): UseSocialConversationResult {
  const [status, setStatus] = useState<ConversationStatus>('loading');
  const [conversation, setConversation] = useState<SocialRow | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const generation = useRef(0);
  const loaded = useRef(false);

  /** Detay cevabı state'e TEK yoldan iner: sıra çevirme ve imleç tutma iki kez yazılmaz. */
  const applyDetail = useCallback((detail: SocialConversationDetail) => {
    setConversation(detail.conversation);
    setMessages([...detail.messages].reverse());
    setOlderCursor(detail.nextCursor);
  }, []);

  const load = useCallback(
    async (options: { silent: boolean }) => {
      const run = (generation.current += 1);
      if (!options.silent) setStatus('loading');

      const result = await fetchSocialConversation(conversationId);
      if (run !== generation.current) return;

      loaded.current = true;
      if (result.error !== null) {
        setStatus('error');
        return;
      }
      applyDetail(result.data);
      setStatus('ready');
    },
    [conversationId, applyDetail],
  );

  useFocusEffect(
    useCallback(() => {
      void load({ silent: loaded.current });
    }, [load]),
  );

  const retry = useCallback(() => {
    void load({ silent: false });
  }, [load]);

  const loadOlder = useCallback(() => {
    if (olderCursor === null || loadingOlder || status !== 'ready') return;

    const run = generation.current;
    setLoadingOlder(true);

    void fetchSocialConversation(conversationId, olderCursor).then((result) => {
      if (run !== generation.current) return;
      setLoadingOlder(false);
      if (result.error !== null) {
        // Geçmiş sayfası düştü — sohbet yerinde; bir sonraki dokunuş aynı imleçle yeniden dener.
        setLastError(result.error);
        return;
      }
      // Gelen sayfa telde yeniden-eskiye: çevrilip BAŞA eklenir (daha eski mesajlar üstte durur).
      setMessages((current) => [...[...result.data.messages].reverse(), ...current]);
      setOlderCursor(result.data.nextCursor);
    });
  }, [conversationId, olderCursor, loadingOlder, status]);

  const reply = useCallback(
    async (text: string): Promise<boolean> => {
      if (sending) return false;
      setSending(true);
      setLastError(null);

      const result = await recordSocialReply(conversationId, text);
      setSending(false);
      if (result.error !== null) {
        setLastError(result.error);
        return false;
      }
      generation.current += 1; // uçuştaki okuma bu taze detayı ezmesin
      applyDetail(result.data);
      return true;
    },
    [conversationId, sending, applyDetail],
  );

  const changeMode = useCallback(
    async (mode: ConversationHandler): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setLastError(null);

      const result = await setSocialMode(conversationId, mode);
      if (result.error !== null) setLastError(result.error);
      // Başarıda da retde de detay yeniden okunur: yarış retinde (`mode_unchanged`) ekrana
      // ötekinin yazdığı gerçek mod iner — uyarı + taze hâl birlikte.
      await load({ silent: true });
      setBusy(false);
    },
    [conversationId, busy, load],
  );

  const suggestDraft = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setLastError(null);

    const result = await generateSocialDraft(conversationId);
    if (result.error !== null) setLastError(result.error);
    await load({ silent: true }); // taslak satıra yazıldı — tek okuma kaynağı satır
    setBusy(false);
  }, [conversationId, busy, load]);

  const takeDraft = useCallback(async (): Promise<string | null> => {
    if (busy) return null;
    setBusy(true);
    setLastError(null);

    const result = await consumeSocialDraft(conversationId);
    if (result.error !== null) setLastError(result.error);
    await load({ silent: true }); // taslak satırdan silindi; baloncuk taze hâlle kapanır
    setBusy(false);
    return result.error === null ? result.data.draft : null;
  }, [conversationId, busy, load]);

  return {
    status,
    conversation,
    messages,
    hasOlder: olderCursor !== null,
    loadingOlder,
    lastError,
    sending,
    busy,
    retry,
    loadOlder,
    reply,
    changeMode,
    suggestDraft,
    takeDraft,
  };
}
