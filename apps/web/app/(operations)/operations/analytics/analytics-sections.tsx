'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import type { AnalyticsSearchSignal, CustomerSegment, StoredAnalyticsInsight } from '@lezzet/types';
import type { CustomerSegmentRow, ProductInterestRow, TrafficSourceRow } from '@/lib/analytics/read';
import { ZERO_RESULT_LABEL } from './analytics-labels';
import { decimal, money, num, percent, shortDate } from '@/components/operation/ui/format';
import { WAREHOUSES_PATH } from '../warehouses/warehouses-url';
import type { BlockView, CampaignRowView, ConsentCountView, FunnelStepView, HeatRowView, MetricView, SeriesPointView } from './analytics-types';

// Analitik tezgâhının blokları (`Operasyon - Analitik.dc.html`). Her blok ÇİZİMDEKİ sırayla ve
// ölçüyle; sapmalar künyelerinde gerekçeli.
//
// Ortak iskelet `BlockShell`: başlık + gövde ya da veri hâli cümlesi. Her blok kendi boş hâlini
// yazsaydı, on bir blokta on bir farklı "veri yok" tonu çıkardı — oysa çizimin sözleşmesi bunun
// tersini istiyor: *"her blok 'veri birikiyor' halini GÜVEN VEREREK anlatır."*

/**
 * **`warming` ile `absent` ekranda AYRI görünür ve bu ekranın en önemli dürüstlüğü.**
 *
 * İkisi de boş bir kutudur ama biri "bekle, doluyor", öteki "bekleme, bu sayı bugün hiç
 * hesaplanmıyor" der. Tek bir "veri yok" hâline indirilseydi yönetici hiç dolmayacak bir bloğun
 * dolmasını beklerdi — ve beklediği sürece ekrana güvenmeyi bırakırdı.
 */
export function BlockShell({
  title,
  hint,
  block,
  action,
  children,
}: {
  title: string;
  hint?: string;
  block: Pick<BlockView<unknown>, 'state' | 'note'>;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-card px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">
          {title}
          {hint ? <span className="ml-2 font-ops-body text-ops-xs font-normal text-ops-muted">{hint}</span> : null}
        </span>
        {block.state === 'ready' ? action : null}
      </div>
      {block.state === 'ready' ? (
        children
      ) : (
        <div className="flex flex-col gap-1.5 rounded-ops-card border border-dashed border-ops-line-strong px-4 py-5">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-body">
            {block.state === 'warming' ? 'Veri birikiyor' : 'Bu sayı henüz hesaplanmıyor'}
          </span>
          <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">{block.note}</span>
        </div>
      )}
    </section>
  );
}

/**
 * AI içgörü şeridi — çizimde sol kenarında olive çizgi olan, kutusuz bir blok.
 *
 * **Anlatı TARİHİYLE gösterilir.** Üreten haftalık bir iş; tarihsiz basılsaydı iş bir hafta
 * koşmadığında geçen haftanın anlatısı BU haftanınmış gibi okunurdu ve kimse fark etmezdi
 * (kapının kendi künyesi de bunu söylüyor).
 *
 * **Bulgular üç tonlu ama renk YALNIZ işaret çubuğunda:** metnin kendisini renklendirmek beş
 * satırlık bir listeyi okunmaz kılardı; okuyanın sorusu "hangisi kötü", "her cümle ne renk" değil.
 */
