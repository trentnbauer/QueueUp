import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lockPageScroll } from './Dialog';

// The web tests run without a browser, so stand in for the one thing the lock touches.
const g = globalThis as unknown as { document?: { body: { style: { overflow: string } } } };
let saved: typeof g.document;

beforeEach(() => {
  saved = g.document;
  g.document = { body: { style: { overflow: '' } } };
});
afterEach(() => {
  g.document = saved;
});

describe('lockPageScroll', () => {
  it('locks the page while a dialog is open and restores it when it closes', () => {
    const release = lockPageScroll();
    expect(g.document!.body.style.overflow).toBe('hidden');
    release();
    expect(g.document!.body.style.overflow).toBe('');
  });

  it('stays locked until the last of several stacked dialogs closes, in any order', () => {
    const first = lockPageScroll();
    const second = lockPageScroll();
    // The one opened first closes first - this used to leave the page stuck on "hidden".
    first();
    expect(g.document!.body.style.overflow).toBe('hidden');
    second();
    expect(g.document!.body.style.overflow).toBe('');
  });

  it('puts back whatever the page had before the first dialog opened', () => {
    g.document!.body.style.overflow = 'scroll';
    const release = lockPageScroll();
    release();
    expect(g.document!.body.style.overflow).toBe('scroll');
  });
});
