'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonClass } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon, ChevronDownIcon, CopyIcon } from '@/components/operation/ui/icons';

/**
 * Operasyon 500 — segment içindeki beklenmeyen hataları yakalar (client zorunlu). AdminSidebar
 * korunur. Operatörün ilk sorusu "kaydım gitti mi?" → kayıt güvencesi zorunlu. Destek konuşması
 * KOPYALANABİLİR referans kodu + zaman damgası ile yürür.
 *
 * Hata mesajı referans kartıyla aynı dilde ikinci bir kartta, kendi kopyala butonuyla görünür.
 * Yığın izi o kartın içinde KAPALI bir blokta ve yalnız `development`'ta — üretimde operatöre
 * dosya yolu / iç yapı sızmaz; Next.js sunucu hatalarının mesajını zaten maskeler (yalnız digest
 * geçer), o durumda kart bunu açıkça söyleyen metni gösterir.
 */
export default function OperationsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Zaman damgası hata anında bir kez sabitlenir (her render'da kaymaz).
  const [occurredAt] = useState(() => new Date());
  // Hangi kartın kopyalandığı — iki kopyala butonu ayrı geri bildirim verir.
  const [copied, setCopied] = useState<'reference' | 'message' | null>(null);
  const refCode = error.digest ? `ERR-${error.digest.slice(0, 8)}` : 'ERR-yok';
  const stamp = occurredAt.toLocaleString('tr-TR');
  const message = error.message?.trim() || 'Hata mesajı iletilmedi (sunucu tarafında maskelendi).';
  // Yığın izi yalnız geliştirmede; üretimde operatöre dosya yolu / iç yapı sızmaz.
  const stack = process.env.NODE_ENV === 'development' ? error.stack?.trim() : undefined;

  useEffect(() => {
    // Hata izleme servisi bağlanınca buraya gönderilir (referans kodu = digest ile ilişkilendirilir).
    console.error(error);
  }, [error]);

  async function copy(key: 'reference' | 'message', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // pano erişimi yoksa sessiz geç — metin ekranda zaten görünür
    }
  }

  return (
    <>
      {/* Üst bar — yüklenemeyen durum rozeti */}
      <div className="flex items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="font-ops-display text-[17px] font-semibold text-ops-ink">Beklenmeyen hata</span>
        <span className="flex items-center gap-1.5 rounded-md bg-ops-red-bg px-2.5 py-1 font-ops-display text-[10.5px] font-semibold text-ops-red">
          <span className="h-1.5 w-1.5 rounded-full bg-ops-red-dot" />
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
          <Button variant="secondary" size="sm" onClick={() => copy('reference', `${refCode} · ${stamp}`)} className="gap-1.5">
            <CopyIcon />
            {copied === 'reference' ? 'Kopyalandı' : 'Kopyala'}
          </Button>
        </div>

        {/* Hata mesajı — referans kartıyla aynı dil: etiketli başlık + kendi kopyala butonu */}
        <div className="w-full max-w-[520px] overflow-hidden rounded-lg border border-ops-line bg-ops-subtle text-left">
          <div className="flex items-center justify-between gap-3 border-b border-ops-line py-1.5 pl-3.5 pr-2">
            <span className="font-ops-display text-[10px] font-medium uppercase tracking-[0.06em] text-ops-muted">Hata mesajı</span>
            {/* Yığın izi varsa o da kopyalanır — destek/geliştirici tek yapıştırmayla tam bağlamı alsın */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copy('message', stack ? `${message}\n\n${stack}` : message)}
              className="gap-1.5"
            >
              <CopyIcon />
              {copied === 'message' ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
          <p className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-3.5 py-2.5 font-ops-mono text-xs leading-relaxed text-ops-ink">
            {message}
          </p>
          {stack && (
            <details className="group border-t border-ops-line">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2 font-ops-display text-[11px] font-medium text-ops-muted outline-none transition-colors hover:text-ops-body focus-visible:text-ops-body [&::-webkit-details-marker]:hidden">
                <span className="transition-transform group-open:rotate-180">
                  <ChevronDownIcon />
                </span>
                Yığın izi
              </summary>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-t border-ops-line px-3.5 py-2.5 font-ops-mono text-[11px] leading-relaxed text-ops-muted">
                {stack}
              </pre>
            </details>
          )}
        </div>

        {/* Kayıt güvencesi — mükerrer kayıt korkusunu bitirir */}
        <div className="max-w-[520px] rounded-[9px] border border-ops-red-line bg-ops-red-bg px-3.5 py-2.5 text-left font-ops-body text-xs leading-relaxed text-ops-red-dark">
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
