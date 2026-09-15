import type { ReactNode } from 'react';
import type { ConversationSource } from '@lezzet/types';

/*
  Kanalın İŞARETİ (15.38) — çizimin üç glifi (`Operasyon - Sosyal Mesajlar.dc.html`, `chIcon`). Renk
  `currentColor`dan: kuyruk noktasında kanalın marka rengi, seçili sekmede zeminin üstündeki yazı rengi.
  `WhatsAppIcon` bilerek kullanılmadı — kendi yeşiline kilitli, seçili sekmenin yeşil zemininde kaybolurdu.
*/
const GLYPHS: Record<ConversationSource, ReactNode> = {
  whatsapp: <path d="M21 11.5a8.38 8.38 0 0 1-11.6 7.7L3 21l1.9-6.4A8.5 8.5 0 1 1 21 11.5z" />,
  messenger: (
    <>
      <path d="M12 3c-4.97 0-9 3.7-9 8.27 0 2.6 1.3 4.9 3.35 6.43V21l3.06-1.68c.83.23 1.7.35 2.59.35 4.97 0 9-3.7 9-8.4S16.97 3 12 3z" />
      <path d="m7.6 13.9 2.9-3.1 2.2 1.7 2.1-2.4-2.9 3.1-2.2-1.7z" />
    </>
  ),
  instagram: (
    <>
      <rect x={3} y={3} width={18} height={18} rx={5} />
      <circle cx={12} cy={12} r={4.2} />
      <circle cx={17.2} cy={6.9} r={1} fill="currentColor" stroke="none" />
    </>
  ),
};

interface ChannelIconProps {
  source: ConversationSource;
  size?: number;
}

export function ChannelIcon({ source, size = 12 }: ChannelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none"
    >
      {GLYPHS[source]}
    </svg>
  );
}
