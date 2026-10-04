import { common } from './common';
import { core } from './core';
import { labels } from './labels';
import { home } from './home';
import { game } from './game';
import { spin } from './spin';
import { add } from './add';
import { settings } from './settings';
import { room } from './room';
import { social } from './social';
import { shell } from './shell';
import { pages } from './pages';

/** English, the source catalog: every other language translates these keys, and anything a
 * language hasn't translated falls back to this. One file per area of the app. */
export const en = { ...common, ...core, ...labels, ...home, ...game, ...spin, ...add, ...settings, ...room, ...social, ...shell, ...pages };

export type MessageKey = keyof typeof en;
