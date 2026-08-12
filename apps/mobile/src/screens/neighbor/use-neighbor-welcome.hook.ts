import { useCallback, useEffect, useRef, useState } from 'react';

import type { NeighborWelcomeView } from '@lezzet/types';

import { fetchNeighborWelcome } from '@/lib/invite/invite-api';

/*
  KOMŞU DAVETİ KARŞILAMASI — tek uç (`GET /api/v1/neighbor/:token`), üç ağ hâli.

  Getiren davetinin kancasıyla (`use-invite-welcome`) aynı desen ve aynı ayrım: AĞ hâli ile İŞ hâli
  karışmaz. Burada ayrımın bedeli daha da yüksek — beş iş hâlinin ikisi zaten bir REDDİ anlatıyor
  ("sefer geçti", "kontenjan doldu") ve bunları bir ağ hatasıyla aynı kutuya koymak, geçici bir
  bağlantı sorununda komşuya "seferi kaçırdın" dedirtirdi.

  BOŞ BELİRTEÇ AĞA HİÇ ÇIKMAZ: bozuk bir bağlantı doğrudan "tanımadık" hâline düşer — sunucunun da
  vereceği cevap odur.
*/

type NeighborWelcomeState =
  | { status: 'loading'; retry: () => void }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; data: NeighborWelcomeView; retry: () => void };

export function useNeighborWelcome(token: string): NeighborWelcomeState {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; data: NeighborWelcomeView | null }>({
    status: 'loading',
    data: null,
  });
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setState({ status: 'loading', data: null });

    if (token.trim().length === 0) {
      setState({ status: 'ready', data: { status: 'unknown' } });
      return;
    }

    void fetchNeighborWelcome(token).then((result) => {
      if (run !== generation.current) return;
      setState(result.error !== null ? { status: 'error', data: null } : { status: 'ready', data: result.data });
    });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'ready' && state.data !== null) return { status: 'ready', data: state.data, retry: load };
  return { status: state.status === 'ready' ? 'error' : state.status, retry: load };
}
