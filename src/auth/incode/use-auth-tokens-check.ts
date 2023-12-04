import { ENCRYPTED_STORAGE_KEYS } from '@bit-ui-libs/common';
import { useEffect, useState } from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';

// This hook is used by Auth screens
// to check periodically if tokens are set in EncryptedStorage.
export function useAuthTokensCheck() {
  const [areTokensReady, setTokensReady] = useState(false);

  useEffect(() => {
    const checkTokens = async () => {
      const accessToken = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.accessToken
      );
      const bitToken = await EncryptedStorage.getItem(
        ENCRYPTED_STORAGE_KEYS.bitToken
      );
      if (accessToken && bitToken) {
        clearInterval(interval);
        setTokensReady(true);
      }
    };
    const interval = setInterval(checkTokens, 100);
    checkTokens();
    return () => {
      clearInterval(interval);
    };
  }, []);

  return { areTokensReady };
}
