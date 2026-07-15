import { describe, it, expect } from 'vitest';
import { duplicateScopeWhere } from './gameAccess.js';

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
