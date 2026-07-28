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
  /**
   * Seçilen dosyayı ilgili action'a taşır (FormData'da `file` alanı). Dönüş `unknown` yüklü:
   * buton yalnız `error` alanına bakar, action'ın ne döndürdüğü onu ilgilendirmez (galeri eklemesi
   * oluşan satırı döner, kapak yüklemesi null).
   */
  upload: (form: FormData) => Promise<ActionResult<unknown>>;
  /** Mobilde arka kamerayı aç (capture="environment"). */
  camera?: boolean;
  /**
   * Birden çok dosya seçilebilsin (galeri). Dosyalar SIRAYLA yüklenir — eşzamanlı gönderim sırayı
   * belirsizleştirir; operatör seçtiği sırayı galeride görmeyi bekler. İlk hatada durur, kalanlar
   * gönderilmez; kısmen yüklenmiş olanlar kalır (yüklenen dosya geri alınmaz).
   */
  multiple?: boolean;
  className?: string;
  children: ReactNode;
}

export function ImageUploadButton({ upload, camera = false, multiple = false, className, children }: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // aynı dosya tekrar seçilebilsin
    if (files.length === 0) return;
    setError(null);
    startTransition(async () => {
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        const { error: actionError } = await upload(form);
        if (actionError) {
          setError(actionError);
          break; // sırayı bozmamak için dur; yüklenenler kalır
        }
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
        multiple={multiple}
        {...(camera ? { capture: 'environment' as const } : {})}
        onChange={onPick}
        className="hidden"
      />
      {error ? <span className="font-ops-body text-ops-xs text-ops-red">{error}</span> : null}
    </>
  );
}
