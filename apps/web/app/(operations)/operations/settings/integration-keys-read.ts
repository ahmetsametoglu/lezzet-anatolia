import 'server-only';

import { describeIntegrationSecrets, type MaskedSecret } from '@lezzet/application';
import type { IntegrationCheck } from '@lezzet/application/integration/checks';
import { resolveSecret } from '@lezzet/application/integration/secrets';
import { IntegrationSecretLogService, IntegrationSecretService, UserProfileService, serviceDb } from '@lezzet/database';
import { IntegrationSecretNameEnum, type IntegrationCheckStatus, type IntegrationSecretName } from '@lezzet/types';
import { INTEGRATION_KEY_GROUPS } from './integration-keys-layout';

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
  /** Yönetici hangi anahtarın neye dokunduğunu buradan okur. */
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

const labelOf = (name: IntegrationSecretName): string => {
  const group = INTEGRATION_KEY_GROUPS.find((candidate) => candidate.keys.some((key) => key.name === name))!;
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
    groups: INTEGRATION_KEY_GROUPS.map((group) => ({
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
