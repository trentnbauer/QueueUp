import { useState } from 'react';
import { SPIN_WHEEL_THEMES } from '@queueup/shared';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { ColourPicker } from '../ui/ColourPicker';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, ChipToggle, Group, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
import { BACKLOG_SORT_OPTIONS, toggleBacklogSort, useBacklogSort } from '../home/backlogSort';
import { usePlayNextTab } from '../home/playNextTab';
import { useRoomsInPlaying } from '../home/roomsInPlaying';
import { useShelfSpinTheme } from '../home/shelfSpinTheme';
import { NavRow } from './SettingsParts';
import { useT } from '../i18n';
import { spinThemeHint, spinThemeLabel } from '../i18n/labels';

/** The shelf's Spin type: the reel or one of the spin modes, or a random one each time. */
function ShelfSpinTypeDialog({ onClose }: { onClose: () => void }) {
  const ui = useUi();
  const t = useT();
  const [theme, setTheme] = useShelfSpinTheme();
  return (
    <Dialog onClose={onClose} title={t('settings.shelf.spinType')} gap={12}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{spinThemeHint(theme)}</span>
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
        {SPIN_WHEEL_THEMES.map((th) => (
          <ChipToggle
            key={th}
            on={theme === th}
            onClick={() => {
              setTheme(th);
              ui.notify(t('settings.shelf.spinType.toast', { theme: spinThemeLabel(th) }));
            }}
          >
            {th === 'random' ? t('settings.shelf.spinType.random') : spinThemeLabel(th)}
          </ChipToggle>
        ))}
      </div>
    </Dialog>
  );
}

export function ShelfSettingsDialog() {
  const ui = useUi();
  const t = useT();
  const { games } = useScope();
  const [backlogSort, setBacklogSort] = useBacklogSort();
  const [playNextIn, setPlayNextIn] = usePlayNextTab();
  const [roomsInPlaying, setRoomsInPlaying] = useRoomsInPlaying();
  const { shelfColor, refetch } = useAuth();
  const saveColour = async (colour: string | null) => {
    try {
      await authApi.setShelfColor(colour);
      await refetch();
      ui.notify(t('settings.shelfColour.saved'));
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : t('settings.shelfColour.failed'));
    }
  };
  const [spinTheme] = useShelfSpinTheme();
  const [spinOpen, setSpinOpen] = useState(false);

  return (
    <>
    <Dialog onClose={() => ui.closeDialog('shelfSettings')} title={t('settings.shelf.title')} gap={24}>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelfColour.title')}</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.shelfColour.hint')}</span>
        <ColourPicker value={shelfColor} onChange={(c) => void saveColour(c)} allowClear label={t('settings.shelfColour.title')} />
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.sortBy')}</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.shelf.sortHint')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {BACKLOG_SORT_OPTIONS.map((o) => {
            const rank = backlogSort.indexOf(o.key) + 1;
            return (
              <ChipToggle key={o.key} on={rank > 0} height={36} onClick={() => setBacklogSort(toggleBacklogSort(backlogSort, o.key))}>
                {backlogSort.length > 1 && rank > 0 && (
                  <span aria-label={t('settings.shelf.priority', { n: rank })} style={st('margin-right:6px;font:700 11px var(--font-mono);opacity:0.7')}>{rank}</span>
                )}
                {o.label}
              </ChipToggle>
            );
          })}
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.playNextIn')}</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.shelf.playNextInHint')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          <ChipToggle on={playNextIn === 'playing'} height={36} onClick={() => setPlayNextIn('playing')}>{t('home.tab.playing')}</ChipToggle>
          <ChipToggle on={playNextIn === 'backlog'} height={36} onClick={() => setPlayNextIn('backlog')}>{t('home.tab.backlog')}</ChipToggle>
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.roomsInPlaying')}</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.shelf.roomsInPlayingHint')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          <ChipToggle on={roomsInPlaying} height={36} onClick={() => setRoomsInPlaying(!roomsInPlaying)}>{t('settings.shelf.roomsInPlayingChip')}</ChipToggle>
        </div>
      </div>
      <Group>
        <NavRow label={t('settings.shelf.spinType')} sub={spinThemeLabel(spinTheme)} onClick={() => setSpinOpen(true)} />
      </Group>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.export', { n: games.length })}</Kicker>
        <div style={st('display:flex;gap:8px')}>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'csv', 'personal-shelf')}>{t('settings.shelf.exportCsv')}</Btn>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'json', 'personal-shelf')}>{t('settings.shelf.exportJson')}</Btn>
        </div>
      </div>
    </Dialog>
    {spinOpen && <ShelfSpinTypeDialog onClose={() => setSpinOpen(false)} />}
    </>
  );
}
