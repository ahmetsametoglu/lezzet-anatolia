'use client';

import type { Control } from 'react-hook-form';
import { Button } from '@/components/operation/ui/button';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { Combobox } from '@/components/operation/form/combobox';
import { Input } from '@/components/operation/form/input';
import { suggestTranslationAction } from '@/lib/ai/translate';
import type { RecipeFormValues, RecipeVariantOption } from './schema';

/**
 * **TARİF FORMUNUN GÖVDESİ** — iki yüzeyin paylaştığı tek uygulama (22.18).
 *
 * `recipe-dialog`ın içindeydi; asistan kuyruğu aynı formu kendi içinde açacağı için ayrıldı
 * (`recipe_draft` artık `inline`). Kopyalansaydı bir gün biri "satır = madde" kuralını ya da AI
 * çeviri alan türlerini yalnız bir yüzeyde düzeltirdi.
 *
 * ── GÖVDE NE BİLMEZ ─────────────────────────────────────────────────────────
 * `Dialog`, altlık, kaydeden eylem ve kapanış burada YOK. Gövde yalnız çizer; formun sahibi (RHF
 * örneği) ve yazan kapı çağıranındır.
 *
 * ── KORUNAN İKİ KARAR ───────────────────────────────────────────────────────
 * **Adım ve ev malzemesi ÇOK SATIRLI METİN** (kullanıcı kararı 07.08 · `KARARLAR §3z`): diller madde
 * SAYISINDA eşitlenemez, veri zaten tek alan, AI çeviri tek alan çeviriyor. Satır = madde.
 * **Üçlü künye (süre · porsiyon · öğün) SERBEST METİN**, sayı değil: "3–4 kişilik" bir aralıktır.
 */
interface RecipeFormBodyProps {
  control: Control<RecipeFormValues>;
  /** Kalem satırları — `items` alanının canlı hâli (çağıran `watch` ile verir). */
  items: RecipeFormValues['items'];
  onItemsChange: (next: RecipeFormValues['items']) => void;
  /** Malzeme aramasının sonucu — arama SUNUCUDA, katalog forma indirilmez. */
  options: RecipeVariantOption[];
  onSearch: (term: string) => void;
  searching: boolean;
  /**
   * Seçili varyantın etiketi seçenek listesinde OLMAYABİLİR (uzak arama, kapalı hâl): kaydedilmiş
   * kalemlerin adı okumadan geliyor ve çağıranda tutuluyor — yoksa satır kimliğini gösterirdi.
   */
  knownLabels: Record<string, string>;
  /** Not metinleri ekranın sözlüğünden geçer — gövde kendi cümlesini uydurmaz. */
  notes: { itemsAside: string; lineIsItem: string; pantryAside: string };
  disabled?: boolean;
}

export function RecipeFormBody({
  control,
  items,
  onItemsChange,
  options,
  onSearch,
  searching,
  knownLabels,
  notes,
  disabled = false,
}: RecipeFormBodyProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Ad ZORUNLU ve üç dilli; yayın kapısının ölçütü bu alan. AI önerisi TR'den ötekilere. */}
      <FormLocalizedText
        control={control}
        name="name"
        label="Tarif adı"
        required
        placeholder="Bulgur pilavı"
        onAiTranslate={(text) => suggestTranslationAction(text, 'ad')}
        disabled={disabled}
      />

      <div className="grid grid-cols-3 gap-2.5">
        {/* Üçü de SERBEST METİN, sayı değil (05.16): "3–4 kişilik" bir aralıktır, "35 dk" bir
            hesap değil. Sayıya indirmek, yazılamayan bir gerçeği zorlamak olurdu. */}
        <FormLocalizedText control={control} name="duration" label="Süre" placeholder="35 dk" layout="stacked" disabled={disabled} />
        <FormLocalizedText control={control} name="serves" label="Porsiyon" placeholder="3–4 kişilik" layout="stacked" disabled={disabled} />
        <FormLocalizedText control={control} name="meal" label="Öğün" placeholder="Akşam yemeği" layout="stacked" disabled={disabled} />
      </div>

      <FormLocalizedText
        control={control}
        name="description"
        label="Kısa açıklama"
        hint="müşteri kartında ve detay başında görünür"
        multiline
        onAiTranslate={(text) => suggestTranslationAction(text, 'aciklama')}
        disabled={disabled}
      />

      <FieldShell label="Malzemeler — bizden" labelAside={notes.itemsAside}>
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <div key={`${item.variantId}-${index}`} className="flex items-center gap-2">
              <Combobox
                value={item.variantId}
                onChange={(variantId) => onItemsChange(items.map((row, i) => (i === index ? { ...row, variantId } : row)))}
                options={options.map((option) => ({ value: option.variantId, label: option.label }))}
                selectedLabel={knownLabels[item.variantId]}
                onSearch={onSearch}
                loading={searching}
                placeholder="Ürün ara…"
                searchPlaceholder="Ürün adının bir parçasını yazın"
                emptyText="Eşleşen ürün yok — malzeme ürün kaydından seçilir, serbest metin girilmez."
                className="min-w-0 flex-1"
                disabled={disabled}
              />
              {/* `fullWidth={false}` ŞART: kabuğun `w-full`'ü açık kalırsa adet kutusu satırı kaplar
                  ve yanındaki ürün seçicisi 28 piksele düşer (ölçüldü 08.08). */}
              <Input
                type="number"
                min={1}
                fullWidth={false}
                value={String(item.qty)}
                disabled={disabled}
                onChange={(e) =>
                  onItemsChange(items.map((row, i) => (i === index ? { ...row, qty: Math.max(1, Number(e.target.value) || 1) } : row)))
                }
                className="w-16 text-center"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => onItemsChange(items.filter((_row, i) => i !== index))}
                aria-label="Malzemeyi çıkar"
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => onItemsChange([...items, { variantId: '', qty: 1 }])}
          >
            + malzeme
          </Button>
        </div>
      </FieldShell>

      {/* Satır = madde (KARARLAR §3z). AI önerisi adımlarda "aciklama" alanıyla çalışır — tarif
          ADIMI ile tarif ADI aynı ölçüde çevrilmez. */}
      <FormLocalizedText
        control={control}
        name="steps"
        label="Hazırlanışı"
        hint={notes.lineIsItem}
        multiline
        onAiTranslate={(text) => suggestTranslationAction(text, 'aciklama')}
        disabled={disabled}
      />

      <FormLocalizedText
        control={control}
        name="pantry"
        label="Evinizden"
        hint={notes.pantryAside}
        multiline
        onAiTranslate={(text) => suggestTranslationAction(text, 'aciklama')}
        disabled={disabled}
      />
    </div>
  );
}
