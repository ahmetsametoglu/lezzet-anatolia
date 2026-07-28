import type { ReactNode } from 'react';

/**
 * Müşteri "durum ekranı" gövdesi — simge + üst etiket + Lora başlık + açıklama + aksiyonlar.
 * Hata sayfaları (404/500) ve ileride boş-durum ekranları bu TEK bloğu paylaşır (yeni komponent
 * icat edilmez). Cihaz forku: masaüstünde daha büyük başlık/boşluk, mobilde sıkışık — `md:` yok.
 */
interface MessageScreenProps {
  device: 'mobile' | 'desktop';
  /** Emoji simge (müşteri evreni dekoratif emoji kullanır; operasyon çizgi SVG). */
  emoji: string;
  /** Küçük büyük-harf üst etiket ("404 · Sayfa bulunamadı"). */
  eyebrow: string;
  title: string;
  description: string;
  /** Birincil/ikincil butonlar (CTA satırı). */
  actions: ReactNode;
  /** Ek içerik — güvence şeridi, çipler vb. */
  children?: ReactNode;
}

export function MessageScreen({ device, emoji, eyebrow, title, description, actions, children }: MessageScreenProps) {
  const isMobile = device === 'mobile';
  return (
    <div
      className={[
        'flex flex-1 flex-col items-center gap-5 text-center',
        isMobile ? 'px-6 py-12' : 'px-12 py-20',
      ].join(' ')}
    >
      <span className={isMobile ? 'text-4xl' : 'text-[42px]'}>{emoji}</span>
      <div className="flex flex-col items-center gap-2.5">
        <span className="font-sans text-eyebrow uppercase text-muted">{eyebrow}</span>
        <h1
          className={[
            'max-w-[660px] text-balance font-serif font-semibold leading-tight text-ink',
            isMobile ? 'text-[27px]' : 'text-[40px]',
          ].join(' ')}
        >
          {title}
        </h1>
        <p className="max-w-[540px] text-pretty font-sans text-base leading-relaxed text-body">{description}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      {children}
    </div>
  );
}
