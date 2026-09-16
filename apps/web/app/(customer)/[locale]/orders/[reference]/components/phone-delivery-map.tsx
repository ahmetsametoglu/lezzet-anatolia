/*
  CANLI TAKİP ŞERİDİ — kurye yoldayken sipariş detayının başında duran 195'lik şerit; native
  uygulamanın şeridiyle aynı geometri, renkler token'dan.

  Harita TEMSİLÎDİR, gerçek değil: elle çizilmiş yollar, bir nehir, kesikli rota, kuryenin konumu ve
  teslim iğnesi. Tahmini süre YAZILMAZ — kuryenin varış tahmini diye bir ölçümümüz yok, şerit yalnız
  "yolda" der.

  Çizim bir RESİMDİR: ekran okuyucuya üstündeki iki metin konuşur, SVG gizlidir.
*/

interface PhoneDeliveryMapProps {
  /** Sol üstteki künye ("Livreur en route") — çeviri çağıranda çözülür. */
  trackingLabel: string;
  /** Sağ alttaki künye ("Suivi en direct"). */
  liveLabel: string;
}

export function PhoneDeliveryMap({ trackingLabel, liveLabel }: PhoneDeliveryMapProps) {
  return (
    <div className="relative h-[195px] overflow-hidden rounded-card bg-olive-bg">
      <svg aria-hidden viewBox="0 0 340 195" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" fill="none">
        {/* Yollar — krem şeritler. */}
        <path d="M-10 45 H350" className="stroke-sand-50" strokeWidth={11} />
        <path d="M-10 110 H350" className="stroke-sand-50" strokeWidth={8} />
        <path d="M70 -10 V205" className="stroke-sand-50" strokeWidth={8} />
        <path d="M180 -10 V205" className="stroke-sand-50" strokeWidth={11} />
        <path d="M255 -10 L340 90" className="stroke-sand-50" strokeWidth={7} />
        {/* Nehir — native'in seçtiği nötr (paletin mavisi yok). */}
        <path d="M-10 170 C 90 140, 200 190, 350 145" className="stroke-neutral-400" strokeWidth={16} />
        {/* Kuryenin izlediği rota — kesikli zeytin. */}
        <path d="M55 160 C 100 130, 140 135, 185 100 S 255 62, 288 58" className="stroke-olive" strokeWidth={3.5} strokeDasharray="7 6" strokeLinecap="round" />
        {/* Kuryenin konumu: dolu nokta + sabit halka. */}
        <circle cx={150} cy={122} r={9} className="fill-terracotta stroke-sand-50" strokeWidth={3} />
        <circle cx={150} cy={122} r={18} className="stroke-terracotta" strokeWidth={2} opacity={0.5} />
        {/* Teslim iğnesi. */}
        <g transform="translate(288 58)">
          <path d="M0 0C0 0 -9 -8 -9 -14a9 9 0 1 1 18 0C9 -8 0 0 0 0z" className="fill-ink" />
          <circle cx={0} cy={-13.5} r={3.4} className="fill-sand-50" />
        </g>
      </svg>
      <span className="absolute top-3 left-3 rounded-badge bg-ink px-3 py-1.5 font-sans text-micro font-bold text-sand-50">{trackingLabel}</span>
      <span className="absolute right-3 bottom-3 rounded-badge bg-sand-50/80 px-2.5 py-1 font-sans text-eyebrow-xs font-semibold tracking-normal text-muted">
        {liveLabel}
      </span>
    </div>
  );
}
