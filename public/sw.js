const cachePrefix = 'neuk-bike-';
const cacheName = `${cachePrefix}v5`;
const scopePath = new URL(self.registration.scope).pathname;
const appBasePath = scopePath.endsWith('/')
  ? scopePath.slice(0, -1)
  : scopePath;

function appPath(path) {
  return `${appBasePath}${path}`;
}

const coreAssets = [
  appPath('/'),
  appPath('/site.webmanifest'),
  appPath('/favicon.ico'),
  appPath('/favicon.svg'),
  appPath('/icon-192.png'),
  appPath('/icon-512.png'),
  appPath('/apple-touch-icon.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(coreAssets))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (candidate) =>
                candidate.startsWith(cachePrefix) && candidate !== cacheName,
            )
            .map((candidate) => caches.delete(candidate)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isStaticAsset(request) {
  if (!isSameOrigin(request)) {
    return false;
  }

  const url = new URL(request.url);

  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.startsWith(appPath('/_next/static/'))
  );
}

function isParkingData(request) {
  return (
    isSameOrigin(request) &&
    new URL(request.url).pathname.startsWith(appPath('/data/parking/'))
  );
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }

  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(appPath('/'), response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await caches.match(appPath('/'));

    if (cachedResponse) {
      return cachedResponse;
    }

    throw new Error('Navigation failed and no cached app shell is available.');
  }
}

async function networkFirstData(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw new Error('Parking data is unavailable and has not been cached.');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !isSameOrigin(request)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isParkingData(request)) {
    event.respondWith(
      new URL(request.url).pathname.endsWith('/manifest.json')
        ? networkFirstData(request)
        : cacheFirst(request),
    );
    return;
  }

  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request));
  }
});
