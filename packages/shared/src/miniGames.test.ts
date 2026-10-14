import { describe, expect, it } from 'vitest';
import { formatLobbyCode, parseLobbyCode } from './miniGames.js';

describe('parseLobbyCode', () => {
  it('reads a bare code in any case, with or without the dash or spaces', () => {
    expect(parseLobbyCode('7KX-4QP')).toBe('7KX4QP');
    expect(parseLobbyCode(' 7kx 4qp ')).toBe('7KX4QP');
    expect(parseLobbyCode('7KX4QP')).toBe('7KX4QP');
  });

  it('takes the code out of a pasted link', () => {
    expect(parseLobbyCode('https://queueup.example/games?code=7KX-4QP')).toBe('7KX4QP');
    expect(parseLobbyCode('https://queueup.example/queueup/games?x=1&code=7kx4qp#top')).toBe('7KX4QP');
  });

  it('refuses anything that is not 6 valid characters', () => {
    expect(parseLobbyCode('')).toBeNull();
    expect(parseLobbyCode('7KX-4Q')).toBeNull();
    expect(parseLobbyCode('7KX-4QPP')).toBeNull();
    // 0, O, 1 and I are never in a code.
    expect(parseLobbyCode('7KX-4Q0')).toBeNull();
  });

  it('formats a code as XXX-XXX', () => {
    expect(formatLobbyCode('7KX4QP')).toBe('7KX-4QP');
  });
});
