import type { Country } from '@lezzet/types';
import { useEffect, useState } from 'react';

import { fetchDeliveryAreas } from '@/lib/api/places';

/*
  KAPIYA TESLİM KODLARI (21.313) — adres çekmecesinin öneri rozeti ve "doğrulandı" kartının teslim
  satırı için tek soru: bu posta kodu aracımızın gittiği bölgede mi. Web aynı kararı bağlamın bölge
  listesinden veriyor (`channel-badge.tsx` — satır başına sunucuya sorulmaz); burada kaynak aynı liste:
  `/places/zones` (aktif bölgeler, ülke → komün → kodlar).

  NEDEN `/places/by-postal-code` DEĞİL: o uç "yer çözüldü" hunisini SAYIYOR (`places.ts` künyesi —
  öneri bir OKUMA, onay bir NİYET); öneri satırı başına çağırmak sayacı tuş sayısı kadar şişirirdi.

  Liste oturumda BİR KEZ okunur: bölgeler operatörün elle kurduğu, doğal tavanı olan bir küme (CLAUDE
  §1 sayfalama ölçütü) ve çekmecenin her açılışında yeniden sormak gereksiz. Okuma düşerse sonuç
  `null` olur ve rozet ÇİZİLMEZ — bilinmeyeni "kargoyla" diye söylemek ekrana yanlış bir olgu yazmak
  olurdu; bir sonraki açılış yeniden dener.
*/

type DoorCodes = ReadonlySet<string>;

const keyOf = (country: Country, postalCode: string): string => `${country}:${postalCode}`;

let shared: Promise<DoorCodes | null> | null = null;

function loadDoorCodes(): Promise<DoorCodes | null> {
  shared ??= fetchDeliveryAreas().then((result) => {
    if (result.error !== null) {
      shared = null;
      return null;
    }
    return new Set(
      result.data.areas.flatMap((area) => area.places.flatMap((place) => place.codes.map((code) => keyOf(area.country, code)))),
    );
  });
  return shared;
}

/** `(ülke, kod)` kapıya teslim bölgesinde mi — liste henüz gelmediyse ya da okunamadıysa `null`. */
export function useDoorCodes(enabled: boolean): ((country: Country, postalCode: string) => boolean) | null {
  const [codes, setCodes] = useState<DoorCodes | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadDoorCodes().then((next) => {
      if (alive) setCodes(next);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  if (codes === null) return null;
  return (country, postalCode) => codes.has(keyOf(country, postalCode));
}
