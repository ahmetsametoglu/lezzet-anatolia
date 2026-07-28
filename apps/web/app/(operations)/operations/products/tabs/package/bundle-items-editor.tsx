'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { bundleBalance, rebalanceAllocations } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { TrashIcon } from '@/components/operation/ui/icons';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import type { VariantOption } from '../../products-types';
import type { BundleFormValues } from './bundle-form-schema';

// Paket kalemleri — pakete giren birimler, adetleri ve ATANMIŞ birim fiyatları. Atanmış fiyat müşteriye
// GÖRÜNMEZ: faturada her kalemin KDV'si kendi ürününün oranından işlensin diye tutulur (baklava %5,5,
// malzeme %20). Formun sözleşmesi: Σ(atanmış × adet) = paket fiyatı.
//
// PAYLAR TÜRETİLİR, GİRİLMEZ. Operatörden iki kez fiyat istemek (her kalem + paket) memurluktu ve
// hangi rakamın üstünden indirim verdiği ekranda hiç yoktu. Artık tek sayı giriliyor — paket fiyatı —
// ve paylar LİSTE FİYATLARINA oransal dağıtılıyor: pahalı kalem indirimin çoğunu taşır. Elle giriş
// kaçış kapısı olarak kalır (hediye kalem, bir kalemin payını bilerek kaydırmak); elle girilen satır
// işaretlenir ve sonraki dağıtımlarda KORUNUR.
//
// Kalem eklemek AYRI bir seçici değil: `MultiSelect` `hideSelected` kipiyle "aramalı ekleme" veriyor
// (koleksiyon üyeliğinin aynı deseni). Zaten eklenmiş varyant menüde ÇIKMAZ → DB'deki
// `unique(bundle_id, variant_id)` kuralı arayüzde de görünür, operatör reddedilecek bir şey denemez.

const CELL = 'grid grid-cols-[18px_minmax(0,1fr)_52px_74px_82px_78px_24px] items-center gap-x-2';

const money = (cents: number) => fromCents(cents).toFixed(2).replace('.', ',');

/** Satır şekli — `replace()` her yazımda tam satır ister (RHF alanı kısmen güncellenemez). */
interface ItemRow {
  id?: string;
  variantId: string;
  qty: number;
  allocatedUnitPrice: number;
}

interface BundleItemsEditorProps {
  control: Control<BundleFormValues>;
  /** Katalogdaki TÜM birimler: adlandırma hepsinden, ekleme menüsü yalnız `addable` olanlardan. */
  pool: VariantOption[];
  /**
   * Alan yazımı — dağıtım payları TEK TEK yazar, diziyi baştan kurmaz. `replace()` alanların
   * kimliklerini yeniler, yani satır yeniden mount olur ve o an ADET hücresine yazan operatörün odağı
   * uçar ("2" yazıp "20" yapamaz). Yapısal değişimde (ekle/çıkar/sırala) `replace` yine doğru araç.
   */
  setValue: UseFormSetValue<BundleFormValues>;
}

