/**
 * Para formlarının SABİT YUVALARI (12.24 · kullanıcı seçimi "sabit yuvalar") — elle hareket ve transfer
 * gövdeleri aynı ızgarayı kullanır: iki sütun; satır 1 hesap · tutar, satır 2 tür / yön / nereye ·
 * karşı taraf / kayıttan sonra, satır 3 değer tarihi · açıklama, satır 4 etiketler (transferde yok).
 * Para'nın "Yeni hareket" penceresinde kip değişince hiçbir kutu yer değiştirmez; asistan kuyruğu aynı
 * gövdeleri aynı ızgarayla açar. Bir tur kipler satır açıp kapatıyordu: "Sınıflandırılmadı" yön için
 * yeni satır açıyor, tür kutusu kayboluyor ve karşı taraf yalnız kalıp sağ yarıyı boş bırakıyordu.
 */
export const MONEY_FORM_GRID = 'grid grid-cols-2 items-start gap-x-3 gap-y-4';
