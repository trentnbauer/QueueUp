import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { ContactLink, H2, LegalShell, Markdown, P, inline, useLegal } from './legal';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={st('display:flex;flex-direction:column;gap:10px')}>
      <h2 style={st(H2)}>{title}</h2>
      {children}
    </section>
  );
}

/** `/terms`: the terms of use for this server (#1097). The text below is a starting template; an
 * operator can replace it with their own Markdown file (TERMS_FILE). Reachable signed out. */
export function TermsPage({ signedIn }: { signedIn: boolean }): ReactNode {
  const t = useT();
  const legal = useLegal();
  const paras = (...keys: MessageKey[]) => keys.map((k) => <p key={k} style={st(P)}>{inline(t(k))}</p>);

  if (legal.terms) {
    return (
      <LegalShell signedIn={signedIn} title={t('pages.terms.title')}>
        <Markdown source={legal.terms} />
      </LegalShell>
    );
  }

  return (
    <LegalShell signedIn={signedIn} title={t('pages.terms.title')}>
      <p style={st(P)}>{t('pages.terms.intro')}</p>
      <Section title={t('pages.terms.account.title')}>{paras('pages.terms.account.body1', 'pages.terms.account.body2')}</Section>
      <Section title={t('pages.terms.content.title')}>{paras('pages.terms.content.body')}</Section>
      <Section title={t('pages.terms.conduct.title')}>
        <ul style={st('margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px')}>
          {(['pages.terms.conduct.item1', 'pages.terms.conduct.item2', 'pages.terms.conduct.item3'] as const).map((k) => (
            <li key={k} style={st('font:400 14.5px/1.55 var(--font-ui);color:var(--text2)')}>{t(k)}</li>
          ))}
        </ul>
      </Section>
      <Section title={t('pages.terms.services.title')}>
        {paras('pages.terms.services.body')}
        <p style={st(P)}>
          <Link to="/privacy" style={st('color:var(--accText)')}>{t('pages.terms.privacy.link')}</Link> {t('pages.terms.privacy.after')}
        </p>
      </Section>
      <Section title={t('pages.terms.warranty.title')}>{paras('pages.terms.warranty.body')}</Section>
      <Section title={t('pages.terms.changes.title')}>{paras('pages.terms.changes.body')}</Section>
      <Section title={t('pages.terms.contact.title')}>
        <p style={st(P)}>{legal.contact ? <>{t('pages.terms.contact.body')} <ContactLink contact={legal.contact} /></> : t('pages.terms.contact.none')}</p>
      </Section>
    </LegalShell>
  );
}
