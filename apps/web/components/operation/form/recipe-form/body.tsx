'use client';

import { useWatch, type Control } from 'react-hook-form';
import { Button } from '@/components/operation/ui/button';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { Combobox } from '@/components/operation/form/combobox';
import { Input } from '@/components/operation/form/input';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
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
 *
 * ── DİL TEK YERDEN SEÇİLİR (kullanıcı kararı 12.08) ─────────────────────────
 * Her alan kendi dil sekmesini çiziyordu; üçlü künye ise üç dili birden alt alta yığıyordu. Tarifin
 * yedi metin alanı var — operatör Fransızcayı tamamlamak için yedi ayrı sekmeye tek tek basıyordu ve
 * hangi alanı hangi dilde bıraktığı ekranda görünmüyordu. Alanlar artık TEK dil kartında: sekme
 * kartın başlığında, içerideki her kutu o dilin kutusu. Kart deseni ürün/kategori formuyla ORTAK
 * (`locale-card` künyesi) — burada yeniden yazılmadı.
 *
 * **Malzemeler kartın DIŞINDA ve bu ayrımın kendisi bir cümle:** kart "dile bağlı olan" demektir.
 * Malzeme satırı ürün kaydını gösterir; ürünün adı da boyu da kendi kaydında üç dilli durur ve
 * müşteriye onun dilinde çözülür (`storefront/recipe.ts`). Dil kartının içine alınsaydı, dil
 * seçilince değişiyormuş gibi okunurdu.
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
  /** Satır görselleri — etiketle aynı kural: okumadan tohumlanır, aramayla birikir. Yoksa yer tutucu. */
  knownImages?: Record<string, string | null>;
  /**
   * `2` = İÇERİK SOL, MALZEME SAĞ (16.08, kullanıcı kararı): diyalog geniş açılır ve iki iş yan
   * yana durur — dile bağlı metinler bir gözde, ürün kayıtları öbüründe. Varsayılan tek kolon:
   * asistan kuyruğunun gövdesi kendi genişliğini bilemez (yanında dilekçe künyesi var).
   */
  columns?: 1 | 2;
  disabled?: boolean;
}

/**
 * Alan altı açıklamaları — **gövdenin kendi cümleleri, dışarıdan geçmez** (12.08).
 *
 * `notes` bir PARAMETREYDİ ve iki çağıran iki ayrı metin veriyordu: tarif ekranı "her satır bir
 * adım", kuyruk "her satır bir madde"; malzeme başlığı birinde fiyatın nereden okunduğunu
 * söylüyordu, ötekinde söylemiyordu. Aynı kutunun kuralı yüzeye göre değişemez — alanın nasıl
 * doldurulacağı alanın kendi bilgisidir, ekranın değil.
 */
const NOTES = {
  /** Fiyat burada girilmez (tasarımın kuralı) — form fiyatın sahibi değil, okuyucusu. */
  items: 'ürün kaydından seçilir · fiyat oradan okunur · boş satırdan yeni malzeme',
  /**
   * Satır = madde; kullanıcı kararı 07.08 (`KARARLAR §3z`). Numarayı ÖNİZLEME veriyor.
   *
   * "Numara yazmayın" 12.08'de eklendi: asistan adımları "1. …" diye numaralı öneriyordu ve ekran
   * kendi numarasını basınca müşteri sayfasında "1. 1. Baklavayı ısıtın" çıkıyordu. Kaynağı
   * düzeltildi (`propose_recipe_draft` numaralı satır İSTİYORDU) ama elle yapıştıran operatör de
   * aynı hatayı yapabilir — ipucu bu yüzden alanın altında duruyor.
   */
  steps: 'her satır bir adım · numara yazmayın, sırayı ekran veriyor',
  pantry: 'her satır bir madde · bizden alınmayanlar (tuz, su, zeytinyağı), satışa bağlanmaz',
};

