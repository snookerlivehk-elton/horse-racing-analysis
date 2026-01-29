
// ==UserScript==
// @name         HKJC Odds Pusher
// @namespace    http://tampermonkey.net/
// @version      1.5
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

    console.log('[HKJC Pusher v1.5] Script starting... Logging ALL requests.');

    // CONFIGURATION
    const SERVER_URL = 'https://horse-racing-analysis-production.up.railway.app/api/odds/push';
    
    // VISUAL INDICATOR
    function ensureIndicator() {
        if (document.getElementById('hkjc-odds-pusher-indicator')) return;
        if (!document.body) return;

        const container = document.createElement('div');
        container.id = 'hkjc-odds-pusher-indicator';
        container.style.cssText = 'position:fixed; bottom:10px; right:10px; padding:8px 12px; background:rgba(0,100,0,0.9); color:white; z-index:2147483647; border-radius:8px; font-size:14px; font-weight:bold; box-shadow:0 0 10px rgba(0,0,0,0.5); font-family:sans-serif; border: 2px solid #0f0; display:flex; flex-direction:column; gap:5px;';
        
        const statusText = document.createElement('span');
        statusText.id = 'hkjc-pusher-status';
        statusText.innerText = '🟢 Ready (v1.5)';
        container.appendChild(statusText);

        // Add Test Button
        const testBtn = document.createElement('button');
        testBtn.innerText = 'Test Push';
        testBtn.style.cssText = 'font-size:12px; padding:2px 5px; cursor:pointer; color:black;';
        testBtn.onclick = () => {
            pushOdds({
                test: true,
                date: new Date().toISOString().split('T')[0],
                venue: 'TEST',
                raceNo: 99,
                pools: []
            });
        };
        container.appendChild(testBtn);

        document.body.appendChild(container);
    }

    setInterval(ensureIndicator, 1000);

    function updateIndicator(status, msg) {
        const text = document.getElementById('hkjc-pusher-status');
        const container = document.getElementById('hkjc-odds-pusher-indicator');
        if (!text || !container) return;

        if (status === 'pushing') {
            text.innerText = '🟡 Pushing...';
            container.style.borderColor = '#ff0';
        } else if (status === 'success') {
            text.innerText = '🟢 Pushed: ' + new Date().toLocaleTimeString();
            container.style.borderColor = '#0f0';
        } else if (status === 'error') {
            text.innerText = '🔴 Failed';
            container.style.borderColor = '#f00';
        }
    }

    function pushOdds(payload) {
        console.log('[HKJC Pusher] Pushing data:', payload);
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

    // --- INTERCEPTOR LOGIC ---

    function tryParseAndPush(url, responseBody, requestBody) {
        try {
            const json = JSON.parse(responseBody);
            
            // Log structure for debugging
            // console.log('[HKJC Pusher] Inspecting JSON from:', url, Object.keys(json));

            // Pattern 1: GraphQL RaceMeetings
            if (json.data && json.data.raceMeetings && json.data.raceMeetings.length > 0) {
                console.log('[HKJC Pusher] Found raceMeetings data!');
                const meeting = json.data.raceMeetings[0];
                
                // Context extraction
                let date, venueCode, raceNo;

                // Try from request body first
                if (requestBody) {
                    try {
                        const rb = JSON.parse(requestBody);
                        if (rb.variables) {
                            date = rb.variables.date;
                            venueCode = rb.variables.venueCode;
                            raceNo = rb.variables.raceNo;
                        }
                    } catch (e) {}
                }

                // Fallback from response
                if (!date && meeting.meetingDate) date = meeting.meetingDate.split('T')[0];
                
                // If we found odds pools, push them
                if (meeting.pmPools && meeting.pmPools.length > 0) {
                     // If we are missing context, try to infer or use defaults for debugging
                     if (!venueCode) venueCode = 'ST'; // Risky assumption, but better than nothing for test
                     if (!raceNo) raceNo = 1; // Risky

                     console.log(`[HKJC Pusher] Extracted Odds: ${date} ${venueCode} R${raceNo}`);
                     pushOdds({ date, venue: venueCode, raceNo, pools: meeting.pmPools });
                }
            }
        } catch (e) {
            // Not JSON
        }
    }

    // --- FETCH INTERCEPTOR ---
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        const url = typeof resource === 'string' ? resource : resource.url;
        
        console.log('[HKJC Pusher] Fetch:', url); // LOG ALL FETCH REQUESTS

        const response = await originalFetch(...args);
        
        // Clone and inspect everything that looks like JSON/API
        const clone = response.clone();
        clone.text().then(text => {
            tryParseAndPush(url, text, config ? config.body : null);
        }).catch(e => {});

        return response;
    };

    // --- XHR INTERCEPTOR ---
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            console.log('[HKJC Pusher] XHR:', this._url); // LOG ALL XHR REQUESTS
            tryParseAndPush(this._url, this.responseText, body);
        });
        return originalSend.apply(this, arguments);
    };

})();
