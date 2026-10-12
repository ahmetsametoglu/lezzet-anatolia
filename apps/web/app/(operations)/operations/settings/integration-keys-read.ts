import 'server-only';

import { describeIntegrationSecrets, type MaskedSecret } from '@lezzet/application';
import type { IntegrationCheck } from '@lezzet/application/integration/checks';
import { resolveSecret } from '@lezzet/application/integration/secrets';
import { IntegrationSecretLogService, IntegrationSecretService, UserProfileService, serviceDb } from '@lezzet/database';
import { IntegrationSecretNameEnum, type IntegrationCheckStatus, type IntegrationSecretName } from '@lezzet/types';

/**
 * Bağlantılar sekmesinin anahtarları: maskesi ve kaynağı, son değişiklik ve defter; değerin kendisi sayfaya gelmez. Ortam değeri web
 * sürecininkidir, sunucuda bütün süreçler aynı ortam dosyasını okur.
 */
export interface IntegrationKeyView extends MaskedSecret {
  name: IntegrationSecretName;
  label: string;
  /** Vault'ta kayıtlıysa son değişiklik; değilse `null`. */
  stored: { at: string; byName: string | null } | null;
}

export interface IntegrationKeyGroupView {
  title: string;
  /** Anahtar yoksa ya da çalışmazsa duran iş; yönetici hangi anahtarın neye dokunduğunu buradan okur. */
  purpose: string;
  keys: IntegrationKeyView[];
}

/** Yazma eyleminin sonucu; `'use server'` dosyası tip taşıyamadığı için burada. */
export interface SetKeyOutcome {
  saved: boolean;
  check: IntegrationCheck;
}

export interface IntegrationKeyLogView {
  id: string;
  label: string;
  action: 'set' | 'clear' | 'copy';
  /** Yazım anındaki sınama sonucu; kaldırma ve kopyalamada yok. */
  checkStatus: IntegrationCheckStatus | null;
  at: string;
  byName: string | null;
}

export interface IntegrationKeysPanelData {
  groups: IntegrationKeyGroupView[];
  log: IntegrationKeyLogView[];
}

/** Ekrandaki sıra ve adlar; kimlik veritabanı kısıtıyla aynı ad listesidir. */
const GROUPS: ReadonlyArray<{ title: string; purpose: string; keys: ReadonlyArray<{ name: IntegrationSecretName; label: string }> }> = [
  {
    title: 'Revolut',
    purpose: 'Kartla online ödeme, kapıda kart ve aktarımlar',
    keys: [
      { name: 'revolut_secret_key', label: 'Gizli anahtar' },
      { name: 'revolut_webhook_secret', label: 'Bildirim imza anahtarı' },
    ],
  },
  {
    title: 'Pennylane',
    purpose: 'Muhasebe: alış belgeleri ve banka eşleşmesi',
    keys: [{ name: 'pennylane_api_token', label: 'API anahtarı' }],
  },
  {
    title: 'Hiboutik',
    purpose: 'Sertifikalı kasa: satışların kasaya yazımı ve gün kapanışı',
    keys: [
      { name: 'hiboutik_account', label: 'Hesap adı' },
      { name: 'hiboutik_user', label: 'Kullanıcı' },
      { name: 'hiboutik_api_key', label: 'API anahtarı' },
    ],
  },
  {
    title: 'E-posta (Resend)',
    purpose: 'Giriş kodları, sipariş ve bildirim e-postaları',
    keys: [{ name: 'resend_api_key', label: 'API anahtarı' }],
  },
  {
    title: 'Kargo (Sendcloud)',
    purpose: 'Kargo fiyatı, etiket ve gönderi takibi',
    keys: [
      { name: 'sendcloud_public_key', label: 'Açık anahtar' },
      { name: 'sendcloud_secret_key', label: 'Gizli anahtar' },
      { name: 'sendcloud_webhook_secret', label: 'Bildirim imza anahtarı' },
    ],
  },
  {
    title: 'Meta',
    purpose: 'WhatsApp, Messenger ve Instagram mesajları',
    keys: [
      { name: 'meta_access_token', label: 'Erişim jetonu' },
      { name: 'meta_page_access_token', label: 'Sayfa erişim jetonu' },
      { name: 'meta_app_secret', label: 'Uygulama sırrı' },
      { name: 'meta_webhook_verify_token', label: 'Bildirim doğrulama değeri' },
    ],
  },
  {
    title: 'Yapay zekâ',
    purpose: 'Asistan, otomatik cevap ve çeviri',
    keys: [
      { name: 'anthropic_api_key', label: 'Anthropic API anahtarı' },
      { name: 'google_ai_api_key', label: 'Google AI API anahtarı' },
    ],
  },
  {
    title: 'Dosya deposu (Cloudflare R2)',
    purpose: 'Ürün ve sayfa görselleri, müşteri ekleri',
    keys: [
      { name: 'r2_access_key_id', label: 'Erişim anahtarı kimliği' },
      { name: 'r2_secret_access_key', label: 'Gizli erişim anahtarı' },
    ],
  },
  {
    title: 'Harita (Google)',
    purpose: 'Almanya adreslerinde öneri ve doğrulama',
    keys: [{ name: 'google_maps_api_key', label: 'Sunucu API anahtarı' }],
  },
  {
    title: 'Web bildirimi',
    purpose: 'Telefona kurulu siteye anlık bildirim',
    keys: [{ name: 'web_push_private_key', label: 'Gizli VAPID anahtarı' }],
  },
];

