type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, component: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${component}] ${message}`;
}

export function createLogger(component: string) {
  return {
    debug(msg: string): void {
      if (shouldLog('debug')) {
        console.error(formatMessage('debug', component, msg));
      }
    },
    info(msg: string): void {
      if (shouldLog('info')) {
        console.error(formatMessage('info', component, msg));
      }
    },
    warn(msg: string): void {
      if (shouldLog('warn')) {
        console.error(formatMessage('warn', component, msg));
      }
    },
    error(msg: string): void {
      if (shouldLog('error')) {
        console.error(formatMessage('error', component, msg));
      }
    },
  };
}
