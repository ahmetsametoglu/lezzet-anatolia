'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { ChevronDownIcon } from '@/components/operation/ui/icons';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { DeliveryTabs } from './delivery-tabs';
import { Input } from '@/components/operation/form/input';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Select } from '@/components/operation/form/select';
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
import { placesLabel } from '@/components/operation/ui/labels';
import { PostalCodePicker } from './postal-code-picker';
import { RouteHours } from './route-hours';
import type { DayHourKey } from '@/lib/settings/day-hours';
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
  /**
   * Başlıktaki depo bağlamı; `null` = "tüm depolar".
   *
   * **YALNIZ seçicinin listesini daraltır** (kullanıcı kararı 17.08). Haritanın kümesine ve
   * `membership.taken` hesabına DOKUNMAZ, çünkü dokunsaydı komşu deponun kodları "boşta" görünür,
   * operatör onları tıklayıp kendi rotasına eklemeye çalışır ve reddin sebebi ekranda hiç yazmazdı —
   * çakışan posta kodu tam orada doğuyor (`routes-read` başlığındaki eski karar bunu koruyordu).
   * Süzgeç odak verir, körlük vermez.
   */
  contextWarehouseId: string | null;
  selected: RouteView | null;
  draft: {
    name: string;
    /** Güzergâhın çıkacağı depo; `null` = seçilmedi — kaydet düğmesi o hâlde kapalı (`OB-01`). */
    warehouseId: string | null;
    weekdays: number[];
    isActive: boolean;
    codes: RouteView['postalCodes'];
    /** Rotaya özel eşik saatleri; `null` = genele döndürülecek (`routes-client.Draft` künyesi). */
    hours: Partial<Record<DayHourKey, string | null>>;
  } | null;
  onSelect: (routeId: string | null) => void;
  onDraft: (patch: Partial<NonNullable<RoutesViewProps['draft']>>) => void;
  onPick: (point: ZoneMapPoint) => void;
  onSave: () => void;
  /** Haritanın görüş alanı oturunca — yakınlık eşiği buradan hesaplanıyor. */
  onViewport: (viewport: MapViewport) => void;
  /**
   * Son oturmuş görüş alanı. `null` = henüz ölçülmedi ve o hâlde "ekran dışında mı" sorusu
   * SORULAMAZ — ölçülemeyen değer sıfır değildir (`CLAUDE §1`), ray o ana kadar hiçbir şey yazmaz.
   */
  viewport: MapViewport | null;
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
  /** Asistan önerisinden gelindiyse künye (22.5); `null` ise ekranda hiçbir iz yok. */
}

