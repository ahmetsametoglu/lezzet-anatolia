'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { SearchInput } from '@/components/operation/ui/search-input';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, type Column } from '@/components/operation/ui/table';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { MOVEMENT_KIND, MOVEMENT_KIND_TONE, movementBadge, movementLabel } from '../stock-labels';
import { LOSS_PERIODS, PERIOD_LABEL } from '../stock-url';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { LossRow, StockViewProps } from '../stock-types';
import { EmptyState } from '@/components/operation/ui/empty-state';

/** Dağılım çipinin rengi — Badge'in dolgulu hâlinden farklı: burada çerçeveli, tabloya baskın çıkmasın. */
const REASON_CHIP: Record<OpsTone, string> = {
  neutral: 'border-ops-line bg-ops-white text-ops-body',
  olive: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  blue: 'border-ops-blue-line bg-ops-blue-bg text-ops-blue-dark',
  slate: 'border-ops-slate-line bg-ops-slate-bg text-ops-slate-dark',
  violet: 'border-ops-violet-line bg-ops-violet-bg text-ops-violet',
};

// ÇIKIŞLAR — depodan çıkan mal (22.26 · 22.27; eski adı "İmha geçmişi").
//
// ── SEKME ARTIK ADININ HAKKINI VERİYOR (06.14) ──────────────────────────────
// Kaynağı `stock_adjustment`tı ve o tablonun sözleşmesi *"stok azalışının SATIŞ DIŞI her sebebi"*
// diyordu: hazırlık, kapı satışı ve sevk hiç yazılmıyordu. Ekran bunu çıkışların TAMAMI sanıyordu
// ve iki ölçülmüş sonucu vardı (27.08):
//   · dönemdeki çıkış olaylarının küçük bir dilimini gösteriyordu;
//   · başlıktaki dönem toplamı NEGATİFTİ (`−13,49 €`), çünkü iade restoku ve sayım fazlası birer
//     GİRİŞ olduğu hâlde aynı toplamda eriyordu (işaret `qty`ye gömülüydü).
//
// Kaynak `stock_movement` defteri oldu ve okuma `direction: 'out'` ile süzülüyor. Girişler (iade
// restoku · sayım fazlası · sevkiyat kabulü) artık Mal kabul sekmesinin — tasarım sözleşmesi zaten
// oraya yazıyordu (`admin-stok.md §2`).
//
// DÖNEM + DAĞILIM + TABLO, bu sırayla: önce "ne kadar", sonra "hangi türden", sonra "hangi kayıt".
// Toplam dönemin TAMAMI üzerinden gelir (sunucudan), tablo ise sayfalı — ilk 30 satırın toplamı
// dönemin toplamı değildir ve ikisini karıştırmak raporu sessizce yanlış gösterirdi.
//
// Miktar POZİTİF ve hepsi çıkış: yön kolonda duruyor, ekran onu ayrıca söylemek zorunda değil.

