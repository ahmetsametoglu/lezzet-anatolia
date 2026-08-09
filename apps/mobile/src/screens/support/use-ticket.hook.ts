import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import { fetchTicket, replyToTicket, type TicketDetail } from '@/lib/api/tickets';

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

  return { status, detail, sending, sendFailed, retry: load, send };
}
