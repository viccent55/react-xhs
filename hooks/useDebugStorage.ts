// utils/storageDebug.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../store';


/* =========================================
 * Dump ALL AsyncStorage (read-only)
 * ======================================= */
export async function debugStorage() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const items = await AsyncStorage.multiGet(keys);

    console.log('📦 AsyncStorage dump START');
    if (!items.length) {
      console.log('📭 AsyncStorage is empty');
    }

    items.forEach(([key, value]) => {
      console.log(`🔑 ${key}:`, value);
    });

    console.log('📦 AsyncStorage dump END');
  } catch (e) {
    console.log('❌ debugStorage failed', e);
  }
}

/* =========================================
 * Remove ONE key (safe)
 * ======================================= */
export async function removeStorageKey(key: string) {
  try {
    await AsyncStorage.removeItem(key);
    console.log(`🗑️ Removed AsyncStorage key: ${key}`);
  } catch (e) {
    console.log(`❌ Failed to remove key: ${key}`, e);
  }
}

/* =========================================
 * Clear ALL AsyncStorage (DANGEROUS)
 * ======================================= */
export async function clearAllStorage() {
  try {
    await AsyncStorage.clear();
    console.log('🔥 AsyncStorage cleared بالكامل (ALL)');
  } catch (e) {
    console.log('❌ Failed to clear AsyncStorage', e);
  }
}

/* =========================================
 * Remove Zustand store only
 * ======================================= */
export async function clearZustandStore() {
  try {
    await AsyncStorage.removeItem('app-store');
    console.log('🧹 Zustand store (app-store) cleared');
  } catch (e) {
    console.log('❌ Failed to clear Zustand store', e);
  }
}


export function waitForStoreHydrated(
  timeoutMs = 3000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    // already hydrated
    if (useStore.getState().hydrated) {
      resolve();
      return;
    }

    const unsub = useStore.subscribe(state => {
      if (state.hydrated) {
        unsub();
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        unsub();
        reject(new Error('waitForStoreHydrated timeout'));
      }
    });
  });
}