'use client';

import type { ZoneExtendPayload } from '@lezzet/types';
import { ZoneFormBody } from '@/components/operation/form/zone-form/body';
import {
  zoneCodeKey,
  zoneSummary,
  type ZoneCandidateCode,
  type ZoneFormValues,
} from '@/components/operation/form/zone-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { num } from '@/components/operation/ui/format';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map-model';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * BÖLGE GENİŞLETME ÖNERİSİ — kuyruğun içinde, haritayla (22.36).
 *
 * ── SON GÖVDESİZ TİPTİ ──────────────────────────────────────────────────────
 * Kuyruğun on bir öneri tipinden onu diyaloğun içinde düzenlenebiliyordu; bu tip `handoff`
 * modunda kalmıştı ve rota ekranını ön doldurup oraya yolluyordu. Gerekçesi kayıtlıydı ve
 * doğruydu — *"hangi kod girsin sorusu haritasız cevaplanamaz"* — ama kullanıcının kuralı da
 * açıktı (15.08): *"biz yönlendirme yapmıyoruz; doğrudan açılan diyaloğun içerisinde düzenlenecek
 * ortak komponent yapıyoruz."* İkisi çelişmiyor: çözüm yönlendirmeyi sürdürmek değil, HARİTAYI
 * diyaloğa getirmekti.
 *
 * ── DİLEKÇE NE KADAR, KARAR NE KADAR ────────────────────────────────────────
 * Asistan bölgeyi ve kodları önerir; kanıtları da taşır (kaç istek, kaç bekleyen). Operatörün
 * kararı **hangi kodların gireceğidir** — hepsi değil. Kullanıcının 09.08'deki itirazı tam buydu:
 * *"hepsine birden gidiyor, ben belki bir bölgeyi istiyorum."* Bu yüzden bekleyen sayısı seçimden
 * hesaplanıyor ve onaydan ÖNCE görünüyor.
 */

/** Dilekçe → formun açılış değeri: **önerilen rota + önerilen kodların tamamı seçili.** */
export function zoneValuesFrom(payload: ZoneExtendPayload): ZoneFormValues {
  // Açılış "önerinin kabul edilmiş hâli"dir, boş liste değil: patron çoğu zaman öneriyi olduğu
  // gibi onaylar ve o yolu üç tıklamaya çıkarmak, kuyruğun hızını alırdı. Çıkarmak bir tıklama.
  // Rota da öyle: asistanın önerdiği rota seçili gelir, değiştirmek tek seçim.
  return {
    zoneId: payload.zoneId,
    selectedKeys: payload.postalCodes.map((code) => zoneCodeKey({ country: payload.country, postalCode: code.postalCode })),
  };
}

/**
 * Dilekçenin kodları + bugünkü gerçek: kodu başka bölge tutuyor mu.
 *
 * `heldBy` PAYLOAD'DAN değil bölge okumasından geliyor — dilekçe kurulduğunda boşta olan bir kod
 * onay anında başka bir rotaya girmiş olabilir ve o hâlde seçim kısıtla reddedilirdi. Ekran bunu
 * önden söylüyor.
 */
function candidatesOf(payload: ZoneExtendPayload, options: AssistantFormOptions, targetZoneId: string): ZoneCandidateCode[] {
  const points = Object.values(options.zones)[0]?.points ?? [];
  const zoneOfKey = new Map(points.map((point) => [zoneCodeKey(point), point.zoneId]));
  const placesOfKey = new Map(points.map((point) => [zoneCodeKey(point), point.places]));
  const nameOfZone = new Map(Object.values(options.zones).map((zone) => [zone.zoneId, zone.zoneName]));

  return payload.postalCodes.map((code) => {
    const key = zoneCodeKey({ country: payload.country, postalCode: code.postalCode });
    const holder = zoneOfKey.get(key) ?? null;
    return {
      country: payload.country,
      postalCode: code.postalCode,
      // Ad önce KOORDİNAT okumasından, yoksa dilekçenin taşıdığından: okuma tüm yerleşimleri
      // getiriyor (`OB-04`), dilekçe ise tek bir ad taşıyor ve o da `null` olabilir.
      places: placesOfKey.get(key) ?? (code.placeName ? [code.placeName] : []),
      requestCount: code.requestCount,
      waitingCount: code.waitingCount,
      // Engel SEÇİLİ rotaya göre: operatör hedefi değiştirince "başka rotada" hâli de değişir.
      // Kodu zaten hedef rota tutuyorsa engel yok — kapı onu ikinci kez yazmıyor.
      heldBy: holder && holder !== targetZoneId ? (nameOfZone.get(holder) ?? 'başka rota') : null,
    };
  });
}

