import { redirect } from 'next/navigation';

/**
 * **Mal kabul artık Stok'un bir sekmesi** (22.26) — bu yol yalnız yönlendirir.
 *
 * Sayfa silinip yol da kaldırılabilirdi ama kaydedilmiş bağlantılar ve tarayıcı geçmişi kırılırdı;
 * yönlendirme, taşınan bir ekranın karşı tarafa borcudur. Kalıcı (308) değil geçici: yolun bir gün
 * tamamen kalkması ihtimalini tarayıcı önbelleğine yazmıyoruz.
 *
 * `?proposal=` DEVRİ ARTIK YOK: mal kabul önerisi kuyruğun İÇİNDE karara bağlanıyor (22.23), yani
 * bu yola yönlendiren bir düğme kalmadı. Devir okuması (`readIntakeHandoff`) ve fiyatı dilekçeden
 * eşleyen kapı (`receiveGoodsAction` + `costsForLines`) bu turda söküldü — 22.24'ün mal kabul yarısı.
 */
export default function ReceivingPage() {
  redirect('/operations/stock?tab=intake');
}