const labelOf = (name: IntegrationSecretName): string => {
  const group = GROUPS.find((candidate) => candidate.keys.some((key) => key.name === name))!;
  return `${group.title} · ${group.keys.find((key) => key.name === name)!.label}`;
};

export async function readIntegrationKeysPanel(): Promise<IntegrationKeysPanelData> {
  const db = serviceDb();
  const [resolved, stored, log] = await Promise.all([
    describeIntegrationSecrets(db),
    new IntegrationSecretService(db).list(),
    new IntegrationSecretLogService(db).listRecent(),
  ]);
  const actorIds = [...new Set([...stored.map((row) => row.updatedBy), ...log.map((row) => row.actor)].filter((id): id is string => !!id))];
  const people = actorIds.length > 0 ? await new UserProfileService(db).listByIds(actorIds) : [];
  const nameOf = new Map(people.map((person) => [person.id, person.name]));
  const storedOf = new Map(stored.map((row) => [row.name, row]));

  return {
    groups: GROUPS.map((group) => ({
      title: group.title,
      purpose: group.purpose,
      keys: group.keys.map(({ name, label }) => {
        const row = storedOf.get(name);
        return {
          name,
          label,
          masked: resolved.get(name)?.masked ?? null,
          source: resolved.get(name)?.source ?? null,
          stored: row ? { at: row.updatedAt, byName: row.updatedBy ? (nameOf.get(row.updatedBy) ?? null) : null } : null,
        };
      }),
    })),
    log: log.map((row) => ({
      id: row.id,
      label: labelOf(row.name),
      action: row.action,
      checkStatus: row.checkStatus,
      at: row.createdAt,
      byName: row.actor ? (nameOf.get(row.actor) ?? null) : null,
    })),
  };
}

/** Sekme sayacı: tanımlı anahtar sayısı. Değer çözülmez; Vault'taki adlar ve ortam dosyası yeter. */
export async function readIntegrationKeyCount(): Promise<number> {
  const stored = await new IntegrationSecretService(serviceDb()).list();
  const vault = new Map(stored.map((row) => [row.name, 'tanımlı']));
  return IntegrationSecretNameEnum.options.filter((name) => resolveSecret(name, vault).source !== null).length;
}
