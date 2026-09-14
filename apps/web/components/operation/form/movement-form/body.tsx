'use client';

import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { ADVERTISING_NATURE, type MovementDirection } from '@lezzet/types';
import { Combobox } from '@/components/operation/form/combobox';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MONEY_FORM_GRID } from '@/components/operation/form/money-form-grid';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import {
  MANUAL_TYPES,
  MANUAL_TYPE_VIEW,
  natureAfterChange,
  naturesFor,
  typePatch,
  type CounterpartyOption,
  type ManualMovementForm,
  type ManualType,
  type NatureOption,
  type TagOption,
} from './schema';

/**
 * **ELLE PARA HAREKETİ FORMUNUN GÖVDESİ** — iki yüzeyin paylaştığı tek uygulama (22.18).
 *
 * `movement-dialog`ın içindeydi; asistanın para önerisi artık kuyruğun içinde karar veriliyor
 * (`money_movement` → `inline`) ve aynı formu o da açıyor. Kopyalansaydı bir gün biri "yön tipin
 * sonucudur" kuralını ya da reklam kampanyası kutusunun koşulunu yalnız bir yüzeyde düzeltirdi.
 *
 * ── DEVİRDEN İNLINE'A: NEDEN GÜVENLİ ────────────────────────────────────────
 * Tip `handoff`tı ve gerekçesi *"etki geri alınamaz (defter yazılır), yani karar ÖNCESİ düzenleme
 * şart"*tı. O şart KALKMIYOR — düzenleme hâlâ karardan önce, yalnız formun DURDUĞU yer değişiyor.
 * Kaydeden kapı yine finans ekranının kendi eylemi (`recordManualMovementAction` + `withProposal`).
 *
 * ── TÜR · CARİ · ETİKET (13.09 · ikinci karar, muhasebeci karşılaştırması) ──
 * Tür tek seçimdir ve hareket türüne göre süzülür (`naturesFor`); cari "kime ödendi"dir ve
 * varsayılan türü boş türe önerilir; etiket serbest ve çokludur. Hepsi aranabilir menüden seçilir.
 *
 * ── SABİT YUVALAR (12.24 · kullanıcı seçimi) ────────────────────────────────
 * Kip değişince kutu yer DEĞİŞTİRMEZ (`MONEY_FORM_GRID`): satır 1 hesap · tutar, satır 2 tür (ya da
 * sınıflandırılmamış harekette yön) · karşı taraf, satır 3 gün · açıklama, satır 4 etiketler ve
 * gerektiğinde yanında kampanya künyesi ya da sınıflandırılmamış girişin türü. Transfer gövdesi aynı
 * yuvaları kullanır. Para penceresi dört kipi kendi seçicisinde topladığı için gövdenin seçicisini
 * kapatır (`showTypeToggle`); asistan kuyruğu gövdenin kendi seçicisiyle açar.
 */
interface MovementFormBodyProps {
  control: Control<ManualMovementForm>;
  setValue: UseFormSetValue<ManualMovementForm>;
  /** Formun canlı değerleri — koşullu kutular (yön · tür · kampanya) bunlara bakıyor. */
  values: ManualMovementForm;
  accounts: Array<{ id: string; name: string }>;
  /** Tür sözlüğü (13.09) — yalnız AKTİF türler; form hareket türüne ve yöne uyanları gösterir. */
  natureOptions: readonly NatureOption[];
  /** Cariler — yalnız aktif. */
  counterpartyOptions: readonly CounterpartyOption[];
  /** Serbest etiketler — yalnız aktif. */
  tagOptions: readonly TagOption[];
  /**
   * Verilirse etiket menüsü sözlükte olmayan adı OLUŞTURUR ve seçer; yeni etiketin anahtarını döner.
   * Verilmezse (asistan kuyruğu) menü yalnız var olanı seçer.
   */
  onCreateTag?: (label: string) => Promise<string | null>;
  /** Hareket türü seçicisi gövdede mi (asistan kuyruğu) — Para penceresi kendi dört kipli seçicisini çizer (12.24). */
  showTypeToggle?: boolean;
  disabled?: boolean;
}

