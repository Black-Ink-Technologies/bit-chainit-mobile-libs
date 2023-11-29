import { INCODE_BYPASS_EMAILS, Incode, initializeIncode } from './incode';
import axios from 'axios';
import { type JwtPayload, jwtDecode } from 'jwt-decode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIncodeAuth } from './use-incode-auth';
import { useAuthStore } from '../auth.store';
import { getIncodeToken } from '../auth.utils';
import { globalLogger } from '../common/logger';
import { AuthErrorMessageEnum } from '../auth.service.interfaces';
import type { ConsentActionTypesEnum } from '@bit-ui-libs/common';
import { useIncodeSetupListeners } from './use-incode-setup-listeners';
import { useIncodeFlows } from './use-incode-flows';
// @ts-ignore
import { decode } from 'base-64';
global.atob = decode;

interface UseIncodeOnboardingOpts {
  // This is the sessionToken received from Auth0's Challenge URL
  sessionToken: string;
  shouldInitialize?: boolean;
  incodeApiUrl: string;
  incodeApiKey: string;
  iubendaUrl: string;
  finishChallenge: (opts: { userId: string; token: string }) => Promise<any>;
  signInSuccess: () => void;
  compressImage: (image: { base64: string }) => Promise<string>;
  createConsent: (data: { type: ConsentActionTypesEnum }) => Promise<void>;
  onboardingFlowId: string;
  checkRequestPermissions: () => Promise<boolean>;
  showAppSettingsModal: () => Promise<void>;
}

