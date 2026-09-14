import type { ComponentProps } from 'react';
import { CirclePhoto } from './circle-photo';

/*
  KÜÇÜK RESİM YIĞINI — native `AvatarThumb` `sm` + `stacked` varyantının web telefon ikizi (14.09): 40'lık daireler soldaki
  komşunun üstüne biner (her daire 10 sola kayar ve sayfa zemininde 2,5'luk halka taşır); ilk dairenin negatif payı kabın
  sol dolgusuyla telafi edilir, yığın soldan hizalı başlar. Ödeme ekranının kahraman satırı ve sipariş kartı çiziyor.

  Küme çağıranda sınırlanır, "+N" de oradan gelir — yığın listenin uzunluğundan sayı türetmez: aynı ürünün iki boyu tek
  halkadır ve iki kez sayılmamalı (native sipariş listesinin kuralı).
*/

interface ThumbStackItem {
  key: string;
  /** Baş harf yedeğinin kaynağı. */
  name: string;
  image: ComponentProps<typeof CirclePhoto>['image'];
}

interface ThumbStackProps {
  items: readonly ThumbStackItem[];
  /** Yığının sonundaki "+N" — çağıran kurar; yoksa çizilmez. */
  more?: string;
}

export function ThumbStack({ items, more }: ThumbStackProps) {
  return (
    <div className="flex flex-none items-center pl-2.5">
      {items.map((item) => (
        <CirclePhoto
          key={item.key}
          image={item.image}
          initial={item.name.slice(0, 1)}
          size={40}
          className="-ml-2.5 rounded-full border-[2.5px] border-sand-50"
          initialClassName="text-card-title-sm text-muted"
        />
      ))}
      {more !== undefined && <span className="ml-2 font-sans text-micro font-bold text-muted">{more}</span>}
    </div>
  );
}
