'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Select } from '@/components/operation/form/select';
import { Skeleton, SkeletonCard, SkeletonMetric, SkeletonRows } from '@/components/operation/ui/skeleton';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { money, num, shortDate } from '@/components/operation/ui/format';
import { MOVEMENT_KIND, WRITE_OFF_REASON } from '@/lib/stock/loss-labels';
import { readVariantHistoryAction } from '@/lib/stock/history-actions';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@lezzet/types';
import type { VariantBatchHistory, VariantStockHistory } from '@lezzet/application';
import type { StockLevelRow, StockWarehouseSplit } from '@/lib/stock/level-rows';

/**
 * Seçili boyun stok geçmişi; stok ekranının sağ sütunu ile ürünler önizlemesinin stok diyaloğu aynı gövdeyi çizer. Panel verisini
 * tıklanınca kendi çeker, çünkü listedeki yirmi boyun geçmişini önden okumak bakılmayacak on dokuzunu boşa okumak olurdu.
 */
interface ProductHistoryPanelProps {
  row: StockLevelRow | null;
  /** Depo adları — parti satırı hangi rafta durduğunu söyler (çok depolu bakışta). */
  warehouseNames: Map<string, string>;
  showWarehouse: boolean;
  /**
   * Tablodaki depo süzgecinin kodu ('' = süzgeç yok); panel satırla aynı evreni açar.
   */
  warehouseFilter: string;
  /** Süzgeç aktifse deponun adı — panel hangi evrene baktığını YAZAR, tahmin ettirmez. */
  warehouseFilterName: string | null;
  /** Kabın ek sınıfları — diyalog kullanımı yükseklik verir (`h-full`), sayfa grid'i vermez. */
  className?: string;
  /** Başlığın altında, geçmişten önce duran ek blok; stok sayfası depo eşiğini buraya koyar. */
  aside?: ReactNode;
}

