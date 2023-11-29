import { ENCRYPTED_STORAGE_KEYS } from '@bit-ui-libs/common';
import EncryptedStorage from 'react-native-encrypted-storage';
import { getLoggerByNamespace } from './logger';

export async function clearEncryptedStorage(keysToSkip?: string[]) {
  const logger = getLoggerByNamespace('clearEncryptedStorage');
  if (keysToSkip) {
    const keys = Object.keys(ENCRYPTED_STORAGE_KEYS) as Array<
      keyof typeof ENCRYPTED_STORAGE_KEYS
    >;
    const keysToRemove = keys.filter((k) => !keysToSkip.includes(k));
    // Remember keys that were skipped for logging purposes
    const skippedKeys: string[] = [];
    for (let index = 0; index < keysToRemove.length; index++) {
      try {
        const key = keysToRemove[index] as string;
        if (!(await EncryptedStorage.getItem(key))) {
          skippedKeys.push(key);
          continue;
        }
        await EncryptedStorage.removeItem(key);
      } catch (err) {
        logger.warn(err);
      }
    }
    if (skippedKeys.length > 0)
      logger.debug('These keys were not in EncryptedStorage:', skippedKeys);
    return;
  }

  await EncryptedStorage.clear();
}

export async function clearAuthData() {
  await clearEncryptedStorage([
    ENCRYPTED_STORAGE_KEYS.introPassed,
    ENCRYPTED_STORAGE_KEYS.authStep,
    ENCRYPTED_STORAGE_KEYS.authEmails,
    ENCRYPTED_STORAGE_KEYS.incodeInterviewId,
    ENCRYPTED_STORAGE_KEYS.selfCustodyWalletAddress,
    ENCRYPTED_STORAGE_KEYS.selfCustodyWalletMnemonic,
    ENCRYPTED_STORAGE_KEYS.selfCustodyWalletPrivateKey,
  ]);
}
