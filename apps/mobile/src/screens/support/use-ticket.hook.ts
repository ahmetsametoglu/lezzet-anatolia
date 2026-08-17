import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { BELL_EVENT, ticketChannelName } from '@lezzet/types';

import { fetchTicket, replyToTicket, type TicketDetail } from '@/lib/api/tickets';
import { getSupabase } from '@/lib/auth/supabase';

/*
  TALEP DETAY VERİSİ — sipariş detay hook'unun (`use-order.hook.ts`) deseni, üstüne YAZMA yarısı.

  DÖRT OKUMA HÂLİ, dördü ayrı şey: `guest` (oturum yok — bildirimden/derin bağlantıdan gelinmiş
  olabilir, doğru cevap giriş kapısıdır), `missing` (404: bulunamayan ve BAŞKASINA AİT talebin ortak
  cevabı — ayrımı sunucu bilerek söylemiyor), `error` (telin arızası), `ready`.

  ── GÖNDERİM SONUCU SUNUCUDAN GELİR, EKRANDA UYDURULMAZ ─────────────────────
  Cevap ucu GÜNCEL DETAYI döndürüyor (sözleşmenin kararı): yeni mesajın damgası, yeniden açılmış
  durum ve son mesaj anı oradan gelir. Ekranın yerel bir "iyimser mesaj" listesi YOK — kapanmış
  talebe yazınca durumun `open`a döndüğünü tahmin etmek zorunda kalırdı ve o tahmin bir gün
  sunucudan ayrışırdı.

  DÜŞEN GÖNDERİM TASLAĞI SİLMEZ: metin kutuda kalır ki müşteri yazdığını kaybetmesin — tekrar
  basmak tek dokunuş. Kaybolan bir şikâyet metni, gönderilmemiş bir talepten kötüdür.
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

  /**
   * Zil duyulunca yazışmayı SESSİZCE tazeler — `load`dan farkı burada.
   *
   * `load` durumu `loading`e çeker ve ekran iskelete döner; canlı tazelemede bu YANLIŞ olurdu:
   * müşteri okuduğu mesajın ortasındayken ekran bir anlığına boşalır, geldiği yeri kaybederdi.
   * Karşı taraf yazdı diye kimsenin ekranı sıfırlanmaz.
   *
   * Düşen tur da SESSİZ: elde duran yazışma korunur ve kırmızı bir uyarı yazılmaz. Zil bir kolaylık;
   * çalışmadığı an müşterinin kaybı "biraz geç görmek"tir — ekrandan çıkıp girmek tam bir okuma
   * yapıyor ve elle yenileme kapısı bilerek YOK (ekran künyesinde gerekçesi).
   */
  const refresh = useCallback(async (): Promise<void> => {
    const run = (generation.current += 1);
    const result = await fetchTicket(id, locale);
    if (run !== generation.current || result.error !== null) return;
    setDetail(result.data);
    setStatus('ready');
  }, [id, locale]);

  /*
    CANLI YAZIŞMA — **kapı zili, veri borusu değil** (kullanıcı isteği 16.08).

    Kanal boş bir "changed" yayınlar, ekran duyunca yazışmayı SUNUCUDAN yeniden ister. Mesajın
    kendisi asla kanaldan geçmez: projede RLS yok, her okuma sunucuda service-role ile yapılıyor ve
    istemciyi `ticket_message` tablosuna abone etmek o duvarda ilk delik olurdu (`bell.ts` künyesi,
    16.8 kararı). Aynı sebeple sipariş ekranı da yıllardır böyle çalışıyor (`order-watch`).

    Kanal adı ve olay adı `@lezzet/types`tan geliyor (`realtime.contract`): zili ÇALAN taraf sunucu
    paketinde ve mobil ona bağlı değil — adı burada yeniden yazmak, bir gün sessizce çalmayan bir
    zil demekti.

    Abonelik ekran ömrü boyunca AÇIK kalır ve sökülürken kapatılır; kanal talebe özel olduğu için
    tek yazışma için tek soket açılıyor.
  */
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
