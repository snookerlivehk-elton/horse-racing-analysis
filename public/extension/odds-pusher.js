
// ==UserScript==
// @name         HKJC Odds Pusher
// @namespace    http://tampermonkey.net/
// @version      1.3
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

    console.log('[HKJC Pusher v1.3] Script starting... Please ensure Developer Mode is ON in extensions.');

    // CONFIGURATION
    const SERVER_URL = 'https://horse-racing-analysis-production.up.railway.app/api/odds/push';
    
    // VISUAL INDICATOR
    function ensureIndicator() {
        if (document.getElementById('hkjc-odds-pusher-indicator')) return;
        if (!document.body) return;

        const indicator = document.createElement('div');
        indicator.id = 'hkjc-odds-pusher-indicator';
        indicator.style.cssText = 'position:fixed; bottom:10px; right:10px; padding:8px 12px; background:rgba(0,100,0,0.9); color:white; z-index:2147483647; border-radius:8px; font-size:14px; font-weight:bold; box-shadow:0 0 10px rgba(0,0,0,0.5); pointer-events:none; font-family:sans-serif; border: 2px solid #0f0;';
        indicator.innerText = '🟢 Odds Pusher: Ready (v1.3)';
        document.body.appendChild(indicator);
        console.log('[HKJC Pusher] Indicator attached.');
    }

    // Run immediately and periodically (to handle SPA navigation/DOM clearing)
    setInterval(ensureIndicator, 1000);

    // Helper to push data using GM_xmlhttpRequest to bypass CORS
    function pushOdds(payload) {
        console.log('[HKJC Pusher] Pushing data for Race', payload.raceNo);
        const indicator = document.getElementById('hkjc-odds-pusher-indicator');
        if (indicator) {
            indicator.innerText = '🟡 Pushing...';
            indicator.style.background = 'rgba(100,100,0,0.9)';
        }

        GM_xmlhttpRequest({
            method: "POST",
            url: SERVER_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: function(response) {
                console.log('[HKJC Pusher] Push successful:', response.responseText);
                if (indicator) {
                    indicator.innerText = '🟢 Pushed: ' + new Date().toLocaleTimeString();
                    indicator.style.background = 'rgba(0,100,0,0.9)';
                }
            },
            onerror: function(error) {
                console.error('[HKJC Pusher] Push failed:', error);
                if (indicator) {
                    indicator.innerText = '🔴 Push Failed';
                    indicator.style.background = 'rgba(100,0,0,0.9)';
                }
            }
        });
    }

    // INTERCEPT FETCH (Used by new HKJC site)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        
        // Call original fetch first
        const response = await originalFetch(...args);

        try {
            // Check if this is the target GraphQL endpoint
            if (typeof resource === 'string' && resource.includes('info.cld.hkjc.com/graphql/base/')) {
                // Clone response to read body without consuming it
                const clone = response.clone();
                clone.json().then(data => {
                    processGraphQLResponse(data, config);
                }).catch(e => console.error('[HKJC Pusher] JSON parse error:', e));
            }
        } catch (e) {
            console.error('[HKJC Pusher] Interceptor error:', e);
        }

        return response;
    };

    // PROCESS RESPONSE
    function processGraphQLResponse(json, config) {
        try {
            // Check if it's the racing query
            const raceMeetings = json.data?.raceMeetings;
            if (!raceMeetings || raceMeetings.length === 0) return;

            const meeting = raceMeetings[0];
            const pools = meeting.pmPools;
            
            if (!pools || pools.length === 0) return;

            // Extract context from request body (variables)
            // We need date, venue, raceNo from the request variables
            let date, venueCode, raceNo;

            if (config && config.body) {
                try {
                    const body = JSON.parse(config.body);
                    const vars = body.variables;
                    if (vars) {
                        date = vars.date; // e.g., "2026-02-01"
                        venueCode = vars.venueCode; // "ST"
                        raceNo = vars.raceNo; // 1
                    }
                } catch (e) {
                    console.warn('[HKJC Pusher] Could not parse request body:', e);
                }
            }

            // If we couldn't get context from request, try to parse from URL if possible, or skip
            if (!date || !venueCode || !raceNo) {
                console.warn('[HKJC Pusher] Could not extract race context from request variables.');
                return;
            }

            console.log(`[HKJC Pusher] Intercepted odds for ${date} ${venueCode} Race ${raceNo}`);
            
            // Push to our server
            pushOdds({
                date,
                venue: venueCode,
                raceNo,
                pools
            });

        } catch (e) {
            console.error('[HKJC Pusher] Error processing response:', e);
        }
    }

})();
