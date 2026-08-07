'use client';

import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { DeliveryTabs } from './delivery-tabs';
import { Input } from '@/components/operation/form/input';
import { FieldShell } from '@/components/operation/form/field-shell';
import { ToggleField } from '@/components/operation/form/toggle';
import { WEEKDAYS } from '@/components/operation/form/calendar-math';
import { ZoneMap } from '@/components/operation/ui/zone-map';
import {
  keyOfPoint,
  type MapViewport,
  type ZoneCodeState,
  type ZoneMapPoint,
} from '@/components/operation/ui/zone-map-model';
import { agoShort, money, num } from '@/components/operation/ui/format';
import { PostalCodePicker } from './postal-code-picker';
import { distanceKm } from './routes-suggest';
import { ROUTE_NOTES } from './deliveries-labels';
import type { RouteView, RoutesData } from './routes-read';
import type { CodeStatsView, SuggestionView } from './routes-types';
import type { Country } from '@lezzet/types';

/**
 * **Rotalar** — güzergâh kurulumu (19.20 · 09.15). `Depolar - Bolge Haritasi.html`.
 *
 * Diyalog DEĞİL, sayfanın kendisi: rota kurmak dar bir kutuya sığmaz — operatör haritayı kaydırır,
 * yakınlaşır, komşu güzergâhla karşılaştırır. 280 piksellik bir pencerede yapılan iş, yapılmamış iştir.
 *
 * Harita SOLDA ve baskın: kod listesi haritanın SONUCUDUR, girdisi değil (tasarım §"Kod hâlleri").
 */
interface RoutesViewProps {
  data: RoutesData;
  selected: RouteView | null;
  draft: { name: string; weekdays: number[]; isActive: boolean; codes: RouteView['postalCodes'] } | null;
  onSelect: (routeId: string | null) => void;
  onDraft: (patch: Partial<NonNullable<RoutesViewProps['draft']>>) => void;
  onPick: (point: ZoneMapPoint) => void;
  onSave: () => void;
  /** Haritanın görüş alanı oturunca — yakınlık eşiği buradan hesaplanıyor. */
  onViewport: (viewport: MapViewport) => void;
  /** Yakınlık ölçülen eşiğin (`FREE_CODE_MIN_ZOOM`) altında mı — boştaki kodlar okunmaz. */
  tooFar: boolean;
  /** Görüş alanındaki boştaki kodlar. `null` = okunmadı; boş dizi = gerçekten yok. */
  freePoints: ZoneMapPoint[] | null;
  /** Okuma tavana dayandı mı — ekran bunu YAZMAK zorunda, sessiz kesme "yok" diye okunur. */
  truncated: boolean;
  /** Tıklamanın kısa geri bildirimi — haritanın altında belirir, 2,6 sn sonra söner. */
  hint: string | null;
  /** Kod aramasında ülke etiketini bastırmak için: kendi ülkemizin kodu sade yazılır. */
  homeCountry: Country;
  busy: boolean;
  error: string | null;
}

