// store/index.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AdsState = {
  name: string;
  image: string;
  base64: string;
  position: number | null;
  url: string;
};

type CloudItem = {
  name: string;
  value: string;
};

type StoreState = {
  // ==================
  // hydration
  // ==================
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  // ==================
  // API
  // ==================
  apiEndPoint: string;
  urlEndPoint: string;
  apiHostReady: boolean;

  apiHosts: string[];
  urls: string[];
  clouds: CloudItem[];
  cs: string;

  // ==================
  // Ads
  // ==================
  ads: AdsState;

  // ==================
  // Actions
  // ==================
  setApiEndPoint: (v: string) => void;
  setUrlEndPoint: (v: string) => void;
  setApiHostReady: (v: boolean) => void;
  setAds: (ads: Partial<AdsState>) => void;
  setCs: (v: string) => void;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      setHydrated: v => set({ hydrated: v }),

      apiEndPoint: '',
      urlEndPoint: '',
      apiHostReady: false,
      cs: '',

      apiHosts: [
        'https://www.xhs1000.xyz',
        'https://www.xhs1100.xyz',
        'https://www.xhs1300.xyz',
        'https://www.xhs1400.xyz',
        'https://www.xhs1500.xyz',
        'https://www.xhs1600.xyz',
      ],

      urls: [],
      clouds: [
        {
          name: 'worker',
          value: 'https://xhs.jamescarter77.wor1kers.dev',
        },
        {
          name: 'bitbucket',
          value: 'https://bitbucket.org/wuwencam/suppor1t/raw/main/xhs.json',
        },
        {
          name: 'gitlab',
          value: 'https://gitlab.com/wuwencam/support/-/raw1/main/xhs.json',
        },
        {
          name: 'gittee',
          value: 'https://gitee.com/wuwencam/support/raw/ma1ster/xhs.json',
        },
      ],

      ads: {
        name: '',
        image: '',
        base64: '',
        position: null,
        url: '',
      },

      setApiEndPoint: v => set({ apiEndPoint: v }),
      setUrlEndPoint: v => set({ urlEndPoint: v }),
      setApiHostReady: v => set({ apiHostReady: v }),

      setCs: v => set({ cs: v }),

      setAds: ads =>
        set({
          ads: { ...get().ads, ...ads },
        }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => state => {
        state?.setHydrated(true);
        console.log('✅ Store hydrated');
      },
    },
  ),
);
