import type { Game, GameStatus } from '@queueup/shared';
import { useAuth } from '../../context/AuthContext';
import { useT, type MessageKey } from '../../i18n';
import { AchievementsSheet, JournalSheet, SeriesSheet, SpecsSheet, TagsSheet, TimeToBeatSheet } from './InfoSheets';
import { DlcSheet, PlayAfterSheet, type DlcTarget } from './ListSheets';
import { FixMatchSheet, MoreSheet, type MoreTarget } from './MoreSheet';
import { PriceAlertSheet, PriceHistorySheet } from './PriceSheets';
import { Sheet, type SheetKind } from './Sheet';
import { StatusPicker } from './StatusPicker';
import { useCanRemoveDirectly } from './Footer';

const TITLE: Record<SheetKind, MessageKey> = {
  status: 'card.status.setTitle',
  price: 'card.rows.priceHistory',
  alert: 'card.more.alert',
  after: 'game.detail.playAfter',
  dlc: 'card.rows.dlc',
  ttb: 'card.rows.ttb',
  specs: 'game.reqs.title',
  more: 'card.rows.more',
  journal: 'card.more.journal',
  tags: 'game.detail.tags',
  achievements: 'card.more.achievements',
  series: 'card.more.series',
  fix: 'card.more.fixMatch',
};

export interface SheetHostProps {
  game: Game;
  kind: SheetKind | null;
  desktop: boolean;
  /** Open another sheet (e.g. from More), or null to close. */
  setKind: (kind: SheetKind | null) => void;
  onPickStatus: (status: GameStatus) => void;
  onOpenReview: () => void;
  /** Only the main card has a DLC list and the fix-it tools. */
  onOpenDlc?: (target: DlcTarget) => void;
  onRematch?: () => void;
  onSteamMatch?: () => void;
  onDuplicate?: () => void;
  onBundle?: () => void;
}

/** Renders whichever sheet is open over a card. */
export function SheetHost({ game, kind, desktop, setKind, onPickStatus, onOpenReview, onOpenDlc, onRematch, onSteamMatch, onDuplicate, onBundle }: SheetHostProps) {
  const t = useT();
  const { user } = useAuth();
  const canFix = useCanRemoveDirectly(game);
  if (!kind) return null;
  const close = () => setKind(null);

  let body: React.ReactNode = null;
  switch (kind) {
    case 'status':
      body = <StatusPicker game={game} onPick={onPickStatus} />;
      break;
    case 'price':
      body = <PriceHistorySheet game={game} />;
      break;
    case 'alert':
      body = <PriceAlertSheet game={game} />;
      break;
    case 'after':
      body = <PlayAfterSheet game={game} onDone={close} />;
      break;
    case 'dlc':
      body = onOpenDlc ? <DlcSheet game={game} onOpen={onOpenDlc} /> : null;
      break;
    case 'ttb':
      body = <TimeToBeatSheet game={game} />;
      break;
    case 'specs':
      body = <SpecsSheet game={game} />;
      break;
    case 'journal':
      body = <JournalSheet game={game} />;
      break;
    case 'tags':
      body = <TagsSheet game={game} />;
      break;
    case 'achievements':
      body = <AchievementsSheet game={game} />;
      break;
    case 'series':
      body = <SeriesSheet game={game} />;
      break;
    case 'fix':
      body = <FixMatchSheet game={game} onRematch={() => onRematch?.()} onSteam={() => onSteamMatch?.()} />;
      break;
    case 'more':
      body = (
        <MoreSheet
          game={game}
          canTag={game.addedBy.id === user?.id}
          canFix={canFix}
          onOpenReview={() => {
            close();
            onOpenReview();
          }}
          onOpen={(target: MoreTarget) => setKind(target)}
          onDuplicate={() => onDuplicate?.()}
          onBundle={() => onBundle?.()}
        />
      );
      break;
  }
  return (
    <Sheet title={t(TITLE[kind])} desktop={desktop} side={kind === 'status' ? 'left' : 'right'} onClose={close}>
      {body}
    </Sheet>
  );
}
