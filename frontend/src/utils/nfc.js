const NFC_MOBILE_MEDIA_QUERY = '(max-width: 768px), (pointer: coarse)';

export function isNfcSupported(win = window) {
  const hasWindow = !!win;
  const secure = !!win?.isSecureContext;
  const hasReader = typeof win?.NDEFReader === 'function';
  const mobile = !!win?.matchMedia?.(NFC_MOBILE_MEDIA_QUERY)?.matches;
  return {
    supported: secure && hasReader,
    secure,
    hasReader,
    mobile,
    mobileOnly: mobile,
    message: secure
      ? (hasReader ? '' : 'NFC is not available in this browser/device.')
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
