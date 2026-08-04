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
  SourceRows,
  ZeroSearchChips,
  ZoneDemandBridge,
} from './analytics-sections';
import { CHANNEL_LABEL, CHANNEL_ORDER, MODE_LABEL } from './analytics-labels';
import { ANALYTICS_MODES, ANALYTICS_PERIODS, PERIOD_LABEL } from './analytics-url';
import type { AnalyticsViewProps } from './analytics-types';

// Analitik — mobil. Tasarım §7'nin kuralı: telefonda yapılan iş **günlük nabız** (ziyaret, sipariş,
// içgörü); derin inceleme masa işidir ama telefonda ERİŞİLEBİLİR kalmalı.
//
// Bu yüzden blok KÜMESİ daraltılmadı, yalnız düzen tek sütuna indi ve sıra nabza göre değişti:
// içgörü ve hero en üstte, tablolar altta. Blokları gizlemek, telefonda bakan yöneticiye eksik bir
// gerçek göstermek olurdu — çizimin de tersi (aynı tezgâh, başka yerleşim).
//
// İki blok telefonda bilinçle DARALTILDI ve ikisi de "erişilemez" değil "sığmıyor":
// zaman serisi başlığın altında kalıyor (nokta sayısı 90'a çıkabiliyor, 390px'te okunmaz) ve
// ısı haritası yatay kaydırma kutusunda — 24 sütun bir telefon ekranına gerçekten sığmıyor.

export function AnalyticsMobile({ data, urlState, onMode, onPeriod, onChannel, navPending }: AnalyticsViewProps) {
  const trafik = urlState.mode === 'trafik';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ops-card">
      <PageHeader title="Analitik" compact subtitle="Toplu · anonim" />

      <div className="flex flex-col gap-2 border-b border-ops-line-soft bg-ops-subtle px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <MultiToggle size="sm" value={urlState.mode} onChange={onMode} options={ANALYTICS_MODES.map((m) => ({ key: m, label: MODE_LABEL[m] }))} />
          <MultiToggle size="sm" value={urlState.period} onChange={onPeriod} options={ANALYTICS_PERIODS.map((p) => ({ key: p, label: PERIOD_LABEL[p] }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={urlState.channel === 'all'} onClick={() => onChannel('all')}>
            {CHANNEL_LABEL.all}
          </Chip>
          {CHANNEL_ORDER.map((c) => (
            <Chip key={c} tone={c === 'b2b' ? 'amber' : 'olive'} active={urlState.channel === c} onClick={() => onChannel(urlState.channel === c ? 'all' : c)}>
              {CHANNEL_LABEL[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div className={`flex flex-col gap-4 px-4 py-4 transition-opacity ${navPending ? 'opacity-60' : ''}`}>
        <InsightBar block={data.insight} />
        <HeroBand main={data.hero.main} rest={data.hero.rest} split={data.hero.split} stacked />

        <BlockShell title={`${trafik ? 'Ziyaret' : 'Ciro'} · günlük`} block={data.series}>
          <SeriesChart points={data.series.data} />
        </BlockShell>

        <BlockShell title="Dönüşüm hunisi" block={data.funnel}>
          <FunnelRows steps={data.funnel.data} />
        </BlockShell>

        <BlockShell title="Yoğunluk — gün / saat" block={data.heat}>
          {/* 24 sütun 390px'e sığmıyor; kırpmak yerine kaydırıyoruz — kırpılmış bir ısı haritası
              akşam saatlerini sessizce yutardı ve tam o saatler kararın konusu. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[420px]">
              <HeatGrid rows={data.heat.data} />
            </div>
          </div>
        </BlockShell>

        <BlockShell title="Kampanya getirisi" block={data.campaigns}>
          <CampaignTable rows={data.campaigns.data} />
        </BlockShell>

        <BlockShell title="Trafik kaynağı" block={data.sources}>
          <SourceRows rows={data.sources.data} />
        </BlockShell>
        <BlockShell title="Kaynağa göre tekrar sipariş" block={data.cohort}>
          <CohortRows rows={data.cohort.data} />
        </BlockShell>
        <BlockShell title="Müşteri grupları" block={data.segments}>
          <SegmentCards rows={data.segments.data} stacked />
        </BlockShell>
        <BlockShell title="Aranıp bulunamayan" hint="— sıfır sonuç" block={data.zeroSearch}>
          <ZeroSearchChips rows={data.zeroSearch.data} />
        </BlockShell>
        <BlockShell title="Çok bakılıp az alınan" block={data.interest}>
          <InterestRows rows={data.interest.data} />
        </BlockShell>

        <BlockShell title="Pazarlama izni" block={data.consent}>
          <ConsentCards rows={data.consent.data} stacked />
        </BlockShell>

        <ZoneDemandBridge />
      </div>
    </div>
  );
}
