import type { ReactNode } from 'react';
import type { OpsTone } from './tone';

/**
 * **YAZIŞMA panolarının ortak parçaları** (Talepler 16.3 · WhatsApp 15.5).
 *
 * İki ekran da aynı üç şeyi çiziyordu: dipten yukarı akan bir dizi, hizalı bir balon, ve balonun
 * üstünde kim/ne zaman künyesi. İki kopya bir gün ayrışır ve ayrıştığı gün biri künyeyi unutur —
 * yani personel makine cümlesini müşterinin cümlesi sanar (Talepler'in kendi dersi).
 *
 * **Balonun KUTUSU burada çizilmez, SINIFI verilir** (`bubbleClass`) ve bu bilinçli: Talepler'in
 * gövdesi çeviri anahtarını kutunun DIŞINDA taşımak zorunda (`TranslatedBody`), yani kutuyu
 * kendisi çizer. Kutuyu sahiplenen bir komponent o ekranı çatallamaya zorlardı. Aynı desen kitte
 * zaten var: `buttonClass` de sınıfı ihraç eder, kutuyu değil.
 */

/** Mesajın yönü — "ben mi yazdım" tek soru; iki ekranda iki farklı alandan türer. */
type MessageSide = 'in' | 'out';

/**
 * Balonun derisi — anlam rengi kitin sözlüğünden (`OpsTone`), ham renk değil.
 *
 * `neutral` gelen mesajdır (beyaz kutu, nötr çerçeve): müşterinin cümlesi bir DURUM söylemiyor.
 * Öteki tonlar giden mesajın kimliğini taşır — olive personel, violet makine.
 */
const SKIN: Record<OpsTone, string> = {
  neutral: 'border-ops-line bg-ops-white',
  olive: 'border-ops-olive-line bg-ops-olive-bg',
  amber: 'border-ops-amber-line bg-ops-amber-bg',
  red: 'border-ops-red-line bg-ops-red-bg',
  blue: 'border-ops-blue-line bg-ops-blue-bg',
  slate: 'border-ops-slate-line bg-ops-slate-bg',
  violet: 'border-ops-violet-line bg-ops-violet-bg',
};

export function bubbleClass(tone: OpsTone = 'neutral', extra?: string): string {
  return [
    'max-w-[78%] whitespace-pre-wrap rounded-ops-card border px-3 py-2 font-ops-body text-ops-sm leading-relaxed text-ops-strong',
    SKIN[tone],
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Tek mesajın satırı: künye ÜSTTE, gövde altta, ikisi de yöne göre hizalı.
 *
 * Künye satırı ekranın kararı (`Siz · 14:30` ya da `AI ajanı · 14:30 · otomatik çevrildi`), ama
 * YERİ ortak — balonun üstü. Altına koymak iki ekranda iki farklı okuma ritmi üretirdi.
 */
export function MessageRow({ side, meta, children }: { side: MessageSide; meta: ReactNode; children: ReactNode }) {
  const mine = side === 'out';
  return (
    <div className={['flex flex-col gap-1', mine ? 'items-end' : 'items-start'].join(' ')}>
      {meta ? <span className="flex items-center gap-1.5 px-1">{meta}</span> : null}
      {children}
    </div>
  );
}

/**
 * Mesaj dizisinin kaydırma kutusu — **kısa sohbet ALTA yaslanır** (`mt-auto`).
 *
 * Sohbetin okunacak yeri yazma kutusunun hemen üstüdür; yukarı yaslanan bir dizi son mesajı ekranın
 * öbür ucuna atardı. Sarmalayıcıya `justify-end` vermek yerine iç kabuğa `mt-auto`: taşan içerikte
 * `justify-end` kaydırma kutusunun TEPESİNİ kırpar ve eski mesajlara hiç ulaşılamaz.
 */
export function MessageThread({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={['flex min-h-0 flex-1 flex-col overflow-y-auto', className].filter(Boolean).join(' ')}>
      <div className="mt-auto flex flex-col gap-3">{children}</div>
    </div>
  );
}

/** Pano içi bölüm başlığı — küçük, büyük harf, aralıklı. İki ekranda da aynı markup'tı. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{children}</span>;
}
