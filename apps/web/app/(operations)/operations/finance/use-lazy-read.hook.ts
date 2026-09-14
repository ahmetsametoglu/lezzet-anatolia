import { useRef, useState } from 'react';

/**
 * Menü AÇILINCA okunan veri (12.21) — satırın eşleştirme ve ödeme menüleri adaylarını her açılışta
 * yeniden ister: sayfa her satırın adaylarını önceden okumaz (50 satır 50 tur ederdi) ve yazımdan sonra
 * açılan menü bayat kalmaz. Üst üste iki açılışta geç gelen eski cevap yenisini ezmez.
 */
export function useLazyRead<T>(read: () => Promise<{ data: T | null; error: string | null }>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = () => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    void read()
      .then((result) => {
        if (request !== latest.current) return;
        setData(result.data);
        setError(result.error);
      })
      // Action'lar sonuç döner, fırlatmaz; buraya düşen şey bağlantı kopmasıdır — sessiz geçilmez, menüde okunur.
      .catch(() => {
        if (request === latest.current) setError('Okunamadı — bağlantıyı denetleyip menüyü yeniden açın.');
      })
      .finally(() => {
        if (request === latest.current) setLoading(false);
      });
  };

  return { data, loading, error, load };
}
