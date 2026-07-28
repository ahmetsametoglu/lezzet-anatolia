'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { rebalanceAllocations } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { amount as money } from '@/components/operation/ui/format';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { TrashIcon } from '@/components/operation/ui/icons';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import type { VariantOption } from '../../products-types';
import { bundlePricing } from './bundle-pricing';
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

// Sütunlar: tutamak · ad · adet · birim fiyat · atanmış · satır · sil. Girdi sütunları kutunun
// genişliğine göre ölçülür; başlıklar da o kutunun üstünde ORTALANIR (metnin değil, kutunun üstünde),
// okuma sırası "başlık → kutu" olsun. Salt-okunur sayı sütunları SAĞA yaslı: rakamlar alt alta hizalı
// okunur, virgüller aynı sütunda durur.
const CELL = 'grid grid-cols-[18px_minmax(0,1fr)_72px_92px_104px_92px_26px] items-center gap-x-3';


/**
 * Şeridin ölçü birimi: soluk etiket + mono değer. Etiket ve değer aynı boyutta ve bitişik yazılınca
 * satır bir sayı yığınına dönüşüyor ve hiçbiri okunmuyordu; ayrım boyut ve renkle kuruluyor.
 */
function Metric({ label, title, alert, children }: { label: string; title?: string; alert?: boolean; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="font-ops-body text-ops-xs text-ops-muted">{label}</span>
      <span className={`font-ops-mono text-ops-sm ${alert ? 'font-semibold text-ops-amber' : 'text-ops-body'}`}>{children}</span>
    </span>
  );
}

