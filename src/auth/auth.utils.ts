import {
  ENCRYPTED_STORAGE_KEYS,
  type AuthClaims,
  type BitAuthClaims,
  type LogLevels,
} from '@bit-ui-libs/common';
import { AuthStepsEnum } from './auth.service.interfaces';
import { jwtDecode } from 'jwt-decode';

import EncryptedStorage from 'react-native-encrypted-storage';
import axios from 'axios';
import { logger } from 'react-native-logs';

type RefreshTokenRequest = {
  clientId: string;
  refreshToken: string;
};

type RefreshTokenResponse = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  bitToken: string;
  tokenType: string;
  expiresIn: number;
  scope?: string;
  somebodyElse?: boolean;
  canMerge?: boolean;
};
const globalLogger = logger.createLogger<LogLevels>();

// DECODE and extract value from Access Token header (Authorization: Bearer ...)
export async function getAuthClaims() {
  const token = await EncryptedStorage.getItem(
    ENCRYPTED_STORAGE_KEYS.accessToken
  );
  return jwtDecode<AuthClaims>(token as string);
}

// DECODE and extract value from BIT Token header (Bit-Token: ...)
export async function getBitAuthClaims() {
  let bitToken;
  try {
    bitToken = await EncryptedStorage.getItem(ENCRYPTED_STORAGE_KEYS.bitToken);
  } catch (err) {
    const logger = globalLogger.extend(getBitAuthClaims.name);
    globalLogger.enable(getBitAuthClaims.name);
    logger.error(err);
  }

  return jwtDecode<BitAuthClaims>(bitToken as string);
}

export async function getAuthEmail() {
  const claims = await getAuthClaims();
  return claims['https://blackinktech.io/schemas/claims/email'];
}

export async function getAuth0Id(opts?: { removePrefix: boolean }) {
  const claims = await getAuthClaims();
  if (opts?.removePrefix) return claims.sub.replace('auth0|', '');
  return claims.sub;
}

export async function setAuthLastStep(step: AuthStepsEnum) {
  globalLogger.debug('setting step ', step);
  await EncryptedStorage.setItem(ENCRYPTED_STORAGE_KEYS.authStep, step);
}

export async function getAuthLastStep() {
  return EncryptedStorage.getItem(
    ENCRYPTED_STORAGE_KEYS.authStep
  ) as Promise<AuthStepsEnum>;
}

export async function setInterviewId(interviewId: string) {
  return EncryptedStorage.setItem(
    ENCRYPTED_STORAGE_KEYS.incodeInterviewId,
    interviewId
  );
}

export async function getInterviewId() {
  return EncryptedStorage.getItem(ENCRYPTED_STORAGE_KEYS.incodeInterviewId);
}

export async function setIncodeToken(token: string) {
  return EncryptedStorage.setItem(ENCRYPTED_STORAGE_KEYS.incodeToken, token);
}

export async function getIncodeToken() {
  return EncryptedStorage.getItem(ENCRYPTED_STORAGE_KEYS.incodeToken);
}

export async function setSignUpEmail(email: string) {
  try {
    globalLogger.debug('setSignUpEmail', email);
    return EncryptedStorage.setItem(ENCRYPTED_STORAGE_KEYS.authEmails, email);
  } catch (error) {
    globalLogger.debug('cant save authEmail', error);
    return false;
  }
}

export async function getSignUpEmail() {
  try {
    const email = await EncryptedStorage.getItem(
      ENCRYPTED_STORAGE_KEYS.authEmails
    );
    globalLogger.debug('getting authEmail', email);
    return email;
  } catch (error) {
    globalLogger.error('cant get authEmail', error);
    return false;
  }
}

export function refreshAccessToken(input: RefreshTokenRequest, apiUrl: string) {
  return (
    axios
      // Use a fresh instance of axios here
      // to avoid cyclic response interceptors if this responds with an error
      .create({})
      .post<RefreshTokenResponse>(
        `${apiUrl}/users/v1/end-user/auth/refresh-token`,
        input
      )
      .then((res) => res.data)
  );
}
