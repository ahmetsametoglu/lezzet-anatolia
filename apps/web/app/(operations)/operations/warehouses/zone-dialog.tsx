'use client';

import { useCallback, useState } from 'react';
import type { PostalCodeSuggestion } from '@lezzet/database';
import { Chip } from '@/components/operation/ui/chip';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { ToggleField } from '@/components/operation/form/toggle';
import { WEEKDAYS } from '@/components/operation/form/calendar-math';
import { saveZoneAction, searchPostalCodesAction } from './actions';
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
 * ── HARİTA HENÜZ YOK ────────────────────────────────────────────────────────
 * Tasarım bölge kurulumunun ASIL aracını harita olarak tanımlıyor (koridor kararı coğrafi bir
 * karardır) ve liste onun ikinci görünümü. Bugün yalnız liste var: harita ayrı bir iştir (MapLibre +
 * karo stili) ve kendi görevinde duruyor. Liste eksik bir araç değil, aynı gerçeğin öteki
 * görünümü — kural (tek bölge, çakışma reddi) her iki yolda da aynı.
 */
const FORM_ID = 'zone-form';

interface ZoneDialogProps {
  warehouse: WarehouseRowView;
  /** null = yeni bölge. */
  editing: ZoneCardView | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ZoneDialog({ warehouse, editing, onClose, onSaved }: ZoneDialogProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(editing?.weekdays ?? []);
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [codes, setCodes] = useState<PostalCodePick[]>(editing?.postalCodes ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
