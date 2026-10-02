import type { DocumentKind, DocumentVatRegime, MovementDirection } from '@lezzet/types';

/*
  Belge sözlüğünün okunur adları; form, Para listesi, döküm ve asistan kuyruğu aynı adları okur. Para sayfasında değil
  burada durur çünkü kardeş sayfa içe aktarımı yasak (`STACK §7`).
*/

/** Belge türü — seçicide, satırda ve dökümde. */
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

/** KDV rejimi — seçicide, satırın rozetinde ve dökümün sütununda. */
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
