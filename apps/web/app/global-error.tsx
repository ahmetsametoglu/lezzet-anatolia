'use client';

import { useEffect } from 'react';

/**
 * Kök son-çare hatası — yalnız kök layout'un KENDİSİ patlarsa devreye girer (nadir). Kök layout
 * yerine geçtiği için kendi `<html>/<body>`sini ve stilini taşır (globals'a güvenmez). Yüzey
 * ayrımı (müşteri/operasyon) burada bilinmez → nötr Türkçe. Normal 404/500'ler yüzeye özgü
 * not-found.tsx / error.tsx tarafından karşılanır; buraya düşülmez.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
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
          <span style={{ fontSize: 42 }}>🍳</span>
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
