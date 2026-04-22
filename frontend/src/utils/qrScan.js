export function extractClaimToken(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.searchParams.get('claim') || null;
  } catch {
    return null;
  }
}

export function getScanSupportStatus(win = window) {
  if (!win?.isSecureContext) {
    return {
      supported: false,
      message: 'QR scanning requires a secure context (HTTPS). Please open the app over HTTPS.',
    };
  }
  if (!win?.navigator?.mediaDevices?.getUserMedia) {
    return {
      supported: false,
      message: 'Camera access is not available in this browser. Please paste the URL manually.',
    };
  }
  if (!('BarcodeDetector' in win)) {
    return {
      supported: false,
      message: 'QR scanning is not supported in this browser. Please paste the URL manually.',
    };
  }
  return { supported: true, message: '' };
}

export function buildCameraConstraints() {
  return [
    { video: { facingMode: { ideal: 'environment' } } },
    { video: { facingMode: 'environment' } },
    { video: true },
  ];
}

export async function requestCameraStream(mediaDevices, constraintsList = buildCameraConstraints()) {
  let lastErr = null;
  for (const constraints of constraintsList) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not access camera.');
}

export function getCameraAccessErrorMessage(err) {
  const name = err?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access denied. Please allow camera access and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera is already in use by another application.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Could not start the selected camera. Please try again.';
  }
  if (name === 'SecurityError') {
    return 'Camera access is blocked by browser security settings.';
  }
  return 'Could not access camera.';
}
