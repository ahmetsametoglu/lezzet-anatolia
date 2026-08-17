'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FREE_CODE_MIN_ZOOM,
  keyOfPoint,
  type MapViewport,
  type ZoneMapPoint,
} from '@/components/operation/ui/zone-map-model';
import { placesLabel } from '@/components/operation/ui/labels';
import { readMapCodesAction, saveZoneAction } from './routes-actions';
import { RoutesDesktop } from './routes.desktop';
import { ROUTE_NOTES } from './deliveries-labels';
import type { RoutesData, RouteView } from './routes-read';
import type { ZoneHandoff } from './routes-handoff';
import type { PostalCodePick } from './routes-types';
import { DAY_HOUR_KEYS, type DayHourKey } from '@/lib/settings/day-hours';
import type { Country } from '@lezzet/types';

/**
 * Sönen ipucu şeridinin taşıdığı en fazla yerleşim adı (`OB-04`). Şerit 2,6 saniye görünüyor —
 * okunabilecek kadar kısa olmalı; haritanın kendi ipucu tam listeyi zaten veriyor.
 */
const HINT_MAX_PLACES = 2;

/**
 * Kaydedilecek saat farkı — **değişmeyen istisna yeniden yazılmaz.**
 *
 * Taslak açılışta var olan istisnalarla dolduğu için, hiçbir saate dokunmadan "Kaydet"e basmak
 * dördünü de aynı değerle yeniden yazardı. Sonuç bir hata değil ama iz yanlışlaşır: `updated_at` ve
 * `updated_by` oynar, yani "bu saati kim ne zaman değiştirdi" sorusu artık rotayı kaydeden son kişiyi
 * gösterir — değiştiren kişiyi değil.
 *
 * `null` yalnız GERÇEKTEN bir istisna varsa gönderilir: olmayan bir satırı silmeye çalışmak boşa bir
 * okuma turudur.
 */
function hoursPatch(
  draft: Partial<Record<DayHourKey, string | null>>,
  saved: Partial<Record<DayHourKey, string>>,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const key of DAY_HOUR_KEYS) {
    const next = draft[key];
    const before = saved[key];
    if (next === undefined) continue;
    if (next === null) {
      if (before !== undefined) patch[key] = null;
      continue;
    }
    if (next !== before) patch[key] = next;
  }
  return patch;
}

interface Draft {
  name: string;
  /**
   * Güzergâhın çıkacağı depo — **taslağın alanı** (`OB-01`, kullanıcının arayüz testi 14.08).
   *
   * Eskiden taslakta hiç yoktu; depo yalnız KAYDETME anında üç kaynaktan çözülüyordu (seçili
   * rotanın deposu · adresteki `warehouseId` · sistemde tek depo varsa o). Üçü de sağlanmadığında —
   * yani çok depolu bir kurulumda operatör doğrudan Rotalar sekmesine girip "+ Rota" dediğinde —
   * kayıt reddediliyor ve ekran *"Depolar sayfasından depoyu seçip 'Rota ekle' ile gelin"* diyordu.
   * **Formda depo seçecek hiçbir kontrol yoktu**, yani ekran operatöre kendi sayfasında
   * yapamayacağı bir şeyi tarif ediyordu: yeni rota oradan hiç kurulamıyordu.
   *
   * `null` = henüz seçilmedi. Boş dizgi DEĞİL: "seçilmedi" ile "seçildi ve boş" ayrı hâller ve
   * seçicinin yer tutucusunu ancak `null` doğru gösterir.
   */
  warehouseId: string | null;
  weekdays: number[];
  isActive: boolean;
  codes: PostalCodePick[];
  /**
   * Rotaya özel eşik saatleri — **üç hâl taşıyor** (17.08).
   *
   * Anahtar YOK = bu eşiğe dokunulmadı (veride ne varsa kalır) · `string` = bu saat yazılacak ·
   * `null` = istisna kaldırılacak, eşik genel değeri okuyacak. Üçüncü hâl olmasaydı "genele dön"
   * anahtarı taslaktan silmek olurdu ve silinen anahtar kaydetmede hiç gitmediği için veritabanındaki
   * satır sessizce yaşamaya devam ederdi — operatör geri aldığını sanır, sistem eski saati uygular.
   */
  hours: Partial<Record<DayHourKey, string | null>>;
}

