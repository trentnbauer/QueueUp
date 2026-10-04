import type { MessageKey } from '../en';
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

/** Pirate 🏴‍☠️: every English string, hand-translated. */
export const pirate: Record<MessageKey, string> = { ...common, ...core, ...labels, ...home, ...game, ...spin, ...add, ...settings, ...room, ...social, ...shell, ...pages };
