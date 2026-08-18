import Link from 'next/link';
import { Card, cardClass } from '@/components/operation/ui/card';
import { PageHeader } from '@/components/operation/ui/page-header';
import type { OpsTone } from '@/components/operation/ui/tone';
import { num } from '@/components/operation/ui/format';
import type { AlertBandView, DashboardData, DeliveryRouteView, KpiCardView, QueueGroupView, RouteFlowView } from './dashboard-types';

// Panel (09.3) sunumu — operasyon web'i masaüstü-yalnız (`CLAUDE §2`); mobil deneyim native
// uygulamada. Renk YOK, ton var: her blok `OpsTone`u kendi sınıflarına çeviriyor (`tone.ts` kuralı).
//
// Ekranın sözleşmesi: **karar tetikler, iş bitirmez.** Bu yüzden burada tek etkileşim KÖPRÜ'dür —
// form, düğme aksiyonu, satır seçimi yok. Durum da yok, o yüzden istemci katmanı hiç kurulmadı.

const TEXT_TONE: Record<OpsTone, string> = {
  neutral: 'text-ops-muted',
  olive: 'text-ops-olive-dark',
  amber: 'text-ops-amber-dark',
  red: 'text-ops-red-dark',
  blue: 'text-ops-blue-dark',
  slate: 'text-ops-slate-dark',
  violet: 'text-ops-violet',
};

const EDGE_TONE: Record<OpsTone, string> = {
  neutral: 'border-l-ops-line-strong bg-ops-card',
  olive: 'border-l-ops-olive bg-ops-olive-bg',
  amber: 'border-l-ops-amber bg-ops-amber-bg',
  red: 'border-l-ops-red bg-ops-red-bg',
  blue: 'border-l-ops-blue bg-ops-blue-bg',
  slate: 'border-l-ops-slate bg-ops-slate-bg',
  violet: 'border-l-ops-violet bg-ops-violet-bg',
};

/**
 * Yalnız ZEMİN — kenarlıksız yüzeyler için (çip, sayı rozeti, akış kolonu).
 *
 * `EDGE_TONE` sol kenarlık rengini de taşıyor; kenarlıksız bir çipte onu `border-l-0` ile iptal
 * etmek gerekiyordu ve aynı iki sınıf beş yerde yan yana yazılıyordu. Ayrı tablo, ayrı iş.
 */
const BG_TONE: Record<OpsTone, string> = {
  neutral: 'bg-ops-gray-100',
  olive: 'bg-ops-olive-bg',
  amber: 'bg-ops-amber-bg',
  red: 'bg-ops-red-bg',
  blue: 'bg-ops-blue-bg',
  slate: 'bg-ops-slate-bg',
  violet: 'bg-ops-violet-bg',
};

const DOT_TONE: Record<OpsTone, string> = {
  neutral: 'bg-ops-line-strong',
  olive: 'bg-ops-olive',
  amber: 'bg-ops-amber',
  red: 'bg-ops-red',
  blue: 'bg-ops-blue',
  slate: 'bg-ops-slate',
  violet: 'bg-ops-violet',
};

/**
 * Şeridin KOYU zemininde yaşayan ton — ayrı tablo, çünkü öteki üçü açık zemin için kalibre.
 * `DOT_TONE`un amberi (#9a6416) koyu şeritte okunmaz; burada her ailenin en parlak kademesi
 * kullanılıyor (`-dot` varyantları zaten "koyu zeminde nabız" için tanımlıydı).
 *
 * Yedi ton da yazılı ama şerit bugün yalnız dördünü üretiyor (`dashboard-read`: red · amber ·
 * olive · neutral); kalanlar `Record` bütünlüğü için ve yanlış varsayılana düşmemek için burada.
 */
const BAND_ACCENT: Record<OpsTone, { dot: string; text: string }> = {
  neutral: { dot: 'bg-ops-band-muted', text: 'text-ops-band-muted' },
  olive: { dot: 'bg-ops-olive-light', text: 'text-ops-olive-light' },
  amber: { dot: 'bg-ops-amber-dot', text: 'text-ops-amber-dot' },
  red: { dot: 'bg-ops-alarm-dot', text: 'text-ops-alarm-dot' },
  blue: { dot: 'bg-ops-blue', text: 'text-ops-blue' },
  slate: { dot: 'bg-ops-slate', text: 'text-ops-slate' },
  violet: { dot: 'bg-ops-violet-dot', text: 'text-ops-violet-dot' },
};

