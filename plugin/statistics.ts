/* =====================================================
 * React Native / Expo SAFE Statistics Module
 * ===================================================== */
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { Linking, Platform } from 'react-native';

import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes as rnRandomBytes } from 'react-native-quick-crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import Config from 'react-native-config';
import { useLoggerStore } from '../store/logger';
import { Buffer } from 'buffer';
/* -----------------------------------------------------
 * Types
 * --------------------------------------------------- */
type EmptyObjectType = Record<string, any>;

/* -----------------------------------------------------
 * Global state (same semantics as Vue)
 * --------------------------------------------------- */
let VISITOR_ID = '';
let DEVICE_ID = '';
const DEVICE_ID_KEY = 'STATISTICS_DEVICE_ID';

let PLATFORM_NAME = '';
let QUERY: Record<string, string> = {};

const STATISTICS_KEY = 'STATISTICS_KEY';

let APP_ID = '';
let PRODUCT_ID = '';
let ACTION_TYPE = '';
let PROMO_CODE = '';

const BACKEND_KEY = '33d50673-ad86-4b87-bcf2-b76e7a30c9ef';
let BACKEND_URL = Config.TRANSACTION_API_BASE;

/* -----------------------------------------------------
 * Helpers
 * --------------------------------------------------- */
function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function getDeviceFingerprintBase() {
  return [
    DeviceInfo.getModel(), // e.g. "Pixel 7"
    DeviceInfo.getSystemName(), // "Android" / "iOS"
    DeviceInfo.getSystemVersion(), // "14"
    DeviceInfo.getBrand(), // "Google"
  ].join('-');
}
export function getRandomBytes(length: number): Uint8Array {
  return rnRandomBytes(length);
}
function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function deriveKey(source: string): Uint8Array {
  return sha256(utf8ToBytes(source));
}

function encryptAesGcm(
  plaintext: string,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  return gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
}

function hmacSign(
  payloadB64: string,
  nonceB64: string,
  ts: number,
  keyBytes: Uint8Array,
) {
  const msg = utf8ToBytes(`${payloadB64}|${nonceB64}|${ts}`);
  return bytesToBase64(hmac(sha256, keyBytes, msg));
}

/* -----------------------------------------------------
 * Storage helpers (AsyncStorage)
 * --------------------------------------------------- */
async function getLocal(key: string) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setLocal(key: string, data: any) {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

/* -----------------------------------------------------
 * Platform / Query
 * --------------------------------------------------- */
function getPlatform() {
  return Platform.OS; // android | ios | web
}

export async function getQueryParams(): Promise<Record<string, string>> {
  try {
    const url = await Linking.getInitialURL();
    if (!url) return {};

    const parsed = Linking.parse(url);
    return (parsed.queryParams ?? {}) as Record<string, string>;
  } catch (e) {
    console.warn('getQueryParams failed:', e);
    return {};
  }
}

/* -----------------------------------------------------
 * Device ID (persistent)
 * --------------------------------------------------- */
export async function getDeviceId(): Promise<string> {
  // 1️⃣ cached
  const cached = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (cached) return cached;

  // 2️⃣ device-info ID
  const id = await DeviceInfo.getUniqueId();

  // 3️⃣ persist
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);

  return id;
}

/* -----------------------------------------------------
 * Visitor ID (Fingerprint replacement)
 * --------------------------------------------------- */
export async function getVisitorId() {
  try {
    const base = getDeviceFingerprintBase();
    VISITOR_ID = bytesToBase64(sha256(utf8ToBytes(base)));

    return { visitorId: VISITOR_ID, requestId: '' };
  } catch (e) {
    console.error('getVisitorId failed:', e);
    return '';
  }
}

/* -----------------------------------------------------
 * HTTP helper (fetch)
 * --------------------------------------------------- */