export function useIncodeOnboarding(opts: UseIncodeOnboardingOpts) {
  Incode.apiKey = opts?.incodeApiKey;
  const [isIncodeActive, setIncodeActive] = useState(false);
  const [flowType, setFlowType] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const incodeInitializedRef = useRef(false);
  const interviewId = useRef(null);
  const incodeSessionToken = useRef(null);
  // const approveCalledRef = useRef(null);
  // const navigation = useNavigation();

  const {
    authMode,
    setPhotoPath,
    setOCRData,
    setSignUpPhone,
    setSignUpPhoneCode,
  } = useAuthStore();
  const [addLoading, setAddLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [screenLoading, setScreenLoading] = useState(false);
  const [step, setStep] = useState('Auth0Complete');
  const [showPrivacyConsent, setShowPrivacyConsent] = useState<boolean>(false);
  // const toast = useToast({ namespace: 'Face Recognition' });
  const { shouldInitialize } = opts;

  const finishOnboarding = useCallback(
    (step?: string) => {
      if (!hasError) {
        setStep(step ? step : 'IncodeComplete');
      }
      setAddLoading(false);
      Incode.getInstance().finishOnboardingFlow();
    },
    [hasError]
  );

  const handleError = useCallback((message: string) => {
    setSessionMessage('');
    setErrorMessage(message);
    // toast.error(message);
    globalLogger.error(message);
    setIncodeActive(false);
    setHasError(true);
    setAddLoading(false);
    setSkipLoading(false);
    setScreenLoading(false);
  }, []);

  const { signUp, signIn } = useIncodeAuth({
    handleError,
    setScreenLoading,
    interviewId,
    finishOnboarding,
    finishChallenge: opts.finishChallenge,
    signInSuccess: opts?.signInSuccess,
  });

  const { setupListeners } = useIncodeSetupListeners({
    setPhotoPath,
    setSignUpPhone,
    setSignUpPhoneCode,
    setOCRData,
    handleError,
    signUp,
    interviewId,
    finishOnboarding,
    incodeSessionToken,
    compressImage: opts.compressImage,
    createConsent: opts.createConsent,
  });
  const { startOnboarding, startIncodeFlow, startEmptyOnboarding } =
    useIncodeFlows({
      finishOnboarding,
      handleError,
      signIn,
      setSessionMessage,
      setSkipLoading,
      setScreenLoading,
      interviewId,
      setFlowType,
      sessionToken: opts?.sessionToken,
      onboardingFlowId: opts.onboardingFlowId,
      checkRequestPermissions: opts.checkRequestPermissions,
      showAppSettingsModal: opts.showAppSettingsModal,
    });

  const setAuthStep = () => {
    setStep('Auth0Complete');
    setHasError(false);
  };

  const start = useCallback(async () => {
    globalLogger.debug('Calling initializeIncode');
    await initializeIncode();
    Incode.getInstance().showCloseButton(true);
    globalLogger.info('Initialized Incode, authMode:', authMode);
    incodeInitializedRef.current = true;
    setIncodeActive(true);

    const unsubscribers = setupListeners();

    let shouldSkipIncode = false;
    let email: string | undefined;

    if (opts?.sessionToken) {
      console.log('session token:', opts.sessionToken, jwtDecode);
      const decoded: JwtPayload & { email: string } = jwtDecode(
        opts.sessionToken
      );
      console.log('decoded:', decoded?.email);
      // @ts-ignore
      // email = jwtDecode(opts.sessionToken)['email'] as string | undefined;
      email = decoded?.email;
      globalLogger.debug('Email extracted from Session Token:', email);
      shouldSkipIncode = INCODE_BYPASS_EMAILS.includes(email as string);
      globalLogger.debug('Should skip Incode?:', shouldSkipIncode);
    }

    if (authMode === 'sign-in') {
      setFlowType('INCODE_LOGIN');
      globalLogger.debug('Calling startIncodeFlow()');
      startIncodeFlow({ skipIncode: shouldSkipIncode });
    } else {
      if (shouldSkipIncode) {
        globalLogger.debug('Calling signUp() with testmode values');
        signUp('testmode', 'testmode', 'testmode');
        return setStep('IncodeComplete');
      }
      setAuthStep();
    }

    return unsubscribers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode]);

  const retry = useCallback(async () => {
    globalLogger.debug('Retrying incode flow', flowType);

    if (authMode === 'sign-in') {
      globalLogger.debug('Calling startIncodeFlow() (retry)');
      startIncodeFlow();
    } else {
      if (flowType === 'INCODE_ONBOARDING_FACE') {
        if (errorMessage === AuthErrorMessageEnum.INCODE_INITIALIZATION_ERROR) {
          globalLogger.debug('Calling startEmptyOnboarding() (retry)');
          startEmptyOnboarding();
        } else {
          globalLogger.debug('Calling startOnboarding() (retry)');
          startOnboarding();
        }
      }
    }
  }, [
    authMode,
    errorMessage,
    flowType,
    startEmptyOnboarding,
    startIncodeFlow,
    startOnboarding,
  ]);

  // @ts-ignore
  useEffect(() => {
    if (
      !incodeInitializedRef.current &&
      shouldInitialize &&
      step !== 'SignUpError'
    ) {
      let unsubscribers: any;
      setSessionMessage('Initializing session');
      start().then((_unsubscribers) => {
        unsubscribers = _unsubscribers;
      });
      return () => {
        unsubscribers?.forEach((unsubscriber: any) => unsubscriber());
      };
    }
  }, [shouldInitialize, start, step]);

  const handleConsent = async (id: string, title: string, status: boolean) => {
    const incodeToken = await getIncodeToken();
    try {
      const data = await axios.get(
        `${opts?.iubendaUrl}/api/privacy-policy/${id}/no-markup`
      );
      await axios.create({}).post(
        `${opts?.incodeApiUrl}/0/omni/add/user-consent`,
        {
          title,
          content: data?.data?.content?.replace(/(<([^>]+)>)/gi, ''),
          status,
        },
        {
          headers: {
            'api-version': '1.0',
            'X-Incode-Hardware-Id': incodeToken,
          },
        }
      );
    } catch (error) {
      globalLogger.error('consent error', error);
    }
  };

  return {
    authMode,
    errorMessage,
    isIncodeActive,
    sessionMessage,
    hasError,
    retry,
    startIncodeFlow,
    screenLoading,
    addLoading,
    startOnboarding,
    skipLoading,
    step,
    setAuthStep,
    handleConsent,
    startEmptyOnboarding,
    showPrivacyConsent,
    setShowPrivacyConsent,
    setScreenLoading,
    setFlowType,
    signIn,
    signUp,
    finishOnboarding,
  };
}
