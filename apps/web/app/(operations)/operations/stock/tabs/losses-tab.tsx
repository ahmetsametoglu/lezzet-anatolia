'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { SearchInput } from '@/components/operation/ui/search-input';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, type Column } from '@/components/operation/ui/table';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { LOSS_REASON, LOSS_REASON_TONE, lossKind } from '../stock-labels';
import { LOSS_PERIODS, PERIOD_LABEL } from '../stock-url';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { LossRow, StockViewProps } from '../stock-types';

/** Dağılım çipinin rengi — Badge'in dolgulu hâlinden farklı: burada çerçeveli, tabloya baskın çıkmasın. */
const REASON_CHIP: Record<OpsTone, string> = {
  neutral: 'border-ops-line bg-ops-white text-ops-body',
  olive: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  blue: 'border-ops-blue-line bg-ops-blue-bg text-ops-blue-dark',
  slate: 'border-ops-slate-line bg-ops-slate-bg text-ops-slate-dark',
};

// İmha / fire geçmişi — "bu üründen ne kadar çöpe gitti" görünür kalır. Ayrıntılı analiz raporlarda
// (DOMAIN §12); burası olayın kendisidir.
//
// DÖNEM + DAĞILIM + TABLO, bu sırayla: önce "ne kadar", sonra "neden", sonra "hangi kayıt". Toplam
// dönemin TAMAMI üzerinden gelir (sunucudan), tablo ise sayfalı — ilk 30 satırın toplamı dönemin
// toplamı değildir ve ikisini karıştırmak raporu sessizce yanlış gösterirdi.
//
// Miktar İŞARETLİ: pozitif stoktan düşüm, negatif stoğa geri ekleme. Tek alanda tutulur ki toplam NET
// kaybı versin. Ekran işareti YÖNLE söyler — geri ekleme bir kayıp değildir, kırmızı olmamalı.

export function LossesTab({
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
      width: '112px',
      cell: (r) => {
        const kind = lossKind(r.reason, r.qty);
        return <Badge tone={kind.tone}>{kind.text}</Badge>;
      },
    },
    {
      key: 'qty',
      header: 'Miktar',
      width: '72px',
      align: 'right',
      cell: (r) => (
        <span className="font-ops-mono text-ops-sm font-medium text-ops-ink" title={r.qty < 0 ? 'Stoğa geri eklendi' : 'Stoktan düşüldü'}>
          {r.qty < 0 ? `+${-r.qty}` : `−${r.qty}`}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Değer',
      width: '88px',
      align: 'right',
      cell: (r) => (
        <span
          className={`font-ops-mono text-ops-sm font-medium ${r.costCents === null ? 'text-ops-faint' : r.costCents < 0 ? 'text-ops-olive-dark' : 'text-ops-red'}`}
          title={r.costCents === null ? 'Partinin alış fiyatı girilmemiş — maliyet bilinmiyor' : 'İşlem anındaki alış fiyatından'}
        >
          {money(r.costCents)}
        </span>
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
        <span className="font-ops-mono text-ops-sm font-medium text-ops-muted" title={shortDateTime(r.createdAt)}>
          {shortDate(r.createdAt)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Neden',
      width: 'minmax(140px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-sm text-ops-body">{LOSS_REASON[r.reason]}</span>
          {r.note ? (
            <span className="truncate font-ops-body text-ops-xs text-ops-muted" title={r.note}>
              {r.note}
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
        <div className="ml-auto flex flex-col items-end gap-px">
          <span className="font-ops-mono text-ops-base font-medium text-ops-ink">
            {summary.qty} ad. · {money(summary.costCents)}
          </span>
          <span className="font-ops-body text-ops-micro text-ops-muted">{PERIOD_LABEL[period]} · maliyet değeri</span>
        </div>
      </div>

      {/* Neden dağılımı: "ne kadar" sorusunun hemen ardından gelen "neden". Dönemin TAMAMINDAN gelir. */}
      {/* Şerit dönemde kayıt olmasa da KALIR (tasarımın temiz-hâl notu): "dönem seçici ve neden
          dağılımı yerinde kalır, tablo yerine temiz hâl görünür". Kaybolan bir şerit, ekranın
          yapısını döneme göre değiştirir. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line px-6 py-2.5">
        <span className="mr-1 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Neden dağılımı
        </span>
        {summary.byReason.length === 0 ? (
          <span className="font-ops-body text-ops-xs text-ops-faint">dönemde kayıt yok</span>
        ) : (
          summary.byReason.map((r) => {
            const t = REASON_CHIP[LOSS_REASON_TONE[r.reason]];
            return (
              <span key={r.reason} className={`rounded-ops-btn border px-[11px] py-[5px] font-ops-body text-ops-xs font-medium ${t}`}>
                {LOSS_REASON[r.reason]} · <strong className="font-ops-mono">{r.qty} ad.</strong> ·{' '}
                <strong className="font-ops-mono">{money(r.costCents)}</strong>
              </span>
            );
          })
        )}
      </div>

      <Table
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
    // BEKLEYEN(09.13): imha aramasının sunucu tarafı. Terim lot numarasına ve ürün adına bakıyor;
    // ikisi de düzeltme satırının kendisinde değil, gömülü `stock`/`product` ilişkisinde duruyor —
    // sunucuda süzmek ortak stok servisine inner-join'li bir süzgeç eklemeyi gerektiriyor. Liste
    // dönemle sınırlı olduğu için bugünkü sınır dar; kuyruğu yutmaması ekranın kendi cümlesiyle
    // korunuyor (sessiz kesme yok).
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10 text-center">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Yüklenen kayıtlarda eşleşme yok</span>
        <span className="font-ops-body text-ops-sm text-ops-muted">
          Arama şu ana kadar yüklenmiş satırlarda yapılır — aşağı kaydırıp devamını yükleyin ya da terimi değiştirin.
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-start justify-center p-8">
      <div className="flex w-[420px] max-w-full flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-6 py-5">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          İmha geçmişi — dönemde kayıt yok
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
