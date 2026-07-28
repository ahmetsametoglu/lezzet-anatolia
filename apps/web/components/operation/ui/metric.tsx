/**
 * Ölçü kutusu — bir kararın yanındaki tek sayı (maliyet · marj · liste fiyatı).
 *
 * Fiyat diyaloğunun içinde yaşıyordu; özel fiyat diyaloğu da aynı üçlüyü gösterince ortak yere
 * taşındı. Kopyalansaydı iki diyalog aynı sayıyı farklı hizada/tonda gösterirdi ve "kırmızı"nın
 * anlamı ekrana göre değişirdi.
 *
 * TON ANLAM TAŞIR: kırmızı bir KAYIP uyarısıdır (maliyetin altı, hedefin altı) — dekoratif değil.
 */
interface MetricProps {
  label: string;
  value: string;
  /** Fareyle üzerinde beliren açıklama — sayının hangi soruyu yanıtladığı. */
  hint?: string;
  tone?: 'red';
}

export function Metric({ label, value, hint, tone }: MetricProps) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-ops-card border px-3 py-2.5 ${
        tone === 'red' ? 'border-ops-red-line bg-ops-red-bg' : 'border-ops-line bg-ops-white'
      }`}
      title={hint}
    >
      <span
        className={`font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] ${
          tone === 'red' ? 'text-ops-red' : 'text-ops-muted'
        }`}
      >
        {label}
      </span>
      <span className={`font-ops-mono text-ops-lead font-medium ${tone === 'red' ? 'text-ops-red' : 'text-ops-ink'}`}>
        {value}
      </span>
    </div>
  );
}
