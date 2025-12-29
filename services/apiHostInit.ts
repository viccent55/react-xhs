import { useStore } from '../store';
import { useLoggerStore } from '../store/logger';
import {
  encrypt,
  decrypt,
  makeSign,
  timestamp,
  decryptData,
} from '../plugin/crypto';
import DeviceInfo from 'react-native-device-info';
import { decryptImagePlain } from '../utils/decryptImagePlain';
import { waitForStoreHydrated } from '../hooks/useDebugStorage';
import Config from 'react-native-config';
import { getRegion } from '../plugin/index';

/* =====================================================
 * Session scoped runtime state
 * ===================================================== */
export let loading = false;
export let failedHosts: string[] = [];
export let failedClouds: any[] = [];
// let reportedDomains = new Set<string>();

/* =====================================================
 * Utils
 * ===================================================== */
const isUrl = (u: string) =>
  typeof u === 'string' &&
  (u.startsWith('http://') || u.startsWith('https://'));

const clean = (u: string) => u.replace(/\/+$/, '');

async function withTiming<T>(fn: () => Promise<T>) {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true as const, value, time: Date.now() - start };
  } catch (error) {
    return { ok: false as const, error, time: Date.now() - start };
  }
}

/* =====================================================
 * Crypto payload
 * ===================================================== */
function wrapPayload(rawData: object = {}) {
  const ts = timestamp();
  const encrypted = encrypt(rawData);
  return {
    client: DeviceInfo.getSystemName(),
    timestamp: ts,
    data: encrypted,
    sign: makeSign(ts, encrypted),
  };
}

/* =====================================================
 * Safe JSON
 * ===================================================== */
async function safeJson(res: Response) {
  try {
    const data = await res.json();
    return data && typeof data === 'object'
      ? { ok: true as const, data }
      : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

/* =====================================================
 * Network
 * ===================================================== */
async function postJson(apiUrl: string) {
  try {
    // logger.log(`→ POST ${apiUrl.split('apiv1')[0]}`);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrapPayload({})),
    });

    const parsed = await safeJson(res);
    if (!parsed.ok) return { ok: false as const };

    const raw = parsed.data?.data ? decrypt(parsed.data.data) : parsed.data;
    return { ok: true as const, data: raw.data };
  } catch {
    loading = false;
    return { ok: false as const };
  } finally {
    loading = false;
  }
}

async function fetchJson(url: string, logger: any) {
  try {
    logger.log(`→ GET ${url}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('res', res);
    const parsed = await safeJson(res);
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  } finally {
    loading = false;
  }
}

/* ----------------------------------------------------
 * Report failed domain (fire & forget)
 * -------------------------------------------------- */
async function reportFailedDomain(host: string) {
  try {
    const reportApi = Config.REPORT_API_DOMAIN;
    if (!reportApi) return;

    await fetch(`${reportApi}/apiv1/domain/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: host,
        region: await getRegion(),
        access_time: Math.floor(Date.now() / 1000),
      }),
    });
  } catch {
    /* silent */
  }
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function mergeFastestFirst(prev: string[], next: string[]) {
  return uniq([...next, ...prev]);
}

/* =====================================================
 * MAIN SERVICE
 * ===================================================== */
