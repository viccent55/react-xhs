import CryptoJS from 'crypto-js';
import md5 from 'crypto-js/md5';
import dayjs from 'dayjs';

const SIGN_KEY = 'super-secret-sign';
const SECRET_KEY = 'mHZ3LVwW8ukKEVvWM1dQi5cyP8pXHFpN'; // 32 chars
const IV = 'Avbn58RBm4RzprRw'; // 16 chars

// Convert key/iv into WordArray (char codes)
const KEY = CryptoJS.enc.Utf8.parse(SECRET_KEY);
const IV_WORD = CryptoJS.enc.Utf8.parse(IV);

// 🔹 AES Encrypt
export function encrypt(data: any): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data);

  const encrypted = CryptoJS.AES.encrypt(text, KEY, {
    iv: IV_WORD,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString(); // base64 string
}

// 🔹 AES Decrypt
export function decrypt(ciphertext: string): any {
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY, {
    iv: IV_WORD,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const decrypted = bytes.toString(CryptoJS.enc.Utf8);
  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

// 🔹 Make Sign (MD5)
export function makeSign(timestamp: number, encryptedData: string): string {
  return md5(`${timestamp}${encryptedData}${SIGN_KEY}`).toString();
}

export function timestamp() {
  return dayjs().unix();
}


// const KEY = "9C+^vMGy#9qynefGF2Bx1234";
// Convert text key → WordArray
const keyWords = CryptoJS.enc.Utf8.parse('9C+^vMGy#9qynefGF2Bx1234');

// Manually zero-pad to 32 bytes (AES-256)
while (keyWords.sigBytes < 32) {
  keyWords.words.push(0);
  keyWords.sigBytes++;
}

/**
 * Encrypt AES-256-CBC (PHP compatible)
 */
export function encryptData(data: string): string {
  const iv = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(data, keyWords, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return (
    CryptoJS.enc.Base64.stringify(iv) +
    ':' +
    encrypted.ciphertext.toString(CryptoJS.enc.Base64)
  );
}

/**
 * Decrypt AES-256-CBC (PHP compatible)
 */
export function decryptData(encryptedData: string) {
  try {
    const [ivB64, ctB64] = encryptedData.split(':');
    if (!ivB64 || !ctB64) return '';

    const iv = CryptoJS.enc.Base64.parse(ivB64);
    const ciphertext = CryptoJS.enc.Base64.parse(ctB64);

    const decrypted = CryptoJS.AES.decrypt({ ciphertext }, keyWords, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return '';
  }
}
