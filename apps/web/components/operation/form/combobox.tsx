'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnchoredMenu } from '../ui/anchored-menu';
import { ChevronDownIcon, SearchIcon } from '../ui/icons';
import { CHIP_MENU_WIDTH, triggerClass, type TriggerTone, type TriggerVariant } from './trigger';
import { useOptionSearch } from './use-option-search.hook';

/**
 * ARANABILIR TEKİL SEÇİCİ (combobox) — Komponent Envanteri O8'in "gelişmiş" varyantı; tasarımda
 * arama satırı + iki satırlı öğe (ad/meta) + sağda değer olarak çizili.
 *
 * `Select` bunu baştan beri kendi yorumunda erteliyordu ("gerçek tüketicisi gelince ayrı dosya
 * olarak eklenecek"). Tüketici üç taneymiş ve üçü de kendi çözümünü uydurmuştu: boy seçicisi
 * `MultiSelect`'i tek seçim gibi kullanıp seçileni YANINDA bir `<span>`'de gösteriyordu (form alanı
 * gibi durmuyordu), müşteri seçicisi diyalogun içine gömülü ayrı bir arama+liste yazmıştı, süzgeç
 * şeridi ise aramasız `Select`'le idare ediyordu. Üç arama arayüzü, tek ekranda.
 *
 * İKİ KİP: yerel (seçenekler elde) ve uzak (`onSearch` — kaynak sunucuda). İkisinin davranışı
 * `useOptionSearch`'te, çoklu seçiciyle ORTAK: gecikme, süzme ve sıfırlama tek yerde.
 *
 * İKİ BİÇİM: form alanı (`field`) ve süzgeç çipi (`chip`, 19.5). Çip biçimi yukarıdaki notun
 * "süzgeç şeridi aramasız `Select`'le idare ediyordu" itirafını kapatır — tetikleyici görünümü
 * `Select` ile ORTAK (`triggerClass`), yalnız içeriği ve menüsü burada.
 */

// Dışa verilmez: çağıranlar nesne literali geçiyor, tipi adıyla anan yok.
interface ComboOption {
  value: string;
  label: string;
  /** İkinci satır — telefon/e-posta, kategori, durum notu. */
  meta?: string;
  /** Sağa hizalı değer (fiyat, rozet metni) — tasarımdaki mono sütun. */
  trailing?: string;
  /** Sol görsel — ürün seçicide küçük resim; yoksa yer de tutulmaz. */
  thumb?: ReactNode;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Yerel kipte tüm seçenekler; uzak kipte sunucudan dönen SON sonuç kümesi. */
  options: ComboOption[];
  /** Seçili değerin etiketi seçenek listesinde YOKSA (uzak kip, kapalı hâl) dışarıdan verilir. */
  selectedLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Verilirse UZAK kip: yazılan terim gecikmeli olarak buraya gelir, sonuçları çağıran doldurur. */
  onSearch?: (term: string) => void;
  loading?: boolean;
  /** Sonuç yokken gösterilecek cümle — "neden yok ve ne yapmalı" burada söylenir. */
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** `chip` — süzgeç şeridi biçimi; `field` (varsayılan) form alanı. */
  variant?: TriggerVariant;
  /**
   * Çipin solundaki soluk alan adı ("Depo: STR"). Süzgeç şeridindeki diğer çipler "+ kategori"
   * davetiyesiyle çalışır çünkü boş kalabilirler; DAİMA bir değer taşıyan çip ("tümü" de bir
   * değerdir) neyin süzüldüğünü kendi üstünde söylemek zorundadır.
   */
  label?: string;
  /** Dolu çipin rengi — `blue` bakış daraltması, `olive` karar (bkz. `TriggerTone`). */
  tone?: TriggerTone;
}

