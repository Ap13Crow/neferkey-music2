import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNfcResourceUrl,
  decodeNfcRecordData,
  extractNfcResourceFromMessage,
  isNfcSupported,
  parseNfcResourceUrl,
} from './nfc.js';

test('isNfcSupported validates secure context and reader capability', () => {
  const supported = isNfcSupported({
    isSecureContext: true,
    NDEFReader: class MockReader {},
    matchMedia: () => ({ matches: true }),
  });
  assert.equal(supported.supported, true);
  assert.equal(supported.mobileOnly, true);

  const unsupported = isNfcSupported({
    isSecureContext: false,
    NDEFReader: class MockReader {},
    matchMedia: () => ({ matches: false }),
  });
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.message, /HTTPS/);
});

test('isNfcSupported returns iOS Safari-specific unsupported message', () => {
  const unsupported = isNfcSupported({
    isSecureContext: true,
    NDEFReader: undefined,
    matchMedia: () => ({ matches: true }),
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    },
  });
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.ios, true);
  assert.match(unsupported.message, /iPhone\/iPad Safari/);
});

test('buildNfcResourceUrl and parseNfcResourceUrl round-trip values', () => {
  const url = buildNfcResourceUrl(
    'track',
    'demo-track-1',
    { href: 'https://example.com/app?claim=abc' },
  );
  assert.equal(
    url,
    'https://example.com/app?nfc_type=track&nfc_key=demo-track-1',
  );
  assert.deepEqual(parseNfcResourceUrl(url), {
    resource_type: 'track',
    resource_key: 'demo-track-1',
  });
});

test('extractNfcResourceFromMessage returns first compatible record', () => {
  const message = {
    records: [
      { recordType: 'text', data: new TextEncoder().encode('hello') },
      { recordType: 'url', data: 'https://example.com/?nfc_type=album&nfc_key=album-1' },
    ],
  };
  assert.deepEqual(extractNfcResourceFromMessage(message), {
    resource_type: 'album',
    resource_key: 'album-1',
  });
  assert.equal(decodeNfcRecordData(message.records[0]), 'hello');
});
