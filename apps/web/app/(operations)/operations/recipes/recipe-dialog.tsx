'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { Button } from '@/components/operation/ui/button';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { Combobox } from '@/components/operation/form/combobox';
import { Input } from '@/components/operation/form/input';
import { suggestTranslationAction } from '@/lib/ai/translate';
import { saveRecipeAction, searchRecipeVariantsAction } from './recipes-actions';
import { RECIPE_NOTES } from './recipes-labels';
import { RecipeFormSchema, type RecipeFormValues, type RecipeVariantOption, type RecipeView } from './recipes-types';

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
      // Engelin SEBEBİ düğmenin yanında yazar: ad boşken submit tarayıcıda sessizce yutulurdu ve
      // operatör düğmeye basıp hiçbir şey olmadığını görürdü.
      blockedReason={form.watch('name') && Object.values(form.watch('name')).some((v) => v?.trim()) ? undefined : 'Tarif adı gerekli'}
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
        {/* Ad ZORUNLU ve üç dilli; yayın kapısının ölçütü bu alan. AI önerisi TR'den ötekilere. */}
        <FormLocalizedText
          control={form.control}
          name="name"
          label="Tarif adı"
          required
          placeholder="Bulgur pilavı"
          onAiTranslate={(text) => suggestTranslationAction(text, 'ad')}
        />

        <div className="grid grid-cols-3 gap-2.5">
          {/* Üçü de SERBEST METİN, sayı değil (05.16): "3–4 kişilik" bir aralıktır, "35 dk" bir
              hesap değil. Sayıya indirmek, yazılamayan bir gerçeği zorlamak olurdu. */}
          <FormLocalizedText control={form.control} name="duration" label="Süre" placeholder="35 dk" layout="stacked" />
          <FormLocalizedText control={form.control} name="serves" label="Porsiyon" placeholder="3–4 kişilik" layout="stacked" />
          <FormLocalizedText control={form.control} name="meal" label="Öğün" placeholder="Akşam yemeği" layout="stacked" />
        </div>

        <FormLocalizedText
          control={form.control}
          name="description"
          label="Kısa açıklama"
          hint="müşteri kartında ve detay başında görünür"
          multiline
          onAiTranslate={(text) => suggestTranslationAction(text, 'aciklama')}
        />

        <FieldShell label="Malzemeler — bizden" labelAside={RECIPE_NOTES.itemsAside}>
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div key={`${item.variantId}-${index}`} className="flex items-center gap-2">
                <Combobox
                  value={item.variantId}
                  onChange={(variantId) => setItems(items.map((row, i) => (i === index ? { ...row, variantId } : row)))}
                  options={options.map((option) => ({ value: option.variantId, label: option.label }))}
                  selectedLabel={knownLabels[item.variantId]}
                  onSearch={onSearch}
                  loading={searching}
                  placeholder="Ürün ara…"
                  searchPlaceholder="Ürün adının bir parçasını yazın"
                  emptyText="Eşleşen ürün yok — malzeme ürün kaydından seçilir, serbest metin girilmez."
                  className="min-w-0 flex-1"
                />
                {/* `fullWidth={false}` ŞART: kabuğun `w-full`'ü açık kalırsa adet kutusu satırı
                    kaplar ve yanındaki ürün seçicisi 28 piksele düşer (ölçüldü 08.08 — tam olarak
                    `Input` künyesinin uyardığı hâl). Satır içine giren her kutu bunu verir. */}
                <Input
                  type="number"
                  min={1}
                  fullWidth={false}
                  value={String(item.qty)}
                  onChange={(e) =>
                    setItems(items.map((row, i) => (i === index ? { ...row, qty: Math.max(1, Number(e.target.value) || 1) } : row)))
                  }
                  className="w-16 text-center"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setItems(items.filter((_row, i) => i !== index))}
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
              onClick={() => setItems([...items, { variantId: '', qty: 1 }])}
            >
              + malzeme
            </Button>
          </div>
        </FieldShell>

        {/* Satır = madde (KARARLAR §3z). `multiline` alanlar dil dil ayrı yazılır; AI önerisi
            adımlarda "aciklama" alanıyla çalışır — tarif ADIMI ile tarif ADI aynı ölçüde çevrilmez. */}
        <FormLocalizedText
          control={form.control}
          name="steps"
          label="Hazırlanışı"
          hint={RECIPE_NOTES.lineIsItem}
          multiline
          onAiTranslate={(text) => suggestTranslationAction(text, 'aciklama')}
        />

        <FormLocalizedText
          control={form.control}
          name="pantry"
          label="Evinizden"
          hint={RECIPE_NOTES.pantryAside}
          multiline
          onAiTranslate={(text) => suggestTranslationAction(text, 'aciklama')}
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
