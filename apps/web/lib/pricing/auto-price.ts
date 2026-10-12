import 'server-only';

// Otomatik fiyat uygulama katmanındadır, çünkü eşik işi de çağırır; web'in sunucu eylemleri bu adresten okur.
export { repriceAllAuto, repriceProduct } from '@lezzet/application/pricing/auto-price';
