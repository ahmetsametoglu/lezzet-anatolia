import { Redirect, useLocalSearchParams } from 'expo-router';

/*
  BİZE YAZIN — ARTIK SAYFA DEĞİL, TALEPLERİM EKRANININ ÇEKMECESİ (kullanıcı kararı 09.08).
  Bu dosya geriye kalan İNCE KABUKTUR: `/support`a yönlendirir ve çekmeceyi açacak işareti taşır.

  ── NEDEN SİLİNMEDİ ─────────────────────────────────────────────────────────
  Adrese bakan yalnız bu uygulama değil: uygulama içinde dört ayrı yer (`legal` SSS, geri bildirim
  ekranı, sipariş detayı, hesap menüsü) ve dışarıda paylaşılmış/derin bağlantılar bu yolu biliyor.
  Rotayı silmek onları sessizce "sayfa bulunamadı"ya düşürürdü; kabuk sayesinde hepsi doğru yere,
  üstelik çekmece açık olarak varıyor. Çağıranları tek tek değiştirmek de aynı sonucu verirdi ama
  DIŞ bağlantıyı kurtarmazdı — kural şu: yayınlanmış bir adres kaybolmaz, yönlendirilir.

  `Redirect` (push değil): yığında iz bırakmaz, yani çekmeceyi kapatan müşteri geri bastığında bu
  ara durağa dönmez.
*/
export default function NewTicketRoute() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  return <Redirect href={{ pathname: '/support', params: { new: '1', ...(order === undefined ? {} : { order }) } }} />;
}
