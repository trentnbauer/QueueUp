/** The app's pino logger (Fastify's app.log), for services outside a request that should still log
 * into the same stream - and so into Administrator settings' Download logs (see logBuffer.ts),
 * which console.* output never reaches. Set once in buildApp; until then (unit tests, scripts) it
 * falls back to the console. */
export interface AppLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
}

const consoleLogger: AppLogger = {
  info: (obj, msg) => console.info(msg, obj),
  warn: (obj, msg) => console.warn(msg, obj),
};

let current: AppLogger = consoleLogger;

export function setAppLogger(logger: AppLogger): void {
  current = logger;
}

export const appLog = (): AppLogger => current;
