'use client';

import { Chip } from '@/components/operation/ui/chip';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { PageHeader } from '@/components/operation/ui/page-header';
import {
  BlockShell,
  CampaignTable,
  CohortRows,
  ConsentCards,
  FunnelRows,
  HeatGrid,
  HeroBand,
  InsightBar,
  InterestRows,
  SegmentCards,
  SeriesChart,
  SeriesLegend,
  SourceRows,
  ZeroSearchChips,
  ZoneDemandBridge,
} from './analytics-sections';
import { CHANNEL_LABEL, CHANNEL_ORDER, MODE_LABEL } from './analytics-labels';
import { ANALYTICS_MODES, ANALYTICS_PERIODS, PERIOD_LABEL } from './analytics-url';
import type { AnalyticsViewProps } from './analytics-types';

// Analitik — web. Çizim (`Operasyon - Analitik.dc.html`) tek bir dikey akış: kontrol barı → kırılım
// şeridi → içgörü → hero bandı → seri → (huni | kaynak) → (ısı | ROAS) → (kohort | gruplar) →
// (arama | ilgi). Izgara oranları çizimden birebir (1.2/1 · 1/1 · 1/1.1 · 1/1).
//
// ── ÇİZİMDEKİ "DOLU / İLK GÜN" ANAHTARI KODLANMADI ───────────────────────────
// O bir DEMO kontrolüdür, ekranın kontrolü değil: çizimin kendi üst yazısı "veri halini üstten
// değiştirebilirsiniz" diyor ve tezgâh sözleşmesi ilk-gün hâlini bir DURUM olarak tanımlıyor
// ("uydurma rakam göstermez"). Gerçek ekranda yönetici veri hâlini seçemez — veriden okur.
// Ticaret/Trafik ise gerçek bir mod anahtarıdır ve kodlandı.

export function AnalyticsDesktop({ data, urlState, onMode, onPeriod, onChannel, navPending }: AnalyticsViewProps) {
  const trafik = urlState.mode === 'trafik';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ops-card">
      <PageHeader title="Analitik" subtitle="Toplu · anonim · kişi takibi yok">
        <MultiToggle
          value={urlState.mode}
          onChange={onMode}
          options={ANALYTICS_MODES.map((m) => ({ key: m, label: MODE_LABEL[m] }))}
        />
        <MultiToggle
          value={urlState.period}
          onChange={onPeriod}
          options={ANALYTICS_PERIODS.map((p) => ({ key: p, label: PERIOD_LABEL[p] }))}
        />
        {/* Kıyas ekseni bir SEÇİM değil, sabit: çizimin sözleşmesi "her sayı önceki döneme göre
            değişimiyle gelir" diyor. Seçenek sunmak, kıyassız bir görünümü de mümkün kılardı. */}
        <span className="font-ops-mono text-ops-xs text-ops-muted">↳ önceki döneme göre</span>
      </PageHeader>

      {/* KIRILIM ŞERİDİ — çizimde ayrı bir zeminli sıra. "+ kaynak" ve "+ dil/ülke" çizimde KESİKLİ
          çerçeveli, yani "henüz yok" işareti; kesikli çizilip tıklanamaz bırakıyoruz — çalışmayan
          bir çipi normal göstermek, basınca bir şey olacağı sözü vermek olurdu. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft bg-ops-subtle px-6 py-2.5">
        <span className="mr-1 font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">Kırılım</span>
        <Chip active={urlState.channel === 'all'} onClick={() => onChannel('all')}>
          {CHANNEL_LABEL.all}
        </Chip>
        {CHANNEL_ORDER.map((c) => (
          <Chip key={c} tone={c === 'b2b' ? 'amber' : 'olive'} active={urlState.channel === c} onClick={() => onChannel(urlState.channel === c ? 'all' : c)}>
            {CHANNEL_LABEL[c]}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-ops-line" />
        <Chip dashed>+ kaynak</Chip>
        <Chip dashed>+ dil / ülke</Chip>
      </div>

      <div className={`flex flex-col gap-5 px-6 py-5 transition-opacity ${navPending ? 'opacity-60' : ''}`}>
        <InsightBar block={data.insight} />

        <HeroBand main={data.hero.main} rest={data.hero.rest} split={data.hero.split} />

        <BlockShell
          title={`${trafik ? 'Ziyaret' : 'Ciro'} · günlük`}
          block={data.series}
          action={<SeriesLegend />}
        >
          <SeriesChart points={data.series.data} />
        </BlockShell>

        <div className="grid grid-cols-[1.2fr_1fr] gap-4">
          <BlockShell title="Dönüşüm hunisi — nerede kaybediyorum" block={data.funnel}>
            <FunnelRows steps={data.funnel.data} />
          </BlockShell>
          <BlockShell title="Trafik kaynağı" block={data.sources}>
            <SourceRows rows={data.sources.data} />
          </BlockShell>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <BlockShell title="Yoğunluk — gün / saat" block={data.heat}>
            <HeatGrid rows={data.heat.data} />
          </BlockShell>
          <BlockShell title="Kampanya getirisi" block={data.campaigns}>
            <CampaignTable rows={data.campaigns.data} />
          </BlockShell>
        </div>

        <div className="grid grid-cols-[1fr_1.1fr] gap-4">
          <BlockShell title="Kaynağa göre tekrar sipariş" hint="— hangi kaynak sadık müşteri getiriyor" block={data.cohort}>
            <CohortRows rows={data.cohort.data} />
          </BlockShell>
          <BlockShell title="Müşteri grupları" hint="— siparişten türetilir" block={data.segments}>
            <SegmentCards rows={data.segments.data} />
          </BlockShell>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <BlockShell title="Aranıp bulunamayan" hint="— sıfır sonuç" block={data.zeroSearch}>
            <ZeroSearchChips rows={data.zeroSearch.data} />
          </BlockShell>
          <BlockShell title="Çok bakılıp az alınan" block={data.interest}>
            <InterestRows rows={data.interest.data} />
          </BlockShell>
        </div>

        {/* Çizimde OLMAYAN iki blok, ikisi de `ANALYTICS §6` kararının sonucu ve ikisi de birer
            KÖPRÜ: bu ekran "kaç" der, kararın verildiği ekran "kim/hangi kod" der. Sona konmaları
            bilinçli — tezgâhın kendi soruları bitince başka ekrana geçilen yer burası. */}
        <BlockShell title="Pazarlama izni" hint="— analitik kaç der, Müşteriler kim der" block={data.consent}>
          <ConsentCards rows={data.consent.data} />
        </BlockShell>

        <ZoneDemandBridge />
      </div>
    </div>
  );
}
