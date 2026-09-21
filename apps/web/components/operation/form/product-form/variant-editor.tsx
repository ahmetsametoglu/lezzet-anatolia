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

// Varyant editörü — ürün formunun field-array'i. Etiket çok dilli ama tek kolon: dil tablonun üstünde
// seçilir, çünkü operatör bir dili baştan sona girip sonra öbürüne geçer.

// Tutamak · Etiket (esner) · SKU · Net miktar · İçindeki · Min · Aktif · sil
const CELL = 'grid grid-cols-[22px_minmax(0,1fr)_116px_150px_138px_96px_56px_26px] items-center gap-x-3.5';

/**
 * Satırın barkodları — kayıtlı olanlar ve kaydedilince bağlanacak olanlar bir arada. Sağlama hanesi
 * yazıldığı an sorulur: yanlış hane depoda okutulmayan bir kolide değil burada görünsün.
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
          // Buradan yazılan kod paketin kodudur; `unit` kodun çarpanı veride de daima 1.
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
                    // Enter kodu ekler, formu göndermez.
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    ekle();
                  }}
                  placeholder={
                    saved.length + pending.length === 0 ? 'kod yaz, Enter ile ekle · kayıtlı kod yok' : 'kod yaz, Enter ile ekle'
                  }
                  aria-label="Yeni barkod"
                  title={problem ?? 'Ambalajın üstündeki kod. Koli barkodu buradan yazılmaz: kolinin kaç paket saydığını mal kabul sorar.'}
                />
              </TagBox>
              {/* Hata kutunun altında: çiplerin arasında dursa sorun bir çipteymiş gibi okunurdu. */}
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

/** Kod çipi — kayıtlı ve bekleyen kod aynı gövdeyi paylaşır, ayrım yalnız renkte. */
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
  const tone = pending ? 'border-ops-violet-line bg-ops-violet-bg text-ops-violet' : 'border-ops-line bg-ops-subtle text-ops-strong';
  const badgeTone = pending ? 'bg-ops-violet-line' : 'bg-ops-line text-ops-body';
  return (
    <span className={`inline-flex items-center gap-[7px] rounded-[6px] border px-1.5 py-[3px] ${tone}`} title={title}>
      <span className={`rounded-[4px] px-[5px] py-px font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] ${badgeTone}`}>
        {kind === 'case' ? `koli ×${qtyPerCode}` : 'birim'}
      </span>
      <span className="font-ops-mono text-ops-sm font-medium">{code}</span>
      <button
        type="button"
        onClick={onRemove}
        className="cursor-pointer font-ops-body text-ops-sm opacity-60 hover:text-ops-red hover:opacity-100"
        aria-label={`${code} kodunu kaldır`}
        title={removeTitle}
      >
        ✕
      </button>
    </span>
  );
}

/** Varyant satırının alt şeridi — etiket sabit sütunda, içerik tek sıra akar. */
function SubRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] items-start gap-x-3.5">
      {/* Etiket kutunun değil kutu başlığının hizasında: alanlar iki satırlı. */}
      <span className="pt-[19px] font-ops-display text-ops-micro font-semibold uppercase tracking-[0.09em] text-ops-muted">{label}</span>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}

/** Net miktar — sayı ve birimi tek kutuda; birim fiyatın tabanı da buradan seçilir (g → €/kg, ml → €/L). */
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

/** Sayı hücresi — boş değer `null`dur (bilinmiyor / eşik yok), sıfır değil. */
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
  /** Çerçevesiz hâl — kenarlığı saran `JoinedField` çizer. */
  bare?: boolean;
  /** Dar kutular için; tablo hücresinde verilmez, genişliği ızgara yönetir. */
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
      // Genişlik verildiyse kabuğun `w-full`'ü çizilmez, yoksa kutu satırı kaplayıp komşularını iterdi.
      fullWidth={className ? false : undefined}
      title={title}
    />
  );
}

/** Porsiyon türü seçenekleri — boş değer "tek parça / dökme" demektir. */
const PORTION_OPTIONS = [
  { value: '', label: '—' },
  { value: 'item', label: 'adet' },
  { value: 'slice', label: 'dilim' },
  { value: 'package', label: 'paket' },
];

