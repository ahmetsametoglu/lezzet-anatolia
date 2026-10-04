'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { requestTicketPhotoAction } from './actions';

/**
 * Talep fotoğrafının yükleme akışı, yeni talep ve cevap kutusu için tek yerde: imzalı adres alınır, dosya doğrudan depoya gider ve
 * anahtar listeye eklenir. Hata cümlesi çağıranın, çünkü iki ekranın da gönderim hatasıyla aynı satırı kullanan kendi hata yeri var.
 */
interface TicketPhotoOptions {
  /** Var olan talep; yeni talep formunda `null` (taslak anahtarı). */
  ticketId: string | null;
  /** Ekran meşgulken (gönderim sürüyor) yükleme başlatılmaz. */
  busy: boolean;
  /** Yükleme düştü; anahtar taşınır, çünkü kabul edilmeyen dosya türünü yeniden denemek ile geçici arızayı denemek ayrı şeyler. */
  onFailed: (errorKey: string) => void;
}

/** Yüklenmiş fotoğraf — anahtar gönderime, yerel önizleme küçük resme. */
interface UploadedPhoto {
  key: string;
  preview: string;
}

interface TicketPhoto {
  /** Yüklenmiş dosyaların depo anahtarları — gönderimde mesaja iliştirilir. */
  attachments: string[];
  photos: UploadedPhoto[];
  /** Yolda olan yükleme sayısı; sıfır değilken gönderim bekler, yoksa yarım fotoğraf mesaja girmez. */
  pending: number;
  /** Gizli `<input type="file">`in `onChange`i. */
  pick: (event: ChangeEvent<HTMLInputElement>) => void;
  remove: (key: string) => void;
  /** Gönderim başarılı olunca çağrılır; erken çağrılırsa düşen istekte ek kaybolur. */
  reset: () => void;
}

/** Anahtarı `catch`e kadar taşır; düz `Error` mesajını anahtar sanmak araya giren başka bir hatayı ekrana sızdırırdı. */
class PhotoFailure extends Error {
  constructor(readonly key: string) {
    super(key);
    this.name = 'PhotoFailure';
  }
}

export function useTicketPhoto({ ticketId, busy, onFailed }: TicketPhotoOptions): TicketPhoto {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [pending, setPending] = useState(0);
  const previews = useRef<string[]>([]);

  // Önizlemeler tarayıcının belleğinde durur; kutu kapanınca bırakılır.
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Aynı dosya arka arkaya seçilebilsin diye alan hemen sıfırlanır: aynı değer ikinci bir `change` doğurmaz.
    event.target.value = '';
    if (!file || busy) return;

    setPending((count) => count + 1);
    void requestTicketPhotoAction(ticketId, file.name, photos.length + pending)
      .then(async ({ data, errorKey }) => {
        if (errorKey || !data) throw new PhotoFailure(errorKey ?? 'photo_unavailable');
        const response = await fetch(data.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
        // Depoya giden PUT düştüyse kapının kendi sebebi yok; müşteriye söylenecek tek şey fotoğrafın gitmediği.
        if (!response.ok) throw new PhotoFailure('photo_unavailable');
        const preview = URL.createObjectURL(file);
        previews.current.push(preview);
        setPhotos((prev) => [...prev, { key: data.key, preview }]);
      })
      .catch((err: unknown) => onFailed(err instanceof PhotoFailure ? err.key : 'photo_unavailable'))
      .finally(() => setPending((count) => count - 1));
  };

  return {
    attachments: photos.map((photo) => photo.key),
    photos,
    pending,
    pick,
    remove: (key) => setPhotos((prev) => prev.filter((photo) => photo.key !== key)),
    reset: () => setPhotos([]),
  };
}