interface ZoneExtendBodyProps {
  payload: ZoneExtendPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: ZoneFormValues;
  onChange: (next: ZoneFormValues) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function ZoneExtendBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: ZoneExtendBodyProps) {
  // Bağlam SEÇİLİ rotadan okunuyor, dilekçeninkinden değil: operatör hedefi değiştirdiğinde
  // haritadaki "bu rotanın kodu" kümesi de, engel listesi de onunla birlikte değişmeli.
  const context = options.zones[values.zoneId] ?? options.zones[payload.zoneId];
  const candidates = candidatesOf(payload, options, values.zoneId);
  const heldKeys = new Set(
    (context?.points ?? []).filter((p) => p.zoneId !== null && p.zoneId !== values.zoneId).map(zoneCodeKey),
  );
  // Rota listesi: hepsi, deposuyla ve kod sayısıyla — seçim "hangi araç taşıyacak" kararıdır.
  const routes = Object.values(options.zones)
    .map((zone) => ({
      id: zone.zoneId,
      name: zone.zoneName,
      warehouseName: zone.warehouseName,
      codeCount: zone.currentCodes.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  /**
   * **BÖLGE OKUNAMADIYSA GÖVDE ÇİZİLMEZ** ve sebebi yazılır.
   *
   * Bölge silinmiş olabilir (dilekçe 24 saat yaşıyor). Haritayı boş, listeyi kanıtsız çizmek
   * "her şey yolunda" der ve onaya basan operatör hatayı ancak yazma anında görürdü.
   */
  if (!context) {
    return (
      <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
        “{payload.zoneName}” bölgesi okunamadı — silinmiş olabilir. Bu öneri uygulanamaz; reddedip
        Teslimat &amp; Rota ekranından bakın.
      </p>
    );
  }

  const points: ZoneMapPoint[] = context.points.map((point) => ({
    country: point.country,
    postalCode: point.postalCode,
    lat: point.lat,
    lng: point.lng,
    places: point.places,
  }));

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[28rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <ZoneFormBody
          values={values}
          onChange={onChange}
          candidates={candidates}
          currentCodes={context.currentCodes}
          points={points}
          heldKeys={heldKeys}
          routes={routes}
          warehouseName={context.warehouseName}
          disabled={disabled || readOnly}
        />
      </div>

      <ProposalAside
        subject={subject}
        fallbackTitle="Bölge genişletme"
        facts={factsOf(payload, values, candidates, context)}
        payload={payload}
        meta={meta}
      />
    </div>
  );
}

/** Dilekçenin sayıları — satır YALNIZ sapma varken "şimdi" sütununu taşır (`ProposalAside` künyesi). */
function factsOf(
  payload: ZoneExtendPayload,
  values: ZoneFormValues,
  candidates: ZoneCandidateCode[],
  context: { zoneName: string; warehouseName: string | null; currentCodes: readonly unknown[] },
): ProposalFact[] {
  const summary = zoneSummary(values, candidates);
  const moved = context.zoneName !== payload.zoneName;
  return [
    // Operatör hedefi değiştirdiyse "şimdi" sütunu belirir: dilekçe hangi rotayı istemişti,
    // kayıt hangisine gidiyor — arşiv bu farkı okuyabilmeli.
    { label: 'Rota', value: payload.zoneName, ...(moved ? { now: context.zoneName } : {}) },
    ...(context.warehouseName ? [{ label: 'Depo', value: context.warehouseName }] : []),
    { label: 'Bugünkü kod', value: num(context.currentCodes.length) },
    // Dilekçenin önerdiği sayı ile operatörün seçtiği: fark varsa "şimdi" sütunu belirir.
    { label: 'Eklenecek', value: num(payload.postalCodes.length), now: num(summary.selected) },
    { label: 'Bildirim', value: `${num(summary.waiting)} müşteri` },
    { label: 'Talep', value: `${num(summary.requests)} istek` },
  ];
}
