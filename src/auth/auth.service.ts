import {
  type ApiServiceError,
  BaseService,
  ENCRYPTED_STORAGE_KEYS,
  type LoggerType,
  createQueryParams,
} from '@bit-ui-libs/common';
import { AxiosError } from 'axios';
// @ts-ignore
import { encode } from 'base-64';
import { Result, err, ok } from 'neverthrow';
import queryString from 'query-string';
import { Linking, Platform } from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import InAppBrowser, {
  type InAppBrowserOptions,
} from 'react-native-inappbrowser-reborn';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';
import pkceChallenge from 'react-native-pkce-challenge';
import { globalLogger } from '../common/logger';
import { clearEncryptedStorage } from '../common/storage';
import {
  type AcceptChallengeOptions,
  type AcceptChallengeRequest,
  type AcceptChallengeResponse,
  AuthErrorMessageEnum,
  type AuthServiceOptions,
  type AuthenticateOptions,
  type ExchangeCodeOptions,
  type ExchangeCodeRequest,
  type ExchangeCodeResponse,
  FRIENDLY_AUTH_ERROR_MAP,
  type FinishChallengeOptions,
  type GenerateStateOpts,
} from './auth.service.interfaces';
import { useAuthStore } from './auth.store';

const BROWSER_CONFIG: InAppBrowserOptions = {
  // This will activate this iOS flag:
  // https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/3237231-prefersephemeralwebbrowsersessio
  ephemeralWebSession: false,
  showTitle: false,
  enableUrlBarHiding: true,
  enableDefaultShare: false,
  toolbarColor: '#80C342',
};

const BROWSER_WAIT_MS = 1000;

export class AuthService extends BaseService {
  // Represents the Auth0 Client ID.
  // This is likely different for Develop / Staging, and Production auth APIs.
  protected clientId: string;

  // Represents the URL (Deep Link) to open after successful sign-in.
  // e.g. chainit://signin-success
  protected signInRedirectUrl: string;

  // Represents the URL (Deep Link) to open after successful sign-up.
  // e.g. chainit://signin-success
  protected signUpRedirectUrl: string;

  // Represents the URL to open after a successful sign-out action.
  // e.g. chainit://callback
  protected logOutUrl: string;

  // Represents the URL to open after an error occurs during authentication.
  // e.g. chainit://callback
  protected errorRedirectUri: string;

  // Holds the data needed for the backend to initialize an invited user.
  // This is currently only used by the invitation flows, to pass data
  protected ticket?: string | null;

  protected logger: LoggerType;

  constructor(opts: AuthServiceOptions) {
    super(opts);
    this.clientId = opts.clientId;
    this.signInRedirectUrl = opts.signInRedirectUrl;
    this.signUpRedirectUrl = opts.signUpRedirectUrl;
    this.logOutUrl = opts.logOutUrl;
    this.errorRedirectUri = opts.errorRedirectUri;
    this.logger = globalLogger.extend('AuthService') as LoggerType;
    globalLogger.enable('AuthService');
    this.logger.debug('AuthService initialized:', JSON.stringify(opts));
  }

