import type { ReactNode } from 'react';

/*
  Native `Note`un web telefon ikizi: beş ton native'in beşidir ve açıklama `body-sm` (14) yazılır, çünkü müşterinin karar için
  okuduğu metin 14'ün altına inmez. Yuvalar kutunun içindedir, çünkü dışarı taşan eylemler kartları ekranın yarısına iter.
*/

type NoteTone = 'olive' | 'terracotta' | 'error' | 'warm' | 'warm-accent';

const TONE: Record<NoteTone, string> = {
  olive: 'border-olive-line bg-olive-bg text-olive-dark',
  terracotta: 'border-terracotta-line bg-terracotta-bg text-terracotta',
  error: 'border-terracotta-line bg-error-bg text-error',
  warm: 'border-transparent bg-sand-150 text-ink',
  // Vurgulu zemin, nötr yazı — bölge dışı bandı: zemin dikkat çeker ama cümle uyarı değil, adresin gerçeği.
  'warm-accent': 'border-terracotta-line bg-terracotta-bg text-ink',
};

interface NoteProps {
  description: string;
  tone?: NoteTone;
  /** İsteğe bağlı kalın ilk satır. */
  title?: string;
  /** Üst yuva — başlığın üstünde (bölge dışı bandın posta kodu hapı). */
  header?: ReactNode;
  /** Başlıkla açıklama arasındaki içerik — kalem listesi gibi. */
  children?: ReactNode;
  /** Eylem yuvası — metnin altında; genişliği içeriğin kendi kararı. */
  action?: ReactNode;
}

export function Note({ description, tone = 'warm', title, header, children, action }: NoteProps) {
  return (
    <div className={['flex flex-col gap-3 rounded-control border p-3.5', TONE[tone]].join(' ')}>
      {header !== undefined && <div className="flex items-start">{header}</div>}
      <div role={tone === 'error' ? 'alert' : undefined} className="flex flex-col gap-1">
        {title !== undefined && <p className="font-sans text-note font-bold">{title}</p>}
        {children}
        <p className="font-sans text-body-sm leading-[1.6]">{description}</p>
      </div>
      {action !== undefined && <div className="flex flex-col items-start gap-2.5">{action}</div>}
    </div>
  );
}