/**
 * Depo kodu çipi — "hangi tesisten" bağlamı. Panelde iki yerde geçiyor (rota başlığı, nabız satırı)
 * ve mavi aile bilinçli: kod bir uyarı değil, bir BİLGİdir; kurşuni ölçüm/fark için ayrılmış.
 * Kod `null` ise çip hiç çizilmez — ad çözülemediğinde boş bir kutu göstermenin bilgi değeri yok.
 */
function WarehouseChip({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <span className="rounded-ops-chip border border-ops-blue-line bg-ops-blue-bg px-2 py-0.5 font-ops-mono text-ops-micro font-semibold text-ops-blue">
      {code}
    </span>
  );
}

interface DashboardDesktopProps {
  data: DashboardData;
}

/**
 * ── ZEMİN VE BAŞLIK BARI (18.08) ────────────────────────────────────────────
 * Kök `bg-ops-card` taşımak ZORUNDA: kabuğun zemini `ops-bg` (#dedbd3, bej) ve ekran kendi zeminini
 * çizmezse başlık barı ile paneller onu gösterir. Panel operasyonun bu sınıfı taşımayan TEK ekranıydı
 * ve *"renkler tasarımdan koyu"* şikâyetinin sebebi buydu. **İlk teşhisim yanlıştı:** kabuğun rengini
 * değiştirmeye kalkmıştım, oysa eksik olan pane katmanı değil bu ekranın onu ÇİZMEMESİYDİ.
 * `docs:check §3g` kuralı makineyle zorluyor — `typecheck` göremez, eksik olan bir tip değil bir SINIF.
 *
 * Başlık barı ORTAK bileşen (kullanıcı isteği: panele depo seçici). Panel kendi başlığını ELLE
 * yazıyordu ve seçicinin olmamasının sebebi buydu — `PageHeader` depo seçicisini, ⌘K'yı ve kullanıcı
 * bloğunu kabuktan devralıp çiziyor. Ayrı bir seçici YAZILMADI: var olan kontrol, durduğu yerde.
 * Depo adı alt satırdan çıkarıldı — seçici zaten onu söylüyor.
 */
