import { MAX_ATTACHMENTS_PER_MESSAGE } from '@lezzet/domain-core';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';

import { requestTicketUpload, uploadTicketPhoto } from '@/lib/api/tickets';

/*
  Talep fotoğrafının yükleme akışı: imzalı adres alınır, dosya doğrudan R2'ye gider ve anahtar listeye eklenir; kapı yalnız izin verir.
  Tavan motorun sayısıdır ve yolda olan yüklemeler de sayılır; hata cümlesini ekran seçer, kanca yalnız sebebi bildirir.
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
  /** Yazışmaya eklenen fotoğrafın talebi; verilmezse açılış taslağıdır. */
  ticketId?: string;
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
  /** Mesaj gittikten sonra bir sonraki mesaj boş başlar. */
  reset: () => void;
}

/** Kapının adlı retleri → sebep; tabloda olmayan her şey (depo, ağ, oturum) `unavailable`. */
const UPLOAD_FAILURES: Record<string, TicketPhotoFailure> = {
  unsupported_type: 'unsupported',
  too_many: 'limit',
};

/**
 * Kapıya giden uzantı önce içerik türünden, çünkü dönüşümden sonra dosya adı hâlâ `.HEIC` diyebilir. İkisi de boşsa `jpg`, çünkü
 * kapı dosyanın içeriğini okumaz, yalnız saklanan türün ipucu değişir.
 */
function extensionOf(asset: ImagePicker.ImagePickerAsset): string {
  const subtype = asset.mimeType?.split('/')[1]?.toLowerCase();
  if (subtype) return subtype === 'jpeg' ? 'jpg' : subtype;
  const dot = asset.fileName?.lastIndexOf('.') ?? -1;
  if (asset.fileName && dot > 0) return asset.fileName.slice(dot + 1).toLowerCase();
  return 'jpg';
}

export function useTicketPhotos({ ticketId, onFailed }: UseTicketPhotosOptions): UseTicketPhotosResult {
  const [photos, setPhotos] = useState<TicketPhoto[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  // Aynı fotoğraf iki kez seçilebilir: yolda olanı adresinden değil kendi kimliğinden tanırız.
  const nextId = useRef(0);

  const remaining = MAX_ATTACHMENTS_PER_MESSAGE - photos.length - pending.length;

  const uploadOne = async (asset: ImagePicker.ImagePickerAsset, alreadyRequested: number): Promise<void> => {
    const id = nextId.current++;
    setPending((current) => [...current, { id, uri: asset.uri }]);
    const upload = await requestTicketUpload(`photo.${extensionOf(asset)}`, alreadyRequested, ticketId);
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

    // iOS kitaplığı HEIC verebilir ve operasyonun web ekranı onu çizemez; kalite mobil veride boyu makul tutar.
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
    reset: () => setPhotos([]),
  };
}