export function ProductHistoryPanel({
  row,
  warehouseNames,
  showWarehouse,
  warehouseFilter,
  warehouseFilterName,
  className = '',
  aside = null,
}: ProductHistoryPanelProps) {
  const [history, setHistory] = useState<VariantStockHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Panel içi depo seçimi: `''` = tümü, aksi hâlde depo kodu. Tablo süzgeci başlangıcı belirler ama kilitlemez; operatör tek üründe
   * kalıp depolar arasında gezinebilir.
   */
  const [pane, setPane] = useState(warehouseFilter);
  // Tablo süzgeci değişince panel ona döner: kullanıcı üstte depo seçtiyse kastettiği odur ve
  // panelin eski seçimi sessizce direnirse iki ekran farklı gerçeği gösterirdi.
  useEffect(() => setPane(warehouseFilter), [warehouseFilter]);

  const variantId = row?.variantId ?? null;
  const splits = row?.warehouses ?? [];
  /** Seçili evrenin kırılımı — `null` = tümü. Başlıktaki sayılar da buradan okunur. */
  const activeSplit = pane ? (splits.find((split) => split.code === pane) ?? null) : null;
  const availableQty = activeSplit?.availableQty ?? row?.availableQty ?? 0;

  useEffect(() => {
    if (!variantId) {
      setHistory(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    // Önceki ürünün verisi bırakılır: kalsaydı yükleme anında yeni ürünün adı altında başka ürünün satış hızı ve geçmişi görünürdü.
    setHistory(null);
    void readVariantHistoryAction(variantId, availableQty, pane)
      .then(({ data, error: failed }) => {
        if (!alive) return;
        if (failed || !data) {
          setError(failed ?? 'Geçmiş okunamadı.');
          setHistory(null);
          return;
        }
        setHistory(data);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Seçili evren bağımlılıkta: depo değişince panel YENİDEN okunur — yoksa başlık yeni deponun,
    // gövde eski deponun gerçeğini gösterirdi.
  }, [variantId, availableQty, pane]);

  if (!row) {
    return (
      <div className="flex items-start justify-center bg-ops-subtle p-6">
        <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-4 py-4">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Bir ürün seçin</span>
          <span className="font-ops-body text-ops-sm leading-[1.6] text-ops-body">
            Soldaki listeden bir boya tıklayın: o boyun giriş geçmişi, satış hızı, parti ömrü ve firesi
            burada açılır.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col bg-ops-subtle ${className}`}>
      <div className="flex flex-none flex-col gap-2 border-b border-ops-line px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Görsel başlıkta da durur ki panel açılınca "doğru ürüne mi baktım" sorusu okumadan cevaplansın. */}
          <Thumbnail src={row.imageUrl} alt={row.title} size={40} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-ops-display text-ops-base font-semibold text-ops-ink" title={row.title}>
              {row.title}
            </span>
            {/* Sayılar SEÇİLİ EVRENİN sayılarıdır: depo sekmesi değişince başlık da değişir, yoksa
                gövde bir deponun, başlık hepsinin gerçeğini söylerdi. */}
            <span className="font-ops-body text-ops-xs text-ops-muted">
              Kullanılabilir {num(activeSplit?.availableQty ?? row.availableQty)} · elde{' '}
              {num(activeSplit?.physicalQty ?? row.physicalQty)}
              {(activeSplit?.reservedQty ?? row.reservedQty) > 0
                ? ` · ${num(activeSplit?.reservedQty ?? row.reservedQty)} ayrılmış`
                : ''}
            </span>
          </div>
        </div>

        <WarehouseSwitch
          splits={splits}
          value={pane}
          onChange={setPane}
          lockedName={warehouseFilterName}
          lockedCode={warehouseFilter}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-3.5">
        {aside}
        {/* İskelet, hata ve içerik tek zincirde birbirini dışlar; ayrı koşullar ikisini aynı anda çizebiliyordu. */}
        {loading ? (
          <HistorySkeleton />
        ) : error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : history ? (
          <>
            <FlowLine history={history} />
            <ReservationBlock history={history} />
            <SummaryGrid history={history} />
            <BatchList history={history} warehouseNames={warehouseNames} showWarehouse={showWarehouse} />
            <LossBlock history={history} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Malın akışı: girenden satılanı ve düşüleni çıkarınca elde kalması gereken sayı; tutmuyorsa kayda geçmemiş bir hareket vardır. Liste
 * tavana dayandıysa satır çizilmez, eksik giriş toplamı tutmayan denklemi tutuyor gösterirdi.
 */
function FlowLine({ history }: { history: VariantStockHistory }) {
  if (history.truncated) {
    return (
      <span className="font-ops-body text-ops-xs text-ops-faint">
        Akış özeti çizilmedi: bu boyun giriş geçmişi gösterilenden uzun, toplamlar eksik kalırdı.
      </span>
    );
  }
  const { intakeQty, deliveredQty, pickedQty, lostQty, inTransitQty, onHandQty } = history.flow;
  // Hazırlanan mal `physical_qty`de durduğu için denklemde yoktur. Yoldaki mal ise vardır: transferde hiçbir deponun stoğunda değildir ve
  // onsuz denklem transfer adedi kadar sapıp olmayan bir arızayı aratırdı.
  const balanced = intakeQty - deliveredQty - lostQty - inTransitQty === onHandQty;
  return (
    <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-ops-body text-ops-sm">
        <Flow label="giren" value={intakeQty} tone="ink" />
        <span className="text-ops-faint">−</span>
        <Flow label="teslim" value={deliveredQty} tone="olive" />
        <span className="text-ops-faint">−</span>
        <Flow label="düşülen" value={lostQty} tone={lostQty > 0 ? 'amber' : 'muted'} />
        {/* Yolda satırı YALNIZ varken çizilir: sıfır bir "0 yolda" terimi, denklemi hiç transfer
            görmemiş ürünlerde gereksiz yere uzatırdı. */}
        {inTransitQty > 0 ? (
          <>
            <span className="text-ops-faint">−</span>
            <Flow label="yolda" value={inTransitQty} tone="amber" />
          </>
        ) : null}
        <span className="text-ops-faint">=</span>
        <Flow label="elde" value={onHandQty} tone="ink" />
      </div>
      {/* Hazırlanan mal ELDE SAYILIR ama satılacaktır — ayrı bir satır, çünkü ayrı bir hâl:
          rafta duruyor, sözü verilmiş, henüz çıkmamış. */}
      {pickedQty > 0 ? (
        <span className="font-ops-body text-ops-micro text-ops-muted">
          Eldekinin <span className="font-ops-mono font-semibold text-ops-blue-dark">{num(pickedQty)}</span> adedi
          hazırlanmış siparişlerde — rafta duruyor, teslimde düşecek.
        </span>
      ) : null}
      {/* Yoldaki mal AÇIKLANIR: "yolda 4" tek başına nereye gittiğini söylemez ve operatör
          transferi aramak zorunda kalır. */}
      {inTransitQty > 0 ? (
        <span className="font-ops-body text-ops-micro text-ops-muted">
          <span className="font-ops-mono font-semibold text-ops-amber">{num(inTransitQty)}</span> adet
          transferde — kaynak depodan çıktı, hedefte henüz teslim alınmadı.
        </span>
      ) : null}
      {balanced ? null : (
        <span className="font-ops-body text-ops-micro text-ops-amber">
          Denklem tutmuyor — kayda geçmemiş bir hareket var (elle düzeltilmiş adet ya da bu ekranın
          bilmediği bir yazım).
        </span>
      )}
    </div>
  );
}

/**
 * Panelin bekleme hâli gövdenin gerçek sırasıyla çizilir (akış satırı, dört ölçüm, giriş geçmişi) ki veri gelince yerleşim zıplamasın;
 * koşullu bloklar çizilmez. Stok diyaloğu da aynı iskeleti kullanır.
 */
export function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <SkeletonCard>
        <Skeleton className="h-4 w-3/5" />
      </SkeletonCard>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonMetric key={i} />
        ))}
      </div>
      {/* Üç satır: giriş geçmişi tipik olarak birkaç parti — gelenden belirgin fazla çizmek, yükleme
          bitince listenin küçülmesi demekti (`SkeletonRows` künyesi). */}
      <SkeletonRows rows={3} />
    </div>
  );
}

/** Sekme yerine seçiciye geçiş eşiği — bunun üstünde şerit taşıyor, altında sekme okunur kalıyor. */
const TAB_LIMIT = 3;

/**
 * Depolar arası geçiş: küme malı olan depolardır ve tek depoda çizilmez; `TAB_LIMIT`e kadar sekme, üstünde dar sütunda taşmasın diye
 * seçici. Tablo süzgeci açıksa panel o depoyu aşamaz, yalnız hangi depoya bakıldığını yazar.
 */
function WarehouseSwitch({
  splits,
  value,
  onChange,
  lockedName,
  lockedCode,
}: {
  splits: StockWarehouseSplit[];
  value: string;
  onChange: (next: string) => void;
  lockedName: string | null;
  lockedCode: string;
}) {
  if (lockedCode) {
    return (
      <span className="font-ops-body text-ops-micro text-ops-blue-dark">
        Yalnız {lockedName ?? lockedCode} — tablo süzgeci panele de uygulandı
      </span>
    );
  }
  if (splits.length < 2) return null;

  const options = [{ code: '', label: 'Tümü' }, ...splits.map((split) => ({ code: split.code, label: split.code }))];

  if (splits.length > TAB_LIMIT) {
    return (
      <Select
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          value: option.code,
          // Seçicide KOD yetmez: liste açıkken depo adı da görünmeli, kısaltma ancak şeritte okunur.
          label: option.code === '' ? 'Tümü' : (splits.find((s) => s.code === option.code)?.name ?? option.code),
        }))}
        className="max-w-[16rem]"
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const active = option.code === value;
        return (
          <button
            key={option.code || 'all'}
            type="button"
            onClick={() => onChange(option.code)}
            title={option.code === '' ? 'Bütün depolar' : (splits.find((s) => s.code === option.code)?.name ?? option.code)}
            className={`cursor-pointer rounded-ops-btn px-2.5 py-1 font-ops-body text-ops-xs transition-colors ${
              active
                ? 'bg-ops-ink font-semibold text-ops-white'
                : 'border border-ops-line text-ops-body hover:border-ops-line-strong hover:bg-ops-subtle'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Flow({ label, value, tone }: { label: string; value: number; tone: 'ink' | 'olive' | 'amber' | 'muted' }) {
  const color =
    tone === 'olive' ? 'text-ops-olive-dark' : tone === 'amber' ? 'text-ops-amber-dark' : tone === 'muted' ? 'text-ops-muted' : 'text-ops-ink';
  return (
    <span className="flex items-baseline gap-1">
      <span className={`font-ops-mono text-ops-lead font-semibold ${color}`}>{num(value)}</span>
      <span className="font-ops-body text-ops-micro text-ops-muted">{label}</span>
    </span>
  );
}

/**
 * Ayrılmış malın hangi siparişe ayrıldığı; sahibi görünmezse operatör ya kayıp sanır ya elle aramaya çıkar. Sipariş numarası tıklanmaz,
 * sipariş kendi ekranındadır.
 */
function ReservationBlock({ history }: { history: VariantStockHistory }) {
  if (history.reservations.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted">
        Ayrılmış — hangi siparişe
      </span>
      {history.reservations.map((reservation) => (
        <div
          key={reservation.orderId}
          className="flex items-center justify-between gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3 py-1.5"
        >
          <span className="truncate font-ops-mono text-ops-sm text-ops-ink">
            {reservation.referenceNo ?? 'numarasız sipariş'}
          </span>
          <div className="flex flex-none items-center gap-2">
            {/* Durum sözlüğü enum'un YANINDA (`packages/types`) — ekranda ikinci bir kopya tutulmaz;
                tanımadığı bir değer gelirse ham hâlini yazar, uydurmaz. */}
            <Badge tone="blue">{ORDER_STATUS_LABELS[reservation.status as OrderStatus] ?? reservation.status}</Badge>
            <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{num(reservation.qty)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Dört sayı: satış hızı, yeterlilik, ortalama parti ömrü, fire oranı. Ölçülemeyen hücre "—" ve sebebiyle yazılır, çünkü "günde 0"
 * stoğun sonsuza yeteceğini söylerdi.
 */
function SummaryGrid({ history }: { history: VariantStockHistory }) {
  const { rate, averageLife, loss } = history;
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* "Hiç satıldı mı" penceresiz cevaplanır: son 90 günde çıkış olmaması hiç satılmadı demek değildir. */}
      <Stat
        label="Satış hızı"
        value={rate ? `${rate.perDay.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} / gün` : '—'}
        note={
          rate
            ? `son ${rate.windowDays} günde ${num(rate.qty)} adet çıktı`
            : history.flow.deliveredQty + history.flow.pickedQty > 0
              ? `son 90 günde çıkış yok · toplam ${num(history.flow.deliveredQty + history.flow.pickedQty)} satılmış (son ${shortDate(history.lastSaleAt ?? '')})`
              : 'bu boy HİÇ satılmamış'
        }
      />
      {/* Pencerenin ötesi TAHMİN: "90+ gün" hem doğru hem de neyi bilmediğimizi saklamıyor. */}
      <Stat
        label="Stok yeter"
        value={
          history.daysOfCover === null
            ? '—'
            : `${num(history.daysOfCover.days)}${history.daysOfCover.capped ? '+' : ''} gün`
        }
        note={
          history.daysOfCover === null
            ? 'hız bilinmeden hesaplanamaz'
            : history.daysOfCover.capped
              ? 'gözlem penceresini aşıyor — ötesi tahmin olurdu'
              : 'bugünkü hızla'
        }
      />
      <Stat
        label="Parti ömrü"
        value={averageLife ? `${num(averageLife.days)} gün` : '—'}
        // Örneklem sayısı GÖRÜNÜR: iki partiden çıkan ortalamayı sessizce "ortalama" diye sunmak,
        // olmayan bir kesinlik vaat etmektir.
        note={averageLife ? `${num(averageLife.sampleCount)} tükenmiş partinin ortalaması` : 'henüz tükenmiş parti yok'}
      />
      {/* Fire yalnız gerçek kayıptır (imha, hasar, kayıp); iki yönlü sayım farkı oranı eksiye düşürdüğü için ayrı kutudadır. */}
      <Stat
        label="Fire"
        value={loss.percent === null ? '—' : `%${loss.percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
        note={loss.qty === 0 ? 'düşülen mal yok' : `${num(loss.qty)} adet · girene oranla`}
        tone={loss.percent !== null && loss.percent > 0 ? 'amber' : 'plain'}
      />
      {/* Sayım farkı yalnız sapma varsa çizilir ve işareti korunur: eksi "eksik çıktı", artı "fazla çıktı" demektir. */}
      {loss.countDiff !== 0 ? (
        <Stat
          label="Sayım farkı"
          value={`${loss.countDiff > 0 ? '+' : '−'}${num(Math.abs(loss.countDiff))}`}
          note={loss.countDiff > 0 ? 'sayımda fazla çıktı' : 'sayımda eksik çıktı'}
          tone="amber"
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, note, tone = 'plain' }: { label: string; value: string; note: string; tone?: 'plain' | 'amber' }) {
  return (
    <div className="flex flex-col gap-px rounded-ops-card border border-ops-line bg-ops-white px-3 py-2">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{label}</span>
      <span className={`font-ops-mono text-ops-lead font-semibold ${tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-ink'}`}>
        {value}
      </span>
      <span className="font-ops-body text-ops-micro leading-[1.4] text-ops-faint">{note}</span>
    </div>
  );
}

/** Giriş geçmişi — en yeni önce; her satır bir partinin künyesi ve akıbeti. */
function BatchList({
  history,
  warehouseNames,
  showWarehouse,
}: {
  history: VariantStockHistory;
  warehouseNames: Map<string, string>;
  showWarehouse: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted">
        Giriş geçmişi
      </span>
      {history.batches.length === 0 ? (
        <span className="font-ops-body text-ops-sm text-ops-faint">Bu boya hiç mal girmemiş.</span>
      ) : (
        history.batches.map((batch) => (
          <BatchRow
            key={batch.stockId}
            batch={batch}
            warehouseName={showWarehouse ? (warehouseNames.get(batch.warehouseId) ?? null) : null}
          />
        ))
      )}
      {/* Tavan GÖRÜNÜR: sessizce kesilen bir liste "hepsi bu kadarmış" sanılır. */}
      {history.truncated ? (
        <span className="font-ops-body text-ops-micro text-ops-faint">
          Son {num(history.batches.length)} giriş gösteriliyor — daha eskisi var.
        </span>
      ) : null}
    </div>
  );
}

function BatchRow({ batch, warehouseName }: { batch: VariantBatchHistory; warehouseName: string | null }) {
  const depleted = batch.physicalQty === 0;
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{shortDate(batch.createdAt)}</span>
        <span className="font-ops-mono text-ops-sm text-ops-ink">
          {/* Giren ve kalan YAN YANA: partinin ne kadarının eridiği tek bakışta okunur. */}
          {num(batch.initialQty)} → {depleted ? <span className="text-ops-muted">tükendi</span> : num(batch.physicalQty)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-ops-body text-ops-micro text-ops-muted">
        <span>SKT {shortDate(batch.expiryDate)}</span>
        {batch.unitCostCents !== null ? <span>· {money(batch.unitCostCents)} birim</span> : <span>· fiyat girilmemiş</span>}
        {batch.lotNumber ? <span>· lot {batch.lotNumber}</span> : null}
        {warehouseName ? <span>· {warehouseName}</span> : null}
        {batch.lifeDays !== null ? <Badge tone="olive">{num(batch.lifeDays)} günde eridi</Badge> : null}
        {batch.lostQty > 0 ? <Badge tone="amber">{num(batch.lostQty)} düşüldü</Badge> : null}
      </div>
    </div>
  );
}

/**
 * Düzeltme kırılımı iki seviyedir: önce hareket tipi (imha, sayım farkı, iade), sonra imhanın sebepleri; tek liste bir sebeple bir olayı
 * aynı türden gösterirdi. Sıfırsa blok çizilmez.
 */
function LossBlock({ history }: { history: VariantStockHistory }) {
  if (history.loss.byKind.length === 0) return null;
  const chip = 'rounded-ops-chip border border-ops-line bg-ops-white px-2.5 py-1 font-ops-body text-ops-xs text-ops-body';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted">
        Düzeltme kırılımı
      </span>
      <div className="flex flex-wrap gap-1.5">
        {history.loss.byKind.map((entry) => (
          <span key={entry.kind} className={chip}>
            {MOVEMENT_KIND[entry.kind]} <span className="font-ops-mono font-semibold text-ops-ink">{num(entry.qty)}</span>
          </span>
        ))}
      </div>
      {/* İmhanın içi ayrı satırda ve YALNIZ imha varsa: sebepsiz bir kırılım başlığı, olmayan bir
          ayrıntı vaat ederdi. */}
      {history.loss.byReason.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pl-3">
          {history.loss.byReason.map((entry) => (
            <span key={entry.reason} className={`${chip} text-ops-muted`}>
              {WRITE_OFF_REASON[entry.reason]}{' '}
              <span className="font-ops-mono font-semibold text-ops-ink">{num(entry.qty)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
