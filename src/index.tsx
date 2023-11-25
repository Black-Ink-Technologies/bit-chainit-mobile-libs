import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@bit-auth/mobile' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const MobileModule = isTurboModuleEnabled
  ? require('./NativeMobile').default
  : NativeModules.Mobile;

const Mobile = MobileModule
  ? MobileModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export function multiply(a: number, b: number): Promise<number> {
  return Mobile.multiply(a, b);
}
