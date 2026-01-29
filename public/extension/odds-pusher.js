
// ==UserScript==
// @name         HKJC Odds Pusher
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Intercepts HKJC GraphQL odds and pushes to local/remote server
// @author       Trae Assistant
// @match        https://bet.hkjc.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // CONFIGURATION
    const SERVER_URL = 'https://horse-racing-analysis-production.up.railway.app/api/odds/push';
    // const SERVER_URL = 'http://localhost:3000/api/odds/push'; // For local testing

    console.log('[HKJC Pusher] Script loaded. Waiting for GraphQL requests...');

    // Helper to push data
    async function pushOdds(payload) {
        console.log('[HKJC Pusher] Pushing data for Race', payload.raceNo);
        try {
            await fetch(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log('[HKJC Pusher] Push successful!');
        } catch (e) {
            console.error('[HKJC Pusher] Push failed:', e);
        }
    }

    // INTERCEPT FETCH (Used by new HKJC site)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        const response = await originalFetch(...args);

        // Check if this is the target GraphQL endpoint
        if (typeof resource === 'string' && resource.includes('info.cld.hkjc.com/graphql/base/')) {
            // Clone response to read body without consuming it
            const clone = response.clone();
            clone.json().then(data => {
                processGraphQLResponse(data, config);
            }).catch(e => console.error('[HKJC Pusher] JSON parse error:', e));
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
                const body = JSON.parse(config.body);
                const vars = body.variables;
                if (vars) {
                    date = vars.date; // e.g., "2026-02-01"
                    venueCode = vars.venueCode; // "ST"
                    raceNo = vars.raceNo; // 1
                }
            }

            // If we couldn't get context from request (unlikely), try to infer or skip
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

    // Add a visual indicator
    const indicator = document.createElement('div');
    indicator.style.position = 'fixed';
    indicator.style.bottom = '10px';
    indicator.style.right = '10px';
    indicator.style.padding = '5px 10px';
    indicator.style.background = 'rgba(0,0,0,0.7)';
    indicator.style.color = '#0f0';
    indicator.style.zIndex = '9999';
    indicator.style.borderRadius = '5px';
    indicator.style.fontSize = '12px';
    indicator.innerText = 'Odds Pusher Active';
    document.body.appendChild(indicator);

})();
