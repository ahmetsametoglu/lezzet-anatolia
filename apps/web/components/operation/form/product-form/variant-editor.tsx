'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useWatch, type Control } from 'react-hook-form';
import { barcodeProblem } from '@lezzet/domain-core';
import {
  resolveLocalizedText,
  type BarcodeKind,
  type LocalizedText,
  type NetUnit,
  type PortionKind,
  type VariantBarcode,
} from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { JoinedField, JoinedSeparator, JoinedSuffix } from '@/components/operation/form/joined-field';
import { TagBox } from '@/components/operation/form/tag-box';
import { LocaleTabs } from '@/components/operation/form/locale-tabs';
import { Toggle } from '@/components/operation/form/toggle';
import { TranslateInput } from '@/components/operation/form/translate-input';
import { suggestTranslationAction } from '@/lib/ai/translate';
import { deleteVariantBarcodeAction, listVariantBarcodesAction } from '@/lib/catalog/barcode-actions';
import { TrashIcon } from '@/components/operation/ui/icons';
import { SortableList } from '@/components/operation/ui/sortable-list';
import type { ProductFormValues } from './schema';

// Varyant editörü — ürün formunun RHF field-array'i (ekle/sil/sırala/düzenle). Sayfaya özel.
// Satır içi girdiler operasyon form kontrolleri (Input/Toggle); ham <input> yok.
//
// ETİKET ÇOK DİLLİ ama tabloya üç kolon EKLENMEDİ: dil tablonun üstünde bir kez seçilir, "Etiket"
// kolonu o an seçili dili gösterir (ad/açıklama/beyan alanlarındaki LocaleCard deseninin aynısı).
// Sebep çeviri akışı: operatör bir dili baştan sona girer, sonra dile geçer — üç kolon aynı işi
// yaptırmadan yalnız her satırı üç kat daraltırdı. Eksik dil sekmedeki nokta ile görünür.
//
// SIRA = satırın dizideki konumu (servis indeksi `sortOrder`'a yazar) ve bu, müşterinin gördüğü boy
// seçicisinin sırasıdır → sürüklenebilir. Tutamak AYRI (`grab="handle"`): satır girdi dolu, satırın
// kendisinden sürüklemek metin seçmeyi bozardı.

// Tutamak · Etiket (esner) · SKU · Net miktar · İçindeki · Min · Aktif · sil
//
// "Adet" sütunu `İÇİNDEKİ` oldu ve porsiyon TÜRÜNÜ de o taşıyor (tasarım kaydı · kullanıcı sorusu):
// sayı ile türü ayrı yerlerde duruyordu — "10" tabloda, "adet mi dilim mi" ambalaj şeridinde. İkisi
// tek soruya cevap veriyor ("neyin kaçı") ve ayrıldıklarında ikisi de yarım okunuyordu. Porsiyon
// ambalaj şeridine yer darlığından konmuştu, ambalajla ilgisi yok: içindekini anlatıyor.
const CELL = 'grid grid-cols-[22px_minmax(0,1fr)_116px_150px_138px_96px_56px_26px] items-center gap-x-2.5';

/**
 * Satırın BARKODLARI — kayıtlı olanlar ve kaydedilince bağlanacak olanlar bir arada.
 *
 * Kod EKLEMEK bir tur bilerek yoktu (öğrenme mal kabulde, karar §1.3); işletmeci kararıyla açıldı:
 * ambalaj fotoğrafından okunan kodu asistan buraya yazar, operatör görerek onaylar. Yazma yine
 * kaydetme anında (`bindNewBarcodes`) — kutu açıkken hiçbir şey bağlanmaz.
 *
 * Sağlama hanesi BURADA da sorulur: yanlış yazılan hane yazıldığı an görünür, üç hafta sonra depoda
 * okutulmayan bir kolide değil.
 */
