'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { uploadProductImageAction } from './actions';

// Ürün görseli yükleme — gizli file input + tetikleyici. Web modalında "Görsel değiştir", mobilde
// `capture` ile "Kameradan çek". Tek bileşen (no-duplication). Yükleme R2'ye action ile; sonra refresh.

interface ImageUploadButtonProps {
  productId: string;
  /** Mobilde arka kamerayı aç (capture="environment"). */
  camera?: boolean;
  className?: string;
  children: ReactNode;
}

export function ImageUploadButton({ productId, camera = false, className, children }: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosya tekrar seçilebilsin
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set('file', file);
    startTransition(async () => {
      const { error: actionError } = await uploadProductImageAction(productId, form);
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