export async function initApiHostsInternal(): Promise<string | any> {
  await waitForStoreHydrated();
  if (loading) {
    console.log('⏳ initApiHosts ignored (already running)');
    return null;
  }

  loading = true;

  const logger = useLoggerStore.getState();
  const store = useStore.getState();
  await waitForStoreHydrated();
  logger.clear();
  logger.log('🚀 Host resolution started');

  try {
    /* ===============================
     * 1️⃣ API HOST CHECK (FASTEST WINS)
     * =============================== */
    logger.log(`🔍 API host candidates: ${store.apiHosts.length}`);

    const apiResults = await Promise.all(
      store.apiHosts.filter(isUrl).map(host =>
        withTiming(async () => {
          const apiUrl = `${clean(host)}/apiv1/latest-redbook-conf`;
          logger.log(`→ POST ${host}`);

          const res = await postJson(apiUrl);

          // console.log('data => ', data);
          if (!res?.data) {
            throw new Error('api_invalid');
          }

          logger.log(`✅ API OK: ${host}`);
          return { host: clean(host), raw: res.data };
        }),
      ),
    );
    const apiOk = apiResults.filter(r => r.ok).sort((a, b) => a.time - b.time);

    if (!apiOk.length) {
      logger.log('❌ All API hosts failed → switch to cloud');
    } else {
      const fastest = apiOk[0]!.value;
      store.setApiEndPoint(fastest.host);

      logger.log(`⚡ Fastest API host: ${fastest.host} (${apiOk[0].time}ms)`);
      /* ===============================
       * 🟡 ADS IMAGE DECRYPT LOGGING
       * =============================== */
      const advert = fastest.raw?.advert;
      if (!store.hydrated) {
        logger.log('⏳ Store not hydrated yet → skip advert decrypt');
      } else if (advert?.image) {
        if (advert.image !== store.ads.image) {
          logger.log(`🟡 New advert image detected`);
          logger.log(`🔐 Start decrypt advert image`);

          try {
            const base64 = await decryptImagePlain(advert.image);
            store.setAds({ ...advert, base64 });
            logger.log(`✅ Advert image decrypt finished`);
          } catch (e) {
            logger.log(`⚠ Advert image decrypt failed ${e}`);
          }
        } else {
          logger.log(`ℹ️ Advert image unchanged → skip decrypt`);
        }
      }

      /* ===============================
       * 🌐 FRONTEND URL CHECK (FASTEST)
       * =============================== */
      const rawUrls: string[] = Array.isArray(fastest.raw?.urls)
        ? fastest.raw.urls.filter(isUrl).map(clean)
        : [];

      logger.log(`🌐 Frontend candidates: ${rawUrls.length}`);

      const frontResults = await Promise.all(
        rawUrls.map(front =>
          withTiming(async () => {
            try {
              const pingUrl = `${front}/ping.txt`;
              logger.log(`→ GET ${pingUrl}`);

              const res = await fetch(pingUrl);
              if (!res.ok) throw new Error('ping_failed');

              logger.log(`✅ Front OK: ${front}`);
              return front;
            } catch {
              logger.log(`❌ Front FAILED: ${front}`);
              await reportFailedDomain(front);
              throw new Error('front_failed');
            }
          }),
        ),
      );

      const okFronts = frontResults
        .filter(r => r.ok)
        .sort((a, b) => a.time - b.time)
        .map(r => r.value);

      if (okFronts.length) {
        const fastestFront = okFronts[0];

        store.setUrlEndPoint(fastestFront);

        // 🔑 persist ALL usable fronts, fastest first, no duplicates
        const merged = mergeFastestFirst(store.urls, okFronts);
        useStore.setState({ urls: merged });

        logger.log(`⚡ Fastest frontend: ${fastestFront}`);
        logger.log(`💾 Stored frontend URLs (${merged.length})`);
      } else {
        logger.log('❌ No working frontend URL');
      }

      store.setApiHostReady(true);

      /* ===============================
       * 🔐 API HOST LIST (decrypt + store)
       * =============================== */

      const encryptedApis: string[] = Array.isArray(fastest.raw?.apis)
        ? fastest.raw.apis
        : [];

      logger.log(`🔐 Encrypted API list: ${encryptedApis.length}`);
      const decryptedApis = encryptedApis
        .map(enc => {
          try {
            const dec = decryptData(enc);
            logger.log(`✅ API decrypt OK: ${dec}`);
            return dec;
          } catch {
            logger.log(`❌ API decrypt failed`);
            return null;
          }
        })
        .filter(Boolean) as string[];

      if (decryptedApis.length) {
        const mergedApis = mergeFastestFirst(store.apiHosts, decryptedApis);

        useStore.setState({ apiHosts: mergedApis });

        logger.log(`💾 Stored API hosts (${mergedApis.length})`);
      } else {
        logger.log(`⚠ No valid decrypted API hosts`);
      }
      // console.log('api response ', fastest.raw);
      // update live-chat
      store.setCs(fastest.raw?.cs ?? '');
      // debugStorage();
      return fastest.host;
    }

    /* ===============================
     * 2️⃣ CLOUD FALLBACK
     * =============================== */
    logger.log('☁ Switching to CLOUD fallback');

    for (const cloud of store.clouds) {
      logger.log(`☁ Fetch cloud: ${cloud.name} → ${cloud.value}`);

      const list = await fetchJson(cloud.value, logger);

      if (!Array.isArray(list)) {
        logger.log(`❌ Cloud fetch failed: ${cloud.value}`);
        await reportFailedDomain(cloud.value);
        continue;
      }

      logger.log(`🔐 Start decrypt cloud host list (${list.length})`);

      const hosts = list
        .map(x => {
          try {
            return clean(decryptData(x));
          } catch {
            return null;
          }
        })
        .filter(Boolean) as string[];

      logger.log(`✅ Cloud decrypt finished (${hosts.length} hosts)`);

      if (!hosts.length) {
        await reportFailedDomain(cloud.value);
        continue;
      }

      useStore.setState({ apiHosts: hosts });

      const ok = await initApiHostsInternal();
      if (ok) return ok;
    }

    logger.log('🧨 All cloud sources exhausted');
    return null;
  } catch (e) {
    console.log('catch Error: ', e);
  } finally {
    loading = false;
    logger.log('🏁 Host resolution finished');
  }
}
