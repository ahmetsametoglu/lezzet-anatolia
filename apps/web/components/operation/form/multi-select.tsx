'use client';

import { useRef, useState } from 'react';
import { AnchoredMenu } from '../ui/anchored-menu';
import { useOptionSearch } from './use-option-search.hook';
import { Chip } from '../ui/chip';
import { Input } from './input';
import { SearchIcon } from '../ui/icons';
import { Thumbnail } from '../ui/thumbnail';

/**
 * Çoklu seçim (chip'li) + aranabilir açılır liste — Komponent Envanteri O8 (Select & combobox'ın çoklu
 * varyantı). Seçilenler kaldırılabilir çip, "+ ekle" dashed çipi autocomplete'li menü açar. Alerjen,
 * koleksiyon üyeliği gibi çoklu bağlar için paylaşılır (sayfaya özel değil). Dışarı tık / Escape kapar.
 * `imageUrl` VERİLEN seçeneklerde (ör. ürün) hem listede hem seçili çipte küçük görsel çıkar; alan hiç
 * verilmezse (ör. alerjen) görünüm değişmez — görsel opsiyonel bir yetenek.
 */
interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
  /** Verilirse küçük önizleme gösterilir; `null` → placeholder ikon (görseli olmayan kayıt). */
  imageUrl?: string | null;
}

interface MultiSelectProps<T extends string> {
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  addLabel?: string;
  searchPlaceholder?: string;
  /**
   * Seçilenleri çip olarak GÖSTERME — yalnız aramalı ekleme tetikleyicisi kalır. Seçim başka bir
   * biçimde sunulacağında kullanılır (ör. koleksiyon üyeleri: görselli, sürükle-sıralanır liste);
   * arama/menü mantığı burada tek yerde kalsın diye ayrı bir seçici yazılmaz.
   */
  hideSelected?: boolean;
  /**
   * Verilirse ASENKRON kip: terim (gecikmeli) buraya gelir, sonuçları çağıran `options`'a koyar.
   * Kaynak veriyle büyüyen bir kümeyse şart — katalogun tamamını forma indirmek, bir gün sessizce
   * eksik liste göstermek demektir (CLAUDE.md §1). Davranış `Combobox`'la ORTAK
   * (`useOptionSearch`): iki seçicinin arama hissi ayrışmasın.
   */
  onSearch?: (term: string) => void;
  loading?: boolean;
  /** Sonuç yokken gösterilecek cümle. */
  emptyText?: string;
}

export function MultiSelect<T extends string>({
  options,
  selected,
  onChange,
  addLabel = '+ ekle',
  searchPlaceholder = 'Ara…',
  hideSelected = false,
  onSearch,
  loading = false,
  emptyText = 'Sonuç yok',
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const { query, onQuery, reset, visible, remote } = useOptionSearch({
    options,
    onSearch,
    match: (o, q) => o.label.toLowerCase().includes(q),
  });

  const optionOf = (v: T) => options.find((o) => o.value === v);
  // Seçilmiş olanlar menüden düşer — eklenecek olan listelenir.
  const remaining = visible.filter((o) => !selected.includes(o.value));
  // Görselli seçenek varsa menü biraz genişler (uzun ürün adları için); alerjen gibi görselsiz
  // kullanımlarda ölçü aynı kalır.
  const withImages = options.some((o) => o.imageUrl !== undefined);

  return (
    <div className="flex flex-wrap items-center gap-[7px]">
      {hideSelected
        ? null
        : selected.map((v) => {
            const o = optionOf(v);
            return (
              <Chip key={v} active onClick={() => onChange(selected.filter((x) => x !== v))}>
                {o?.imageUrl !== undefined ? <Thumbnail src={o.imageUrl} alt="" size={18} iconSize={10} className="!rounded-[5px]" /> : null}
                {o?.label ?? v} ✕
              </Chip>
            );
          })}

      {remote || options.length > selected.length ? (
        <>
          <div ref={anchorRef} className="inline-flex">
            <Chip
              dashed
              onClick={() => {
                reset();
                setOpen((v) => !v);
              }}
            >
              {addLabel}
            </Chip>
          </div>
          <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={withImages ? 288 : 240} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-ops-line-soft px-2.5 py-2 text-ops-faint">
              <SearchIcon size={14} />
              <Input inputSize="sm" autoFocus value={query} onChange={(e) => onQuery(e.target.value)} placeholder={searchPlaceholder} className="border-0 !px-0 !py-0 focus:border-0" />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {loading && remaining.length === 0 ? (
                <div className="px-[13px] py-2.5 font-ops-body text-ops-sm text-ops-faint">Aranıyor…</div>
              ) : remaining.length === 0 ? (
                <div className="px-[13px] py-2.5 font-ops-body text-ops-sm text-ops-faint">
                  {remote && !query.trim() ? searchPlaceholder : emptyText}
                </div>
              ) : (
                remaining.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange([...selected, o.value]);
                      reset();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-[13px] py-2 text-left font-ops-body text-ops-base text-ops-strong hover:bg-ops-subtle"
                  >
                    {o.imageUrl !== undefined ? <Thumbnail src={o.imageUrl} alt="" size={26} iconSize={12} className="!rounded-[6px]" /> : null}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                ))
              )}
            </div>
          </AnchoredMenu>
        </>
      ) : null}
    </div>
  );
}
