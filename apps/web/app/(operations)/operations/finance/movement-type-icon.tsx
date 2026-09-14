import type { ReactNode } from 'react';
import type { MovementType } from '@lezzet/types';
import { NavIcon, QuestionIcon, ReceiptIcon, TransferIcon, UndoIcon } from '@/components/operation/ui/icons';

/*
  HAREKET TİPİNİN İKONU (12.20 · kullanıcı isteği 14.09: "banka hareket tipleri için birer ikon belirle
  ve bu ikonu ilgili yerlerde kullan") — listenin tip sütunu, "+ tip" süzgeci ve panelin künyesi aynı
  ikonu okur. Var olan çizim yeniden kullanılır: sipariş ödemesi siparişin kolisi, stok alımı satın
  almanın sepeti, sermaye paranın € işareti (kenar menünün ikonları); iade · gider · transfer ·
  sınıflandırılmamış için kitte yeni çizgi ikonlar. Harita `Record`: yeni bir tip eklenince ikonu
  yazılmadan derlenmez.
*/
const ICON: Record<MovementType, (size: number) => ReactNode> = {
  order_payment: (size) => <NavIcon name="siparisler" size={size} />,
  order_refund: (size) => <UndoIcon size={size} />,
  purchase: (size) => <NavIcon name="satinalma" size={size} />,
  expense: (size) => <ReceiptIcon size={size} />,
  transfer: (size) => <TransferIcon size={size} />,
  capital: (size) => <NavIcon name="para" size={size} />,
  misc: (size) => <QuestionIcon size={size} />,
};

interface MovementTypeIconProps {
  type: MovementType;
  size?: number;
}

export function MovementTypeIcon({ type, size = 13 }: MovementTypeIconProps) {
  return ICON[type](size);
}
