'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { RecipeFormBody } from '@/components/operation/form/recipe-form/body';
import { RecipeFormSchema, recipeBlock, type RecipeFormValues, type RecipeVariantOption } from '@/components/operation/form/recipe-form/schema';
import { saveRecipeAction, searchRecipeVariantsAction } from '@/lib/catalog/recipe-actions';
import { RECIPE_NOTES } from './recipes-labels';
import type { RecipeView } from './recipes-types';

const FORM_ID = 'recipe-form';

/**
 * **Tarif formu** (09.21) — `design/project/Operasyon - Tarifler.dc.html`.
 *
 * ── ADIM VE EV MALZEMESİ: ÇOK SATIRLI METİN ─────────────────────────────────
 * Tasarım bunları sürükle-sıralı SATIR bileşeni çiziyordu; **kullanıcı kararı (07.08) metin oldu**
 * ve gerekçesi `design/KARARLAR.md §3z`'de: diller madde SAYISINDA eşitlenemez (Fransızca iki adımı
 * birleştirmek isteyebilir), veri zaten tek alan, AI çeviri tek alan çeviriyor. Satır = madde;
 * numarayı önizleme veriyor.
 *
 * ── FOTOĞRAF ALANI YOK (bugün) ──────────────────────────────────────────────
 * `r2Keys`'te tarif anahtarı yok (talep açık). Çalışmayan bir yükleme düğmesi çizmektense alanı hiç
 * çizmemek doğru — operatör düğmeye basıp hiçbir şey olmadığını görürdü. BEKLEYEN(09.21)
 *
 * ── YAYIN DÜĞMESİ BURADA DEĞİL ──────────────────────────────────────────────
 * Yayınlamak metin düzeltmekten ayrı bir karar (`setRecipeActiveAction`); forma gömülseydi bir
 * yazım hatasını düzeltmek tarifi istemeden yayından kaldırabilirdi.
 */
interface RecipeDialogProps {
  /** Düzenlenen tarif; `null` ise yeni tarif. */
  recipe: RecipeView | null;
  onClose: () => void;
}

export function RecipeDialog({ recipe, onClose }: RecipeDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<RecipeVariantOption[]>([]);
  const [searching, setSearching] = useState(false);
  // Seçili varyantın etiketi seçenek listesinde OLMAYABİLİR (uzak arama, kapalı hâl): kaydedilmiş
  // kalemlerin adı okumadan geliyor ve burada tutuluyor, yoksa satır kimliğini gösterirdi.
  const [knownLabels, setKnownLabels] = useState<Record<string, string>>(
    Object.fromEntries((recipe?.itemViews ?? []).map((item) => [item.variantId, `${item.productName} · ${item.variantLabel}`])),
  );

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(RecipeFormSchema),
    defaultValues: {
      id: recipe?.id,
      name: recipe?.name ?? {},
      description: recipe?.description ?? {},
      duration: recipe?.duration ?? {},
      serves: recipe?.serves ?? {},
      meal: recipe?.meal ?? {},
      steps: recipe?.steps ?? {},
      pantry: recipe?.pantry ?? {},
      items: (recipe?.items ?? []).map((item) => ({ id: item.id, variantId: item.variantId, qty: item.qty })),
    },
  });

  const items = form.watch('items');

  const onSearch = useCallback((term: string) => {
    if (!term.trim()) {
      setOptions([]);
      return;
    }
    setSearching(true);
    void searchRecipeVariantsAction(term)
      .then(({ data }) => {
        setOptions(data ?? []);
        // Bulunan etiketleri sakla: seçildikten sonra arama kutusu temizlense de satır adını korur.
        if (data) setKnownLabels((current) => ({ ...current, ...Object.fromEntries(data.map((o) => [o.variantId, o.label])) }));
      })
      .finally(() => setSearching(false));
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const result = await saveRecipeAction(values);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  });

  const setItems = (next: RecipeFormValues['items']) => form.setValue('items', next, { shouldDirty: true });

  const footer = (
    <DialogFooter
      formId={FORM_ID}
      onCancel={onClose}
      submitting={form.formState.isSubmitting}
      error={error}
      // Engel FORMUN kendi dosyasından (`recipeBlock`): kuyruk da aynı emniyeti kullanıyor, yoksa
      // tarif bir yüzeyde kaydedilir ötekinde reddedilirdi. Sebep düğmenin yanında yazar — ad
      // boşken submit tarayıcıda sessizce yutuluyordu ve operatör hiçbir şey olmadığını görüyordu.
      blockedReason={recipeBlock(form.watch()) ?? undefined}
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={recipe ? 'Tarifi düzenle' : 'Yeni tarif'}
      subtitle={recipe ? recipe.title : RECIPE_NOTES.newSubtitle}
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Gövde ORTAK (22.18): asistan kuyruğu da aynı formu kendi içinde açıyor. */}
        <RecipeFormBody
          control={form.control}
          items={items}
          onItemsChange={setItems}
          options={options}
          onSearch={onSearch}
          searching={searching}
          knownLabels={knownLabels}
          notes={RECIPE_NOTES}
        />

        {error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
