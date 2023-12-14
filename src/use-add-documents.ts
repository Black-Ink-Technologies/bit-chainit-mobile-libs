import {
  type CompleteFycOnboardingRequest,
  ENCRYPTED_STORAGE_KEYS,
  type IncodeOcrResult,
} from '@bit-ui-libs/common';
import axios, { type AxiosRequestConfig } from 'axios';
import { useEffect, useRef, useState } from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';
import { Incode, initializeIncode } from './auth/incode';
import { globalLogger } from './common/logger';
import { getBitAuthClaims } from './auth/auth.utils';
import { AuthErrorMessageEnum } from './auth/auth.service.interfaces';
import { useAuthStore } from './auth/auth.store';

interface UseAddDocumentsOptions {
  avatar?: string;
  enabled?: boolean;
  endUserService: any;
  INCODE_API_URL: string;
  ID_CAPTURE_FLOW: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useAddDocuments({
  enabled,
  avatar,
  endUserService,
  INCODE_API_URL,
  ID_CAPTURE_FLOW,
  onSuccess,
  onError,
}: UseAddDocumentsOptions) {
  const [verificationLoading, setVerificationLoading] = useState(false);
  const { setOCRData } = useAuthStore();
  // const logger = useLogger({ namespace: 'Profile' });
  // const toast = useToast({ namespace: 'User Profile' });
  const incodeSessionToken = useRef<string | null>(null);
  const interviewId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let unsubscribers: any[];
    initializeIncode()
      .then(() => {
        Incode.getInstance().showCloseButton(true);
        unsubscribers = setupListeners();
      })
      .catch((err) => globalLogger.error(err));
    return () => {
      unsubscribers &&
        Array.isArray(unsubscribers) &&
        unsubscribers?.forEach(
          (unsubscriber) => unsubscriber && unsubscriber()
        );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TODO: refactor everything
  const setupListeners = () => {
    // Returns a callback to unregister your listener, e.g. when your screen is getting unmounted
    Incode.getInstance().onSessionCreated(async (session) => {
      globalLogger.debug('Incode.onSessionCreated:', session);
      interviewId.current = session.interviewId;
      incodeSessionToken.current = session.token;
      const { userId } = await getBitAuthClaims();
      globalLogger.info('userId', userId);
      const selfieBase64 = avatar
        ? avatar
        : await endUserService.getPreviousSessionSelfie(userId);
      //globalLogger.info('selfie', selfie);
      // TODO: refactor
      const addFace = await axios
        .create({})
        .post(
          `${INCODE_API_URL}/0/omni/add/face/third-party?imageType=selfie`,
          { base64Image: selfieBase64 },
          {
            headers: {
              'api-version': '1.0',
              'X-Incode-Hardware-Id': incodeSessionToken.current,
            },
          }
        )
        .then((res) => res.data);
      globalLogger.info('addFace', addFace);
    });
    const complete = Incode.getInstance().onStepCompleted;
    return [
      complete({
        module: 'ProcessId',
        listener: async (e) => {
          const ocrResult = e.result as IncodeOcrResult;
          setOCRData(ocrResult);
          globalLogger.info('ProcessID completed', ocrResult);
        },
      }),
      complete({
        module: 'FaceMatch',
        listener: (e) => {
          globalLogger.info('FaceMatch completed', e.result);
        },
      }),
    ];
  };

  const addDocument = async () => {
    try {
      setVerificationLoading(true);
      const { userId } = await getBitAuthClaims();
      const customerUUID = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.incodeUserId
      );
      const { faceMatched } = await Incode.getInstance().startFaceLogin({
        showTutorials: false,
        faceMaskCheck: false,
        customerUUID: customerUUID ?? undefined,
      });

      if (!faceMatched) {
        setVerificationLoading(false);
        onError && onError(AuthErrorMessageEnum.WRONG_FACE);
        return;
      }

      const { status } = await Incode.getInstance().startOnboarding({
        flowConfig: [
          { module: 'IdScanFront' },
          { module: 'IdScanBack' },
          { module: 'ProcessId' },
          { module: 'FaceMatch' },
        ],
        sessionConfig: {
          configurationId: ID_CAPTURE_FLOW,
          validationModules: ['id', 'liveness', 'faceRecognition'],
        },
      });
      if (status === 'userCancelled') {
        setVerificationLoading(false);
        return;
      }

      try {
        const validationApiUrl = `${INCODE_API_URL}/0/omni/process/government-validation`;
        const opts: AxiosRequestConfig = {
          method: 'POST',
          headers: {
            'api-version': '1.0',
            'X-Incode-Hardware-Id': incodeSessionToken.current,
          },
        };
        globalLogger.debug(
          'Calling government-validation API:',
          validationApiUrl,
          JSON.stringify(opts)
        );
        const validationRes = await axios
          .create({})
          .post(validationApiUrl, {}, opts);
        globalLogger.debug(
          'government-validation API response:',
          JSON.stringify(validationRes)
        );
      } catch (err) {
        globalLogger.error('Government Validation error:', err);
      }

      const req: CompleteFycOnboardingRequest = {
        userId,
        // This should be the Interview ID (backend has bad name)
        sessionId: interviewId.current ?? '',
      };
      globalLogger.debug('Calling completeOnboarding:', req);
      await endUserService.completeFycOnboarding(userId, req);

      Incode.getInstance().finishOnboardingFlow();
      setVerificationLoading(false);
      onSuccess && onSuccess();
    } catch (err) {
      setVerificationLoading(false);
      globalLogger.error(err);
      onError && onError(err as string);
    }
    setVerificationLoading(false);
  };

  return { addDocument, verificationLoading };
}
