import type { ReactNode } from 'react';
import type { OpsTone } from './tone';

/**
 * Zaman çizelgesi — Komponent Envanteri O17. Bir kaydın başına ne geldiğini SIRAYLA anlatır:
 * nokta + etiket + kim + ne zaman. Sipariş geçiş kaydı, talep mesaj akışı, stok hareket geçmişi ve
 * para eşleşme geçmişi aynı iskeleti kullanır — dördü ayrı yazılsaydı "kim" sütunu birinde olur,
 * ötekinde unutulurdu.
 *
 * **ATLANAN ADIM SİLİNMEZ, sönük çizilir.** "Burada bir şey olmadı" ile "burası hiç yoktu" farklı
 * şeylerdir: ikincisi, kaydın neden hızlı kapandığını gizler. Atlanan adımın zamanı olmaz, etiketi
 * kalır.
 *
 * Salt sunum: hangi adımın atlandığı, kimin yaptığı ve sırası çağıranın kararıdır.
 */
export interface TimelineStep {
  key: string;
  label: string;
  /** Eylemi yapan; sistem olayında "Sistem". Boş geçilebilir. */
  who?: string;
  /** Gerçekleşme anı — biçimlenmiş metin. Atlanan adımda boş. */
  when?: string | null;
  /** Gerçekleşmedi: adım sönük ve içi boş noktayla çizilir. */
  skipped?: boolean;
  /**
   * **Şu an buradayız.** Nokta halkalı çizilir — kaydın nerede durduğunu, listeyi baştan okumadan
   * söyler. Kapanmış kayıtta hiçbir adım güncel değildir (geçmişin "şu anı" olmaz).
   */
  current?: boolean;
  tone?: OpsTone;
  /** Adımın altına düşen açıklama (sebep, not). */
  note?: ReactNode;
}

interface TimelineProps {
  steps: TimelineStep[];
  className?: string;
}

/** Etiketin rengi tonu izler: sapan adım (uyarı/iptal) sırayı okurken kendini belli etmeli. */
const LABEL: Record<OpsTone, string> = {
  neutral: 'text-ops-ink',
  olive: 'text-ops-ink',
  amber: 'text-ops-amber-dark',
  red: 'text-ops-red',
  blue: 'text-ops-blue',
  slate: 'text-ops-slate',
};

const DOT: Record<OpsTone, string> = {
  neutral: 'bg-ops-faint',
  olive: 'bg-ops-olive',
  amber: 'bg-ops-amber-dot',
  red: 'bg-ops-red-dot',
  blue: 'bg-ops-blue',
  slate: 'bg-ops-slate',
};

export function Timeline({ steps, className }: TimelineProps) {
  return (
    <div className={['flex flex-col', className].filter(Boolean).join(' ')}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <div key={step.key} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3">
            <div className="flex flex-col items-center">
              <span
                className={[
                  'mt-[5px] h-2.5 w-2.5 flex-none rounded-full',
                  step.skipped ? 'border-2 border-ops-line-strong bg-ops-card' : DOT[step.tone ?? 'olive'],
                  step.current && !step.skipped ? 'ring-4 ring-ops-amber-bg' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              {/* Son adımdan sonra ray çizilmez: çizgi "devamı var" demektir. */}
              {last ? null : <span className="min-h-3.5 w-px flex-1 bg-ops-line" />}
            </div>
            <div className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 ${last ? '' : 'pb-3'}`}>
              {/* Atlanan adım yalnız SOLMAZ, yazı ailesi de değişir: gerçekleşmiş adımlar başlık
                  fontuyla dizilir, atlanan gövde fontuyla — göz sırayı okurken hangisinin olay
                  olduğunu renkten önce biçimden anlar (tasarım). */}
              <span
                className={
                  step.skipped
                    ? 'font-ops-body text-ops-sm text-ops-faint'
                    : `font-ops-display text-ops-sm font-semibold ${LABEL[step.tone ?? 'olive']}`
                }
              >
                {step.label}
              </span>
              {step.who ? <span className="font-ops-body text-ops-xs text-ops-muted">{step.who}</span> : null}
              {step.when ? (
                <span className="ml-auto font-ops-mono text-ops-micro text-ops-muted">{step.when}</span>
              ) : (
                <span className="ml-auto font-ops-body text-ops-micro text-ops-faint">atlandı</span>
              )}
              {step.note ? (
                <span className="w-full font-ops-body text-ops-xs leading-[1.5] text-ops-muted">{step.note}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
