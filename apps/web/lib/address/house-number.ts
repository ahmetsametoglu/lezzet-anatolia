/**
 * Adres aramasında KAPI NUMARASI var mı (14.09) — posta kodu (5 hane) çıkarıldıktan sonra rakam
 * kalıyor mu.
 *
 * Öneriler yalnız kapı düzeyinde (kullanıcı kararı 14.09: *"biz kapı düzeyinde bir teslimat yapmak
 * zorundayız"*) ve numarasız sokak sıfır sonuç veriyor. Form sıfır sonucu iki ayrı cümleyle karşılar:
 * numara yoksa "kapı numarasını da yazın", varsa "bulamadık" — sokak varken "bulamadık" demek var olan
 * bir adresi yok saymak olurdu. Sıraya değil varlığa bakılır: Fransız ("12 rue…") ve Alman
 * ("Hauptstraße 12") yazımı ikisi de geçer.
 */
export function hasHouseNumber(query: string): boolean {
  return /\d/.test(query.replace(/\b\d{5}\b/g, ''));
}