export function RecipeFormBody({
  control,
  items,
  onItemsChange,
  options,
  onSearch,
  searching,
  knownLabels,
  knownImages = {},
  columns = 1,
  disabled = false,
}: RecipeFormBodyProps) {
  // Doluluk ipucunun dayanağı AD: yayın kapısının ölçütü o alan (`is_active` kısıtı üç dilde ad
  // ister). Sekmedeki amber nokta böylece "bu dilde tarif yayınlanamaz" demiş oluyor.
  const nameValue = useWatch({ control, name: 'name' });

  // Seçici seçenekleri GÖRSELLİ (16.08): ürün fotoğrafı ada eşlik eder, listede de satırda da.
  const comboOptions = options.map((option) => ({
    value: option.variantId,
    label: option.label,
    thumb: <Thumbnail src={option.imageUrl} alt="" size={22} iconSize={10} className="!rounded-[5px]" />,
  }));
  const imageOf = (variantId: string) =>
    knownImages[variantId] ?? options.find((o) => o.variantId === variantId)?.imageUrl ?? null;

  return (
    <div className={columns === 2 ? 'grid grid-cols-[1.15fr_1fr] items-start gap-5' : 'flex flex-col gap-5'}>
      <LocaleCard title="İçerik" completenessOf={nameValue ?? {}}>
        {(lang) => (
          <>
            {/* Ad ZORUNLU ve üç dilli; yayın kapısının ölçütü bu alan. AI önerisi TR'den ötekilere. */}
            <FormLocalizedText
              control={control}
              name="name"
              label="Tarif adı"
              required
              placeholder="Bulgur pilavı"
              lang={lang}
              field="ad"
              disabled={disabled}
            />

            <div className="grid grid-cols-3 gap-2.5">
              {/* Üçü de SERBEST METİN, sayı değil (05.16): "3–4 kişilik" bir aralıktır, "35 dk" bir
                  hesap değil. Sayıya indirmek, yazılamayan bir gerçeği zorlamak olurdu.
                  Alan türü `ad`: üçü de kısa etiket, cümle değil — "Akşam yemeği" → "Dîner". */}
              <FormLocalizedText control={control} name="duration" label="Süre" placeholder="35 dk" lang={lang} field="ad" disabled={disabled} />
              <FormLocalizedText control={control} name="serves" label="Porsiyon" placeholder="3–4 kişilik" lang={lang} field="ad" disabled={disabled} />
              <FormLocalizedText control={control} name="meal" label="Öğün" placeholder="Akşam yemeği" lang={lang} field="ad" disabled={disabled} />
            </div>

            <FormLocalizedText
              control={control}
              name="description"
              label="Kısa açıklama"
              hint="müşteri kartında ve detay başında görünür"
              multiline
              lang={lang}
              disabled={disabled}
            />

            {/* Satır = madde (KARARLAR §3z). Alan türü varsayılan (`aciklama`) — tarif ADIMI ile
                tarif ADI aynı ölçüde çevrilmez. */}
            <FormLocalizedText
              control={control}
              name="steps"
              label="Hazırlanışı"
              hint={NOTES.steps}
              multiline
              lang={lang}
              disabled={disabled}
            />

            <FormLocalizedText
              control={control}
              name="pantry"
              label="Evinizden"
              hint={NOTES.pantry}
              multiline
              lang={lang}
              disabled={disabled}
            />
          </>
        )}
      </LocaleCard>

      <FieldShell label="Malzemeler — bizden" labelAside={NOTES.items}>
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <div key={`${item.variantId}-${index}`} className="flex items-center gap-2">
              {/* Görsel SATIRDA (16.08, kullanıcı kararı): operatör malzemeyi fotoğrafından tanır;
                  görselsiz üründe yer tutucu — kayan bir kolon hizayı bozardı. */}
              <Thumbnail src={imageOf(item.variantId)} alt="" size={30} iconSize={12} className="!rounded-[6px]" />
              <Combobox
                value={item.variantId}
                onChange={(variantId) => onItemsChange(items.map((row, i) => (i === index ? { ...row, variantId } : row)))}
                options={comboOptions}
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

          {/* "+ malzeme" DÜĞMESİ YOK — SON SATIR HEP BOŞ DURUR (16.08, kullanıcı kararı: projedeki
              hazır-satır deseni burada da geçerli). Boş satırdan ürün seçilince kalem listeye girer
              ve yeni bir boş satır kendiliğinden belirir; adet kutusu varsayılanını (1) baştan
              gösterir. `key` items uzunluğuna bağlı: seçim sonrası seçici boş hâline döner. */}
          <div className="flex items-center gap-2">
            <Thumbnail src={null} alt="" size={30} iconSize={12} className="!rounded-[6px] opacity-60" />
            <Combobox
              key={`empty-${items.length}`}
              value=""
              onChange={(variantId) => {
                if (variantId) onItemsChange([...items, { variantId, qty: 1 }]);
              }}
              options={comboOptions}
              onSearch={onSearch}
              loading={searching}
              placeholder="Ürün ara — malzeme ekle…"
              searchPlaceholder="Ürün adının bir parçasını yazın"
              emptyText="Eşleşen ürün yok — malzeme ürün kaydından seçilir, serbest metin girilmez."
              className="min-w-0 flex-1"
              disabled={disabled}
            />
            {/* Varsayılan adet GÖRÜNÜR ama kilitli: değer ürün seçilince satıra taşınır. */}
            <Input type="number" fullWidth={false} value="1" disabled readOnly className="w-16 text-center opacity-60" />
            {/* Sil düğmesinin YERİ ayrılır, kendisi çizilmez: üstteki satırlarla hiza bozulmasın. */}
            <span className="w-[38px]" aria-hidden />
          </div>
        </div>
      </FieldShell>
    </div>
  );
}
