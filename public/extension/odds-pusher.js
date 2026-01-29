// ==UserScript==
// @name         HKJC Odds Pusher
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Intercepts HKJC GraphQL odds and pushes to local/remote server (URL Parse Mode)
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

    console.log('[HKJC Pusher v2.2] Script starting... Better Feedback.');

    // CONFIGURATION
    const SERVER_URL = 'https://horse-racing-analysis-production.up.railway.app/api/odds/push';
    
    // STATE
    let lastContext = null;
    let loopInterval = null;
    let isAutoPushEnabled = localStorage.getItem('hkjc_pusher_auto_push') === 'true';

    // VISUAL INDICATOR
    function ensureIndicator() {
        if (document.getElementById('hkjc-odds-pusher-indicator')) return;
        if (!document.body) return;

        const container = document.createElement('div');
        container.id = 'hkjc-odds-pusher-indicator';
        container.style.cssText = 'position:fixed; bottom:10px; right:10px; padding:10px; background:rgba(0,0,0,0.85); color:white; z-index:2147483647; border-radius:8px; font-size:12px; font-family:Consolas, monospace; border: 2px solid #0f0; display:flex; flex-direction:column; gap:8px; width: 220px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);';
        
        // Header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.innerHTML = '<span style="font-weight:bold; color:#0f0;">🟢 Odds Pusher v2.2</span>';
        container.appendChild(header);

        // Context Info
        const infoBox = document.createElement('div');
        infoBox.id = 'hkjc-pusher-info';
        infoBox.innerText = 'Waiting for race info...';
        infoBox.style.cssText = 'color:#ddd; font-size:11px; padding:4px; background:rgba(255,255,255,0.1); border-radius:4px;';
        container.appendChild(infoBox);

        // Data Preview
        const previewBox = document.createElement('div');
        previewBox.id = 'hkjc-pusher-preview';
        previewBox.innerText = 'No odds scanned yet.';
        previewBox.style.cssText = 'color:#aaa; font-size:10px; max-height:60px; overflow-y:auto; white-space:pre-wrap;';
        container.appendChild(previewBox);

        // Buttons Row 1 (Actions)
        const btnRow1 = document.createElement('div');
        btnRow1.style.display = 'flex';
        btnRow1.style.gap = '5px';
        
        const scanBtn = document.createElement('button');
        scanBtn.innerText = 'Scan & Push';
        scanBtn.style.cssText = 'flex:2; cursor:pointer; color:black; font-weight:bold; background:#0f0; border:none; border-radius:4px; padding:4px;';
        scanBtn.onclick = () => manualScan(true);
        btnRow1.appendChild(scanBtn);

        const loopBtn = document.createElement('button');
        loopBtn.id = 'hkjc-loop-btn';
        loopBtn.innerText = 'Loop: OFF';
        loopBtn.style.cssText = 'flex:1; cursor:pointer; color:white; background:#555; border:none; border-radius:4px; font-size:10px;';
        loopBtn.onclick = toggleLoop;
        btnRow1.appendChild(loopBtn);

        container.appendChild(btnRow1);

        // Buttons Row 2 (Settings)
        const btnRow2 = document.createElement('div');
        btnRow2.style.display = 'flex';
        btnRow2.style.gap = '5px';
        btnRow2.style.marginTop = '4px';

        const autoPushBtn = document.createElement('button');
        autoPushBtn.id = 'hkjc-autopush-btn';
        autoPushBtn.innerText = isAutoPushEnabled ? 'Auto-Push: ON' : 'Auto-Push: OFF';
        autoPushBtn.style.cssText = `flex:1; cursor:pointer; color:white; background:${isAutoPushEnabled ? '#007bff' : '#555'}; border:none; border-radius:4px; font-size:10px; padding:2px;`;
        autoPushBtn.onclick = toggleAutoPush;
        btnRow2.appendChild(autoPushBtn);

        container.appendChild(btnRow2);
        document.body.appendChild(container);
    }

    setInterval(ensureIndicator, 1000);

    // --- AUTO LOGIC ---
    
    // Check for auto-push on load (Interval: 2 seconds)
    let hasAutoPushed = false;
    setInterval(() => {
        if (isAutoPushEnabled && !hasAutoPushed) {
            // Quiet scan (false = don't show error popups, just status updates)
            const success = manualScan(false); 
            if (success) {
                hasAutoPushed = true; 
                console.log('[HKJC Pusher] Auto-Push triggered successfully.');
            }
        }
    }, 2000); 

    function toggleLoop() {
        const btn = document.getElementById('hkjc-loop-btn');
        if (loopInterval) {
            clearInterval(loopInterval);
            loopInterval = null;
            btn.innerText = 'Loop: OFF';
            btn.style.background = '#555';
        } else {
            manualScan(true);
            // Loop Interval: 10 seconds
            loopInterval = setInterval(() => manualScan(true), 10000); 
            btn.innerText = 'Loop: ON';
            btn.style.background = '#d00';
        }
    }

    function toggleAutoPush() {
        isAutoPushEnabled = !isAutoPushEnabled;
        localStorage.setItem('hkjc_pusher_auto_push', isAutoPushEnabled);
        
        const btn = document.getElementById('hkjc-autopush-btn');
        if (btn) {
            btn.innerText = isAutoPushEnabled ? 'Auto-Push: ON' : 'Auto-Push: OFF';
            btn.style.background = isAutoPushEnabled ? '#007bff' : '#555';
        }
        
        if (isAutoPushEnabled) hasAutoPushed = false;
    }

    function updateStatus(msg, type = 'normal') {
        const el = document.getElementById('hkjc-pusher-info');
        if (el) {
            el.innerText = msg;
            if (type === 'error') el.style.color = '#f88';
            else if (type === 'warning') el.style.color = '#fa0';
            else if (type === 'success') el.style.color = '#8f8';
            else el.style.color = '#ddd';
        }
    }

    function extractContext() {
        const url = window.location.href;
        const urlMatch = url.match(/\/(\d{4}-\d{2}-\d{2})\/([A-Z]{2})\/(\d+)/);
        
        if (urlMatch) {
            return {
                date: urlMatch[1],
                venue: urlMatch[2],
                raceNo: parseInt(urlMatch[3])
            };
        }
        
        // Fallback
        const bodyText = document.body.innerText;
        const match = bodyText.match(/第\s*(\d+)\s*場.*?(\d{2}\/\d{2}\/\d{4}).*?(沙田|跑馬地|Happy Valley|Sha Tin)/);
        if (match) {
            const venueRaw = match[3];
            let venue = 'ST';
            if (venueRaw.includes('跑馬地') || venueRaw.includes('Happy')) venue = 'HV';
            return {
                raceNo: parseInt(match[1]),
                date: match[2].split('/').reverse().join('-'),
                venue: venue
            };
        }
        return null;
    }

    function parseTable() {
        const tables = document.querySelectorAll('table');
        let bestTable = null;
        let maxRows = 0;

        tables.forEach(table => {
            const trs = table.querySelectorAll('tr');
            if (trs.length > maxRows) {
                if (table.innerText.includes('馬號') || table.innerText.includes('No.')) {
                    maxRows = trs.length;
                    bestTable = table;
                }
            }
        });

        if (!bestTable) return null;

        const rows = Array.from(bestTable.querySelectorAll('tr'));
        const headerCells = rows[0].querySelectorAll('td, th');
        const headers = Array.from(headerCells).map(c => c.innerText.trim());
        
        const colHorse = headers.findIndex(h => h.includes('馬號') || h.includes('No.'));
        const colWin = headers.findIndex(h => h.includes('獨贏') || h.includes('Win'));
        const colPlace = headers.findIndex(h => h.includes('位置') || h.includes('Place'));

        if (colHorse === -1) return null;

        const winOdds = [];
        const placeOdds = [];
        let horseCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < headers.length) continue;

            const horseNo = cells[colHorse].innerText.trim();
            if (!/^\d+$/.test(horseNo)) continue;
            
            horseCount++;

            if (colWin !== -1) {
                const txt = cells[colWin].innerText.trim();
                const num = txt.match(/(\d+\.\d+|\d+)/); 
                if (num) winOdds.push({ combString: horseNo, oddsValue: num[0] });
            }

            if (colPlace !== -1) {
                const txt = cells[colPlace].innerText.trim();
                const num = txt.match(/(\d+\.\d+|\d+)/);
                if (num) placeOdds.push({ combString: horseNo, oddsValue: num[0] });
            }
        }

        return { winOdds, placeOdds, horseCount };
    }

    function manualScan(showErrors = true) {
        const context = extractContext();
        if (!context) {
            if (showErrors) updateStatus('Race info not found in URL/Page.', 'error');
            return false;
        }

        const odds = parseTable();
        
        if (!odds) {
             if (showErrors) updateStatus(`R${context.raceNo}: Table not found.`, 'error');
             return false;
        }

        // Show feedback about what we found, even if no odds
        const preview = document.getElementById('hkjc-pusher-preview');
        
        if (odds.winOdds.length === 0 && odds.placeOdds.length === 0) {
            if (showErrors) {
                updateStatus(`R${context.raceNo}: Table Found (${odds.horseCount} horses)\nWaiting for odds...`, 'warning');
                if (preview) preview.innerText = `Table detected with ${odds.horseCount} horses.\nHKJC has not published odds yet.`;
            }
            return false;
        }

        // Update UI
        lastContext = context;
        updateStatus(`R${context.raceNo} ${context.venue} ${context.date}`, 'success');
        
        if (preview) {
            preview.innerText = `Found ${odds.horseCount} horses.\nWin Odds: ${odds.winOdds.length}\nPlace Odds: ${odds.placeOdds.length}`;
            const h1Win = odds.winOdds.find(o => o.combString === '1')?.oddsValue || '-';
            const h2Win = odds.winOdds.find(o => o.combString === '2')?.oddsValue || '-';
            preview.innerText += `\nH1 Win: ${h1Win} | H2 Win: ${h2Win}`;
        }

        // Construct Payload
        const pools = [];
        if (odds.winOdds.length > 0) {
            pools.push({ 
                oddsType: 'WIN', 
                oddsNodes: odds.winOdds,
                sellStatus: 'SELL' 
            });
        }
        if (odds.placeOdds.length > 0) {
            pools.push({ 
                oddsType: 'PLA', 
                oddsNodes: odds.placeOdds,
                sellStatus: 'SELL'
            });
        }

        pushOdds({
            date: context.date,
            venue: context.venue,
            raceNo: context.raceNo,
            pools: pools
        });
        
        return true;
    }

    function pushOdds(payload) {
        console.log('[HKJC Pusher] Pushing:', payload);
        const ind = document.getElementById('hkjc-odds-pusher-indicator');
        if(ind) ind.style.borderColor = '#ff0';

        GM_xmlhttpRequest({
            method: "POST",
            url: SERVER_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: function(response) {
                console.log('[HKJC Pusher] Success:', response.responseText);
                if(ind) ind.style.borderColor = '#0f0';
                updateStatus(`Pushed R${payload.raceNo} at ${new Date().toLocaleTimeString().split(' ')[0]}`, 'success');
            },
            onerror: function(error) {
                console.error('[HKJC Pusher] Failed:', error);
                if(ind) ind.style.borderColor = '#f00';
                updateStatus('Push Failed', 'error');
            }
        });
    }

})();