function BarcodeCell({
  control,
  index,
  saved,
  onUnlearn,
}: {
  control: Control<ProductFormValues>;
  index: number;
  saved: VariantBarcode[];
  onUnlearn: (code: VariantBarcode) => void;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Controller
      control={control}
      name={`variants.${index}.newBarcodes`}
      render={({ field }) => {
        const pending = field.value ?? [];
        const ekle = () => {
          const code = draft.trim();
          const varOlan = pending.some((p) => p.code === code) || saved.some((s) => s.code === code);
          const sorun = barcodeProblem(code) ?? (varOlan ? 'Bu kod bu boyda zaten var.' : null);
          if (sorun) {
            setProblem(sorun);
            return;
          }
          // Buradan yazılan kod PAKETİN kodudur; `unit` kodun çarpanı daima 1 (kısıt veride de).
          field.onChange([...pending, { code, kind: 'unit' as const, qtyPerCode: 1 }]);
          setDraft('');
          setProblem(null);
        };

        return (
          <SubRow label="Barkod">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-ops-body text-ops-micro text-ops-muted">kayıtlı kodlar · kaydedilince varyanta bağlanır</span>
              <TagBox>
            {saved.map((code) => (
              <BarcodeChip
                key={code.id}
                code={code.code}
                kind={code.kind}
                qtyPerCode={code.qtyPerCode}
                title={code.createdBy ? 'Mal kabulde öğretilmiş kod' : 'Sistem kaydı'}
                removeTitle="Eşlemeyi geri al — kod bir sonraki kabulde yeniden sorulur"
                onRemove={() => onUnlearn(code)}
              />
            ))}
            {pending.map((code) => (
              <BarcodeChip
                key={code.code}
                code={code.code}
                kind={code.kind}
                qtyPerCode={code.qtyPerCode}
                pending
                title="Kaydedilince bağlanacak"
                removeTitle="Listeden çıkar — henüz yazılmadı"
                onRemove={() => field.onChange(pending.filter((p) => p.code !== code.code))}
              />
            ))}
            <Input
              inputSize="sm"
              mono
              bare
              className="w-[186px] px-1"
              fullWidth={false}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setProblem(null);
              }}
              onKeyDown={(e) => {
                // Enter kodu EKLER, formu göndermez: satırı bitiren tuş, sayfayı kaydeden tuş değil.
                if (e.key !== 'Enter') return;
                e.preventDefault();
                ekle();
              }}
              // Yokluk PLACEHOLDER'da söylenir: boş bir kutunun yanına "kayıtlı kod yok" diye ayrı
              // bir satır yazmak, olmayan bir şeyi iki kez anlatmak olurdu.
              placeholder={
                saved.length + pending.length === 0 ? 'kod yaz, Enter ile ekle · kayıtlı kod yok' : 'kod yaz, Enter ile ekle'
              }
              aria-label="Yeni barkod"
              title={problem ?? 'Ambalajın üstündeki kod. Koli barkodu buradan yazılmaz: kolinin kaç paket saydığını mal kabul sorar.'}
            />
              </TagBox>
              {/* Hata kutunun ALTINDA: çiplerin arasına kırmızı bir çerçeve koymak, hangi çipin
                  sorunlu olduğunu söylüyormuş gibi okunurdu — oysa sorun yazılan kodda. */}
              {problem ? (
                <span role="alert" className="font-ops-body text-ops-micro font-semibold text-ops-red">
                  {problem}
                </span>
              ) : null}
            </span>
          </SubRow>
        );
      }}
    />
  );
}

/**
 * Kod çipi — kayıtlı ve bekleyen kod aynı gövdeyi paylaşır, ayrım yalnız renkte. Tür yalnız KOLİ
 * kodunda yazılır ("koli ×12"): paket kodu olağan hâldir, her çipe "paket" yazmak satırı sayı değil
 * kelime yığınına çevirirdi.
 */