export function Combobox({
  value,
  onChange,
  options,
  selectedLabel,
  placeholder = 'Seç',
  searchPlaceholder = 'Ara…',
  onSearch,
  loading = false,
  emptyText = 'Eşleşen kayıt yok',
  disabled,
  className,
  variant = 'field',
  label,
  tone,
}: ComboboxProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const { query, onQuery, reset, visible, remote } = useOptionSearch({ options, onSearch, match: matches });

  const selected = options.find((o) => o.value === value) ?? null;
  const triggerText = selected?.label ?? selectedLabel ?? '';

  // Açılınca imleç arama kutusuna: seçici zaten "arayarak bul" için var, fareyle ikinci bir tık
  // istemek o vaadi bozardı.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  return (
    <div ref={anchorRef} className={className}>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen((v) => !v);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={triggerClass({
          variant,
          open,
          filled: Boolean(triggerText),
          disabled: Boolean(disabled),
          tone,
          // Alan adı taşıyan çip boş kalamaz — davetiye (kesikli) hâli ona ait değil.
          invite: !label,
        })}
      >
        {label ? <span className="flex-none opacity-70">{label}:</span> : null}
        {/* `min-w-0 flex-1` ŞART, `truncate` tek başına YETMEZ (ölçüldü 14.08, kullanıcı bildirimi):
            flex çocuğunun asgari genişliği varsayılan olarak İÇERİĞİ kadardır (`min-width:auto`), yani
            `overflow-hidden` verilse bile kutu kısalmaz — uzun bir seçim tetikleyiciyi büyütür,
            tetikleyici satırı, satır da diyaloğu taşırır. Arıza stoktan düş penceresinde göründü:
            parti etiketi ürün+tarih+adet+depo taşıyor ve form pencereye sığmıyordu. Düzeltme burada,
            çünkü hata `Combobox`ın kendisindeydi — her çağıran kazanıyor (`MultiSelect` bunu zaten
            doğru yapıyordu). */}
        <span className="min-w-0 flex-1 truncate text-left">{triggerText || placeholder}</span>
        <span className="flex-none text-ops-faint">
          {variant === 'chip' ? <ChevronDownIcon /> : open ? '▴' : '▾'}
        </span>
      </button>

      {/* Çip biçiminde menü çipin genişliğini MİRAS ALMAZ: çip içeriği kadar dardır, menü ise
          arama satırını ve iki satırlı öğeleri taşır (`Select`'teki aynı gerekçe). */}
      <AnchoredMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        width={variant === 'chip' ? CHIP_MENU_WIDTH : 'anchor'}
      >
        <div className="flex items-center gap-2 border-b border-ops-line px-[13px] py-2.5 text-ops-faint">
          <SearchIcon size={14} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent font-ops-body text-ops-sm text-ops-ink outline-none placeholder:text-ops-faint"
          />
        </div>

        <div role="listbox" className="max-h-[264px] overflow-y-auto">
          {loading && visible.length === 0 ? (
            <Note text="Aranıyor…" />
          ) : visible.length === 0 ? (
            <Note text={remote && !query.trim() ? searchPlaceholder : emptyText} />
          ) : (
            visible.map((o) => (
              <Row
                key={o.value}
                option={o}
                selected={o.value === value}
                onPick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              />
            ))
          )}
        </div>
      </AnchoredMenu>
    </div>
  );
}

/** Yerel süzme etiketin YANINDA meta'yı da tarar: "0612…" yazan kişi telefonla arıyordur. */
function matches(option: ComboOption, q: string): boolean {
  return option.label.toLowerCase().includes(q) || (option.meta?.toLowerCase().includes(q) ?? false);
}

function Note({ text }: { text: string }) {
  return <span className="block px-[13px] py-2.5 font-ops-body text-ops-xs text-ops-muted">{text}</span>;
}

interface RowProps {
  option: ComboOption;
  selected: boolean;
  onPick: () => void;
}

function Row({ option, selected, onPick }: RowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={[
        'flex w-full cursor-pointer items-center gap-2.5 px-[13px] py-2 text-left transition-colors',
        selected ? 'bg-ops-olive-bg' : 'hover:bg-ops-subtle',
      ].join(' ')}
    >
      {option.thumb ? <span className="flex-none">{option.thumb}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className={`truncate font-ops-body text-ops-sm ${selected ? 'font-semibold text-ops-ink' : 'text-ops-strong'}`}>
          {option.label}
        </span>
        {option.meta ? <span className="truncate font-ops-body text-ops-xs text-ops-muted">{option.meta}</span> : null}
      </span>
      {option.trailing ? (
        <span className="flex-none font-ops-mono text-ops-xs text-ops-body">{option.trailing}</span>
      ) : null}
    </button>
  );
}
