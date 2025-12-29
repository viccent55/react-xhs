// utils/decryptImagePlain.ts
import CryptoJS from 'crypto-js';
import Config from 'react-native-config';

/* =====================================================
 * AES config
 * ===================================================== */
const encryptionKey = CryptoJS.enc.Utf8.parse(
  'k9:3zeFq~]-EQMF,gpGx*uRw+x,n]xw9',
);
const iv = CryptoJS.enc.Utf8.parse('Zd3!t#t1YN=!fs)D');

const imageCache = new Map<string, string>();

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Latin1.parse(binary));
}

export async function decryptImagePlain(
  imageUrl: string,
): Promise<string> {
  
console.log('ENV KEYS:', Object.keys(Config));
console.log('IMAGE_HOST =', Config.IMAGE_HOST);

const fullUrl = `${Config.IMAGE_HOST}${imageUrl}`;

  if (imageCache.has(fullUrl)) {
    return imageCache.get(fullUrl)!;
  }

  const res = await fetch(fullUrl);
  if (!res.ok) {
    throw new Error(`Image fetch failed: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const encryptedBytes = new Uint8Array(buffer);

  const cipherText = CryptoJS.lib.WordArray.create(encryptedBytes as any);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: cipherText } as any,
    encryptionKey,
    {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  const decryptedBytes = new Uint8Array(
    decrypted.words.flatMap(word => [
      (word >> 24) & 0xff,
      (word >> 16) & 0xff,
      (word >> 8) & 0xff,
      word & 0xff,
    ]),
  ).slice(0, decrypted.sigBytes);

  if (!decryptedBytes.length) {
    throw new Error('Decryption failed');
  }

  const base64 = uint8ArrayToBase64(decryptedBytes);
  const dataUri = `data:image/jpeg;base64,${base64}`;

  imageCache.set(fullUrl, dataUri);
  return dataUri;
}
