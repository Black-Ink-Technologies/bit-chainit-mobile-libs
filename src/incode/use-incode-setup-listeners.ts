import { useCallback, useRef } from 'react';
import {
  ConsentActionTypesEnum,
  type IncodeOcrResult,
} from '@bit-ui-libs/common';
import { Incode } from './incode';
import { AuthErrorMessageEnum } from '../auth.service.interfaces';
import { setIncodeToken, setInterviewId } from '../auth.utils';
import { getParsedPhone } from '../phone-number';
import { globalLogger } from '../common/logger';
import { isUserOverEighteen } from '../check-user-birthday';

interface UseIncodeSetupListenersProps {
  setPhotoPath: (path: string) => void;
  setSignUpPhone: (phone: string) => void;
  setSignUpPhoneCode: (code: number | undefined) => void;
  setOCRData: (data: IncodeOcrResult) => void;
  handleError: (error: string) => void;
  signUp: (
    biometricsId: string,
    customerToken: string,
    interviewId: string
  ) => Promise<boolean>;
  interviewId: any;
  finishOnboarding: (error: string) => void;
  incodeSessionToken: any;
  compressImage: (image: { base64: string }) => Promise<string>;
  createConsent: (data: { type: ConsentActionTypesEnum }) => Promise<void>;
}

export function useIncodeSetupListeners({
  setPhotoPath,
  setSignUpPhone,
  setSignUpPhoneCode,
  setOCRData,
  handleError,
  signUp,
  interviewId,
  finishOnboarding,
  incodeSessionToken,
  compressImage,
  createConsent,
}: UseIncodeSetupListenersProps) {
  const approveCalledRef = useRef<Boolean | null>(null);
  const selfieScanSuccess = useRef<Boolean | null>(null);

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

  return { setupListeners, interviewId, approveCalledRef };
}
