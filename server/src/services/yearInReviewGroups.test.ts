import { describe, expect, it } from 'vitest';
import { groupCompleted } from './yearInReviewGroups.js';

const done = [
  { id: 'g1', title: 'One', roomId: 'mine' },
  { id: 'g2', title: 'Two', roomId: 'left' },
  { id: 'g3', title: 'Three', roomId: null },
  { id: 'g4', title: 'Four', roomId: 'mine' },
];
const names = new Map([
  ['mine', 'My room'],
  ['left', 'Old room'],
]);
const members = [
  { roomId: 'mine', userId: 'me', displayName: 'Me' },
  { roomId: 'mine', userId: 'pat', displayName: 'Pat' },
  { roomId: 'left', userId: 'sam', displayName: 'Sam' },
  { roomId: 'left', userId: 'kim', displayName: 'Kim' },
];

describe('groupCompleted', () => {
  const groups = groupCompleted(done, 'me', names, members, new Set(['mine']));
  const by = (roomId: string | null) => groups.find((g) => g.roomId === roomId)!;

  it('names the other members of a room the person is in now, not themselves', () => {
    expect(by('mine')).toMatchObject({ roomName: 'My room', memberNames: ['Pat'] });
    expect(by('mine').games.map((g) => g.id)).toEqual(['g1', 'g4']);
  });

  it('keeps the games of a room they have left, but not its member list', () => {
    expect(by('left')).toMatchObject({ roomName: 'Old room', memberNames: [] });
    expect(by('left').games.map((g) => g.id)).toEqual(['g2']);
  });

  it('puts Personal Shelf games in one bucket with no room and no members', () => {
    expect(by(null)).toMatchObject({ roomName: null, memberNames: [] });
    expect(by(null).games).toEqual([{ id: 'g3', title: 'Three' }]);
  });

  it('gives a deleted room no name', () => {
    expect(groupCompleted([{ id: 'x', title: 'X', roomId: 'gone' }], 'me', new Map(), [], new Set()))
      .toEqual([{ roomId: 'gone', roomName: null, memberNames: [], games: [{ id: 'x', title: 'X' }] }]);
  });
});
