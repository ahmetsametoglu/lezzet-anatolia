'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '@/components/customer/ui/icons';
import { menuItemClass, menuPanelClass } from '@/components/customer/ui/menu';
import { useDismiss } from '@/components/customer/ui/use-dismiss.hook';
import { FieldShell, controlClass, errorIdFor, type FieldVariant } from './field-shell';

/**
 * Seçim alanı — `FormInputField`in kardeşi (13.09): aynı kabuk (etiket → kontrol → hata), aynı kutu
 * görünümü (`controlClass`), açılınca KİTİN menü yüzeyi (`menuPanelClass` — hesap menüsüyle ortak).
 *
 * **Yerel `<select>` DEĞİL** (kullanıcı kararı 13.09): tarayıcının açılır menüsü işletim sisteminin
 * kendi penceresi — biçimlendirilemiyor, mavi seçimle tasarımın dışında duruyordu. Yerel öğenin
 * bedava verdiklerini burası kendisi taşır: liste kalıbı (`listbox` · `option` · etkin satır), oklar,
 * Home/End, Enter/Space ile seçim, Escape ile kapanıp odağın kutuya dönmesi, dışarı basınca kapanma
 * (`useDismiss`). Escape bir pencerenin içinde yalnız listeyi kapatır, pencereyi değil.
 *
 * Kutu yalnız seçili değerin ADINI yazar — ok işareti yok ve kısaltma yok (kullanıcı kararı 13.09:
 * *"kapalıyken görünen ok gereksiz; kısaltması değil, normal yazılışı olsun"*). Seçili satır listede
 * zeytin renkli ve onay işaretli.
 *
 * İlk tüketici v1 başlığının yer paneli (ülke). Önce orada tıklayınca iki ülke arasında geçen bir
 * düğme yazılmıştı (taslağın mock davranışı), sonra yerel `<select>`; ikisini de kullanıcı düzeltti.
 */
interface SelectOption<T extends string> {
  value: T;
  /** Kutuda ve listede görünen ad — tam yazılış ("Fransa"), kod değil. */
  label: string;
}

interface FormSelectFieldProps<T extends string> {
  label: string;
  hideLabel?: boolean;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  error?: string;
  /** Cümlesiz geçersizlik — gerekçe `FormInputField`te. */
  invalid?: boolean;
  /** Çizim — `form` (K34) ya da `inline` (v1 yer paneli); bkz. `FieldVariant`. */
  variant?: FieldVariant;
  id?: string;
  disabled?: boolean;
}

export function FormSelectField<T extends string>({ label, hideLabel, value, options, onChange, error, invalid, variant, id, disabled }: FormSelectFieldProps<T>) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const listId = `${fieldId}-list`;
  const isInvalid = Boolean(error) || Boolean(invalid);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useDismiss(box, open, () => setOpen(false));

  // Açılınca odak listeye geçer: ok tuşları oradan, seçili satırdan başlar.
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        // Yayılmaz: seçim alanı bir pencerenin içindeyse Escape yalnız listeyi kapatmalı.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} error={error} variant={variant}>
      <div ref={box} className="relative">
        <button
          ref={trigger}
          id={fieldId}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={isInvalid ? 'true' : undefined}
          aria-describedby={errorIdFor(fieldId, error)}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onTriggerKey}
          className={controlClass(isInvalid, 'cursor-pointer truncate text-left', variant)}
        >
          {options[selectedIndex]?.label}
        </button>
        {open && (
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${fieldId}-option-${active}`}
            onKeyDown={onListKey}
            className={`absolute top-[calc(100%+6px)] left-0 z-50 min-w-full outline-none ${menuPanelClass}`}
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${fieldId}-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={[
                    menuItemClass,
                    'flex items-center gap-2 whitespace-nowrap',
                    index === active ? 'bg-hover-bg' : '',
                    selected ? 'text-olive' : 'text-ink',
                  ].join(' ')}
                >
                  {option.label}
                  {selected && <Icon name="check" size={14} className="ml-auto flex-none" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}
