import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/**
 * Ürünler tablosunun kolon ŞERİTLERİ — genişlik, sıra, hizalama ve başlık.
 *
 * Burada, ekran dosyasında değil, çünkü İKİ tüketeni var: gerçek tablo (`withCells` ile hücreleri
 * takılır) ve rota iskeleti (`loading.tsx` → `SkeletonTable`). Bir tur iskelet bu ölçüleri ELLE
 * yazmıştı ve tutmuyordu — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini
 * yapıyordu. Ölçü iki yerde yaşadığı sürece her kolon değişikliğinde tekrar olurdu (CLAUDE.md §1).
 *
 * Dosya JSX TAŞIMAZ ve `'use client'` DEĞİL: sunucuda çizilen `loading.tsx` bunu ek bir istemci
 * paketi sürüklemeden okuyabilsin.
 */
/**
 * Kolonlar KARARIN alanları: operatör "bu ürün satılabilir mi, nesi eksik" sorusunu satırdan
 * yanıtlayabilmeli. Eski şerit dört kolondu (ürün · varyant sayısı · diller · durum) ve cevabı
 * yalnız seçip sağ panele, oradan iki ayrı bakış diyaloğuna giderek veriyordu.
 *
 * "Diller" kolonu KALKTI, yerine `decl` geldi: dil doluluğu beyanın beş parçasından biridir ve
 * göstergenin ilk harfi (D) onu zaten söyler — ayrı kolon aynı gerçeği iki kez çizerdi.
 *
 * En yakın son tarih burada YOK (kullanıcı kararı): onu okumak parti satırlarını çekmek demek ve
 * liste bunu satır başına ödeyemez — satır açılınca boy boy gelir.
 */
export const PRODUCTS_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'name', header: 'Ürün', width: 'minmax(240px,1.6fr)' },
  { key: 'variants', header: 'Boylar', width: '150px' },
  { key: 'stock', header: 'Stok', width: '132px', align: 'right' },
  { key: 'price', header: 'Fiyat · marj', width: '158px', align: 'right' },
  { key: 'decl', header: 'Beyan', width: '126px', align: 'center' },
  { key: 'ship', header: 'Sevk', width: '116px' },
  { key: 'status', header: 'Durum', width: '94px', align: 'right' },
  // Boy kırılımını açan düğmenin sütunu; başlığı yok, çünkü başlık bir şey söylemezdi.
  { key: 'expand', header: '', width: '28px', align: 'center' },
];
