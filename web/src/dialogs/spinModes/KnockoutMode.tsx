import { KNOCKOUT_PAUSE_MS, knockoutAlive, knockoutHopMs, type KnockoutPlay } from '@queueup/shared';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { Counter, Cover, DANGER, Hint, MINT, MemberAvatar, Roster, Stage, WIN_RING, nameOf, secondsLeft, type ModeProps } from './shared';

/** Dark text on the mint shield pills. */
const ON_MINT = 'var(--bg)';

/** Each round's timeline: when its highlight starts, how fast it hops, and when the hit lands. */
function timeline(play: KnockoutPlay) {
  let alive = play.cards.length;
  let outs = 0;
  return play.rounds.map((r) => {
    const hopMs = knockoutHopMs(alive);
    const end = r.at + r.hops.length * hopMs;
    if (!r.blocked) {
      alive--;
      outs++;
    }
    return { ...r, hopMs, end, outN: r.blocked ? 0 : outs };
  });
}

/** 1c Knockout: a highlight hops across the pool and knocks games out until one is left. Each
 * participant can shield one game once. */
export function KnockoutMode({ play, games, members, me, now, act, mobile, settled }: ModeProps<KnockoutPlay>) {
  const t = useT();
  const rounds = timeline(play);
  const clock = settled ? Infinity : now;
  const outAt = new Map<string, number>();
  let scan: string | null = null;
  let blocked: (typeof rounds)[number] | null = null;
  for (const [i, r] of rounds.entries()) {
    if (clock >= r.end) {
      if (!r.blocked) outAt.set(r.hit, r.outN);
      else if (clock < Math.min(r.end + KNOCKOUT_PAUSE_MS, rounds[i + 1]?.at ?? Infinity)) blocked = r;
    } else if (clock >= r.at) {
      scan = r.hops[Math.min(r.hops.length - 1, Math.floor((clock - r.at) / r.hopMs))];
    }
  }
  const aliveCount = play.cards.length - outAt.size;

  // The server spends a shield as soon as it decides the round; keep showing it until the hit lands.
  const shields: Record<string, string> = { ...play.shields };
  const pendingUse = new Set<string>();
  for (const r of rounds) {
    if (r.blocked && r.blockedBy && clock < r.end) {
      shields[r.blockedBy] = r.hit;
      pendingUse.add(r.blockedBy);
    }
  }
  const used = play.usedShields.filter((u) => !pendingUse.has(u));
  const shieldersOf = (gameId: string) => Object.keys(shields).filter((u) => shields[u] === gameId);

  const serverAlive = new Set(knockoutAlive(play));
  const participant = play.participants.includes(me);
  const canShield = play.shieldsOn && participant && !play.usedShields.includes(me) && !play.winnerId && !settled;
  const myShield = shields[me];

  const cols = Math.min(4, Math.max(1, play.cards.length));
  const rows = Math.ceil(play.cards.length / cols);
  const cardH = mobile ? 112 : 150;

  let status: string;
  if (blocked) status = blocked.blockedBy === me ? t('spin.knockout.blockedYou') : t('spin.knockout.blocked', { name: nameOf(members, blocked.blockedBy ?? '', me) });
  else if (scan) status = t('spin.knockout.knocking');
  else if (play.nextRoundAt && now < play.nextRoundAt) status = t('spin.knockout.next', { s: secondsLeft(play.nextRoundAt, now) });
  else status = t('spin.knockout.knocking');

  let shieldLine: string | null = null;
  if (play.shieldsOn && participant) {
    if (used.includes(me)) shieldLine = t('spin.knockout.shieldUsed');
    else if (myShield) shieldLine = t('spin.knockout.shielding', { title: games.get(myShield)?.title ?? t('spin.fallback.aGame') });
    else shieldLine = t('spin.knockout.yourShield');
  }

  return (
    <>
      <Stage height={mobile ? rows * cardH + (rows - 1) * 8 + 24 : 372} style={{ display: 'flex', alignItems: 'center', padding: mobile ? 12 : 16 }}>
        <div style={st(`width:100%;display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${mobile ? 8 : 10}px`)}>
          {play.cards.map((c) => {
            const g = games.get(c.gameId);
            const out = outAt.get(c.gameId);
            const isWin = settled && play.winnerId === c.gameId;
            const isScan = scan === c.gameId;
            const shielders = out ? [] : shieldersOf(c.gameId);
            const tappable = canShield && !out && serverAlive.has(c.gameId);
            const v = g?.voteScore ?? 0;
            const name = g?.title ?? t('spin.fallback.game');
            return (
              <button
                key={c.gameId}
                type="button"
                disabled={!tappable}
                onClick={() => act({ type: 'shield', gameId: c.gameId })}
                aria-label={
                  out !== undefined
                    ? t('spin.knockout.ariaOut', { title: name })
                    : shielders.length
                      ? t(tappable ? 'spin.knockout.ariaShieldedShieldable' : 'spin.knockout.ariaShielded', { title: name })
                      : tappable
                        ? t('spin.knockout.ariaShieldable', { title: name })
                        : name
                }
                style={st(
                  `position:relative;display:block;width:100%;height:${cardH}px;padding:0;border:none;border-radius:12px;overflow:hidden;background:var(--surf);text-align:left;transition:transform .12s, box-shadow .1s, opacity .3s`,
                  {
                    cursor: tappable ? 'pointer' : 'default',
                    boxShadow: isWin || isScan ? WIN_RING : shielders.length ? `0 0 0 2px ${MINT}` : myShield === c.gameId ? '0 0 0 2.5px var(--text)' : 'none',
                    transform: isScan ? 'scale(1.04)' : isWin ? 'scale(1.03)' : 'none',
                    opacity: settled && !isWin && !out ? 0.35 : 1,
                  },
                )}
              >
                <Cover
                  game={g}
                  titleSize={mobile ? 10.5 : 12}
                  style={{ position: 'absolute', inset: 0, borderRadius: 0, filter: out ? 'grayscale(1) brightness(0.35)' : 'none', transition: 'filter .35s' }}
                >
                  <span style={st(`position:absolute;top:${mobile ? 6 : 8}px;left:${mobile ? 6 : 8}px;height:20px;padding:0 7px;border-radius:999px;background:oklch(0 0 0 / 0.45);color:#fff;font:600 10.5px/20px var(--font-mono)`)}>
                    {v > 0 ? `+${v}` : `${v}`}
                  </span>
                </Cover>
                {shielders.length > 0 && (
                  <span
                    style={st(`position:absolute;top:${mobile ? 30 : 8}px;right:${mobile ? 6 : 8}px;display:flex;align-items:center;gap:3px;height:22px;padding:0 3px 0 6px;border-radius:999px;font:700 11px/1 var(--font-ui)`, {
                      background: MINT,
                      color: ON_MINT,
                    })}
                  >
                    <span aria-hidden>🛡</span>
                    {shielders.map((u, i) => (
                      <MemberAvatar key={u} members={members} userId={u} size={16} style={{ marginLeft: i ? -6 : 0, border: 'none' }} />
                    ))}
                  </span>
                )}
                {out !== undefined && (
                  <span style={st('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px')}>
                    <span style={st(`padding:3px 10px;border-radius:8px;font:800 16px var(--font-display);letter-spacing:0.02em;transform:rotate(-8deg)`, { border: `2px solid ${DANGER}`, color: DANGER })}>{t('spin.knockout.out')}</span>
                    <span style={st('font:500 10.5px var(--font-mono);color:var(--muted)')}>{t('spin.knockout.outN', { n: out })}</span>
                  </span>
                )}
                {blocked?.hit === c.gameId && (
                  <span style={st('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in oklch, var(--mint) 25%, transparent)')}>
                    <span style={st('padding:4px 10px;border-radius:8px;font:800 14px var(--font-display)', { background: MINT, color: ON_MINT })}>{t('spin.knockout.blockedBadge')}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Stage>
      {!settled && (
        <div style={st('margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center')}>
          <Counter>{t('spin.knockout.left', { n: aliveCount })}</Counter>
          <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{status}</span>
          {shieldLine && <Hint>{shieldLine}</Hint>}
          {play.shieldsOn && <Roster members={members} userIds={play.participants} done={(id) => !used.includes(id)} />}
        </div>
      )}
    </>
  );
}