/**
 * İçindeki — kaç parça ve neyin kaçı tek kutuda. Vitrin türü ayırt etmek zorunda: "12 adet
 * cheesecake" 12 pasta, "12 dilim" tek pasta demektir.
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

const DIMENSIONS = ['packedLengthMm', 'packedWidthMm', 'packedHeightMm'] as const;

/**
 * Ambalaj şeridi — kargonun girdisi: brüt ağırlık ve kutunun dış ölçüsü. Tabloya kolon olarak
 * girmez, sekiz kolonun yanında her girdi okunmaz daralırdı.
 */
function PackingRow({ control, index }: { control: Control<ProductFormValues>; index: number }) {
  const dims = useWatch({ control, name: DIMENSIONS.map((name) => `variants.${index}.${name}` as const) });
  const dimsEmpty = dims.every((v) => v === null || v === undefined);

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

      {/* Üç ölçü tek kutuda: biri boş bir kutu hacim vermez, üçü birlikte doldurulur. */}
      <span className="flex flex-col gap-1">
        <span className="font-ops-body text-ops-micro text-ops-muted">ölçü · en × boy × yükseklik</span>
        <JoinedField className={`w-[230px] px-[9px] ${dimsEmpty ? 'border-dashed' : ''}`}>
          {DIMENSIONS.map((name, n) => (
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

      {dimsEmpty ? (
        <span className="mb-px rounded-md border border-ops-amber-line bg-ops-amber-bg px-2.5 py-1.5 font-ops-body text-ops-micro font-medium text-ops-amber-dark">
          Ölçü boş — bu varyant için canlı kargo teklifi alınamaz.
        </span>
      ) : (
        <span className="max-w-[320px] pb-2 font-ops-body text-ops-micro leading-normal text-ops-muted">
          Kargonun girdisi: brüt ağırlık ürünün kendi paketiyle birlikte ağırlığıdır, net ağırlık beyanda durur.
        </span>
      )}
    </SubRow>
  );
}

interface VariantEditorProps {
  control: Control<ProductFormValues>;
}

export function VariantEditor({ control }: VariantEditorProps) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'variants' });
  const [lang, setLang] = useState<Locale>('tr');
  // Silme onayı RHF anahtarıyla tutulur: indeks, satır eklenince ya da sıra değişince kayar.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // `fields` yalnız dizi yapısı değişince yenilenir; sıralamada canlı değer kullanılmazsa son yazılan geri alınırdı.
  const rows = useWatch({ control, name: 'variants' }) ?? [];

  // Barkodlar form durumu değil, mal kabulde öğretilen ayrı kayıtlar: editör onları kendisi okur.
  // Silme onaysız, çünkü kaybolan bir eşlemedir ve bir sonraki kabulde yeniden öğretilir.
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
      if (data === null) return; // okunamadıysa boş liste "kod yok" diye yalan söylerdi
      const next = new Map<string, VariantBarcode[]>();
      for (const code of data) next.set(code.variantId, [...(next.get(code.variantId) ?? []), code]);
      setBarcodes(next);
    });
  }, [savedIdsKey]);

  const unlearnCode = (code: VariantBarcode) => {
    void deleteVariantBarcodeAction(code.id).then(({ error }) => {
      if (error !== null) return; // çip yerinde kalır; düşürmek eşlemeyi silinmiş gösterirdi
      setBarcodes((current) => {
        const next = new Map(current);
        next.set(code.variantId, (next.get(code.variantId) ?? []).filter((row) => row.id !== code.id));
        return next;
      });
    });
  };

  // Eksik-dil noktası yalnız etiketi olan satırlara bakar: tek boylu ürünün etiketi hiç olmayabilir.
  const named = rows.map((r) => r?.label).filter((l): l is LocalizedText => Boolean(l && resolveLocalizedText(l)));
  const filled = LOCALES.reduce<Partial<Record<Locale, boolean>>>((acc, l) => {
    acc[l] = named.length === 0 || named.every((t) => Boolean(t[l]?.trim()));
    return acc;
  }, {});

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-ops-display text-ops-xs font-semibold uppercase tracking-[0.1em] text-ops-muted">Varyantlar</span>
        <button
          type="button"
          onClick={() => append({ label: {}, netQuantity: null, netUnit: 'g', piecesCount: null, portionKind: null, packedWeightG: null, packedLengthMm: null, packedWidthMm: null, packedHeightMm: null, minStockQty: null, sku: null, isActive: true })}
          className="cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark"
        >
          + varyant
        </button>
      </div>

      <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
        {/* Dil sekmesi tablonun içinde: yalnız etiket kolonunu yönetir, form geneli bir kip değildir. */}
        <div className="border-b border-ops-line bg-ops-subtle px-3.5">
          <LocaleTabs value={lang} onChange={setLang} filled={filled} />
        </div>

        <div
          className={`${CELL} border-b border-ops-line bg-ops-subtle px-3.5 py-[9px] font-ops-display text-ops-micro font-medium uppercase tracking-[0.09em] text-ops-muted`}
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
          // dnd yeni sırayı verir; canlı değerler o sıraya dizilir. `move` ile indeks aritmetiği yukarı taşımada yanılır.
          onReorder={(orderedIds) => {
            const byKey = new Map(fields.map((f, i) => [f.id, rows[i]]));
            const next = orderedIds.map((id) => byKey.get(id)).filter((v): v is (typeof rows)[number] => Boolean(v));
            if (next.length === rows.length) replace(next);
          }}
          renderItem={(f, handle) => {
            const i = fields.findIndex((x) => x.id === f.id);
            // Kayıtlı satır = uuid'i olan; RHF `fields` öğesinin `id`'si kendi anahtarıdır, canlı değerden okunur.
            const saved = Boolean(rows[i]?.id);
            const active = rows[i]?.isActive !== false;
            const confirming = confirmKey === f.id;
            const rowCodes = saved ? (barcodes.get(rows[i]!.id!) ?? []) : [];
            return (
              <div className="border-b border-ops-line last:border-b-0">
                <div className={`${CELL} px-3.5 py-[11px]`}>
                  {handle}
                  {/* Pasif satırın değerleri soluk yazılır; `contents` ızgara hücrelerini bozmaz. */}
                  <div className={active ? 'contents' : 'contents [&_button]:text-ops-muted [&_input]:text-ops-body'}>
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
                            // Yalnız seçili dilin anahtarı yazılır, öteki diller korunur.
                            onChange={(v) => field.onChange({ ...text, [lang]: v })}
                            onBlur={field.onBlur}
                            placeholder="ör. 500 g"
                            // TR kaynak dildir, kendisini çevirmez. Varyant etiketi bir ürün adıdır: alan türü `ad`.
                            onTranslate={
                              lang !== 'tr'
                                ? async () => {
                                    const suggestion = await suggestTranslationAction(text, 'ad');
                                    field.onChange({ ...text, [lang]: suggestion[lang] ?? text[lang] });
                                  }
                                : undefined
                            }
                            translateDisabled={!source}
                            translateTitle={source ? `Türkçeden çevir: “${source}”` : 'Çeviri için önce TR etiketini girin'}
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
                    <NetQuantityCell control={control} index={i} />
                    <ContentsCell control={control} index={i} />
                  </div>
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
                  {/* Kayıtlı satırın silinmesi iki adım: fiyat satırları da gider. Yeni satırda kaybedilecek bir şey yok. */}
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
                {/* İki şerit ortak zeminde: satırla birlikte tek varyant bloğu okunur. */}
                <div className="flex flex-col gap-[13px] border-t border-ops-line-soft bg-ops-subtle pt-[13px] pr-3.5 pb-3.5 pl-9">
                  <PackingRow control={control} index={i} />
                  <BarcodeCell control={control} index={i} saved={rowCodes} onUnlearn={unlearnCode} />
                </div>
              </div>
            );
          }}
        />
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
        Sıra, müşterinin gördüğü boy sırasıdır — satırları tutamaktan sürükleyerek değiştirin. Min. stok altına düşünce
        uyarı çıkacak eşiktir; boş bırakılırsa uyarı üretilmez.
      </span>
    </section>
  );
}
