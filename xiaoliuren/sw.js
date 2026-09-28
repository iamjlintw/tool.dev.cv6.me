/**
 * 小六壬快速問事 — Service Worker
 *
 * scope 由註冊時的 './' 決定，只涵蓋 /xiaoliuren/ 目錄；
 * fetch handler 只處理 scope 內的同源 GET 請求，其餘（上層 analytics.js、GA、外站）一律放行不快取。
 * App shell 採 cache-first；換版時改 VERSION 即清舊快取。
 */
'use strict';

const VERSION = 'xiaoliuren-v1.1.0';
const SHELL = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './xiaoliurenPalaces.js',
    './xiaoliurenCore.js',
    './xiaoliurenInterpreter.js',
    './xiaoliurenPrompt.js',
    './xiaoliurenStore.js',
    './views/home.js',
    './views/result.js',
    './views/history.js',
    './views/validation.js',
    './views/settings.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon-180.png',
];

const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(VERSION)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k.startsWith('xiaoliuren-') && k !== VERSION).map((k) => caches.delete(k))),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // 只接管 scope 內的同源請求；其他一律不處理（不快取 analytics、外站、上層工具）
    if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return;

    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((response) => {
                    if (response && response.ok && response.type === 'basic') {
                        const copy = response.clone();
                        caches.open(VERSION).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => {
                    if (request.mode === 'navigate') return caches.match('./index.html');
                    return Response.error();
                });
        }),
    );
});