export function OutgoingTab({
  losses,
  search,
  onSearch,
  hasMoreLosses,
  loadingLosses,
  onLoadMoreLosses,
  period,
  onPeriod,
  data,
  onOpenRecall,
  onOpenWriteOff,
  navPending,
}: StockViewProps) {
  const term = search.trim().toLocaleLowerCase('tr');
  const rows = losses.filter(
    (r) => !term || r.title.toLocaleLowerCase('tr').includes(term) || (r.stock.lotNumber ?? '').toLocaleLowerCase('tr').includes(term),
  );
  const summary = data.lossSummary;

  const columns: Column<LossRow>[] = [
    {
      key: 'what',
      header: 'Ürün / lot',
      width: 'minmax(180px,1.35fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
          {/* Lot geri çağırmaya köprü: imha edilen partiden daha önce mal çıkmış olabilir ve o zaman
              soru "kime gitti"ye döner. */}
          {r.stock.lotNumber ? (
            <button
              type="button"
              onClick={() => onOpenRecall(r.stock.lotNumber ?? undefined)}
              className="w-max cursor-pointer font-ops-mono text-ops-xs font-medium text-ops-olive-dark hover:underline"
              title="Bu partiden kime mal gitmiş — geri çağırma sorgusu"
            >
              {r.stock.lotNumber} ↗
            </button>
          ) : (
            <span className="font-ops-body text-ops-xs text-ops-faint">lot no yok</span>
          )}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Tür',
      width: '120px',
      cell: (r) => {
        const badge = movementBadge(r.kind, r.direction);
        return <Badge tone={badge.tone}>{badge.text}</Badge>;
      },
    },
    {
      key: 'qty',
      header: 'Miktar',
      width: '72px',
      align: 'right',
      cell: (r) => (
        // Hepsi çıkış: eksi işareti YÖNÜ değil, gözün okumasını kolaylaştırıyor. Yön artık kolonda
        // duruyor ve bu tablo yalnız `out` satırlarını alıyor.
        <span className="font-ops-mono text-ops-sm font-medium text-ops-ink" title="Stoktan düşüldü">
          −{r.qty}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Değer',
      width: '88px',
      align: 'right',
      cell: (r) => (
        // Renk artık TÜRDEN geliyor, işaretten değil: fire bir kayıptır (kırmızı), satış ve sevk
        // olağan çıkışlardır (nötr). Eskiden negatif maliyet zeytin, pozitif kırmızı çiziliyordu —
        // ama o ayrım yönü anlatıyordu ve yön artık kendi sütununda.
        <span
          className={`font-ops-mono text-ops-sm font-medium ${
            r.costCents === null ? 'text-ops-faint' : r.kind === 'write_off' ? 'text-ops-red' : 'text-ops-ink'
          }`}
          title={r.costCents === null ? 'Partinin alış fiyatı girilmemiş — maliyet bilinmiyor' : 'İşlem anındaki alış fiyatından'}
        >
          {money(r.costCents)}
        </span>
      ),
    },
    {
      // **DEPO** — tasarım §2 satırda istiyor ("tarih, depo, ürün/boy, parti, adet, tür, belge no")
      // ve veri hep vardı, yalnız çizilmiyordu. "Tüm depolar" bakışında hangi tesisin kaydı olduğu
      // okunamıyordu; tek depolu yerelde görünmeyen, çok depoluda karar bozan bir eksiklik.
      key: 'warehouse',
      header: 'Depo',
      width: '64px',
      cell: (r) =>
        r.warehouseCode ? (
          // KOD gösteriliyor, tam ad `title`da: "Strasbourg — ana depo" dar sütuna sığmıyor ve
          // ölçüldüğünde komşu sütunun üstüne biniyordu (27.08). `block` ŞART — `truncate`
          // inline bir `span`de çalışmaz (`overflow` uygulanmaz) ve metin kutudan taşar.
          <span className="block truncate font-ops-mono text-ops-sm text-ops-body" title={r.warehouseName ?? undefined}>
            {r.warehouseCode}
          </span>
        ) : (
          <span className="font-ops-body text-ops-sm text-ops-faint">—</span>
        ),
    },
    {
      key: 'when',
      header: 'Tarih ↓',
      width: '104px',
      align: 'right',
      cell: (r) => (
        // Yalnız GÜN: tasarımın seçimi. Saat, kaydın kendisini ayırt etmeye yarar ama bu tablonun
        // sorusu "ne zaman oldu" değil "ne oldu" — saat sütunu genişletip adı daraltırdı.
        //
        // Gösterilen `occurredAt`: OLAYIN anı. Sıralama `createdAt`e göre (defterin sırası) ve
        // ikisi gerçek akışta aynı; ayrıştıkları tek hâl geriye dönük yazılan bir kayıttır ve o
        // zaman doğru olan, olayın kendi günüdür (`stock_intake`in `date`/`created_at` ayrımı).
        <span className="font-ops-mono text-ops-sm font-medium text-ops-muted" title={shortDateTime(r.occurredAt)}>
          {shortDate(r.occurredAt)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Neden / belge',
      width: 'minmax(150px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          {/* İmhada SEBEP, ötekilerde tipin kendisi — sayım farkının sebebi yoktur ve olmayan bir
              alanı boş göstermek yerine satır ne olduğunu söyler. */}
          <span className="truncate font-ops-body text-ops-sm text-ops-body">{movementLabel(r.kind, r.reason)}</span>
          {r.note ? (
            <span className="truncate font-ops-body text-ops-xs text-ops-muted" title={r.note}>
              {r.note}
            </span>
          ) : r.referenceNo ? (
            // **BELGE NUMARASI** — tasarım §2 satırda istiyor: `IMH-STR-26-0012` denetmenin elindeki
            // kâğıtla eşleşen şeydir. Not varsa o öncelikli (operatörün yazdığı cümle daha bilgilidir);
            // ikisini birden çizmek satırı üç kata çıkarırdı.
            <span className="truncate font-ops-mono text-ops-xs text-ops-muted" title="Belge numarası">
              {r.referenceNo}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Onaylayan',
      width: 'minmax(96px,0.85fr)',
      cell: (r) => (
        <span className="truncate font-ops-body text-ops-sm text-ops-body">
          {r.actorName ?? <span className="text-ops-faint">yazılmamış</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Dönem şeridi: seçim + o dönemin toplamı. Toplam sağda ve mono — sayfa kaydırılırken bile
          "ne kadar" sorusunun cevabı sabit bir yerde durur. */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-6 py-[11px]">
        {LOSS_PERIODS.map((p) => (
          <Chip key={p} active={period === p} onClick={() => onPeriod(p)}>
            {PERIOD_LABEL[p]}
          </Chip>
        ))}
        {/* Arama bu ŞERİDİN içinde (tasarım): dönemle birlikte okunan bir daraltma, ekran çapında bir
            süzgeç değil. Yer tutucu da neyin arandığını söyler — ürün ya da lot. */}
        <SearchInput value={search} onChange={onSearch} placeholder="Ürün veya lot ara" className="w-[190px]" />
        <div className="ml-auto flex items-center gap-3">
          <div className="flex flex-col items-end gap-px">
            <span className="font-ops-mono text-ops-base font-medium text-ops-ink">
              {summary.qty} ad. · {money(summary.costCents)}
            </span>
            <span className="font-ops-body text-ops-micro text-ops-muted">{PERIOD_LABEL[period]} · maliyet değeri</span>
          </div>
          {/* Kaydın kendisi bu sekmenin işi: liste "ne çıktı"yı gösteriyor, düğme "çıkar"ı açıyor.
              Form liste ÜSTÜNDE diyalogda (bu ekranın deseni). */}
          <Button variant="secondary" size="sm" onClick={() => onOpenWriteOff()}>
            − Stoktan düş
          </Button>
        </div>
      </div>

      {/* Tür dağılımı: "ne kadar" sorusunun hemen ardından gelen "hangi türden". Dönemin TAMAMINDAN
          gelir. Başlık "Neden" değil "Tür" oldu (06.14): defterde satış ve sevk de var ve onların
          bir "nedeni" yok — olağan işlerdir. İmhanın nedeni tablonun kendi sütununda. */}
      {/* Şerit dönemde kayıt olmasa da KALIR (tasarımın temiz-hâl notu): "dönem seçici ve dağılım
          yerinde kalır, tablo yerine temiz hâl görünür". Kaybolan bir şerit, ekranın yapısını
          döneme göre değiştirir. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line px-6 py-2.5">
        <span className="mr-1 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Tür dağılımı
        </span>
        {summary.byKind.length === 0 ? (
          <span className="font-ops-body text-ops-xs text-ops-faint">dönemde kayıt yok</span>
        ) : (
          summary.byKind.map((r) => {
            const t = REASON_CHIP[MOVEMENT_KIND_TONE[r.kind]];
            return (
              <span key={r.kind} className={`rounded-ops-btn border px-[11px] py-[5px] font-ops-body text-ops-xs font-medium ${t}`}>
                {MOVEMENT_KIND[r.kind]} · <strong className="font-ops-mono">{r.qty} ad.</strong> ·{' '}
                <strong className="font-ops-mono">{money(r.costCents)}</strong>
              </span>
            );
          })
        )}
      </div>

      <Table
        busy={navPending}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={<CleanState filtered={Boolean(term)} periodLabel={PERIOD_LABEL[period]} />}
        footer={
          <>
            <LoadMoreSentinel hasMore={hasMoreLosses} loading={loadingLosses} onLoadMore={onLoadMoreLosses} />
            <span className="block px-6 py-3 font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
              Kayıtlar depo imha/sayım akışından düşer — burada düzeltilmez. Dönem karşılaştırması ve ürün kırılımı
              raporlarda.
            </span>
          </>
        }
      />
    </div>
  );
}

interface CleanStateProps {
  filtered: boolean;
  periodLabel: string;
}

/**
 * "Temiz hâl" — dönemde kayıt yoksa bu bir eksiklik değil, iyi haberdir ve öyle söylenir. Dönem
 * seçici yerinde kalır: önceki döneme geçmek tek dokunuş olmalı.
 */
function CleanState({ filtered, periodLabel }: CleanStateProps) {
  if (filtered) {
    // Arama YÜKLENMİŞ satırlarda çalışır (dönem listesi imleçle gelir) — bu yüzden "kayıt yok"
    // demez, ne aradığını söyler. Tetikleyici altta durduğu için devamı yüklenebilir.
    //
    // BEKLEYEN(09.18): imha aramasının sunucu tarafı. Terim lot numarasına ve ürün adına bakıyor;
    // ikisi de düzeltme satırının kendisinde değil, gömülü `stock`/`product` ilişkisinde duruyor —
    // sunucuda süzmek ortak stok servisine inner-join'li bir süzgeç eklemeyi gerektiriyor. Liste
    // dönemle sınırlı olduğu için bugünkü sınır dar; kuyruğu yutmaması ekranın kendi cümlesiyle
    // korunuyor (sessiz kesme yok).
    return (
      <EmptyState
        title="Yüklenen kayıtlarda eşleşme yok"
        description="Arama şu ana kadar yüklenmiş satırlarda yapılır — aşağı kaydırıp devamını yükleyin ya da terimi değiştirin."
      />
    );
  }
  return (
    <div className="flex flex-1 items-start justify-center p-8">
      <div className="flex w-[420px] max-w-full flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-6 py-5">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Çıkışlar — dönemde kayıt yok
        </span>
        <div className="flex items-center gap-2.5">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ops-olive-bg font-ops-display text-ops-base font-semibold text-ops-olive-dark">
            ✓
          </span>
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">
            {periodLabel.toLocaleLowerCase('tr')} hiç imha yok — 0,00 €
          </span>
        </div>
        <span className="font-ops-body text-ops-sm leading-[1.7] text-ops-body">
          Dönem seçici yerinde kalır; önceki döneme geçmek tek dokunuş. Karşılaştırma raporlarda.
        </span>
      </div>
    </div>
  );
}
