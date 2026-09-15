'use client';

import { createContext, useCallback, useContext, useState } from 'react';

/**
 * **Ekranlar arası taslak** (15.39 · çizimin kuralı: "balon her ekranda aynı konuşmayı açar; sayfa değişmez, taslak mesaj
 * kaybolmaz"). Cevap kutusunun yazısı sohbet kimliğine göre kabuğun belleğinde durur: pencere kapanıp açılınca, listeye
 * dönüp gelince, "Tam ekran"a geçince ve operatör başka ekrana gidince yarım cümle yerinde.
 *
 * Depo kabukta (`SocialMessengerProvider`, `operations/layout`) — sayfa geçişinde yeniden kurulmaz. Bellekte, tarayıcı
 * deposunda değil: yarım cümlenin ömrü çalışma oturumu kadar, sekme kapanınca biter. Sayfa ile pencere AYNI depoyu okur —
 * iki kopya olsaydı biri ötekinin yazdığını görmezdi.
 */
export interface MessageDraftStore {
  read: (conversationId: string) => string;
  write: (conversationId: string, text: string) => void;
}

export const MessageDraftContext = createContext<MessageDraftStore | null>(null);

/** Bir sohbetin taslağı — depo yoksa yalnız bileşenin kendi durumu (taslak o zaman bileşenle ölür). */
export function useMessageDraft(conversationId: string): [string, (text: string) => void] {
  const store = useContext(MessageDraftContext);
  const [text, setText] = useState(() => store?.read(conversationId) ?? '');
  const update = useCallback(
    (next: string) => {
      setText(next);
      store?.write(conversationId, next);
    },
    [store, conversationId],
  );
  return [text, update];
}
