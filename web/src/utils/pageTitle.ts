import { useEffect } from 'react';

export const APP_NAME = 'QueueUp';

/** The browser tab title for a page name: "QueueUp - Personal Shelf". With no page name it is just "QueueUp". */
export function pageTitle(page: string | null | undefined): string {
  const name = (page ?? '').trim();
  return name ? `${APP_NAME} - ${name}` : APP_NAME;
}

/** Sets the browser tab title while the page is shown. */
export function useDocumentTitle(page: string | null | undefined): void {
  const title = pageTitle(page);
  useEffect(() => {
    document.title = title;
  }, [title]);
}
