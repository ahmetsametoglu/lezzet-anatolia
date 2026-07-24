'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/button';
import { Dialog } from '@/components/operation/dialog';
import { Chip } from '@/components/operation/chip';
import { Select } from '@/components/operation/select';
import { Toggle, ToggleField } from '@/components/operation/toggle';
import type { CategoryView, ProductView } from './products-types';

// Ürün oluştur/düzenle formu — Envanter O9 dialog. Düzenlemede seçili ürünün gerçek verisiyle dolar,
// oluşturmada boş şablon. Zorunlu: ad, kategori, KDV, tarih tipi. Fiyatın kendisi burada değil (kanala
// göre Fiyatlar ekranında çözülür); burada yalnız marj hedefi/otomatik davranış tanımlanır.
// NOT: kalıcılaştırma (server action) + alerjen (AB-14) modeli sonraki dilim — form şu an giriş iskeleti.

type Mode = 'create' | 'edit';

const SECTION = 'font-ops-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ops-muted';
const FIELD_LABEL = 'font-ops-body text-[11.5px] text-ops-body';
const INPUT =
  'rounded-[9px] border border-ops-line-strong bg-white px-[13px] py-[11px] font-ops-body text-[13.5px] text-ops-ink outline-none focus:border-ops-olive';

// İki-seçenekli segment (KDV, tarih tipi).
function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={[
              'flex-1 cursor-pointer rounded-ops-btn py-[11px] text-center font-ops-display text-[12.5px] font-semibold transition-colors',
              on ? 'bg-ops-olive text-white' : 'border border-ops-line-strong text-ops-strong hover:border-ops-olive',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface ProductFormDialogProps {
  mode: Mode;
  product: ProductView | null;
  categories: CategoryView[];
  onClose: () => void;
}

export function ProductFormDialog({ mode, product, categories, onClose }: ProductFormDialogProps) {
  const editing = mode === 'edit' && product !== null;

  const [name, setName] = useState(editing ? product.name : '');
  const [categoryId, setCategoryId] = useState(editing ? (product.categoryId ?? '') : '');
  const [vat, setVat] = useState<'5.5' | '20'>(editing && product.vatRate === 20 ? '20' : '5.5');
  const [dateType, setDateType] = useState<'DLC' | 'DDM'>(editing ? product.dateType : 'DLC');
  const [shelfLife, setShelfLife] = useState(editing && product.shelfLifeDays != null ? String(product.shelfLifeDays) : '');
  const [shippable, setShippable] = useState(editing ? product.shippable : true);
  const [active, setActive] = useState(editing ? product.status === 'active' : true);
  const [autoPrice, setAutoPrice] = useState(true);
  const [description, setDescription] = useState(editing ? product.descriptionText : '');
  const variants = editing ? product.variants : [];

  const footer = (
    <>
      <span className="mr-auto font-ops-body text-[11.5px] text-ops-muted">
        Zorunlu alanlar: ad, kategori, KDV, tarih tipi
      </span>
      <Button variant="secondary" onClick={onClose}>
        İptal
      </Button>
      <Button variant="primary" onClick={onClose}>
        Kaydet
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Ürün düzenle' : 'Yeni ürün'}
      subtitle={editing ? product.name : 'Zorunlu alanları doldurun; beyanlar sonradan tamamlanabilir'}
      footer={footer}
    >
      {/* Temel */}
      <section className="flex flex-col gap-[11px]">
        <span className={SECTION}>Temel</span>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            Ürün adı <span className="text-[#b0561f]">*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ürün adı girin…" className={INPUT} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>
              Kategori <span className="text-[#b0561f]">*</span>
            </span>
            <Select
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Kategori seç"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>
              KDV <span className="text-[#b0561f]">*</span>
            </span>
            <Segment
              value={vat}
              onChange={setVat}
              options={[
                { key: '5.5', label: '%5,5' },
                { key: '20', label: '%20' },
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>
              Son tarih tipi <span className="text-[#b0561f]">*</span>
            </span>
            <Segment
              value={dateType}
              onChange={setDateType}
              options={[
                { key: 'DLC', label: 'DLC · güvenlik' },
                { key: 'DDM', label: 'DDM · kalite' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Toplam raf ömrü (gün)</span>
            <input
              value={shelfLife}
              onChange={(e) => setShelfLife(e.target.value)}
              inputMode="numeric"
              placeholder="12"
              className={`${INPUT} font-ops-mono`}
            />
          </div>
        </div>
        <div className="flex gap-2.5">
          <ToggleField label="Kargo izni" on={shippable} onChange={setShippable} />
          <ToggleField label="Satışta (aktif)" on={active} onChange={setActive} />
        </div>
      </section>

      {/* Çok dilli içerik */}
      <section className="flex flex-col gap-[11px]">
        <div className="flex items-center justify-between">
          <span className={SECTION}>Çok dilli içerik</span>
          <span className="font-ops-body text-[11px] font-semibold text-ops-olive">✦ AI çeviri önerisi iste</span>
        </div>
        <div className="flex gap-1.5">
          <span className="border-b-2 border-ops-olive px-2.5 py-[5px] font-ops-display text-[12px] font-semibold text-ops-ink">TR</span>
          <span className="px-2.5 py-[5px] font-ops-display text-[12px] font-semibold text-ops-muted">
            FR <span className="text-ops-amber">öneri</span>
          </span>
          <span className="px-2.5 py-[5px] font-ops-display text-[12px] font-semibold text-ops-muted">
            DE <span className="text-ops-amber">öneri</span>
          </span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Ürün açıklaması (TR)…"
          className={`${INPUT} resize-none leading-[1.5]`}
        />
      </section>

      {/* Yasal beyan — alerjen (AB-14) modeli sonraki dilim; şimdilik görsel iskele */}
      <section className="flex flex-col gap-[11px]">
        <span className={SECTION}>Yasal beyan</span>
        <span className={FIELD_LABEL}>
          Alerjenler <span className="font-ops-body text-[11px] text-ops-faint">· AB 14 listesinden seçilir, serbest metin değil</span>
        </span>
        <div className="flex flex-wrap gap-[7px]">
          <Chip active tone="olive" className="!bg-ops-olive-bg !text-ops-olive-dark">
            Sert kabuklu yemişler ✕
          </Chip>
          <Chip active tone="olive" className="!bg-ops-olive-bg !text-ops-olive-dark">
            Gluten ✕
          </Chip>
          <Chip active tone="olive" className="!bg-ops-olive-bg !text-ops-olive-dark">
            Süt ✕
          </Chip>
          <Chip dashed>+ alerjen seç</Chip>
        </div>
      </section>

      {/* Varyantlar */}
      <section className="flex flex-col gap-[11px]">
        <div className="flex items-center justify-between">
          <span className={SECTION}>Varyantlar</span>
          <span className="font-ops-body text-[11px] font-semibold text-ops-olive">+ varyant</span>
        </div>
        <div className="overflow-hidden rounded-[9px] border border-ops-line">
          <div className="grid grid-cols-[1fr_90px_96px_60px] gap-x-2 border-b border-ops-line bg-ops-subtle px-[13px] py-2 font-ops-display text-[10px] font-medium uppercase tracking-[0.05em] text-ops-muted">
            <span>Etiket</span>
            <span>Net (g)</span>
            <span>SKU</span>
            <span className="text-right">Aktif</span>
          </div>
          {variants.length === 0 ? (
            <div className="px-[13px] py-3 font-ops-body text-[12px] text-ops-faint">Varyant yok — varsayılan varyant kaydedince oluşur.</div>
          ) : (
            variants.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[1fr_90px_96px_60px] items-center gap-x-2 border-b border-ops-line-soft px-[13px] py-2.5 font-ops-body text-[12.5px] last:border-b-0"
              >
                <span>{v.label}</span>
                <span className="font-ops-mono">{v.netWeightG ?? '—'}</span>
                <span className="font-ops-mono text-ops-muted">{v.sku ?? '—'}</span>
                <span className="justify-self-end">
                  <Toggle on={v.isActive} size="sm" />
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Fiyatlandırma tanımı */}
      <section className="flex flex-col gap-2.5">
        <span className={SECTION}>Fiyatlandırma tanımı</span>
        <div className="flex items-end gap-2.5">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className={FIELD_LABEL}>Hedef marj</span>
            <input defaultValue="%42" className={`${INPUT} font-ops-mono`} />
          </div>
          <ToggleField label="Otomatik fiyat" on={autoPrice} onChange={setAutoPrice} />

        </div>
        <span className="font-ops-body text-[11px] text-ops-muted">
          Fiyatın kendisi kanala/müşteriye göre Fiyatlar ekranında çözülür — burada yalnız marj hedefi ve otomatik davranış tanımlanır.
        </span>
      </section>
    </Dialog>
  );
}
