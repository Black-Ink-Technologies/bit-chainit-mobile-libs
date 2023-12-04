import { create } from 'zustand';

interface UserAuthStoreState {
  userId: string;
  orgId: string;
  deviceId: string;
  setUserId: (userId: string) => void;
  setOrgId: (userId: string) => void;
  setDeviceId: (deviceId: string) => void;
}

export const useUserStore = create<UserAuthStoreState>((set) => ({
  userId: '',
  orgId: '',
  deviceId: '',
  setUserId: (userId) => set({ userId }),
  setOrgId: (orgId) => set({ orgId }),
  setDeviceId: (deviceId) => set({ deviceId }),
}));

export const useUserId = () => useUserStore((s) => s.userId);

export const useDeviceId = () => useUserStore((s) => s.deviceId);
