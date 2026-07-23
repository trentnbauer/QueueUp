import { authApi } from '../api/auth';
import { Logo } from '../components/Logo';
import styles from './LoginView.module.css';

const PROVIDER_LABEL: Record<string, string> = {
  oidc: 'Sign in',
  google: 'Sign in with Google',
  discord: 'Sign in with Discord',
  steam: 'Sign in with Steam',
};

const FEATURES = [
  { emoji: '🎮', text: 'Track your backlog across every platform you own' },
  { emoji: '🗳️', text: "Vote with your squad on what's up next" },
  { emoji: '🎡', text: "Spin the Wheel when nobody can decide" },
  { emoji: '💸', text: 'Watch prices and auto-sync Steam achievements' },
] as const;

function LoginButton({ provider }: { provider: string }) {
  return (
    <a href={authApi.loginUrl(provider)} className={styles.loginButton}>
      {PROVIDER_LABEL[provider] ?? `Sign in with ${provider}`}
    </a>
  );
}

interface LoginViewProps {
  /** null while still loading, [] once loaded with no provider configured (falls back to the
   * dev-only login link) - see App.tsx's fetch of GET /api/auth/providers. */
  providers: string[] | null;
}

/** The signed-out landing page - gives a first-time visitor enough context to know what QueueUp
 * actually is before asking them to hand over an OAuth login, rather than a bare row of
 * provider buttons with no explanation. */
export function LoginView({ providers }: LoginViewProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Logo size={56} />
        <h1 className={styles.title}>QueueUp</h1>
        <p className={styles.tagline}>Pick a game, together.</p>

        <ul className={styles.features}>
          {FEATURES.map((f) => (
            <li key={f.text} className={styles.feature}>
              <span className={styles.featureEmoji} aria-hidden="true">
                {f.emoji}
              </span>
              {f.text}
            </li>
          ))}
        </ul>

        <div className={styles.loginButtons}>
          {providers === null ? null : providers.length > 0 ? (
            providers.map((p) => <LoginButton key={p} provider={p} />)
          ) : (
            <LoginButton provider="dev" />
          )}
        </div>
      </div>
    </div>
  );
}
