/*
  SES ÇALAR SAHTESİ (21.287) — paketin KENDİ jest mock'u yok (arandı: `expo-audio` içinde `mocks/`
  dizini yok, `jest-expo` de sahtelemiyor). Gerçek modül yüklendiği an yerel köprüyü arıyor ve
  testte köprü yoktur: sesli mesaj çizen her ekran testi daha `import` satırında düşüyordu
  (ölçüldü 07.09 — "Cannot read properties of undefined (reading 'prototype')").

  ── SAHTE, GERÇEK İMZANIN EN KÜÇÜĞÜDÜR (kamera sahtesinin kuralı) ───────────
  Durum "yüklendi ama çalmıyor" hâlinde durur: ekranın çizdiği düğme BASILABİLİR olur ve testler
  "çalar var mı, etiketi doğru mu" sorusunu gerçekten sorabilir. `isLoaded: false` verilseydi düğme
  hep kapalı çizilir ve o iddia sessizce anlamsızlaşırdı.

  Çalma DAVRANIŞI taklit EDİLMEZ (`play` bir `jest.fn`dir, durumu oynatmaz): sesin gerçekten
  çalması yerel bir yetenektir ve onu taklit etmek, taklidin kendisini test etmek olurdu — o
  doğrulama cihaz turunun işi (`21.287` künyesi).
*/

export const setAudioModeAsync = jest.fn().mockResolvedValue(undefined);

export const useAudioPlayer = () => ({
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
});

export const useAudioPlayerStatus = () => ({
  isLoaded: true,
  playing: false,
  /** Süre SIFIRDAN büyük: sıfır "henüz bilinmiyor" demektir ve ekran o hâlde süreyi hiç yazmaz. */
  duration: 5,
  currentTime: 0,
  isBuffering: false,
  didJustFinish: false,
});
