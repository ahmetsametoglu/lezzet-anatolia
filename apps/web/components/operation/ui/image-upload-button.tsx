'use client';

import { useRef, useState, useTransition, type ChangeEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/error';

/**
 * Görsel yükleme tetikleyicisi — gizli file input + görünüşü çağırana bırakılmış buton. Web modalında
 * "Görsel değiştir", mobilde `capture` ile "Kameradan çek". Yükleme hedefini BİLMEZ: `upload` callback'i
 * FormData'yı ilgili server action'a taşır (ürün görseli, koleksiyon kapağı…) → tek bileşen, çok tüketici
 * (no-duplication). Başarıdan sonra `router.refresh()` ile sunucu verisi tazelenir.
 */
interface ImageUploadButtonProps {
  /** Seçilen dosyayı ilgili action'a taşır (FormData'da `file` alanı). */
  upload: (form: FormData) => Promise<ActionResult>;
  /** Mobilde arka kamerayı aç (capture="environment"). */
  camera?: boolean;
  className?: string;
  children: ReactNode;
}

export function ImageUploadButton({ upload, camera = false, className, children }: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosya tekrar seçilebilsin
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set('file', file);
    startTransition(async () => {
      const { error: actionError } = await upload(form);
      if (actionError) {
        setError(actionError);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={pending} className={className}>
        {pending ? 'Yükleniyor…' : children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        {...(camera ? { capture: 'environment' as const } : {})}
        onChange={onPick}
        className="hidden"
      />
      {error ? <span className="font-ops-body text-[11px] text-ops-red">{error}</span> : null}
    </>
  );
}
