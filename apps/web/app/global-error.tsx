'use client';

import { useEffect } from 'react';
import { reportClientErrorAction } from '@/lib/observability/report-client-error';
import { Icon } from '@/components/customer/ui/icons';

/**
 * Kök layout'un yerine geçtiği için `globals.css` yüklü değildir, renkler satır içidir; yüzey bilinmediğinden metin nötr
 * Türkçedir. Bu sınır tetiklendiyse sitenin tamamı çökmüştür ve iz bırakmazsa ancak şikâyetle öğrenilir.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // Kaynak sabit, yığın izi gitmez (`OBSERVABILITY §5`); sorgu dizesi taşınmaz.
    void reportClientErrorAction({
      message: error.message,
      digest: error.digest ?? null,
      path: typeof window === 'undefined' ? null : window.location.pathname,
    });
  }, [error]);

  return (
    <html lang="tr">
      <body style={{ margin: 0, background: '#faf6ec', color: '#343b41', fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <span style={{ display: 'flex', color: '#5f7a2c' }}>
            <Icon name="warning" size={42} />
          </span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Beklenmeyen bir hata oluştu</h1>
          <p style={{ margin: 0, maxWidth: 460, fontSize: 15, lineHeight: 1.6, color: '#6d7261' }}>
            Sorun bizde, sizde değil. Birkaç saniye sonra yeniden deneyin.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: 'pointer',
              marginTop: 4,
              padding: '13px 26px',
              borderRadius: 26,
              border: 'none',
              background: '#5f7a2c',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Yeniden dene
          </button>
        </div>
      </body>
    </html>
  );
}
