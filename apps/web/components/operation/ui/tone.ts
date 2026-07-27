/**
 * Operasyon anlam renkleri — KAPALI liste, tek kaynak. Renk burada anlam taşır:
 * olive=yolunda, amber=dikkat/karar, red=hata/gecikme, blue=onay/aday, neutral=kapalı/nötr.
 *
 * Yalnız SÖZLÜK ortaktır; her komponent onu kendi sınıflarına çevirir (rozet zemin+metin ister,
 * çok durumlu anahtar yalnız metin) — tek bir sınıf haritasını iki farklı işe zorlamak yerine.
 */
export type OpsTone = 'neutral' | 'olive' | 'amber' | 'red' | 'blue';
