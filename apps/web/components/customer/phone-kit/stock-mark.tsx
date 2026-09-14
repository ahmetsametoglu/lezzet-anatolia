import type { PlaceMarkTone } from '@lezzet/helper';

/*
  YER İŞARETİ ROZETİ — native kitin `StockMark`ının (`apps/mobile/src/components/ui/stock-mark.tsx`) web telefon
  ikizi (14.09): "bu ürün BANA nasıl gelir" cümlesi, tonuyla. Cümleyi ve tonu kurucu verir (`placeMarkOf`,
  `@lezzet/helper`); bu dosya yalnız çizer.

  · Üç ton native'in renk çiftleri: `info` zeytin (kargo) · `pending` kapanmış ailesi (bölgenizde şu an yok —
    olumlu bir renkle söylenirse müşteri satın alınabilir sanır) · `blocked` hata çifti (bu adrese gitmiyor).
  · Büyük harfe çevrilmez: tek kelime değil CÜMLE, büyük harf bağırır. İki satır tavanı — rozet bilgiyi yutmasın.
  · Bugün satır içindeki biçim çiziliyor (native `regular`: `helper` kademesi, 4 · 8 dolgu), sola yaslı — tek
    çağıranı paket detayının sola hizalı gövdesi. Kare kartın köşesindeki küçük biçim (`compact`) ve daire kartın
    ortalı hâli ilk çağıranlarıyla gelir.
*/

const TONE: Record<PlaceMarkTone, string> = {
  info: 'bg-olive-bg text-olive-dark',
  pending: 'bg-closed-bg text-closed',
  blocked: 'bg-error-bg text-error',
};

interface StockMarkProps {
  label: string;
  tone: PlaceMarkTone;
}

export function StockMark({ label, tone }: StockMarkProps) {
  return (
    <span className={['line-clamp-2 self-start rounded-badge px-2 py-1 font-sans text-helper font-bold', TONE[tone]].join(' ')}>
      {label}
    </span>
  );
}
