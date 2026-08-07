'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PostalCodeSuggestion } from '@lezzet/database';
import { Chip } from '@/components/operation/ui/chip';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { ToggleField } from '@/components/operation/form/toggle';
import { WEEKDAYS } from '@/components/operation/form/calendar-math';
import { ZoneMap, keyOfPoint, type ZoneCodeState, type ZoneMapPoint } from '@/components/operation/ui/zone-map';
import { saveZoneAction, searchPostalCodesAction, zoneMapPointsAction } from './actions';
import type { PostalCodePick, WarehouseRowView, ZoneCardView } from './warehouses-types';

/**
 * Bölge — deponun hizmet alanının kurulduğu yer (19.5).
 *
 * ── BÖLGE NEDEN VAR ──────────────────────────────────────────────────────────
 * Posta kodu doğrudan depoya bağlanmaz, çünkü bölge yalnız bir gruplama değil **teslim günlerini**
 * taşıyan katmandır. Kodu doğrudan depoya bağlamak günü kaybettirirdi. Yapı bu yüzden üç katmanlı:
 * depo → bölge → kodlar.
 *
 * ── SERBEST METİN GİRİŞİ YOK ────────────────────────────────────────────────
 * Kodlar referans tablosundan (`postal_code_place`) seçilir. Yazım hatası sınıfı böyle kapanır:
 * haritada — yani veride — olmayan bir kod sisteme hiç giremez.
 *
 * ── HARİTA GELDİ, AMA YARIM (07.08) ─────────────────────────────────────────
 * Tasarım bölge kurulumunun ASIL aracını harita olarak tanımlıyor (bölge kararı coğrafi bir
 * karardır) ve liste onun ikinci görünümü. Harita artık burada ve **tanımlı kodları** çiziyor: bu
 * bölgenin kodları ile deponun öteki bölgelerinin tuttukları. Tıklayarak ÇIKARABİLİRSİNİZ.
 *
 * **Henüz EKLEYEMEZSİNİZ ve sebebi bir kapı:** "boşta" kodları görebilmek için haritanın kendi
 * okuması gerekiyor (görünen alandaki tüm kodlar) — o kod hiçbir bölgeye ait olmadığı için başka
 * hiçbir yerde listelenmiyor. Talep açık (`docs/talep/arka-uc-harita-icin-posta-kodu-okumasi.md`).
 * O gelene kadar ekleme yolu aşağıdaki seçici; tasarımın *"serbest metin girişi yok"* kuralı zaten
 * bugün de geçerli — seçici referans tablosundan seçtiriyor, yazdırmıyor. BEKLEYEN(19.20)
 */
const FORM_ID = 'zone-form';

interface ZoneDialogProps {
  warehouse: WarehouseRowView;
  /** null = yeni bölge. */
  editing: ZoneCardView | null;
  /** Aynı deponun öteki bölgeleri — haritada "başka bölgede tanımlı" hâlini çizebilmek için. */
  siblingZones: ZoneCardView[];
  onClose: () => void;
  onSaved: () => void;
}

