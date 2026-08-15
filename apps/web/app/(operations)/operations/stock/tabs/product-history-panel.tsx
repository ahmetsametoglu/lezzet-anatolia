'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { money, num, shortDate } from '@/components/operation/ui/format';
import { LOSS_REASON } from '../stock-labels';
import { readVariantHistoryAction } from '@/lib/stock/history-actions';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@lezzet/types';
import type { VariantBatchHistory, VariantStockHistory } from '@lezzet/application';
import type { StockLevelRow } from '../stock-types';

/**
 * **SEÇİLİ ÜRÜNÜN STOK GEÇMİŞİ** — sağ panel (22.30).
 *
 * ── NEDEN "EN ACİL PARTİLER"İN YERİNE GEÇTİ ─────────────────────────────────
 * Burada karar kuyruğunun ilk üçü duruyordu; tamamı bir sekme ötedeydi ve başlık satırı zaten kaç
 * parti beklediğini söylüyor (kullanıcı tespiti 14.08: *"bir tık ötemdeki bir listeyi koymak çok
 * anlamlı mı?"*). Aynı ekranın en geniş boş alanı, hiçbir yerde cevabı olmayan bir soruya ayrıldı:
 * *"bu üründen ne zaman, kaça girdi; ne kadarı satıldı, ne kadarı çöpe gitti"*.
 *
 * Yan etkisi bir arıza kapattı: satır seçimi (`selectedId`) yazılıyor ama HİÇBİR YERDE
 * okunmuyordu — tüketicisi olmayan bir seçim, tıklamayı sessizce boşa çıkarıyordu.
 *
 * ── OKUMA TIKLANDIĞINDA ─────────────────────────────────────────────────────
 * Panel kendi verisini çekiyor (sunucu eylemi), sayfa okumasında değil: listedeki yirmi ürünün
 * geçmişini önden getirmek, bakılmayacak on dokuzunu boşa okumak olurdu.
 */
interface ProductHistoryPanelProps {
  row: StockLevelRow | null;
  /** Depo adları — parti satırı hangi rafta durduğunu söyler (çok depolu bakışta). */
  warehouseNames: Map<string, string>;
  showWarehouse: boolean;
  /** Tablodaki depo süzgecinin KODU ('' = süzgeç yok) — panel satırla aynı evreni açar (22.32). */
  warehouseFilter: string;
  /** Süzgeç aktifse deponun adı — panel hangi evrene baktığını YAZAR, tahmin ettirmez. */
  warehouseFilterName: string | null;
}

