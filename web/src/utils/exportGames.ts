import type { Game } from '@squadqueue/shared';

function csvCell(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const CSV_COLUMNS = ['Title', 'Platform', 'Genre', 'Status', 'Price', 'Votes', 'Added By', 'Added At'] as const;

function toRow(game: Game): (string | number)[] {
  return [
    game.title,
    game.platform,
    game.genre ?? '',
    game.status,
    game.price.amount ? `${game.price.amount} ${game.price.currency ?? ''}`.trim() : '',
    game.voteScore,
    game.addedBy.displayName,
    game.createdAt,
  ];
}

export function toCsv(games: Game[]): string {
  const lines = [CSV_COLUMNS.join(','), ...games.map((g) => toRow(g).map(csvCell).join(','))];
  return lines.join('\n');
}

export function toJson(games: Game[]): string {
  return JSON.stringify(
    games.map((g) => ({
      title: g.title,
      platform: g.platform,
      genre: g.genre,
      status: g.status,
      price: g.price.amount ? { amount: g.price.amount, currency: g.price.currency } : null,
      voteScore: g.voteScore,
      addedBy: g.addedBy.displayName,
      createdAt: g.createdAt,
    })),
    null,
    2,
  );
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportGames(games: Game[], format: 'csv' | 'json', baseName: string) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${baseName}-${date}.${format}`;
  if (format === 'csv') {
    download(filename, toCsv(games), 'text/csv;charset=utf-8');
  } else {
    download(filename, toJson(games), 'application/json;charset=utf-8');
  }
}
