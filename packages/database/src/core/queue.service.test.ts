import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { RegisterQueueService } from '../services/register.service';
import { mustDelete } from '../testing/cleanup';

/*
  Kuyruk tabanı kasa kuyruğu üzerinden sınanır; hareket kolonunda yabancı anahtar olmadığı için satır hareketsiz kurulur.
*/

const db = serviceDb();
const queue = new RegisterQueueService(db);
const movementId = randomUUID();

afterAll(async () => {
  await mustDelete(db, 'register_queue', (q) => q.eq('movement_id', movementId));
});

const rowOf = async () => (await queue.listAll()).find((row) => row.movementId === movementId) ?? null;

describe('kuyruk satırının ertelenmesi ve tamamlanması', () => {
  it('işlenirken yeniden işaretlenen satır ertelemeyi beklemez ve silinmez; yeni değişiklik dış sisteme yine yazılır', async () => {
    await queue.markMovements([movementId]);
    const taken = (await rowOf())!;

    // İşlem sürerken tetikleyici satırı yeniden işaretler.
    const remarkedAt = new Date(Date.parse(taken.markedAt) + 1_000).toISOString();
    const { error } = await db.from('register_queue').update({ marked_at: remarkedAt }).eq('id', taken.id);
    if (error) throw error;

    await queue.defer(taken, { attempts: 1, nextAttemptAt: '2999-01-01T00:00:00Z', lastError: 'dış sistem yanıt vermedi' });
    const deferred = (await rowOf())!;
    expect(Date.parse(deferred.nextAttemptAt)).toBe(Date.parse(remarkedAt));

    await queue.complete(taken.id, taken.markedAt);
    expect(await rowOf()).not.toBeNull();
    await queue.complete(deferred.id, deferred.markedAt);
    expect(await rowOf()).toBeNull();
  });
});
