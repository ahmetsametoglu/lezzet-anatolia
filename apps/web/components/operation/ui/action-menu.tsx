'use client';

import { useRef, useState } from 'react';
import { AnchoredMenu } from './anchored-menu';
import { Button } from './button';
import { ChevronDownIcon } from './icons';

/**
 * **Eylem menüsü** — bir ekranın SEYREK eylemlerini tek düğmede toplar (13.09, Para: başlıktaki beş
 * düğme — hareket, transfer, belge, sözlük, banka dosyası — süzgeç şeridinin sağına tek menüye indi;
 * kullanıcı isteği). Günlük iş satırda ve kuyrukta; bu eylemler "yeni bir şey başlat" eylemleridir ve
 * başlıkta beş ayrı düğme olarak asıl yüzeyden yer çalıyordu.
 *
 * Kapalı öğe GİZLENMEZ, soluk çizilir ve `hint` sebebini söyler ("en az iki açık hesap gerekir"):
 * görünmeyen bir eylem, var olmadığı sanılan bir eylemdir.
 */
interface ActionMenuProps {
  label: string;
  items: Array<{ key: string; label: string; hint?: string; disabled?: boolean; onSelect: () => void }>;
  className?: string;
}

export function ActionMenu({ label, items, className }: ActionMenuProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div ref={anchorRef} className={['inline-flex', className].filter(Boolean).join(' ')}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open}>
        <span className="flex items-center gap-1.5">
          {label}
          <ChevronDownIcon />
        </span>
      </Button>
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={260}>
        <div role="menu" className="flex flex-col py-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex w-full cursor-pointer flex-col gap-0.5 px-[13px] py-2 text-left transition-colors hover:bg-ops-subtle disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span className="font-ops-body text-ops-sm text-ops-strong">{item.label}</span>
              {item.hint ? <span className="font-ops-body text-ops-xs text-ops-faint">{item.hint}</span> : null}
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </div>
  );
}