/** Ölçüler arası ayraç — boşluk tek başına yetmiyor, göz nerede bittiğini bilemiyor. */
const Separator = () => <span className="text-ops-line-strong">·</span>;

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

  // Hesabın TEK yeri `bundlePricing`: fiyat alanının yanındaki indirim yüzdesi de aynı fonksiyondan
  // okuyor. İki yerde hesaplansaydı yuvarlama farkı ikisini çelişkiye düşürürdü.
  const pricing = bundlePricing(
    rows.map((r) => ({ variantId: r?.variantId ?? '', qty: r?.qty ?? 0, allocatedUnitPrice: r?.allocatedUnitPrice ?? 0 })),
    byId,
    totalPrice,
  );
  const { balance, economics } = pricing;

  // Şerit henüz bir şey İDDİA ETMİYOR: kalem yokken ya da paket fiyatı girilmemişken "0 = 0" hesabı
  // teknik olarak tutar, ama "toplam tutar" demek kurulumu bitmiş göstermek olurdu.
  const pending = fields.length === 0 || toCents(totalPrice) <= 0;

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

  const hasManual = rows.some((r) => manualIds.has(r?.variantId ?? ''));

  /** Tüm elle girilenleri bırakır ve payları yeniden hesaplar — tutmayan toplamın tek gerçek çaresi. */
  const releaseAllManual = () => {
    setManualIds(new Set());
    allocate(new Set());
  };

  return (
    <section className="flex flex-col gap-[11px]">
      <div className="flex items-center justify-between border-b border-ops-line-soft pb-[7px]">
        <span className="font-ops-display text-ops-xs font-semibold uppercase tracking-[0.1em] text-ops-muted">Paket kalemleri</span>
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

      <div className="overflow-hidden rounded-ops-card border border-ops-line">
        <div className={`${CELL} border-b border-ops-line bg-ops-subtle px-[13px] py-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted`}>
          <span />
          <span>Ürün · boy</span>
          <span className="text-center">Adet</span>
          <span className="text-right" title="Kalemin tek başına satıldığı fiyat (KDV dahil) — paket indirimi bunun üstünden. Alış fiyatı DEĞİL.">
            Birim fiyat
          </span>
          <span className="text-center" title="Müşteriye GÖRÜNMEZ — faturada kalemin KDV'si bu fiyattan işlenir">
            Atanmış (€)
          </span>
          <span className="text-right">Satır</span>
          <span />
        </div>

        {fields.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-8 text-center font-ops-body text-ops-sm text-ops-faint">
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
                    <span className="truncate font-ops-body text-ops-sm text-ops-ink">{labelOf(variantId)}</span>
                    {/* Pakette duran kalemin ürünü pasif/aday olabilir — bu SÖYLENİR: paket satıştaysa
                        içindekinin satışta olmaması gerçek bir çelişki, sessiz kalmak yanlış olurdu. */}
                    {option?.blockedReason ? (
                      <span
                        className="shrink-0 rounded bg-ops-amber-bg px-1.5 py-px font-ops-display text-ops-micro font-semibold uppercase tracking-[0.04em] text-ops-amber"
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
                        className="text-center"
                        value={field.value ?? 1}
                        onChange={(e) => field.onChange(Math.max(1, Number(e.target.value) || 1))}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                  <span
                    className="text-right font-ops-mono text-ops-xs text-ops-muted"
                    title={option?.listPrice == null ? 'Bu varyanta birim fiyat (b2c liste) girilmemiş' : undefined}
                  >
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
                        className="text-right"
                        // Hediye kalem ayrı bir işaret taşımaz: fiyatın kendisi söyler.
                        title={field.value === 0 ? 'Hediye kalem — faturada 0 € satır, stoktan normal düşer' : undefined}
                      />
                    )}
                  />
                  <span className="justify-self-end text-right font-ops-mono text-ops-sm text-ops-body">
                    {money(lineCents)}
                    {manual ? (
                      <button
                        type="button"
                        onClick={() => releaseManual(variantId)}
                        className="ml-1 cursor-pointer font-ops-display text-ops-micro font-semibold uppercase text-ops-amber hover:underline"
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

        {/* ŞERİT — her satır AYRI bir soruyu cevaplar: (1) anlaşma ne, (2) bize ne kalıyor,
            (3) varsa sorun ve TEK çaresi. Önceki hâlde altı sayı ve iki eylem tek kutuda yan yanaydı;
            hiçbiri öbüründen önemli görünmüyordu, o yüzden hepsi birden karmaşık görünüyordu.
            Zemin NÖTR: mutabakatın tutması olağan hâldir, kutlanacak bir şey değil — renk yalnız
            dikkat gerektiğinde girer. */}
        <div
          className={[
            'flex flex-col gap-1 border-t px-[13px] py-2.5',
            pending || balance.balanced ? 'border-ops-line bg-ops-subtle' : 'border-ops-amber-line bg-ops-amber-bg',
          ].join(' ')}
        >
          {pending ? (
            <span className="font-ops-body text-ops-sm text-ops-muted">
              {fields.length === 0
                ? 'Kalem eklendikçe karşılaştırma ve marj burada hesaplanır.'
                : 'Paket fiyatını girin — paylar tek fiyatlara oransal dağıtılacak.'}
            </span>
          ) : (
            <>
              {/* 1 — ANLAŞMA: soldan sağa okunan tek cümle. */}
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <Metric label="Ayrı ayrı alınsa">
                  {pricing.listTotalCents == null ? '—' : `${money(pricing.listTotalCents)} €`}
                </Metric>
                <span className="px-0.5 text-ops-faint">→</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-ops-body text-ops-xs text-ops-muted">Paket</span>
                  <span className="font-ops-mono text-ops-base font-semibold text-ops-ink">{money(toCents(totalPrice))} €</span>
                </span>
                {pricing.discountCents == null ? (
                  <span className="text-ops-xs text-ops-amber">
                    {pricing.missingListPrice} kalemin tek fiyatı yok — karşılaştırma yapılamıyor
                  </span>
                ) : pricing.discountCents > 0 ? (
                  <span className="rounded bg-ops-olive-bg px-1.5 py-px font-ops-mono text-ops-xs font-semibold text-ops-olive-dark">
                    {money(pricing.discountCents)} € indirim
                  </span>
                ) : pricing.discountCents === 0 ? (
                  <span className="text-ops-xs text-ops-muted">indirim yok</span>
                ) : (
                  <span className="rounded bg-ops-amber-bg px-1.5 py-px font-ops-mono text-ops-xs font-semibold text-ops-amber">
                    {money(-pricing.discountCents)} € pahalı
                  </span>
                )}
              </div>

              {/* 2 — BİZE NE KALIYOR: kâr KDV hariç satıştan hesaplanır (maliyet KDV'siz bir tutar).
                  Üç ölçü etiket+değer çifti olarak ve ARALARINDA ayraçla durur; bitişik yazıldıklarında
                  "Marj %415,7" gibi bir dizi tek bir sayı yığınına dönüşüp okunmuyordu. */}
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {economics.costCents == null ? (
                  <span className="font-ops-body text-ops-xs text-ops-muted">
                    {economics.unknownCostLines} kalemin maliyeti bilinmiyor — marj hesaplanamıyor
                  </span>
                ) : (
                  <>
                    <Metric label="Maliyet" title="Eldeki partilerin ağırlıklı ortalama alış fiyatı (KDV hariç)">
                      {money(economics.costCents)} €
                    </Metric>
                    <Separator />
                    <Metric label="Kâr" title="KDV hariç satıştan maliyet düşülerek" alert={(economics.profitCents ?? 0) < 0}>
                      {money(economics.profitCents ?? 0)} €
                    </Metric>
                    <Separator />
                    <Metric label="Marj" title="Maliyet üzerine markup (DOMAIN tanımı)" alert={(economics.marginPercent ?? 0) < 0}>
                      %{(economics.marginPercent ?? 0).toFixed(1).replace('.', ',')}
                    </Metric>
                  </>
                )}
                {pricing.belowTargetLines > 0 ? (
                  <>
                    <Separator />
                    <span
                      className="font-ops-body text-ops-xs text-ops-amber"
                      title="Paketler marjı böyle sessizce yer: toplam tutsa da tek bir kalemin payı kendi hedefinin altına itilmiş olabilir"
                    >
                      {pricing.belowTargetLines} kalemin payı hedef marjının altında
                    </span>
                  </>
                ) : null}
              </div>

              {/* 3 — SORUN: yalnız tutmadığında görünür ve TEK çare sunar. Duruma göre farklı çare:
                  elle girilen satır varsa onları bırakmak yeter; hiç yoksa fark adetlerden doğan
                  kalan kuruştur ve dağıtımı tekrarlamak aynı sonucu verir — tek çıkış fiyatı çekmek. */}
              {balance.balanced ? null : (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-md bg-ops-amber px-2 py-0.5 font-ops-display text-ops-micro font-semibold text-ops-card">
                    Paylar tutmuyor · {money(Math.abs(balance.diffCents))} € {balance.diffCents > 0 ? 'fazla' : 'eksik'}
                  </span>
                  {hasManual ? (
                    <button
                      type="button"
                      onClick={releaseAllManual}
                      className="cursor-pointer font-ops-body text-ops-xs text-ops-body underline decoration-dotted hover:text-ops-ink"
                    >
                      elle girilenleri bırak, otomatik dağıt
                    </button>
                  ) : pricing.missingListPrice > 0 ? (
                    <span className="font-ops-body text-ops-xs text-ops-muted">payları elle girin (tek fiyatı olmayan kalem var)</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setValue('totalPrice', fromCents(balance.allocatedTotalCents), { shouldValidate: true, shouldDirty: true })
                      }
                      className="cursor-pointer font-ops-body text-ops-xs text-ops-body underline decoration-dotted hover:text-ops-ink"
                    >
                      paket fiyatını {money(balance.allocatedTotalCents)} € yap
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
        Paylar kalemlerin tek fiyatlarına oransal dağıtılır — sen yalnız paket fiyatını (ya da indirim yüzdesini)
        girersin. Bir paya elle yazarsan o satır korunur (“elle” işareti); geri bırakmak için işarete tıkla. Atanmış
        fiyatlar <strong className="font-semibold">müşteriye görünmez</strong>: faturada her kalemin KDV'sini kendi
        oranından hesaplamak ve paketin marjını görmek için tutulur. 0 yazılan kalem hediyedir — faturada 0 € satır
        olur, stoktan normal düşer, maliyeti marja yansır.
      </span>
    </section>
  );
}
