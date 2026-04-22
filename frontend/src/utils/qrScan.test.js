import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCameraConstraints,
  extractClaimToken,
  getCameraAccessErrorMessage,
  getScanSupportStatus,
  requestCameraStream,
} from './qrScan.js';

test('extractClaimToken returns claim token from valid URL', () => {
  assert.equal(extractClaimToken('https://example.com/path?claim=abc123'), 'abc123');
});

test('extractClaimToken returns null for invalid URL or missing claim', () => {
  assert.equal(extractClaimToken('not-a-url'), null);
  assert.equal(extractClaimToken('https://example.com/path?x=1'), null);
  assert.equal(extractClaimToken(''), null);
});

test('getScanSupportStatus validates secure context and capabilities', () => {
  assert.equal(
    getScanSupportStatus({ isSecureContext: false }).supported,
    false,
  );

  assert.equal(
    getScanSupportStatus({ isSecureContext: true, navigator: {} }).supported,
    false,
  );

  assert.equal(
    getScanSupportStatus({
      isSecureContext: true,
      navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
    }).supported,
    false,
  );

  assert.equal(
    getScanSupportStatus({
      isSecureContext: true,
      navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
      BarcodeDetector: class {},
    }).supported,
    true,
  );
});

test('buildCameraConstraints returns fallback list with environment preference', () => {
  const constraints = buildCameraConstraints();
  assert.equal(Array.isArray(constraints), true);
  assert.equal(constraints.length, 3);
  assert.deepEqual(constraints[2], { video: true });
});

test('requestCameraStream retries through constraints until success', async () => {
  let call = 0;
  const mediaDevices = {
    getUserMedia: async () => {
      call += 1;
      if (call < 3) throw new Error('failed');
      return { id: 'stream-ok' };
    },
  };
  const stream = await requestCameraStream(mediaDevices, [{ video: 1 }, { video: 2 }, { video: 3 }]);
  assert.equal(stream.id, 'stream-ok');
  assert.equal(call, 3);
});

test('requestCameraStream throws last error when all attempts fail', async () => {
  const mediaDevices = {
    getUserMedia: async () => {
      const err = new Error('no camera');
      err.name = 'NotFoundError';
      throw err;
    },
  };
  await assert.rejects(
    () => requestCameraStream(mediaDevices, [{ video: true }]),
    /no camera/,
  );
});

test('getCameraAccessErrorMessage maps common camera errors', () => {
  assert.equal(
    getCameraAccessErrorMessage({ name: 'NotAllowedError' }),
    'Camera access denied. Please allow camera access and try again.',
  );
  assert.equal(
    getCameraAccessErrorMessage({ name: 'NotFoundError' }),
    'No camera was found on this device.',
  );
  assert.equal(
    getCameraAccessErrorMessage({ name: 'NotReadableError' }),
    'Camera is already in use by another application.',
  );
  assert.equal(
    getCameraAccessErrorMessage({ name: 'SomethingElse' }),
    'Could not access camera.',
  );
});