export function RoutesDesktop(props: RoutesViewProps) {
  const { data, selected, draft, tooFar } = props;

  /**
   * **Ray açık mı** — kapanınca yalnız başlığı kalır ve harita tamamen görünür.
   *
   * Katlamak, rayı DARALTMANIN alternatifi: operatörün iki ayrı anı var — güzergâhı kurarken forma
   * bakar, kurduğunu okurken haritaya. Paneli kalıcı olarak küçültmek ikisini birden kötüleştirirdi;
   * kapatılabilir olması ise hiçbir yeteneği elinden almıyor, yalnız o anda bakmadığı şeyi kaldırıyor.
   */
  const [railOpen, setRailOpen] = useState(true);

  /**
   * Haritaya verilen "şuraya git" emri — ekran dışındaki bir öneriye tıklanınca doğuyor.
   *
   * Her tıklamada YENİ nesne kuruluyor (`{lat, lng}` yeniden yazılıyor): emri taşıyan şey nesnenin
   * kimliği, değeri değil. Aynı öneriye ikinci kez tıklamak da bir emirdir — operatör aradan
   * kaydırmış olabilir ve değere bakan bir karşılaştırma o ikinci tıklamayı görmezdi.
   */
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  /**
   * Seçicinin listesi — depo bağlamıyla süzülmüş.
   *
   * **Seçili rota bağlam dışı kalsa bile listede durur.** Aksi hâlde adresten (ya da asistan
   * devrinden) başka deponun rotasıyla gelen operatör, açık olan kaydı listede bulamaz ve seçiciyi
   * "yanlış" sanırdı — süzgeç, düzenlemekte olduğun şeyi saklamamalı.
   */
  const visibleRoutes = useMemo(() => {
    if (props.contextWarehouseId === null) return data.routes;
    return data.routes.filter(
      (route) => route.warehouseId === props.contextWarehouseId || route.id === selected?.id,
    );
  }, [data.routes, props.contextWarehouseId, selected?.id]);

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
   * Önerinin uzaklığı DÜZENLENEN rotanın kendi kodlarına göre ölçülüyor, tüm rotalara göre değil.
   *
   * Sunucuda hesaplanırken bu bir kusurdu (07.08, kontrol sırasında bulundu): Strasbourg'u
   * düzenlerken Kehl rotasının 5 km yanındaki kod da "rotaya 5 km" diye görünüyordu — oysa onu
   * Strasbourg'un güzergâhına eklemek coğrafi olarak anlamsız. İstemcide, taslağa göre hesaplanınca
   * hem doğru oluyor hem de kod ekledikçe canlı güncelleniyor.
   *
   * **Noktaların ÜSTÜNDE duruyor** (17.08): uzaklık artık haritanın ipucuna da giriyor, yani
   * `points` ona bağımlı — bağımlının altında kalamaz.
   */
  const anchors = useMemo(() => {
    const coords = new Map(data.points.map((point) => [keyOfPoint(point), point]));
    return (draft?.codes ?? []).map((code) => coords.get(keyOfPoint(code))).filter((point) => point !== undefined);
  }, [data.points, draft?.codes]);

  /** Rotanın hiç kodu yoksa uzaklık ÖLÇÜLEMEZ ve yazılmaz (`CLAUDE §1`) — "0 km" ölçmüş gibi okuturdu. */
  const distanceOf = useCallback(
    (point: { lat: number; lng: number }): number | null =>
      anchors.length === 0 ? null : Math.round(Math.min(...anchors.map((anchor) => distanceKm(anchor, point)))),
    [anchors],
  );

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
    /**
     * Önerilen kodun TAM künyesi etikete iliştiriliyor: "üzerine gelince neden önerildiği görünsün"
     * (kullanıcı isteği 07.08), 17.08'de genişledi — noktanın neden mor olduğu, rotaya uzaklığı ve
     * talebin yaşı da buraya girdi. Üçü yalnız sağdaki listede vardı ve liste tam da bu yüzden
     * kaldırılamıyordu; harita aynı soruyu cevaplayamıyordu.
     *
     * Harita metni KURMUYOR, taşıyor — sözlük ekranın tarafında (`deliveries-labels`).
     */
    const own = data.points.map((point) => {
      const row = suggested.get(keyOfPoint(point));
      if (!row) return point;
      return {
        ...point,
        facts: ROUTE_NOTES.suggestionTip({
          waitingCount: row.waitingCount,
          orderCount: row.orderCount,
          requestCount: row.requestCount,
          distanceKm: distanceOf(row),
          age: row.lastAskedMinutes === null ? null : agoShort(row.lastAskedMinutes),
        }),
      };
    });
    return [...own, ...(props.freePoints ?? []).filter((point) => !seen.has(keyOfPoint(point)))];
  }, [data.points, props.freePoints, suggested, distanceOf]);

  const freeCount = useMemo(() => points.filter((point) => stateOf(point) === 'free').length, [points, stateOf]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Teslimat & Rota" subtitle="Dağıtım güzergâhları — kodlar, günler, harita">
        <DeliveryTabs value="routes" />
      </PageHeader>

      {/* **Harita artık ZEMİN, sütun değil** (kullanıcı isteği 17.08). Eskiden ekran ikiye
          bölünüyordu (`1fr` + 380 piksel ray) ve haritanın sağ kenarı rayın altında hiç yoktu —
          oysa bu sayfada asıl iş yüzeyi harita: operatör kaydırır, yakınlaşır, komşu güzergâhla
          karşılaştırır. Ray onun ÜSTÜNE yüzüyor; kapladığı yer artık haritadan çalınmıyor, yalnız
          bir köşesini örtüyor ve katlanınca o köşe de geri geliyor.

          Lejant SOL üstte (`zone-map-leaflet`), ray SAĞ üstte: ikisi aynı yüzeyde ama çakışmıyor. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Harita her zaman çizilir — rota seçilmemişken bile tanımlı güzergâhların şekli görünür;
            boş bir gri kutu, ekranın ne işe yaradığını anlatmazdı. */}
        <div className="absolute inset-0">
          <ZoneMap
            points={points}
            stateOf={stateOf}
            onPick={props.onPick}
            onViewport={props.onViewport}
            focus={focus}
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

        {/* **`z-[500]` KALDIRILDI → `z-10` (17.08, ölçülmüş arıza).** Eski gerekçe şuydu: *"Leaflet'in
            kendi katmanları 400'de biter, işaretçiler 600'e çıkar — 500 ikisinin arasıdır."* O gerekçe
            `ZoneMap`'e `isolation: isolate` gelene kadar doğruydu; artık haritanın bütün iç sayıları
            kendi kutusunda hapis (`zone-map-leaflet` künyesi: *"yarışı kazanmak değil, yarışı
            bitirmek"*). Ray, DOM'da haritadan SONRA gelen konumlanmış bir kardeş — üstünde durması
            için yüksek bir sayıya ihtiyacı yok.
            Sayı ÖNEMLİ çünkü ray artık kendi içinde açılır menü barındırıyor: `AnchoredMenu` body'ye
            portal edilip `z-[60]` ile çiziliyor, yani 500 taşıyan bir rayın İÇİNDEN açılan menü rayın
            ALTINDA kalıyordu. Rota saatleri çubuğu (`route-hours`) böyle görünmez çıktı — DOM'da
            vardı, ölçüsü doğruydu, hiç boyanmıyordu. Aynı arıza rota seçicisinde de vardı.
            Açıkken boy tavana dayanır ve içerik kendi içinde kayar; kapalıyken o sınıf düşer, panel
            başlığı kadar kalır. Alt boşluk `bottom-8` — 3 değil: sağ altta OSM atıf yazısı duruyor
            ve lisans gereği görünür kalmak zorunda, panel oraya kadar inseydi üstünü örterdi. */}
        <aside
          className={`absolute right-3 top-3 z-10 flex w-[320px] flex-col rounded-ops-card border border-ops-line bg-ops-card/95 shadow-[0_8px_24px_rgba(20,22,18,0.12)] backdrop-blur-sm ${
            railOpen ? 'bottom-8 overflow-y-auto' : 'overflow-hidden'
          }`}
        >
          {/* Başlık YAPIŞIK: ray artık kendi içinde kayıyor, katlama düğmesi ve rota seçici form
              dibine kaydırıldığında da erişilebilir kalmalı. */}
          <div className="sticky top-0 z-10 flex shrink-0 items-center gap-1.5 border-b border-ops-line-soft bg-ops-card px-2.5 py-2">
            <button
              type="button"
              onClick={() => setRailOpen((on) => !on)}
              aria-expanded={railOpen}
              aria-label={railOpen ? 'Rota panelini kapat' : 'Rota panelini aç'}
              className="flex shrink-0 cursor-pointer items-center rounded-ops-btn p-0.5 text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
            >
              <span className={`block transition-transform ${railOpen ? '' : '-rotate-90'}`}>
                <ChevronDownIcon size={14} />
              </span>
            </button>
            {/* Seçici başlıkta ve KAPALIYKEN DE duruyor: panel katlanınca operatörün "neyi
                düzenliyordum" sorusu cevapsız kalmamalı, ve başka bir rotaya geçmek için paneli
                açmak zorunda olmamalı. */}
            <RoutePicker
              routes={visibleRoutes}
              hidden={data.routes.length - visibleRoutes.length}
              selected={selected}
              onSelect={props.onSelect}
            />
          </div>

          {/* **Katlama koşullu render DEĞİL, `hidden`** ve sebebi işlevsel: panel her açılışta
              yeniden kurulsaydı kod arama kutusundaki yazı ve rayın kaydırma yeri silinirdi —
              operatör haritayı görmek için paneli kapattığında, açtığında kaldığı yeri kaybederdi. */}

        {draft ? (
          <div className={`flex flex-col gap-3 px-3 py-3 ${railOpen ? '' : 'hidden'}`}>
            {/* **ÇIKIŞ DEPOSU EN ÜSTTE ve bu bir sıralama tercihi değil** (`OB-01`): depo rotanın
                ülkesini belirliyor (`homeCountry` → kod etiketleri) ve hangi kodların anlamlı
                olduğunu o karar veriyor. Addan sonra sorulsaydı, operatör kod eklemeye başladıktan
                sonra depoyu değiştirdiğinde seçtiği kodlar sessizce yabancı ülkeye düşerdi. */}
            <WarehouseField
              warehouses={data.warehouses}
              value={draft.warehouseId}
              onChange={(warehouseId) => props.onDraft({ warehouseId })}
              /* Var olan rotanın deposu DEĞİŞTİRİLEBİLİR ve bu yeni bir yetenek değil: yazma yolu
                 (`saveZoneAction` → `zoneSvc.update`) `warehouseId`'yi zaten her kaydetmede
                 yazıyordu, yalnız hep aynı değeri. Kilitlemek, aynı kayıt için iki farklı form
                 çizmek olurdu. */
              existing={selected !== null}
            />

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

            {/* **Saatler günlerin HEMEN ardında** ve kodlardan önce: ikisi de "bu rota ne zaman
                çalışıyor" sorusunun parçası — hangi günler, o gün hangi saatlerde. Kod kümesi ise
                "nereye" sorusu ve haritayla birlikte okunuyor. Araya girmek iki soruyu böler. */}
            <RouteHours
              exceptions={draft.hours}
              global={data.globalHours}
              onChange={(key, time) => props.onDraft({ hours: { ...draft.hours, [key]: time } })}
            />

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

            <OffscreenSuggestions
              rows={data.suggestions}
              mine={membership.mine}
              viewport={props.viewport}
              distanceOf={distanceOf}
              onFocus={(row) => setFocus({ lat: row.lat, lng: row.lng })}
            />

            <CodeWeights codes={draft.codes} stats={data.stats} />

            {props.error ? (
              <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
                {props.error}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <ToggleField on={draft.isActive} onChange={(on) => props.onDraft({ isActive: on })} label="Rota aktif" bare />
              {/* Depo seçilmeden kaydetmek reddediliyordu ve reddin sebebi ancak tıklandıktan
                  SONRA görünüyordu. Düğme artık ad gibi depoyu da bekliyor — engel tıklamadan önce
                  okunur (`OB-01`). */}
              <Button
                variant="primary"
                className="ml-auto"
                onClick={props.onSave}
                disabled={props.busy || draft.name.trim().length === 0 || draft.warehouseId === null}
              >
                Kaydet
              </Button>
            </div>
          </div>
        ) : (
          <div className={railOpen ? '' : 'hidden'}>
            <EmptyState title="Rota seçin" description={ROUTE_NOTES.pickRoute} />
          </div>
        )}
        </aside>
      </div>
    </div>
  );
}

/**
 * **Rota seçici** — seçmek ve YENİ KURMAK aynı açılır kutuda (kullanıcı isteği 17.08).
 *
 * Önceden rotalar rayın tepesinde bir liste, "+ Rota" ise onun yanında ayrı bir düğmeydi. İki kusuru
 * vardı: liste panelin en değerli yerini yiyordu (rota sayısı arttıkça form aşağı kayıyordu) ve
 * satırların TIKLANABİLİR bir seçim olduğu görünmüyordu — kullanıcının kendi cümlesiyle *"seçimi hiç
 * anlaşılır olmamış"*. Açılır kutu ikisini de çözüyor: kapalıyken tek satır yer kaplar, açıldığında
 * ne seçilebileceği listelenir, ve "yeni rota" o listenin son maddesi olur — çünkü operatörün sorusu
 * tek: *"hangi rotayı düzenliyorum?"* Cevaplardan biri "henüz yok, kuruyorum".
 *
 * Seçili rotanın künyesi (depo · kod · gün) menüde durur, başlıkta değil: başlıkta yalnız AD var,
 * çünkü künye zaten formun kendisinde satır satır yazılı.
 */
interface RoutePickerProps {
  routes: RoutesData['routes'];
  /**
   * Depo bağlamının listeden düşürdüğü rota sayısı. **YAZILIYOR, sessizce yutulmuyor** — süzülmüş
   * bir liste, süzüldüğünü söylemezse "hepsi bu" diye okunur ve operatör var olan bir rotayı
   * yokmuş sanıp ikinciyi kurar.
   */
  hidden: number;
  /** `null` = yeni rota kuruluyor — kutu bunu bir hâl olarak yazar, boş bırakmaz. */
  selected: RouteView | null;
  onSelect: (routeId: string | null) => void;
}

function RoutePicker({ routes, hidden, selected, onSelect }: RoutePickerProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const choose = (routeId: string | null) => {
    onSelect(routeId);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((on) => !on)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-ops-btn border border-ops-line bg-ops-card px-2.5 py-1.5 text-left transition-colors hover:bg-ops-subtle"
      >
        <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm text-ops-ink">
          {selected ? selected.name : 'Yeni rota'}
        </span>
        {selected && !selected.isActive ? <Badge tone="slate">Pasif</Badge> : null}
        <span className={`shrink-0 text-ops-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={12} />
        </span>
      </button>

      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)}>
        <ul className="max-h-[15rem] overflow-y-auto" role="listbox">
          {routes.length === 0 ? (
            <li className="px-3 py-2 font-ops-body text-ops-xs text-ops-muted">Henüz rota kurulmadı.</li>
          ) : (
            routes.map((route) => (
              <li key={route.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={route.id === selected?.id}
                  onClick={() => choose(route.id)}
                  className={`flex w-full cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-ops-subtle ${
                    route.id === selected?.id ? 'bg-ops-olive-bg' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-ops-body text-ops-sm text-ops-ink">{route.name}</span>
                    {route.isActive ? null : <Badge tone="slate">Pasif</Badge>}
                  </span>
                  <span className="font-ops-body text-ops-xs text-ops-muted">
                    {route.warehouseName} · {num(route.postalCodes.length)} kod
                    {route.weekdays.length > 0
                      ? ` · ${route.weekdays.map((d) => WEEKDAYS[d - 1]).join(' ')}`
                      : ' · gün yok'}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        {/* Ayraçla ayrı: "yeni kur" bir rota DEĞİL, listenin altındaki bir eylem. Aynı kutuda
            olması onu seçimin kardeşi yapıyor; ayracı kaldırmak var olan bir rotayla karıştırırdı. */}
        <button
          type="button"
          onClick={() => choose(null)}
          className={`flex w-full cursor-pointer items-center gap-1.5 border-t border-ops-line-soft px-3 py-2 text-left font-ops-body text-ops-sm transition-colors hover:bg-ops-subtle ${
            selected === null ? 'bg-ops-olive-bg text-ops-strong' : 'text-ops-ink'
          }`}
        >
          + Yeni rota
        </button>
        {hidden > 0 ? (
          <p className="border-t border-ops-line-soft bg-ops-subtle px-3 py-1.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            Başka depoya bağlı {num(hidden)} rota bu listede yok — başlıktaki depo seçiminden
            değiştirebilirsiniz. Haritada hepsi çizili.
          </p>
        ) : null}
      </AnchoredMenu>
    </>
  );
}

/**
 * **Çıkış deposu** — rotanın hangi tesisten dağıtıma çıkacağı (`OB-01`, kullanıcının arayüz
 * testi 14.08).
 *
 * Alan eskiden HİÇ YOKTU: depo yalnız kaydetme anında adresten ya da "tek depo varsa o"dan
 * çözülüyordu ve çok depolu bir kurulumda Rotalar sekmesinden yeni rota kurmak **imkânsızdı** —
 * ekran operatörü Depolar sayfasına yolluyordu.
 *
 * **Pasif depo listeden SÜZÜLMEZ, işaretlenir.** Süzmek iki şeyi birden bozardı: bugün pasif bir
 * depoya bağlı olan bir rotayı açan operatör kendi deposunu göremez (seçici boş görünür), ve
 * "kapalı tesise rota bağlıyorum" kararı operatörün önünde değil kodun içinde verilmiş olurdu.
 * Aynı ayrım katalogda da var (`isActive` ≠ `isFeatured`): işaretlemek yasaklamak değildir.
 */
function WarehouseField({
  warehouses,
  value,
  onChange,
  existing,
}: {
  warehouses: RoutesData['warehouses'];
  value: string | null;
  onChange: (warehouseId: string) => void;
  /** Var olan bir rota mı düzenleniyor — uyarı cümlesi ona göre değişir. */
  existing: boolean;
}) {
  const chosen = warehouses.find((w) => w.id === value) ?? null;

  return (
    <FieldShell
      label="Çıkış deposu"
      required
      // Tek depolu kurulumda seçenek yok, seçim de yok: alan yine çizilir (rotanın nereden
      // çıktığı bilgidir) ama "seçin" demek yanıltıcı olurdu.
      labelAside={warehouses.length === 1 ? 'tek depo' : undefined}
    >
      <Select
        value={value ?? ''}
        onChange={onChange}
        placeholder="Depo seçin"
        options={warehouses.map((warehouse) => ({
          value: warehouse.id,
          label: warehouse.isActive ? `${warehouse.name} · ${warehouse.code}` : `${warehouse.name} · ${warehouse.code} — pasif`,
        }))}
      />
      {chosen && !chosen.isActive ? (
        <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
          {chosen.name} pasif — bu rota kaydedilir ama depo açılana kadar dağıtıma çıkmaz.
        </p>
      ) : null}
      {existing && chosen ? (
        <p className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
          Depoyu değiştirmek güzergâhı başka tesise bağlar; kodlar ve günler aynen kalır.
        </p>
      ) : null}
    </FieldShell>
  );
}

/**
 * **Ekran dışındaki öneriler** (kullanıcı kararı 17.08) — eskiden burada önerilerin TAM listesi vardı.
 *
 * Liste haritayla neredeyse tamamen örtüşüyordu: aynı kodlar orada zaten mor noktalar olarak
 * çiziliydi ve 17.08'de ipucu zenginleşince gerekçe · uzaklık · yaş da haritaya geçti. Geriye
 * listenin tek gerçek işi kaldı ve o iş haritanın **yapısal olarak** yapamadığı şey: bakılmayan yeri
 * göstermek. `68000 Colmar` görüş alanının dışındayken haritada hiç yoktur; operatör oraya
 * kaydırmayı aklından geçirmedikçe o talebi asla görmez.
 *
 * Bu yüzden ray artık yalnız **ekranda olmayanları** yazıyor ve tıklama "ekle" değil **"oraya bak"**
 * demek — kodu görmeden eklemek zaten bu ekranın reddettiği şeydi (kullanıcının kendi cümlesi:
 * *"haritaya bakmadan karar veremem"*).
 *
 * **Taslağa eklenmiş öneri listeden düşer** — kalsaydı operatör aynı kodu ikinci kez eklemeye
 * çalışır, hiçbir şey olmaz ve ekran bozuk görünürdü.
 */
function OffscreenSuggestions({
  rows,
  mine,
  viewport,
  distanceOf,
  onFocus,
}: {
  rows: readonly SuggestionView[];
  mine: ReadonlySet<string>;
  /** `null` = görüş alanı henüz ölçülmedi; "dışarıda mı" sorusu o hâlde sorulamaz. */
  viewport: MapViewport | null;
  distanceOf: (point: { lat: number; lng: number }) => number | null;
  onFocus: (row: SuggestionView) => void;
}) {
  const open = rows.filter((row) => !mine.has(keyOfPoint(row)));
  const offscreen =
    viewport === null
      ? []
      : open.filter(
          (row) =>
            row.lat < viewport.minLat ||
            row.lat > viewport.maxLat ||
            row.lng < viewport.minLng ||
            row.lng > viewport.maxLng,
        );

  // Görüş alanı ölçülmeden ekran hiçbir şey İDDİA ETMEZ: "0 öneri dışarıda" demek, ölçmediğimizi
  // ölçmüş göstermek olurdu (`CLAUDE §1`).
  if (viewport === null) return null;

  return (
    <FieldShell
      label={ROUTE_NOTES.offscreenTitle}
      labelAside={offscreen.length > 0 ? num(offscreen.length) : undefined}
    >
      {offscreen.length === 0 ? (
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
          {open.length === 0 ? ROUTE_NOTES.suggestionEmpty : ROUTE_NOTES.offscreenNone}
        </p>
      ) : (
        <>
          <ul className="flex flex-col rounded-ops-card border border-ops-violet-line bg-ops-violet-bg/40">
            {offscreen.map((row) => (
              <li key={keyOfPoint(row)} className="border-b border-ops-violet-line/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onFocus(row)}
                  className="flex w-full cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-ops-violet-bg"
                >
                  <span className="shrink-0 font-ops-mono text-ops-xs text-ops-ink">{row.postalCode}</span>
                  {/* Tek satır: ad + uzaklık. GEREKÇE burada YAZILMIYOR — haritada, noktanın
                      ipucunda tam hâliyle duruyor ve operatör oraya gittiğinde zaten onu okuyacak.
                      İki yere yazmak, rayı kısaltma kararını geri almak olurdu. */}
                  <span className="truncate font-ops-body text-ops-xs text-ops-muted">
                    {ROUTE_NOTES.suggestionWhere(distanceOf(row), placesLabel(row.places ?? [], 2) ?? undefined)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            {ROUTE_NOTES.offscreenHint}
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
