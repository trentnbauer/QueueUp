import { describe, expect, it } from 'vitest';
import type { Game } from '@queueup/shared';
import { ROOM_TABS, SHELF_MORE_TABS, SHELF_TABS } from '../lib/gameView';
import { buildHomeLists, playsOn } from './derive';

const DAY = 864e5;
let n = 0;
function game(over: Partial<Game>): Game {
  n += 1;
  return { id: `g${n}`, title: `Game ${n}`, status: 'backlog', votes: [], releaseDate: null, replayedAt: null, ...over } as Game;
}
const vote = (value: number) => ({ value }) as Game['votes'][number];
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const ids = (list: Game[]) => list.map((g) => g.title);

describe('buildHomeLists', () => {
  it('puts games released in the last 60 days first (newest first), then the rest by score', () => {
    const old = game({ title: 'Old hit', votes: [vote(5), vote(5)] });
    const newer = game({ title: 'Newer', releaseDate: ago(5) });
    const newest = game({ title: 'Newest', releaseDate: ago(1) });
    const lists = buildHomeLists([old, newer, newest], { isShelf: false, tabs: ROOM_TABS, tab: 'queue', query: '' });
    expect(ids(lists.list)).toEqual(['Newest', 'Newer', 'Old hit']);
  });

  it('keeps upcoming releases in the Coming soon strip, not the main list', () => {
    const soon = game({ title: 'Soon', releaseDate: ahead(20) });
    const out = game({ title: 'Out' });
    const lists = buildHomeLists([soon, out], { isShelf: false, tabs: ROOM_TABS, tab: 'queue', query: '' });
    expect(ids(lists.list)).toEqual(['Out']);
    expect(ids(lists.coming)).toEqual(['Soon']);
  });

  it('only strips games releasing within 30 days; later ones stay in the main list', () => {
    const soon = game({ title: 'Soon', releaseDate: ahead(20) });
    const later = game({ title: 'Later', releaseDate: ahead(90) });
    const lists = buildHomeLists([soon, later], { isShelf: false, tabs: ROOM_TABS, tab: 'queue', query: '' });
    expect(ids(lists.coming)).toEqual(['Soon']);
    expect(ids(lists.list)).toEqual(['Later']);
  });

  it('on the shelf the Coming soon strip belongs to the wishlist', () => {
    const wish = game({ title: 'Wish', status: 'wishlist', releaseDate: ahead(20) });
    const lists = buildHomeLists([wish], { isShelf: true, tabs: SHELF_TABS, tab: 'wishlist', query: '' });
    expect(ids(lists.coming)).toEqual(['Wish']);
    expect(lists.list).toHaveLength(0);
  });

  it('sorts replays oldest-first with undated ones last', () => {
    const a = game({ title: 'Recent', status: 'replay', replayedAt: ago(2) });
    const b = game({ title: 'Oldest', status: 'replay', replayedAt: ago(40) });
    const c = game({ title: 'Undated', status: 'replay' });
    const lists = buildHomeLists([a, b, c], { isShelf: true, tabs: SHELF_TABS, tab: 'replay', query: '' });
    expect(ids(lists.list)).toEqual(['Oldest', 'Recent', 'Undated']);
  });

  it('search spans every status and the Play Next section lists up-next games on Playing', () => {
    const next = game({ title: 'Queued next', status: 'play_next' });
    const done = game({ title: 'Finished thing', status: 'done' });
    expect(ids(buildHomeLists([next, done], { isShelf: true, tabs: SHELF_TABS, tab: 'playing', query: '' }).playNext)).toEqual(['Queued next']);
    expect(ids(buildHomeLists([next, done], { isShelf: true, tabs: SHELF_TABS, tab: 'playing', query: 'finished' }).list)).toEqual(['Finished thing']);
  });

  it('Paused games get their own filter under the plus menu and also show in the Play Next section', () => {
    const paused = game({ title: 'On hold', status: 'paused' });
    const other = game({ title: 'Other', status: 'backlog' });
    const tabs = [...SHELF_TABS, ...SHELF_MORE_TABS];
    const filter = buildHomeLists([paused, other], { isShelf: true, tabs, tab: 'paused', query: '' });
    expect(ids(filter.list)).toEqual(['On hold']);
    expect(filter.counts.paused).toBe(1);
    expect(ids(buildHomeLists([paused, other], { isShelf: true, tabs, tab: 'playing', query: '' }).playNext)).toEqual(['On hold']);
  });

  it('counts per tab', () => {
    const lists = buildHomeLists([game({ status: 'playing' }), game({ status: 'playing' }), game({ status: 'done' })], { isShelf: true, tabs: [...SHELF_TABS, ...SHELF_MORE_TABS], tab: 'playing', query: '' });
    expect(lists.counts.playing).toBe(2);
    expect(lists.counts.beaten).toBe(1);
  });
});

describe('platform filter and shelf backlog sort', () => {
  it('playsOn matches the platform label, backwards compatibility and owned-on platforms', () => {
    const ps4 = game({ platform: 'PlayStation 4, PC (Microsoft Windows)', ownedPlatforms: [] });
    const sw = game({ platform: 'Nintendo Switch', ownedPlatforms: [] });
    const ownedPc = game({ platform: '', ownedPlatforms: ['pc'] });
    expect(playsOn(ps4, 'ps5')).toBe(true);
    expect(playsOn(ps4, 'pc')).toBe(true);
    expect(playsOn(sw, 'ps5')).toBe(false);
    expect(playsOn(ownedPc, 'pc')).toBe(true);
  });

  it('playsOn can leave out older consoles: PS5 alone shows only PS5 games, PS4 only PS4', () => {
    const ps4 = game({ platform: 'PlayStation 4', ownedPlatforms: [] });
    const ps5 = game({ platform: 'PlayStation 5', ownedPlatforms: [] });
    expect(playsOn(ps4, 'ps5', false)).toBe(false);
    expect(playsOn(ps5, 'ps5', false)).toBe(true);
    expect(playsOn(ps5, 'ps4')).toBe(false);
    expect(playsOn(ps4, 'ps4')).toBe(true);
  });

  it('filters every list to the picked platform', () => {
    const a = game({ title: 'On Switch', platform: 'Nintendo Switch', ownedPlatforms: [] });
    const b = game({ title: 'On PC', platform: 'PC (Microsoft Windows)', ownedPlatforms: [] });
    const lists = buildHomeLists([a, b], { isShelf: true, tabs: SHELF_TABS, tab: 'queue', query: '', platform: 'switch' });
    expect(ids(lists.list)).toEqual(['On Switch']);
    expect(lists.counts.queue).toBe(1);
  });

  it('sorts the shelf Backlog by the picked keys', () => {
    const a = game({ title: 'Liked', votes: [vote(5)], reviewScore: 70 });
    const b = game({ title: 'Acclaimed', reviewScore: 95 });
    const opts = { isShelf: true, tabs: SHELF_TABS, tab: 'queue', query: '' };
    expect(ids(buildHomeLists([a, b], opts).list)).toEqual(['Liked', 'Acclaimed']);
    expect(ids(buildHomeLists([a, b], { ...opts, backlogSort: ['review'] }).list)).toEqual(['Acclaimed', 'Liked']);
  });
});