export function BundleItemsEditor({ control, pool, setValue }: BundleItemsEditorProps) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' });
  // Canlı değerler: mutabakat her tuş vuruşunda yeniden hesaplanmalı; `fields` yalnız dizi yapısı
  // değişince yenilenir ve yazılanı geride bırakır.
  const rows = useWatch({ control, name: 'items' }) ?? [];
  const totalPrice = useWatch({ control, name: 'totalPrice' }) ?? 0;

  const byId = useMemo(() => new Map(pool.map((p) => [p.variantId, p])), [pool]);
  // Havuzda bulunmayan kimlik "silinmiş" DEĞİLDİR: `bundle_item.variant_id` FK'si `restrict`, pakette
  // duran varyant silinemez. Buraya düşmenin tek yolu havuz tavanının (500) aşılması — o gün seçici
  // sunucu aramasına döner. Metin bu yüzden bir iddia değil, okunamadığını söylüyor.
  const labelOf = (variantId: string) => byId.get(variantId)?.label ?? '— (birim okunamadı)';

  /** Elle girilen paylar — kimliğe göre. Otomatik dağıtım bunlara DOKUNMAZ. */
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());

  const lines = rows.map((r) => ({ qty: r?.qty ?? 0, allocatedUnitPriceCents: toCents(r?.allocatedUnitPrice ?? 0) }));
  const balance = bundleBalance(lines, toCents(totalPrice));

  // Şerit henüz bir şey İDDİA ETMİYOR: kalem yokken ya da paket fiyatı girilmemişken "0 = 0" hesabı
  // teknik olarak tutar, ama yeşil yanıp "toplam tutar" demek kurulumu bitmiş göstermek olurdu.
  const pending = fields.length === 0 || toCents(totalPrice) <= 0;

  // ── Liste fiyatı ve indirim ───────────────────────────────────────────────────────────────────
  const missingPrice = rows.filter((r) => byId.get(r?.variantId ?? '')?.listPrice == null).length;
  const listTotalCents = rows.reduce((sum, r) => {
    const listPrice = byId.get(r?.variantId ?? '')?.listPrice;
    return sum + (listPrice == null ? 0 : toCents(listPrice) * (r?.qty ?? 0));
  }, 0);
  const discountCents = listTotalCents - toCents(totalPrice);
  const discountPercent = listTotalCents > 0 ? (discountCents / listTotalCents) * 100 : 0;

  // ── Otomatik dağıtım ──────────────────────────────────────────────────────────────────────────
  /**
   * Payları liste fiyatlarına oransal dağıtır; elle girilen satırlar korunur ve hedeften düşülür.
   * Motor `rebalanceAllocations` — ağırlık olarak liste fiyatını verince "hedefi liste oranında böl"
   * demek oluyor, ayrıca kalan kuruşu adedi 1 olan kaleme emdiriyor.
   */
  const allocate = (manual: Set<string> = manualIds) => {
    const current: ItemRow[] = rows.map((r) => ({
      id: r?.id,
      variantId: r?.variantId ?? '',
      qty: r?.qty ?? 1,
      allocatedUnitPrice: r?.allocatedUnitPrice ?? 0,
    }));
    if (current.length === 0) return;

    const autoIdx = current.map((r, i) => (manual.has(r.variantId) ? -1 : i)).filter((i) => i >= 0);
    if (autoIdx.length === 0) return; // hepsi elle — dağıtacak pay yok

    // Liste fiyatı eksik olan otomatik satır varsa DAĞITMA: eksik fiyatı 0 ağırlık saymak o kalemi
    // sessizce hediyeye çevirirdi. Şerit eksikliği söyler, paylar elle girilir.
    if (autoIdx.some((i) => byId.get(current[i]?.variantId ?? '')?.listPrice == null)) return;

    const manualTotal = current.reduce(
      (sum, r) => sum + (manual.has(r.variantId) ? toCents(r.allocatedUnitPrice) * r.qty : 0),
      0,
    );
    const target = toCents(totalPrice) - manualTotal;
    if (target < 0) return; // elle girilenler paket fiyatını aşmış: şerit "fazla" der, karar operatörde

    const result = rebalanceAllocations(
      autoIdx.map((i) => ({
        qty: current[i]?.qty ?? 1,
        allocatedUnitPriceCents: toCents(byId.get(current[i]?.variantId ?? '')?.listPrice ?? 0),
      })),
      target,
    );

    autoIdx.forEach((rowIndex, k) => {
      setValue(`items.${rowIndex}.allocatedUnitPrice`, fromCents(result.unitPricesCents[k] ?? 0), {
        shouldValidate: true,
        shouldDirty: true,
      });
    });
  };

  // Dağıtım YAPISAL değişimde tetiklenir: kalem eklendi/çıktı, adet değişti, paket fiyatı değişti.
  // İmza payları İÇERMEZ — bu yüzden bir paya elle yazmak öbür satırları oynatmaz (yazarken zıplayan
  // hücre kadar güveni kıran az şey var) ve `replace` kendi kendini tetikleyip döngü kurmaz.
  const signature = `${rows.map((r) => `${r?.variantId}:${r?.qty}`).join('|')}@${totalPrice}`;
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    // İlk yükleme kayıtlı payları OLDUĞU GİBİ bırakır: formu açmak veriyi değiştirmemeli.
    if (lastSignature.current === null || lastSignature.current === signature) {
      lastSignature.current = signature;
      return;
    }
    lastSignature.current = signature;
    allocate();
    // Bağımlılık YALNIZ imza — `allocate` her render'da yeni bir kapanış ama onu buraya koymak
    // etkiyi her render'da koşturur (yazarken sonsuz yeniden dağıtım). İmza değişmedikçe dağıtım yok.
  }, [signature]);

  const selected = rows.map((r) => r?.variantId ?? '').filter(Boolean);

  const onPick = (next: string[]) => {
    // Eklenen: sona yeni satır (payı dağıtım doldurur). Çıkarılan: satırı düşer.
    const added = next.filter((id) => !selected.includes(id));
    const removed = selected.filter((id) => !next.includes(id));
    if (removed.length > 0) {
      setManualIds((prev) => new Set([...prev].filter((id) => !removed.includes(id))));
      replace(
        rows
          .filter((r) => !removed.includes(r?.variantId ?? ''))
          .map((r) => ({ id: r?.id, variantId: r?.variantId ?? '', qty: r?.qty ?? 1, allocatedUnitPrice: r?.allocatedUnitPrice ?? 0 })),
      );
    }
    for (const variantId of added) append({ variantId, qty: 1, allocatedUnitPrice: 0 });
  };

  const releaseManual = (variantId: string) => {
    const next = new Set([...manualIds].filter((id) => id !== variantId));
    setManualIds(next);
    allocate(next);
  };

  const canRedistribute = rows.some((r) => !manualIds.has(r?.variantId ?? ''));

  return (
    <section className="flex flex-col gap-[11px]">
      <div className="flex items-center justify-between border-b border-ops-line-soft pb-[7px]">
        <span className="font-ops-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ops-muted">Paket kalemleri</span>
        <MultiSelect
          // Menüde yalnız EKLENEBİLİR olanlar: pasif/aday ürünü pakete yeni koymak istemezsin. Ama
          // pakette duran pasif kalem yine adıyla görünür (havuz onu da taşıyor).
          options={pool.filter((p) => p.addable).map((p) => ({ value: p.variantId, label: p.label, imageUrl: p.imageUrl }))}
          selected={selected}
          onChange={onPick}
          hideSelected
          addLabel="+ kalem"
          searchPlaceholder="Ürün ya da boy ara…"
        />
      </div>

      <div className="overflow-hidden rounded-[9px] border border-ops-line">
        <div className={`${CELL} border-b border-ops-line bg-ops-subtle px-[13px] py-2 font-ops-display text-[10px] font-medium uppercase tracking-[0.05em] text-ops-muted`}>
          <span />
          <span>Ürün · boy</span>
          <span>Adet</span>
          <span title="Ürünün kendi satış fiyatı (b2c, KDV dahil) — paket indirimi bunun üstünden">Liste</span>
          <span title="Müşteriye GÖRÜNMEZ — faturada kalemin KDV'si bu fiyattan işlenir">Atanmış (€)</span>
          <span className="text-right">Satır</span>
          <span />
        </div>

        {fields.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-8 text-center font-ops-body text-[12.5px] text-ops-faint">
            Henüz kalem yok — “+ kalem” ile ürün ve boy seçin.
          </div>
        ) : (
          <SortableList
            items={fields}
            getId={(f) => f.id}
            onReorder={(orderedIds) => {
              const byKey = new Map(fields.map((f, i) => [f.id, rows[i]]));
              const next = orderedIds
                .map((id) => byKey.get(id))
                .filter((r): r is (typeof rows)[number] => Boolean(r))
                .map((r) => ({ id: r?.id, variantId: r?.variantId ?? '', qty: r?.qty ?? 1, allocatedUnitPrice: r?.allocatedUnitPrice ?? 0 }));
              if (next.length === rows.length) replace(next);
            }}
            renderItem={(f, handle) => {
              const i = fields.findIndex((x) => x.id === f.id);
              const row = rows[i];
              const variantId = row?.variantId ?? '';
              const option = byId.get(variantId);
              const manual = manualIds.has(variantId);
              const lineCents = toCents(row?.allocatedUnitPrice ?? 0) * (row?.qty ?? 0);
              return (
                <div className={`${CELL} border-b border-ops-line-soft bg-ops-white px-[13px] py-2 last:border-b-0`}>
                  {handle}
                  <div className="flex min-w-0 items-center gap-2">
                    <Thumbnail src={option?.imageUrl ?? null} alt="" size={26} iconSize={11} className="!rounded-[5px]" />
                    <span className="truncate font-ops-body text-[12.5px] text-ops-ink">{labelOf(variantId)}</span>
                    {/* Pakette duran kalemin ürünü pasif/aday olabilir — bu SÖYLENİR: paket satıştaysa
                        içindekinin satışta olmaması gerçek bir çelişki, sessiz kalmak yanlış olurdu. */}
                    {option?.blockedReason ? (
                      <span
                        className="shrink-0 rounded bg-ops-amber-bg px-1.5 py-px font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.04em] text-ops-amber"
                        title="Paket satıştaysa bu kalem vitrinde tükenmiş görünür — ürünü satışa alın ya da kalemi değiştirin"
                      >
                        {option.blockedReason}
                      </span>
                    ) : null}
                  </div>
                  <Controller
                    control={control}
                    name={`items.${i}.qty`}
                    render={({ field }) => (
                      <Input
                        inputSize="sm"
                        mono
                        inputMode="numeric"
                        value={field.value ?? 1}
                        onChange={(e) => field.onChange(Math.max(1, Number(e.target.value) || 1))}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                  <span className="font-ops-mono text-[11.5px] text-ops-muted" title={option?.listPrice == null ? 'Bu varyanta liste fiyatı girilmemiş' : undefined}>
                    {option?.listPrice == null ? '—' : `${money(toCents(option.listPrice))}`}
                  </span>
                  <Controller
                    control={control}
                    name={`items.${i}.allocatedUnitPrice`}
                    render={({ field }) => (
                      <MoneyInput
                        value={field.value ?? 0}
                        onChange={(value) => {
                          // Boş bırakılan hücre 0'dır (hediye), null değil: şema sayı bekliyor.
                          field.onChange(value ?? 0);
                          // Elle yazılan pay artık dağıtımın dışında: operatörün kararı korunur.
                          if (variantId) setManualIds((prev) => new Set(prev).add(variantId));
                        }}
                        onBlur={field.onBlur}
                        ariaLabel="Atanmış birim fiyat"
                        // Hediye kalem ayrı bir işaret taşımaz: fiyatın kendisi söyler.
                        title={field.value === 0 ? 'Hediye kalem — faturada 0 € satır, stoktan normal düşer' : undefined}
                      />
                    )}
                  />
                  <span className="justify-self-end text-right font-ops-mono text-[12px] text-ops-body">
                    {money(lineCents)}
                    {manual ? (
                      <button
                        type="button"
                        onClick={() => releaseManual(variantId)}
                        className="ml-1 cursor-pointer font-ops-display text-[9.5px] font-semibold uppercase text-ops-amber hover:underline"
                        title="Payı elle girdiniz. Otomatik dağıtıma bırakmak için tıklayın."
                      >
                        elle
                      </button>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      remove(i);
                      if (variantId) releaseManual(variantId);
                    }}
                    className="cursor-pointer justify-self-center text-ops-faint hover:text-ops-red"
                    aria-label="Kalemi çıkar"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            }}
          />
        )}

        {/* FİYAT ŞERİDİ — üç sayı bir arada: neyin üstünden, ne kadara, ne indirimle. Eskiden yalnız
            "atanmış toplam" ve bir fark yazıyordu; karşılaştırılan sayı (paket fiyatı) başka bir
            bölümde durduğu için cümle keyfi görünüyordu. */}
        <div
          className={[
            'flex flex-col gap-1.5 border-t px-[13px] py-2.5',
            pending
              ? 'border-ops-line bg-ops-subtle'
              : balance.balanced
                ? 'border-ops-olive-line bg-ops-olive-bg'
                : 'border-ops-amber-line bg-ops-amber-bg',
          ].join(' ')}
        >
          {pending ? (
            <span className="font-ops-body text-[12px] text-ops-muted">
              {fields.length === 0
                ? 'Kalem eklendikçe liste toplamı ve indirim burada hesaplanır.'
                : 'Paket fiyatını girin — paylar liste fiyatlarına oransal dağıtılacak.'}
            </span>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-ops-body text-[12px]">
                <span className="text-ops-muted">
                  Liste toplamı{' '}
                  <span className="font-ops-mono text-[12.5px] font-medium text-ops-ink">
                    {missingPrice > 0 ? '—' : `${money(listTotalCents)} €`}
                  </span>
                </span>
                <span className="text-ops-muted">
                  Paket fiyatı <span className="font-ops-mono text-[12.5px] font-medium text-ops-ink">{money(toCents(totalPrice))} €</span>
                </span>
                {missingPrice > 0 ? (
                  <span className="text-ops-amber">
                    {missingPrice} kalemin liste fiyatı yok — indirim hesaplanamıyor, paylar elle girilmeli
                  </span>
                ) : discountCents > 0 ? (
                  <span className="text-ops-olive-dark">
                    İndirim{' '}
                    <span className="font-ops-mono font-medium">
                      {money(discountCents)} € (%{discountPercent.toFixed(1).replace('.', ',')})
                    </span>
                  </span>
                ) : discountCents === 0 ? (
                  <span className="text-ops-muted">İndirim yok — kalemler ayrı ayrı alınsa aynı tutar</span>
                ) : (
                  <span className="text-ops-amber">
                    Liste toplamının <span className="font-ops-mono font-medium">{money(-discountCents)} €</span> ÜSTÜNDE
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-ops-body text-[11.5px] text-ops-muted">
                  Atanmış toplam <span className="font-ops-mono text-[12px] text-ops-body">{money(balance.allocatedTotalCents)} €</span>
                </span>
                <span
                  className={[
                    'rounded-md px-2 py-0.5 font-ops-display text-[10.5px] font-semibold',
                    balance.balanced ? 'bg-ops-olive text-ops-card' : 'bg-ops-amber text-ops-card',
                  ].join(' ')}
                >
                  {balance.balanced
                    ? 'Toplam tutar'
                    : `Toplam tutmuyor · ${money(Math.abs(balance.diffCents))} € ${balance.diffCents > 0 ? 'fazla' : 'eksik'}`}
                </span>
                {balance.balanced ? null : (
                  <span className="ml-auto flex items-center gap-2">
                    {/* İki ayrı çare, ikisi de bir şey YAPAR: payları yeniden dağıt (elle girilenler
                        korunur) ya da paket fiyatını ulaşılan toplama çek. İkincisi kalan kuruş
                        durumunda tek çıkış yoludur: adetler yüzünden hedef tutturulamıyorsa dağıtımı
                        tekrarlamak işe yaramaz. */}
                    {canRedistribute ? (
                      <button
                        type="button"
                        onClick={() => allocate()}
                        className="cursor-pointer rounded-ops-btn border border-ops-line-strong bg-ops-card px-3 py-1.5 font-ops-display text-[11.5px] font-semibold text-ops-strong hover:border-ops-olive"
                      >
                        Payları yeniden dağıt
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setValue('totalPrice', fromCents(balance.allocatedTotalCents), { shouldValidate: true, shouldDirty: true })
                      }
                      className="cursor-pointer font-ops-body text-[11.5px] text-ops-body underline decoration-dotted hover:text-ops-ink"
                    >
                      paket fiyatını {money(balance.allocatedTotalCents)} € yap
                    </button>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <span className="font-ops-body text-[11px] leading-[1.5] text-ops-muted">
        Paylar liste fiyatlarına oransal dağıtılır — sen yalnız paket fiyatını girersin. Bir paya elle yazarsan o satır
        korunur (“elle” işareti); geri bırakmak için işarete tıkla. Atanmış fiyatlar{' '}
        <strong className="font-semibold">müşteriye görünmez</strong>: faturada her kalemin KDV'sini kendi oranından
        hesaplamak için tutulur. 0 yazılan kalem hediyedir — faturada 0 € satır olur, stoktan normal düşer.
      </span>
    </section>
  );
}
