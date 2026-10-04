'use client';

interface MessageStampProps {
  text: string;
  shown: boolean;
  /** Müşterinin balonu sağda: saat dış köşede, sağda durur. */
  mine: boolean;
}

/**
 * Balonun üst kenarına oturan saat etiketi; konumu mutlak olduğu için açılıp kapanırken satırları oynatmaz. Fareli cihazda üstüne
 * gelince de görünür; ekran okuyucu saati balonun kendi metninden duyar.
 */
export function MessageStamp({ text, shown, mine }: MessageStampProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute top-0 -translate-y-1/2 whitespace-nowrap rounded-pill border border-sand-200 bg-card px-2 py-px font-sans text-micro leading-[1.4] text-sand-600 transition-opacity duration-200',
        mine ? 'right-3' : 'left-3',
        shown ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ].join(' ')}
    >
      {text}
    </span>
  );
}