export function ZoneDialog({ warehouse, editing, siblingZones, onClose, onSaved }: ZoneDialogProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(editing?.weekdays ?? []);
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [codes, setCodes] = useState<PostalCodePick[]>(editing?.postalCodes ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [points, setPoints] = useState<ZoneMapPoint[]>([]);

  /** Deponun ÖTEKİ bölgelerinin tuttuğu kodlar — haritada "başka bölgede tanımlı" hâli. */
  const taken = useMemo(() => {
    const map = new Map<string, string>();
    for (const zone of siblingZones) {
      if (zone.id === editing?.id) continue;
      for (const pick of zone.postalCodes) map.set(`${pick.country}:${pick.postalCode}`, zone.name);
    }
    return map;
  }, [siblingZones, editing?.id]);

  const mine = useMemo(() => new Set(codes.map((pick) => `${pick.country}:${pick.postalCode}`)), [codes]);

  // Koordinatlar seçiciden GELMEZ (öneri satırı koordinat taşımaz) — kod kümesi değiştikçe okunur.
  useEffect(() => {
    const wanted = [...codes, ...[...taken.keys()].map(fromKey)];
    if (wanted.length === 0) {
      setPoints([]);
      return;
    }
    let live = true;
    void zoneMapPointsAction(wanted).then(({ data }) => {
      if (live && data) setPoints(data);
    });
    return () => {
      live = false;
    };
  }, [codes, taken]);

  const stateOf = useCallback(
    (point: ZoneMapPoint): ZoneCodeState =>
      mine.has(keyOfPoint(point)) ? 'mine' : taken.has(keyOfPoint(point)) ? 'taken' : 'free',
    [mine, taken],
  );

  /**
   * Noktaya tıklama. **Yalnız KENDİ kodunu çıkarır**: başka bölgenin tuttuğu koda tıklamak bir işlem
   * değil bir SORUDUR ("kim tutuyor?") ve cevabı yazılır — sessizce hiçbir şey yapmayan bir tıklama
   * operatöre "bozuk" der.
   */
  const onPick = useCallback(
    (point: ZoneMapPoint) => {
      const key = keyOfPoint(point);
      if (mine.has(key)) {
        setCodes((prev) => prev.filter((pick) => `${pick.country}:${pick.postalCode}` !== key));
        setError(null);
        return;
      }
      const holder = taken.get(key);
      setError(
        holder
          ? `${point.postalCode} eklenemez — ${holder} bölgesinde tanımlı. Bir kod tek bölgede olabilir; taşımak için önce oradan çıkarın.`
          : null,
      );
    },
    [mine, taken],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    void saveZoneAction({ id: editing?.id, warehouseId: warehouse.id, name, weekdays, isActive, postalCodes: codes })
      .then((result) => {
        if (result.error) setError(result.error);
        else onSaved();
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `${editing.name}` : 'Bölge ekle'}
      subtitle={`${warehouse.name} (${warehouse.code}) hizmet alanı`}
      maxWidth={560}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={submitting}
          error={error}
          // Pasifleştirme kayda EŞLİK EDEN karar: pasif bölge kodlarını TUTMAYA devam eder (kural
          // veritabanında) — silme yok, çünkü yeniden açıldığında iki sahipli bir kod bırakırdı.
          actions={<ToggleField on={isActive} onChange={setIsActive} label="Bölge aktif" bare />}
          blockedReason={name.trim().length === 0 ? 'Bölgenin bir adı olmalı' : null}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <FieldShell label="Bölge adı" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Strasbourg Merkez" autoFocus />
        </FieldShell>

        <FieldShell
          label="Teslim günleri"
          labelAside={weekdays.length === 0 ? 'gün verilmezse bu bölgeye teslimat planlanmaz' : undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((label, i) => {
              const iso = i + 1;
              const on = weekdays.includes(iso);
              return (
                <Chip
                  key={iso}
                  active={on}
                  onClick={() => setWeekdays((prev) => (on ? prev.filter((d) => d !== iso) : [...prev, iso].sort((a, b) => a - b)))}
                >
                  {label}
                </Chip>
              );
            })}
          </div>
        </FieldShell>

        {/* Harita, listenin ÜSTÜNDE: tasarım kod listesini haritanın SONUCU sayıyor, girdisi değil. */}
        <FieldShell label="Hizmet alanı" labelAside={points.length === 0 ? 'kod seçilince harita dolar' : undefined}>
          <div className="flex flex-col gap-1.5">
            <div className="h-[280px] overflow-hidden rounded-ops-card border border-ops-line">
              <ZoneMap points={points} stateOf={stateOf} onPick={onPick} />
            </div>
            <div className="flex flex-wrap items-center gap-3 font-ops-body text-ops-micro text-ops-muted">
              <Legend tone="bg-ops-olive" label="bu bölgenin kodu" />
              <Legend tone="bg-ops-amber" label="başka bölgede tanımlı" />
              <span className="ml-auto">Noktaya tıkla → bölgeden çıkar</span>
            </div>
          </div>
        </FieldShell>

        <FieldShell
          label="Posta kodları"
          labelAside={`${codes.length} kod`}
        >
          <PostalCodePicker codes={codes} onChange={setCodes} homeCountry={warehouse.countryCode} />
        </FieldShell>

        <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
          Bir kod yalnız <strong>tek bölgede</strong> olabilir (pasif bölge dahil); başka bölgenin tuttuğu bir kod
          eklenirse kayıt reddedilir ve hangi bölgenin tuttuğu söylenir. Bir kodu çıkarmak o adresleri rota dışına
          düşürür ve kargo yoluna geçirir.
        </span>
      </form>
    </Dialog>
  );
}

/**
 * Posta kodu seçici — referans tablosunda ARAR, serbest metin kabul etmez.
 *
 * Anahtar `(ülke, kod)`: aynı kod iki ülkede birden geçerli olabilir (FR/DE kodlarının ~%10'u öyle)
 * ve bölge sınır ötesi olabildiği için ikisi de taşınır. Seçilmiş kodlar seçenek listesinde HEP
 * bulunur — yoksa arama sonucu değişince çipler etiketini kaybederdi.
 */
function PostalCodePicker({
  codes,
  onChange,
  homeCountry,
}: {
  codes: PostalCodePick[];
  onChange: (next: PostalCodePick[]) => void;
  homeCountry: WarehouseRowView['countryCode'];
}) {
  const [results, setResults] = useState<PostalCodeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const onSearch = useCallback((term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    void searchPostalCodesAction(term)
      .then(({ data }) => setResults(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const selectedValues = codes.map(keyOf);
  const options = [
    // Seçilenler önce ve her zaman: `MultiSelect` çipin etiketini seçenek listesinden okuyor.
    ...codes.map((c) => ({ value: keyOf(c), label: labelOf(c, [], homeCountry) })),
    ...results
      .filter((r) => !selectedValues.includes(keyOf(r)))
      .map((r) => ({ value: keyOf(r), label: labelOf(r, r.places, homeCountry) })),
  ];

  return (
    <MultiSelect
      options={options}
      selected={selectedValues}
      onChange={(next) => onChange(next.map(parseKey))}
      onSearch={onSearch}
      loading={loading}
      addLabel="+ posta kodu"
      searchPlaceholder="Kodun ilk hanelerini yazın (67…)"
      emptyText="Bu önekle kod yok — referans tablosunda olmayan kod eklenemez."
    />
  );
}

/** `(ülke, kod)` ikilisinin dize anahtarı; seçim listesi tek bir dize taşıyabiliyor. */
function keyOf(c: { country: PostalCodePick['country']; postalCode: string }): string {
  return `${c.country}:${c.postalCode}`;
}

function parseKey(key: string): PostalCodePick {
  const [country, postalCode] = key.split(':');
  return { country: country as PostalCodePick['country'], postalCode: postalCode ?? '' };
}

/**
 * Seçenek etiketi. Yer adları HAM geliyor (servis bilerek etiket kurmuyor); kısaltma kararı burada:
 * ilk iki yerleşim yazılır, kalanı sayılır. Çok yerleşimli kodda tek ad yazmak yanlış olurdu —
 * `67800` "Strasbourg" değil, Bischheim/Hœnheim'dır.
 */
function labelOf(
  c: { country: PostalCodePick['country']; postalCode: string },
  places: readonly string[],
  homeCountry: PostalCodePick['country'],
): string {
  const where = places.length === 0 ? '' : places.length <= 2 ? places.join(', ') : `${places.slice(0, 2).join(', ')} +${places.length - 2}`;
  // Ülke eki yalnız deponun kendi ülkesinden farklıysa: aynı ülkede her satıra "FR" yazmak gürültü.
  const country = c.country === homeCountry ? '' : ` · ${COUNTRY_LABELS[c.country]}`;
  return where ? `${c.postalCode} · ${where}${country}` : `${c.postalCode}${country}`;
}

/** Harita göstergesi — nokta rengiyle anlamı yan yana; renk tek başına bir sözlük değildir. */
function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

/** `ülke:kod` → seçim nesnesi. Anahtar biçimini bilen tek yer burasıdır. */
function fromKey(key: string): PostalCodePick {
  const [country, postalCode] = key.split(':');
  return { country: country as PostalCodePick['country'], postalCode: postalCode ?? '' };
}
