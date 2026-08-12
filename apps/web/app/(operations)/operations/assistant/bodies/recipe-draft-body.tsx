'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resolveLocalizedText, type RecipeDraftPayload } from '@lezzet/types';
import { RecipeFormBody } from '@/components/operation/form/recipe-form/body';
import {
  RecipeFormSchema,
  buildRecipeDefaults,
  type RecipeFormValues,
  type RecipeVariantOption,
} from '@/components/operation/form/recipe-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { searchRecipeVariantsAction } from '@/lib/catalog/recipe-actions';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * TARİF ÖNERİSİ — kuyruğun içinde, GERÇEK formuyla (22.18).
 *
 * ── NEDEN TİP DEĞİŞTİ ───────────────────────────────────────────────────────
 * `recipe_draft` bir tur `draft_then_edit`ti: pasif bir tarif doğurup operatörü Tarifler ekranına
 * yolluyordu. Kullanıcının 10.08'de indirim için söylediği cümle burada da geçerli — *"asistan
 * sayfasından çıkınca konseptten kopuyorum"*. Tarif artık kuyrukta kuruluyor; kaydeden kapı yine
 * tarif ekranının kendi eylemi (`saveRecipeAction` + `withProposal`).
 *
 * ── MALZEME ADLARI DİLEKÇEDEN GELİR, SUNUCU OKUMASI GEREKMEZ ────────────────
 * Tarif dilekçesi kalemleri `variantId` YANINDA `productName` de taşıyor (şemanın kendi kararı).
 * Paket önerisinde havuzu ayrıca okumak zorundaydık çünkü orada satır fiyat, maliyet ve marj da
 * gösteriyor; burada satır bir seçici + adetten ibaret, yani adın kendisi yetiyor.
 *
 * Adlar açılışta `knownLabels`a tohumlanıyor; operatör malzeme değiştirmek isterse arama sunucudan
 * geliyor ve sözlüğe ekleniyor (tarif ekranındaki desenin aynısı).
 */

/** Asistanın önerdiği tarif → formun açılış değerleri. */
export function recipeDraftValuesFrom(payload: RecipeDraftPayload): RecipeFormValues {
  return {
    // Boş şablondan başlanıyor: tarif taslağı var olan bir kaydın üstüne yazmıyor, yeni tarif kuruyor.
    ...buildRecipeDefaults(),
    name: payload.name,
    description: payload.description ?? {},
    steps: payload.steps,
    serves: payload.serves ?? {},
    duration: payload.duration ?? {},
    meal: payload.meal ?? {},
    pantry: payload.pantry ?? {},
    items: payload.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
  };
}

interface RecipeDraftBodyProps {
  payload: RecipeDraftPayload;
  subject: ProposalSubject | null;
  meta: ProposalMeta;
  values: RecipeFormValues;
  onChange: (next: RecipeFormValues) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function RecipeDraftBody({ payload, subject, meta, values, onChange, disabled, readOnly }: RecipeDraftBodyProps) {
  // RHF örneği GÖVDEDE, gerçeğin sahibi ÇERÇEVE — ürün ve paket gövdelerindeki aynı köprü.
  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(RecipeFormSchema),
    defaultValues: values,
    values,
    mode: 'onChange',
  });
  const live = form.watch();
  useEffect(() => {
    onChange(live);
    // Bağımlılık serileştirilmiş hâl: RHF her render'da yeni nesne döndürüyor ve nesne kimliğine
    // bağlanmak sonsuz döngü demekti.
  }, [JSON.stringify(live)]);

  const [options, setOptions] = useState<RecipeVariantOption[]>([]);
  const [searching, setSearching] = useState(false);
  // Adlar DİLEKÇEDEN tohumlanır: satır ilk açılışta da adıyla görünür, kimlikle değil.
  const [knownLabels, setKnownLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(payload.items.map((i) => [i.variantId, i.productName])),
  );

  const onSearch = (term: string) => {
    if (!term.trim()) {
      setOptions([]);
      return;
    }
    setSearching(true);
    void searchRecipeVariantsAction(term)
      .then(({ data }) => {
        setOptions(data ?? []);
        // Bulunan etiketler saklanıyor: seçildikten sonra arama kutusu temizlense de satır adını korur.
        if (data) setKnownLabels((current) => ({ ...current, ...Object.fromEntries(data.map((o) => [o.variantId, o.label])) }));
      })
      .finally(() => setSearching(false));
  };

  const setItems = (next: RecipeFormValues['items']) => form.setValue('items', next, { shouldDirty: true });

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[26rem] flex-[2] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <RecipeFormBody
          control={form.control}
          items={live.items}
          onItemsChange={setItems}
          options={options}
          onSearch={onSearch}
          searching={searching}
          knownLabels={knownLabels}
          notes={NOTES}
          disabled={disabled || readOnly}
        />
      </div>

      <ProposalAside subject={subject} fallbackTitle="Yeni tarif" facts={factsOf(payload, live)} payload={payload} meta={meta} />
    </div>
  );
}

/**
 * Not metinleri — tarif ekranının sözlüğü (`RECIPE_NOTES`) SAYFA klasöründe ve kuyruk oradan
 * okuyamaz (`docs:check §3e`). Cümleler burada tekrar edilmiyor, gövdeye PARAMETRE olarak geçiyor;
 * iki yüzeyin aynı cümleyi kullanması için sözlüğün ortak alana taşınması ayrı bir tur.
 * BEKLEYEN(22.18)
 */
const NOTES = {
  itemsAside: 'ürün kaydından seçilir',
  lineIsItem: 'her satır bir madde',
  pantryAside: 'bizden alınmayanlar (tuz, su, zeytinyağı)',
};

/** Dilekçenin öne çıkan sayıları — `value` asistanın önerisi, `now` yalnız farklıysa çizilir. */
function factsOf(payload: RecipeDraftPayload, values: RecipeFormValues): ProposalFact[] {
  return [
    { label: 'Tarif adı', value: resolveLocalizedText(payload.name), now: resolveLocalizedText(values.name) },
    { label: 'Malzeme sayısı', value: String(payload.items.length), now: String(values.items.length) },
  ];
}
