import type { BaseServiceOptions } from '@bit-ui-libs/common';

export enum AuthErrorMessageEnum {
  CAMERA_PERMISSION_NOT_GRANTED = 'Access to camera was not granted. Please try again',
  CANNOT_OPEN_BROWSER = 'Sorry, we could not open the browser. Please try again',
  AUTH_SESSION_INTERRUPTED = 'Sorry, your authentication was canceled or interrupted. Please try again',
  SIGN_OUT_INTERRUPTED = 'Sorry, the sign-out process was canceled or interrupted. Please try again',
  CANNOT_OPEN_CHALLENGE_URL_DEEP_LINK = 'Sorry, we could not start biometrics authentication. Please try again',
  INTERNAL_SERVER_ERROR = 'Sorry, our server encountered an unexpected error. Please try again',
  UNKNOWN_ERROR = 'Sorry, our server encountered an unknown error. Please try again',
  BAD_REQUEST_ERROR = 'Sorry, something went wrong with your session. Please try again.',
  FACE_NOT_VERIFIED = 'Sorry, the face verification failed. Please ensure you are using the correct face for authentication and try again.',
  FACE_ALREADY_REGISTERED = 'Sorry, this face has already been registered to another user. Please try again',
  SELFIE_FAILED = 'Sorry, your face could not be captured. Please try again',
  WRONG_FACE = 'Sorry, your face does not match the registered user. Please try again',
  USER_BLOCKED_ERROR = 'Sorry, Your account has been blocked',
  INCODE_INITIALIZATION_ERROR = 'Sorry, we could not initialize the Incode SDK. Please try again',
  USER_CANCELED_SELFIE_SCAN = 'Sorry, you canceled a selfie scan, try again ',
  USER_BLOCKED = 'USER_BLOCKED',
}

export enum AuthStepsEnum {
  AUTH0 = 'Auth0',
  PRIVACY_CONSENT = 'PrivacyConsent',
  BIRTH_DATE = 'BirthDate',
  INCODE_ONBOARDING_FACE = 'IncodeOnboardingFace',
  INCODE_ONBOARDING_ID = 'IncodeOnboardingId',
}

export const FRIENDLY_AUTH_ERROR_MAP = {
  'User with this biometric info already exists':
    AuthErrorMessageEnum.FACE_ALREADY_REGISTERED,
  'This is not needed person': AuthErrorMessageEnum.WRONG_FACE,
};

export interface AuthServiceOptions extends BaseServiceOptions {
  clientId: string;
  signInRedirectUrl: string;
  signUpRedirectUrl: string;
  logOutUrl: string;
  errorRedirectUri: string;
}

export interface AuthenticateOptions {
  action: 'sign-in' | 'sign-up';
  // If coming from an invitation, this is used to pass to exchange-code / accept-invite
  ticket?: string;
}

export interface GenerateStateOpts {
  clientId: string;
  redirectUri: string;
  errorRedirectUri: string;
  authType: 'sign-up' | 'sign-in';
}

// This interface defines the blueprint for the "state" query passed in Auth URL.
export interface AuthUrlState {
  clientId: string;
  redirectUri: string;
  app: string;
  version: number;
}

export interface AcceptChallengeOptions {
  // BIT-Core User ID
  userId: string;
  // This comes from IncodeSDK (login / onboarding)
  token: string;
  transactionId: string;
  sessionId?: string;
}

export interface AcceptChallengeRequest {
  // Required: Auth0 challenge session token (this is our cached sessionToken)
  sessionToken: string;
  // Required: Auth0 challenge state (this is our cached state)
  state: string;
  // This is included in the request contract
  // but we don't seem to use it
  photo64?: string;
  fycData: {
    // Required: Incode session ID
    sessionId: string;
    // Required only for sign-up
    userId?: string;
    // Required: Transaction ID from Incode
    // From discussions, this will have a conditional require check
    // (required for sign-in, optional for sign-up)
    transactionId: string;
    // Required: Token (session.token) from Incode
    token: string;
  };
}

export interface AcceptChallengeResponse {
  faceVerified: boolean;
  sessionToken: string;
  // This wasn't marked as required in the backend,
  // so it could possibly be null / undefined (? not sure)
  state?: string | null;
}

export interface FinishChallengeOptions {
  // These two properties are exactly the same as the ones in AcceptChallengeOptions
  // BIT-Core User ID
  userId: string;
  // This comes from IncodeSDK (login / onboarding)
  token: string;
  // Required only for sign-in: This is the Incode sign-in session's ID
  transactionId?: string;
  // Required only for sign-up: This is the Incode sign-up session's ID
  interviewId?: string;
}

export interface ExchangeCodeOptions {
  // These two come from the finish-challenge response URL query
  code: string;
  state: string;
  // Not really sure what this is, but it's needed for both sign-up & sign-in
  // Note: it may not be optional, probably required
  sessionId?: string;
}

export interface ExchangeCodeRequest {
  clientId: string;
  code: string;
  codeVerifier: string;
  state: string;
  // If coming from an invitation, this is used to pass to exchange-code / accept-invite
  ticket?: string;
  // Required only for sign-up
  sessionId?: string;
}

export interface ExchangeCodeResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  bitToken: string;
  tokenType: string;
  expiresIn: number;
}
