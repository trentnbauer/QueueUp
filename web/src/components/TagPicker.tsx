import { useState, type FormEvent } from 'react';
import type { Tag } from '@queueup/shared';
import { useTags } from '../hooks/useTags';
import { useConfirm } from '../context/ConfirmContext';
import styles from './TagPicker.module.css';

interface TagPickerProps {
  /** Tags already applied to this specific game (issue #247) - a subset of useTags()'s full
   * account-wide list, since not every tag the caller owns is necessarily on this game. */
  currentTags: Tag[];
  /** Finds-or-creates a tag by name and applies it to this game (ApplyTagRequest) - covers both
   * "type a brand new tag" and "click an existing suggestion" with the same call. */
  onApply: (name: string) => Promise<void> | void;
  /** Detaches a tag from just this game - the tag itself (and its other applications) survive. */
  onRemove: (tagId: string) => void;
}

const MAX_TAG_NAME_LENGTH = 40;

/** Create/apply/remove/rename/delete tag UI for GameDetailModal (issue #247). Applying/removing a
 * tag on *this* game goes through the caller's props (backed by useGames(), so the shelf/room
 * cache patches the same way status/vote/price changes do); renaming or deleting a tag is
 * account-wide, so that goes through useTags() directly here instead - those actions aren't
 * specific to the game the modal happens to be open on. There's no dedicated "manage all my tags"
 * page (out of scope per the issue) - the collapsible list below is the entire surface for it. */
export function TagPicker({ currentTags, onApply, onRemove }: TagPickerProps) {
  const { tags: allTags, actionError, clearActionError, rename, remove: deleteTag } = useTags();
  const confirm = useConfirm();

  const [draft, setDraft] = useState('');
  const [applying, setApplying] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const appliedIds = new Set(currentTags.map((t) => t.id));
  const availableToApply = allTags.filter((t) => !appliedIds.has(t.id));

  async function handleApply(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setApplying(true);
    try {
      await onApply(trimmed);
      setDraft('');
    } catch {
      // onApply's own mutation already surfaces a failure via the shelf/room actionError banner -
      // nothing extra to do here besides leaving the draft in place so the user can retry/edit it.
    } finally {
      setApplying(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleApply(draft);
  }

  function startRename(tag: Tag) {
    setRenamingId(tag.id);
    setRenameDraft(tag.name);
  }

  async function handleRenameSubmit(e: FormEvent, tagId: string) {
    e.preventDefault();
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    try {
      await rename(tagId, trimmed);
      setRenamingId(null);
    } catch {
      // Surfaced via `actionError` below (e.g. renaming to a name that collides with another tag);
      // stay in the rename form so the user can adjust it rather than losing their edit.
    }
  }

  async function handleDelete(tag: Tag) {
    const ok = await confirm({
      title: `Delete "${tag.name}"?`,
      message: 'This removes it from every game it\'s applied to, not just this one. It can\'t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteTag(tag.id);
  }

  return (
    <div className={styles.section}>
      <div className={styles.chipRow}>
        {currentTags.map((tag) => (
          <span key={tag.id} className={styles.chip}>
            {tag.name}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => onRemove(tag.id)}
              aria-label={`Remove tag ${tag.name} from this game`}
            >
              ×
            </button>
          </span>
        ))}
        {currentTags.length === 0 && <span className={styles.emptyHint}>No tags on this yet</span>}
      </div>

      <form onSubmit={handleSubmit} className={styles.addForm}>
        <input
          type="text"
          list="tag-picker-suggestions"
          className={styles.addInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New or existing tag…"
          aria-label="Add a tag"
          maxLength={MAX_TAG_NAME_LENGTH}
        />
        <datalist id="tag-picker-suggestions">
          {availableToApply.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <button type="submit" className={styles.addButton} disabled={!draft.trim() || applying}>
          Add
        </button>
      </form>

      {availableToApply.length > 0 && (
        <div className={styles.suggestionRow}>
          {availableToApply.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.suggestionChip}
              onClick={() => void handleApply(t.name)}
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}

      {allTags.length > 0 && (
        <button type="button" className={styles.manageToggle} onClick={() => setManageOpen((open) => !open)}>
          {manageOpen ? 'Hide tag management' : `Manage my tags (${allTags.length})`}
        </button>
      )}

      {manageOpen && (
        <div className={styles.manageList}>
          {allTags.map((tag) => (
            <div key={tag.id} className={styles.manageRow}>
              {renamingId === tag.id ? (
                <form onSubmit={(e) => void handleRenameSubmit(e, tag.id)} className={styles.renameForm}>
                  <input
                    autoFocus
                    className={styles.renameInput}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    maxLength={MAX_TAG_NAME_LENGTH}
                    aria-label={`Rename tag ${tag.name}`}
                  />
                  <button type="submit" className={styles.renameSave}>Save</button>
                  <button type="button" className={styles.renameCancel} onClick={() => setRenamingId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className={styles.manageName}>{tag.name}</span>
                  <button
                    type="button"
                    className={styles.manageIconButton}
                    onClick={() => startRename(tag)}
                    aria-label={`Rename tag ${tag.name}`}
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={styles.manageIconButton}
                    onClick={() => void handleDelete(tag)}
                    aria-label={`Delete tag ${tag.name}`}
                    title="Delete everywhere"
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <div className={styles.error}>
          {actionError}{' '}
          <button type="button" className={styles.errorDismiss} onClick={clearActionError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
