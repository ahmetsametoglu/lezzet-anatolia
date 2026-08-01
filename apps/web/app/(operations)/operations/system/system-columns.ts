import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Hata kaydı tablosunun kolon ŞERİTLERİ (O23) — genişlik/sıra/hizalama TEK KAYNAK.
 *
 * Tablo da (`error-panel`) yükleme iskeleti de (`loading.tsx`) bu diziyi okur. Bir tur beş rota
 * iskeleti bu ölçüleri elle yazmıştı ve dördü tutmuyordu: iskeletin tek işi "içerik gelince hiçbir
 * şey kaymasın" iken tam tersini yapıyordu (09.2, bağımsız ajan denetimi).
 *
 * Sıra kararın sırası: NE oldu (seviye + mesaj + yol) → NEREDE (kaynak) → NE KADAR (kez) →
 * NE ZAMAN (ilk/son) → NE YAPILACAK (işlem).
 */
export const ERROR_COLUMN_TRACKS: readonly ColumnTrack[] = [
  { key: 'error', header: 'Hata', width: 'minmax(0,1fr)' },
  { key: 'source', header: 'Kaynak', width: '104px' },
  { key: 'count', header: 'Kez', width: '52px', align: 'right' },
  { key: 'seen', header: 'İlk / son görülme', width: '150px' },
  { key: 'action', header: 'İşlem', width: '112px', align: 'right' },
];
