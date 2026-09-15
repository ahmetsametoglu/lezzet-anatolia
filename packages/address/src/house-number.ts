/**
 * Sorguda posta kodu dışında rakam, yani kapı numarası var mı; sıraya değil varlığa bakılır ki Fransız ve Alman yazımı ikisi de geçsin.
 * Öneri yalnız kapı düzeyinde döndüğü için form sıfır sonucu buna göre karşılar: numara yoksa "kapı numarasını da yazın", varsa "bulamadık".
 */
export function hasHouseNumber(query: string): boolean {
  return /\d/.test(query.replace(/\b\d{5}\b/g, ''));
}