export function RoutesDesktop(props: RoutesViewProps) {
  const { data, selected, draft, tooFar } = props;

  // Kimlik SABİT tutuluyor: harita `points`/`stateOf` değişince tüm katmanı yeniden çiziyor ve bu
  // ikisi her render'da yeniden kurulsaydı, sönen bir ipucu şeridi bile yüzlerce noktayı baştan
  // çizdirirdi.
  const membership = useMemo(() => {
    const mine = new Set((draft?.codes ?? []).map(keyOfPoint));
    const taken = new Set<string>();
    for (const route of data.routes) {
      if (route.id === selected?.id) continue;
      for (const code of route.postalCodes) taken.add(keyOfPoint(code));
    }
    return { mine, taken };
  }, [data.routes, draft?.codes, selected?.id]);

  // Öneri, SEÇİLİ rotaya girmiş kodu artık önermez: eklendiği an mor nokta yeşile döner.
  const suggested = useMemo(
    () => new Map(data.suggestions.map((row) => [keyOfPoint(row), row])),
    [data.suggestions],
  );

  const stateOf = useCallback(
    (point: ZoneMapPoint): ZoneCodeState => {
      const key = keyOfPoint(point);
      if (membership.mine.has(key)) return 'mine';
      if (membership.taken.has(key)) return 'taken';
      return suggested.has(key) ? 'suggested' : 'free';
    },
    [membership, suggested],
  );

  /**
   * Uzaktayken boştaki kodlar ÇİZİLMEZ — ölçülmüş bir eşik (`FREE_CODE_MIN_ZOOM`): z10'un altında
   * komşu noktalar 29 pikselden yakına düşüp birbirine değiyor, z8'de tek bir lekeye dönüşüyor.
   * Tanımlı kodlar her yakınlıkta kalır: onlar aday değil, güzergâhın kendisidir ve haritanın
   * şeklini onlar veriyor.
   */
  /**
   * Haritanın çizdiği küme İKİ KAYNAKTAN birleşiyor ve ayrım kasıtlı:
   *
   * - **Sayfa okuması** (`data.points`): tanımlı kodlar + öneriler. Görüş alanına bağlı DEĞİL —
   *   önerilen `68000` ekranda görünmese bile listede durmalı, harita oraya kaydırılınca çizilmeli.
   * - **Görüş alanı okuması** (`freePoints`): boştaki kodlar. Kaydırmayla değişiyor.
   *
   * Çakışma sayfanın lehine: aynı kod iki kaynakta da varsa (tanımlı ya da önerilen bir kod görüş
   * alanına da düşer) sayfanınki kalır, yoksa "boşta" diye çizilip hâlini kaybederdi.
   */
  const points = useMemo(() => {
    const seen = new Set(data.points.map(keyOfPoint));
    // Önerilen kodun GEREKÇESİ etikete iliştiriliyor: "üzerine gelince neden önerildiği görünsün"
    // (kullanıcı isteği 07.08). Harita metni kurmuyor, taşıyor — sözlük ekranın tarafında.
    const own = data.points.map((point) => {
      const row = suggested.get(keyOfPoint(point));
      return row ? { ...point, note: ROUTE_NOTES.suggestionReason(row) } : point;
    });
    return [...own, ...(props.freePoints ?? []).filter((point) => !seen.has(keyOfPoint(point)))];
  }, [data.points, props.freePoints, suggested]);

  const freeCount = useMemo(() => points.filter((point) => stateOf(point) === 'free').length, [points, stateOf]);

  /**
   * Önerinin uzaklığı DÜZENLENEN rotanın kendi kodlarına göre ölçülüyor, tüm rotalara göre değil.
   *
   * Sunucuda hesaplanırken bu bir kusurdu (07.08, kontrol sırasında bulundu): Strasbourg'u
   * düzenlerken Kehl rotasının 5 km yanındaki kod da "rotaya 5 km" diye görünüyordu — oysa onu
   * Strasbourg'un güzergâhına eklemek coğrafi olarak anlamsız. İstemcide, taslağa göre hesaplanınca
   * hem doğru oluyor hem de kod ekledikçe canlı güncelleniyor.
   */
  const anchors = useMemo(() => {
    const coords = new Map(data.points.map((point) => [keyOfPoint(point), point]));
    return (draft?.codes ?? []).map((code) => coords.get(keyOfPoint(code))).filter((point) => point !== undefined);
  }, [data.points, draft?.codes]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Teslimat & Rota" subtitle="Dağıtım güzergâhları — kodlar, günler, harita">
        <DeliveryTabs value="routes" />
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] overflow-hidden">
      {/* Harita her zaman çizilir — rota seçilmemişken bile tanımlı güzergâhların şekli görünür;
          boş bir gri kutu, ekranın ne işe yaradığını anlatmazdı. */}
      <div className="min-h-0 border-r border-ops-line">
        <ZoneMap
          points={points}
          stateOf={stateOf}
          onPick={props.onPick}
          onViewport={props.onViewport}
          note={
            tooFar
              ? ROUTE_NOTES.mapTooFar
              : props.freePoints === null
                ? ROUTE_NOTES.mapUnread
                : ROUTE_NOTES.mapFree(freeCount, props.truncated)
          }
          hint={props.hint}
        />
      </div>

      <aside className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-ops-line-soft px-4 py-2.5">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Rotalar</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">{num(data.routes.length)}</span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => props.onSelect(null)}>
            + Rota
          </Button>
        </div>

        <ul className="border-b border-ops-line-soft">
          {data.routes.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                onClick={() => props.onSelect(route.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-ops-line-soft px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-ops-subtle ${
                  route.id === selected?.id ? 'bg-ops-olive-bg' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-ops-body text-ops-base text-ops-ink">{route.name}</span>
                  {route.isActive ? null : <Badge tone="slate">Pasif</Badge>}
                </span>
                <span className="font-ops-body text-ops-xs text-ops-muted">
                  {route.warehouseName} · {num(route.postalCodes.length)} kod
                  {route.weekdays.length > 0 ? ` · ${route.weekdays.map((d) => WEEKDAYS[d - 1]).join(' ')}` : ' · gün yok'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="flex flex-col gap-3.5 px-4 py-3">
            <FieldShell label="Rota adı" required>
              <Input value={draft.name} onChange={(e) => props.onDraft({ name: e.target.value })} placeholder="Strasbourg Merkez" />
            </FieldShell>

            <FieldShell
              label="Teslim günleri"
              labelAside={draft.weekdays.length === 0 ? 'gün verilmezse bu rota dağıtıma çıkmaz' : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, i) => {
                  const iso = i + 1;
                  const on = draft.weekdays.includes(iso);
                  return (
                    <Chip
                      key={iso}
                      active={on}
                      onClick={() =>
                        props.onDraft({
                          weekdays: on ? draft.weekdays.filter((d) => d !== iso) : [...draft.weekdays, iso].sort((a, b) => a - b),
                        })
                      }
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </FieldShell>

            <FieldShell label="Posta kodları" labelAside={`${draft.codes.length} kod`}>
              {/* Seçici ARAMAYLA ekler, harita TIKLAYARAK — ikisi aynı listeyi besliyor. Seçiciyi
                  kaldırmak, haritanın çizemediği bir kodu eklemenin tek yolunu kapatırdı. */}
              <PostalCodePicker
                codes={draft.codes}
                onChange={(codes) => props.onDraft({ codes })}
                homeCountry={props.homeCountry}
              />
            </FieldShell>

            {/* Haritanın durumu LEJANTTA (`note`): operatörün gözü haritadayken cümleyi sağ rayda
                aramak, aynı bilgiyi iki yere yazmak demekti. */}

            <Suggestions rows={data.suggestions} mine={membership.mine} anchors={anchors} onPick={props.onPick} />

            <CodeWeights codes={draft.codes} stats={data.stats} />

            {props.error ? (
              <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
                {props.error}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <ToggleField on={draft.isActive} onChange={(on) => props.onDraft({ isActive: on })} label="Rota aktif" bare />
              <Button
                variant="primary"
                className="ml-auto"
                onClick={props.onSave}
                disabled={props.busy || draft.name.trim().length === 0}
              >
                Kaydet
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState title="Rota seçin" description={ROUTE_NOTES.pickRoute} />
        )}
        </aside>
      </div>
    </div>
  );
}

/**
 * **Önerilen kodlar** (kullanıcı isteği 07.08: *"akıllı şekilde bölge oluşturmak"*).
 *
 * Ekranın tek yeri burası değil — asıl gösterim HARİTADA, mor noktalarda; bu ray onların okunabilir
 * hâli. İkisi aynı kümeyi gösteriyor çünkü operatörün iki farklı sorusu var: *"nerede"* (haritaya
 * bakar) ve *"neden"* (listeye bakar). Aynı bilgiyi iki yere yazmak değil, aynı bilgiyi iki soruya
 * cevap verecek şekilde sunmak.
 *
 * **Taslağa eklenmiş öneri listeden düşer** — kalsaydı operatör aynı kodu ikinci kez eklemeye
 * çalışır, hiçbir şey olmaz ve ekran bozuk görünürdü.
 */
function Suggestions({
  rows,
  mine,
  anchors,
  onPick,
}: {
  rows: readonly SuggestionView[];
  mine: ReadonlySet<string>;
  /** Düzenlenen rotanın kodlarının koordinatları — uzaklık bunlara göre ölçülür. */
  anchors: ReadonlyArray<{ lat: number; lng: number }>;
  onPick: (point: ZoneMapPoint) => void;
}) {
  const open = rows.filter((row) => !mine.has(keyOfPoint(row)));
  // Rotanın hiç kodu yoksa uzaklık ÖLÇÜLEMEZ ve yazılmaz — "0 km" demek, ölçemediğimizi ölçmüş
  // göstermek olurdu (`CLAUDE §1`).
  const distanceOf = (row: SuggestionView): number | null =>
    anchors.length === 0 ? null : Math.round(Math.min(...anchors.map((anchor) => distanceKm(anchor, row))));

  return (
    <FieldShell label="Önerilen kodlar" labelAside={open.length > 0 ? num(open.length) : undefined}>
      {open.length === 0 ? (
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">{ROUTE_NOTES.suggestionEmpty}</p>
      ) : (
        <>
          <ul className="flex flex-col rounded-ops-card border border-ops-violet-line bg-ops-violet-bg/40">
            {open.map((row) => (
              <li key={keyOfPoint(row)} className="border-b border-ops-violet-line/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPick(row)}
                  className="flex w-full cursor-pointer flex-col gap-0.5 px-2.5 py-2 text-left transition-colors hover:bg-ops-violet-bg"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="font-ops-mono text-ops-xs text-ops-ink">{row.postalCode}</span>
                    <span className="truncate font-ops-body text-ops-xs text-ops-muted">
                      {ROUTE_NOTES.suggestionWhere(distanceOf(row), row.place)}
                    </span>
                    {/* Talebin YAŞI: üç ay önce susmuş bir ilgi, dünkü kadar davet etmez. */}
                    {row.lastAskedMinutes !== null ? (
                      <span className="ml-auto shrink-0 font-ops-body text-ops-micro text-ops-muted">
                        {agoShort(row.lastAskedMinutes)}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-ops-body text-ops-xs text-ops-violet">
                    {ROUTE_NOTES.suggestionReason(row)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            {ROUTE_NOTES.suggestionHint}
          </p>
        </>
      )}
    </FieldShell>
  );
}

/**
 * **Kodların ağırlığı** — rota kurulumunun analitiği (kullanıcı isteği 07.08:
 * *"rota düzenlemesi yapılırken posta kodlarıyla alakalı analitikler"*).
 *
 * **Sıra CİROYA göre, koda göre değil.** Operatörün sorusu "hangi kod" değil *"yükü kim taşıyor"*;
 * alfabetik sıra cevabı listenin içinde saklardı. En üstteki satır rotanın sebebidir, en alttaki
 * güzergâhtan çıkarma adayı.
 *
 * **Ölçülmemiş kod "0" YAZMAZ** (`CLAUDE §1`): taslağa yeni eklenen koda RPC'ye hiç sorulmadı, yani
 * sıfır değil BİLİNMİYOR. Sıfır yazmak, kaydedilmemiş bir kodu "hiç sipariş getirmiyor" diye
 * okutup çıkarılmasına yol açardı.
 */
function CodeWeights({ codes, stats }: { codes: RouteView['postalCodes']; stats: Record<string, CodeStatsView> }) {
  if (codes.length === 0) return null;

  // Ölçülmemiş satır (-1) sona düşer: bilinmeyen bir değer, bilinen sıfırın üstünde duramaz.
  const rows = codes
    .map((code) => ({ code, stat: stats[code.postalCode] }))
    .sort((a, b) => (b.stat?.revenueCents ?? -1) - (a.stat?.revenueCents ?? -1));

  const measured = rows.filter((row) => row.stat !== undefined);
  const totalOrders = measured.reduce((sum, row) => sum + (row.stat?.orderCount ?? 0), 0);
  const totalRevenue = measured.reduce((sum, row) => sum + (row.stat?.revenueCents ?? 0), 0);

  return (
    <FieldShell label="Kodların ağırlığı" labelAside={measured.length > 0 ? money(totalRevenue) : undefined}>
      <div className="flex flex-col rounded-ops-card border border-ops-line">
        {rows.map(({ code, stat }) => (
          <div
            key={`${code.country}:${code.postalCode}`}
            className="flex items-baseline gap-2 border-b border-ops-line-soft px-2.5 py-1.5 last:border-b-0"
          >
            <span className="font-ops-mono text-ops-xs text-ops-ink">{code.postalCode}</span>
            {stat ? (
              <>
                <span className="font-ops-body text-ops-xs text-ops-muted">{num(stat.orderCount)} sipariş</span>
                {/* Bekleyen SIFIRSA çizilmez: her satıra "0 bekliyor" yazmak, gerçekten bekleyeni
                    olan satırı gürültünün içinde kaybederdi. */}
                {stat.waitingCount > 0 ? <Badge tone="blue">{num(stat.waitingCount)} bekliyor</Badge> : null}
                <span className="ml-auto font-ops-mono text-ops-xs text-ops-strong">{money(stat.revenueCents)}</span>
              </>
            ) : (
              <span className="ml-auto font-ops-body text-ops-xs text-ops-muted">ölçülmedi</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
        {measured.length === rows.length ? ROUTE_NOTES.weightHint : ROUTE_NOTES.weightUnmeasured}
        {totalOrders > 0 ? ` Toplam ${num(totalOrders)} sipariş.` : ''}
      </p>
    </FieldShell>
  );
}
