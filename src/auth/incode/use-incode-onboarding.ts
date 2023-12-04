import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import axios from 'axios';
// @ts-ignore
import { decode } from 'base-64';
import {
  ENCRYPTED_STORAGE_KEYS,
  ConsentActionTypesEnum,
  getErrorMessage,
  type IncodeOcrResult,
} from '@bit-ui-libs/common';
import EncryptedStorage from 'react-native-encrypted-storage';

import {
  INCODE_BYPASS_EMAILS,
  Incode,
  initializeIncode,
  isIncodeTestMode,
} from './incode';
import { type JwtPayload, jwtDecode } from 'jwt-decode';
import { useAuthStore } from '../auth.store';
import {
  getBitAuthClaims,
  getIncodeToken,
  getInterviewId,
  setIncodeToken,
  setInterviewId,
} from '../auth.utils';
import { globalLogger } from '../../common/logger';
import { AuthErrorMessageEnum } from '../auth.service.interfaces';
import { useUserStore } from '../user.store';
import { getParsedPhone } from '../phone-number';
import { isUserOverEighteen } from '../check-user-birthday';
global.atob = decode;

interface PermissionStatuses {
  isGranted: boolean;
  isDenied: boolean;
  isBlocked: boolean;
}

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
  checkRequestPermissions: (isCamera: boolean) => Promise<PermissionStatuses>;
  showAppSettingsModal: (type: string) => Promise<void>;
}