export function InsightBar({ block }: { block: BlockView<StoredAnalyticsInsight | null> }) {
  const insight = block.data;
  return (
    <div className="flex flex-col gap-2 border-l-2 border-ops-olive py-1 pl-4">
      <span className="flex flex-wrap items-baseline gap-2 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.14em] text-ops-olive">
        Özet · söyler, karar sizin
        {insight ? (
          <span className="font-ops-mono font-normal normal-case tracking-normal text-ops-faint">
            {shortDate(insight.period.from)} – {shortDate(insight.period.to)}
          </span>
        ) : null}
      </span>
      {!insight ? (
        <span className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">{block.note}</span>
      ) : (
        <>
          <span className="font-ops-body text-ops-sm leading-relaxed text-ops-body">{insight.headline}</span>
          {insight.findings.length > 0 ? (
            <ul className="flex list-none flex-col gap-1.5 p-0">
              {insight.findings.map((f) => (
                <li key={f.title} className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${FINDING_DOT[f.tone]}`} aria-hidden />
                  <span className="font-ops-body text-ops-xs leading-relaxed text-ops-body">
                    <span className="font-semibold text-ops-ink">{f.title}</span> — {f.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Öneri BOŞ OLABİLİR ve o hâlde hiç çizilmez: her hafta bir öneri üretmeye zorlanan model
              veri yokken de bir şey uydurur (kapının kendi kararı) — uydurma bir cümleyi "önerilen
              adım" diye göstermek onu bir aksiyona çevirirdi. */}
          {insight.nextStep ? (
            <span className="font-ops-body text-ops-xs leading-relaxed text-ops-olive-dark">
              <span className="font-semibold">Önerilen adım:</span> {insight.nextStep}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

const FINDING_DOT = { good: 'bg-ops-olive', watch: 'bg-ops-amber', bad: 'bg-ops-red' } as const;

const DELTA_TONE = {
  olive: 'text-ops-olive-dark',
  red: 'text-ops-red',
  neutral: 'text-ops-muted',
  amber: 'text-ops-amber',
  blue: 'text-ops-blue',
  slate: 'text-ops-slate',
  violet: 'text-ops-violet',
} as const;

/**
 * Hero bandı — çizim: ilk ölçü geniş ve zeminli, kalan üçü yanında eşit sütunlarda.
 *
 * **Ölçülemeyen değer `—` çizilir, `0` değil** (CLAUDE.md §1). Gerekçe ölçünün altında küçük
 * yazıyla durur: yöneticinin "ciro sıfır mı, ölçüm mü yok" sorusunu ekranın kendisi cevaplamalı.
 */
export function HeroBand({
  main,
  rest,
  split,
  stacked = false,
}: {
  main: MetricView;
  rest: MetricView[];
  /** B2C/B2B ciro şeridi (çizim) — yalnız Ticaret modunda ve ciro ölçülüyorsa. */
  split?: { b2cCents: number; b2bCents: number } | null;
  stacked?: boolean;
}) {
  const splitTotal = split ? split.b2cCents + split.b2bCents : 0;
  return (
    <div
      className={`grid overflow-hidden rounded-ops-card border border-ops-line ${stacked ? 'grid-cols-1' : 'grid-cols-[1.5fr_1fr_1fr_1fr]'}`}
    >
      <div className={`flex flex-col gap-2 bg-ops-subtle px-5 py-4 ${stacked ? 'border-b border-ops-line' : 'border-r border-ops-line'}`}>
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.1em] text-ops-body">{main.label}</span>
        <div className="flex items-baseline gap-2.5">
          <span className="font-ops-mono text-ops-hero tracking-tight text-ops-ink">{main.value ?? '—'}</span>
          {main.delta ? <span className={`font-ops-mono text-ops-xs font-semibold ${DELTA_TONE[main.delta.tone]}`}>{main.delta.text}</span> : null}
        </div>
        {main.reason ? <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">{main.reason}</span> : null}
        {/* B2C/B2B şeridi — çizimde hero'nun ilk hücresinde. Toplam SIFIRKEN çizilmiyor: iki sıfır
            arasında bir oran yok ve boş bir çubuk "yarı yarıya" gibi okunurdu. */}
        {split && splitTotal > 0 ? (
          <div className="mt-0.5 flex flex-col gap-1.5">
            <div className="flex h-2 overflow-hidden rounded-sm">
              <span className="bg-ops-olive" style={{ width: `${((split.b2cCents / splitTotal) * 100).toFixed(1)}%` }} />
              <span className="flex-1 bg-ops-amber" />
            </div>
            <div className="flex justify-between font-ops-mono text-ops-micro">
              <span className="text-ops-olive-dark">B2C {money(split.b2cCents)}</span>
              <span className="text-ops-amber">B2B {money(split.b2bCents)}</span>
            </div>
          </div>
        ) : null}
      </div>
      {rest.map((m) => (
        <div
          key={m.label}
          className={`flex flex-col gap-1.5 px-5 py-4 ${stacked ? 'border-b border-ops-line last:border-b-0' : 'border-r border-ops-line last:border-r-0'}`}
        >
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">{m.label}</span>
          <span className="font-ops-mono text-ops-title text-ops-ink">{m.value ?? '—'}</span>
          {m.delta ? (
            <span className={`font-ops-mono text-ops-micro font-medium ${DELTA_TONE[m.delta.tone]}`}>{m.delta.text}</span>
          ) : m.reason ? (
            <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">{m.reason}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Zaman serisi — bu dönem dolu çizgi, önceki dönem kesikli hayalet (çizim: kıyas omurgası).
 *
 * SVG `preserveAspectRatio="none"` ile geriliyor: nokta sayısı döneme göre değişiyor (7/30/90) ve
 * grafiğin genişliği kutunun genişliği. Çizgi kalınlığı `vector-effect` ile korunuyor, yoksa
 * gerilme kalınlığı da gererdi.
 */
export function SeriesChart({ points }: { points: SeriesPointView[] }) {
  /**
   * **Tek noktalı seri ÇİZİLMEZ, söylenir.** `polyline` iki nokta ister; bir noktayla boş bir
   * kutu çizilir ve o kutu "veri yok" gibi okunur — oysa veri VAR, eğilim yok. Çizimin kendi
   * ilk-gün hâli de tam olarak bunu diyor: *"grafik ilk haftadan sonra dolmaya başlar"*.
   */
  if (points.length < 2) {
    return (
      <div className="flex h-[150px] flex-col items-center justify-center gap-1.5 rounded-ops-card border border-dashed border-ops-line-strong">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-body">Eğilim için en az iki gün gerek</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {points.length === 0 ? 'Bu dönemde kayıt yok.' : `Şu an tek gün var (${points[0]!.day}) — grafik ikinci günle birlikte çizilir.`}
        </span>
      </div>
    );
  }

  const w = 700;
  const h = 150;
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.prev ?? 0)));
  const x = (i: number) => (points.length < 2 ? 0 : (i / (points.length - 1)) * w);
  const y = (v: number) => 14 + (1 - v / max) * (h - 32);
  const line = (get: (p: SeriesPointView) => number | null) =>
    points
      .map((p, i) => {
        const v = get(p);
        return v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter((s): s is string => s !== null)
      .join(' ');

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-[150px] w-full border-b border-ops-line">
        <polyline
          points={line((p) => p.prev)}
          fill="none"
          stroke="currentColor"
          className="text-ops-line-strong"
          strokeWidth={1.6}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <polyline
          points={line((p) => p.value)}
          fill="none"
          stroke="currentColor"
          className="text-ops-olive"
          strokeWidth={2.2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between font-ops-mono text-ops-micro text-ops-faint">
        <span>{points[0]?.day ?? ''}</span>
        <span>{points[points.length - 1]?.day ?? ''}</span>
      </div>
    </div>
  );
}

/** Seri açıklaması — iki çizginin ne olduğu (çizim başlığın sağında tutuyor). */
export function SeriesLegend() {
  return (
    <div className="flex items-center gap-4 font-ops-body text-ops-micro text-ops-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-ops-olive" />
        bu dönem
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-ops-line-strong" />
        önceki dönem
      </span>
    </div>
  );
}

export function FunnelRows({ steps }: { steps: FunnelStepView[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className={`w-[130px] flex-none font-ops-body text-ops-xs ${s.worst ? 'text-ops-red' : 'text-ops-body'}`}>{s.label}</span>
          <span className="h-4 flex-1 overflow-hidden rounded-sm bg-ops-subtle">
            <span className={`block h-full ${s.worst ? 'bg-ops-amber' : 'bg-ops-olive'}`} style={{ width: `${(s.share * 100).toFixed(1)}%` }} />
          </span>
          <span className="w-[52px] flex-none text-right font-ops-mono text-ops-xs text-ops-ink">{num(s.count)}</span>
          {/* İşaret ekranın işi: `drop` ham oran ve NEGATİF olabilir — adım büyümüş demektir
              (adımlar iç içe kümeler değil; tek ziyaret altı ürün kartı görebilir). Bir tur burada
              koşulsuz `−` basılıyordu ve büyüyen adım "−%-300" diye çıkıyordu. */}
          <span
            className={`w-[62px] flex-none text-right font-ops-mono text-ops-micro ${
              s.drop === null || s.drop <= 0 ? 'text-ops-faint' : s.worst ? 'text-ops-red' : 'text-ops-muted'
            }`}
          >
            {s.drop === null ? '' : s.drop > 0 ? `−${percent(s.drop * 100)}` : `+${percent(-s.drop * 100)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Isı haritası — gün × saat. Yoğunluk OPAKLIKLA anlatılıyor (renk skalası değil): tek renkli bir
 * ısı haritası karanlık modda da çalışır ve "hangi saat yoğun" sorusuna renk sözlüğü öğrenmeden
 * cevap verir.
 */
export function HeatGrid({ rows }: { rows: HeatRowView[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.hours));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex flex-none flex-col gap-1 pt-4">
          {rows.map((r) => (
            <span key={r.day} className="h-3.5 font-ops-mono text-ops-micro leading-[14px] text-ops-faint">
              {r.day}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex justify-between font-ops-mono text-ops-micro text-ops-faint">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          {rows.map((r) => (
            <div key={r.day} className="flex gap-[3px]">
              {r.hours.map((v, h) => (
                <span
                  key={h}
                  title={`${r.day} ${String(h).padStart(2, '0')}:00 · ${num(v)}`}
                  className="h-3.5 flex-1 rounded-sm bg-ops-olive"
                  style={{ opacity: v === 0 ? 0.08 : 0.2 + (v / max) * 0.8 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Kampanya getirisi. Ciro sütunu bugün boş ve **bunun sebebi satırda yazılı** — boş bir sütun
 * "bu kampanya satış getirmedi" diye okunursa kapatılacak kampanya yanlış seçilir.
 */
export function CampaignTable({ rows }: { rows: CampaignRowView[] }) {
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_88px_88px_64px] gap-x-3 border-b border-ops-line-soft pb-2 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-muted">
        <span>Kampanya</span>
        <span className="text-right">Gider</span>
        <span className="text-right">Ciro</span>
        <span className="text-right">Getiri</span>
      </div>
      {rows.map((r) => (
        <div key={r.campaign ?? '—'} className="grid grid-cols-[1fr_88px_88px_64px] items-baseline gap-x-3 border-b border-ops-line-soft py-2 last:border-b-0">
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate font-ops-body text-ops-xs text-ops-ink">
              {r.campaign ?? <span className="text-ops-muted">etiketsiz</span>}
            </span>
            {/* Yeni müşteri sayısı satırın ALTINDA ve küçük: bir sütun değil, ciroyu okumanın
                anahtarı. Kampanya kapanmış olsa bile cirosu sürer (ilk temas atfı); "kaç yeni
                müşteri getirdi" o sürmenin hâlâ canlı mı yoksa miras mı olduğunu söyler. */}
            <span className="font-ops-body text-ops-micro text-ops-faint">
              {r.orderCount > 0 ? `${num(r.orderCount)} sipariş · ${num(r.newCustomerCount)} yeni müşteri` : 'bu dönemde sipariş yok'}
            </span>
          </span>
          <span className="text-right font-ops-mono text-ops-xs text-ops-ink">{money(r.spendCents)}</span>
          <span className="text-right font-ops-mono text-ops-xs text-ops-ink">{money(r.revenueCents)}</span>
          {/* Gider YOKKEN getiri `—`: bölme tanımsız ve "sonsuz getiri" bir bilgi değildir. */}
          <span
            className={`text-right font-ops-mono text-ops-xs font-semibold ${
              r.roas === null ? 'text-ops-muted' : r.roas >= 1 ? 'text-ops-olive-dark' : 'text-ops-red'
            }`}
          >
            {r.roas === null ? '—' : `${decimal(r.roas, 1)}×`}
          </span>
        </div>
      ))}
      <span className="pt-2 font-ops-body text-ops-micro leading-relaxed text-ops-muted">
        Gider Para ekranında kampanya etiketiyle girilir; etiketsiz reklam gideri son satırda toplanır.{' '}
        <span className="text-ops-body">İki sütun aynı şeyi ölçmüyor:</span> gider DÖNEMİN gideridir, ciro ise o
        kampanyanın kazandırdığı müşterilerin bu dönemdeki siparişleridir — tekrar siparişler dâhil. Yeni bir kampanyada
        ciro geç görünür, kapanmış bir kampanyada gider bittiği hâlde ciro sürer.
      </span>
    </div>
  );
}

/**
 * Pazarlama izni sayaçları — `ANALYTICS §6`: analitik **kaç** der, Müşteriler **kim** der.
 *
 * Kart bir köprüdür, bir liste değil: kişi bazlı gezinme ekranı yoktur ve bu ekranda kişi
 * gösterilmez. Sayı ile listenin aynı ölçütten çıkması arka uçta garanti (`consentFilter`).
 */
export function ConsentCards({ rows, stacked = false }: { rows: ConsentCountView[]; stacked?: boolean }) {
  return (
    <div className={`grid gap-2.5 ${stacked ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {rows.map((r) => (
        <Link
          key={r.channel}
          href={r.href}
          className="flex cursor-pointer flex-col gap-1 rounded-ops-card border border-ops-line px-3.5 py-3 no-underline transition-colors hover:border-ops-olive-line hover:bg-ops-olive-bg"
        >
          <span className="font-ops-display text-ops-xs font-semibold text-ops-body">{r.label}</span>
          <span className="font-ops-mono text-ops-section text-ops-ink">{num(r.count)}</span>
          <span className="font-ops-body text-ops-micro font-semibold text-ops-olive-dark">Müşterilerde aç →</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Bölge dışı talep — **tablo burada DEĞİL, Depolar'da** (kullanıcı kararı 04.08, `ANALYTICS §6`:
 * karar orada veriliyor). Çizim bu tabloyu analitiğin altında gösteriyordu; karar onu taşıdı ve
 * burada yalnız işaret + köprü kaldı. İki ekranda iki tablo, aynı soruya iki cevap demekti.
 */
export function ZoneDemandBridge() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-ops-card border border-ops-line bg-ops-subtle px-5 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 font-ops-display text-ops-base font-semibold text-ops-ink">
          Bölge dışı talep — posta kodları
          <Badge tone="slate">Depolar&apos;da</Badge>
        </span>
        <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
          Hangi posta kodunun kaç kez sorulduğu ve kaç kişinin haber beklediği, bölgenin tanımlandığı ekranda durur —
          karar orada veriliyor.
        </span>
      </div>
      <Link
        href={WAREHOUSES_PATH}
        className="flex-none cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-olive-dark underline-offset-2 hover:underline"
      >
        Depolar&apos;a git →
      </Link>
    </section>
  );
}

/**
 * Trafik kaynağı — oturum sayısı ve oturum başına dönüşüm.
 *
 * **`source === null` DOĞRUDAN trafiktir, "bilinmiyor" değil:** ziyaretçi adresi elle yazdı ya da
 * yönlendiren gönderilmedi. "Ölçülemedi" diye yazsaydık çoğu kurulumun en kalabalık kovasını bir
 * eksiklik gibi okuturduk.
 */
export function SourceRows({ rows }: { rows: TrafficSourceRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sessionCount));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={`${r.source ?? ''}|${r.campaign ?? ''}`} className="flex items-center gap-3">
          <span className="w-[120px] flex-none truncate font-ops-body text-ops-xs text-ops-body" title={r.campaign ?? undefined}>
            {r.source ?? 'doğrudan'}
            {r.campaign ? <span className="text-ops-faint"> · {r.campaign}</span> : null}
          </span>
          <span className="h-3.5 flex-1 overflow-hidden rounded-sm bg-ops-subtle">
            <span className="block h-full bg-ops-olive" style={{ width: `${((r.sessionCount / max) * 100).toFixed(1)}%` }} />
          </span>
          <span className="w-[52px] flex-none text-right font-ops-mono text-ops-xs text-ops-ink">{num(r.sessionCount)}</span>
          <span className="w-[56px] flex-none text-right font-ops-mono text-ops-micro text-ops-muted">
            {r.conversion === null ? '—' : percent(r.conversion * 100, 1)}
          </span>
        </div>
      ))}
      <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">
        Sağdaki oran oturum başına dönüşümdür. <strong>doğrudan</strong> = yönlendiren yok (adres elle yazıldı ya da
        gönderilmedi) — bir eksiklik değil, kendi başına bir kaynak.
      </span>
    </div>
  );
}

/**
 * Aranıp bulunamayan terimler. **İki kova AYRI raporlanır** (`ANALYTICS §4`): süzgeç boşluğu sık
 * bir ARAYÜZ sinyali, arama boşluğu seyrek bir ÇEŞİT sinyalidir — karışırsa sık olan seyreği boğar
 * ve "istenen ama bizde olmayan ürün" listesi hiç görünmez.
 */
export function ZeroSearchChips({ rows }: { rows: AnalyticsSearchSignal[] }) {
  return (
    <div className="flex flex-col gap-3">
      <ZeroSearchGroup
        title={ZERO_RESULT_LABEL.search}
        hint="çeşit sinyali — istenen ama satmadığımız ürünün en dürüst listesi"
        rows={rows.filter((r) => r.zeroResultKind === 'search')}
        tone="amber"
      />
      <ZeroSearchGroup
        title={ZERO_RESULT_LABEL.filter}
        hint="arayüz sinyali — kombinasyon çıkmaz sokağa götürüyor"
        rows={rows.filter((r) => r.zeroResultKind === 'filter')}
        tone="slate"
      />
    </div>
  );
}

function ZeroSearchGroup({ title, hint, rows, tone }: { title: string; hint: string; rows: AnalyticsSearchSignal[]; tone: 'amber' | 'slate' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-muted">
        {title} <span className="font-normal normal-case tracking-normal">— {hint}</span>
      </span>
      {rows.length === 0 ? (
        // Boş liste burada İYİ HABERDİR ve tasarım §4 bu hâli ayrıca istiyor.
        <span className="font-ops-body text-ops-xs text-ops-muted">Bu dönemde boş dönen arama yok.</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <span
              key={r.query}
              className={`rounded-ops-chip border px-2.5 py-1 font-ops-mono text-ops-micro ${
                tone === 'amber' ? 'border-ops-amber-line text-ops-amber' : 'border-ops-slate-line text-ops-slate'
              }`}
            >
              {r.query} · {num(r.searchCount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Çok bakılıp az alınan ürünler.
 *
 * **Oran `null` ise "hiç satılabilir hâlde görünmedi"** demek, sıfır değil — ve fark kararı TERS
 * çevirir: sıfır yazsaydık tükenmiş duran ürün listenin tepesine oturur, yönetici onu "kimse
 * almıyor" diye okur ve fiyata bakardı; oysa doğru aksiyon tedariktir.
 */
export function InterestRows({ rows }: { rows: ProductInterestRow[] }) {
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.productId} className="flex items-baseline justify-between gap-3 border-b border-ops-line-soft py-2 last:border-b-0">
          <span className="min-w-0 truncate font-ops-body text-ops-xs font-medium text-ops-ink">{r.name}</span>
          <span className="flex flex-none items-baseline gap-2 font-ops-mono text-ops-micro">
            <span className="text-ops-muted">
              {num(r.viewCount)} → {num(r.cartCount)}
            </span>
            {r.cartRate === null ? (
              <span className="text-ops-amber">satılabilir hâlde hiç görünmedi</span>
            ) : (
              <span className="text-ops-red">{percent(r.cartRate * 100, 1)}</span>
            )}
          </span>
        </div>
      ))}
      <span className="pt-2 font-ops-body text-ops-micro leading-relaxed text-ops-muted">
        Oran <strong>satılabilir</strong> görüntülemelere göredir: tükenmişken bakılan ürün paydayı şişirmez.
      </span>
    </div>
  );
}

const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  champion: 'İyi müşteriler',
  active: 'Aktif',
  new: 'Yeniler',
  dormant: 'Uyuyanlar',
  lost: 'Kayıp',
};

const SEGMENT_FG: Record<CustomerSegment, string> = {
  champion: 'text-ops-olive-dark',
  active: 'text-ops-olive',
  new: 'text-ops-blue',
  dormant: 'text-ops-amber',
  lost: 'text-ops-muted',
};

/**
 * Müşteri grupları — sayı var, **Müşteriler köprüsü YOK ve bu bilinçli.**
 *
 * `ANALYTICS §6` "analitik kaç der, Müşteriler kim der" diyor; ama Müşteriler ekranının daraltma
 * kümesinde segment yok (`CUSTOMER_SCOPES`). Çalışmayan bir köprü kurmaktansa sayıyı gösterip
 * bağı segment daraltması indiği gün açmak doğru: 404'e giden bir bağ, olmayan bir bağdan kötüdür.
 */
export function SegmentCards({ rows, stacked = false }: { rows: CustomerSegmentRow[]; stacked?: boolean }) {
  return (
    <div className={`grid gap-2.5 ${stacked ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {rows.map((r) => (
        <div key={r.segment} className="flex flex-col gap-1 rounded-ops-card border border-ops-line px-3.5 py-3">
          <span className={`font-ops-display text-ops-xs font-semibold ${SEGMENT_FG[r.segment]}`}>{SEGMENT_LABEL[r.segment]}</span>
          <span className="font-ops-mono text-ops-section text-ops-ink">{num(r.customerCount)}</span>
          <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">
            {r.customerCount === 0
              ? // Sıfır bir SONUÇTUR: "uyuyan müşteri yok" ile "hesaplanmıyor" ayrı cümlelerdir ve
                // kapı boş segmenti bilerek gönderiyor ki ekran ikisini ayırabilsin.
                'bu grupta müşteri yok'
              : `${num(r.orderCount)} sipariş · kişi başı ${money(r.avgRevenueCents)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Kaynağa göre tekrar sipariş — kampanya satırlarının BAŞKA bir okunuşu.
 *
 * Tablo "ne harcadım / ne kazandım" der; burada sorulan **"hangi kaynak sadık müşteri
 * getiriyor"**. Ölçüt müşteri başına sipariş: tek satışta ucuz olan bir kaynak uzun vadede en
 * değerli olabilir ve bu ayrım tam olarak bu blokta görünür.
 *
 * **Müşteri başına ciro DEĞİL sipariş sayısı sıralıyor:** ciro sepet büyüklüğüyle de artar, oysa
 * buradaki soru sadakattir — iki kez gelen müşteri, bir kez çok harcayandan başka bir şey söyler.
 */
export function CohortRows({ rows }: { rows: CampaignRowView[] }) {
  const withRate = rows
    .map((r) => ({ ...r, perCustomer: r.newCustomerCount > 0 ? r.orderCount / r.newCustomerCount : null }))
    .sort((a, b) => (b.perCustomer ?? 0) - (a.perCustomer ?? 0));
  const max = Math.max(1, ...withRate.map((r) => r.perCustomer ?? 0));

  return (
    <div className="flex flex-col gap-2.5">
      {withRate.map((r) => (
        <div key={r.campaign ?? '—'} className="flex items-center gap-3">
          <span className="w-[110px] flex-none truncate font-ops-body text-ops-xs text-ops-body">
            {r.campaign ?? <span className="text-ops-muted">etiketsiz</span>}
          </span>
          <span className="h-3.5 flex-1 overflow-hidden rounded-sm bg-ops-subtle">
            <span className="block h-full bg-ops-olive" style={{ width: `${(((r.perCustomer ?? 0) / max) * 100).toFixed(1)}%` }} />
          </span>
          <span className="w-[92px] flex-none text-right font-ops-mono text-ops-micro text-ops-ink">
            {r.perCustomer === null ? '—' : `${decimal(r.perCustomer, 1)} sipariş/kişi`}
          </span>
          <span className="w-[78px] flex-none text-right font-ops-mono text-ops-micro text-ops-muted">
            {money(r.newCustomerCount > 0 ? Math.round(r.revenueCents / r.newCustomerCount) : 0)}
          </span>
        </div>
      ))}
      <span className="font-ops-body text-ops-micro leading-relaxed text-ops-muted">
        Sıralama <strong>müşteri başına sipariş</strong>e göredir (sadakat), ciroya göre değil; sağdaki sayı o kaynağın
        kazandırdığı müşteri başına toplam cirodur.
      </span>
    </div>
  );
}
