'use client';

import { useState, type ChangeEvent } from 'react';
import { requestTicketPhotoAction } from './actions';

/**
 * Talep fotoğrafı yükleme akışı (denetim bulgusu M4, 02.08).
 *
 * İki ekran aynı üç adımı yürütüyordu ve gövdeleri neredeyse karakter karakter aynıydı — yeni
 * talep formu ile cevap kutusu (`new-ticket-form` · `reply-box`). Tek fark `ticketId`'nin dolu
 * olup olmaması: yeni talepte henüz bir talep yok, dosya taslak anahtarına yükleniyor.
 *
 * Akış: **imzalı URL al → PUT ile yükle → anahtarı listeye ekle.** Dosya sunucumuzdan geçmiyor;
 * kapı yalnız yükleme izni veriyor. Yükleme yolu bir gün değişirse (boyut sınırı, ikinci depo,
 * içerik türü kısıtı) tek yerde değişmeli — iki kopyada biri öğrenir, öteki öğrenmezdi.
 *
 * **Hata state'i hook'un DEĞİL:** iki ekranın da kendi hata satırı var ve gönderme hatasıyla aynı
 * yeri kullanıyor. Hook ikinci bir hata kaynağı açsaydı ekranda iki ayrı kırmızı satır belirebilir,
 * hangisinin güncel olduğu belirsizleşirdi. Hook haber verir, gösterme kararı çağıranındır.
 */
interface TicketPhotoOptions {
  /** Var olan talep; yeni talep formunda `null` (taslak anahtarı). */
  ticketId: string | null;
  /** Ekran meşgulken (gönderim sürüyor) yükleme başlatılmaz. */
  busy: boolean;
  /**
   * Yükleme düştü — **metin çağıranından**: hook dil sözlüğü bilmez ve bilmemeli.
   *
   * Anahtar taşınır (denetim H1/H2 · 03.08): kapı "hangi sebeple" olduğunu söylüyor (dosya türü,
   * tavan, depo) ve bunu yutup tek bir "yüklenemedi" demek, müşteriye düzeltebileceği bir şeyi
   * gizlemek olurdu — kabul edilmeyen bir dosya türünü tekrar denemenin faydası yok.
   */
  onFailed: (errorKey: string) => void;
}

interface TicketPhoto {
  /** Yüklenmiş dosyaların depo anahtarları — gönderimde mesaja iliştirilir. */
  attachments: string[];
  /** Gizli `<input type="file">`in `onChange`i. */
  pick: (event: ChangeEvent<HTMLInputElement>) => void;
  remove: (key: string) => void;
  /** Gönderim başarılı olunca çağrılır; erken çağrılırsa düşen istekte ek kaybolur. */
  reset: () => void;
}

/**
 * Anahtarı `catch`e kadar taşıyan taşıyıcı. Düz `Error` da olabilirdi ama mesajını anahtar diye
 * okumak, bir gün araya giren başka bir hatanın (ağ, JSON) mesajını ekrana anahtar sanıp
 * geçirirdi — tam da kapatmaya çalıştığımız sızıntı.
 */
class PhotoFailure extends Error {
  constructor(readonly key: string) {
    super(key);
    this.name = 'PhotoFailure';
  }
}

export function useTicketPhoto({ ticketId, busy, onFailed }: TicketPhotoOptions): TicketPhoto {
  const [attachments, setAttachments] = useState<string[]>([]);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Aynı dosya arka arkaya seçilebilsin diye alan HEMEN sıfırlanır: aynı değer ikinci bir
    // `change` doğurmaz ve müşteri "neden bir şey olmuyor" der.
    event.target.value = '';
    if (!file || busy) return;

    void requestTicketPhotoAction(ticketId, file.name, attachments.length)
      .then(async ({ data, errorKey }) => {
        if (errorKey || !data) throw new PhotoFailure(errorKey ?? 'photo_unavailable');
        const response = await fetch(data.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
        // Depoya giden PUT düştü: sebep bizim tarafımızda ve müşteriye söylenecek tek şey
        // fotoğrafın gitmediği — kapının kendi sebebi yok, bu yüzden aynı anahtara iniyor.
        if (!response.ok) throw new PhotoFailure('photo_unavailable');
        setAttachments((prev) => [...prev, data.key]);
      })
      .catch((err: unknown) => onFailed(err instanceof PhotoFailure ? err.key : 'photo_unavailable'));
  };

  return {
    attachments,
    pick,
    remove: (key) => setAttachments((prev) => prev.filter((k) => k !== key)),
    reset: () => setAttachments([]),
  };
}
