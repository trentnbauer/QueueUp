import { describe, expect, it } from 'vitest';
import { coverSizeFor, sizedCoverUrl } from './primitives';

describe('sizedCoverUrl', () => {
  const igdb = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg';

  it('swaps the size segment on IGDB covers', () => {
    expect(sizedCoverUrl(igdb, 'small')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_small/co1abc.jpg');
    expect(sizedCoverUrl(igdb, 'big_2x')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1abc.jpg');
  });

  it('leaves other hosts alone, including lookalikes', () => {
    const other = 'https://evil.example/images.igdb.com/t_cover_big/x.jpg';
    expect(sizedCoverUrl(other, 'small')).toBe(other);
    expect(sizedCoverUrl('not a url', 'small')).toBe('not a url');
  });

  it('picks a size from the drawn width', () => {
    expect(coverSizeFor(40)).toBe('small');
    expect(coverSizeFor(110)).toBe('big');
    expect(coverSizeFor(190)).toBe('big_2x');
    expect(coverSizeFor('100%')).toBe('big');
  });
});
