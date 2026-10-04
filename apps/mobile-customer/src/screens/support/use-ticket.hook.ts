import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { BELL_EVENT, ticketChannelName } from '@lezzet/types';

import { fetchTicket, replyToTicket, type TicketDetail } from '@/lib/api/tickets';
import { registerReadRecovery } from '@lezzet/mobile-kit/src/lib/auth/recover-reads';
import { getSupabase } from '@lezzet/mobile-kit/src/lib/auth/supabase';

/*
  Talep detayı sipariş detayının dört hâlini taşır; gönderimin sonucu sunucunun döndürdüğü güncel detaydır, ekran iyimser mesaj
  uydurmaz. Düşen gönderim taslağı silmez, çünkü kaybolan bir şikâyet metni gönderilmemiş bir talepten kötüdür.
*/

type TicketStatus = 'loading' | 'guest' | 'ready' | 'missing' | 'error';

interface UseTicketResult {
  status: TicketStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: TicketDetail | null;
  /** Cevap uçuşta — gönder düğmesi bunu okur. */
  sending: boolean;
  /** Son gönderim düştü mü — ekran tek satırlık bir ret gösterir, taslak yerinde kalır. */
  sendFailed: boolean;
  retry: () => void;
  /** SESSİZ tazeleme — okunan yazışma yerinde kalır; TEK çağıranı canlı zildir. */
  refresh: () => Promise<void>;
  /** `true` = mesaj yazışmaya eklendi (ekran kutuyu temizler ve toast basar). */
  send: (body: string) => Promise<boolean>;
}

export function useTicket(id: string, locale: Locale): UseTicketResult {
  const [status, setStatus] = useState<TicketStatus>('loading');
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchTicket(id, locale).then((result) => {
      // "Tekrar dene"ye art arda basan parmağın iki uçuşu: eski cevap sayacı tutmadığı için yazılmaz.
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 401 ? 'guest' : result.status === 404 ? 'missing' : 'error');
        return;
      }
      setDetail(result.data);
      setStatus('ready');
    });
  }, [id, locale]);

  useEffect(() => {
    load();
  }, [load]);

  // Oturumsuz okunan talep, oturumla yapılan ilk başarılı istekte yeniden okunur: bildirimden girişe yönlenen müşteri girişten sonra talebi görür.
  useEffect(() => (status === 'guest' ? registerReadRecovery(load) : undefined), [status, load]);

  /**
   * Zil duyulunca yazışma sessizce tazelenir, çünkü `load` ekranı iskelete çevirir ve okunan mesajın yeri kaybolurdu. Düşen tur da
   * sessizdir: zil bir kolaylıktır ve elde duran yazışma korunur.
   */
  const refresh = useCallback(async (): Promise<void> => {
    const run = (generation.current += 1);
    const result = await fetchTicket(id, locale);
    if (run !== generation.current || result.error !== null) return;
    setDetail(result.data);
    setStatus('ready');
  }, [id, locale]);

  /* Kanal bir kapı zilidir, veri borusu değil: boş bir "changed" yayınlar ve ekran yazışmayı sunucudan yeniden ister. Mesaj kanaldan
     geçmez, çünkü RLS yok ve istemciyi `ticket_message` tablosuna abone etmek o duvarda ilk delik olurdu. */
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel(ticketChannelName(id))
      .on('broadcast', { event: BELL_EVENT }, () => refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, refresh]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      // Boş mesaj uca hiç gitmez; düğme zaten kapalı ama kapı iki yerde durur (kapının kendisi de
      // `empty_body` döner) — istemci kapısı yalnız boşuna bir turu önlüyor.
      if (sending || body.trim().length === 0) return false;
      setSending(true);
      setSendFailed(false);

      const result = await replyToTicket(id, body, locale);
      setSending(false);
      if (result.error !== null) {
        setSendFailed(true);
        return false;
      }
      // Sunucunun döndürdüğü görünüm YERİNE GEÇER: durum yeniden açılmış olabilir, damgalar oradan.
      setDetail(result.data);
      setStatus('ready');
      return true;
    },
    [id, locale, sending],
  );

  /* `retry` ile `refresh` AYNI ŞEY DEĞİL: ilki hatadan dönüşün kapısıdır ve ekranı iskelete
     çeker; ikincisi sessiz tazelemedir (zil ve aşağı çekme onu kullanır) — okunan yazışma yerinde
     kalır. İkisini tek kapıya indirmek, canlı her tazelemede ekranı boşaltırdı. */
  return { status, detail, sending, sendFailed, retry: load, refresh, send };
}
