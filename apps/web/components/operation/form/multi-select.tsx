'use client';

import { useRef, useState } from 'react';
import { AnchoredMenu } from '../ui/anchored-menu';
import { useOptionSearch } from './use-option-search.hook';
import { Chip } from '../ui/chip';
import { Input } from './input';
import { CheckIcon, SearchIcon } from '../ui/icons';
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
  /** Ekleme çipinin adı, yazısı tek işaretse ("+") — bkz. `Chip` `ariaLabel`. */
  addAriaLabel?: string;
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
  /**
   * Seçim KİLİTLİ — çiplerin kaldırma davranışı ve "+ ekle" tetikleyicisi kapanır, seçilenler
   * okunur kalır. Kilitliyken listeyi hiç çizmemek, o alanın neyi taşıdığını saklardı (asistan
   * kuyruğu 22.14: seçilmemiş alan da görünür, ama düzenlenemez).
   */
  disabled?: boolean;
  /**
   * Verilirse aranan ad listede YOKSA menünün sonunda "oluştur" satırı çıkar (13.09 · muhasebeci
   * deseni): sözlüğe yeni kayıt açmak için pencereden çıkılmaz. Kaydı çağıran açar ve seçime ekler.
   */
  onCreate?: (label: string) => void;
  /**
   * Menü BÜTÜN seçenekleri gösterir, seçililer işaretli (✓); dokunuş ekler ya da çıkarır ve menü
   * açık kalır (13.09 · muhasebeci deseni, Para etiketleri). Varsayılan kipte seçilen menüden DÜŞER —
   * satırında tek kayıtlı etiket zaten seçili olan kullanıcı o kipte "kayıtlı etiket gelmiyor" diye
   * okudu (kullanıcı bildirimi 13.09).
   */
  checkable?: boolean;
  /**
   * `cell` — tablo hücresi ölçüsü (satır yüksekliğine uyar, `Chip` `cell`); varsayılan form/süzgeç ölçüsü.
   * Hücrede çip dar ve adı kesilir: dokunuş KALDIRMAZ, menüyü açar — kaldırma menüdeki işaretten (kip
   * kendiliğinden `checkable`). Kesilmiş bir çipin tek dokunuşla silinmesi yoğun bir tabloda kaza
   * demekti. Ekleme çipi yalnız hiç seçim yokken durur; seçim varken çipin kendisi menüdür.
   */
  size?: 'sm' | 'cell';
  /** En çok kaç seçili çip çizilir; kalanı "+N" çipinde sayılır ve dokunuş menüyü açar. */
  maxVisible?: number;
}