export function useIncodeOnboarding(opts: UseIncodeOnboardingOpts) {
  Incode.apiKey = opts?.incodeApiKey;
  const {
    sessionToken,
    onboardingFlowId,
    checkRequestPermissions,
    showAppSettingsModal,
    finishChallenge,
    signInSuccess,
    compressImage,
    createConsent,
  } = opts;
  const [isIncodeActive, setIncodeActive] = useState(false);
  const [flowType, setFlowType] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const incodeInitializedRef = useRef(false);
  const interviewId = useRef<string | null>(null);
  const incodeSessionToken = useRef<string | null>(null);
  const userStore = useUserStore((s) => ({ setUserId: s.setUserId }));
  const timesCalledRef = useRef(0);
  const approveCalledRef = useRef<Boolean | null>(null);
  const selfieScanSuccess = useRef<Boolean | null>(null);
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
      console.log('Calling finishOnboarding', step);
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

  const setAuthStep = () => {
    setStep('Auth0Complete');
    setHasError(false);
  };

  const saveBitUserId = useCallback(async () => {
    globalLogger.debug('Setting BIT User ID in authStore');
    const claims = await getBitAuthClaims();
    userStore.setUserId(claims.userId);
  }, [userStore]);

  const signUp = useCallback(
    async (userId: string, token: string, customInterviewId) => {
      Incode.getInstance().showCloseButton(false);
      // queryClient.invalidateQueries({ queryKey: ['profile'] });
      // queryClient.invalidateQueries({ queryKey: ['profile-picture', userId] });

      const fycData = { userId, token };
      globalLogger.debug('Calling authService.faceRecognition', fycData);
      setScreenLoading(true);

      let _interviewId = interviewId.current;
      if (customInterviewId) {
        _interviewId = customInterviewId;
      }

      const opts = {
        userId,
        token,
        interviewId: _interviewId,
      };
      globalLogger.debug('Calling authService.finishChallenge', opts);
      const result = await finishChallenge(opts);
      if (result.isErr()) {
        finishOnboarding(
          AuthErrorMessageEnum.FACE_ALREADY_REGISTERED === result?.error
            ? 'FaceAlreadyRegistered'
            : ''
        );
        setScreenLoading(false);
        handleError(result.error);
        return false;
      }

      setScreenLoading(false);

      saveBitUserId();

      globalLogger.debug('Saving Incode User ID:', userId);
      await EncryptedStorage.setItem(
        ENCRYPTED_STORAGE_KEYS.incodeUserId,
        userId
      );
      return true;
    },
    [
      setScreenLoading,
      interviewId,
      finishChallenge,
      saveBitUserId,
      finishOnboarding,
      handleError,
    ]
  );

  const signIn = useCallback(
    async (
      transactionId: string,
      token: string,
      userId: string,
      customInterviewId: string
    ) => {
      // queryClient.invalidateQueries({ queryKey: ['profile'] });
      // queryClient.invalidateQueries({ queryKey: ['profile-picture', userId] });

      let _interviewId = interviewId.current || customInterviewId;

      if (timesCalledRef.current > 0) {
        return globalLogger.debug('Avoiding double finishChallenge call');
      }
      const opts = {
        userId,
        token,
        interviewId: _interviewId,
        transactionId,
      };
      globalLogger.debug('Calling authService.finishChallenge', opts);
      timesCalledRef.current++;
      const result = await finishChallenge(opts);
      if (result.isErr()) {
        globalLogger.debug('Error is going to be handled');
        return handleError(result.error);
      }

      saveBitUserId();
      signInSuccess();

      globalLogger.debug('Saving Incode User ID:', userId);
      await EncryptedStorage.setItem(
        ENCRYPTED_STORAGE_KEYS.incodeUserId,
        userId
      );
    },
    [interviewId, finishChallenge, saveBitUserId, signInSuccess, handleError]
  );

  const startOnboarding = useCallback(async () => {
    try {
      setScreenLoading(true);
      setSessionMessage('Starting session');
      setFlowType('INCODE_ONBOARDING_FACE');
      globalLogger.info('Checking camera permissions');
      const { isGranted } = await checkRequestPermissions(true);
      if (!isGranted) return showAppSettingsModal('camera');
      globalLogger.debug('interviewId', interviewId);
      globalLogger.debug('sessionToken', sessionToken);
      const _interviewId = interviewId?.current || (await getInterviewId());
      if (sessionToken) {
        // @ts-ignore
        // const email = jwtDecode(sessionToken)['email'] as string | undefined;
        // globalLogger.debug('email', email);
      }
      globalLogger.info(
        'Calling Incode.startOnboarding with interviewId: ',
        _interviewId
      );
      const onboardingResponse = await Incode.getInstance().startOnboarding({
        flowConfig: [
          // "Phone" is bugged on some iPhones
          { module: 'SelfieScan' },
          { module: 'Phone', enabled: Platform.OS === 'android' },
          { module: 'Approve' },
        ],
        sessionConfig: {
          configurationId: onboardingFlowId,
          interviewId: _interviewId as string,
        },
      });
      globalLogger.info('Incode.startOnboarding response:', onboardingResponse);
      if (onboardingResponse.status !== 'userCancelled') {
        globalLogger.debug('Calling finishOnboarding');
        setScreenLoading(false);
        setSkipLoading(false);
        Incode.getInstance().finishOnboardingFlow();
        return;
      }
      handleError(AuthErrorMessageEnum.USER_CANCELED_SELFIE_SCAN);
    } catch (e) {
      globalLogger.error(e);
      finishOnboarding('SignUpError');
    }
  }, [
    setScreenLoading,
    setSessionMessage,
    setFlowType,
    checkRequestPermissions,
    showAppSettingsModal,
    interviewId,
    sessionToken,
    onboardingFlowId,
    handleError,
    setSkipLoading,
    finishOnboarding,
  ]);

  // Allow caller to skip incode for special situations (reviewer)
  const startIncodeFlow = useCallback(
    async (opts?: { skipIncode?: boolean }) => {
      Incode.getInstance().showCloseButton(true);
      console.log('startIncodeFlow', Incode.apiKey, Incode.apiUrl);
      try {
        if (opts?.skipIncode) {
          globalLogger.debug(
            'Skipping Incode, calling signIn (with testmode values)'
          );
          return signIn('testmode', 'testmode', 'testmode', 'testmode');
        }
        const isTestMode = await isIncodeTestMode();
        globalLogger.debug(
          'Calling start face login',
          Incode.getInstance().startFaceLogin,
          Incode.getInstance().startFaceLogin
        );
        const result = await Incode.getInstance().startFaceLogin({
          showTutorials: false,
          faceMaskCheck: false,
        });
        globalLogger.info('Incode startFaceLogin result:', {
          ...result,
          image: {
            ...result.image,
            pngBase64: '[redacted]',
            encryptedBase64: '[redacted]',
          },
        });
        let { transactionId, token, customerUUID } = result;
        let interviewId = result.interviewId;
        if (!result.faceMatched && !isTestMode) {
          return handleError(AuthErrorMessageEnum.FACE_NOT_VERIFIED);
        }
        if (isTestMode) {
          transactionId = 'testmode';
          token = 'testmode';
          customerUUID = 'testmode';
          interviewId = 'testmode';
        }
        // @ts-ignore
        signIn(transactionId, token, customerUUID, interviewId);
      } catch (err) {
        handleError(getErrorMessage(err));
      }
    },
    [handleError, signIn]
  );

  const startEmptyOnboarding = useCallback(async () => {
    try {
      setScreenLoading(true);
      setSessionMessage('Starting session');
      setFlowType('INCODE_ONBOARDING_FACE');

      const onboardingResponse = await Incode.getInstance().startOnboarding({
        flowConfig: [],
        sessionConfig: {
          configurationId: onboardingFlowId,
        },
      });
      globalLogger.info('Incode.startOnboarding response:', onboardingResponse);
      setScreenLoading(false);
    } catch (error) {
      handleError(AuthErrorMessageEnum.INCODE_INITIALIZATION_ERROR);
      setScreenLoading(false);
      globalLogger.error('Incode.startOnboarding error:', error);
    }
  }, [
    handleError,
    onboardingFlowId,
    setFlowType,
    setScreenLoading,
    setSessionMessage,
  ]);

  const setupListeners = useCallback(async () => {
    globalLogger.info('Setting up listeners');
    // Returns a callback to unregister your listener, e.g. when your screen is getting unmounted
    Incode.getInstance().onSessionCreated((session) => {
      globalLogger.debug('Incode.onSessionCreated:', session);
      interviewId.current = session.interviewId;
      incodeSessionToken.current = session.token;
      setInterviewId(session.interviewId);
      setIncodeToken(session.token);
    });
    const complete = Incode.getInstance().onStepCompleted;
    return [
      complete({
        module: 'Phone',
        listener: (e) => {
          globalLogger.info('Phone completed:', e);
          const { formattedPhone, countryCode } = getParsedPhone(
            e.result.phone
          );
          setSignUpPhone(formattedPhone);
          setSignUpPhoneCode(countryCode);
        },
      }),
      complete({
        module: 'SelfieScan',
        listener: (e) => {
          globalLogger.info(
            'SelfieScan completed:',
            e.module,
            e.result.spoofAttempt,
            e.result.status
          );
          selfieScanSuccess.current = e.result.status === 'success';
          compressImage({ base64: e.result.image.pngBase64 as string }).then(
            (img) => setPhotoPath(img)
          );
        },
      }),
      complete({
        module: 'IdScanFront',
        listener: (e) => {
          globalLogger.warn('IdScanFront completed:', e.result.status);
          if (e.result.status !== 'ok') {
            handleError('Failed to scan your Front ID');
            finishOnboarding('SignUpError');
          }
        },
      }),
      complete({
        module: 'IdScanBack',
        listener: (e) => {
          globalLogger.warn('IdScanBack completed:', e.result.status);
          if (e.result.status !== 'ok') {
            handleError('Failed to scan your Back ID');
            finishOnboarding('SignUpError');
          }
        },
      }),
      complete({
        module: 'ProcessId',
        listener: async (e) => {
          try {
            const ocrResult = e.result as IncodeOcrResult;
            globalLogger.info('ProcessId complete', ocrResult);
            if (!isUserOverEighteen(ocrResult?.data?.birthDate)) {
              finishOnboarding('UserUnderEighteen');
              return;
            }
            setOCRData(ocrResult);
          } catch (err) {
            globalLogger.error(err);
            handleError('Failed to process your ID');
            finishOnboarding('SignUpError');
          }
        },
      }),
      complete({
        module: 'UserScore',
        listener: (e) => {
          globalLogger.info('User Score completed', e.result);
        },
      }),
      complete({
        module: 'FaceMatch',
        listener: (e) => {
          globalLogger.info('Face match completed', e.result);
          // if (e.result.existingUser) {
          //   handleError('User already exists');
          // }
        },
      }),
      complete({
        module: 'UserConsent',
        listener: (e) => {
          globalLogger.info('UserConsent completed:', e);
          if (e.result.status !== 'success') {
            handleError('Privacy Policy rejected');
            return finishOnboarding('UserConsentRejected');
          }
        },
      }),
      complete({
        module: 'Approve',
        listener: async (e) => {
          globalLogger.info('Approve completed:', e);
          // SelfieScan not firing if user if the user fails three attempts
          if (!selfieScanSuccess.current) {
            handleError('Selfie scan failed. Please try again.');
            return finishOnboarding('SignUpError');
          }
          // Approve is called twice for some reason, prevent multiple browser open calls using approveCalledRef
          // @ts-ignore
          if (e.result.status === 'approved' && !approveCalledRef.current) {
            approveCalledRef.current = true;
            const signUpResult = await signUp(
              e.result.id,
              e.result.customerToken,
              interviewId?.current
            );

            // I make requests here because we need biometricsId and incodeSession to request a consent-action
            const consentReq = {
              isAccepted: true,
              biometricsId: e.result.id,
              incodeSession: interviewId?.current,
            };

            await createConsent({
              type: ConsentActionTypesEnum.Privacy,
              ...consentReq,
            });
            await createConsent({
              type: ConsentActionTypesEnum.Age,
              ...consentReq,
            });

            if (!signUpResult) {
              finishOnboarding('SignUpErrorFace');
              approveCalledRef.current = null;
              return handleError(
                'Sorry, this face has already been registered to another user'
              );
            }
            finishOnboarding('IncodeSkipIDComplete');
            approveCalledRef.current = null;
          } else {
            handleError(AuthErrorMessageEnum.SELFIE_FAILED);
          }
        },
      }),
    ];
  }, [
    interviewId,
    incodeSessionToken,
    setSignUpPhone,
    setSignUpPhoneCode,
    compressImage,
    setPhotoPath,
    handleError,
    finishOnboarding,
    setOCRData,
    signUp,
    createConsent,
  ]);

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
