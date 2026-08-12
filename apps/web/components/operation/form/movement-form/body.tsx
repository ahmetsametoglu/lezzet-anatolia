'use client';

import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { ADVERTISING_CATEGORY } from '@lezzet/types';
import { DateField } from '@/components/operation/form/date-field';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import {
  MANUAL_ENTRY_SCOPE,
  MANUAL_TYPES,
  MANUAL_TYPE_VIEW,
  QUICK_CATEGORIES,
  type ManualMovementForm,
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
 */
interface MovementFormBodyProps {
  control: Control<ManualMovementForm>;
  setValue: UseFormSetValue<ManualMovementForm>;
  /** Formun canlı değerleri — koşullu kutular (yön · kategori · kampanya) bunlara bakıyor. */
  values: ManualMovementForm;
  accounts: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

export function MovementFormBody({ control, setValue, values, accounts, disabled = false }: MovementFormBodyProps) {
  const isAdvertising = values.type === 'expense' && values.category === ADVERTISING_CATEGORY;

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
                if (next === 'expense') setValue('direction', 'out');
                if (next === 'capital') setValue('direction', 'in');
              }}
              options={MANUAL_TYPES.map((type) => ({ key: type, label: MANUAL_TYPE_VIEW[type].label }))}
              label="Hareket türü"
            />
            <span className="font-ops-body text-ops-xs text-ops-faint">{MANUAL_TYPE_VIEW[field.value].hint}</span>
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        {/* BEKLEYEN(22.19): `FormSelect` ve `MultiToggle` `disabled` TAŞIMIYOR — karar verilmiş bir
            öneride hesap seçici ve tür anahtarı hâlâ değiştirilebilir GÖRÜNÜR (yazım yine engelli,
            alt bardaki düğme kapalı). Ortak kontrollere `disabled` geçirmek paket ve ürün
            formlarındaki aynı işle birlikte, ayrı bir turda. */}
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
                onChange={field.onChange}
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

      {values.type === 'expense' ? (
        <div className="flex flex-col gap-2">
          <FormInput
            control={control}
            name="category"
            label="Gider kategorisi"
            required
            labelAside="serbest metin"
            placeholder="kira, akaryakıt, maaş…"
            disabled={disabled}
          />
          {/* Hızlı seçim: kategori serbest metindir ama en sık yazılan beşini elle yazdırmak hem
              yavaş hem de yazım farkı üretiyor. Reklam çipi ayrıca ÖNEMLİ: raporun süzdüğü değer
              `advertising` sabitidir ve operatörün onu İngilizce yazması beklenemez. */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CATEGORIES.map((quick) => (
              <button
                key={quick.value}
                type="button"
                disabled={disabled}
                onClick={() => setValue('category', quick.value, { shouldValidate: true })}
                className={`cursor-pointer rounded-ops-chip border px-2.5 py-1 font-ops-body text-ops-xs transition-colors disabled:cursor-not-allowed ${
                  values.category === quick.value
                    ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark'
                    : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
                }`}
              >
                {quick.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Kampanya etiketi YALNIZ reklam giderinde — analitiğin ROAS köprüsü budur (12.5). Zorunlu
          DEĞİL: kampanyası bilinmeyen bir ajans faturası da girilebilmeli, yoksa operatör onu
          `misc` yazar ve gider reklam toplamından tamamen düşer. */}
      {isAdvertising ? (
        <FormInput
          control={control}
          name="campaign"
          label="Kampanya etiketi"
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
