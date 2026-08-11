'use client';

import type { ReactNode } from 'react';
import {
  ALLERGEN_LABELS,
  ProductAllergenEnum,
  resolveLocalizedText,
  type LocalizedText,
  type Nutrition,
  type ProductAllergen,
  type ProductDetailsUpdate,
  type ProductDraftPayload,
} from '@lezzet/types';
import { LocalizedTextField } from '@/components/operation/form/localized-text-field';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { NutritionField } from '@/components/operation/form/nutrition-field';
import { Toggle } from '@/components/operation/form/toggle';
import { ProposalAside } from '@/components/operation/ui/proposal-aside';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { DECLARATION_FIELD_LABEL } from '../assistant-labels';

/**
 * ÜRÜN BEYANININ TAMAMLANMASI — kuyruğun içinde, ALAN ALAN karar (22.14).
 *
 * ── NEDEN "HEPSİ YA DA HİÇBİRİ" YETMEDİ ─────────────────────────────────────
 * Bu tip bir tur yalnız önizlemeydi: fark tablosu çiziliyor, altında tek bir "Uygula" duruyordu.
 * Fırsat ve kampanyada bu yeterliydi çünkü karar TEK bir şeydi (bir fiyat, bir kural). Burada karar
 * yedi ayrı şey ve **her birinin ayrı riski var**: asistanın açıklaması iyi olabilir ama alerjen
 * satırı şüpheli; ya da tersi. Tek düğme, operatörü "iyi olanı almak için şüpheliyi de al" ikilemine
 * sokuyordu — ve `updateDetails` sürüm tutmadığı için yanlış giden alan geri getirilemiyordu.
 *
 * Kullanıcı kararı (11.08): **alan alan seçim + düzenleme.** Patron açıklamayı alıp alerjeni
 * reddedebilir, aldığını da yazmadan önce düzeltebilir.
 *
 * ── YENİ ALAN KOMPONENTİ YAZILMADI ──────────────────────────────────────────
 * Metinler `LocalizedTextField`, alerjen/iz `MultiSelect`, besin künyesi `NutritionField` —
 * üçü de ürün formunun kullandığı çekirdekler. Sonuncusu bu iş için RHF sarmalayıcısından
 * ayrıldı (`nutrition-field` künyesi): kopyalansaydı kJ↔kcal çevrimi, satırların yasal sırası ve
 * "0 bir beyandır" ayrımı bir gün iki yüzeyde ayrışırdı.
 *
 * ── SEÇİLMEYEN ALAN GÖNDERİLMEZ, BOŞALTILMAZ ────────────────────────────────
 * Kapı yalnız verilen alanlara dokunur (`saveProductDeclarationAction`). Seçim kaldırmak "bu alanı
 * boşalt" değil "bu alana hiç dokunma" demektir — ikisi karıştırılırsa reddedilen bir öneri, dolu
 * bir alanı silen bir onaya döner.
 */

/** Dilekçenin dokunabildiği alanlar — sıra ekranda da bu sırayla okunur (önce metin, sonra künye). */
const FIELD_ORDER = ['name', 'description', 'ingredients', 'storageInstructions', 'allergens', 'traces', 'nutrition'] as const;
type DeclField = (typeof FIELD_ORDER)[number];

/** Uzun metin isteyen alanlar — kutu yüksekliği içeriğe göre değişsin diye ayrı. */
const LONG_TEXT: ReadonlySet<DeclField> = new Set(['description', 'ingredients', 'storageInstructions']);

/**
 * Formun durumu: asistanın önerdiği değerler (düzenlenebilir) + hangilerinin yazılacağı.
 *
 * `fields` payload'ın şekliyle AYNI: ekran iki nesneyi alan alan yan yana koyabilsin diye
 * (`ProductDraftPayloadSchema` künyesindeki simetri gerekçesi). `selected` ayrı tutuluyor çünkü
 * "değeri var ama yazılmayacak" meşru bir hâl — alanı silmek o kararı geri alınamaz kılardı.
 */
export interface ProductDraftValues {
  fields: ProductDraftPayload['fields'];
  selected: Partial<Record<DeclField, boolean>>;
}

/** Formun açılış hâli: asistanın yazdığı her alan SEÇİLİ gelir — dilekçenin kendisi budur. */
export function productDraftValuesFrom(payload: ProductDraftPayload): ProductDraftValues {
  const selected: Partial<Record<DeclField, boolean>> = {};
  for (const key of FIELD_ORDER) {
    if (payload.fields[key] !== undefined) selected[key] = true;
  }
  return { fields: { ...payload.fields }, selected };
}

/** Kaydetmenin engeli: tek bir alan bile seçilmediyse onay hiçbir şey yazmaz. */
export function productDraftBlocked(values: ProductDraftValues): string | null {
  return Object.values(values.selected).some(Boolean) ? null : 'En az bir alan seçilmeli';
}

