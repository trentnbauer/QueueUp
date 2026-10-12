import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { LegalConfig } from '@queueup/shared';
import { apiGet } from '../api/client';
import { Wordmark } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

export const H1 = 'font:700 clamp(30px,6vw,44px)/1.05 var(--font-display);letter-spacing:-0.03em;margin:0';
export const H2 = 'font:700 22px var(--font-display);letter-spacing:-0.02em;margin:0';
export const P = 'font:400 14.5px/1.6 var(--font-ui);color:var(--text2);margin:0;text-wrap:pretty';
const LI = 'font:400 14.5px/1.55 var(--font-ui);color:var(--text2)';
const LINK = 'color:var(--accText)';

/** The operator's contact and any replacement texts (#1097). Falls back to the built-in text while
 * loading or if the server cannot say. */
export function useLegal(): LegalConfig {
  const { data } = useQuery({ queryKey: ['legal'], queryFn: () => apiGet<LegalConfig>('/api/legal'), staleTime: 5 * 60_000 });
  return data ?? { contact: null, terms: null, privacy: null };
}

/** A contact that is a web address or an email address becomes a link; anything else stays text. */
export function ContactLink({ contact }: { contact: string }): ReactNode {
  if (/^https?:\/\//i.test(contact)) {
    return (
      <a href={contact} target="_blank" rel="noopener noreferrer" style={st(LINK)}>
        {contact}
      </a>
    );
  }
  if (/^[^\s@]+@[^\s@]+$/.test(contact)) return <a href={`mailto:${contact}`} style={st(LINK)}>{contact}</a>;
  return <>{contact}</>;
}

/** The page frame shared by the terms and privacy pages: logo, back button, title. */
export function LegalShell({ signedIn, title, children }: { signedIn: boolean; title: string; children: ReactNode }): ReactNode {
  const t = useT();
  return (
    <div style={st('min-height:100vh;background:var(--bg);color:var(--text)')}>
      <div style={st('max-width:760px;margin:0 auto;padding:0 clamp(16px,4vw,40px) 64px;display:flex;flex-direction:column;gap:32px')}>
        <div style={st('display:flex;align-items:center;gap:10px;height:68px')}>
          <Link to="/" style={st('flex:1;display:flex;text-decoration:none')}>
            <Wordmark size={23} />
          </Link>
          <Link to="/" style={st('height:40px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 13.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
            {signedIn ? t('pages.common.backToQueueUp') : t('pages.common.signIn')}
          </Link>
        </div>
        <h1 style={st(H1)}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Inline Markdown: **bold**, `code` and [text](https://link). Only http(s) and mailto links are
 * made links; nothing else in the text is ever treated as markup. */
export function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link && /^(https?:\/\/|mailto:)/i.test(link[2])) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" style={st(LINK)}>
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Renders an operator's Markdown file: #, ## and ### headings, "-" or "*" lists, paragraphs (a blank
 * line ends one), and the inline marks above. Deliberately small; HTML in the file is shown as text. */
export function Markdown({ source }: { source: string }): ReactNode {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push(<p key={blocks.length} style={st(P)}>{inline(paragraph.join(' '))}</p>);
      paragraph = [];
    }
    if (items.length > 0) {
      blocks.push(
        <ul key={blocks.length} style={st('margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px')}>
          {items.map((item, i) => <li key={i} style={st(LI)}>{inline(item)}</li>)}
        </ul>,
      );
      items = [];
    }
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push(<h2 key={blocks.length} style={st(heading[1].length === 1 ? H1 : H2)}>{inline(heading[2])}</h2>);
    } else if (item) {
      if (paragraph.length > 0) flush();
      items.push(item[1]);
    } else {
      if (items.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <>{blocks}</>;
}
