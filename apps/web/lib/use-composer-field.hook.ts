'use client';

import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

/**
 * Yazışma kutularının ortak davranışı: kutu metinle uzar (tavanı çağıranın `max-h-*` sınıfı), `send` verilirse Enter gönderir ve
 * Shift+Enter satır atlar. Telefon kutusu `send` vermez, çünkü sanal klavyede Shift yok ve Enter satır atlamalı.
 */
export function useComposerField(value: string, send?: () => void) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // `scrollHeight` çerçeveyi saymaz; kutu border-box olduğu için eklenmezse kutu içeriğinden kısa kalır ve kaydırma çubuğu çıkar.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);

  const onKeyDown = send
    ? (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isSendKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
        event.preventDefault();
        send();
      }
    : undefined;

  return { ref, onKeyDown };
}

/** Harf birleştirme (IME) sürerken basılan Enter seçimi onaylar, mesajı değil. */
export function isSendKey(key: { key: string; shiftKey: boolean; isComposing: boolean }): boolean {
  return key.key === 'Enter' && !key.shiftKey && !key.isComposing;
}
