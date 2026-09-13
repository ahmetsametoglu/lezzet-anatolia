'use client';

import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { ADVERTISING_NATURE, type MovementDirection } from '@lezzet/types';
import { Combobox } from '@/components/operation/form/combobox';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import {
  MANUAL_ENTRY_SCOPE,
  MANUAL_TYPES,
  MANUAL_TYPE_VIEW,
  natureAfterChange,
  naturesFor,
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
  disabled = false,
}: MovementFormBodyProps) {
  const fitting = naturesFor(natureOptions, values.type, values.direction);
  // Belgeden gelen ödemeyi bağ izah eder; tür yalnız bağsız giderde şart (`movementBlock`).
  const natureRequired = values.type === 'expense' && !values.documentId;
  const isAdvertising = values.type === 'expense' && values.nature === ADVERTISING_NATURE;
  const setNature = (nature: string) => setValue('nature', nature, { shouldValidate: true });
  /** Hareket türü ya da yön değişince tür yeniden süzülür — uymayan tür formda sessizce kalmaz. */
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

  return (
    <div className="flex flex-col gap-4">
      {/* Ekranın "burada olmayan"ı düğmeyi gizleyip susmak yerine cümleyle söyleniyor: sipariş
          tahsilatını neden giremediğini bilmeyen operatör onu `misc` olarak girer ve sipariş ile
          para kaydı sessizce ayrışır. */}
      <p className="rounded-ops-card bg-ops-surface-sunken px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-muted">
        {MANUAL_ENTRY_SCOPE}
      </p>

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Ne kaydediliyor</span>
            <MultiToggle
              value={field.value}
              onChange={(next) => {
                field.onChange(next);
                // Yön tipin SONUCUDUR, ayrı bir soru değil: gider çıkış, sermaye giriştir (motorun
                // kuralı). Yalnız `misc` serbest kalır — banka "para girdi/çıktı" der, sebebini
                // söylemez ve elle girilen karşılığı da öyledir.
                const direction = next === 'expense' ? 'out' : next === 'capital' ? 'in' : values.direction;
                setValue('direction', direction);
                reshape(next, direction);
              }}
              options={MANUAL_TYPES.map((type) => ({ key: type, label: MANUAL_TYPE_VIEW[type].label }))}
              label="Hareket türü"
            />
            <span className="font-ops-body text-ops-xs text-ops-faint">{MANUAL_TYPE_VIEW[field.value].hint}</span>
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        {/* Kilit KAPANDI (22.19 · 26.08): hesap seçici ve tür anahtarı karar verilmiş bir öneride
            artık SOLUK çiziliyor. Çözüm kontrol başına `disabled` geçirmek değil, tek CSS kuralı
            oldu (`globals.css` → `fieldset:disabled :is(button, input, select, textarea)`) — form
            zaten `<fieldset disabled>` ile sarılıydı, eksik olan yalnız görsel geri bildirimdi. */}
        <FormSelect
          control={control}
          name="accountId"
          label="Hangi hesap"
          required
          placeholder="Hesap seçin"
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        />
        <FormMoney control={control} name="amount" label="Tutar" required placeholder="0,00" disabled={disabled} />
      </div>

      {/* `misc` yönü SORAR, ötekiler sormaz — sorulmayan bir soruya kutu koymak, cevabı belli bir
          şeyi kullanıcıya tekrar ettirmektir. */}
      {values.type === 'misc' ? (
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Para ne yaptı</span>
              <MultiToggle
                value={field.value}
                onChange={(next) => {
                  field.onChange(next);
                  reshape(values.type, next);
                }}
                options={[
                  { key: 'in', label: 'Hesaba girdi' },
                  { key: 'out', label: 'Hesaptan çıktı' },
                ]}
                label="Paranın yönü"
              />
            </div>
          )}
        />
      ) : null}

      {/* TÜR + CARİ (13.09) — tür "bu para neyin parası", cari "kime ödendi / kimden geldi". Tür
          kutusu hareket türüne uyan tür yoksa HİÇ çizilmez: sınıflandırılmamış çıkışın türü yoktur,
          türü biliniyorsa o bir giderdir (`naturesFor`). */}
      <div className="grid grid-cols-2 gap-3">
        {fitting.length > 0 ? (
          <FieldShell label="Türü" required={natureRequired} labelAside={natureRequired ? undefined : 'isteğe bağlı'}>
            <Combobox
              value={values.nature}
              onChange={setNature}
              options={fitting.map(({ value, label }) => ({ value, label }))}
              placeholder="Tür seçin"
              searchPlaceholder="Tür ara…"
              emptyText="Aramaya uyan tür yok"
              onClear={natureRequired ? undefined : () => setNature('')}
              clearLabel="Türü kaldır"
              disabled={disabled}
            />
          </FieldShell>
        ) : null}
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
      </div>

      {/* ETİKETLER — serbest işaret, çoklu, İZAH DEĞİL (13.09 · ikinci karar). Menüden seçilir;
          sözlükte olmayan ad menünün kendisinden oluşturulur (`onCreateTag` verildiyse). */}
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

      {/* Kampanya künyesi YALNIZ `reklam` türlü giderde — analitiğin ROAS köprüsü budur (12.5).
          Zorunlu DEĞİL: kampanyası bilinmeyen bir ajans faturası da girilebilmeli, yoksa operatör
          onu `misc` yazar ve gider reklam toplamından tamamen düşer. */}
      {isAdvertising ? (
        <FormInput
          control={control}
          name="campaign"
          label="Kampanya künyesi"
          labelAside="boş bırakılabilir"
          placeholder="bayram-ig"
          disabled={disabled}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="valueDate"
          render={({ field }) => (
            <DateField
              label="Değer tarihi"
              labelAside="paranın hareket ettiği gün"
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
        <FormInput
          control={control}
          name="description"
          label="Açıklama"
          placeholder="Total Access — akaryakıt"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
