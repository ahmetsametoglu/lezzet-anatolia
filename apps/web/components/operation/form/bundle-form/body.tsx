'use client';

import type { ComponentProps } from 'react';
import type { Control, UseFormSetValue } from 'react-hook-form';
import { fromCents } from '@lezzet/helper';
import { priceFromDiscountPercent } from '@lezzet/domain-core';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormMoney, PercentField } from '@/components/operation/form/money-input';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { FormSection } from './section';
import { BundleItemsEditor } from './items-editor';
import { bundlePricing } from './pricing';
import type { BundleFormValues } from './schema';
import type { VariantOption } from './types';

/**
 * **PAKET FORMUNUN GÖVDESİ** — iki yüzeyin paylaştığı tek uygulama (22.18).
 *
 * ── NEDEN DİYALOGDAN AYRILDI ────────────────────────────────────────────────
 * Form 304 satırlık `bundle-form-dialog`ın içindeydi: RHF kurulumu, sunucu okuması, arama havuzu,
 * `Dialog` kabuğu ve JSX iç içeydi. Asistan kuyruğu aynı formu kendi içinde açacağı için
 * (`bundle_draft` artık `inline`) tek çare ya kopyalamaktı ya ayırmak. Kopya, indirim ve ürün
 * formlarında dört kez bedelini ödediğimiz sınıf: bir gün biri "pay dağıtımı"nı ya da "eksi yüzde
 * gösterilmez" kuralını yalnız bir yüzeyde düzeltir ve iki ekran aynı paketi farklı kaydeder.
 *
 * ── GÖVDE NE BİLMEZ ─────────────────────────────────────────────────────────
 * `Dialog`, `DialogFooter`, `router.refresh()`, kapanış ve KAYDETME kapısı burada YOK. Gövde yalnız
 * çizer; formun sahibi (RHF örneği) ve kaydeden eylem çağıranındır. Ürün formundaki (`product-form`)
 * aynı sözleşme: kural şemada, çizim gövdede, yazım çağıranda.
 *
 * ── VERİ HAZIR DEĞİLKEN ÇİZİLMEZ ────────────────────────────────────────────
 * `pool === null` hâlini çağıran yönetir ve bu ayrım kritiktir: kalem editörü boş satırlarla mount
 * olursa, veri sonradan düştüğünde otomatik pay dağıtımı KAYITLI payların üzerine yazar. Formu
 * açmak veriyi değiştirmemeli — dosyanın taşındığı yerde de bu tuzak aynen duruyor.
 */
interface BundleFormBodyProps {
  control: Control<BundleFormValues>;
  setValue: UseFormSetValue<BundleFormValues>;
  /** Formun o anki değerleri — fiyat türetmesi ve kalem payları bundan besleniyor. */
  values: BundleFormValues;
  /** Varyant havuzu; `null` değil (yükleniyor hâlini çağıran çizer). */
  pool: VariantOption[];
  onSearch: (term: string) => void;
  searching: boolean;
  /**
   * Görsel kırpma değeri — `useImageCrop(form)` çağıranda kurulur. Tipler `ImageCropField`ten
   * TÜRETİLİR, elle yazılmaz: alan bir gün değişirse burada da derleme durur (CLAUDE §1).
   */
  crop: ComponentProps<typeof ImageCropField>['crop'];
  onCropChange: ComponentProps<typeof ImageCropField>['onCropChange'];
  imageUrl: string | null;
  /**
   * Görsel yükleme kapısı. **Yeni pakette YOK ve bu bir eksiklik değil:** R2 anahtarı slug'a bağlı,
   * slug da kayıtla doğuyor — kaydedilmemiş pakete görsel yüklenemez.
   */
  upload?: ComponentProps<typeof ImageCropField>['upload'];
  // `onAiTranslate` prop'u KALKTI (12.08): çeviri düğmesi çok dilli alanın kendi yeteneği, çağıranın
  // taşıdığı bir kapı değil (`localized-text-field` künyesi). Zincir buradan iki alana dağılıyordu.
  /** Karar verilmiş öneri ya da gönderim sürerken: form okunur ama düzenlenemez. */
  disabled?: boolean;
}

