'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toCents } from '@lezzet/helper';
import type { BundleDraftPayload, LocalizedText } from '@lezzet/types';
import { BundleFormBody } from '@/components/operation/form/bundle-form/body';
import { BundleFormSchema, buildBundleDefaults, type BundleFormValues } from '@/components/operation/form/bundle-form/schema';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { searchBundleVariantsAction } from '@/lib/catalog/bundle-actions';
import { suggestTranslationAction, type TranslateField } from '@/lib/ai/translate';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money } from '@/components/operation/ui/format';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * PAKET ÖNERİSİ — kuyruğun içinde, GERÇEK formuyla (22.18).
 *
 * ── NEDEN TİP DEĞİŞTİ ───────────────────────────────────────────────────────
 * `bundle_draft` bir tur `draft_then_edit`ti: pasif bir paket doğuruyor, operatörü Ürünler ekranına
 * yolluyordu. Kullanıcının 10.08'de indirim için söylediği cümle burada da geçerli — *"asistan
 * sayfasından çıkınca konseptten kopuyorum"*. Paket artık kuyrukta kuruluyor ve kaydeden kapı yine
 * paket ekranının kendi eylemi (`createBundleAction` + `withProposal`).
 *
 * ── YENİ FORM YAZILMADI ─────────────────────────────────────────────────────
 * Soldaki gövde `BundleFormBody`: paket diyaloğunun da kullandığı form. Kopyalansaydı bir gün biri
 * "mutabakat" kuralını ya da "eksi yüzde gösterilmez" davranışını yalnız bir yüzeyde düzeltirdi ve
 * aynı paket iki ekranda iki farklı emniyetle kaydedilirdi.
 *
 * ── KALEM HAVUZU SUNUCUDAN GELİR, GÖVDE OKUMA YAPMAZ ────────────────────────
 * Kalem satırı adı, birim fiyatı ve marjı gösteriyor; bunlar dilekçede YOK (dilekçe kimlik taşır,
 * kataloğu değil). Havuz kuyruk sayfasında bir kez okunuyor (`AssistantFormOptions.bundleVariants`)
 * ve buraya olduğu gibi geliyor. Gövde kendi okumasını açsaydı her öneri kartı ayrı bir tur atardı.
 *
 * **Havuz boşsa form yine çizilir** ve bu bilinçli: kalemler adsız görünür ama fiyat, ad ve
 * mutabakat çalışmaya devam eder. Formu hiç açmamak, düzeltilebilir bir eksikliği kapı kapatmakla
 * cezalandırmak olurdu.
 */

/** Asistanın önerdiği paket → formun açılış değerleri. */
export function bundleDraftValuesFrom(payload: BundleDraftPayload): BundleFormValues {
  return {
    // Boş şablondan başlanıyor (yeni paket): asistan paketin TAMAMINI öneriyor, var olan bir kaydın
    // üstüne yazmıyor — ürün taslağının tersi durum ve ayrım künyede yazılı olmalı.
    ...buildBundleDefaults(null),
    name: payload.name,
    description: payload.description ?? null,
    totalPrice: payload.totalPrice,
    serves: payload.serves ?? null,
    items: payload.items.map((i) => ({
      // `id` YOK: kalem henüz doğmadı. Servis yeni satır açacak; var olmayan bir kimlik uydurmak
      // senkronlamayı yanlış yola sokardı.
      variantId: i.variantId,
      qty: i.qty,
      allocatedUnitPrice: i.allocatedUnitPrice,
    })),
  };
}

