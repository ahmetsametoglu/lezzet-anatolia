import type { IntegrationSecretName } from '@lezzet/types';

/**
 * Bağlantılar'ın kartları, tasarımdaki sırayla; her anahtar adı tam bir kartta durur. Etiket, sağlayıcının anahtarı verdiği sayfadaki
 * addır ki değer kopyalanırken iki ekran arasında çeviri aranmasın.
 */
export const INTEGRATION_KEY_GROUPS: ReadonlyArray<{
  title: string;
  /** Anahtar yoksa ya da çalışmazsa duran iş. */
  purpose: string;
  keys: ReadonlyArray<{ name: IntegrationSecretName; label: string }>;
}> = [
  {
    title: 'Revolut',
    purpose: 'Kartla online ödeme, kapıda kart ve aktarımlar',
    keys: [
      { name: 'revolut_secret_key', label: 'Secret key' },
      { name: 'revolut_webhook_secret', label: 'Webhook signing secret' },
    ],
  },
  {
    title: 'Kargo (Sendcloud)',
    purpose: 'Kargo fiyatı, etiket ve gönderi takibi',
    keys: [
      { name: 'sendcloud_public_key', label: 'Public Key' },
      { name: 'sendcloud_secret_key', label: 'Secret Key' },
      { name: 'sendcloud_webhook_secret', label: 'Webhook Signature Key' },
    ],
  },
  {
    title: 'Pennylane',
    purpose: 'Muhasebe: alış belgeleri ve banka eşleşmesi',
    keys: [{ name: 'pennylane_api_token', label: 'API token' }],
  },
  {
    title: 'Meta',
    purpose: 'WhatsApp, Messenger ve Instagram mesajları',
    keys: [
      { name: 'meta_access_token', label: 'Access token' },
      { name: 'meta_page_access_token', label: 'Page access token' },
      { name: 'meta_app_secret', label: 'App secret' },
      { name: 'meta_webhook_verify_token', label: 'Verify token' },
    ],
  },
  {
    title: 'Hiboutik',
    purpose: 'Sertifikalı kasa: satışların kasaya yazımı ve gün kapanışı',
    keys: [
      { name: 'hiboutik_account', label: 'Account name' },
      { name: 'hiboutik_user', label: 'Username' },
      { name: 'hiboutik_api_key', label: 'API key' },
    ],
  },
  {
    title: 'Yapay zekâ',
    purpose: 'Asistan, otomatik cevap ve çeviri',
    keys: [
      { name: 'anthropic_api_key', label: 'Anthropic API key' },
      { name: 'google_ai_api_key', label: 'Gemini API key' },
    ],
  },
  {
    title: 'E-posta (Resend)',
    purpose: 'Giriş kodları, sipariş ve bildirim e-postaları',
    keys: [{ name: 'resend_api_key', label: 'API key' }],
  },
  {
    title: 'Dosya deposu (Cloudflare R2)',
    purpose: 'Ürün ve sayfa görselleri, müşteri ekleri',
    keys: [
      { name: 'r2_access_key_id', label: 'Access Key ID' },
      { name: 'r2_secret_access_key', label: 'Secret Access Key' },
    ],
  },
  {
    title: 'Harita (Google)',
    purpose: 'Almanya adreslerinde öneri ve doğrulama',
    keys: [{ name: 'google_maps_api_key', label: 'API key' }],
  },
  {
    title: 'Web bildirimi',
    purpose: 'Telefona kurulu siteye anlık bildirim',
    keys: [{ name: 'web_push_private_key', label: 'Private Key' }],
  },
];
