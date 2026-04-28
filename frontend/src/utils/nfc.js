const NFC_MOBILE_MEDIA_QUERY = '(max-width: 768px), (pointer: coarse)';
const IOS_PLATFORM_RE = /iPad|iPhone|iPod/i;
const ANDROID_PLATFORM_RE = /Android/i;
const MOBILE_SAFARI_RE = /Safari/i;
const CHROMIUM_RE = /Chrome|CriOS|Edg|EdgiOS|OPR|SamsungBrowser/i;
const DESKTOP_IPAD_PLATFORM = 'MacIntel';
const APPLE_VENDOR_TOKEN = 'Apple';

function getPlatformHints(win) {
  const ua = String(win?.navigator?.userAgent || '');
  const platform = String(win?.navigator?.platform || '');
  const vendor = String(win?.navigator?.vendor || '');
  const maxTouchPoints = Number(win?.navigator?.maxTouchPoints || 0);
  const likelyIpadDesktopMode = platform === DESKTOP_IPAD_PLATFORM
    && maxTouchPoints >= 2
    && vendor.includes(APPLE_VENDOR_TOKEN)
    && MOBILE_SAFARI_RE.test(ua)
    && !CHROMIUM_RE.test(ua);
  const ios = IOS_PLATFORM_RE.test(ua) || likelyIpadDesktopMode;
  const android = ANDROID_PLATFORM_RE.test(ua);
  const safari = MOBILE_SAFARI_RE.test(ua) && !CHROMIUM_RE.test(ua);
  return { ios, android, safari };
}

export function isNfcSupported(win = window) {
  const hasWindow = !!win;
  const secure = !!win?.isSecureContext;
  const hasReader = typeof win?.NDEFReader === 'function';
  const mobile = !!win?.matchMedia?.(NFC_MOBILE_MEDIA_QUERY)?.matches;
  const { ios, android, safari } = getPlatformHints(win);
  const unsupportedMessage = ios && safari
    ? 'Web NFC is not available on iPhone/iPad Safari. Use Android Chrome for NFC.'
    : 'NFC is not available in this browser/device.';
  return {
    supported: secure && hasReader,
    secure,
    hasReader,
    mobile,
    mobileOnly: mobile,
    ios,
    android,
    safari,
    message: secure
      ? (hasReader ? '' : unsupportedMessage)
      : 'NFC requires HTTPS (secure context).',
  };
}

export function buildNfcResourceUrl(resourceType, resourceKey, location = window.location) {
  const type = resourceType === 'album' ? 'album' : 'track';
  const key = String(resourceKey || '').trim();
  const base = new URL(location.href);
  base.searchParams.set('nfc_type', type);
  base.searchParams.set('nfc_key', key);
  base.searchParams.delete('claim');
  return base.toString();
}

export function parseNfcResourceUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const type = u.searchParams.get('nfc_type');
    const key = u.searchParams.get('nfc_key');
    if ((type === 'track' || type === 'album') && key) {
      return { resource_type: type, resource_key: key };
    }
    return null;
  } catch {
    return null;
  }
}

export function decodeNfcRecordData(record) {
  if (!record) return '';
  if (record.recordType === 'url') {
    if (typeof record.data === 'string') return record.data;
    if (record.data && typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(record.data);
    }
    return '';
  }
  if (record.recordType === 'text') {
    if (typeof record.data === 'string') return record.data;
    if (record.data && typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(record.data);
    }
  }
  return '';
}

export function extractNfcResourceFromMessage(message) {
  const records = message?.records || [];
  for (const record of records) {
    const parsed = parseNfcResourceUrl(decodeNfcRecordData(record));
    if (parsed) return parsed;
  }
  return null;
}
