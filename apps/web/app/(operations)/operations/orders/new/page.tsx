import { guarded, requireAdmin } from '@/lib/guard';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { NewOrderDesktop } from './new-order.desktop';

// Elle sipariş girişi (09.8) — yalnız ADMİN, siparişler ekranının kendi guard'ıyla aynı gerekçe:
// burada fiyat ve pazarlık var, o bilgi operasyonun geri kalanına kapalıdır (tasarım §6).
//
// **Cihaz forku YOK ve olmayacak:** operasyon web yüzeyi yalnız masaüstü (CLAUDE §2, kullanıcı
// kararı 06.08); personelin mobil deneyimi native uygulamanın işi. `*-client` katmanı da yok —
// `useDevice` okunmuyorsa arada duran bir dosya sadece bir dolambaçtır.
//
// Sunucu tarafında ÖN OKUMA YAPILMIYOR ve bu bilinçli: ekranın gösterdiği her şey (müşteri, adres,
// ürün, fiyat) SEÇİME bağlı ve seçim yapılmadan hiçbiri bilinmiyor. Boş bir sayfayı doldurmak için
// katalog ya da müşteri listesi çekmek, operatörün büyük ihtimalle kullanmayacağı bir okumanın
// bedelini her açılışta ödetirdi.

export default async function NewOrderPage() {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Yeni sipariş"
        reason="Elle sipariş girişi fiyat ve pazarlık taşır; bu alan yalnız yöneticiye açıktır."
      />
    );
  }
  return <NewOrderDesktop />;
}
