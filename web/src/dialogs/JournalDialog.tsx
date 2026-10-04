import { useNavigate } from 'react-router';
import { useUi } from '../context/UiContext';
import { JournalList } from '../home/JournalList';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';

/** Play journal (#802): what happened to which game, across your shelf and all your rooms (from
 * Settings), or one room (from its settings; rooms also have it as their 📖 tab). */
export function JournalDialog({ roomId }: { roomId?: string }) {
  const ui = useUi();
  const navigate = useNavigate();
  return (
    <Dialog onClose={() => ui.closeDialog('journal')} title={roomId ? 'Room play journal' : 'Play journal'} height="tall" gap={20}>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>
        {roomId ? 'Every status change to this room’s games, by day, and who made it.' : 'Every status change you made, by day, on your shelf and in your rooms.'} Time
        played comes from Steam or Playnite where QueueUp has it.
      </span>
      <JournalList
        roomId={roomId}
        onOpen={(e) => {
          ui.closeDialog('journal');
          // The game may be on the shelf or in another room: go there before opening it.
          navigate(e.roomId ? `/room/${e.roomId}` : '/');
          ui.selectGame(e.gameId);
        }}
      />
    </Dialog>
  );
}