/**
 * Yazılacak alanlar — **yalnız seçili olanlar.** Seçilmeyen alan girdiye HİÇ girmez (`undefined`
 * göndermek ile alanı hiç göndermemek aynı şey değil: birincisi dolu bir beyanı boşaltır).
 */
export function productDraftInput(values: ProductDraftValues): ProductDetailsUpdate {
  const out: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    if (values.selected[key] && values.fields[key] !== undefined) out[key] = values.fields[key];
  }
  return out as ProductDetailsUpdate;
}

interface ProductDraftBodyProps {
  payload: ProductDraftPayload;
  subject: ProposalSubject | null;
  values: ProductDraftValues;
  onChange: (next: ProductDraftValues) => void;
  disabled: boolean;
  /** Karar VERİLMİŞ öneri — aynı gövde, düzenlenmeyen hâliyle. */
  readOnly: boolean;
}

export function ProductDraftBody({ payload, subject, values, onChange, disabled, readOnly }: ProductDraftBodyProps) {
  const current = payload.currentFields;
  /** Eski hâl BİLİNİYOR mu — bilinmiyorsa üzerine yazma iddia EDİLMEZ ("?" bir değer değil). */
  const currentKnown = current !== undefined;

  const rows = FIELD_ORDER.filter((key) => payload.fields[key] !== undefined);
  const picked = rows.filter((key) => values.selected[key]);
  const overwriting = picked.filter((key) => currentKnown && hasValue(current?.[key]));

  const set = (key: DeclField, value: unknown) =>
    onChange({ ...values, fields: { ...values.fields, [key]: value } });
  const toggle = (key: DeclField, on: boolean) =>
    onChange({ ...values, selected: { ...values.selected, [key]: on } });

  return (
    <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white p-3.5">
      {/* İKİ SÜTUN — indirim gövdesiyle aynı oran (2:1). Karar burada da FORMUN kendisi: yedi alan,
          üçü çok dilli metin. Üçte bire sıkıştırmak metin kutularını okunmaz kılardı. */}
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-[22rem] flex-[2] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Yazılacak alanlar</span>
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {picked.length}/{rows.length} seçili
              {overwriting.length > 0 ? ` · ${overwriting.length}’i dolu alanın üzerine` : ''}
            </span>
          </div>

          {rows.map((key) => (
            <FieldRow
              key={key}
              label={DECLARATION_FIELD_LABEL[key] ?? key}
              checked={Boolean(values.selected[key])}
              onToggle={(on) => toggle(key, on)}
              // Üzerine yazma UYARISI satırın kendisinde: toplu bir uyarı kutusu "hangisi?" sorusunu
              // cevapsız bırakıyordu, oysa karar alan alan veriliyor.
              overwrites={currentKnown && hasValue(current?.[key])}
              currentText={currentKnown ? summarize(current?.[key]) : null}
              disabled={disabled || readOnly}
              selectable={!readOnly}
            >
              {renderControl({
                field: key,
                value: values.fields[key],
                onChange: (next) => set(key, next),
                // Seçilmeyen alan da GÖRÜNÜR ama düzenlenemez: gizlemek, asistanın o alanı
                // yazdığını saklamak olurdu (22.10 ilkesi — boş alan da gösterilir).
                disabled: disabled || readOnly || (!readOnly && !values.selected[key]),
              })}
            </FieldRow>
          ))}
        </div>

        <ProposalAside
          subject={subject}
          fallbackTitle={payload.productName}
          facts={[
            { label: 'Alan', value: `${rows.length} yazılacak`, now: `${picked.length} seçili` },
            {
              label: 'Üzerine yazma',
              value: currentKnown ? `${overwriting.length} dolu alan` : 'eski hâl okunamadı',
            },
            {
              label: 'Net okunmayan',
              value: payload.uncertainFields.length > 0 ? payload.uncertainFields.map(labelOf).join(' · ') : 'yok',
            },
            {
              label: 'Onay sonrası eksik',
              value: payload.remainingGaps.length > 0 ? `${payload.remainingGaps.length} beyan` : 'kayıt tam olur',
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Bir alanın satırı: seçim anahtarı · etiket · bugünkü değer · düzenlenebilir kutu.
 *
 * Bugünkü değer kutunun ÜSTÜNDE ve soluk: operatör yazacağı metni okurken neyi kaybedeceğini aynı
 * bakışta görmeli. Ayrı bir "fark tablosu"na bakmak, kararı iki ekran arasında bölerdi.
 */
function FieldRow({
  label,
  checked,
  onToggle,
  overwrites,
  currentText,
  disabled,
  selectable,
  children,
}: {
  label: string;
  checked: boolean;
  onToggle: (on: boolean) => void;
  overwrites: boolean;
  currentText: string | null;
  disabled: boolean;
  /** Seçim anahtarı çizilsin mi — karar verilmiş öneride `false` (yukarıdaki künye). */
  selectable: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-ops-card border px-3 py-2.5 ${
        checked && selectable ? 'border-ops-line-strong bg-ops-white' : 'border-ops-line bg-ops-surface-sunken'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* ── KARAR VERİLMİŞ ÖNERİDE ANAHTAR ÇİZİLMEZ ────────────────────────
            Arşiv satırı formu `initial(payload)` ile yeniden açıyor, yani anahtarlar HEPSİ SEÇİLİ
            döner — oysa operatör o gün yarısını seçmiş olabilir. Kilitli bir anahtarı göstermek,
            verilmemiş bir kararı verilmiş gibi okutur. Yazılanların kaydı `result`ta duruyor
            (`saveProductDeclarationAction`), ekranın uydurmasına gerek yok. */}
        {selectable ? (
          // Anahtar ve etiket TEK tıklama hedefi: dar bir anahtarı avlamak yerine satırın adına
          // basmak yeter. `onChange` verilmeyince `Toggle` dekoratife düşüyor (kendi künyesi).
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(!checked)}
            className="flex cursor-pointer items-center gap-2.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Toggle on={checked} size="sm" />
            <span className={`font-ops-display text-ops-sm font-semibold ${checked ? 'text-ops-ink' : 'text-ops-muted'}`}>{label}</span>
          </button>
        ) : (
          <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">{label}</span>
        )}
        {overwrites ? (
          <span className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-2 py-0.5 font-ops-body text-ops-micro font-medium text-ops-amber-dark">
            Bugün dolu — üzerine yazılacak
          </span>
        ) : null}
      </div>

      {/* Eski hâl: "—" boştu, `null` okunamadı. İkisi ayrı şey ve ikisi ayrı yazılır. */}
      <span className="font-ops-body text-ops-xs text-ops-faint">
        Bugün: {currentText === null ? 'okunamadı' : currentText || '—'}
      </span>

      {children}
    </div>
  );
}

/** Alanın tipine göre kontrol — hepsi ürün formunun kendi çekirdekleri, yenisi yazılmadı. */
function renderControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: DeclField;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
}): ReactNode {
  if (field === 'allergens' || field === 'traces') {
    return (
      <MultiSelect
        options={ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a]) }))}
        selected={(value as ProductAllergen[] | undefined) ?? []}
        onChange={(next) => onChange(next)}
        disabled={disabled}
        addLabel={field === 'allergens' ? '+ alerjen' : '+ iz'}
        searchPlaceholder="Alerjen ara…"
      />
    );
  }

  if (field === 'nutrition') {
    return (
      <NutritionField
        value={(value as Nutrition | undefined) ?? null}
        onChange={(next) => onChange(next)}
        disabled={disabled}
        // Kabuk KAPALI: başlık ve "100 g başına" künyesi satırın kendi etiketinde zaten var,
        // ikinci kez yazmak aynı şeyi iki kere söylerdi.
        shell={false}
      />
    );
  }

  return (
    <LocalizedTextField
      value={(value as LocalizedText | undefined) ?? {}}
      onChange={(next) => onChange(next)}
      label={null}
      disabled={disabled}
      layout="stacked"
      multiline={LONG_TEXT.has(field)}
    />
  );
}

