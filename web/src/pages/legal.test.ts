import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, inline } from './legal';

const html = (node: unknown) => renderToStaticMarkup(createElement('div', null, node as never));

describe('inline', () => {
  it('formats bold and code and links web addresses', () => {
    expect(html(inline('**hi** `x` [site](https://example.com/a)'))).toBe(
      '<div><b>hi</b> <code>x</code> <a href="https://example.com/a" target="_blank" rel="noopener noreferrer" style="color:var(--accText)">site</a></div>',
    );
  });

  it('never makes a link out of a javascript: address', () => {
    expect(html(inline('[x](javascript:alert(1))'))).not.toContain('<a');
  });
});

describe('Markdown', () => {
  it('renders headings, paragraphs and lists, and shows HTML as text', () => {
    const out = html(createElement(Markdown, { source: '# Title\n\nFirst line\ncontinues\n\n- one\n- two\n\n<script>alert(1)</script>' }));
    expect(out).toContain('>Title</h2>');
    expect(out).toContain('First line continues');
    expect(out).toContain('<li');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });
});
