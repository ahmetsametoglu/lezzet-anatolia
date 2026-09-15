import { useCallback, useEffect, useRef, useState } from 'react';

import type { InviteWelcomeView } from '@lezzet/types';

import { fetchInviteWelcome } from '@/lib/invite/invite-api';

/*
  DAVET KARŞILAMASI VERİSİ — tek uç (`GET /api/v1/invite/:code`), üç ağ hâli.

  DÖRT KARŞILAMA HÂLİ BURADA YOK: onlar `ready`nin İÇİNDEDİR ve ekranın çizdiği şeydir. Ağ hâli
  ("cevap geldi mi") ile iş hâli ("kod kimin") ayrı katmanlar; karıştırılsaydı "tanımadık" bir
  ağ hatasıymış gibi görünür ve davetli, geçici bir bağlantı sorununda kodunun geçersiz olduğunu
  okurdu (teslimat bölgeleri kancasının "boş liste hata değildir" kararıyla aynı ayrım).

  BOŞ KOD AĞA HİÇ ÇIKMAZ: bozuk bir bağlantı (`/invite/` gibi kodsuz) sunucuya sorulmaz, doğrudan
  "tanımadık" hâline düşer — sunucunun da vereceği cevap odur ve boşuna bir tur atmaya gerek yok.

  ESKİMİŞ CEVAP KORUMASI (`generation`): "tekrar dene"ye art arda basan parmak iki uçuş başlatır;
  yavaş olanın sonucu hızlıyı ezmesin diye sayacı tutmayan cevap YAZILMAZ (`use-delivery-zones`
  deseni).
*/

type InviteWelcomeState =
  | { status: 'loading'; retry: () => void }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; data: InviteWelcomeView; retry: () => void };

export function useInviteWelcome(code: string): InviteWelcomeState {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; data: InviteWelcomeView | null }>({
    status: 'loading',
    data: null,
  });
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setState({ status: 'loading', data: null });

    if (code.trim().length === 0) {
      setState({ status: 'ready', data: { status: 'unknown' } });
      return;
    }

    void fetchInviteWelcome(code).then((result) => {
      if (run !== generation.current) return;
      setState(result.error !== null ? { status: 'error', data: null } : { status: 'ready', data: result.data });
    });
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'ready' && state.data !== null) return { status: 'ready', data: state.data, retry: load };
  return { status: state.status === 'ready' ? 'error' : state.status, retry: load };
}