/** Alan adının okunur karşılığı — `uncertainFields` ham anahtar taşıyor. */
function labelOf(key: string): string {
  return DECLARATION_FIELD_LABEL[key] ?? key;
}

/** Alanın BUGÜN dolu olup olmadığı — boş dizi ve boş metin DOLU sayılmaz. */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some((v) => (typeof v === 'string' ? v.trim() : v !== null));
  return true;
}

/** Bugünkü değerin tek satırlık özeti — kutunun üstünde okunur, tam metin ürün ekranında. */
function summarize(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    return value.length === 0 ? '' : value.map((v) => resolveLocalizedText(ALLERGEN_LABELS[v as ProductAllergen] ?? {}) || String(v)).join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Çok dilli metin: dolu dilleri ve ilk metnin başını göster.
    const langs = (['tr', 'fr', 'de'] as const).filter((l) => typeof record[l] === 'string' && (record[l] as string).trim());
    if (langs.length > 0) {
      const first = (record[langs[0]!] as string).trim();
      return `${langs.map((l) => l.toUpperCase()).join('/')} · ${first.length > 60 ? `${first.slice(0, 60)}…` : first}`;
    }
    // Besin künyesi: kaç kalem dolu.
    const filled = Object.values(record).filter((v) => v !== null && v !== undefined).length;
    return filled > 0 ? `${filled} kalem dolu` : '';
  }
  return String(value);
}
