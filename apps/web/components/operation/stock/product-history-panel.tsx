'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Select } from '@/components/operation/form/select';
import { Skeleton, SkeletonCard, SkeletonMetric, SkeletonRows } from '@/components/operation/ui/skeleton';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { money, num, shortDate } from '@/components/operation/ui/format';
import { LOSS_REASON } from '@/lib/stock/loss-labels';
import { readVariantHistoryAction } from '@/lib/stock/history-actions';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@lezzet/types';
import type { VariantBatchHistory, VariantStockHistory } from '@lezzet/application';
import type { StockLevelRow, StockWarehouseSplit } from '@/lib/stock/level-rows';

/**
 * **SEÇİLİ ÜRÜNÜN STOK GEÇMİŞİ** — sağ panel (22.30).
 *
 * İKİ YÜZEYİN ORTAK PANELİ (16.08, kullanıcı kararı): stok ekranının sağ sütunu VE ürünler
 * önizlemesinin "Stok" bakış diyaloğu aynı gövdeyi çizer — stok sayfasında nasıl açılıyorsa
 * diyalogda da öyle açılır. Sayfa klasöründen buraya taşındı (kardeş sayfadan yalnız `*-url`
 * import edilir, STACK §7); satır tipi ve sebep sözlüğü de lib'e indi
 * (`lib/stock/level-rows` · `lib/stock/loss-labels`).
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
  /** Kabın ek sınıfları — diyalog kullanımı yükseklik verir (`h-full`), sayfa grid'i vermez. */
  className?: string;
}