export function BundleFormBody({
  control,
  setValue,
  values,
  pool,
  onSearch,
  searching,
  crop,
  onCropChange,
  imageUrl,
  upload,
  disabled = false,
}: BundleFormBodyProps) {
  const poolById = new Map(pool.map((p) => [p.variantId, p]));
  const pricing = bundlePricing(
    (values.items ?? []).map((i) => ({ variantId: i.variantId, qty: i.qty, allocatedUnitPrice: i.allocatedUnitPrice })),
    poolById,
    values.totalPrice ?? 0,
  );

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <FormSection title="İçerik">
          <LocaleCard title="Ad ve açıklama" completenessOf={values.name}>
            {(lang) => (
              <>
                <FormLocalizedText
                  control={control}
                  name="name"
                  label="Paket adı"
                  required
                  placeholder="ör. Bayram Sofrası"
                  lang={lang}
                  field="ad"
                  disabled={disabled}
                />
                <FormLocalizedText
                  control={control}
                  name="description"
                  label="Kısa açıklama"
                  multiline
                  rows={3}
                  placeholder="Hangi durum için uygun"
                  lang={lang}
                  disabled={disabled}
                />
              </>
            )}
          </LocaleCard>
        </FormSection>

        <FormSection title="Görsel">
          <ImageCropField
            role="package"
            src={imageUrl}
            crop={crop}
            onCropChange={onCropChange}
            upload={upload}
            uploadDisabledHint="Görsel için paketi önce kaydedin (adres adından türüyor)."
          />
        </FormSection>

        {/* ── VİTRİNDE (05.18) — SOL sütun, görselin altı (kullanıcı kararı 08.08) ──────
            Altlıkta değil: orada "Durum" var ve iki etiketli kontrol yan yana taşıyor
            (kategori diyaloğunda ölçüldü — ikincisi "Kaydet"in altına giriyor ve tıklanamıyordu).
            Sağ sütunda da değil: orası fiyat/sunum ve kalemler, yani paketin TİCARİ tarafı; vitrin
            işareti bir yayın/seçki kararı ve görselle aynı sütunda durması onu "bu paket dışarıda
            nasıl görünüyor" grubuna sokuyor. */}
        <FormSection title="Vitrin">
          {/* Kilit KAPANDI (22.19 · 26.08): `FormSwitch` prop olarak `disabled` TAŞIMIYOR ama artık
              gerekmiyor — kural `globals.css`te `fieldset:disabled` üzerinden, yani bayrak taşımayan
              kontroller de kapsanıyor. Karar verilmiş öneride anahtar soluk çiziliyor. */}
          <FormSwitch control={control} name="isFeatured" label="Vitrinde göster (ana sayfa)" />
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
            Satışta olmaktan ayrıdır: satıştaki her paket paketler sayfasında görünür, ana sayfada yalnız burada
            işaretlenenler. Satışta olmayan paket işaretli olsa da vitrine çıkmaz.
          </span>
        </FormSection>
      </div>

      <div className="flex flex-col gap-4">
        <FormSection title="Fiyat ve sunum">
          <div className="grid grid-cols-3 gap-3">
            <FormMoney control={control} name="totalPrice" label="Paket fiyatı (€)" required placeholder="ör. 49,90" disabled={disabled} />
            {/* İndirim yüzdesi AYNI kararın ikinci yazımı — saklanan bir alan değil, fiyattan türer
                ve yazılınca fiyatı doldurur. Operatör kimi zaman "34,90 olsun", kimi zaman "%10
                vereyim" diye düşünür; ikisini de yazabilmeli ve ikisi asla çelişmemeli. */}
            <PercentField
              label="İndirim (%)"
              labelAside="fiyatla bağlı"
              // EKSİ yüzde gösterilmez: paket ayrı ayrı almaktan pahalıysa ortada indirim YOKTUR,
              // "-66,3" ise geçerli bir değermiş gibi durur (üstelik kutuya eksi yazılamıyor da).
              // O hâli şerit anlatıyor: "19,90 € pahalı".
              value={pricing.discountPercent != null && pricing.discountPercent >= 0 ? pricing.discountPercent : null}
              disabled={disabled || pricing.listTotalCents == null}
              placeholder={pricing.listTotalCents == null ? '—' : 'ör. 10'}
              onChange={(percent) => {
                if (percent == null) return;
                // Hesap MOTORDAN (`priceFromDiscountPercent`): aynı "%10", teklif ve özel fiyat
                // ekranlarıyla aynı kuruşu vermeli.
                const next = priceFromDiscountPercent(pricing.listTotalCents, percent);
                if (next === null) return;
                setValue('totalPrice', fromCents(next), { shouldValidate: true, shouldDirty: true });
              }}
            />
            <FormNumber control={control} name="serves" label="Kaç kişilik" integer placeholder="ör. 6" labelAside="isteğe bağlı" disabled={disabled} />
          </div>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
            Müşteri yalnız paket fiyatını görür (KDV dahil) ve o fiyat sabittir — kupon ve genel indirim pakete
            uygulanmaz. İndirim yüzdesi kalemlerin tek fiyatları toplamına göre hesaplanır; birini yazarsan öbürü
            dolar. “Kaç kişilik” boş bırakılırsa müşteri tarafında o künye satırı hiç çizilmez.
          </span>
        </FormSection>

        {/* Paylar burada TÜRETİLİR: editör yalnız alan yazar (`setValue`), formun sahibi çağıran.
            Kilit KAPANDI (22.19 · 26.08): editör hâlâ `disabled` prop'u taşımıyor ama kalem
            satırları karar verilmiş bir öneride artık soluk çiziliyor — kural `globals.css`te
            `fieldset:disabled` üzerinden işliyor. "Dört düğme ve iki alanın hepsine tek tek geçmek"
            diye ertelenen iş, tek kuralla gereksizleşti. */}
        <BundleItemsEditor control={control} pool={pool} setValue={setValue} onSearch={onSearch} searching={searching} />
      </div>
    </div>
  );
}