/**
 * Rota kurulumunun istemci kökü (19.20).
 *
 * **Seçili rota ADRESTE** (`?tab=routes&route=<id>`): bir güzergâhın bağlantısı paylaşılabilmeli ve
 * Depolar'dan gelen köprü doğrudan o rotayı açabilmeli. Taslak (yazılan ad, işaretlenen gün, atılan
 * kod) adreste DEĞİL — o bir işlemin yarısıdır; geri düğmesi yarım bir rotayı geri getirmemeli.
 */
export function RoutesClient({
  data,
  routeId,
  warehouseId,
  contextWarehouseId,
  handoff = null,
}: {
  data: RoutesData;
  routeId: string | null;
  warehouseId: string | null;
  /**
   * Başlıktaki depo bağlamı (19.14) — `null` = "tüm depolar". YALNIZ seçicinin listesini daraltır;
   * haritanın kümesine dokunmaz (kullanıcı kararı 17.08, gerekçe `routes.desktop`'ta).
   */
  contextWarehouseId: string | null;
  /** Asistan önerisinden gelindiyse ön dolgu (22.5); `null` ise ekran hiç değişmez. */
  handoff?: ZoneHandoff | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Tıklamanın kısa geri bildirimi (tasarımın `hint` şeridi). `error`den AYRI: biri olanı anlatır,
  // öteki olmayanı — ikisini tek alanda toplamak, bir eklemeyi hata gibi kırmızıya boyardı.
  const [hint, setHint] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  /**
   * Görüş alanındaki BOŞTA kodlar. `null` = henüz okunmadı — boş dizi "hiç yok" demek ve ikisi aynı
   * şey değil (`CLAUDE §1`); lejant da bu ikisini ayrı cümleyle söylüyor.
   */
  const [freePoints, setFreePoints] = useState<ZoneMapPoint[] | null>(null);
  const [truncated, setTruncated] = useState(false);

  const selected: RouteView | null = routeId ? (data.routes.find((route) => route.id === routeId) ?? null) : null;
  /**
   * Taslak seçili rotadan doğar; `key` ile bileşen yeniden kurulduğu için seçim değişince tazelenir.
   *
   * **Öneriden gelindiyse kodlar ÜSTÜNE eklenir, yerine geçmez** — `zone_extend` bir EKLEME
   * önerisidir; mevcut kümeyi önerininkiyle değiştirmek, kaydetmeye basan operatörün haberi olmadan
   * rotadan kod düşürürdü (uygulayıcının kendi kuralı da bu: *"önce okur, üstüne ekler — 'ekle'
   * sessizce 'değiştir' olmasın"*). Zaten var olan kod ikinci kez eklenmiyor.
   */
  const [draft, setDraft] = useState<Draft | null>(() => {
    const base = selected
      ? {
          name: selected.name,
          warehouseId: selected.warehouseId as string | null,
          weekdays: selected.weekdays,
          isActive: selected.isActive,
          codes: selected.postalCodes,
          // Yalnız VAR OLAN istisnalar; genel değeri okuyan eşikler burada yok ve olmamalı
          // (`routes-read.exceptionsOf` künyesi).
          hours: { ...selected.hours },
        }
      : {
          name: handoff?.zoneName ?? '',
          /**
           * Yeni rotanın açılış deposu — eski KAYDETME anı çözümünün aynısı, ama artık bir
           * ÖNERİ olarak taslağa konuyor, gizli bir varsayım olarak değil. Depolar'dan köprüyle
           * gelindiyse adresteki depo seçili açılır (operatörün niyeti belli), tek depolu
           * kurulumda tek seçenek zaten odur. İkisi de yoksa `null` — ve seçici bunu söyler.
           */
          warehouseId: warehouseId ?? (data.warehouses.length === 1 ? (data.warehouses[0]?.id ?? null) : null),
          weekdays: [],
          isActive: true,
          codes: [] as PostalCodePick[],
          // Yeni rota genel saatlerle doğar: dördünü de istisna olarak yazmak, operatörün vermediği
          // bir kararı veriye geçirmek olurdu.
          hours: {} as Partial<Record<DayHourKey, string | null>>,
        };
    if (!handoff) return base;
    const have = new Set(base.codes.map((code) => `${code.country}:${code.postalCode}`));
    const added = handoff.codes.filter((code) => !have.has(`${code.country}:${code.postalCode}`));
    return { ...base, codes: [...base.codes, ...added] };
  });

  /**
   * Kod aramasında ülke etiketi yalnız YABANCI kod için basılır; "kendi ülkemiz" rotanın deposundan
   * gelir.
   *
   * **Artık TASLAKTAN okunuyor** (`OB-01`), seçili rotadan ya da adresten değil: depo seçilebilir
   * hâle gelince ülke de seçimle birlikte değişmeli. Aksi hâlde Kehl deposunu seçen operatör hâlâ
   * Fransız kodlarını sade, Alman kodlarını "· Almanya" etiketiyle görürdü — yani etiket seçtiği
   * depoyu değil, sayfaya girdiği andaki depoyu anlatırdı.
   */
  const home = data.warehouses.find((w) => w.id === draft?.warehouseId) ?? data.warehouses[0];

  const select = (id: string | null) => {
    setError(null);
    setHint(null);
    router.push(`/operations/deliveries?tab=routes${id ? `&route=${id}` : ''}`);
  };

  /**
   * Haritadaki (ya da çipteki) bir koda dokunma — tasarımın tek etkileşimi: *"noktaya tıkla →
   * ekle / çıkar."*
   *
   * Üç dal, üç kod hâline birebir karşılık geliyor:
   * **benim** → çıkar · **başka rotada** → çıkarılamaz, kimin tuttuğu yazılır · **boşta** → ekle.
   *
   * Üçüncü dal bugün de ULAŞILABİLİR ve bu önemli: operatör kendi kodunu çıkardığında nokta
   * "boşta"ya döner ve aynı noktaya ikinci kez tıklamak onu geri getirmelidir. O dal olmasaydı
   * yanlışlıkla çıkarılan bir kod geri konulamaz, tıklama sessizce hiçbir şey yapmazdı — ki
   * sessiz tıklama operatöre "bozuk" der.
   */
  const pick = (point: ZoneMapPoint) => {
    if (!draft) return;
    const key = keyOfPoint(point);
    setError(null);

    if (draft.codes.some((code) => keyOfPoint(code) === key)) {
      setDraft({ ...draft, codes: draft.codes.filter((code) => keyOfPoint(code) !== key) });
      setHint(ROUTE_NOTES.removed(point.postalCode, placesLabel(point.places ?? [], HINT_MAX_PLACES) ?? undefined));
      return;
    }

    const holder = data.routes.find(
      (route) => route.id !== routeId && route.postalCodes.some((code) => keyOfPoint(code) === key),
    );
    if (holder) {
      setHint(null);
      setError(
        `${point.postalCode} eklenemez — ${holder.name} rotasında tanımlı. Bir kod tek rotada olabilir; taşımak için önce oradan çıkarın.`,
      );
      return;
    }

    setDraft({ ...draft, codes: [...draft.codes, { country: point.country, postalCode: point.postalCode }] });
    setHint(ROUTE_NOTES.added(point.postalCode, placesLabel(point.places ?? [], HINT_MAX_PLACES) ?? undefined));
  };

  const save = () => {
    if (!draft) return;
    /**
     * Depo TASLAKTAN gelir (`OB-01`). Eskiden burada üç kaynaklı bir çözüm vardı ve hiçbiri
     * tutmadığında ekran operatörü başka sayfaya yolluyordu — oysa gideceği yerde de yapacağı iş
     * aynıydı, yalnız bu formda seçemiyordu.
     *
     * **Guard KALDIRILMADI, ama artık son çare:** düğme depo seçilmeden zaten kapalı
     * (`routes.desktop`). Yine de duruyor çünkü bir gün taslağı başka bir yol kurabilir (öneri
     * köprüsü, adres bağlantısı) ve deposuz bir kayıt güzergâhı hiçbir tesise bağlamaz — sessizce
     * geçmesindense burada durması iyidir. Cümle de değişti: artık operatöre yapabileceği şeyi
     * söylüyor.
     */
    const targetWarehouse = draft.warehouseId;
    if (!targetWarehouse) {
      setError('Bu rotanın hangi depodan çıkacağı seçilmedi — yukarıdaki "Çıkış deposu" alanından seçin.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveZoneAction({
        id: selected?.id,
        warehouseId: targetWarehouse,
        name: draft.name,
        weekdays: draft.weekdays,
        isActive: draft.isActive,
        postalCodes: draft.codes,
        hours: hoursPatch(draft.hours, selected?.hours ?? {}),
        // Öneriden gelindiyse kuyruk satırı bu kayıtla birlikte kapanır (`withProposal`). Elle
        // kurulumda alan hiç gitmez ve akış değişmez.
        proposalId: handoff?.proposalId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Öneri kapandıysa adresten de düşer: sayfa yenilenince aynı öneri ikinci kez ön dolgu
      // yapmamalı — satır artık `pending` değil, `readZoneHandoff` zaten `null` dönerdi ama adreste
      // ölü bir parametre bırakmak da bir sonraki paylaşımda kafa karıştırırdı.
      if (handoff) {
        router.replace(`/operations/deliveries?tab=routes&route=${selected?.id ?? handoff.zoneId}`);
        return;
      }
      router.refresh();
    });
  };

  // Harita ilk kez `zoom: 11` ile doğuyor; ilk `moveend` gelene kadar eşiğin ÜSTÜNDE saymak doğru
  // olan — aksi hâlde ekran bir an "yakınlaşın" deyip sonra kendi kendine düzelirdi.
  const zoom = viewport?.zoom ?? FREE_CODE_MIN_ZOOM;
  const tooFar = zoom < FREE_CODE_MIN_ZOOM;

  /**
   * **Görüş alanı okuması** — haritanın boştaki kodları çizebilmesinin tek yolu (19.20).
   *
   * Eşiğin ALTINDA istek atılmıyor: o yakınlıkta noktalar birbirine değip tıklanamaz hâle geliyor
   * (ölçüm `FREE_CODE_MIN_ZOOM` künyesinde), yani getirilen veri kullanılamazdı. Kaydırma zaten
   * haritada 250 ms geciktiriliyor; burada ikinci bir gecikme yok.
   *
   * Yarış koşulu: iki kaydırma arka arkaya yapıldığında ikinci istek daha önce dönebilir ve eski
   * cevap yenisini ezerdi. `latest` damgası son isteğin dışındaki cevapları atıyor.
   */
  const latestRequest = useRef(0);
  useEffect(() => {
    if (!viewport || viewport.zoom < FREE_CODE_MIN_ZOOM) {
      setFreePoints(null);
      setTruncated(false);
      return;
    }
    const stamp = ++latestRequest.current;
    void readMapCodesAction({
      minLat: viewport.minLat,
      maxLat: viewport.maxLat,
      minLng: viewport.minLng,
      maxLng: viewport.maxLng,
    }).then((result) => {
      if (stamp !== latestRequest.current) return;
      if (!result.data) {
        // Okuma düştü: elde veri YOK demek, "boşta kod yok" demek değil — `null` bırakılıyor.
        setFreePoints(null);
        setTruncated(false);
        return;
      }
      setFreePoints(
        result.data.points.map((point) => ({
          country: point.country,
          postalCode: point.postalCode,
          lat: point.lat,
          lng: point.lng,
          places: point.places,
        })),
      );
      setTruncated(result.data.truncated);
    });
  }, [viewport]);

  return (
    <RoutesDesktop
      tooFar={tooFar}
      freePoints={freePoints}
      truncated={truncated}
      data={data}
      contextWarehouseId={contextWarehouseId}
      selected={selected}
      draft={draft}
      onSelect={select}
      onDraft={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
      onPick={pick}
      onSave={save}
      onViewport={setViewport}
      viewport={viewport}
      hint={hint}
      homeCountry={(home?.countryCode ?? 'FR') as Country}
      busy={busy}
      error={error}
      handoff={handoff}
    />
  );
}
