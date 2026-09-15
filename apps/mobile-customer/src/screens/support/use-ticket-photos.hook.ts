import { MAX_ATTACHMENTS_PER_MESSAGE } from '@lezzet/domain-core';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';

import { requestTicketUpload, uploadTicketPhoto } from '@/lib/api/tickets';

/*
  TALEP FOTOĞRAFI — açılış çekmecesinin yükleme akışı (21.309). Web'in `use-ticket-photo`sunun
  native karşılığı: **imzalı adres al → PUT ile R2'ye yükle → anahtarı listeye ekle.** Dosya
  sunucumuzdan geçmez; kapı yalnız izin verir (`@lezzet/application` → `requestTicketUploadUrl`).
  Yalnız AÇILIŞTA: yazışmada ek yok (kullanıcı kararı 10.09).

  ── İKİ KAYNAK: KAMERA VE GALERİ ────────────────────────────────────────────
  Tasarım sayfası: *"Fotoğraf ekleme mobilde kameradan doğrudan yapılabilmeli (bozuk ürün
  fotoğrafı o an çekilir)"* (`design/pages/musteri-talep.md`). Galeri de gerekli: fotoğraf çoğu zaman
  önceden çekilmiştir. Galeri izin istemez (sistem seçicisi); kamera ister ve reddi SÖYLENİR.

  ── TAVAN MOTORDAN ──────────────────────────────────────────────────────────
  `MAX_ATTACHMENTS_PER_MESSAGE` (domain-core) kapının saydığı sayının kendisi; ekran ikinci bir sayı
  yazmaz. Seçici kalan kadarını açar ve yolda olan yüklemeler de sayılır.

  ── UYUMLU BİÇİM İSTENİR ────────────────────────────────────────────────────
  iOS kitaplığı HEIC verebilir ve kapı onu kabul ediyor, ama operasyonun web ekranı HEIC'i çoğu
  tarayıcıda çizemez. `Compatible` temsil iOS'tan uyumlu biçimi ister, `quality` boyu mobil veride
  makul tutar. Kapıya giden uzantı içerik TÜRÜNDEN türer, dosya adından değil: dönüşümden sonra ad
  hâlâ `.HEIC` diyebilir, tür ise gerçeği söyler.

  ── HATA HOOK'UN DEĞİL ──────────────────────────────────────────────────────
  Web'in aynı kararı: hook sebebi haber verir, cümleyi ekran seçer (sözlük ekranın).
*/

/** Ekranın cümleye çevirdiği sebepler. */
export type TicketPhotoFailure = 'unsupported' | 'limit' | 'unavailable' | 'cameraDenied';

/** Yüklenmiş fotoğraf — anahtar gönderime, yerel adres küçük resme. */
interface TicketPhoto {
  key: string;
  uri: string;
}

/** Yolda olan yükleme — küçük resmi yerinde bekler, tavana sayılır. */
interface PendingPhoto {
  id: number;
  uri: string;
}

interface UseTicketPhotosOptions {
  /** Seçim ya da yükleme düştü — cümleyi ekran kurar. */
  onFailed: (reason: TicketPhotoFailure) => void;
}

interface UseTicketPhotosResult {
  photos: TicketPhoto[];
  pending: PendingPhoto[];
  /** Daha kaç fotoğraf eklenebilir — sıfırsa seçiciler çizilmez. */
  remaining: number;
  pick: (source: 'camera' | 'library') => Promise<void>;
  remove: (key: string) => void;
}

/** Kapının adlı retleri → sebep; tabloda olmayan her şey (depo, ağ, oturum) `unavailable`. */
const UPLOAD_FAILURES: Record<string, TicketPhotoFailure> = {
  unsupported_type: 'unsupported',
  too_many: 'limit',
};

/**
 * Kapıya giden uzantı — önce içerik türünden (künye), yoksa dosya adından. Seçici ikisini de boş
 * bırakırsa `jpg` varsayılır: kapı dosyanın içeriğini okumaz, yalnız saklanan türün ipucu değişir.
 */
function extensionOf(asset: ImagePicker.ImagePickerAsset): string {
  const subtype = asset.mimeType?.split('/')[1]?.toLowerCase();
  if (subtype) return subtype === 'jpeg' ? 'jpg' : subtype;
  const dot = asset.fileName?.lastIndexOf('.') ?? -1;
  if (asset.fileName && dot > 0) return asset.fileName.slice(dot + 1).toLowerCase();
  return 'jpg';
}

export function useTicketPhotos({ onFailed }: UseTicketPhotosOptions): UseTicketPhotosResult {
  const [photos, setPhotos] = useState<TicketPhoto[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  // Aynı fotoğraf iki kez seçilebilir: yolda olanı adresinden değil kendi kimliğinden tanırız.
  const nextId = useRef(0);

  const remaining = MAX_ATTACHMENTS_PER_MESSAGE - photos.length - pending.length;

  const uploadOne = async (asset: ImagePicker.ImagePickerAsset, alreadyRequested: number): Promise<void> => {
    const id = nextId.current++;
    setPending((current) => [...current, { id, uri: asset.uri }]);
    const upload = await requestTicketUpload(`photo.${extensionOf(asset)}`, alreadyRequested);
    const sent = upload.error === null && (await uploadTicketPhoto(upload.data, asset.uri));
    setPending((current) => current.filter((item) => item.id !== id));

    if (upload.error !== null) {
      onFailed(UPLOAD_FAILURES[upload.error] ?? 'unavailable');
      return;
    }
    if (!sent) {
      onFailed('unavailable');
      return;
    }
    setPhotos((current) => [...current, { key: upload.data.key, uri: asset.uri }]);
  };

  const pick = async (source: 'camera' | 'library'): Promise<void> => {
    if (remaining <= 0) {
      onFailed('limit');
      return;
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        onFailed('cameraDenied');
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: remaining });
    if (result.canceled) return;

    // Seçicinin sınırı her platformda uygulanmayabilir: kalan kadarı alınır, fazlası sessizce değil
    // tavan cümlesiyle düşer.
    const accepted = result.assets.slice(0, remaining);
    if (result.assets.length > accepted.length) onFailed('limit');
    const already = photos.length + pending.length;
    accepted.forEach((asset, index) => void uploadOne(asset, already + index));
  };

  return {
    photos,
    pending,
    remaining,
    pick,
    remove: (key) => setPhotos((current) => current.filter((photo) => photo.key !== key)),
  };
}
