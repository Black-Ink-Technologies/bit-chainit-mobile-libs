import {
  ENCRYPTED_STORAGE_KEYS,
  isTokenExpired,
  type LogLevels,
} from '@bit-ui-libs/common';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getUniqueId } from 'react-native-device-info';
import EncryptedStorage from 'react-native-encrypted-storage';
import { v5 as uuidv5 } from 'uuid';
import { useAuthStore } from './auth.store';
import { useUserStore } from './user.store';
import { getBitAuthClaims, refreshAccessToken } from './auth.utils';
import { logger as RNLogger } from 'react-native-logs';

interface UseAuthProviderProps {
  AUTH0_CLIENT_ID: string;
  API_URL: string;
  getDeviceByExternalId: (externalId: string) => Promise<{ id: string }>;
}
const logger = RNLogger.createLogger<LogLevels>({ severity: 'debug' });

export function useAuthProvider({
  AUTH0_CLIENT_ID,
  API_URL,
  getDeviceByExternalId,
}: UseAuthProviderProps) {
  console.log('saldkajshkdjhakdjad', useAuthStore.getState());

  const authStore = useAuthStore((s) => ({
    setAuthenticated: s.setAuthenticated,
    logout: s.logout,
  }));
  const userStore = useUserStore((s) => ({
    setUserId: s.setUserId,
    setOrgId: s.setOrgId,
    setDeviceId: s.setDeviceId,
  }));
  const { isLoading } = useQuery({
    queryKey: ['check-auth-tokens'],
    queryFn: async () => {
      const accessToken = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.accessToken
      );
      const bitToken = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.bitToken
      );
      const refreshToken = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.refreshToken
      );
      logger.debug('Access Token:', accessToken?.toString() ?? '');
      logger.debug('BIT Token:', bitToken?.toString() ?? '');

      const areTokensSet =
        accessToken !== null &&
        accessToken !== undefined &&
        bitToken !== null &&
        bitToken !== undefined;
      logger.debug('Are auth tokens set?:', areTokensSet ? 'Yes' : 'No');
      if (!areTokensSet) return false;

      const isAnyTokenExpired =
        isTokenExpired(accessToken) || isTokenExpired(bitToken);
      logger.debug(
        'Is any auth token expired?:',
        isAnyTokenExpired ? 'Yes' : 'No'
      );

      if (!isAnyTokenExpired) {
        await letUserIn();
        return true;
      }

      if (!AUTH0_CLIENT_ID) throw new Error('Missing Auth0 Credentials');

      const isRefreshTokenExpired =
        !refreshToken || isTokenExpired(refreshToken);
      logger.debug(
        'Is refresh token expired?:',
        isRefreshTokenExpired ? 'Yes' : 'No'
      );
      if (!isRefreshTokenExpired) {
        logger.debug('Refreshing access & bit tokens...');
        const res = await refreshAccessToken(
          {
            clientId: AUTH0_CLIENT_ID,
            refreshToken,
          },
          API_URL
        );
        logger.debug('Refreshed!');
        await EncryptedStorage.setItem(
          ENCRYPTED_STORAGE_KEYS.accessToken,
          res.accessToken
        );
        await EncryptedStorage.setItem(
          ENCRYPTED_STORAGE_KEYS.bitToken,
          res.bitToken
        );
        await EncryptedStorage.setItem(
          ENCRYPTED_STORAGE_KEYS.refreshToken,
          res.refreshToken ?? ''
        );
        await letUserIn();
        return true;
      }

      // Only call logout() if any of the tokens and refresh token are expired
      logger.debug('Logging user out');
      authStore.logout();
      return false;
    },
    staleTime: Infinity,
  });

  const letUserIn = useCallback(async () => {
    const userId = (await getBitAuthClaims()).userId;
    userStore.setUserId(userId);
    userStore.setOrgId(
      (await EncryptedStorage.getItem(ENCRYPTED_STORAGE_KEYS.organizationId)) ||
        ''
    );

    // Check if device is registered, then remember it's ID
    let deviceId = '';
    try {
      const customDeviceId = uuidv5(
        `${userId}_${await getUniqueId()}`,
        uuidv5.URL
      );
      logger.debug('Calling getDeviceByExternalId:', customDeviceId);
      const res = await getDeviceByExternalId(customDeviceId);
      logger.debug('Got Device By External ID:', res);
      deviceId = res.id;
    } catch (err) {
      logger.error('getDeviceByExternalId error:', err);
    }
    userStore.setDeviceId(deviceId);

    logger.debug('Letting user in');
    authStore.setAuthenticated(true);
  }, [authStore, getDeviceByExternalId, userStore]);

  return { isLoading };
}
