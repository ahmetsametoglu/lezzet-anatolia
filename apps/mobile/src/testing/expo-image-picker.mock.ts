/*
  GÖRSEL SEÇİCİ SAHTESİ (21.309) — paketin KENDİ jest mock'u yok (arandı: `expo-image-picker` içinde
  `mocks/` dizini yok, `jest-expo` de sahtelemiyor) ve gerçek modül yüklendiği an yerel köprüyü
  arıyor: talep çekmecesini çizen her test daha `import` satırında düşerdi.

  ── SAHTE, GERÇEK İMZANIN EN KÜÇÜĞÜDÜR (kamera sahtesinin kuralı) ───────────
  Varsayılan hâl "vazgeçildi": seçici açılır ama bir şey dönmez — seçimi sınayan test kendi
  varlığını `mockResolvedValueOnce` ile verir. Kamera izni varsayılan VERİLMİŞ; reddi sınayan test
  kendisi kurar. Seçme DAVRANIŞI taklit edilmez: galeri de kamera da cihazın işi, onu taklit etmek
  taklidin kendisini test etmek olurdu.
*/

const canceled = { canceled: true, assets: null };

export const launchImageLibraryAsync = jest.fn().mockResolvedValue(canceled);
export const launchCameraAsync = jest.fn().mockResolvedValue(canceled);
export const requestCameraPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' });

/** İzin durumu — gerçek modül `expo-modules-core`tan yeniden ihraç ediyor; değerler oradaki enum'un. */
export const PermissionStatus = {
  DENIED: 'denied',
  GRANTED: 'granted',
  UNDETERMINED: 'undetermined',
} as const;

/** Gerçek enum'un değerleri (`ImagePicker.types.d.ts`) — seçenek nesnesi testte de aynı şekli taşır. */
export const UIImagePickerPreferredAssetRepresentationMode = {
  Automatic: 'automatic',
  Compatible: 'compatible',
  Current: 'current',
} as const;
