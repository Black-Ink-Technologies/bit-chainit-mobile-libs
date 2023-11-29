import { getErrorMessage } from '@bit-ui-libs/common';
// import { jwtDecode } from 'jwt-decode';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { globalLogger } from '../common/logger';
import { AuthErrorMessageEnum } from '../auth.service.interfaces';
import { Incode, isIncodeTestMode } from './incode';
import { getInterviewId } from '../auth.utils';

interface UseIncodeFlowsProps {
  finishOnboarding: (error: string) => void;
  handleError: (error: string) => void;
  signIn: (
    transactionId: string,
    token: string,
    customerUUID: string,
    interviewId: string
  ) => void;
  setSessionMessage: (message: string) => void;
  setSkipLoading: (isLoading: boolean) => void;
  setScreenLoading: (isLoading: boolean) => void;
  interviewId: any;
  setFlowType: (flowType: string) => void;
  sessionToken: string;
  onboardingFlowId: string;
  checkRequestPermissions: (isOnboarding: boolean) => Promise<any>;
  showAppSettingsModal: (type: 'camera' | 'location') => void;
}

export function useIncodeFlows({
  finishOnboarding,
  handleError,
  signIn,
  setSessionMessage,
  setSkipLoading,
  setScreenLoading,
  interviewId,
  setFlowType,
  sessionToken,
  onboardingFlowId,
  checkRequestPermissions,
  showAppSettingsModal,
}: UseIncodeFlowsProps) {
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
          interviewId: _interviewId,
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
      // vadym.horban+devr8@swanlogic.com
      // 123456qQ!
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

  return {
    startOnboarding,
    startIncodeFlow,
    startEmptyOnboarding,
  };
}
