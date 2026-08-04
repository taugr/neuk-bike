type LocalIdCrypto = {
  getRandomValues?: (values: Uint8Array) => Uint8Array;
  randomUUID?: () => string;
};

let fallbackIdCounter = 0;

function formatUuid(bytes: Uint8Array) {
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function createLocalId(
  cryptoApi: LocalIdCrypto | undefined = globalThis.crypto,
) {
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID.call(cryptoApi);
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues.call(cryptoApi, bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return formatUuid(bytes);
  }

  fallbackIdCounter += 1;
  return [
    'local',
    Date.now().toString(36),
    fallbackIdCounter.toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join('-');
}