export function ProductHistoryPanel({
  row,
  warehouseNames,
  showWarehouse,
  warehouseFilter,
  warehouseFilterName,
  className = '',
}: ProductHistoryPanelProps) {
  const [history, setHistory] = useState<VariantStockHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * **PANEL İÇİ DEPO SEÇİMİ** (22.34) — `''` = tümü, aksi hâlde depo KODU.
   *
   * Tablo süzgeci başlangıcı belirler ama panele KİLİT değildir: operatör tek üründe kalıp
   * depolar arasında gezinebilmeli — 22.32'de kurulan "panel satırla aynı evreni gösterir"
   * kuralı bununla çelişmiyor, onu genişletiyor: evren yine YAZILI, sadece artık seçilebilir.
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
    // **ÖNCEKİ ÜRÜNÜN VERİSİ BIRAKILIR** (kullanıcı tespiti 15.08). Durmasının iki bedeli vardı:
    // (1) iskelet eski içeriğin ÜSTÜNE ekleniyordu — liste bir uzayıp sonra kısalıyordu; (2) o kısa
    // an boyunca ekranda BAŞKA bir ürünün satış hızı, yeterliliği ve giriş geçmişi duruyordu, üstelik
    // başlıkta yeni ürünün adıyla. İkincisi daha tehlikelisi: yanlış veri, geç gelen veriden kötüdür.
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
          {/* Görsel BAŞLIKTA (kullanıcı isteği 15.08): listede satırı tanıtan şey burada da
              duruyor — panel açılınca "doğru ürüne mi baktım" sorusu okumadan cevaplanmalı. */}
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
        {/* **TEK KARAR, ÜÇ HÂL** — iskelet · hata · içerik birbirini DIŞLAR. Üçü ayrı `{x ? … : null}`
            olarak durduğunda ikisi aynı anda çizilebiliyordu ve tam olarak öyle oldu (yukarıdaki
            künye). Ayrı koşullar "hangisi ne zaman görünür" sorusunu okuyana bıraktı; zincir onu
            koda yazıyor. */}
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
  const { intakeQty, deliveredQty, pickedQty, lostQty, inTransitQty, onHandQty } = history.flow;
  // Denklem tutuyor mu — tutmuyorsa sebebi kayda geçmemiş bir harekettir ve ekran bunu SÖYLER.
  //
  // **Hazırlanan mal denklemde YOK** ve olmamalı: teslim edilene kadar `physical_qty`de duruyor.
  // **Yoldaki mal ise VAR** (22.34): transferin ortasında mal hiçbir deponun stoğunda değildir —
  // kaynaktan `dispatch`te düştü, hedefte ancak `receive` ile parti olacak. Onsuz denklem tam
  // transfer adedi kadar sapıyordu ve ekran bunu "kayda geçmemiş hareket" sanıp operatörü olmayan
  // bir arızayı aramaya gönderiyordu (ölçüldü 15.08, kullanıcı ekran görüntüsü).
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
 * **PANELİN BEKLEME HÂLİ** (22.34) — çıplak *"Geçmiş okunuyor…"*ın yerine.
 *
 * Ortak iskelet künyesinin yasakladığı şey buradaydı: çıplak metnin gelecek içeriğin ŞEKLİ yoktur ve
 * veri gelince panel bir anda dolup yerleşimi zıplatır. Panel her ürün tıklamasında yeniden okuduğu
 * için o zıplama sürekli yaşanıyordu — bir sayfa açılışında bir kez değil.
 *
 * Sıra GERÇEK gövdenin sırasıdır: akış satırı → dört ölçüm kutusu → giriş geçmişi. Rezervasyon ve
 * fire blokları çizilmez, çünkü ikisi de KOŞULLU (yalnız veri varken görünürler) — olmayabilecek bir
 * şeyin yerini önden ayırmak, iskeletin verdiği sözü tutmamak olurdu.
 *
 * DIŞA AÇIK (16.08): stok bakış diyaloğu, satır verisi henüz yoldayken de aynı iskeleti çizer —
 * bekleme hâli iki yüzeyde aynı şekli almalı, yoksa diyalog kendi "yükleniyor" metnini uydururdu.
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
 * **DEPOLAR ARASI GEÇİŞ** (kullanıcı isteği 15.08: *"tümü ve ayrı ayrı depoları görebileyim"*).
 *
 * ── ÜÇ HÂL, TEK KAYNAK ──────────────────────────────────────────────────────
 * Küme `row.warehouses` — yalnız MALI OLAN depolar (`StockWarehouseSplit` künyesi). Boş ya da tek
 * elemanlıysa geçiş ÇİZİLMEZ: seçenek sunmayan bir seçici, operatöre tıklanacak bir şey vaat edip
 * hiçbir şey yapmaz. Tek depoluysa hangi depo olduğu zaten parti satırlarında yazılı.
 *
 * ── SEKME Mİ SEÇİCİ Mİ ──────────────────────────────────────────────────────
 * `TAB_LIMIT`e kadar sekme: hepsi bir bakışta görünür ve tek tıkla geçilir. Üstünde seçici —
 * kullanıcının kuralı (*"üç depodan daha fazlaysa seçiciyle geçiş"*) ve sebebi ölçülebilir: yedi
 * depolu bir şerit panelin dar sütununda ya taşar ya da okunmayacak kadar küçülür.
 *
 * ── TABLO SÜZGECİ KİLİTLER ──────────────────────────────────────────────────
 * Üstte bir depo süzgeci aktifse panel o depoyu AŞAMAZ: tablo tek deponun satırlarını gösterirken
 * panelin başka bir depoyu açması, aynı ekranda iki farklı gerçek olurdu (22.32'nin kararı).
 * O hâlde geçiş yerine hangi depoya bakıldığı YAZILIR.
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
      {/* FİRE ARTIK HEP POZİTİF (22.34 · kullanıcı kararı 26.08): sayım farkı bu toplamdan çıkarıldı,
          çünkü iki yönlü olduğu için oranı eksiye düşürüyordu (`%−2,1` — hesap doğru, "FİRE" başlığı
          altında okunmuyordu). Burada yalnız gerçek kayıp var: imha · hasar · kayıp. */}
      <Stat
        label="Fire"
        value={loss.percent === null ? '—' : `%${loss.percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
        note={loss.qty === 0 ? 'düşülen mal yok' : `${num(loss.qty)} adet · girene oranla`}
        tone={loss.percent !== null && loss.percent > 0 ? 'amber' : 'plain'}
      />
      {/* SAYIM FARKI KENDİ KUTUSUNDA ve yalnız sapma VARSA çizilir: sıfır bir sapma, gösterilecek
          bir olay değil — sıfırla dolu bir kutu ölçümün kendisini gürültüye çevirirdi.
          İşaret KORUNUR: eksi "eksik çıktı", artı "fazla çıktı" demektir ve ikisi ayrı sorulardır. */}
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
