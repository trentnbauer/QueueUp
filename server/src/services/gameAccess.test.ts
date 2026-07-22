import { describe, it, expect } from 'vitest';
import { duplicateScopeWhere, requireGameTagAccess } from './gameAccess.js';

describe('duplicateScopeWhere', () => {
  it('scopes to the whole room when roomId is given, regardless of who is asking', () => {
    expect(duplicateScopeWhere('room-1', 'user-a')).toEqual({ roomId: 'room-1' });
    expect(duplicateScopeWhere('room-1', 'user-b')).toEqual({ roomId: 'room-1' });
  });

  it('scopes to just that user\'s own shelf when roomId is null', () => {
    expect(duplicateScopeWhere(null, 'user-a')).toEqual({ roomId: null, addedBy: 'user-a' });
  });

  it('does not let two different users collide on the personal shelf', () => {
    const a = duplicateScopeWhere(null, 'user-a');
    const b = duplicateScopeWhere(null, 'user-b');
    expect(a).not.toEqual(b);
  });
});

describe('requireGameTagAccess', () => {
  it('allows the game\'s own adder, room game or not', () => {
    expect(() => requireGameTagAccess({ addedBy: 'user-a' }, 'user-a')).not.toThrow();
  });

  it('rejects anyone else, even a fellow room member who can otherwise read/vote on the game', () => {
    expect(() => requireGameTagAccess({ addedBy: 'user-a' }, 'user-b')).toThrow(/added/i);
  });
});