export function ProductHistoryPanel({
  row,
  warehouseNames,
  showWarehouse,
  warehouseFilter,
  warehouseFilterName,
}: ProductHistoryPanelProps) {
  const [history, setHistory] = useState<VariantStockHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variantId = row?.variantId ?? null;
  const availableQty = row?.availableQty ?? 0;

  useEffect(() => {
    if (!variantId) {
      setHistory(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    void readVariantHistoryAction(variantId, availableQty, warehouseFilter)
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
    // Süzgeç bağımlılıkta: depo değişince panel YENİDEN okunur — yoksa başlık yeni deponun,
    // gövde eski deponun gerçeğini gösterirdi.
  }, [variantId, availableQty, warehouseFilter]);

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
    <div className="flex min-h-0 flex-col bg-ops-subtle">
      <div className="flex flex-none flex-col gap-0.5 border-b border-ops-line px-5 py-3">
        <span className="truncate font-ops-display text-ops-base font-semibold text-ops-ink" title={row.title}>
          {row.title}
        </span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          Kullanılabilir {num(row.availableQty)} · elde {num(row.physicalQty)}
          {row.reservedQty > 0 ? ` · ${num(row.reservedQty)} ayrılmış` : ''}
        </span>
        {/* **Hangi evren** — süzgeç aktifken panelin tamamı o deponun gerçeğidir ve bunu YAZAR.
            Söylenmeseydi operatör aynı sayıları bütün depoların toplamı sanardı. */}
        {warehouseFilterName ? (
          <span className="font-ops-body text-ops-micro text-ops-blue-dark">
            Yalnız {warehouseFilterName} — tablo süzgeci panele de uygulandı
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-3.5">
        {loading ? <span className="font-ops-body text-ops-sm text-ops-muted">Geçmiş okunuyor…</span> : null}
        {error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}

        {history ? (
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
 * **MALIN AKIŞI — "aldığım stok nereye gitti"** (22.31, kullanıcı tespiti 14.08).
 *
 * Girenden satılanı ve düşüleni çıkarınca elde kalması gereken sayı çıkar. Denklem EKRANDA duruyor
 * çünkü asıl soru sayıların kendisi değil, birbirini tutup tutmadığı: tutmuyorsa arada kayıt
 * düşmemiş bir hareket var demektir ve bunu ancak yan yana görünce fark edersiniz.
 *
 * **Liste tavana dayandıysa satır ÇİZİLMEZ:** giren toplam eksik olurdu ve tutmayan bir denklem,
 * tutuyormuş gibi görünürdü (`CLAUDE §1` — eksik ölçümü sağlıklı gibi okutmak).
 */
function FlowLine({ history }: { history: VariantStockHistory }) {
  if (history.truncated) {
    return (
      <span className="font-ops-body text-ops-xs text-ops-faint">
        Akış özeti çizilmedi: bu boyun giriş geçmişi gösterilenden uzun, toplamlar eksik kalırdı.
      </span>
    );
  }
  const { intakeQty, deliveredQty, pickedQty, lostQty, onHandQty } = history.flow;
  // Denklem tutuyor mu — tutmuyorsa sebebi kayda geçmemiş bir harekettir ve ekran bunu SÖYLER.
  // **Hazırlanan mal denklemde YOK** ve olmamalı: teslim edilene kadar `physical_qty`de duruyor.
  const balanced = intakeQty - deliveredQty - lostQty === onHandQty;
  return (
    <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-ops-body text-ops-sm">
        <Flow label="giren" value={intakeQty} tone="ink" />
        <span className="text-ops-faint">−</span>
        <Flow label="teslim" value={deliveredQty} tone="olive" />
        <span className="text-ops-faint">−</span>
        <Flow label="düşülen" value={lostQty} tone={lostQty > 0 ? 'amber' : 'muted'} />
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
      {balanced ? null : (
        <span className="font-ops-body text-ops-micro text-ops-amber">
          Denklem tutmuyor — kayda geçmemiş bir hareket var (transferle gelen/giden parti ya da elle
          düzeltilmiş adet).
        </span>
      )}
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
 * **AYRILMIŞ MAL KİME AYRILMIŞ** (22.31) — "1 ayrılmış" yazıyordu, neye ayrıldığı hiçbir yerde yoktu.
 *
 * Ayrılmış mal depoda DURUYOR ama satılamaz; sahibi görünmezse operatör ya kayıp sanır ya elle
 * aramaya çıkar. Sipariş numarası tıklanabilir değil — bu bir stok ekranı, sipariş kendi ekranında.
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
 * Dört sayı: satış hızı · yeterlilik · ortalama parti ömrü · fire oranı.
 *
 * **Ölçülemeyen her hücre "—" ve sebebi yazılı** (`CLAUDE §1`). "Günde 0 satıyor" ile "hiç satış
 * görmedik" aynı şey değil: birincisi stoğun sonsuza kadar yeteceğini söyler.
 */
function SummaryGrid({ history }: { history: VariantStockHistory }) {
  const { rate, averageLife, loss } = history;
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* **"Hiç satıldı mı" sorusu penceresiz cevaplanır** (22.31): son 90 günde çıkış olmaması
          "hiç satılmadı" demek değildir — ürün geçen yıl satılmış olabilir. Alt not bu yüzden ömür
          boyu satışa bakıyor ve satış varsa gününü söylüyor. */}
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
      <Stat
        label="Fire"
        value={loss.percent === null ? '—' : `%${loss.percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
        note={loss.qty === 0 ? 'düşülen mal yok' : `${num(loss.qty)} adet · girene oranla`}
        tone={loss.percent !== null && loss.percent > 0 ? 'amber' : 'plain'}
      />
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

/** Fire kırılımı — "ne kadarı çöpe gitti, neden". Sıfırsa blok hiç çizilmez. */
function LossBlock({ history }: { history: VariantStockHistory }) {
  if (history.loss.byReason.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted">
        Fire kırılımı
      </span>
      <div className="flex flex-wrap gap-1.5">
        {history.loss.byReason.map((entry) => (
          <span
            key={entry.reason}
            className="rounded-ops-chip border border-ops-line bg-ops-white px-2.5 py-1 font-ops-body text-ops-xs text-ops-body"
          >
            {LOSS_REASON[entry.reason]} <span className="font-ops-mono font-semibold text-ops-ink">{num(entry.qty)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