  async authenticate(
    opts: AuthenticateOptions
  ): Promise<Result<object, string>> {
    this.logger.info('Authenticate called');
    // "action" lets us know which type of authentication is being requested (sign-up or sign-in)
    // "ticket" is currently only used for the "accept invitation" flow (may need cleaning up later)
    const { action, ticket } = opts;
    // We need to save this because it will be used in finishChallenge
    if (ticket) {
      this.logger.debug('Ticket found:', ticket);
      this.ticket = ticket;
    }

    // 0. Ensure that we can use the camera (this step should probably be done outside this service)
    const cameraPermission =
      Platform.OS === 'android'
        ? PERMISSIONS.ANDROID.CAMERA
        : PERMISSIONS.IOS.CAMERA;
    const permissionStatus = await request(cameraPermission);
    // "!ticket" is checked here because camera permission is not needed for accept-invitation flow
    if (permissionStatus !== RESULTS.GRANTED && !ticket)
      return this.err(AuthErrorMessageEnum.CAMERA_PERMISSION_NOT_GRANTED);

    // 1. Generate Auth URL (see this.getAuthUrl for why we need to "generate" this)
    const getAuthUrlPayload = {
      clientId: this.clientId,
      redirectUri:
        opts.action === 'sign-in'
          ? this.signInRedirectUrl
          : this.signUpRedirectUrl,
      errorRedirectUri: this.errorRedirectUri,
      authType: action,
    };
    this.logger.debug('(1) Calling this.getAuthUrl:', getAuthUrlPayload);
    const { url: authUrl, codeVerifier } = this.getAuthUrl(getAuthUrlPayload);
    this.logger.info('(1) Generated Auth URL:', authUrl);
    this.logger.info('(1) Generated Code Verifier:', codeVerifier);

    // 2. Preparing in-app browser: checking & handling browser if it was broken
    this.logger.info('(2) Checking if browser is available');
    if (!(await this.checkBrowserAvailable()))
      return this.err(AuthErrorMessageEnum.CANNOT_OPEN_BROWSER);
    this.logger.debug(`(2) Waiting ${BROWSER_WAIT_MS}ms to avoid browser bugs`);
    // For some reason this fixes an (iOS) bug "browser gets canceled by openAuth"
    // https://github.com/proyecto26/react-native-inappbrowser/issues/396
    await new Promise((r) => setTimeout(r, BROWSER_WAIT_MS));
    // vadym.horban+dev1off@swanlogic.com
    // 3. Sign-up / sign-in: initiates an authentication flow with Auth0 (backend is the middleman)
    const authResponse = await this.openAuth(authUrl);
    this.logger.info(`(3) Auth (${action}) response:`, authResponse);
    if (authResponse.type !== 'success')
      return this.err(AuthErrorMessageEnum.AUTH_SESSION_INTERRUPTED);
    // chainit://callback
    // 4. Cache codeVerifier, state, sessionToken for the authentication flow (finish-challenge, exchange-code)
    const authResParsedUrl = queryString.parseUrl(authResponse.url);
    this.logger.info('(4) Clearing EncryptedStorage (except intro)');
    await clearEncryptedStorage([
      ENCRYPTED_STORAGE_KEYS.introPassed,
      ENCRYPTED_STORAGE_KEYS.authStep,
      ENCRYPTED_STORAGE_KEYS.authEmails,
      ENCRYPTED_STORAGE_KEYS.incodeInterviewId,
      ENCRYPTED_STORAGE_KEYS.selfCustodyWalletAddress,
      ENCRYPTED_STORAGE_KEYS.selfCustodyWalletMnemonic,
      ENCRYPTED_STORAGE_KEYS.selfCustodyWalletPrivateKey,
    ]);
    this.logger.info('(4) Remembering Code Verifier:', codeVerifier);
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.codeVerifier,
      codeVerifier
    );
    this.logger.info('(4) Remembering State:', authResParsedUrl.query.state);
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.state,
      String(authResParsedUrl.query.state)
    );
    this.logger.info(
      '(4) Remembering Session Token:',
      authResParsedUrl.query.sessionToken
    );
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.sessionToken,
      String(authResParsedUrl.query.sessionToken)
    );

    // 5. Open Challenge URL deep link (e.g. chainit://biometrics?...)
    this.logger.info('(5) Opening Challenge URL:', authResponse.url);
    if (!(await Linking.canOpenURL(authResponse.url)))
      return this.err(AuthErrorMessageEnum.CANNOT_OPEN_CHALLENGE_URL_DEEP_LINK);
    await Linking.openURL(authResponse.url);

    return ok({});
  }

  async finishChallenge(
    opts: FinishChallengeOptions
  ): Promise<Result<object, string>> {
    this.logger.info('Finish Challenge called');
    const { userId, token, interviewId } = opts;

    // 1. Accept Challenge: passing "Biometrics Auth data" -> Auth0 -> Backend
    this.logger.info('(1) Calling Accept Challenge');
    const acceptChallengeResult = await this.acceptChallenge({
      userId,
      token,
      transactionId: opts.transactionId ?? '',
      sessionId: opts.interviewId,
    });
    // 1.1. If something goes wrong here, return with a useful message
    if (acceptChallengeResult.isErr()) return acceptChallengeResult;
    // 1.2. Response gives us data that we must pass back to Finish Challenge
    const { sessionToken, state, faceVerified } = acceptChallengeResult.value;
    // 1.3. Handle "faceVerified" flag, meaning this is not the user's registered face
    if (!faceVerified) return this.err(AuthErrorMessageEnum.FACE_NOT_VERIFIED);
    // 1.4. Preparing in-app browser: checking & handling browser if it was broken
    this.logger.info('(1) Checking if browser is available');
    if (!(await this.checkBrowserAvailable()))
      return this.err(AuthErrorMessageEnum.CANNOT_OPEN_BROWSER);

    // 2. Finish Challenge: telling Auth0 that we finished biometrics authentication
    // 2.1. Set up finish-challenge URL
    const fcQuery = createQueryParams({ sessionToken, state: state as string });
    const fcUrl = `${this.apiUrl}/users/v1/end-user/auth/finish-challenge?${fcQuery}`;
    this.logger.info('(2) Opening Finish Challenge URL:', fcUrl);
    // 2.2. Open InAppBrowser with URL and other configurations
    const fcResponse = await this.openAuth(fcUrl);
    this.logger.debug('(2) Finish Challenge response:', fcResponse);
    if (fcResponse.type !== 'success')
      return err(AuthErrorMessageEnum.AUTH_SESSION_INTERRUPTED);
    // 2.4. We will need "code" and "state" from this URL, to pass to "Exchange Code" step
    const fcResParsedUrl = queryString.parseUrl(fcResponse.url);

    // 3. Exchange Code: Get Auth Tokens from Auth0 -> Backend + Incode -> us
    this.logger.debug('(3) Starting Exchange Code');
    const exchangeCodeResult = await this.exchangeCode({
      code: fcResParsedUrl.query.code as string,
      state: fcResParsedUrl.query.state as string,
      sessionId: interviewId,
    });
    // 3.1. If something goes wrong here, return with a useful message
    if (exchangeCodeResult.isErr()) return exchangeCodeResult;

    // Save new tokens
    const tokens = exchangeCodeResult.value;
    this.logger.debug('(3) Saving tokens from Exchange Code');
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.accessToken,
      tokens.accessToken
    );
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.bitToken,
      tokens.bitToken
    );
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.expiresIn,
      tokens.expiresIn.toString()
    );
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.idToken,
      tokens.idToken
    );
    await EncryptedStorage.setItem(
      ENCRYPTED_STORAGE_KEYS.refreshToken,
      tokens.refreshToken
    );

    return ok({});
  }

  // @ts-ignore
  async signOut() {
    this.logger.info('Log-out URL:', this.logOutUrl);
    // 1. Check if browser is available
    if (!(await this.checkBrowserAvailable()))
      return this.err(AuthErrorMessageEnum.CANNOT_OPEN_BROWSER);

    // 2. Prepare sign-out query params & URL
    const query = createQueryParams({
      clientId: this.clientId,
      redirectUri: this.logOutUrl,
    });
    const url = `${this.apiUrl}/users/v1/end-user/auth/sign-out?${query}`;

    // 3. Open sign-out URL, this clears the Auth0 session
    this.logger.debug('Opening Sign Out URL:', url);
    const signOutResponse = await this.openAuth(url);

    // 4. I don't know if we're supposed to expect a success response here
    this.logger.debug(`Sign Out response:`, signOutResponse);
    if (signOutResponse.type !== 'success')
      return this.err(AuthErrorMessageEnum.SIGN_OUT_INTERRUPTED);

    // 5. Clear organizationId
    try {
      await EncryptedStorage.removeItem(ENCRYPTED_STORAGE_KEYS.organizationId);
    } catch (err) {
      this.logger.warn(err);
    }

    // 6. This is needed because it doesn't close by itself on Android
    await InAppBrowser.close();

    // 7. Clear EncryptedStorage
    await useAuthStore.getState().logout();
    // 7. Clear sentry user
    // clearSentryUser();
  }

  // This function creates the Authentication URL (sign-up / sign-in)
  // Why does it need to be "created" here instead of a simple one-liner?
  // 1. "state" is required in the query which needs to be a base64 encoded JSON string describing our agent
  // 2. "codeVerifier" and "codeChallenge" need to be generated and remembered for the succeeding auth steps (finish-challenge)
  private getAuthUrl(opts: GenerateStateOpts) {
    const { clientId, redirectUri, errorRedirectUri, authType } = opts;

    const urlEncodeB64 = (input: string) => {
      const b64Chars: Record<string, string> = { '+': '-', '/': '_', '=': '' };
      return input.replace(/[+/=]/g, (m) => b64Chars[m] || '');
    };

    // 1. Prepare the "claims" of this "state" token
    // Yes, it needs to be called "redirectUri", not "redirectUrl"
    const state = {
      clientId,
      redirectUri,
      errorRedirectUri,
      app: 'mobile',
      version: 1,
    };
    // 2. IDK wtf is going on here, but this is what the backend wants
    const stateBase64Encoded = urlEncodeB64(encode(JSON.stringify(state)));
    // 3. Generate "codeVerifier" and "codeChallenge"
    // "codeVerifier" must be remembered for the "finish-challenge" step,
    // to verify that we're still the same person
    const { codeVerifier, codeChallenge } = pkceChallenge();
    // Yes, "clientId" is passed in both the query, and in state, for some reason
    // "state" here must be the JSON string as base64, that's why step 2. was needed
    // No idea what "codeChallenge" is for but the backend wants this
    const query = createQueryParams({
      clientId,
      state: stateBase64Encoded,
      codeChallenge,
    });
    const url = `${this.apiUrl}/users/v1/end-user/auth/${authType}?${query}`;
    return { url, codeVerifier };
  }

  // Helper function to check if browser is available with logging and internal error handling
  // This function should never throw an exception, instead always return true or false
  private async checkBrowserAvailable() {
    try {
      const isBrowserAvailable = await InAppBrowser.isAvailable();
      this.logger.info('Is browser available?', isBrowserAvailable);
      if (!isBrowserAvailable) return false;
      // 1.2. Always call closeAuth (although this doesn't seem to actually do anything)
      this.logger.debug('Calling InAppBrowser.closeAuth()');
      await InAppBrowser.closeAuth();
      return true;
    } catch (err) {
      this.logger.error('checkBrowserAvailable error:', err);
      return false;
    }
  }

  // Helper function to call InAppBrowser.openAuth with logging and default options
  private openAuth(url: string, redirectUrl?: string) {
    this.logger.debug('Calling InAppBrowser.openAuth:', url);
    this.logger.debug('redirectUrl:', redirectUrl);
    this.logger.debug('options:', JSON.stringify(BROWSER_CONFIG));
    return InAppBrowser.openAuth(url, redirectUrl || '', BROWSER_CONFIG);
  }

  private async acceptChallenge(
    opts: AcceptChallengeOptions
  ): Promise<Result<AcceptChallengeResponse, string>> {
    this.logger.debug('Accept Challenge called');
    try {
      const cachedSessionToken = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.sessionToken
      );
      const cachedState = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.state
      );
      this.logger.debug(
        'Retrieved Session Token from storage:',
        cachedSessionToken
      );
      this.logger.debug('Retrieved State from storage:', cachedState);
      const data: AcceptChallengeRequest = {
        sessionToken: cachedSessionToken as string,
        state: cachedState as string,
        fycData: {
          sessionId: opts.sessionId ?? '',
          userId: opts.userId,
          token: opts.token,
          transactionId: opts.transactionId,
        },
      };
      const url = `${this.apiUrl}/users/v1/end-user/auth/accept-challenge`;
      this.logger.debug('Calling accept-challenge API:', url, data);
      const response = await this.post<
        AcceptChallengeResponse,
        AcceptChallengeRequest
      >(url, data);
      this.logger.debug('accept-challenge response:', response);
      return ok(response);
    } catch (e) {
      // @ts-ignore
      return this.authErrorToResult('Accept Challenge', e);
    }
  }

  private async exchangeCode(
    opts: ExchangeCodeOptions
  ): Promise<Result<ExchangeCodeResponse, string>> {
    this.logger.debug('Exchange Code called');
    try {
      // Get "codeVerifier" from our cache / storage
      // WARNING!! This must be the SAME, UNCHANGED, since the beginning of this authentication flow
      const cachedCodeVerifier = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.codeVerifier
      );
      this.logger.debug(
        'Retrieved Code Verifier from storage:',
        cachedCodeVerifier
      );
      const data: ExchangeCodeRequest = {
        clientId: this.clientId,
        code: opts.code,
        codeVerifier: cachedCodeVerifier as string,
        state: opts.state,
        // This param is only defined for "accept invitation" flows,
        // and must be forgotten after this
        ticket: this.ticket as string,
        // This param is used by the backend
        // to know which Incode user we are, for onboarding checks
        sessionId: opts.sessionId,
      };
      const url = `${this.apiUrl}/users/v1/end-user/auth/exchange-code`;
      this.logger.debug('Calling exchange-code API:', url, data);
      const response = await this.post<
        ExchangeCodeResponse,
        ExchangeCodeRequest
      >(url, data);
      this.logger.debug('exchange-code response:', response);

      this.logger.debug('Clearing ticket (since exchange-code is done)');
      // Clear ticket, as it is now used, and should not be used again
      // (this is relevant if the ticket actually exists)
      this.ticket = null;

      return ok(response);
    } catch (e) {
      // @ts-ignore
      return this.authErrorToResult('Exchange Code', e);
    }
  }

  // Helper function to handle errors with friendly messages and Result type
  private authErrorToResult(source: string, e: ApiServiceError) {
    this.logger.warn(`Caught error from ${source}:`, e);
    const responseErrorMessage = e?.response?.data?.message;
    const statusCode = (e as AxiosError)?.response?.status;
    this.logger.debug('responseErrorMessage:', responseErrorMessage);
    this.logger.debug('statusCode:', statusCode);
    // If we have a friendly version of the error message, use that

    if (
      responseErrorMessage &&
      responseErrorMessage in FRIENDLY_AUTH_ERROR_MAP
    ) {
      // @ts-ignore
      return this.err(FRIENDLY_AUTH_ERROR_MAP[responseErrorMessage]);
    }
    // Otherwise, return a friendly message based on status code
    switch (statusCode) {
      case 500:
        return this.err(AuthErrorMessageEnum.INTERNAL_SERVER_ERROR);
      case 409:
      case 400:
        return this.err(AuthErrorMessageEnum.BAD_REQUEST_ERROR);
      case 403:
        return this.err(AuthErrorMessageEnum.USER_BLOCKED_ERROR);
      default:
        return this.err(AuthErrorMessageEnum.UNKNOWN_ERROR);
    }
  }

  private err(message: string) {
    this.logger.warn('Returning error result:', message);
    return err(message);
  }
}
