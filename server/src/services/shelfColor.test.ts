import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.hoisted(() => vi.fn());
vi.mock('../db/client.js', () => ({ prisma: { user: { update } } }));

import { setShelfColor } from './userSettings.js';

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
});

describe('setShelfColor', () => {
  it('stores a valid hex colour lowercased, and returns it', async () => {
    expect(await setShelfColor('u1', '#5A73C4')).toBe('#5a73c4');
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { shelfColor: '#5a73c4' } });
  });

  it('clears the colour with null', async () => {
    expect(await setShelfColor('u1', null)).toBeNull();
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { shelfColor: null } });
  });

  it('refuses anything that is not #rrggbb, so no style text can be stored', async () => {
    for (const bad of ['red', '#fff', '5a73c4', '#5a73c4; background:url(x)', '#gggggg', 7, undefined, {}]) {
      await expect(setShelfColor('u1', bad as never), String(bad)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(update).not.toHaveBeenCalled();
  });
});
