import { describe, it, expect } from 'vitest';
import { ggDealsSearchUrl } from './formatPrice';

describe('ggDealsSearchUrl', () => {
  it('URL-encodes special characters in the title (issue #336)', () => {
    expect(ggDealsSearchUrl('Wolfenstein: The Old Blood')).toBe(
      'https://gg.deals/search/?title=Wolfenstein%3A%20The%20Old%20Blood',
    );
  });

  it('leaves a plain title readable in the query string', () => {
    expect(ggDealsSearchUrl('Hades')).toBe('https://gg.deals/search/?title=Hades');
  });
});
