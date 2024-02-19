import { isEmulator } from 'react-native-device-info';
import IncodeSdk, {
  type FaceLoginResult,
  type OnboardingResponse,
} from '@incode-sdks/react-native-incode-sdk';
import { globalLogger } from '../../common/logger';

export const INCODE_BYPASS_EMAILS = ['martin+reviewer@blackinktech.io'];

const IncodeMock = {
  initialize: () => {
    return Promise<void>;
  },
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startFaceLogin: async (args: {
    showTutorials: boolean;
    customerUUID?: string;
    faceMaskCheck?: boolean;
  }): Promise<FaceLoginResult> => ({
    faceMatched: true,
    token: 'testmode',
    transactionId: 'testmode',
    image: {
      pngBase64: 'testmode',
      encryptedBase64: 'testmode',
    },
    spoofAttempt: false,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTheme: () => Promise<any>,
  showCloseButton: () => {
    return;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSessionCreated: () => {
    return Promise<void>;
  },
  onStepCompleted: () => {
    return;
  },
  startOnboarding: (): Promise<OnboardingResponse> => {
    return Promise.resolve({ status: 'success' });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finishOnboardingFlow: () => Promise<any>,
};

// @ts-ignore
export async function initializeIncode() {
  const logger = globalLogger.extend('initializeIncode');
  globalLogger.enable('initializeIncode');
  const config = {
    // This is now useless as we can skip incode completely using the mock if we're on emulator.
    // Also, this property doesn't even work half the time (incode.welcome_sdk thinks it's on a real device)
    testMode: false,
    waitForTutorials: false,
    apiConfig: {
      key: Incode.apiKey,
      url: Incode.apiUrl,
    },
  };
  if (Incode.skip) {
    logger.debug('Calling IncodeMock.initialize:', JSON.stringify(config));
    return IncodeMock.initialize();
  }
  logger.debug('Calling IncodeSdk.initialize:', JSON.stringify(config));
  await IncodeSdk.initialize(config);
}

export async function isIncodeTestMode() {
  try {
    // Source: https://stackoverflow.com/a/35529545
    return await isEmulator();
  } catch (err) {
    const logger = globalLogger.extend('isIncodeTestMode');
    globalLogger.enable('isIncodeTestMode');
    logger.warn(err);
    return false;
  }
}

export class Incode {
  static skip: boolean = false;
  static apiKey: string;
  static apiUrl: string;

  static getInstance() {
    if (this.skip) return IncodeMock;
    return IncodeSdk;
  }
}
