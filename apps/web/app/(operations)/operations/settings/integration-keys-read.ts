import 'server-only';

import { IntegrationSecretLogService, IntegrationSecretService, UserProfileService, serviceDb } from '@lezzet/database';
import type { IntegrationSecretName } from '@lezzet/types';

/** Kurulum'daki bağlantı anahtarları: hangisi Vault'ta kayıtlı, son değişiklik ve defter. Değerin kendisi bu dosyadan hiç geçmez. */
export interface IntegrationKeyView {
  name: IntegrationSecretName;
  label: string;
  /** Vault'ta kayıtlıysa son değişiklik; değilse `null` ve süreçler sunucu ortamındaki değeri kullanır. */
  stored: { at: string; byName: string | null } | null;
}

export interface IntegrationKeyGroupView {
  title: string;
  keys: IntegrationKeyView[];
}

export interface IntegrationKeyLogView {
  id: string;
  label: string;
  action: 'set' | 'clear';
  at: string;
  byName: string | null;
}

export interface IntegrationKeysPanelData {
  groups: IntegrationKeyGroupView[];
  log: IntegrationKeyLogView[];
}

/** Ekrandaki sıra ve adlar; kimlik veritabanı kısıtıyla aynı ad listesidir. */
const GROUPS: ReadonlyArray<{ title: string; keys: ReadonlyArray<{ name: IntegrationSecretName; label: string }> }> = [
  {
    title: 'Revolut',
    keys: [
      { name: 'revolut_secret_key', label: 'Gizli anahtar' },
      { name: 'revolut_webhook_secret', label: 'Bildirim imza anahtarı' },
    ],
  },
  { title: 'Pennylane', keys: [{ name: 'pennylane_api_token', label: 'API anahtarı' }] },
  {
    title: 'Hiboutik',
    keys: [
      { name: 'hiboutik_account', label: 'Hesap adı' },
      { name: 'hiboutik_user', label: 'Kullanıcı' },
      { name: 'hiboutik_api_key', label: 'API anahtarı' },
    ],
  },
  { title: 'E-posta (Resend)', keys: [{ name: 'resend_api_key', label: 'API anahtarı' }] },
];

const labelOf = (name: IntegrationSecretName): string => {
  const group = GROUPS.find((candidate) => candidate.keys.some((key) => key.name === name))!;
  return `${group.title} · ${group.keys.find((key) => key.name === name)!.label}`;
};

export async function readIntegrationKeysPanel(): Promise<IntegrationKeysPanelData> {
  const db = serviceDb();
  const [stored, log] = await Promise.all([new IntegrationSecretService(db).list(), new IntegrationSecretLogService(db).listRecent()]);
  const actorIds = [...new Set([...stored.map((row) => row.updatedBy), ...log.map((row) => row.actor)].filter((id): id is string => !!id))];
  const people = actorIds.length > 0 ? await new UserProfileService(db).listByIds(actorIds) : [];
  const nameOf = new Map(people.map((person) => [person.id, person.name]));
  const storedOf = new Map(stored.map((row) => [row.name, row]));

  return {
    groups: GROUPS.map((group) => ({
      title: group.title,
      keys: group.keys.map(({ name, label }) => {
        const row = storedOf.get(name);
        return {
          name,
          label,
          stored: row ? { at: row.updatedAt, byName: row.updatedBy ? (nameOf.get(row.updatedBy) ?? null) : null } : null,
        };
      }),
    })),
    log: log.map((row) => ({
      id: row.id,
      label: labelOf(row.name),
      action: row.action,
      at: row.createdAt,
      byName: row.actor ? (nameOf.get(row.actor) ?? null) : null,
    })),
  };
}
