import { ENCRYPTED_STORAGE_KEYS } from '@bit-ui-libs/common';
import { Incode } from './incode';
// import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';
import { AuthErrorMessageEnum } from '../auth.service.interfaces';
import { globalLogger } from '../common/logger';
import { getBitAuthClaims } from '../auth.utils';
import { useUserStore } from '../user.store';

interface UseIncodeAuthProps {
  handleError: (error: string) => void;
  setScreenLoading: (isLoading: boolean) => void;
  interviewId: any;
  finishOnboarding: (error: string) => void;
  finishChallenge: (opts: { userId: string; token: string }) => Promise<any>;
  signInSuccess: () => void;
}

export function useIncodeAuth({
  handleError,
  setScreenLoading,
  interviewId,
  finishOnboarding,
  finishChallenge,
  signInSuccess,
}: UseIncodeAuthProps) {
  // const queryClient = useQueryClient();
  const userStore = useUserStore((s) => ({ setUserId: s.setUserId }));
  const timesCalledRef = useRef(0);

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

      let _interviewId = interviewId.current;
      if (customInterviewId) {
        _interviewId = customInterviewId;
      }

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

  return {
    signIn,
    signUp,
  };
}
