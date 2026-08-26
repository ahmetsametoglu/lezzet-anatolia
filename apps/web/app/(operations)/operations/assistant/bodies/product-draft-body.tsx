'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resolveLocalizedText, type ProductCreatePayload, type ProductDraftPayload } from '@lezzet/types';
import { ProductFormPanels, ProductFormTabs, useProductFormFields } from '@/components/operation/form/product-form';
import {
  ProductFormSchema,
  buildDefaults,
  type ProductFormSource,
  type ProductFormValues,
} from '@/components/operation/form/product-form/schema';
import { ProductPhotos } from '@/components/operation/form/product-form/photos';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { uploadProductImageAction } from '@/lib/catalog/product-photo-actions';
import type { ProductFormTab } from '@/components/operation/form/product-form/types';
import { ProposalAside, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { DECLARATION_FIELD_LABEL } from '../assistant-labels';

/**
 * ÜRÜN — kuyruğun içinde, ÜRÜN EKRANININ KENDİ FORMUYLA (22.14 · 22.16).
 *
 * ── İKİ TİP, TEK GÖVDE ──────────────────────────────────────────────────────
 * `product_draft` (var olan kaydı tamamla) ve `product_create` (yeni ürün) aynı gövdeyi kullanır.
 * Kullanıcının sorusu bunu açtı: *"yeni ürün ile ürün düzenleme ayna diyaloğu kullanabilir değil
 * mi?"* — evet, çünkü ürün ekranında da tek diyalog iki işi görüyor (`mode: 'create' | 'edit'`).
 * İkinci bir gövde dosyası yazılsaydı bugün kopya olurdu, yarın ayrışırdı (`CLAUDE §1`).
 *
 * Değişen ÜÇ şey, üçü de dışarıdan geliyor: açılış değeri (kayıt ↔ boş şablon), kaydeden kapı
 * (güncelle ↔ oluştur, `assistant-body`), ve `productId` — yeni üründe YOK. Kimliğin yokluğu
 * galeriyi kendiliğinden doğru hâline düşürüyor: kapak yükleme kilitli ("kaydedince eklenebilir",
 * R2 anahtarı slug'a bağlı), galeri şeridi hiç çizilmiyor (`ProductPhotos` künyesi).
 *
 * ── BİR TUR AYRI FORM YAZILDI, GERİ ALINDI ──────────────────────────────────
 * İlk denemede buraya alan alan seçim yapan yepyeni bir form yazılmıştı. Kullanıcının tespiti
 * kısaydı — *"bizim ürün formumuz bu değil ki."* Doğruydu: aynı ürün iki ekranda iki farklı formla
 * düzenlenirse bir gün biri KDV seçeneğini, öteki alerjen vurgusunu ya da varyant etiketinin
 * zorunluluğunu kaybeder (`CLAUDE §1`). Form ortak komponente taşındı; burası onu KULLANIYOR.
 *
 * ── FORM ÜRÜNÜN BUGÜNKÜ HÂLİYLE AÇILIR ──────────────────────────────────────
 * Taban `buildDefaults(product)` — kategori, KDV, varyantlar, kargo izni hepsi kayıttan. Asistanın
 * önerdiği alanlar bunun ÜZERİNE yazılır. Tersi (boş formu dilekçeyle doldurmak) kaydetmede
 * asistanın hiç dokunmadığı alanları sıfırlardı: bir onay, ürünün varyantlarını silerdi.
 *
 * ── ASİSTANIN DOKUNDUĞU KUTU İŞARETLİ ───────────────────────────────────────
 * `filled` kümesi kutunun başlığına "asistan" rozetini koyuyor. İşaret olmasa operatör hangi
 * kutunun kendi kaydı, hangisinin öneri olduğunu ayıramazdı — formun tamamı "zaten böyleydi" gibi
 * okunurdu. Eski değer de görünür kalıyor: rozetin ipucunda değil, `ProposalAside`ın künyesinde.
 */

/** Dilekçenin dokunabildiği alanlar — `filled` işareti ve künye bu sırayla okunur. */
const DRAFT_FIELDS = ['name', 'description', 'ingredients', 'storageInstructions', 'allergens', 'traces', 'nutrition'] as const;
type DraftField = (typeof DRAFT_FIELDS)[number];

/**
 * Formun açılış değeri: ürünün bugünkü hâli + asistanın önerisi.
 *
 * Ürün kaydı OKUNAMADIYSA (silinmiş, ya da havuza girmemiş) boş şablona düşülür ve gövde bunu
 * ekranda söyler — sessizce boş bir formla kaydetmek, dokunulmamış alanları sıfırlamak olurdu.
 */
export function productDraftValuesFrom(payload: ProductDraftPayload, product: ProductFormSource | null): ProductFormValues {
  const base = buildDefaults(product);
  const written = payload.fields as Partial<Record<DraftField, unknown>>;
  const patch: Record<string, unknown> = {};
  for (const key of DRAFT_FIELDS) {
    if (written[key] !== undefined) patch[key] = written[key];
  }
  return { ...base, ...patch } as ProductFormValues;
}

/** Asistanın DOKUNDUĞU alanlar — kutu başlıklarındaki rozet bundan çıkar. */
function productDraftFilled(payload: ProductDraftPayload): ReadonlySet<keyof ProductFormValues> {
  const written = payload.fields as Partial<Record<DraftField, unknown>>;
  return new Set(DRAFT_FIELDS.filter((key) => written[key] !== undefined) as Array<keyof ProductFormValues>);
}

/**
 * YENİ ÜRÜNÜN açılış değeri: boş şablon + asistanın dilekçesi.
 *
 * Taban `buildDefaults(null)` — formun kendi varsayılanları (KDV %5,5, DDM, kargo açık, tek boş
 * varyant). Dilekçedeki her alan bunun üzerine yazılır; **`null` bırakılanlar YAZILMAZ**, çünkü
 * şemada `null` "asistan okuyamadı" demek ve varsayılanı ezmemeli (`shippable` künyesi: bilinmiyor
 * ile "hayır" ayrı şeyler).
 *
 * Varyantlar dilekçeden geliyorsa formun satır şekline çevrilir: dilekçe yalnız etiket + ağırlık +
 * adet taşır (fiyat ve stok ayrı kararlar), formun geri kalan kutuları boş doğar.
 */
export function productCreateValuesFrom(payload: ProductCreatePayload): ProductFormValues {
  // Durum burada BAĞLANMIYOR: "yeni ürün aday doğar" kuralı FORMUN varsayılanında duruyor
  // (`buildDefaults`), yani elle oluşturmada da geçerli. Burada ikinci kez yazılsaydı iki varsayılan
  // olurdu ve biri bir gün ötekinden ayrılırdı (ölçüldü 11.08: iki ürün SATIŞTA doğmuştu).
  const base = buildDefaults(null);
  const patch: Record<string, unknown> = {};
  for (const key of CREATE_FIELDS) {
    const value = (payload as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) patch[key] = value;
  }
  // KDV formda dizge (segment kontrolü), dilekçede sayı — tek dönüşüm noktası.
  if (payload.vatRate) patch.vatRate = payload.vatRate === 20 ? '20' : '5.5';
  if (payload.variants.length > 0) {
    patch.variants = payload.variants.map((v) => ({
      label: v.label,
      netWeightG: v.netWeightG,
      piecesCount: v.piecesCount,
      minStockQty: null,
      sku: null,
      isActive: true,
    }));
  }
  return { ...base, ...patch } as ProductFormValues;
}

/** Yeni üründe asistanın DOLDURDUĞU alanlar — rozetin ölçütü aynı: yazdı mı, yazmadı mı. */
function productCreateFilled(payload: ProductCreatePayload): ReadonlySet<keyof ProductFormValues> {
  const written = payload as Record<string, unknown>;
  const keys = CREATE_FIELDS.filter((key) => written[key] !== undefined && written[key] !== null);
  return new Set([...keys, ...(payload.variants.length > 0 ? (['variants'] as const) : [])] as Array<keyof ProductFormValues>);
}

/** Dilekçeden forma birebir geçen alanlar (KDV ve varyantlar ayrı çevriliyor). */
const CREATE_FIELDS = [
  'name',
  'description',
  'categoryId',
  'dateType',
  'shelfLifeDays',
  'shippable',
  'ingredients',
  'storageInstructions',
  'nutrition',
  'allergens',
  'traces',
] as const;

interface ProductDraftBodyProps {
  /** `product_draft` var olan kaydı tamamlar, `product_create` yeni ürün açar — gövde ortak. */
  payload: ProductDraftPayload | ProductCreatePayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  /** Teknik künye — dilekçe sütununun "Metadata" görünümü basıyor (11.08). */
  meta: ProposalMeta;
  values: ProductFormValues;
  onChange: (next: ProductFormValues) => void;
  disabled: boolean;
  /** Karar VERİLMİŞ öneri — aynı form, düzenlenmeyen hâliyle. */
  readOnly: boolean;
}

export function ProductDraftBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: ProductDraftBodyProps) {
  // Ayrımın ÖLÇÜTÜ kimliğin varlığı: `product_create` dilekçesinde `productId` YOKTUR. Tipi ekrana
  // ayrıca geçirmek ikinci bir gerçek olurdu ve bir gün ötekinden ayrılırdı.
  const draft = 'productId' in payload ? payload : null;
  const product = draft ? (options.products[draft.productId] ?? null) : null;
  const filled = useMemo(
    () => (draft ? productDraftFilled(draft) : productCreateFilled(payload as ProductCreatePayload)),
    [draft, payload],
  );
  // Sekme YEREL: form içi bir görünüm tercihi, kararın parçası değil — çerçevenin taslağına girmez.
  const [tab, setTab] = useState<ProductFormTab>('product');

  /**
   * RHF örneği GÖVDEDE, ama gerçeğin sahibi ÇERÇEVE.
   *
   * Çerçeve taslağı (`draft`) tutuyor ve kaydeden kapıya onu veriyor; form ise RHF ister. `values`
   * ile dış durum forma yansıtılıyor, her değişiklik `onChange` ile geri gidiyor. İki yönlü bağ
   * kurulmasaydı ya alt bardaki "uygula" bayat değerle koşardı ya da form her tazelemede sıfırlanırdı.
   */
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: values,
    values,
    mode: 'onChange',
  });


  /**
   * GÖRSEL BLOĞU DA VAR — form ürün ekranındakinin BİREBİR aynısı (kullanıcı kararı 11.08).
   *
   * Bir tur bu slot `null` geçiliyordu: galeri canlı yazar (yükleme, sıralama, kapak seçimi anında
   * kaydedilir) ve "kuyruk hiçbir şeyi kendi yazmaz" vaadini deldiği düşünülmüştü. Kullanıcı ekranda
   * gördü ve kaldırttı — *"eğer ben sistemde bir form kullanıyorsam o formu mümkünse bire bir
   * kopyala. Code duplication olmasın, ama görüntüde bazı şeyleri kırpma."*
   *
   * **Vaat de zarar görmüyor:** galeri ÖNERİYİ uygulamıyor, ürünün fotoğraflarını yönetiyor —
   * operatörün kendi elinin işi, tıpkı ürün ekranındaki gibi. Kuyruğun onaya bağladığı şey
   * asistanın DİLEKÇESİ; oraya dokunan tek yol hâlâ alt bardaki düğme.
   */
  const [crop, setCrop] = useImageCrop(form);
  // Uyarı FORMUN yaşayan değerini izler, dilekçenin ilk hâlini değil: operatör kategoriyi seçer
  // seçmez uyarı kalkmalı — yoksa düzeltilmiş bir eksik ekranda durmaya devam ederdi.
  const categoryId = useWatch({ control: form.control, name: 'categoryId' });
  const fields = useProductFormFields({
    control: form.control,
    watch: form.watch,
    categories: options.categories,
    // YENİ ÜRÜNDE de çizilir ama kendi doğru hâliyle: kimlik yok → kapak yükleme kilitli ve galeri
    // şeridi hiç yok (`ProductPhotos` bunu kendi biliyor). Blok tamamen gizlenseydi form iki tipte
    // iki farklı düzen olurdu — kırpmanın ta kendisi.
    photosSlot:
      draft && product === null ? null : (
        <ProductPhotos
          productId={draft?.productId ?? null}
          coverUrl={product?.imageUrl ?? null}
          coverCrop={crop}
          onCoverCropChange={setCrop}
          // Karar VERİLMİŞ öneride yükleme kapalı: arşiv satırı okunur bir kayıttır, oradan dosya
          // yazmak "olup bitmiş" bir kararı değiştirmek gibi okunurdu.
          uploadCover={readOnly || !draft ? undefined : (fd) => uploadProductImageAction(draft.productId, fd)}
        />
      ),
    filled: readOnly ? undefined : filled,
  });

  /**
   * Her değişiklikte çerçeveye haber — RHF'nin kendi durumu tek başına kaydedilmez.
   *
   * Geri çağrı REF'te tutuluyor: `onChange` her render'da yeniden kurulan bir kapanış ve doğrudan
   * bağımlılığa yazılsaydı abonelik her render'da sökülüp kurulurdu (tuş başına iki iş). Abone bir
   * kez kurulur, her zaman en güncel çağrıyı okur.
   */
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    const sub = form.watch((next) => notify.current(next as ProductFormValues));
    return () => sub.unsubscribe();
  }, [form]);

  // ── İKİ SÜTUN, İKİ AYRI KAYDIRMA (kullanıcı kararı 11.08) ──────────────────
  // "O bölümün scroll'u ayrı olsun, form tarafının scroll'u ayrı olsun." Tek kaydırma kolonunda
  // dilekçe sütunu formu aşağı itiyordu: formun altındaki varyant tablosuna inmek için önce
  // dilekçenin sonuna kadar geçmek gerekiyordu, oysa ikisi yan yana duran ayrı okumalar.
  //
  // ── DIŞ KART KALKTI, YÜKSEKLİK DİYALOGTAN GELİYOR (11.08) ──────────────────
  // Bir tur burada üçüncü bir kart daha vardı (`rounded-ops-card … p-3.5`) ve iki panel onun içinde
  // duruyordu: kart içinde kart, iki kenarlık, iki dolgu — kullanıcının tespiti *"kart içinde kart
  // şeklinde görünüyor"*. Kenarlık zaten panellerin kendisinde.
  //
  // Yükseklik de artık SABİT DEĞİL (`h-[68vh]` gitti): satır `flex-auto` ile diyaloğun gövdesinden
  // pay alıyor. Sabit `vh` iki arızayı birden doğuruyordu — diyalog kabuğu `86vh`, gövdenin payı
  // ondan küçük; 68vh + gerekçe kutusu + teknik döküm toplamı taşıyor ve DİYALOG da kayıyordu.
  // İki kaydırma iç içe girince ne form ne dilekçe sonuna kadar okunabiliyordu. Şimdi kaydıran
  // yalnız iki sütun: gövde taşmıyor, satır kalan boşluk kadar.
  return (
    <div className="flex min-h-0 flex-auto items-stretch gap-4">
      <div className="flex min-h-0 min-w-[38rem] flex-[3] basis-0 flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        {/* Satış durumu seçicisi BURADA YOK ve olmayacak (kullanıcı kararı 11.08): kuyruk ürünün
            İÇERİĞİNİ yazar, satış eksenine dokunmaz. Ürün pasifse pasif, aktifse aktif kalır — form
            mevcut durumu okuyup aynısını geri gönderiyor. */}
        <div className="flex flex-none flex-wrap items-baseline justify-between gap-3">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">{draft ? 'Ürün formu' : 'Yeni ürün'}</span>
          <ProductFormTabs value={tab} onChange={setTab} />
        </div>

        {/* Kaydıran kap SEKME BARININ ALTI, panelin kendisi değil: bar sabit kalmalı ki form
            kaydırılırken "Ürün ↔ Beyan" geçişi ekrandan çıkmasın (`ProductFormTabs` künyesi).
            `-mr-3 pr-3` çubuğa kendi şeridini açıyor — dilekçe sütunuyla aynı gerekçe
            (`proposal-aside` künyesi): overlay çubuk kutuların sağ kenarına biniyordu. */}
        <div className="-mr-3 flex min-h-0 flex-auto flex-col overflow-y-auto pr-3">
          {draft && product === null ? (
            // Kayıt okunamadıysa FORM AÇILMAZ: boş bir formla kaydetmek, dokunulmamış alanları
            // sıfırlamak olurdu (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
            <span className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5 font-ops-body text-ops-base text-ops-amber-dark">
              Ürünün bugünkü kaydı okunamadı — silinmiş olabilir. Bu öneri uygulanamaz; ürün ekranından doğrulayın.
            </span>
          ) : (
            // Kilit TEK yerden: `fieldset` bütün girdileri HTML'in kendi mekanizmasıyla kapatır.
            // Alan alan `disabled` geçmek, bir gün birinde unutulacak bir tekrar olurdu.
            <fieldset disabled={disabled || readOnly} className="min-w-0 border-0 p-0">
              {/* KATEGORİSİZ ÜRÜN UYARIR, ENGELLEMEZ (22.39 · kullanıcı kararı 26.08).
                  Asistan kategoriyi okuyamadığında dilekçe `categoryId: null` taşıyor ve şema da onu
                  `nullable` kabul ediyor. Engellemek düşünüldü ve ELENDİ: ürün ADAY doğuyor, satışa
                  çıkarken zaten ürün ekranından geçiyor — kapıyı kapatmak, rafta duran gerçek bir
                  ambalajı kayda geçirmeyi kategori seçilene kadar erteletirdi.
                  Ama sessiz de kalmıyor: kategorisiz kayıt katalog listelerinde HİÇBİR kategoriye
                  düşmez, yani açılır ama görünmez — operatörün bunu onaydan ÖNCE bilmesi gerekir. */}
              {categoryId === null || categoryId === '' ? (
                <span className="mb-3 block rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5 font-ops-body text-ops-sm text-ops-amber-dark">
                  Kategori seçilmedi — kayıt açılır ama katalog listelerinde görünmez. Şimdi seçebilir
                  ya da sonra ürün ekranından tamamlayabilirsiniz.
                </span>
              ) : null}
              <ProductFormPanels fields={fields} tab={tab} />
            </fieldset>
          )}
        </div>
      </div>

      {/* Öne çıkan iki satır + dilekçenin TAMAMI (22.15). Üzerine yazma sayısı künyede duruyor
          çünkü payload'ın kendisinden okunmuyor: iki nesnenin karşılaştırmasından çıkıyor. */}
      <ProposalAside
        subject={subject}
        fallbackTitle={draft ? draft.productName : resolveLocalizedText((payload as ProductCreatePayload).name)}
        facts={[
          {
            label: 'Asistanın yazdığı',
            value: filled.size > 0 ? [...filled].map((k) => DECLARATION_FIELD_LABEL[k as string] ?? k).join(' · ') : 'yok',
          },
          // "Üzerine yazılan" YALNIZ var olan kayıtta anlamlı: yeni üründe üstüne yazılacak bir şey
          // yok ve satırı "yok" diye çizmek olmayan bir riski varmış gibi okuturdu.
          ...(draft ? [{ label: 'Üzerine yazılan', value: overwriteText(draft) }] : []),
        ]}
        payload={payload}
        meta={meta}
      />
    </div>
  );
}

