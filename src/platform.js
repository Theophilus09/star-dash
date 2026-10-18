// src/platform.js

const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.localhost'));

export const START_NG = isLocal
    ? `${window.location.protocol}//start.localhost:8787`
    : 'https://start.ng';

let currentUser = null;
let guestUser = null;
let connectIframe = null;
const userListeners = [];
const pendingRequests = new Map();

export function getCurrentUser() {
    return currentUser;
}

export function onUserChange(callback) {
    if (typeof callback === 'function') {
        userListeners.push(callback);
        if (currentUser || guestUser) {
            callback(currentUser || guestUser);
        }
    }
}

export function signIn() {
    if (isLocal) {
        console.info('[Platform] Local mode: Mocking user sign-in.');
        notify({
            id: 'local-dev-user',
            name: 'Ajibade',
            account: 'Ajibade',
            style: {
                primaryColor: '#00ffcc',
                secondaryColor: '#ff007f',
                skinColor: '#8d5524',
                hat: 'crown',
                accessory: 'visor'
            }
        });
        return;
    }
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${START_NG}/?return_to=${returnTo}`;
}

/**
 * Submit score or multi-stat object to the start.ng leaderboard
 * @param {number | object} scoreOrStats e.g. 39 or { score: 39 }
 */
export function submitGameScore(scoreOrStats) {
    const payload = typeof scoreOrStats === 'number'
        ? { score: scoreOrStats }
        : { stats: scoreOrStats };

    if (isLocal) {
        console.log('[Platform] Local mode: Mocking score submission:', payload);
        return Promise.resolve({
            ok: true,
            result: {
                best: payload.score ?? (payload.stats?.score || 0),
                improved: true,
                rank: 1,
                stats: payload.stats || { score: payload.score }
            }
        });
    }

    return sendPlatformMessage({
        type: 'startng:score',
        ...payload,
    });
}

function notify(user, guest) {
    currentUser = user;
    if (guest) guestUser = guest;
    const active = currentUser || guestUser;
    userListeners.forEach((cb) => {
        try {
            cb(active);
        } catch (err) {
            console.error('Error in user change callback:', err);
        }
    });
}

function sendPlatformMessage(payload) {
    return new Promise((resolve) => {
        const requestId = 'req_' + Math.random().toString(36).substring(2, 9);
        payload.requestId = requestId;
        pendingRequests.set(requestId, resolve);

        if (connectIframe && connectIframe.contentWindow) {
            connectIframe.contentWindow.postMessage(payload, '*');
        } else {
            resolve({ ok: false, error: 'Platform connection not ready' });
        }
    });
}

function setupConnectIframe() {
    if (isLocal) return; // Do not mount iframe in local mock mode

    let iframe = document.getElementById('startng-auth-frame');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'startng-auth-frame';
        iframe.src = `${START_NG}/connect`;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }
    connectIframe = iframe;

    iframe.addEventListener('load', () => {
        sendPlatformMessage({ type: 'startng:whoami' });
    });

    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.requestId && pendingRequests.has(data.requestId)) {
            const resolve = pendingRequests.get(data.requestId);
            pendingRequests.delete(data.requestId);
            resolve(data);
        }

        if (data.type === 'startng:user') {
            notify(data.user, data.guest);
        }
    });
}

if (typeof window !== 'undefined') {
    window.setMockUser = (mockUser) => notify(mockUser);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupConnectIframe);
    } else {
        setupConnectIframe();
    }
}