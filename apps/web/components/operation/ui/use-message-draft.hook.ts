'use client';

import { createContext, useCallback, useContext, useState } from 'react';

/**
 * Bellekte, tarayıcı deposunda değil: yarım cümlenin ömrü çalışma oturumu kadar, sekme kapanınca biter. Sayfa ile pencere aynı
 * depoyu okur; iki kopya olsaydı biri ötekinin yazdığını görmezdi.
 */
export interface MessageDraftStore {
  read: (conversationId: string) => string;
  write: (conversationId: string, text: string) => void;
}

export const MessageDraftContext = createContext<MessageDraftStore | null>(null);

/** Depo yoksa taslak bileşenle ölür. */
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
