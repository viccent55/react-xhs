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
  const logger = useLoggerStore.getState();

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
  } catch (e) {
    console.log('Error: =>', e);
    logger.log(`log error postJson => ${e}`);
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
  } catch (e) {
    logger.log(`log error postJson => ${e}`);
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

//Helpers
async function fastest<T>(tasks: Promise<T>[]): Promise<T> {
  return Promise.any(tasks);
}

async function resolveApiFast(): Promise<string> {
  const logger = useLoggerStore.getState();
  const store = useStore.getState();

  logger.log(`🔍 API host candidates: ${store.apiHosts.length}`);

  const result: any = await fastest(
    store.apiHosts.filter(isUrl).map(host =>
      withTiming(async () => {
        const url = `${clean(host)}/apiv1/ping/ping`;
        logger.log(`→ GET ${url}`);

        const res = await fetch(url);
        if (!res.ok) throw new Error('api_invalid');

        logger.log(`✅ API OK: ${host}`);
        return clean(host);
      }),
    ),
  );
  store.setApiEndPoint(result.value);
  logger.log(`⚡ Selected API host: ${result.value}`);

  return result.value ?? '';
}

async function fetchAndDecryptCloud(cloud: {
  name: string;
  value: string;
}): Promise<string[]> {
  const logger = useLoggerStore.getState();

  logger.log(`☁ Fetch cloud: ${cloud.name} → ${cloud.value}`);

  let list: unknown;

  try {
    list = await fetchJson(cloud.value, logger);
  } catch (e) {
    logger.log(`❌ Cloud fetch error: ${cloud.value}`);
    console.log(e);
    await reportFailedDomain(cloud.value);
    return [];
  }

  if (!Array.isArray(list)) {
    logger.log(`❌ Cloud response invalid: ${cloud.value}`);
    await reportFailedDomain(cloud.value);
    return [];
  }

  logger.log(`🔐 Cloud encrypted hosts: ${list.length}`);

  const hosts = list
    .map(enc => {
      try {
        return clean(decryptData(enc));
      } catch {
        return null;
      }
    })
    .filter(Boolean) as string[];

  if (!hosts.length) {
    logger.log(`❌ Cloud decrypt produced no valid hosts`);
    await reportFailedDomain(cloud.value);
    return [];
  }

  logger.log(`✅ Cloud decrypt success (${hosts.length} hosts)`);

  return hosts;
}
const updateApiListInBackground = async (api: string) => {
  const logger = useLoggerStore.getState();
  const store = useStore.getState();

  try {
    const apiUrl = `${clean(api)}/apiv1/latest-redbook-conf`;
    const res = await postJson(apiUrl);

    if (!res?.data) return;

    /* ===============================
     * 🟡 ADS IMAGE (background)
     * =============================== */
    const advert = res.data.advert;
    if (advert?.image && advert.image !== store.ads.image) {
      try {
        logger.log('🟡 Advert image decrypting');
        const base64 = await decryptImagePlain(advert.image);
        store.setAds({ ...advert, base64 });
        logger.log('✅ Advert image decrypt finished');
      } catch {
        logger.log('⚠ Advert image decrypt failed');
      }
    }

    /* ===============================
     * 🌐 FRONTEND URL LIST (background)
     * =============================== */
    const rawUrls: string[] = Array.isArray(res.data.urls)
      ? res.data.urls.filter(isUrl).map(clean)
      : [];

    if (rawUrls.length) {
      // ✔ Store ALL URLs (no ping here)
      useStore.setState({ urls: rawUrls });

      // ✔ If no current urlEndPoint, set first one
      if (!store.urlEndPoint) {
        store.setUrlEndPoint(rawUrls[0]);
        logger.log(`🌐 Default frontend set: ${rawUrls[0]}`);
      }

      logger.log(`💾 Stored frontend URLs (${rawUrls.length})`);
    }

    /* ===============================
     * 🔐 API HOST LIST (background)
     * =============================== */
    const encryptedApis: string[] = Array.isArray(res.data.apis)
      ? res.data.apis
      : [];

    const decryptedApis = encryptedApis
      .map(enc => {
        try {
          return clean(decryptData(enc));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    if (decryptedApis.length) {
      useStore.setState({ apiHosts: decryptedApis });
      logger.log(`💾 Stored API hosts (${decryptedApis.length})`);
    }

    /* ===============================
     * 💬 CS / Live chat
     * =============================== */
    if (res.data.cs) {
      store.setCs(res.data.cs);
    }
  } catch (e) {
    logger.log('⚠ Background API update failed');
    console.log('error => ', e);
  }
};

/* =====================================================
 * MAIN SERVICE
 * ===================================================== */
export async function initApiHostsInternal(): Promise<string | null> {
  await waitForStoreHydrated();
  if (loading) return null;
  loading = true;

  const logger = useLoggerStore.getState();
  const store = useStore.getState();

  logger.clear();
  logger.log('🚀 Host resolution started');

  try {
    /* === API (blocking) === */
    const api = await resolveApiFast();
    /* === BACKGROUND (non-blocking) === */
    await updateApiListInBackground(api);

    /* === FRONTEND (blocking) === */
    // const urls = store.urls;
    // await resolveFrontFast(urls);

    store.setApiHostReady(true);

    return api;
  } catch {
    logger.log('☁ Switching to CLOUD fallback');
    for (const cloud of store.clouds) {
      const hosts = await fetchAndDecryptCloud(cloud);
      if (!hosts.length) continue;

      useStore.setState({ apiHosts: hosts });
      logger.log('🔁 Retrying API resolution with cloud hosts');
      const ok = await initApiHostsInternal();
      if (ok) return ok;
    }

    logger.log('🧨 All cloud sources exhausted');
    return null;
  } finally {
    loading = false;
    logger.log('🏁 Host resolution finished');
  }
}