export async function post(
  url: string,
  data: any,
  options: EmptyObjectType = {},
) {
  const logger = useLoggerStore.getState();
  const timeout = options.timeout ?? 5000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    logger.log(`🚨 ERROR post: ${String(err)}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* -----------------------------------------------------
 * Config setters (same API)
 * --------------------------------------------------- */
function setAppId(v: string) {
  if (v) APP_ID = v;
}
function setProductId(v: string) {
  if (v) PRODUCT_ID = v;
}
function setActionType(v: string) {
  if (v) ACTION_TYPE = v;
}
function setBackendURL(v: string) {
  if (v) BACKEND_URL = v;
}

/* -----------------------------------------------------
 * Core statistics request
 * --------------------------------------------------- */
async function onStatistics(info: EmptyObjectType) {
  const logger = useLoggerStore.getState();
  try {
    const timestamp = nowTs();
    const nonceBytes = getRandomBytes(12);
    const nonceB64 = bytesToBase64(nonceBytes);

    const payload = JSON.stringify({
      actionType: info.actionType,
      promoCode: info.promoCode,
      channelCode: info.channelCode,
      productCode: info.productCode,
      timestamp,
    });
    console.log('payload:', payload)

    const keyBytes = deriveKey(BACKEND_KEY);
    const cipherBytes = encryptAesGcm(payload, keyBytes, nonceBytes);
    const dataB64 = bytesToBase64(cipherBytes);
    const signB64 = hmacSign(dataB64, nonceB64, timestamp, keyBytes);

    const body = {
      data: dataB64,
      nonce: nonceB64,
      timestamp,
      signature: signB64,
    };

    const headers = {
      'X-Device-Id': DEVICE_ID,
      'X-App-Id': APP_ID,
      'X-Platform': PLATFORM_NAME,
      'X-VisitorID': VISITOR_ID,
      'X-Nonce': nonceB64,
      'X-Timestamp': String(timestamp),
      'X-Signature': signB64,
    };

    logger.log(`📡 POST ${BACKEND_URL}/track/action`);
    const res = await post(`${BACKEND_URL}/track/action`, body, { headers });
    logger.log(`📡 Success Report => code: ${res.code} msg:${res.msg}`);
  } catch (e) {
    console.error('onStatistics failed:', e);
  }
}

/* -----------------------------------------------------
 * Save local snapshot
 * --------------------------------------------------- */
async function onSaveLocal() {
  const cached = await getLocal(STATISTICS_KEY);
  if (cached) return;

  await setLocal(STATISTICS_KEY, {
    product_id: PRODUCT_ID,
    appId: APP_ID,
    device_id: DEVICE_ID,
    visitor_id: VISITOR_ID,
    platform: PLATFORM_NAME,
    create_time: nowTs(),
  });
}

/* -----------------------------------------------------
 * Handle
 * --------------------------------------------------- */
async function onHandle() {
  return onStatistics({
    promoCode: PROMO_CODE || QUERY.code,
    channelCode: QUERY.chan,
    productCode: PRODUCT_ID,
    actionType: ACTION_TYPE,
  });
}

/* -----------------------------------------------------
 * Init (same name)
 * --------------------------------------------------- */
export async function onInit() {
  DEVICE_ID = await getDeviceId();
  PLATFORM_NAME = getPlatform();
  QUERY = await getQueryParams();

  await getVisitorId();
  await onSaveLocal();
}

/* -----------------------------------------------------
 * setConfig (same name & usage)
 * --------------------------------------------------- */
export async function setConfig(value: EmptyObjectType) {
  if (!value || typeof value !== 'object') return;
  if (value.appId) setAppId(value.appId);
  if (value.productId) setProductId(value.productId);
  if (value.backendURL) setBackendURL(value.backendURL);
  if (value.actionType) setActionType(value.actionType);
  if (value.promoCode) PROMO_CODE = value.promoCode;

  await onInit();

  if (APP_ID) {
    await onHandle();
  }
}
