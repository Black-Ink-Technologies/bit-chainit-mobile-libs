import type { IncodeOcrResult } from '@bit-ui-libs/common';
import { create } from 'zustand';
import { clearAuthData } from '../common/storage';

type AuthModes = 'sign-in' | 'sign-up';

interface AuthStoreState {
  userId: string;
  authMode: AuthModes;
  isAuthenticated: boolean;
  isScreenLoading: boolean;
  hasProfile: boolean;
  photoPath: string;
  // If the user session expired while using the app,
  // then this will let us know what screen they were last in after re-authenticating.
  redirectScreenName: string;
  hasWallet: boolean;
  ocrData: IncodeOcrResult | null;
  signUpPhone: string;
  signUpPhoneCode: number | undefined;
  // Flags for org-onboarding to know the following:
  // 1. is user signing up under an organization; accepted an invite to organization
  // 2. is user the first user of the organization, if 1. is true
  isInvitedToOrg: boolean;
  dateOfBirth: string;
  selfieScanSuccess: boolean;
  setUserId: (userId: string) => void;
  setAuthMode: (authMode: AuthModes) => void;
  setPhotoPath: (photoPath: string) => void;
  setRedirectScreenName: (s: string) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setHasProfile: (hasProfile: boolean) => void;
  setHasWallet: (hasWallet: boolean) => void;
  setDOB: (dob: string) => void;
  setOCRData: (ocr: IncodeOcrResult) => void;
  setSignUpPhone: (signUpPhone: string) => void;
  setSignUpPhoneCode: (signUpPhoneCode: number | undefined) => void;
  // This setter lets the caller update both flags for org-onboarding (above)
  setOrgInvitationState: (payload: { isInvitedToOrg: boolean }) => void;
  setSelfieScanSuccess: (selfieScanSuccess: boolean) => void;
  // Recommended function to use when logic needs to imperatively logout of the app.
  // setAuthenticated is another way, however, does not clean up EncryptedStorage items.
  logout: () => void;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  userId: '',
  authMode: 'sign-in',
  isAuthenticated: false,
  isScreenLoading: false,
  hasProfile: false,
  photoPath: '',
  redirectScreenName: '',
  hasWallet: false,
  ocrData: null,
  signUpPhone: '',
  signUpPhoneCode: undefined,
  isInvitedToOrg: false,
  dateOfBirth: '',
  selfieScanSuccess: false,
  setUserId: (userId) => set({ userId }),
  setAuthMode: (authMode) => set({ authMode }),
  setPhotoPath: (photoPath) => set({ photoPath }),
  setRedirectScreenName: (s) => set({ redirectScreenName: s }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setHasProfile: (hasProfile) => set({ hasProfile }),
  setHasWallet: (hasWallet) => set({ hasWallet }),
  setOCRData: (ocrData) => set({ ocrData }),
  setDOB: (dob) => set({ dateOfBirth: dob }),
  setSignUpPhone: (signUpPhone) => set({ signUpPhone }),
  setSignUpPhoneCode: (signUpPhoneCode) => set({ signUpPhoneCode }),
  setOrgInvitationState: (payload) => set(payload),
  setSelfieScanSuccess: (selfieScanSuccess) => set({ selfieScanSuccess }),
  logout: async () => {
    await clearAuthData();
    set({ isAuthenticated: false });
  },
}));