interface BundleDraftBodyProps {
  payload: BundleDraftPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: BundleFormValues;
  onChange: (next: BundleFormValues) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function BundleDraftBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: BundleDraftBodyProps) {
  /**
   * RHF örneği GÖVDEDE, ama gerçeğin sahibi ÇERÇEVE — ürün gövdesindeki aynı köprü.
   *
   * Çerçeve taslağı (`draft`) tutuyor ve kaydeden kapıya onu veriyor; paket formu ise RHF ister.
   * `values` ile dış durum forma yansıtılıyor, her değişiklik `onChange` ile geri gidiyor. İki
   * yönlü bağ olmasaydı ya alt bardaki düğme bayat değerle koşardı ya form her tazelemede sıfırlanırdı.
   */
  const form = useForm<BundleFormValues>({
    resolver: zodResolver(BundleFormSchema),
    defaultValues: values,
    values,
    mode: 'onChange',
  });
  const live = form.watch();
  useEffect(() => {
    onChange(live);
    // Bağımlılık DEĞERİN KENDİSİ değil serileştirilmiş hâli: RHF her render'da yeni bir nesne
    // döndürüyor ve nesne kimliğine bağlanmak sonsuz döngü demekti (ürün gövdesinde ölçülmüştü).
  }, [JSON.stringify(live)]);

  const [crop, setCrop] = useImageCrop(form);

  // Alan türü geçiliyor: paket ADI kısa bir vitrin metni, açıklaması "hangi durum için uygun" diye
  // okunan bir cümle — ton ve uzunluk buradan çıkıyor (paket diyaloğuyla aynı çağrı).
  const aiTranslate = (field: TranslateField) => (text: LocalizedText) => suggestTranslationAction(text, field);

  /**
   * Kalem ARAMASI kuyrukta da açık: operatör asistanın seçtiği boyu değiştirmek ya da yeni bir kalem
   * eklemek isteyebilir ve arama sunucuda (katalog forma indirilmiyor). Havuz açılışta dilekçenin
   * kalemleriyle geliyor, arama sonuçları üstüne birikiyor — paket diyaloğundaki desenin aynısı.
   */
  const [pool, setPool] = useState(options.bundleVariants);
  const [searching, setSearching] = useState(false);
  const searchVariants = (term: string) => {
    if (!term.trim()) return;
    setSearching(true);
    void searchBundleVariantsAction(term)
      .then(({ data }) =>
        setPool((current) => {
          const byId = new Map(current.map((o) => [o.variantId, o]));
          for (const option of data ?? []) byId.set(option.variantId, option);
          return [...byId.values()];
        }),
      )
      .finally(() => setSearching(false));
  };

  return (
    // İKİ SÜTUN — indirim ve ürün gövdeleriyle aynı düzen. Sarmalayan kart YOK: panellerin kendi
    // kenarlığı var ve dıştaki kart "kart içinde kart" okunuyordu (kullanıcı tespiti 11.08).
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[30rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <BundleFormBody
          control={form.control}
          setValue={form.setValue}
          values={live}
          pool={pool}
          onSearch={searchVariants}
          searching={searching}
          crop={crop}
          onCropChange={setCrop}
          // Yeni pakette görsel YOK ve yükleme de yapılamaz: R2 anahtarı slug'a bağlı, slug kayıtla
          // doğuyor. Blok yine çiziliyor (form birebir aynı olsun) ama kendi doğru hâliyle.
          imageUrl={null}
          onAiTranslate={aiTranslate}
          disabled={disabled || readOnly}
        />
      </div>

      <ProposalAside subject={subject} fallbackTitle="Yeni paket" facts={factsOf(payload, live)} payload={payload} meta={meta} />
    </div>
  );
}

/**
 * Dilekçenin ÖNE ÇIKAN sayıları — `value` asistanın önerisi (değişmez), `now` operatörün şu anki
 * hâli ve YALNIZ farklıysa çizilir. Sapmayı satırın üstünde görmek, formu değiştirdikçe asistanın
 * ne dediğinin kaybolmasını önlüyor (`proposal-aside` künyesi).
 */
function factsOf(payload: BundleDraftPayload, values: BundleFormValues): ProposalFact[] {
  return [
    // **`money()` CENT ister, paket ailesi EURO taşır** (`BundleDraftPayloadSchema` künyesi: "paket
    // ailesi henüz cent'e göçmedi"). Çevrim sınırda: ölçüldü — 12,50 € doğrudan geçilince ekranda
    // "0,13 €" yazıyordu, yani künye değerin yüzde birini gösteriyordu. Aynı tuzak para
    // diyaloglarında da yaşanmıştı (`ManualMovementSchema` künyesi).
    { label: 'Paket fiyatı', value: money(toCents(payload.totalPrice)), now: money(toCents(values.totalPrice)) },
    { label: 'Kalem sayısı', value: String(payload.items.length), now: String(values.items.length) },
  ];
}