function BarcodeChip({
  code,
  kind,
  qtyPerCode,
  pending = false,
  title,
  removeTitle,
  onRemove,
}: {
  code: string;
  kind: BarcodeKind;
  qtyPerCode: number;
  pending?: boolean;
  title: string;
  removeTitle: string;
  onRemove: () => void;
}) {
  const tone = pending ? 'border-ops-violet-line bg-ops-violet-bg text-ops-violet' : 'border-ops-line bg-ops-subtle text-ops-body';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 font-ops-mono text-ops-micro ${tone}`}
      title={title}
    >
      {code}
      {kind === 'case' ? <span className="opacity-70">koli ×{qtyPerCode}</span> : null}
      <button
        type="button"
        onClick={onRemove}
        className="cursor-pointer opacity-60 hover:text-ops-red hover:opacity-100"
        aria-label={`${code} kodunu kaldır`}
        title={removeTitle}
      >
        ×
      </button>
    </span>
  );
}

/**
 * Varyant satırının ALT ŞERİTLERİ (ambalaj · barkod) — etiketler sabit bir sütunda hizalanır, içerik
 * tek sıra akar. Etiket de içerik de aynı sarmalın içinde serbest bırakılınca satır üçe bölünüyordu:
 * "brüt" bir satırda, kutusu ötekinde kalıyordu (kullanıcı bulgusu 17.09).
 */
function SubRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)] items-start gap-x-2 px-[13px] pb-2.5 pl-[31px]">
      {/* Etiket kutuların değil KUTU BAŞLIKLARININ hizasında: alanlar artık iki satırlı (üstte ne
          olduğu, altında kutusu) ve etiket tepeye yapışınca şerit sola devrilmiş görünüyordu. */}
      <span className="pt-[19px] font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-faint">{label}</span>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}

/**
 * NET MİKTAR hücresi — sayı ve birim yan yana, tek kolonda.
 *
 * Birim sayının YANINDA duruyor çünkü ikisi bir bilgidir: "500" tek başına hiçbir şey demez ve gramla
 * sınırlı eski kutu sirkeyi, zeytinyağını, özleri hiç yazamıyordu. Kıyas fiyatı da buradan seçilir
 * (g → €/kg, ml → €/L). Miktar silinince birim de düşer: kısıt ikisini birlikte ister.
 */
function NetQuantityCell({ control, index }: { control: Control<ProductFormValues>; index: number }) {
  return (
    <JoinedField>
      <Controller
        control={control}
        name={`variants.${index}.netQuantity`}
        render={({ field }) => (
          <NumberCell
            bare
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            title="Ambalajda yazan net miktar — satışa çıkmanın şartı"
          />
        )}
      />
      <Controller
        control={control}
        name={`variants.${index}.netUnit`}
        render={({ field }) => (
          <Select
            size="sm"
            variant="joined"
            className="flex"
            value={field.value ?? 'g'}
            onChange={(v) => field.onChange(v as NetUnit)}
            ariaLabel="Net miktarın birimi"
            options={[
              { value: 'g', label: 'g' },
              { value: 'ml', label: 'ml' },
            ]}
          />
        )}
      />
    </JoinedField>
  );
}

/** Sayı hücresi — Net miktar ve Min. stok aynı davranışı paylaşır (boş = bilinmiyor / eşik yok). */
function NumberCell({
  bare,
  value,
  onChange,
  onBlur,
  className,
  title,
  placeholder = '—',
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  onBlur: () => void;
  /** Çerçevesiz hâl — kutu bir `JoinedField`in içinde, kenarlığı o çiziyor. */
  bare?: boolean;
  /** Ambalaj satırındaki dar kutular için — tablo hücresinde verilmez (ızgara genişliği yönetir). */
  className?: string;
  title?: string;
  placeholder?: string;
}) {
  return (
    <Input
      inputSize="sm"
      mono
      bare={bare}
      inputMode="numeric"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      // Genişlik VERİLDİYSE kabuğun `w-full`'ü çizilmez: satır içinde duran kutu yoksa satırı kaplar ve
      // komşularını alt satıra iter (ölçüldü — ambalaj satırı üç satıra dağılmıştı).
      fullWidth={className ? false : undefined}
      title={title}
    />
  );
}

/** Porsiyon türü seçenekleri — boş değer "tek parça / dökme" demektir, sıfır değil. */
const PORTION_OPTIONS = [
  { value: '', label: '—' },
  { value: 'item', label: 'adet' },
  { value: 'slice', label: 'dilim' },
  { value: 'package', label: 'paket' },
];

/**
 * İÇİNDEKİ hücresi — kaç parça ve NEYİN kaçı, tek kutuda (tasarım kaydı).
 *
 * `piecesCount` "kaç" der, `portionKind` "neyin kaçı": 4'lü simit paketi "4 adet", 12 dilimlik
 * cheesecake "12 dilim", çift paket "2 paket". Vitrin üçüne aynı kelimeyi yazamaz — "12 adet
 * cheesecake" 12 pasta demek olurdu (`portion_kind` künyesi, 0005).
 *
 * İkisi bir tur AYRI YERLERDEYDİ: sayı tabloda, tür ambalaj şeridinde. Tür oraya yer darlığından
 * konmuştu ve ambalajla hiç ilgisi yok — ambalajın İÇİNDEKİNİ anlatıyor. Ayrıldıkları sürece ikisi
 * de yarım okunuyordu: "10" neyin onu, "dilim" neyin dilimi.
 */
function ContentsCell({ control, index }: { control: Control<ProductFormValues>; index: number }) {
  return (
    <JoinedField>
      <Controller
        control={control}
        name={`variants.${index}.piecesCount`}
        render={({ field }) => (
          <NumberCell
            bare
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            className="w-[46px]"
            title="Kutudaki parça sayısı — dökme üründe boş bırakın"
          />
        )}
      />
      <Controller
        control={control}
        name={`variants.${index}.portionKind`}
        render={({ field }) => (
          <Select
            size="sm"
            variant="joined"
            className="flex min-w-0 flex-1"
            value={field.value ?? ''}
            onChange={(v) => field.onChange(v === '' ? null : (v as PortionKind))}
            ariaLabel="Porsiyon türü"
            options={PORTION_OPTIONS}
          />
        )}
      />
    </JoinedField>
  );
}

/**
 * **AMBALAJ SATIRI** (07.12) — varyantın fiziksel gerçeği: kutuda ne var, kutu ne kadar yer kaplar.
 *
 * Barkod satırının görsel dilini birebir izler (aynı ped, aynı küçük başlık, aynı girinti): ikisi
 * de satırın ALTINDA yaşayan, tabloya sığmayan ama satıra ait bilgiler. Ayrı bir katlanır komponent
 * AÇILMADI — operasyon evreninde paylaşılan bir açılır parça yok ve bu beş alan her üründe
 * doldurulacak; bir tık arkasına saklamak onları unutturur.
 *
 * **Neden tabloya kolon olarak girmiyor:** satır zaten sekiz kolon. Dört kolon daha eklemek her
 * girdiyi okunmaz genişliğe düşürürdü.
 *
 * **`netQuantity` ile karışmasın diye BRÜT yazıyor** ve ipucu farkı açıklıyor: biri beyan (içindeki
 * gıda), öteki taşınan (ürün + ambalaj). İkisi aynı satırda görünmüyor ki operatör hangisini
 * doldurduğunu bilsin.
 *
 * **Porsiyon türü BURADAN ÇIKTI** (tasarım kaydı): ambalajın değil İÇİNDEKİNİN bilgisiydi ve buraya
 * yalnız tabloda yer kalmadığı için konmuştu. Artık sayısının yanında, "İçindeki" kolonunda.
 */
function PackingRow({ control, index }: { control: Control<ProductFormValues>; index: number }) {
  return (
    <SubRow label="Ambalaj">
      <span className="flex flex-col gap-1">
        <span className="font-ops-body text-ops-micro text-ops-muted">brüt ağırlık</span>
        <JoinedField className="w-[118px]">
          <Controller
            control={control}
            name={`variants.${index}.packedWeightG`}
            render={({ field }) => (
              <NumberCell
                bare
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                title="Ambalajıyla birlikte ağırlık (g) — kargo tarifesi bunu okur. Net miktarla karıştırmayın: o beyan, bu taşınan."
              />
            )}
          />
          <JoinedSuffix>g</JoinedSuffix>
        </JoinedField>
      </span>

      {/* ÜÇ ÖLÇÜ TEK KUTUDA (tasarım kaydı): üçü BİR ölçüdür ve ayrı kutulara bölündüğünde satır
          üçe dağılıyordu. Kutu ayrıca birlikte doldurulma kuralını da söylüyor — ikisi dolu biri
          boş bir koli hesaplanamaz, canlı kargo teklifi alınamaz. */}
      <span className="flex flex-col gap-1">
        <span className="font-ops-body text-ops-micro text-ops-muted">ölçü · en × boy × yükseklik</span>
        <JoinedField className="w-[230px] px-[9px]">
          {(['packedLengthMm', 'packedWidthMm', 'packedHeightMm'] as const).map((name, n) => (
            <Fragment key={name}>
              {n > 0 ? <JoinedSeparator /> : null}
              <Controller
                control={control}
                name={`variants.${index}.${name}`}
                render={({ field }) => (
                  <NumberCell
                    bare
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    className="px-1 text-center"
                    placeholder="—"
                    title="Kutunun dış ölçüsü (mm). Üçü birlikte doldurulur — ikisi dolu biri boş bir kutu hesaplanamaz."
                  />
                )}
              />
            </Fragment>
          ))}
          <JoinedSuffix>mm</JoinedSuffix>
        </JoinedField>
      </span>

      <span className="max-w-[300px] self-end pb-1.5 font-ops-body text-ops-micro leading-relaxed text-ops-muted">
        Kargonun girdisi: brüt ağırlık ürünün kendi paketiyle birlikte ağırlığıdır, net miktar beyanda durur.
      </span>
    </SubRow>
  );
}

interface VariantEditorProps {
  control: Control<ProductFormValues>;
}

export function VariantEditor({ control }: VariantEditorProps) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'variants' });
  const [lang, setLang] = useState<Locale>('tr');
  // Silme onayı satırın RHF anahtarıyla tutulur, indeksle DEĞİL: araya satır eklenince ya da sıra
  // değişince indeks kayar, onay yanlış satıra geçerdi.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // Canlı değerler: `fields` yalnız dizi yapısı değişince yenilenir, yazılan metni GERİDE bırakır —
  // sıralamada onu kullanmak son yazılanı geri alırdı. Dil noktası da bununla anında güncellenir.
  const rows = useWatch({ control, name: 'variants' }) ?? [];

  /*
    BARKODLAR (23.3) — öğrenen eşlemenin GERİ ALMA yeri. Kodlar form durumu DEĞİL: mal kabulde
    öğretilen ayrı kayıtlar (`variant_barcode`), bu yüzden RHF'e girmez — editör onları kendi
    okur ve satırın altında çip olarak listeler. Yalnız KAYITLI varyantın kodu olabilir; yeni
    eklenen satır kaydedilmeden koda sahip olamaz, o satırda bölüm hiç çizilmez.

    Silme onaysız ve bu bilinçli (action künyesi): kaybolan şey bir eşleme — koli bir sonraki
    kabulde okutulunca yeniden öğretilir. Yanlış varyanta bağlanmış kodun düzeltme yolu tam bu.
  */
  const [barcodes, setBarcodes] = useState<Map<string, VariantBarcode[]>>(new Map());
  const savedIdsKey = rows
    .map((row) => row?.id)
    .filter(Boolean)
    .sort()
    .join(',');
  useEffect(() => {
    const ids = savedIdsKey ? savedIdsKey.split(',') : [];
    if (ids.length === 0) return;
    void listVariantBarcodesAction(ids).then(({ data }) => {
      if (data === null) return; // okunamadıysa bölüm çizilmez — boş liste "kod yok" derdi, yalan olurdu
      const next = new Map<string, VariantBarcode[]>();
      for (const code of data) next.set(code.variantId, [...(next.get(code.variantId) ?? []), code]);
      setBarcodes(next);
    });
  }, [savedIdsKey]);

  const unlearnCode = (code: VariantBarcode) => {
    void deleteVariantBarcodeAction(code.id).then(({ error }) => {
      if (error !== null) return; // satır yerinde kalır — sessizce düşürmek eşlemeyi silinmiş gösterirdi
      setBarcodes((current) => {
        const next = new Map(current);
        next.set(code.variantId, (next.get(code.variantId) ?? []).filter((row) => row.id !== code.id));
        return next;
      });
    });
  };

  // Dil sekmesindeki eksik-dil noktası: etiketi OLAN satırların hepsi o dilde dolu mu? Tek boylu ürünün
  // etiketi hiç olmayabilir (müşteri seçici görmez) — o yüzden ölçüt "hiç yazılmamış" değil.
  const named = rows.map((r) => r?.label).filter((l): l is LocalizedText => Boolean(l && resolveLocalizedText(l)));
  const filled = LOCALES.reduce<Partial<Record<Locale, boolean>>>((acc, l) => {
    acc[l] = named.length === 0 || named.every((t) => Boolean(t[l]?.trim()));
    return acc;
  }, {});

  return (
    <section className="flex flex-col gap-[11px]">
      <div className="flex items-center justify-between border-b border-ops-line-soft pb-[7px]">
        <span className="font-ops-display text-ops-xs font-semibold uppercase tracking-[0.1em] text-ops-muted">Varyantlar</span>
        <button
          type="button"
          onClick={() => append({ label: {}, netQuantity: null, netUnit: 'g', piecesCount: null, portionKind: null, packedWeightG: null, packedLengthMm: null, packedWidthMm: null, packedHeightMm: null, minStockQty: null, sku: null, isActive: true })}
          className="cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark"
        >
          + varyant
        </button>
      </div>

      <div className="overflow-hidden rounded-ops-card border border-ops-line">
        {/* Dil şeridi tablonun İÇİNDE: yalnız bu tablonun tek bir kolonunu yönetiyor — dışarıda
            dururken form geneli bir dil kipi sanılıyordu. */}
        <div className="flex items-center justify-between border-b border-ops-line bg-ops-subtle px-[13px]">
          <LocaleTabs value={lang} onChange={setLang} filled={filled} />
          <span className="font-ops-body text-ops-micro text-ops-muted">boy etiketi · {lang.toUpperCase()}</span>
        </div>

        <div
          className={`${CELL} border-b border-ops-line bg-ops-subtle px-[13px] py-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted`}
        >
          <span />
          <span>Etiket ({lang.toUpperCase()})</span>
          <span>SKU</span>
          <span title="Ambalajdaki net miktar ve birimi — katıda gram, sıvıda mililitre">Net miktar</span>
          <span title="Kutunun İÇİNDEKİ: kaç parça ve neyin kaçı — 12'li baklava → 12 adet, dilimli pasta → 12 dilim. Dökme üründe boş bırakın.">
            İçindeki
          </span>
          <span title="Bu eşiğin altına düşünce stok uyarısı çıkar">Min. stok</span>
          <span className="text-center">Aktif</span>
          <span />
        </div>

        <SortableList
          items={fields}
          getId={(f) => f.id}
          // dnd yeni SIRAYI verir; canlı değerleri o sıraya dizip diziyi tazeleriz. `move` ile indeks
          // aritmetiği yapmıyoruz: yukarı taşımada ilk farklı indeks taşınan öğeyi göstermez.
          onReorder={(orderedIds) => {
            const byKey = new Map(fields.map((f, i) => [f.id, rows[i]]));
            const next = orderedIds.map((id) => byKey.get(id)).filter((v): v is (typeof rows)[number] => Boolean(v));
            if (next.length === rows.length) replace(next);
          }}
          renderItem={(f, handle) => {
            const i = fields.findIndex((x) => x.id === f.id);
            // KAYITLI satır = veritabanında karşılığı olan (uuid'i var). RHF `fields` öğesinin `id`'si
            // kendi anahtarıdır, varyantın uuid'i değil — o yüzden canlı değerden okunur.
            const saved = Boolean(rows[i]?.id);
            const confirming = confirmKey === f.id;
            const rowCodes = saved ? (barcodes.get(rows[i]!.id!) ?? []) : [];
            return (
              <div className="border-b border-ops-line-soft bg-ops-white last:border-b-0">
              <div className={`${CELL} px-[13px] py-2`}>
                {handle}
                <Controller
                  control={control}
                  name={`variants.${i}.label`}
                  render={({ field, fieldState }) => {
                    const text = (field.value ?? {}) as LocalizedText;
                    const source = text.tr?.trim() ?? '';
                    return (
                      <TranslateInput
                        inputSize="sm"
                        error={fieldState.error?.message}
                        title={fieldState.error?.message}
                        value={text[lang] ?? ''}
                        // Yalnız SEÇİLİ dilin anahtarı yazılır, öteki diller korunur.
                        onChange={(v) => field.onChange({ ...text, [lang]: v })}
                        onBlur={field.onBlur}
                        placeholder="ör. 500 g"
                        // TR kaynak dildir → kendisini çevirmez, orada düğme yok. Çeviri çağrısı
                        // BURADA: prop'la dışarıdan verilmesi, düğmenin yazılması unutulabilen bir
                        // şey olması demekti (`localized-text-field` künyesi, 12.08). Varyant
                        // etiketi bir ÜRÜN ADIDIR ("1 kg kutu") — alan türü `ad`.
                        onTranslate={
                          lang !== 'tr'
                            ? async () => {
                                const suggestion = await suggestTranslationAction(text, 'ad');
                                field.onChange({ ...text, [lang]: suggestion[lang] ?? text[lang] });
                              }
                            : undefined
                        }
                        translateDisabled={!source}
                        translateTitle={
                          source ? `Türkçeden çevir: “${source}”` : 'Çeviri için önce TR etiketini girin'
                        }
                      />
                    );
                  }}
                />
                <Controller
                  control={control}
                  name={`variants.${i}.sku`}
                  render={({ field }) => (
                    <Input
                      inputSize="sm"
                      mono
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      onBlur={field.onBlur}
                      placeholder="BAK-500"
                    />
                  )}
                />
                {/* Net miktar SAYI + BİRİM: gramla sınırlı bir kutu sıvıyı hiç yazamıyordu ve birim
                    fiyat da buradan seçiliyor (g → €/kg, ml → €/L). Satışa çıkmanın şartı (0005). */}
                <NetQuantityCell control={control} index={i} />
                {/* İÇİNDEKİ: sayı + neyin sayısı. Boş bırakılabilir ve boş `null` demektir ("adet
                    bildirilmemiş", dökme ürün) — sıfır DEĞİL; sıfır "içinde hiç parça yok" derdi
                    (`CLAUDE §1`). */}
                <ContentsCell control={control} index={i} />
                <Controller
                  control={control}
                  name={`variants.${i}.minStockQty`}
                  render={({ field }) => <NumberCell value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
                <span className="justify-self-center">
                  <Controller
                    control={control}
                    name={`variants.${i}.isActive`}
                    render={({ field }) => <Toggle on={Boolean(field.value)} size="sm" onChange={field.onChange} />}
                  />
                </span>
                {/* Silme KAYITLI satırda iki adım: o satır gidince fiyat satırları da gider (0006
                    cascade), stok/sipariş varsa sunucu zaten reddeder. Yeni eklenen satırda
                    kaybedilecek bir şey yok → tek tık. */}
                {confirming ? (
                  <button
                    type="button"
                    onClick={() => {
                      remove(i);
                      setConfirmKey(null);
                    }}
                    onBlur={() => setConfirmKey(null)}
                    className="cursor-pointer justify-self-center font-ops-display text-ops-micro font-semibold text-ops-red"
                    title="Bu varyantın fiyat satırları da silinir. Onaylamak için tıklayın."
                  >
                    SİL?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => (saved ? setConfirmKey(f.id) : remove(i))}
                    disabled={fields.length === 1}
                    className="cursor-pointer justify-self-center text-ops-faint hover:text-ops-red disabled:cursor-default disabled:opacity-30"
                    aria-label="Varyantı sil"
                    title={fields.length === 1 ? 'Ürün en az bir varyant taşır' : 'Varyantı sil'}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
              <PackingRow control={control} index={i} />
              <BarcodeCell control={control} index={i} saved={rowCodes} onUnlearn={unlearnCode} />
              </div>
            );
          }}
        />
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
        Sıra, müşterinin gördüğü boy sırasıdır — satırları tutamaktan sürükleyerek değiştirin. Min. stok, altına
        düşünce uyarı çıkacak eşiktir; boş bırakılırsa uyarı üretilmez. <strong>Ambalaj</strong> satırı kargonun
        girdisidir: brüt ağırlık ürünün kendi paketiyle birlikte ağırlığıdır (net ağırlık beyandır, o ayrı), ölçüler
        milimetredir ve üçü birlikte doldurulur. Boş bırakılan ölçü “bilinmiyor” demektir — o varyant için canlı
        kargo teklifi alınamaz.
      </span>
    </section>
  );
}
