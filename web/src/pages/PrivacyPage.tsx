import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

const H2 = 'font:700 22px var(--font-display);letter-spacing:-0.02em;margin:0';
const P = 'font:400 14.5px/1.6 var(--font-ui);color:var(--text2);margin:0;text-wrap:pretty';
const LI = 'font:400 14.5px/1.55 var(--font-ui);color:var(--text2)';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={st('display:flex;flex-direction:column;gap:10px')}>
      <h2 style={st(H2)}>{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={st('margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px')}>
      {items.map((item, i) => (
        <li key={i} style={st(LI)}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A translated paragraph with its formatting: **bold**, `code`, and {placeholders} filled from
 * `nodes` (e.g. a link). Keeps each sentence whole in the catalog, so it can be reordered. */
function md(text: string, nodes: Record<string, ReactNode> = {}): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\{\w+\})/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
  });
}

/** `/privacy`: what QueueUp stores about you and what is and isn't encrypted. Reachable signed out
 * (linked from the login page) and from Settings. */
export function PrivacyPage({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const items = (...keys: MessageKey[]) => keys.map((k) => md(t(k)));
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

        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <h1 style={st('font:700 clamp(30px,6vw,44px)/1.05 var(--font-display);letter-spacing:-0.03em;margin:0')}>{t('pages.privacy.title')}</h1>
          <p style={st(P)}>{t('pages.privacy.intro')}</p>
        </div>

        <Section title={t('pages.privacy.collect.title')}>
          <List
            items={items(
              'pages.privacy.collect.account',
              'pages.privacy.collect.profile',
              'pages.privacy.collect.library',
              'pages.privacy.collect.social',
              'pages.privacy.collect.imports',
              'pages.privacy.collect.libraries',
              'pages.privacy.collect.ai',
              'pages.privacy.collect.merges',
              'pages.privacy.collect.aiShared',
              'pages.privacy.collect.session',
              'pages.privacy.collect.email',
              'pages.privacy.collect.logs',
            )}
          />
          <p style={st(P)}>{t('pages.privacy.collect.noAds')}</p>
        </Section>

        <Section title={t('pages.privacy.encryption.title')}>
          <p style={st(P)}>
            <b>{t('pages.privacy.encryption.protected')}</b>
          </p>
          <List items={items('pages.privacy.encryption.credentials', 'pages.privacy.encryption.logins', 'pages.privacy.encryption.apiKeys', 'pages.privacy.encryption.cookie')} />
          <p style={st(P)}>
            <b>{t('pages.privacy.encryption.notProtected')}</b>
          </p>
          <List
            items={items(
              'pages.privacy.encryption.everythingElse',
              'pages.privacy.encryption.webhook',
              'pages.privacy.encryption.exophase',
              'pages.privacy.encryption.sessions',
              'pages.privacy.encryption.alertEmails',
              'pages.privacy.encryption.transit',
            )}
          />
        </Section>

        <Section title={t('pages.privacy.visibility.title')}>
          <List items={items('pages.privacy.visibility.others', 'pages.privacy.visibility.ai', 'pages.privacy.visibility.merges', 'pages.privacy.visibility.operator')} />
        </Section>

        <Section title={t('pages.privacy.services.title')}>
          <p style={st(P)}>{t('pages.privacy.services.intro')}</p>
          <List
            items={items(
              'pages.privacy.services.signIn',
              'pages.privacy.services.data',
              'pages.privacy.services.libraries',
              'pages.privacy.services.ai',
              'pages.privacy.services.discord',
              'pages.privacy.services.email',
              'pages.privacy.services.other',
            )}
          />
        </Section>

        <Section title={t('pages.privacy.analytics.title')}>
          <p style={st(P)}>{md(t('pages.privacy.analytics.intro'))}</p>
          <List
            items={[
              ...items('pages.privacy.analytics.receives', 'pages.privacy.analytics.never', 'pages.privacy.analytics.cookies', 'pages.privacy.analytics.optOut'),
              md(t('pages.privacy.analytics.handler'), {
                link: (
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accText)' }}>
                    {t('pages.privacy.analytics.googlePolicy')}
                  </a>
                ),
              }),
            ]}
          />
        </Section>

        <Section title={t('pages.privacy.choices.title')}>
          <List items={items('pages.privacy.choices.data', 'pages.privacy.choices.anytime', 'pages.privacy.choices.contact')} />
        </Section>
      </div>
    </div>
  );
}
