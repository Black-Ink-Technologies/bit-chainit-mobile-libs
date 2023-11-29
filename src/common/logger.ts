import moment from 'moment-timezone';
import { InteractionManager } from 'react-native';
import * as RNFS from 'react-native-fs';
import {
  type configLoggerType,
  consoleTransport,
  fileAsyncTransport,
  logger,
  type transportFunctionType,
} from 'react-native-logs';

export type LogLevels = 'debug' | 'info' | 'warn' | 'error';

// TODO: Add Sentry transport
// @ts-ignore
const transport: transportFunctionType[] = [
  // Only enable CONSOLE logging in development
  __DEV__ ? consoleTransport : null,
  // Always enable FILE logging
  fileAsyncTransport,
  // Always enable SENTRY logging (for now)
].filter((t) => t !== null);

const transportOptions = {
  FS: RNFS,
  fileName: `chainit-log_${moment().format('MM-dd-yyyy')}.txt`,
  colors: {
    info: 'blueBright',
    warn: 'yellowBright',
    error: 'redBright',
  },
};

const config: configLoggerType = {
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  },
  severity: 'debug',
  transport,
  transportOptions,
  dateFormat: (date) => {
    return (
      '[' +
      moment.utc(date.toUTCString()).format('MM-DD-YYYY h:mm:ss A z') +
      '] '
    );
  },
  printLevel: true,
  printDate: true,
  enabled: true,
  // These two options improve performance impacts
  async: false,
  asyncFunc: InteractionManager.runAfterInteractions,
};

// ReturnType annotation here fixes TypeScript warnings about private / protected members
// @ts-ignore
export const globalLogger: any = logger.createLogger<LogLevels>(config);

export function getLoggerByNamespace(namespace?: string) {
  // @ts-ignore
  const logger = globalLogger.extend(namespace);
  globalLogger.enable(namespace);
  return logger;
}
