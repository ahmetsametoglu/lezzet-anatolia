import type { DocumentKind, DocumentVatRegime, MovementDirection } from '@lezzet/types';

/*
  BELGE SÖZLÜĞÜNÜN OKUNUR ADLARI — belge formu, Para ekranının listesi, muhasebeci dökümü ve asistan
  kuyruğunun belge gövdesi aynı adları okur (12.26'da Para sayfasının `finance-labels`ından buraya
  taşındı: form ortak bileşene ayrılınca kuyruk sayfası Para sayfasından import edemezdi — kardeş
  sayfa importu yasak, `STACK §7`).
*/

/** Belge türü — seçicide, satırda ve dökümde (12.12). */
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  invoice: 'Fatura',
  receipt: 'Fiş',
  payslip: 'Bordro',
  contract: 'Sözleşme',
  statement: 'Dekont',
  other: 'Diğer belge',
};

/** Belgenin yönü — "kime borçluyuz / kim bize borçlu" diliyle, `in/out` değil. */
export const DOCUMENT_DIRECTION_LABEL: Record<MovementDirection, string> = {
  out: 'Biz ödeyeceğiz',
  in: 'Bize ödenecek',
};

/** KDV rejimi (12.26) — seçicide, satırın rozetinde ve dökümün sütununda. */
export const VAT_REGIME_LABEL: Record<DocumentVatRegime, string> = {
  standard: 'Standart',
  reverse_charge: 'Ters yükleme',
  exempt: 'Muaf',
};

/** Rejimin tek satırlık açıklaması — seçicinin altında okunur; operatör neyi seçtiğini bilsin. */
export const VAT_REGIME_HINT: Record<DocumentVatRegime, string> = {
  standard: 'Belge KDV’yi kendisi taşır.',
  reverse_charge: 'Belgede KDV yok; Fransız KDV’si bizim beyanımızda hesaplanır (autoliquidation).',
  exempt: 'KDV’den muaf — sigorta primi, banka masrafı.',
};