/**
 * Kaç DOLU alanın üzerine yazılıyor — ve eski hâl hiç okunamadıysa bunu söyler.
 *
 * Sayı değil ADLAR gerekiyordu ama künye satırı dar; adlar sığmadığında sayıya düşülüyor. Eski hâl
 * BİLİNMİYORSA üzerine yazma İDDİA EDİLMEZ: `currentFields`in hiç gelmemesi "boştu" demek değil,
 * "okunamadı" demektir ve ikisi ayrı şeydir (`ProductDraftPayloadSchema` künyesi).
 */
function overwriteText(payload: ProductDraftPayload): string {
  if (payload.currentFields === undefined) return 'eski hâl okunamadı';
  const current = payload.currentFields as Record<string, unknown>;
  const written = payload.fields as Record<string, unknown>;
  const names = DRAFT_FIELDS.filter((key) => written[key] !== undefined && hasValue(current[key])).map(
    (key) => DECLARATION_FIELD_LABEL[key] ?? key,
  );
  if (names.length === 0) return 'yok — hepsi boş alana';
  return names.length <= 2 ? names.join(' · ') : `${names.length} dolu alan`;
}

/** Alan BUGÜN dolu mu — boş dizi ve boş metin dolu sayılmaz. */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some((v) => (typeof v === 'string' ? v.trim() : v !== null));
  return true;
}
