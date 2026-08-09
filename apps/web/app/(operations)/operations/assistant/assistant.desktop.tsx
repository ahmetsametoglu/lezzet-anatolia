'use client';

import { PageHeader } from '@/components/operation/ui/page-header';
import { QueuePane } from '@/components/operation/ui/queue-pane';
import { SegmentedNav } from '@/components/operation/ui/segmented-nav';
import { agoLabel, num } from '@/components/operation/ui/format';
import { CardPlaceholder, DecisionCard, ProposalRow, QueueEmpty } from './assistant-sections';
import { QUEUE_TABS, QUEUE_TAB_LABELS } from './assistant-url';
import type { AssistantViewProps } from './assistant-types';

/**
 * Asistan Onay Kuyruğu — web (22.3). `Operasyon - Asistan Kuyrugu.dc.html`.
 *
 * İKİ SÜTUN, TEK EKRAN: kuyruk · karar çerçevesi. Kuyruğu ayrı bir sayfaya koymak operatörü her
 * karardan sonra listeye geri döndürürdü; öneriler arka arkaya işlenen bir iştir.
 *
 * **Çerçeve her tipte AYNI, değişen tek şey önizleme bloğu** (brief §2): kuyruktaki kalemler
 * birbirine benzemez (altı kalemlik bir paket ↔ tek satırlık bir para hareketi) ama öğrenilecek
 * ekran tek olmalı.
 *
 * Mobil YOK — operasyon yüzeyi yalnız masaüstü (`CLAUDE §2`).
 *
 * Sekmeler `ui/tabs` ile: çizim onları başlık barının içinde bir segment hapı olarak veriyor, bizde
 * "bir ekranın alt görünümleri" deseni alt-çizgili sekme barıdır (Ürünler · Para · Raporlar aynı
 * dili konuşuyor). Bilinçli sapma — `design/KARARLAR.md`.
 */
export function AssistantDesktop({
  data,
  urlState,
  navPending,
  busy,
  error,
  onTab,
  onSelect,
  onDecision,
}: AssistantViewProps) {
  // Yaş aralığı YALNIZ bekleyen sekmesinde söylenir: arşivin en eskisi bir bilgi değil, bekleyen
  // işin en eskisi bir uyarıdır ("unutulmasın" — kuyruğun sıralama gerekçesi).
  // Kuyruk ESKİDEN YENİYE sıralı (kısmi indeks `created_at` artan): en eskisi ilk, en yenisi son.
  const pendingRows = urlState.tab === 'pending' ? data.rows : [];
  const oldest = pendingRows[0];
  const newest = pendingRows.length > 1 ? pendingRows[pendingRows.length - 1] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Sekmeler ORTAK BAŞLIĞIN İÇİNDE — çizim onları başlık barının sağına, gri rayın üstünde
          kayan bir hap olarak koyuyor. Bir tur `ui/tabs` ile başlığın ALTINA ayrı bir bant olarak
          yazılmıştı (kullanıcı düzeltmesi 09.08): ayrı bant hem çizimden sapma hem de bu ekranda
          bedeli olan bir sapmaydı — iki sütun zaten ekranı dolduruyor, karar çerçevesi o yüksekliği
          kaybediyordu. Sayaç da rozete değil ALT SATIRA döndü, çizimdeki yerine. */}
      <PageHeader
        title="Asistan Onay Kuyruğu"
        // Çizimin alt satırı: sayı + yaş aralığı ("7 bekleyen öneri · en eski 1 gün önce · en
        // yenisi yarım saat önce"). Aralık kuyruğun HÂLİNİ söylüyor: hepsi bu sabah geldiyse başka,
        // en eskisi bir haftalıksa başka bir ekran.
        subtitle={
          data.pendingCount === 0
            ? 'Bekleyen öneri yok — asistan hazırlar, kararı siz verirsiniz.'
            : [
                `${num(data.pendingCount)} bekleyen öneri`,
                oldest ? `en eski ${agoLabel(oldest.ageMinutes)}` : null,
                newest ? `en yenisi ${agoLabel(newest.ageMinutes)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
        }
      >
        <SegmentedNav
          label="Kuyruk görünümü"
          items={QUEUE_TABS.map((key) => ({ key, label: QUEUE_TAB_LABELS[key] }))}
          active={urlState.tab}
          onSelect={onTab}
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <QueuePane
          width={326}
          busy={navPending}
          isEmpty={data.rows.length === 0}
          empty={<QueueEmpty tab={urlState.tab} />}
          // Kuyruk bugün TEK sayfa okuyor (`readAssistantQueue(tab, limit)` — imleç yok). Karar
          // geçmişi zamanla sınırsız büyüyen bir küme; sayfalama sözleşmesi denetime soruldu.
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => {}}
        >
          {data.rows.map((row) => (
            <ProposalRow key={row.id} row={row} active={row.id === urlState.p} onSelect={onSelect} />
          ))}
        </QueuePane>

        {data.selected ? (
          <DecisionCard
            // Öneri değişince kartın iç durumu (açık teknik döküm) SIFIRLANIR: bir önerinin ham
            // dilekçesi açıkken ötekine geçmek, başka bir kaydın JSON'unu aynı yerde gösterirdi.
            key={data.selected.id}
            row={data.selected}
            busy={busy}
            error={error}
            onDecision={onDecision}
          />
        ) : (
          <div className="flex min-h-0 flex-1 bg-ops-subtle">
            <CardPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}
