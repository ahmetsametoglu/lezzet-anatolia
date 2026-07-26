'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonClass } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon, CopyIcon } from '@/components/operation/ui/icons';

/**
 * Operasyon 500 — segment içindeki beklenmeyen hataları yakalar (client zorunlu). AdminSidebar
 * korunur. Operatörün ilk sorusu "kaydım gitti mi?" → kayıt güvencesi zorunlu. Destek konuşması
 * KOPYALANABİLİR referans kodu + zaman damgası ile yürür; yığın izi / SQL / dosya yolu / sunucu
 * adı HİÇ gösterilmez.
 */
export default function OperationsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Zaman damgası hata anında bir kez sabitlenir (her render'da kaymaz).
  const [occurredAt] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const refCode = error.digest ? `ERR-${error.digest.slice(0, 8)}` : 'ERR-yok';
  const stamp = occurredAt.toLocaleString('tr-TR');

  useEffect(() => {
    // Hata izleme servisi bağlanınca buraya gönderilir (referans kodu = digest ile ilişkilendirilir).
    console.error(error);
  }, [error]);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(`${refCode} · ${stamp}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // pano erişimi yoksa sessiz geç — kod ekranda zaten görünür
    }
  }

  return (
    <>
      {/* Üst bar — yüklenemeyen durum rozeti */}
      <div className="flex items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="font-ops-display text-[17px] font-semibold text-ops-ink">Beklenmeyen hata</span>
        <span className="flex items-center gap-1.5 rounded-md bg-ops-red-bg px-2.5 py-1 font-ops-display text-[10.5px] font-semibold text-ops-red">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c2571f]" />
          Yüklenemedi
        </span>
      </div>

      <ErrorState
        tone="danger"
        icon={<AlertIcon />}
        title="Bu ekran şu an yüklenemedi"
        description="Sunucu tarafında beklenmeyen bir hata oluştu. Yeniden deneyin; sürerse referans kodunu ileterek bildirin."
      >
        {/* Referans kartı — kopyalanabilir kod + zaman damgası */}
        <div className="mt-0.5 flex items-center gap-2 rounded-lg border border-ops-line bg-ops-subtle py-2 pl-3.5 pr-2">
          <div className="flex flex-col items-start gap-px">
            <span className="font-ops-display text-[10px] font-medium uppercase tracking-[0.06em] text-ops-muted">Referans</span>
            <span className="font-ops-mono text-[13px] text-ops-ink">{refCode}</span>
          </div>
          <span className="h-[26px] w-px bg-ops-line-strong" />
          <span className="font-ops-mono text-[11.5px] text-ops-body">{stamp}</span>
          <Button variant="secondary" size="sm" onClick={copyReference} className="gap-1.5">
            <CopyIcon />
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </Button>
        </div>

        {/* Kayıt güvencesi — mükerrer kayıt korkusunu bitirir */}
        <div className="max-w-[520px] rounded-[9px] border border-[#e2c4c0] bg-ops-red-bg px-3.5 py-2.5 text-left font-ops-body text-xs leading-relaxed text-[#8f3a33]">
          Kaydedilmiş veriler etkilenmedi. Bu ekranda henüz kaydetmediğiniz değişiklik varsa yeniden girilmesi gerekir —
          yeniden denemek mükerrer kayıt oluşturmaz.
        </div>

        <div className="mt-0.5 flex gap-2">
          <Button variant="primary" onClick={reset}>
            Yeniden dene
          </Button>
          <Link href="/operations" className={buttonClass({ variant: 'secondary' })}>
            Panele dön
          </Link>
        </div>
      </ErrorState>
    </>
  );
}
