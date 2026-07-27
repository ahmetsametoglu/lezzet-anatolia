'use client';

import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import { cropOf, type ImageCrop, type ImageCropFields } from '@lezzet/types';

/**
 * RHF ↔ `ImageCropField` köprüsü — TEK KAYNAK. Formdaki ÜÇ düz alanı (`imageFocalX/Y/Zoom`) bileşenin
 * beklediği `{x,y,zoom}` biçiminde okur, değişimi forma geri yazar. Her dialogda `form.watch(...)` üçlemesi
 * ve `setValue(...)` üçlemesi tekrarlanmasın diye buradadır (no-duplication): kırpma taşıyan her form
 * `const [crop, setCrop] = useImageCrop(form)` der ve alan adlarını bir daha yazmaz.
 *
 * Not: alan adları `ImageCropFields`'in anahtarlarıdır → şema değişirse burası tip hatası verir; adlar
 * jenerik form tipine `Path<T>` olarak indirilir (cast tek yerde, çağıranlarda değil).
 */
export function useImageCrop<T extends FieldValues>(form: UseFormReturn<T>): [ImageCrop, (crop: ImageCrop) => void] {
  const key = (k: keyof ImageCropFields) => k as Path<T>;
  const write = (k: keyof ImageCropFields, v: number) =>
    form.setValue(key(k), v as PathValue<T, Path<T>>, { shouldDirty: true });

  const fields: ImageCropFields = {
    imageFocalX: form.watch(key('imageFocalX')) as number,
    imageFocalY: form.watch(key('imageFocalY')) as number,
    imageZoom: form.watch(key('imageZoom')) as number,
  };

  const setCrop = (crop: ImageCrop) => {
    write('imageFocalX', crop.x);
    write('imageFocalY', crop.y);
    write('imageZoom', crop.zoom);
  };

  return [cropOf(fields), setCrop];
}
