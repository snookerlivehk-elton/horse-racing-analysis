
// ==UserScript==
// @name         HKJC Odds Pusher
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Intercepts HKJC GraphQL odds and pushes to local/remote server
// @author       Trae Assistant
// @match        *://bet.hkjc.com/*
// @match        *://racing.hkjc.com/*
// @match        *://info.hkjc.com/*
// @include      *://bet.hkjc.com/*
// @include      *://racing.hkjc.com/*
// @include      *://info.hkjc.com/*
// @connect      horse-racing-analysis-production.up.railway.app
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('[HKJC Pusher v1.4] Script starting...');

    // CONFIGURATION
    const SERVER_URL = 'https://horse-racing-analysis-production.up.railway.app/api/odds/push';
    const DEBUG_LOG = true; // Set to true to see all HKJC related requests in console

    // VISUAL INDICATOR
    function ensureIndicator() {
        if (document.getElementById('hkjc-odds-pusher-indicator')) return;
        if (!document.body) return;

        const indicator = document.createElement('div');
        indicator.id = 'hkjc-odds-pusher-indicator';
        indicator.style.cssText = 'position:fixed; bottom:10px; right:10px; padding:8px 12px; background:rgba(0,100,0,0.9); color:white; z-index:2147483647; border-radius:8px; font-size:14px; font-weight:bold; box-shadow:0 0 10px rgba(0,0,0,0.5); pointer-events:none; font-family:sans-serif; border: 2px solid #0f0;';
        indicator.innerText = '🟢 Odds Pusher: Ready (v1.4)';
        document.body.appendChild(indicator);
    }

    setInterval(ensureIndicator, 1000);

    function updateIndicator(status, msg) {
        const indicator = document.getElementById('hkjc-odds-pusher-indicator');
        if (!indicator) return;

        if (status === 'pushing') {
            indicator.innerText = '🟡 Pushing...';
            indicator.style.background = 'rgba(100,100,0,0.9)';
        } else if (status === 'success') {
            indicator.innerText = '🟢 Pushed: ' + new Date().toLocaleTimeString();
            indicator.style.background = 'rgba(0,100,0,0.9)';
        } else if (status === 'error') {
            indicator.innerText = '🔴 Push Failed';
            indicator.style.background = 'rgba(100,0,0,0.9)';
        }
    }

    function pushOdds(payload) {
        console.log('[HKJC Pusher] Pushing data for Race', payload.raceNo);
        updateIndicator('pushing');

        GM_xmlhttpRequest({
            method: "POST",
            url: SERVER_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: function(response) {
                console.log('[HKJC Pusher] Push successful:', response.responseText);
                updateIndicator('success');
            },
            onerror: function(error) {
                console.error('[HKJC Pusher] Push failed:', error);
                updateIndicator('error');
            }
        });
    }

    // COMMON PROCESSING LOGIC
    function processResponseData(json, context) {
        try {
            // Check structure
            const raceMeetings = json.data?.raceMeetings;
            if (!raceMeetings || raceMeetings.length === 0) return;

            const meeting = raceMeetings[0];
            const pools = meeting.pmPools;
            
            if (!pools || pools.length === 0) return;

            // Try to get context from request, or fallback to current page state if needed
            let date = context?.date;
            let venueCode = context?.venueCode;
            let raceNo = context?.raceNo;

            // Fallback: Check if response itself contains date/venue (sometimes it does in other fields)
            if (!date && meeting.meetingDate) date = meeting.meetingDate.split('T')[0]; // Assuming format
            
            if (!date || !venueCode || !raceNo) {
                if (DEBUG_LOG) console.warn('[HKJC Pusher] Missing context for odds data:', { date, venueCode, raceNo });
                return;
            }

            console.log(`[HKJC Pusher] Intercepted odds for ${date} ${venueCode} Race ${raceNo}`);
            
            pushOdds({
                date,
                venue: venueCode,
                raceNo,
                pools
            });

        } catch (e) {
            console.error('[HKJC Pusher] Error processing data:', e);
        }
    }

    function extractContextFromQuery(bodyString) {
        try {
            if (!bodyString) return null;
            const body = JSON.parse(bodyString);
            const vars = body.variables;
            if (vars && vars.date && vars.venueCode && vars.raceNo) {
                return {
                    date: vars.date,
                    venueCode: vars.venueCode,
                    raceNo: vars.raceNo
                };
            }
        } catch (e) {
            // Ignore parse errors
        }
        return null;
    }

    // --- INTERCEPTOR 1: FETCH ---
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        const response = await originalFetch(...args);

        if (typeof resource === 'string' && (resource.includes('graphql') || resource.includes('hkjc.com'))) {
            if (DEBUG_LOG) console.log('[HKJC Pusher] Fetch detected:', resource);
            
            // Clone and inspect
            try {
                const clone = response.clone();
                clone.json().then(data => {
                    const context = config && config.body ? extractContextFromQuery(config.body) : null;
                    processResponseData(data, context);
                }).catch(() => {});
            } catch (e) {}
        }
        return response;
    };

    // --- INTERCEPTOR 2: XHR (XMLHttpRequest) ---
    // Many legacy parts or specific libraries use XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            if (this._url && (this._url.includes('graphql') || this._url.includes('hkjc.com'))) {
                if (DEBUG_LOG) console.log('[HKJC Pusher] XHR detected:', this._url);
                try {
                    const data = JSON.parse(this.responseText);
                    const context = extractContextFromQuery(body);
                    processResponseData(data, context);
                } catch (e) {
                    // Not JSON or error parsing
                }
            }
        });
        return originalSend.apply(this, arguments);
    };

})();