export function DashboardDesktop({ data }: DashboardDesktopProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title={`Bugün · ${data.now.label}`}
        subtitle="karar tetikler, analiz etmez · derin analiz Raporlar & Analitik'te"
        status={<span className="font-ops-mono text-ops-base font-medium text-ops-muted">{data.now.time}</span>}
      />

      {/* `[&>*]:shrink-0` — kaydırılan flex kolonunda çocuklar varsayılan olarak SIKIŞIR: akış bölümü
          rota sayısıyla uzayınca gösterge şeridi eziliyor ve etiketleri kırpılıyordu (ölçüldü 18.08).
          Taşan içerik kaydırılmalı, kısaltılmamalı. */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-8 [&>*]:shrink-0">
        <AlertBand band={data.band} />

        {data.kpis.length > 0 && <KpiStrip kpis={data.kpis} />}

        <FlowStrip rows={data.flow} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <QueueColumn data={data} />
          <div className="flex flex-col gap-5">
            <DeliveriesPanel routes={data.routes} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Üst şerit — günün tek en yakın eşiği. **Sakin günde kutlar, uyarmaz.**
 *
 * ── ZEMİN SABİT KOYU, TON YALNIZ NOKTA VE ETİKETTE (18.08) ──────────────────
 * Şerit bir dönem tonuna göre zemin değiştiriyordu (alarm bordosu ↔ sakin yeşili) ve ikisi de
 * yanlıştı. Ölçülen kusur şu: şeridin BAŞLIĞI sıradaki eşiği anlatır, TONU ise kuyruk
 * aciliyetinden gelir — yani *"hepsi hazır · bekleyen yok"* cümlesi bordo bir bantta okunuyordu.
 * Zemini tona bağlamak bunu çözmedi, yalnız yer değiştirdi: bu kez iyi haber alarm renginde değil,
 * kötü haber kutlama renginde çıkabilirdi.
 *
 * Tasarımın cevabı (`Operasyon - Dashboard.dc.html`): zemin HER ZAMAN koyu ink, ton yalnız
 * **noktada ve eyebrow'da** yaşar. Şerit böylece bir uyarı kutusu değil, günün sabit yönlendirme
 * çubuğu olur; renk orada bir hüküm değil, bir işarettir. Gerilim de kayboluyor çünkü zemin artık
 * hiçbir şey iddia etmiyor.
 */
function AlertBand({ band }: { band: AlertBandView }) {
  const accent = BAND_ACCENT[band.tone];

  return (
    <section className="flex items-center justify-between gap-6 rounded-ops-card bg-ops-band px-6 py-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <span className={`size-[7px] shrink-0 rounded-full ${accent.dot}`} />
          <span className={`font-ops-display text-ops-micro font-semibold tracking-[0.18em] ${accent.text}`}>{band.eyebrow}</span>
        </div>
        <h2 className="max-w-[40rem] font-ops-display text-ops-section font-semibold text-ops-band-ink">{band.headline}</h2>
        {band.detail && <p className="max-w-[40rem] font-ops-body text-ops-sm text-ops-band-muted">{band.detail}</p>}
      </div>
      {(band.primary ?? band.secondary) && (
        <div className="flex shrink-0 items-center gap-2.5">
          {band.primary && (
            <Link
              href={band.primary.href}
              className="cursor-pointer rounded-ops-btn bg-ops-olive-light px-4 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-band transition-colors hover:bg-ops-olive"
            >
              {band.primary.label}
            </Link>
          )}
          {band.secondary && (
            <Link
              href={band.secondary.href}
              className="cursor-pointer rounded-ops-btn border border-ops-band-line px-4 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-band-muted transition-colors hover:border-ops-band-muted hover:text-ops-band-ink"
            >
              {band.secondary.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Kritik göstergeler — **tek çerçeve, saç teli bölme çizgileri** (tasarım: `Operasyon -
 * Dashboard.dc.html`). Kartlar bir dönem ayrı ayrı yüzüyordu; sakin günde üçü sıfır olunca ekran
 * "boş kutular tarlası" gibi okunuyordu. Yoğun ızgara sıfırı da taşır: sayı küçükse hücre küçük
 * kalır, kutu büyük kalmaz.
 *
 * Hücre sayısı `kpis` uzunluğundan gelir — gösterge eklendiğinde (marj-altı, 09.4) ızgara kendi
 * kolonunu açar; sabit `grid-cols-4` yazılsaydı beşinci gösterge alt satıra düşer ve şerit
 * bozulurdu.
 */
function KpiStrip({ kpis }: { kpis: KpiCardView[] }) {
  return (
    <div
      className="grid overflow-hidden rounded-ops-card border border-ops-line bg-ops-subtle"
      style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}
    >
      {kpis.map((kpi) => (
        <Link
          key={kpi.key}
          href={kpi.link.href}
          className="flex cursor-pointer flex-col gap-1.5 border-r border-ops-line px-4 py-3.5 transition-colors last:border-r-0 hover:bg-ops-gray-100"
        >
          <span className="font-ops-display text-ops-micro font-medium tracking-[0.08em] text-ops-muted uppercase">{kpi.label}</span>
          <span className="font-ops-mono text-ops-display leading-none font-medium tracking-tight text-ops-ink">{kpi.value}</span>
          {/* Seri BOŞSA çubuklar hiç çizilmez — ölçülmeyen sıfır değildir (`CLAUDE §1`). */}
          {kpi.series.length > 0 && <Sparkline series={kpi.series} tone={kpi.deltaTone} />}
          {/* Delta ve kırılım MİKRO kademede: tasarımın 11,5/10,5 px'i merdivende `micro`ya düşüyor
              (`xs` 13px'ti ve yanlış eşlemeydi). Ölçüldü — `xs`te "kapıda 320,80 € · vade 1.286,20 €"
              sarıyor ve alt satırda yalnız "€" kalıyordu; kolon sayısı beşe çıkınca daha da sıkışır. */}
          {kpi.delta && <span className={`font-ops-mono text-ops-micro ${TEXT_TONE[kpi.deltaTone]}`}>{kpi.delta}</span>}
          {kpi.split && <span className="font-ops-mono text-ops-micro text-ops-muted">{kpi.split}</span>}
          <span className="font-ops-display text-ops-xs font-semibold text-ops-olive">{kpi.link.label}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Yedi günlük seyir — son çubuk bugündür ve tonu taşır; öncekiler soluk kalır.
 *
 * Çubuklar **değerin altında** durur ve yanında "7 gün" yazar. Eskiden sağ üst köşede etiketsiz
 * duruyordu: ne olduğu okunmayan, sayıdan kopuk bir çizgi kümesiydi — grafik değil moloz.
 */
function Sparkline({ series, tone }: { series: number[]; tone: OpsTone }) {
  const max = Math.max(...series, 1);
  return (
    <div className="flex h-5 items-end gap-[2px]">
      {series.map((value, i) => (
        <span
          key={i}
          aria-hidden
          className={`w-[7px] rounded-t-sm ${i === series.length - 1 ? DOT_TONE[tone] : 'bg-ops-olive-line'}`}
          style={{ height: `${Math.max(4, Math.round(4 + (value / max) * 16))}px` }}
        />
      ))}
      <span className="ml-1.5 self-end font-ops-body text-ops-micro text-ops-faint">7 gün</span>
    </div>
  );
}

/**
 * Gün akışı — **her rota kendi kart şeridini alır, altında tek satırlık nabzı** (kullanıcı kararı
 * 18.08). Kartların tasarımı DEĞİŞMEDİ: aynı çerçeve, aynı üst şerit, aynı çip. Değişen tek şey
 * kartların rota başına tekrarlanması ve şeridin kime ait olduğunun yazılması.
 *
 * **Bugün koşmayan rota da görünür ama SÖNÜKTÜR** — gizlemek, hangi rotaların var olduğunu
 * saklardı; sönük göstermek "var ama bugün değil" der ve saatleri hiçbir hesaba girmez.
 */
function FlowStrip({ rows }: { rows: RouteFlowView[] }) {
  const active = rows.filter((r) => r.runsToday).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Gün akışı</h2>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {rows.length > 0 ? `${num(active)}/${num(rows.length)} rota bugün · eşikler ayardan` : 'tanımlı rota yok'}
        </span>
      </div>

      {rows.length === 0 ? (
        <Card className="p-5">
          <span className="font-ops-body text-ops-sm text-ops-muted">
            Seçili depoda tanımlı rota yok — sefer takvimi Teslimat &amp; Rota&apos;dan kurulur.
          </span>
        </Card>
      ) : (
        rows.map((row) => <RouteFlowRow key={row.zoneId} row={row} />)
      )}
    </section>
  );
}

/**
 * Bir rotanın şeridi: künye satırı → **onaylı kart şeridi** → nabız satırı.
 *
 * Kart markup'ı 113d5d6a'daki hâliyle BİREBİR aynı: tek çerçeve, kolonlar arası saç teli ayraç,
 * kolonun üstünde 3px durum şeridi, saat + "önceki gün" damgası + durum çipi, başlık, not. Rota
 * bazına geçerken bir tur bunu yanlışlıkla ayrı yüzen kartlara çevirmiştim (kullanıcı bildirdi
 * 18.08) — tekrarlanan şey ŞERİDİN KENDİSİ, kartın tasarımı değil.
 */
function RouteFlowRow({ row }: { row: RouteFlowView }) {
  return (
    // Sönük rota tüm bloğu soluklaştırır: her öğeyi ayrı boyamak yerine kapsayıcıya opaklık vermek,
    // "bu blok bugün konuşmuyor" cümlesini tek yerde kurar.
    <div className={`flex flex-col gap-2 ${row.runsToday ? '' : 'opacity-55'}`}>
      <div className="flex items-center gap-2">
        <WarehouseChip code={row.warehouseCode} />
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{row.zoneName}</span>
        {/* Koşmayan rotanın günleri — "bugün değil" demek yetmez, NE ZAMAN olduğu da söylenmeli. */}
        {row.weekdayLabel && (
          <span className="rounded-ops-chip bg-ops-gray-100 px-2 py-0.5 font-ops-mono text-ops-micro font-medium text-ops-muted">
            {row.weekdayLabel}
          </span>
        )}
        <span className="h-px flex-1 bg-ops-line" />
        <span className={`font-ops-display text-ops-micro font-semibold ${TEXT_TONE[row.tone]}`}>{row.statusLabel}</span>
      </div>

      <div className={cardClass('grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]')}>
        {row.steps.map((step) => (
          <div
            key={step.key}
            className={`flex flex-col border-r border-ops-line-soft last:border-r-0 ${
              step.state === 'now' ? (step.tone === 'olive' ? 'bg-ops-subtle' : BG_TONE[step.tone]) : ''
            }`}
          >
            {/* Üstteki 3px şerit — kolonun durumunu kenarlıkla değil ÇİZGİYLE söyler (tasarım).
                Sol kenarlık kart başına düşen bir işaretti; yan yana dizilen kolonlarda sol kenar
                bir öncekinin sağ ayracına yapışıyor ve iki çizgi tek kalın çizgi gibi okunuyordu. */}
            <div
              className={`h-[3px] ${
                step.state === 'done' ? 'bg-ops-olive' : step.state === 'now' ? DOT_TONE[step.tone] : 'bg-ops-line-strong'
              }`}
            />
            <div className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className={`size-[7px] shrink-0 rounded-full ${step.state === 'later' ? 'bg-ops-line-strong' : DOT_TONE[step.tone]}`}
                  />
                  <span className={`font-ops-mono text-ops-sm font-medium ${step.state === 'later' ? 'text-ops-muted' : 'text-ops-ink'}`}>
                    {step.time}
                  </span>
                  {/* **"önceki gün" damgası:** bu saat teslim gününe değil bir öncekine ait. Bugünün
                      listesini kapatan olay dün akşam oldu — kolon bu yüzden BAŞTA ve `tamam`
                      durumunda (kullanıcı bildirdi 18.08). */}
                  {step.prevDay && (
                    <span
                      title="Bu saat bir önceki güne ait — hazırlık kapanışından sonra olduğu için kesim bir gün geriye kayar"
                      className="rounded-ops-chip bg-ops-red-bg px-1.5 font-ops-body text-ops-micro font-medium whitespace-nowrap text-ops-red"
                    >
                      önceki gün
                    </span>
                  )}
                </span>
                {/* Durum ÇİPİ — düz metin değil. Kolonlar yan yana dururken çıplak "sırada"/"tamam"
                    kelimeleri not satırıyla aynı ağırlıkta okunuyordu. */}
                <span
                  className={`shrink-0 rounded-ops-chip px-1.5 py-px font-ops-display text-ops-micro font-semibold tracking-[0.06em] ${
                    step.state === 'done'
                      ? 'bg-ops-olive-bg text-ops-olive-dark'
                      : step.state === 'now'
                        ? `${BG_TONE[step.tone]} ${TEXT_TONE[step.tone]}`
                        : 'bg-ops-gray-100 text-ops-muted'
                  }`}
                >
                  {step.state === 'done' ? 'tamam' : (step.countdown ?? 'sırada')}
                </span>
              </div>
              <span className={`font-ops-display text-ops-base font-semibold ${step.state === 'now' ? 'text-ops-ink' : 'text-ops-body'}`}>
                {step.title}
              </span>
              <span className="font-ops-body text-ops-xs text-ops-muted">{step.note}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Nabız — ayrı blok değil, rotanın ALTINDA tek satır (kullanıcı kararı: "daha minimal"). */}
      <div className="flex items-center gap-3 px-1">
        <span className="font-ops-mono text-ops-xs text-ops-muted">
          {num(row.readyCount)}/{num(row.totalCount)} hazır
        </span>
        <span className="h-1.5 w-[9rem] shrink-0 overflow-hidden rounded-full bg-ops-line-strong">
          <span
            className={`block h-full rounded-full ${DOT_TONE[row.tone]}`}
            style={{ width: `${row.totalCount === 0 ? 0 : Math.round((row.readyCount / row.totalCount) * 100)}%` }}
          />
        </span>
        <span className="font-ops-body text-ops-xs text-ops-muted">{row.note}</span>
      </div>
    </div>
  );
}

/** Bekleyen işler — üç aciliyet kümesi + asistan önerileri. Boş kuyruk "temiz masa"dır. */
function QueueColumn({ data }: { data: DashboardData }) {
  const total = data.queue.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.count, 0), 0);

  return (
    <section id="bekleyen-isler" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Bekleyen işler</h2>
        {total > 0 && <span className="font-ops-body text-ops-xs text-ops-muted">{num(total)} kalem</span>}
      </div>

      {data.queue.length === 0 ? (
        <Card className="flex flex-col gap-1 border-l-2 border-l-ops-olive bg-ops-olive-bg p-5">
          <span className="font-ops-body text-ops-base font-semibold text-ops-ink">Bekleyen iş yok — masa temiz</span>
          <span className="font-ops-body text-ops-sm text-ops-muted">
            Onay, talep, gecikmiş vade ve tarihli parti kuyruğu boş. Bugün karar bekleyen bir şey yok.
          </span>
        </Card>
      ) : (
        data.queue.map((group) => <QueueGroup key={group.key} group={group} />)
      )}

      {data.proposals && (
        <Card className="flex items-start justify-between gap-4 border-l-2 border-l-ops-violet bg-ops-violet-bg p-4">
          <div className="flex flex-col gap-1">
            <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">
              {num(data.proposals.count)} asistan önerisi bekliyor
            </span>
            <span className="font-ops-body text-ops-xs text-ops-muted">{data.proposals.detail}</span>
          </div>
          <Link
            href={data.proposals.href}
            className="shrink-0 cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-violet transition-colors hover:text-ops-ink"
          >
            Kuyruğa git →
          </Link>
        </Card>
      )}
    </section>
  );
}

/**
 * `etiket — saç teli çizgi — ölçü` satırı. Çizgi süs değil: kümeler alt alta dizildiğinde nerede
 * bittikleri ancak böyle okunuyor; onsuz üç küme tek uzun liste gibi görünüyordu.
 *
 * **Yan yana duran İKİ SÜTUNUN hizasını da bu satır kuruyor** (18.08, kullanıcı bildirdi, ölçüldü).
 * Kuyruk sütununda kartlardan önce bir küme etiketi vardı, teslimat sütununda yoktu: soldaki ilk
 * kart `y=661,5`te, sağdaki kutu `y=634`te başlıyordu — 27,5 px kayma (etiket 19,5 + boşluk 8).
 * İki sütun aynı yükseklikte başlayıp içerikleri farklı yerde başlayınca göz kırık bir taban
 * çizgisi okuyor. Çözüm ölçüyü BAŞLIK satırından buraya indirmek: yeni metin uydurulmadı, var olan
 * ölçü bir kademe aşağı taşındı ve iki sütun yapıca eşitlendi.
 *
 * `label` isteğe bağlı — teslimat sütununun aciliyet kümesi yok, orada satır çıplak ayraç olarak
 * durur. Etiketsiz hâlde de aynı yüksekliği verir; hiza zaten ondan doğuyor.
 */
function RuleRow({ label, tone, meta }: { label?: string; tone?: OpsTone; meta: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span
          className={`font-ops-display text-ops-micro font-semibold tracking-[0.13em] uppercase ${tone ? TEXT_TONE[tone] : 'text-ops-muted'}`}
        >
          {label}
        </span>
      )}
      <span className="h-px flex-1 bg-ops-line" />
      <span className="font-ops-mono text-ops-xs text-ops-faint">{meta}</span>
    </div>
  );
}

function QueueGroup({ group }: { group: QueueGroupView }) {
  return (
    <div className="flex flex-col gap-2">
      <RuleRow label={group.title} tone={group.tone} meta={group.summary} />
      {group.items.map((item) => (
        <Card key={item.key} className={`flex items-center gap-3.5 border-l-[3px] px-4 py-3 ${EDGE_TONE[item.tone]}`}>
          {/* Sayı ROZET içinde: satırın solundaki çıplak rakam başlıkla aynı hizada duruyor ve
              "kaç tane" sorusunun cevabı metnin içinde kayboluyordu. */}
          <span
            className={`grid size-[34px] shrink-0 place-items-center rounded-ops-card font-ops-mono text-ops-lead font-semibold ${BG_TONE[item.tone]} ${TEXT_TONE[item.tone]}`}
          >
            {num(item.count)}
          </span>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{item.title}</span>
              {item.stamp && (
                <span
                  className={`rounded-ops-chip px-1.5 py-px font-ops-mono text-ops-micro font-medium ${BG_TONE[item.tone]} ${TEXT_TONE[item.tone]}`}
                >
                  {item.stamp}
                </span>
              )}
            </span>
            <span className="font-ops-body text-ops-sm text-ops-body">{item.detail}</span>
          </div>
          <Link
            href={item.link.href}
            className={`shrink-0 cursor-pointer font-ops-display text-ops-xs font-semibold transition-colors hover:text-ops-ink ${TEXT_TONE[item.tone]}`}
          >
            {item.link.label}
          </Link>
        </Card>
      ))}
    </div>
  );
}

/**
 * Bugünün teslimatları — duraklar DURUMA göre gruplanmış sırada gelir; numara verilmez ve
 * gelecek durak için saat gösterilmez (`design/KARARLAR.md` › Panel 17.08).
 */
function DeliveriesPanel({ routes }: { routes: DeliveryRouteView[] }) {
  const stopCount = routes.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Bugünün teslimatları</h2>

      {/* Ölçü artık başlığın yanında değil ayraç satırında — soldaki kuyruk sütunuyla hizayı bu
          kuruyor (`RuleRow` künyesi). İçerik `gap-2` ile sarılı, tıpkı bir kuyruk kümesi gibi. */}
      <div className="flex flex-col gap-2">
        <RuleRow meta={routes.length > 0 ? `${num(stopCount)} durak · ${num(routes.length)} rota` : 'rota siparişi yok'} />

        {routes.length === 0 ? (
          <Card className="p-5">
            <span className="font-ops-body text-ops-sm text-ops-muted">
              Bugüne rota siparişi yazılmadı — yalnız kargo ve bekleyen işler var.
            </span>
          </Card>
        ) : (
          routes.map((route) => (
            <Card key={route.key} className="flex flex-col">
              {/* Başlık şeridi zeminli ve ALTINDA ilerleme çubuğu var (tasarım): "3 / 8 teslim"
                sayısı tek başına okunuyor ama kıyaslanmıyordu — rotanın ne kadarının bittiği
                bakışta görülmeli, iki sayıyı bölerek değil. */}
              <div className="flex flex-col gap-2 border-b border-ops-line bg-ops-subtle px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-baseline gap-2">
                    <span className="font-ops-body text-ops-sm text-ops-body">
                      Kurye: <span className="font-semibold text-ops-ink">{route.courierName}</span>
                      {route.zoneLabel ? ` · ${route.zoneLabel}` : ''}
                    </span>
                    <WarehouseChip code={route.warehouseCode} />
                  </span>
                  <span className="shrink-0 font-ops-mono text-ops-xs text-ops-olive-dark">
                    {num(route.deliveredCount)} / {num(route.totalCount)} teslim
                  </span>
                </div>
                <div className="h-[5px] w-full overflow-hidden rounded-full bg-ops-line-strong">
                  <span
                    className="block h-full rounded-full bg-ops-olive"
                    style={{
                      width: `${route.totalCount === 0 ? 0 : Math.round((route.deliveredCount / route.totalCount) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <ul className="flex flex-col">
                {route.stops.map((stop) => (
                  <li key={stop.orderId} className="flex items-center gap-3 border-b border-ops-line-soft px-4 py-2.5 last:border-b-0">
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="font-ops-body text-ops-sm text-ops-ink">{stop.customerName}</span>
                      <span className="font-ops-body text-ops-micro text-ops-muted">
                        {stop.itemsLabel} · {stop.channelLabel}
                        {stop.dueLabel ? ` · ${stop.dueLabel}` : ''}
                      </span>
                    </div>
                    {/* Saat YALNIZ olmuş durakta: gelecek durak için tahmin yok ve olmayacak. */}
                    {stop.time && <span className="font-ops-body text-ops-xs text-ops-muted">{stop.time}</span>}
                    <span
                      className={`rounded-ops-chip px-2 py-0.5 font-ops-display text-ops-micro font-semibold ${BG_TONE[stop.tone]} ${TEXT_TONE[stop.tone]}`}
                    >
                      {stop.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