export function MovementFormBody({
  control,
  setValue,
  values,
  accounts,
  natureOptions,
  counterpartyOptions,
  tagOptions,
  onCreateTag,
  showTypeToggle = true,
  disabled = false,
}: MovementFormBodyProps) {
  const fitting = naturesFor(natureOptions, values.type, values.direction);
  // Belgeden gelen ödemeyi bağ izah eder; tür yalnız bağsız giderde şart (`movementBlock`).
  const natureRequired = values.type === 'expense' && !values.documentId;
  const isAdvertising = values.type === 'expense' && values.nature === ADVERTISING_NATURE;
  const isMisc = values.type === 'misc';
  const setNature = (nature: string) => setValue('nature', nature, { shouldValidate: true });
  /** Yön değişince tür yeniden süzülür — uymayan tür formda sessizce kalmaz. */
  const reshape = (type: ManualType, direction: MovementDirection) =>
    setNature(natureAfterChange(natureOptions, type, direction, values.nature));

  /** Cari seçilince varsayılan türü BOŞ türe konur; operatörün seçtiği tür ezilmez. */
  const pickCounterparty = (id: string) => {
    setValue('counterpartyId', id, { shouldValidate: true });
    const preset = counterpartyOptions.find((option) => option.value === id)?.defaultNature;
    if (!values.nature && preset && fitting.some((option) => option.value === preset)) setNature(preset);
  };

  const createTag = async (label: string) => {
    const slug = await onCreateTag?.(label);
    if (slug && !values.tags.includes(slug)) setValue('tags', [...values.tags, slug], { shouldValidate: true });
  };

  // TÜR iki yuvadan birinde durur: gider ve sermayede satır 2'nin başında (uyan tür yoksa da kutu
  // durur ve sebebini söyler — kaybolan kutu yerleşimi kaydırıyordu); sınıflandırılmamış hareket o yuvada
  // YÖNÜ sorar, türü yalnız varsa (bazı girişlerin türü olur) satır 4'e iner.
  const natureField = (
    <FieldShell label="Türü" required={natureRequired} labelAside={natureRequired ? undefined : 'isteğe bağlı'}>
      <Combobox
        value={values.nature}
        onChange={setNature}
        options={fitting.map(({ value, label }) => ({ value, label }))}
        placeholder="Tür seçin"
        searchPlaceholder="Tür ara…"
        emptyText={fitting.length > 0 ? 'Aramaya uyan tür yok' : 'Bu harekete uyan tür yok — Para ekranının Sözlük penceresinden ekleyin'}
        onClear={natureRequired ? undefined : () => setNature('')}
        clearLabel="Türü kaldır"
        disabled={disabled}
      />
    </FieldShell>
  );

  return (
    <div className="flex flex-col gap-4">
      {showTypeToggle ? (
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Ne kaydediliyor</span>
              <MultiToggle
                value={field.value}
                onChange={(next) => {
                  const patch = typePatch(natureOptions, values, next);
                  field.onChange(next);
                  setValue('direction', patch.direction);
                  setNature(patch.nature);
                }}
                options={MANUAL_TYPES.map((type) => ({ key: type, label: MANUAL_TYPE_VIEW[type].label }))}
                label="Hareket türü"
              />
              <span className="font-ops-body text-ops-xs text-ops-faint">{MANUAL_TYPE_VIEW[field.value].hint}</span>
            </div>
          )}
        />
      ) : null}

      <div className={MONEY_FORM_GRID}>
        {/* Satır 1 — hesap · tutar. Kilit KAPANDI (22.19 · 26.08): karar verilmiş öneride hesap seçici
            SOLUK çiziliyor — tek CSS kuralı (`fieldset:disabled …`), form `<fieldset disabled>` ile sarılı. */}
        <FormSelect
          control={control}
          name="accountId"
          label="Hangi hesap"
          required
          placeholder="Hesap seçin"
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        />
        <FormMoney control={control} name="amount" label="Tutar" required placeholder="0,00" disabled={disabled} />

        {/* Satır 2 — neyin parası · kimin. `misc` yönü SORAR, ötekiler sormaz: sorulmayan bir soruya kutu
            koymak, cevabı belli bir şeyi kullanıcıya tekrar ettirmektir. */}
        {isMisc ? (
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <FieldShell label="Para ne yaptı">
                <MultiToggle
                  value={field.value}
                  onChange={(next) => {
                    field.onChange(next);
                    reshape(values.type, next);
                  }}
                  options={[
                    { key: 'in', label: 'Girdi' },
                    { key: 'out', label: 'Çıktı' },
                  ]}
                  label="Paranın yönü"
                />
              </FieldShell>
            )}
          />
        ) : (
          natureField
        )}
        <FieldShell label="Karşı taraf" labelAside="isteğe bağlı">
          <Combobox
            value={values.counterpartyId}
            onChange={pickCounterparty}
            options={counterpartyOptions.map(({ value, label }) => ({ value, label }))}
            placeholder="Cari seçin"
            searchPlaceholder="Cari ara…"
            emptyText="Cari yok — Para ekranının Sözlük penceresinden ekleyin"
            onClear={() => setValue('counterpartyId', '', { shouldValidate: true })}
            clearLabel="Cariyi kaldır"
            disabled={disabled}
          />
        </FieldShell>

        {/* Satır 3 — gün · açıklama. */}
        <Controller
          control={control}
          name="valueDate"
          render={({ field }) => (
            <DateField label="Değer tarihi" labelAside="paranın hareket ettiği gün" value={field.value} onChange={field.onChange} disabled={disabled} />
          )}
        />
        <FormInput control={control} name="description" label="Açıklama" placeholder="Total Access — akaryakıt" disabled={disabled} />

        {/* Satır 4 — ETİKETLER: serbest işaret, çoklu, İZAH DEĞİL (13.09); sözlükte olmayan ad menüden
            oluşturulur (`onCreateTag` verildiyse). Yanında yalnız gerektiğinde: KAMPANYA künyesi reklam
            türlü giderde (analitiğin ROAS köprüsü, 12.5 — zorunlu değil: kampanyası bilinmeyen ajans
            faturası da girilebilmeli) ya da sınıflandırılmamış girişin türü. */}
        <FieldShell label="Etiketler" labelAside="isteğe bağlı">
          <MultiSelect
            options={[...tagOptions]}
            selected={values.tags}
            onChange={(next) => setValue('tags', next, { shouldValidate: true })}
            addLabel="+ etiket"
            searchPlaceholder="Etiket ara ya da yaz…"
            emptyText="Etiket yok"
            onCreate={onCreateTag ? (label) => void createTag(label) : undefined}
            disabled={disabled}
          />
        </FieldShell>
        {isAdvertising ? (
          <FormInput control={control} name="campaign" label="Kampanya künyesi" labelAside="boş bırakılabilir" placeholder="bayram-ig" disabled={disabled} />
        ) : isMisc && fitting.length > 0 ? (
          natureField
        ) : null}
      </div>
    </div>
  );
}