export function MultiSelect<T extends string>({
  options,
  selected,
  onChange,
  addLabel = '+ ekle',
  addAriaLabel,
  searchPlaceholder = 'Ara…',
  hideSelected = false,
  onSearch,
  loading = false,
  emptyText = 'Sonuç yok',
  disabled = false,
  onCreate,
  checkable = false,
  size = 'sm',
  maxVisible,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const cell = size === 'cell';
  // Hücre kipi seçilileri menüde işaretli gösterir: orada çip kaldırmaz, kaldırma menüdeki işaretten.
  const marked = checkable || cell;
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
  // Yazılan ad sözlükte AYNEN varsa oluşturma teklif edilmez — o ad zaten seçilebilir durumda.
  const typed = query.trim();
  const canCreate =
    onCreate !== undefined && typed !== '' && !options.some((o) => o.label.toLocaleLowerCase('tr') === typed.toLocaleLowerCase('tr'));
  // İşaretli kipte menü seçilileri de listeler; öteki kipte yalnız eklenecek olanları.
  const listed = marked ? visible : remaining;
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const shown = maxVisible === undefined ? selected : selected.slice(0, maxVisible);
  const hiddenCount = selected.length - shown.length;
  const openMenu = () => {
    reset();
    setOpen((v) => !v);
  };

  return (
    <div ref={cell ? anchorRef : undefined} className={cell ? 'flex min-w-0 flex-nowrap items-center gap-1' : 'flex flex-wrap items-center gap-[7px]'}>
      {hideSelected
        ? null
        : shown.map((v) => {
            const o = optionOf(v);
            return (
              <Chip key={v} active size={size} onClick={disabled ? undefined : cell ? openMenu : () => onChange(selected.filter((x) => x !== v))}>
                {o?.imageUrl !== undefined ? <Thumbnail src={o.imageUrl} alt="" size={18} iconSize={10} className="!rounded-[5px]" /> : null}
                {cell ? (
                  <span className="min-w-0 truncate">{o?.label ?? v}</span>
                ) : (
                  <>
                    {o?.label ?? v}
                    {/* Kilitliyken kaldırma işareti YAZILMAZ: tıklanamayan bir "✕" yalan söyler. */}
                    {disabled ? '' : ' ✕'}
                  </>
                )}
              </Chip>
            );
          })}
      {/* Sığmayan seçililer tek çipte sayılır; dokunuş menüyü açar (işaretli kipte orada görünürler). */}
      {!hideSelected && hiddenCount > 0 ? (
        <Chip size={size} className="flex-none" onClick={disabled ? undefined : openMenu}>
          +{hiddenCount}
        </Chip>
      ) : null}

      {disabled ? (
        // Kilitli ve hiç seçim yoksa alan boş bir satır olarak kalmasın: "yok" demek, "bu alanda
        // bir şey var ama göstermiyorum"dan farklıdır.
        selected.length === 0 ? (
          <span className="font-ops-body text-ops-sm text-ops-faint">—</span>
        ) : null
      ) : remote || marked || onCreate !== undefined || options.length > selected.length ? (
        <>
          {/* Hücrede menü bütün alana bağlanır (kök `div`): seçim varken ekleme çipi yok. */}
          {cell ? (
            selected.length === 0 ? (
              <Chip dashed size={size} className="flex-none" ariaLabel={addAriaLabel} onClick={openMenu}>
                {addLabel}
              </Chip>
            ) : null
          ) : (
            <div ref={anchorRef} className="inline-flex flex-none">
              <Chip dashed size={size} ariaLabel={addAriaLabel} onClick={openMenu}>
                {addLabel}
              </Chip>
            </div>
          )}
          <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={withImages ? 288 : 240} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-ops-line-soft px-2.5 py-2 text-ops-faint">
              <SearchIcon size={14} />
              <Input inputSize="sm" autoFocus value={query} onChange={(e) => onQuery(e.target.value)} placeholder={searchPlaceholder} className="border-0 !px-0 !py-0 focus:border-0" />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {loading && listed.length === 0 ? (
                <div className="px-[13px] py-2.5 font-ops-body text-ops-sm text-ops-faint">Aranıyor…</div>
              ) : listed.length === 0 ? (
                <div className="px-[13px] py-2.5 font-ops-body text-ops-sm text-ops-faint">
                  {remote && !query.trim() ? searchPlaceholder : emptyText}
                </div>
              ) : (
                listed.map((o) => {
                  const on = marked && selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={marked ? on : undefined}
                      onClick={() => {
                        // İşaretli kipte dokunuş aç/kapa ve menü AÇIK kalır: üç etiket üç açılış istemesin.
                        if (marked) {
                          toggle(o.value);
                          return;
                        }
                        onChange([...selected, o.value]);
                        reset();
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-[13px] py-2 text-left font-ops-body text-ops-base hover:bg-ops-subtle ${
                        on ? 'bg-ops-olive-bg text-ops-olive-dark' : 'text-ops-strong'
                      }`}
                    >
                      {o.imageUrl !== undefined ? <Thumbnail src={o.imageUrl} alt="" size={26} iconSize={12} className="!rounded-[6px]" /> : null}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {on ? (
                        <span className="flex-none">
                          <CheckIcon size={14} />
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => {
                    onCreate?.(typed);
                    reset();
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 border-t border-ops-line-soft px-[13px] py-2 text-left font-ops-body text-ops-sm font-medium text-ops-olive-dark hover:bg-ops-subtle"
                >
                  + “{typed}” oluştur
                </button>
              ) : null}
            </div>
          </AnchoredMenu>
        </>
      ) : null}
    </div>
  );
}
