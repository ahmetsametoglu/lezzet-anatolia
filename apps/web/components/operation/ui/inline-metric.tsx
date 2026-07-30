/**
 * Satır-içi ölçü — bir kutunun İÇİNDE yan yana duran etiket+değer çiftleri.
 *
 * `Metric`ten farkı: `Metric` kendi kenarlı KUTUSUDUR (tek başına duran bir sayı), bu ise bir kutunun
 * İÇERİĞİDİR — üç dört ölçü aynı çerçevenin altında toplanır. Üç yerde ayrı ayrı yazılmıştı (müşteri
 * önizlemesi, mobil karne, vade diyaloğu) ve üçünün yazı kademesi ayrışmıştı: aynı sayı üç ekranda üç
 * boyda görünüyordu (CLAUDE.md §1).
 *
 * Etiket GÖVDE yazısıyla ve CÜMLE düzeninde. Büyük harf + harf aralığı BÖLÜM etiketinin işaretidir
 * ("Son siparişler"); kutu içindeki ölçü onunla aynı sesle konuşmaz.
 *
 * TON ANLAM TAŞIR: kırmızı etiket "bu ölçü uyarı veriyor" der. Etiket ve değer AYRI tonlanmaz —
 * tasarımda kırmızı kutunun içinde gecikmeyi anlatan iki ölçü tamamen kırmızı, üçüncüsü (açık bakiye,
 * kendisi bir arıza değil) nötr kalıyor.
 */
interface InlineMetricProps {
  label: string;
  value: string;
  /** Fareyle üzerinde beliren açıklama — sayının hangi soruyu yanıtladığı, hangi pencereden geldiği. */
  hint?: string;
  tone?: 'red';
  /**
   * Değer kademesi. `sm` yoğun panelde (yan yana çok ölçü), `md` telefonda ve diyalogda — orada ölçü
   * ekranın kendisi kadar önemli, kararın hemen yanında duruyor.
   */
  size?: 'sm' | 'md';
}

export function InlineMetric({ label, value, hint, tone, size = 'sm' }: InlineMetricProps) {
  return (
    <div className="flex flex-col gap-px" title={hint}>
      <span className={`font-ops-body text-ops-micro ${tone === 'red' ? 'text-ops-red' : 'text-ops-muted'}`}>
        {label}
      </span>
      <span
        className={`font-ops-mono font-medium ${size === 'md' ? 'text-ops-base' : 'text-ops-sm'} ${
          tone === 'red' ? 'text-ops-red' : 'text-ops-ink'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
