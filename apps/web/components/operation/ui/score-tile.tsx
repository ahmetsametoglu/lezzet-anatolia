import Link from 'next/link';

/**
 * **Karne kutusu** — operasyonun "bir sayı + o sayının ne demek olduğu" birimi.
 *
 * ── SÖZLEŞME ────────────────────────────────────────────────────────────────
 * Dört parçası var ve dördü de zorunlu bir işi görüyor:
 * - **etiket** — küçük, büyük harf: neyi saydığı
 * - **değer** — iri mono: sayının kendisi, bir bakışta okunur
 * - **not** — sayının hangi soruyu yanıtladığı. `Metric`ten ayrıldığı yer burası: nottan yoksun bir
 *   sayı, okuyanın kafasında kendi hikâyesini kurar
 * - **ton** — kırmızı/amber bir UYARIDIR, dekorasyon değil
 *
 * `href` verilen kutu bir **KAPIDIR** ve tıklanır (Depolar karnesindeki her sayı Stok'a o depo
 * bağlamıyla gider); verilmeyen yalnız bir ölçüdür. Kapısız bırakmak bilinçli olabilir: gösterilecek
 * bir listesi olmayan sayıyı tıklatmak, boş bir ekrana götürmektir.
 *
 * ── NEDEN ORTAK YERDE (19.32) ───────────────────────────────────────────────
 * Depolar sayfasının `Scorecard`'ının iç parçasıydı. İkinci tüketici Hazırlık'ın karşılama ekranı
 * oldu — orada da soru aynı: "bu depo bugün nasıl duruyor?" İkinci bir kopya yazılsaydı iki ekran
 * aynı sayıyı farklı boyda ve farklı tonda gösterirdi, ve "amber" bir ekranda uyarı ötekinde
 * dekorasyon olurdu (`CLAUDE.md §1`).
 *
 * ── `Metric` VE `InlineMetric` İLE FARKI ────────────────────────────────────
 * `Metric` bir kararın YANINDAKİ tek sayıdır (maliyet, marj) — notu yok, kapısı yok, değeri daha
 * küçük kademede. `InlineMetric` bir kutunun İÇERİĞİDİR, kendi çerçevesi yoktur. Bu ise bir
 * KARNENİN birimi: yan yana dizilir, tıklanabilir, ve her biri kendi cümlesini taşır.
 */
/**
 * Kutu tonları — anlamları `tone.ts` sözlüğünden gelir, burada yeniden TANIMLANMAZ:
 * `olive`=yolunda · `amber`=dikkat/karar · `red`=hata/gecikme · `blue`=bilgi/aday · `slate`=nötr kayıt.
 *
 * Ton verilmeyen kutu nötrdür ve bu bir DEĞER yargısıdır: **sıfırın tonu olmaz.** Sayısı sıfır olan
 * bir kutuyu renklendirmek, olmayan bir işi varmış gibi göstermenin sessiz yoludur — renk o zaman
 * anlamını yitirir ve dekorasyona döner (`CLAUDE.md §3`).
 */
const TILE_TONE = {
  olive: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  blue: 'border-ops-blue-line bg-ops-blue-bg text-ops-blue-dark',
  slate: 'border-ops-slate-line bg-ops-slate-bg text-ops-slate-dark',
} as const;

/**
 * Kutunun alabileceği tonlar — `OpsTone`un bu komponentte karşılığı olan alt kümesi. `neutral`
 * burada bir değer değil, tonun YOKLUĞU (`undefined`); `violet` ise "makine konuştu" demek ve bir
 * karnede karşılığı yok.
 */
export type ScoreTone = keyof typeof TILE_TONE;

interface ScoreTileProps {
  label: string;
  value: string;
  /** Sayının hangi soruyu yanıtladığı — kutunun altında, tek satır. */
  note: string;
  /** Değerin yanındaki ikinci sayı (tutar, oran) — ölçülemediğinde yazılmaz. */
  aside?: string;
  tone?: ScoreTone;
  /** Verilirse kutu bir kapıdır. İçeride başka tıklanabilir bir öğe varsa VERİLMEZ (iç içe düğme). */
  href?: string;
}

export function ScoreTile({ label, value, note, aside, tone, href }: ScoreTileProps) {
  const toneCls = tone ? TILE_TONE[tone] : 'border-ops-line bg-ops-card text-ops-ink';
  const body = (
    <>
      <span className={['font-ops-display text-ops-micro font-medium uppercase tracking-wide', tone ? '' : 'text-ops-muted'].join(' ')}>
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-ops-mono text-ops-title font-medium">{value}</span>
        {aside ? <span className="font-ops-mono text-ops-sm">{aside}</span> : null}
      </span>
      <span className={['font-ops-body text-ops-xs', tone ? '' : 'text-ops-body'].join(' ')}>{note}</span>
    </>
  );
  const cls = ['flex flex-col gap-0.5 rounded-ops-card border px-3.5 py-3', toneCls].join(' ');
  return href ? (
    <Link href={href} className={`${cls} cursor-pointer transition-colors hover:border-ops-olive`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
