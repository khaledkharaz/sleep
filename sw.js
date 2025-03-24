// sw.js (Combined Service Worker - Caching, Background Audio, and Cache Versioning)

// **Cache Versioning:** Increment this version number every time you deploy a new version of your app!
const CACHE_VERSION = 'v3';
const CACHE_NAME = 'sleep-white-noise-cache-' + CACHE_VERSION;

// Define assets to cache for offline use
const basePath = self.location.pathname.replace('sw.js', ''); // Base path for relative URLs
const urlsToCache = [  basePath,                 // Root path (e.g., '/')
  basePath + 'index.html',   // Main HTML file
  basePath + 'sw.js'        // Service worker itself (consider if you really need to cache this)
  // Add other static assets you want to cache here (CSS, JS files, images, etc.)
  // e.g., basePath + 'css/styles.css', basePath + 'js/app.js', basePath + 'images/logo.png'
];

// **Audio Playback Variables:**
let audioContext;
let noiseNode;
let gainNode;
let isPlaying = false;
let timerId = null;
let currentNoiseType = "white"; // Default noise type
let noiseBuffer; // Store the generated noise buffer
let currentVolume = 0.5; // Default volume


// **Install Event:** Cache initial resources
self.addEventListener('install', event => {
  console.log('Service Worker installing, version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache); // Add initial URLs to cache
      })
  );
});

// **Fetch Event:** Serve cached content when possible, fall back to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return cached response
        if (response) {
          return response;
        }

        // Not in cache - fetch from network
        const fetchRequest = event.request.clone();
        return fetch(fetchRequest).then(response => {
          // Check if we received a valid response
          if(!response || response.status !== 200 || response.type !== 'basic') {
            return response; // If not valid, just return network response
          }

          // Response is valid, cache it for future use
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache); // Add response to cache
            });
          return response; // Return network response to the browser
        });
      })
  );
});

// **Activate Event:** Clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating, version:', CACHE_VERSION);
  // Define whitelist which contains current cache name.
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // Delete caches that are not in the whitelist (old versions)
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});


// **Audio Context Initialization:**
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (self.AudioContext || self.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.gain.value = currentVolume; // Set initial volume
    gainNode.connect(audioContext.destination);
  }
}

// **Noise Generation Function:**
function createNoise(type) {
  currentNoiseType = type;

  if (noiseNode) {
    noiseNode.disconnect();
    noiseNode = null; // Allow garbage collection
  }

  const bufferSize = 2 * audioContext.sampleRate;
  noiseBuffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate
  );
  const data = noiseBuffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
  for (let i = 0; i < bufferSize; i++) {
    let white = Math.random() * 2 - 1;
    if (type === "white") {
      data[i] = white;
    } else if (type === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + white * 0.5362) * 0.11;
    } else if (type === "brown") {
      const brown = (b0 + 0.02 * white) / 1.02;
      b0 = brown;
      data[i] = brown * 3.5;
    }
  }
}

// **Start Playback Function:**
function startPlayback(noiseType, durationInMinutes) {
  if (!audioContext) {
    initAudioContext();
  }
  if (!noiseBuffer || currentNoiseType !== noiseType) {
    createNoise(noiseType);
  }
  if (!isPlaying) {
    noiseNode = audioContext.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    noiseNode.connect(gainNode);
    noiseNode.start(0);
    isPlaying = true;
    console.log('Playback started in Service Worker', {noiseType, durationInMinutes});
    if (durationInMinutes && durationInMinutes > 0) {
      setTimer(durationInMinutes);
    }
  } else {
    console.log('Playback already running in Service Worker');
  }
}

// **Stop Playback Function:**
function stopPlayback() {
  if (noiseNode && isPlaying) {
    noiseNode.stop();
    noiseNode.disconnect();
    noiseNode = null;
    isPlaying = false;
    console.log('Playback stopped in Service Worker');
  }
  clearTimer();
}

// **Set Timer Function:**
function setTimer(durationInMinutes) {
  clearTimer();
  const durationMs = durationInMinutes * 60 * 1000;
  timerId = setTimeout(() => {
    stopPlayback();
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ action: 'timerEnded' }));
    });
  }, durationMs);
  console.log(`Timer set for ${durationInMinutes} minutes in Service Worker`);
}

// **Clear Timer Function:**
function clearTimer() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
    console.log('Timer cleared in Service Worker');
  }
}

// **Set Volume Function:**
function setVolume(volumeLevel) {
  if (gainNode) {
    gainNode.gain.value = volumeLevel;
    currentVolume = volumeLevel;
    console.log('Volume set in Service Worker to:', volumeLevel);
  }
}

// **Message Listener:** Handle messages from the main page
self.addEventListener('message', event => {
  const message = event.data;
  switch (message.action) {
    case 'start':
      startPlayback(message.noiseType, message.duration);
      break;
    case 'stop':
      stopPlayback();
      break;
    case 'setVolume':
      setVolume(message.volume);
      break;
    case 'setNoiseType':
      currentNoiseType = message.noiseType;
      break;
    case 'clearTimer':
      clearTimer();
      break;
    default:
      console.log('Service Worker received unknown message:', message);
  }
});