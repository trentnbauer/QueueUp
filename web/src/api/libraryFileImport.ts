import { apiGet, apiPost } from './client';
import type { LibraryFileImportRequest, LibraryFileMapping, LibraryFilePreview, LibrarySyncProgress, PlayniteImportStarted } from '@queueup/shared';

export const libraryFileImportApi = {
  preview: (text: string) => apiPost<LibraryFilePreview>('/api/me/import/file/preview', { text } satisfies LibraryFileImportRequest),
  start: (text: string, mapping: LibraryFileMapping) => apiPost<PlayniteImportStarted>('/api/me/import/file', { text, mapping } satisfies LibraryFileImportRequest),
  progress: () => apiGet<{ progress: LibrarySyncProgress | null }>('/api/me/import/file/progress'),
};
