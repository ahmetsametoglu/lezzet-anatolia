'use client';

import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useWatch, type Control } from 'react-hook-form';
import { resolveLocalizedText, type LocalizedText, type VariantBarcode } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { Input } from '@/components/operation/form/input';
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

// Tutamak · Etiket (esner) · SKU · Net · Min · Aktif · sil
// "Adet" sütunu `Net (g)`in HEMEN YANINA girdi (arka-uc talebi 09.08) ve yerine değil: 72'lik bir
// kutu hem 72 adet hem 2500 g'dır, ikisi ayrı soruya cevap verir ("kaç kişilik" ↔ "ne kadar yer
// kaplar"). Genişliği 52px — başlığı kısa, değeri iki haneli.
const CELL = 'grid grid-cols-[18px_minmax(0,1fr)_104px_64px_52px_60px_38px_26px] items-center gap-x-2';

/** Sayı hücresi — Net (g) ve Min. stok aynı davranışı paylaşır (boş = bilinmiyor / eşik yok). */
function NumberCell({
  value,
  onChange,
  onBlur,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  onBlur: () => void;
}) {
  return (
    <Input
      inputSize="sm"
      mono
      inputMode="numeric"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      onBlur={onBlur}
      placeholder="—"
    />
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
          onClick={() => append({ label: {}, netWeightG: null, piecesCount: null, minStockQty: null, sku: null, isActive: true })}
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
          <span>Net (g)</span>
          <span title="Kutudaki parça sayısı — 12'li baklava kutusu → 12. Dökme üründe boş bırakın.">Adet</span>
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
                <Controller
                  control={control}
                  name={`variants.${i}.netWeightG`}
                  render={({ field }) => <NumberCell value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
                {/* Paket içi adet — BOŞ bırakılabilir ve boş `null` demektir: "adet bildirilmemiş"
                    (dökme ürün). Sıfır DEĞİL; sıfır "içinde hiç parça yok" derdi (`CLAUDE §1`).
                    `NumberCell` zaten boşu `null`a çeviriyor, o yüzden ayrı bir kural yok. */}
                <Controller
                  control={control}
                  name={`variants.${i}.piecesCount`}
                  render={({ field }) => <NumberCell value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
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
              {/* Barkodlar (23.3): mal kabulde ÖĞRETİLEN kodlar — yanlış öğretilenin geri alma
                  yeri burası. Kod eklenmez (öğrenme kabuldedir, karar §1.3); yalnız silinir. */}
              {rowCodes.length === 0 ? null : (
                <div className="flex flex-wrap items-center gap-1.5 px-[13px] pb-2 pl-[31px]">
                  <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-faint">
                    Barkod
                  </span>
                  {rowCodes.map((code) => (
                    <span
                      key={code.id}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-ops-line bg-ops-subtle px-1.5 py-0.5 font-ops-mono text-ops-micro text-ops-body"
                      title={code.createdBy ? 'Mal kabulde öğretilmiş kod' : 'Sistem kaydı'}
                    >
                      {code.code}
                      <span className="text-ops-faint">{code.kind === 'case' ? `koli ×${code.qtyPerCode}` : 'paket'}</span>
                      <button
                        type="button"
                        onClick={() => unlearnCode(code)}
                        className="cursor-pointer text-ops-faint hover:text-ops-red"
                        aria-label={`${code.code} kodunu sil`}
                        title="Eşlemeyi geri al — kod bir sonraki kabulde yeniden sorulur"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              </div>
            );
          }}
        />
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
        Sıra, müşterinin gördüğü boy sırasıdır — satırları tutamaktan sürükleyerek değiştirin. Min. stok, altına
        düşünce uyarı çıkacak eşiktir; boş bırakılırsa uyarı üretilmez.
      </span>
    </section>
  );
}
