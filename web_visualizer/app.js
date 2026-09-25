/**
 * NaviCore AI — Google Maps-Grade 3D Navigation & Zero-Drift AI Dead Reckoning Engine
 * Real GPS Geolocation + Worldwide Address Search + Free Map Exploration + Offline Proof Inspector
 * Smart India Hackathon 2026 | Problem Statement ID: 260168
 */

(function () {
    'use strict';

    // Application State
    const state = {
        isNavigating: false,
        voiceEnabled: true,
        driveMode: 'real_1x', // 'real_1x' | 'demo_3x' | 'live_gps'
        
        userOriginCoord: null, // [Lon, Lat]
        destCoord: null,       // [Lon, Lat]
        userOriginName: "",
        destName: "",
        
        vehicleProfile: 'sedan', // 'sedan' | 'motorcycle' | 'truck' | 'bus' | 'agv'
        activeMapStyle: 'liberty',
        
        // Calculated route geometry from real OSRM engine
        routeCoordinates: [], // Array of [lon, lat]
        routeSteps: [],       // Structured Turn-by-Turn Maneuver Steps
        routeCumDists: [],    // Cumulative distance in meters at each coordinate
        routeTotalDistM: 0,   // Total route distance in meters
        routeDistKm: 0.0,
        routeEtaMin: 0,
        tunnelRange: [0.35, 0.65], // 35% to 65% is dead-reckoning zone
        
        distanceTraveledM: 0,  // Exact physical distance traveled along route in meters
        tripProgress: 0.0,     // 0.0 to 1.0
        speedKmh: 50.0,
        headingDeg: 0,
        smoothHeadingDeg: 0,
        elevationM: 112.0,
        satellites: 18,
        
        // Current accurate vehicle position
        currLon: 72.8777,
        currLat: 19.0760,
        
        // Ghost Vehicle Simulation (Proves uncorrected IMU drift during blackout)
        ghostLon: 72.8777,
        ghostLat: 19.0760,
        ghostEnabled: true,
        ghostDriftM: 0.0,
        
        // Camera Behavior: 'follow' (locked on vehicle) vs 'free' (user inspecting aaju-baju)
        cameraFollow: true,
        cameraMode: '3d_chase', // '3d_chase' | 'top_down' | 'free_orbit'
        
        // GNSS & Engine
        gnssSignalPct: 100,
        manualSignalOverride: false,
        engineMode: 'OPEN_SKY', // 'OPEN_SKY' | 'DEAD_RECKONING' | 'ZUPT_LOCKED'
        blackoutDuration: 0,
        
        // Telemetry & Proof
        driftErrorM: 0.0,
        confidencePct: 99.8,
        forwardVx: 13.88,
        zuptLocked: false,
        zuptProb: 0.01,
        
        potholeShock: 0,
        trafficStopActive: false,
        
        chartData: [],
        spokenMilestones: new Set(),
        watchGpsId: null,
        
        lastFrameTime: performance.now()
    };

    // DOM Elements
    const btnUseLocation = document.getElementById('btn-use-my-location');
    const userCoordsPreview = document.getElementById('user-coords-preview');
    
    const floatingSearchBox = document.getElementById('floating-search-box');
    const floatingDestInput = document.getElementById('floating-dest-input');
    const btnFloatingSearchGo = document.getElementById('btn-floating-search-go');
    const floatingAutocompleteList = document.getElementById('floating-autocomplete-list');
    const modeChips = document.querySelectorAll('.mode-chip');
    
    const floatingRouteSummary = document.getElementById('floating-route-summary');
    const summaryEtaVal = document.getElementById('summary-eta-val');
    const summaryDistVal = document.getElementById('summary-dist-val');
    const btnQuickStartNav = document.getElementById('btn-quick-start-nav');
    
    const freeLookNotice = document.getElementById('free-look-notice');
    const btnRecenterNotice = document.getElementById('btn-recenter-notice');
    const btnRecenterFab = document.getElementById('btn-recenter-fab');
    const btnProveOfflineFab = document.getElementById('btn-prove-offline-fab');
    
    const proofModalBackdrop = document.getElementById('proof-modal-backdrop');
    const btnCloseProofModal = document.getElementById('btn-close-proof-modal');
    const btnDoneProofModal = document.getElementById('btn-done-proof-modal');
    const btnTriggerInstantBlackout = document.getElementById('btn-trigger-instant-blackout');
    const toggleGhostComparison = document.getElementById('toggle-ghost-comparison');
    
    const proofCovPos = document.getElementById('proof-cov-pos');
    const proofSigmaVx = document.getElementById('proof-sigma-vx');
    const proofBiasAccel = document.getElementById('proof-bias-accel');
    const proofBiasGyro = document.getElementById('proof-bias-gyro');
    
    const selectDriveMode = document.getElementById('select-drive-mode');
    const selectVehicleProfile = document.getElementById('select-vehicle-profile');
    const styleBtns = document.querySelectorAll('.btn-style');
    
    const inputOriginSearch = document.getElementById('input-origin-search');
    const btnSearchOrigin = document.getElementById('btn-search-origin');
    const originDropdown = document.getElementById('origin-autocomplete-list');
    
    const inputDestSearch = document.getElementById('input-dest-search');
    const btnSearchDest = document.getElementById('btn-search-dest');
    const destDropdown = document.getElementById('dest-autocomplete-list');
    
    const btnCalcRoute = document.getElementById('btn-calc-route');
    const btnDoneNav = document.getElementById('btn-done-nav');
    const btnVoiceToggle = document.getElementById('btn-voice-toggle');
    const voiceIcon = document.getElementById('voice-icon');
    const voiceText = document.getElementById('voice-text');
    const btnSpeakStep = document.getElementById('btn-speak-step');
    const btnResetNav = document.getElementById('btn-reset-nav');
    const btnDockStop = document.getElementById('btn-dock-stop');
    
    const sliderSignal = document.getElementById('slider-gnss-signal');
    const badgeSignal = document.getElementById('signal-quality-badge');
    const presetBtns = document.querySelectorAll('.btn-preset');
    
    const btnCam3d = document.getElementById('btn-cam-3d');
    const btnCamTop = document.getElementById('btn-cam-top');
    const btnCamFree = document.getElementById('btn-cam-free');
    
    const navModePill = document.getElementById('nav-mode-pill');
    const modeDot = document.getElementById('mode-dot');
    const navModeText = document.getElementById('nav-mode-text');
    const blackoutTimer = document.getElementById('blackout-timer');
    
    const turnInstruction = document.getElementById('turn-instruction');
    const turnDistance = document.getElementById('turn-distance');
    const turnSubInstruction = document.getElementById('gmaps-sub-instruction');
    const turnIconBox = document.getElementById('turn-icon-box');
    const beaconStatus = document.getElementById('beacon-status-label');
    const beaconDetail = document.getElementById('beacon-detail-label');
    
    const hudSpeed = document.getElementById('hud-speed');
    const hudElevation = document.getElementById('hud-elevation');
    const hudHeading = document.getElementById('hud-heading');
    const hudSats = document.getElementById('hud-sats');
    
    const dockTimeLeft = document.getElementById('dock-time-left');
    const dockDist = document.getElementById('dock-dist');
    const dockEtaClock = document.getElementById('dock-eta-clock');
    
    const progressFill = document.getElementById('progress-fill');
    const tripProgressText = document.getElementById('trip-progress-text');
    const tripPctText = document.getElementById('trip-pct-text');
    
    const valDrift = document.getElementById('val-drift');
    const subDriftPct = document.getElementById('sub-drift-pct');
    const valConf = document.getElementById('val-confidence');
    const valVx = document.getElementById('val-vx');
    const valZupt = document.getElementById('val-zupt');
    const valZuptProb = document.getElementById('val-zupt-prob');
    
    const horizonPitchRoll = document.getElementById('horizon-pitch-roll');
    const valPitch = document.getElementById('val-pitch');
    const valRoll = document.getElementById('val-roll');
    
    const benchNavicore = document.getElementById('bench-navicore-drift');
    const benchEkf = document.getElementById('bench-ekf-drift');
    const benchDouble = document.getElementById('bench-double-drift');
    
    const btnPothole = document.getElementById('btn-inject-pothole');
    const toggleTrafficStop = document.getElementById('toggle-traffic-stop');

    const chartCanvas = document.getElementById('telemetry-chart');
    const chartCtx = chartCanvas.getContext('2d');

    let map, vehicleMarkerEl, vehicleMarker, ghostMarkerEl, ghostMarker, originMarker, destMarker;
    let audioCtx = null;
    let cachedVoices = [];

    // Map Styles (100% Free Vector & Raster Styles)
    const MAP_STYLES = {
        liberty: "https://tiles.openfreemap.org/styles/liberty",
        bright: "https://tiles.openfreemap.org/styles/bright",
        dark: "https://tiles.openfreemap.org/styles/positron",
        satellite: {
            version: 8,
            sources: {
                'raster-tiles': {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    attribution: '© ESRI World Imagery'
                },
                'overlay-tiles': {
                    type: 'raster',
                    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256
                }
            },
            layers: [
                { id: 'raster-layer', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 20 },
                { id: 'overlay-layer', type: 'raster', source: 'overlay-tiles', minzoom: 0, maxzoom: 20 }
            ]
        },
        osm: {
            version: 8,
            sources: {
                'raster-tiles': {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors'
                }
            },
            layers: [{ id: 'raster-layer', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 19 }]
        }
    };

    // Haversine Distance in Meters
    function haversineDistM(c1, c2) {
        const R = 6371000;
        const dLat = (c2[1] - c1[1]) * Math.PI / 180;
        const dLon = (c2[0] - c1[0]) * Math.PI / 180;
        const lat1 = c1[1] * Math.PI / 180;
        const lat2 = c2[1] * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function buildCumulativeDistances(coords) {
        const dists = [0];
        let total = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            const d = haversineDistM(coords[i], coords[i + 1]);
            total += d;
            dists.push(total);
        }
        return { dists, total };
    }

    // =========================================================================
    // DEDICATED REALISTIC MULTI-MODAL VEHICLE SVG MODELS
    // =========================================================================

    function getVehicleSvg(profile) {
        if (profile === 'motorcycle') {
            return `
                <svg class="vehicle-svg-icon" viewBox="0 0 32 64" width="20" height="40">
                    <polygon points="16,0 6,18 26,18" fill="rgba(0, 242, 254, 0.45)" filter="blur(1px)"/>
                    <rect x="14" y="6" width="4" height="12" rx="2" fill="#1e293b" stroke="#00f2fe" stroke-width="1"/>
                    <line x1="8" y1="16" x2="24" y2="16" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/>
                    <circle cx="8" cy="16" r="1.5" fill="#00f2fe"/>
                    <circle cx="24" cy="16" r="1.5" fill="#00f2fe"/>
                    <path d="M12,20 Q16,17 20,20 L21,34 Q16,36 11,34 Z" fill="#0284c7" stroke="#38bdf8" stroke-width="1.2"/>
                    <ellipse cx="16" cy="30" rx="5.5" ry="6.5" fill="#0f172a" stroke="#f8fafc" stroke-width="1.5"/>
                    <path d="M13,27 Q16,25 19,27" stroke="#38bdf8" stroke-width="1.5" fill="none"/>
                    <ellipse cx="16" cy="37" rx="8" ry="4" fill="#334155"/>
                    <path d="M13,38 L19,38 L17,50 L15,50 Z" fill="#0284c7"/>
                    <rect x="13.5" y="48" width="5" height="14" rx="2" fill="#0f172a" stroke="#ef4444" stroke-width="1"/>
                    <circle cx="16" cy="62" r="1.8" fill="#ef4444"/>
                </svg>
            `;
        } else if (profile === 'truck') {
            return `
                <svg class="vehicle-svg-icon" viewBox="0 0 36 76" width="24" height="48">
                    <polygon points="18,0 4,20 32,20" fill="rgba(0, 242, 254, 0.4)" filter="blur(1px)"/>
                    <rect x="6" y="8" width="24" height="18" rx="3" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2"/>
                    <rect x="8" y="10" width="20" height="6" rx="1.5" fill="#1e293b"/>
                    <rect x="3" y="12" width="3" height="5" rx="1" fill="#cbd5e1"/>
                    <rect x="30" y="12" width="3" height="5" rx="1" fill="#cbd5e1"/>
                    <rect x="15" y="26" width="6" height="4" fill="#64748b"/>
                    <rect x="5" y="30" width="26" height="42" rx="2" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
                    <line x1="5" y1="44" x2="31" y2="44" stroke="#475569" stroke-width="1"/>
                    <line x1="5" y1="58" x2="31" y2="58" stroke="#475569" stroke-width="1"/>
                    <rect x="6" y="70" width="5" height="2" fill="#ef4444"/>
                    <rect x="25" y="70" width="5" height="2" fill="#ef4444"/>
                </svg>
            `;
        } else if (profile === 'bus') {
            return `
                <svg class="vehicle-svg-icon" viewBox="0 0 34 72" width="22" height="44">
                    <polygon points="17,0 4,18 30,18" fill="rgba(0, 242, 254, 0.4)" filter="blur(1px)"/>
                    <rect x="5" y="6" width="24" height="62" rx="5" fill="#10b981" stroke="#ffffff" stroke-width="1.2"/>
                    <rect x="7" y="9" width="20" height="7" rx="2" fill="#0f172a"/>
                    <rect x="11" y="24" width="12" height="10" rx="2" fill="#065f46" stroke="#34d399" stroke-width="1"/>
                    <rect x="11" y="44" width="12" height="10" rx="2" fill="#065f46" stroke="#34d399" stroke-width="1"/>
                    <rect x="8" y="62" width="18" height="4" rx="1" fill="#0f172a"/>
                </svg>
            `;
        } else if (profile === 'agv') {
            return `
                <svg class="vehicle-svg-icon" viewBox="0 0 40 40" width="22" height="22">
                    <circle cx="20" cy="20" r="17" fill="#0f172a" stroke="#8b5cf6" stroke-width="2.5"/>
                    <circle cx="20" cy="20" r="10" fill="#1e1b4b" stroke="#a78bfa" stroke-width="1.5"/>
                    <circle cx="20" cy="20" r="4" fill="#a78bfa"/>
                    <polygon points="20,2 14,14 26,14" fill="#00f2fe"/>
                    <circle cx="20" cy="20" r="17" stroke="#00f2fe" stroke-width="1.5" stroke-dasharray="4,4" fill="none"/>
                </svg>
            `;
        } else {
            return `
                <svg class="vehicle-svg-icon" viewBox="0 0 32 60" width="20" height="38">
                    <polygon points="16,0 4,18 28,18" fill="rgba(0, 242, 254, 0.45)" filter="blur(1px)"/>
                    <rect x="4" y="6" width="24" height="48" rx="6" fill="#1a73e8" stroke="#ffffff" stroke-width="1.4"/>
                    <path d="M7,16 L25,16 L23,24 L9,24 Z" fill="#0f172a"/>
                    <rect x="8" y="24" width="16" height="16" rx="2" fill="#1557b0"/>
                    <path d="M9,40 L23,40 L25,46 L7,46 Z" fill="#0f172a"/>
                    <rect x="1" y="18" width="3" height="4" rx="1" fill="#e2e8f0"/>
                    <rect x="28" y="18" width="3" height="4" rx="1" fill="#e2e8f0"/>
                    <rect x="6" y="52" width="5" height="2" rx="1" fill="#ef4444"/>
                    <rect x="21" y="52" width="5" height="2" rx="1" fill="#ef4444"/>
                </svg>
            `;
        }
    }

    function updateVehicleMarkerAppearance() {
        if (!vehicleMarkerEl) return;
        vehicleMarkerEl.innerHTML = `
            <div class="nav-heading-beam"></div>
            <div class="dr-radar-ring"></div>
            <div class="dr-alert-tag">⚡ AI DEAD RECKONING ACTIVE</div>
            ${getVehicleSvg(state.vehicleProfile)}
        `;
    }

    // =========================================================================
    // GOOGLE MAPS NAVIGATION CHIME & VOICE SYNTHESIS ENGINE
    // =========================================================================

    function playNavigationChime() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const now = audioCtx.currentTime;
            
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5
            gain1.gain.setValueAtTime(0.18, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.09);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5
            gain2.gain.setValueAtTime(0.22, now + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.26);
        } catch (e) {}
    }

    function initVoiceList() {
        if ('speechSynthesis' in window) {
            cachedVoices = window.speechSynthesis.getVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = () => {
                    cachedVoices = window.speechSynthesis.getVoices();
                };
            }
        }
    }
    initVoiceList();

    function getBestVoice() {
        if (!cachedVoices || cachedVoices.length === 0) {
            cachedVoices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        }
        const preferred = [
            /Google US English/i,
            /Google UK English Female/i,
            /Microsoft Jenny/i,
            /Microsoft Aria/i,
            /Microsoft Zira/i,
            /Microsoft David/i,
            /Samantha/i,
            /en-US/i,
            /en-IN/i,
            /en-GB/i,
            /en/i
        ];
        for (const pattern of preferred) {
            const found = cachedVoices.find(v => pattern.test(v.name) || pattern.test(v.lang));
            if (found) return found;
        }
        return cachedVoices[0] || null;
    }

    function speakVoice(text, force = false, key = null) {
        if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
        const dedupeKey = key || text;
        if (!force && state.spokenMilestones.has(dedupeKey)) return;
        
        state.spokenMilestones.add(dedupeKey);
        playNavigationChime();

        setTimeout(() => {
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                const voice = getBestVoice();
                if (voice) utterance.voice = voice;
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                window.speechSynthesis.speak(utterance);
            } catch (err) {}
        }, 120);
    }

    btnVoiceToggle.addEventListener('click', () => {
        state.voiceEnabled = !state.voiceEnabled;
        voiceIcon.innerText = state.voiceEnabled ? "🔊" : "🔇";
        voiceText.innerText = state.voiceEnabled ? "Voice ON" : "Voice OFF";
        btnVoiceToggle.classList.toggle('active', state.voiceEnabled);
        if (state.voiceEnabled) speakVoice("Voice guidance activated.", true, "voice_on");
    });

    btnSpeakStep.addEventListener('click', () => {
        const text = `${turnDistance.innerText}. ${turnInstruction.innerText}. ${turnSubInstruction.innerText}.`;
        speakVoice(text, true, "manual_step_" + Date.now());
    });

    // =========================================================================
    // SVG TURN ICONS GENERATOR
    // =========================================================================

    function updateTurnIcon(type, modifier) {
        let svg = `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">`;
        if (type === 'tunnel' || modifier === 'tunnel') {
            svg += `<path d="M4 19V11a8 8 0 0 1 16 0v8"/><circle cx="12" cy="14" r="2" fill="currentColor"/>`;
        } else if (modifier === 'right' || modifier === 'sharp right') {
            svg += `<path d="M6 19v-7a4 4 0 0 1 4-4h8M14 4l4 4-4 4"/>`;
        } else if (modifier === 'slight right') {
            svg += `<path d="M8 19v-6a5 5 0 0 1 2-4l6-4M12 5h4v4"/>`;
        } else if (modifier === 'left' || modifier === 'sharp left') {
            svg += `<path d="M18 19v-7a4 4 0 0 0-4-4H6M10 4 6 8l4 4"/>`;
        } else if (modifier === 'slight left') {
            svg += `<path d="M16 19v-6a5 5 0 0 0-2-4l-6-4M12 5H8v4"/>`;
        } else if (modifier === 'uturn') {
            svg += `<path d="M19 19v-8a6 6 0 0 0-12 0v8M11 15l-4 4-4-4"/>`;
        } else if (type === 'roundabout') {
            svg += `<path d="M12 4a8 8 0 1 0 8 8M20 8l-4 4 4 0"/>`;
        } else if (type === 'arrive') {
            svg += `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>`;
        } else {
            svg += `<path d="M12 19V5M5 12l7-7 7 7"/>`;
        }
        svg += `</svg>`;
        turnIconBox.innerHTML = svg;
    }

    // =========================================================================
    // 1. INITIALIZE 3D MAP & LAYERS
    // =========================================================================

    function init3DMap() {
        const initialCenter = [72.8777, 19.0760]; // Mumbai center
        state.currLon = initialCenter[0];
        state.currLat = initialCenter[1];
        state.ghostLon = initialCenter[0];
        state.ghostLat = initialCenter[1];

        map = new maplibregl.Map({
            container: 'maplibre-3d-map',
            style: MAP_STYLES.liberty,
            center: initialCenter,
            zoom: 14.5,
            pitch: 55,
            bearing: 0
        });

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

        // Draggable Origin Pin
        const originPinEl = document.createElement('div');
        originPinEl.className = 'pin-marker-origin';
        originPinEl.innerHTML = `<span style="transform: rotate(45deg); font-size: 11px; font-weight: bold; color: #fff;">A</span>`;
        originMarker = new maplibregl.Marker({ element: originPinEl, draggable: true });

        originMarker.on('dragend', () => {
            const lngLat = originMarker.getLngLat();
            state.userOriginCoord = [lngLat.lng, lngLat.lat];
            reverseGeocode(lngLat.lat, lngLat.lng, true);
            if (state.destCoord) fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
        });

        // Draggable Destination Pin
        const destPinEl = document.createElement('div');
        destPinEl.className = 'pin-marker-dest';
        destPinEl.innerHTML = `<span style="transform: rotate(45deg); font-size: 11px; font-weight: bold; color: #fff;">B</span>`;
        destMarker = new maplibregl.Marker({ element: destPinEl, draggable: true });

        destMarker.on('dragend', () => {
            const lngLat = destMarker.getLngLat();
            state.destCoord = [lngLat.lng, lngLat.lat];
            reverseGeocode(lngLat.lat, lngLat.lng, false);
            if (state.userOriginCoord) fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
        });

        // NaviCore Real Vehicle Marker
        vehicleMarkerEl = document.createElement('div');
        vehicleMarkerEl.className = 'vehicle-marker-3d';
        vehicleMarkerEl.id = 'vehicle-marker-3d';
        updateVehicleMarkerAppearance();
        vehicleMarker = new maplibregl.Marker({ element: vehicleMarkerEl });

        // Red Ghost Drifting Vehicle (Proof Demonstrator for Dead Reckoning)
        ghostMarkerEl = document.createElement('div');
        ghostMarkerEl.className = 'vehicle-marker-ghost hidden';
        ghostMarkerEl.innerHTML = `
            <div class="ghost-label">Standard IMU (Exploded)</div>
            <svg class="vehicle-svg-icon" viewBox="0 0 32 60" width="20" height="38">
                <rect x="4" y="6" width="24" height="48" rx="6" fill="#ef4444" stroke="#ffffff" stroke-width="1.4"/>
                <path d="M7,16 L25,16 L23,24 L9,24 Z" fill="#450a0a"/>
                <rect x="8" y="24" width="16" height="16" rx="2" fill="#7f1d1d"/>
            </svg>
        `;
        ghostMarker = new maplibregl.Marker({ element: ghostMarkerEl });

        // =====================================================================
        // FREE MAP EXPLORATION ("AAJU-BAJU") GESTURE LISTENERS
        // =====================================================================
        // When user pans, rotates, pitches or zooms, enter Free Exploration Mode
        const userInteractionEvents = ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart', 'touchstart'];
        userInteractionEvents.forEach(evt => {
            map.on(evt, () => {
                if (state.isNavigating && state.cameraFollow) {
                    state.cameraFollow = false;
                    freeLookNotice.classList.remove('hidden');
                    btnRecenterFab.classList.add('pulse-glow');
                }
            });
        });

        map.on('load', () => {
            add3DBuildingLayers();
        });

        promptUserForLocation();
    }

    function add3DBuildingLayers() {
        if (!map || !map.getStyle()) return;
        const layers = map.getStyle().layers;
        let labelLayerId;
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                labelLayerId = layers[i].id;
                break;
            }
        }
        if (map.getSource('openmaptiles') && !map.getLayer('3d-buildings')) {
            try {
                map.addLayer({
                    'id': '3d-buildings',
                    'source': 'openmaptiles',
                    'source-layer': 'building',
                    'type': 'fill-extrusion',
                    'minzoom': 14,
                    'paint': {
                        'fill-extrusion-color': '#1a2233',
                        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['get', 'render_height']],
                        'fill-extrusion-base': ['get', 'render_min_height'],
                        'fill-extrusion-opacity': 0.75
                    }
                }, labelLayerId);
            } catch (e) {}
        }
    }

    function promptUserForLocation() {
        userCoordsPreview.innerText = "📍 Tap 'Use My GPS' or search destination to navigate.";
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;
                    state.userOriginCoord = [lon, lat];
                    state.currLon = lon;
                    state.currLat = lat;
                    state.ghostLon = lon;
                    state.ghostLat = lat;
                    state.elevationM = pos.coords.altitude || 112.0;

                    originMarker.setLngLat([lon, lat]).addTo(map);
                    vehicleMarker.setLngLat([lon, lat]).addTo(map);
                    map.flyTo({ center: [lon, lat], zoom: 15.0, pitch: 55 });
                    reverseGeocode(lat, lon, true);
                    userCoordsPreview.innerText = `✅ GPS locked at your location. Search destination to start.`;
                },
                (err) => {
                    userCoordsPreview.innerText = `Tip: Search destination above to begin.`;
                    state.userOriginCoord = [72.8777, 19.0760];
                    originMarker.setLngLat(state.userOriginCoord).addTo(map);
                    vehicleMarker.setLngLat(state.userOriginCoord).addTo(map);
                },
                { enableHighAccuracy: true, timeout: 6000 }
            );
        }
    }

    // Dynamic Map Style Switching
    function setMapStyle(styleKey) {
        if (!MAP_STYLES[styleKey]) return;
        state.activeMapStyle = styleKey;
        map.setStyle(MAP_STYLES[styleKey]);
        
        map.once('style.load', () => {
            add3DBuildingLayers();
            if (state.routeCoordinates.length > 0) {
                drawRouteOn3DMap(state.routeCoordinates);
            }
        });
        
        styleBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.style === styleKey);
        });
    }

    styleBtns.forEach(btn => {
        btn.addEventListener('click', () => setMapStyle(btn.dataset.style));
    });

    // Re-center on Vehicle (Exits Free Exploration Mode & Resumes Chase Camera)
    function recenterCamera() {
        state.cameraFollow = true;
        freeLookNotice.classList.add('hidden');
        btnRecenterFab.classList.remove('pulse-glow');
        map.flyTo({
            center: [state.currLon, state.currLat],
            pitch: 60,
            bearing: state.smoothHeadingDeg,
            zoom: 16.8,
            duration: 800
        });
    }

    btnRecenterFab.addEventListener('click', recenterCamera);
    btnRecenterNotice.addEventListener('click', recenterCamera);

    // Vehicle Profile Mode Selection
    function setVehicleProfile(profile) {
        state.vehicleProfile = profile;
        selectVehicleProfile.value = profile;
        modeChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.profile === profile);
        });
        updateVehicleMarkerAppearance();
    }

    modeChips.forEach(chip => {
        chip.addEventListener('click', () => setVehicleProfile(chip.dataset.profile));
    });

    selectVehicleProfile.addEventListener('change', (e) => {
        setVehicleProfile(e.target.value);
    });

    selectDriveMode.addEventListener('change', (e) => {
        state.driveMode = e.target.value;
        if (state.driveMode === 'live_gps') {
            userCoordsPreview.innerText = "📡 Live GPS Mode: Moves ONLY when your device physically moves!";
            startLiveGpsTracking();
        } else {
            stopLiveGpsTracking();
            userCoordsPreview.innerText = `⏱️ Movement mode: ${selectDriveMode.options[selectDriveMode.selectedIndex].text}`;
        }
    });

    // =========================================================================
    // 2. COMPREHENSIVE ALL-INDIA CITIES & TOWNS GAZETTEER DATABASE
    // =========================================================================
    const INDIAN_CITIES_GAZETTEER = [
        // Prefix 'Jam...' and 'Ja...' locations
        { name: "Jamnagar", pincode: "361001", state: "Gujarat", district: "Jamnagar", lat: 22.4707, lon: 70.0577 },
        { name: "Jamshedpur", pincode: "831001", state: "Jharkhand", district: "East Singhbhum", lat: 22.8046, lon: 86.2029 },
        { name: "Jammu", pincode: "180001", state: "Jammu & Kashmir", district: "Jammu", lat: 32.7266, lon: 74.8570 },
        { name: "Jabalpur", pincode: "482001", state: "Madhya Pradesh", district: "Jabalpur", lat: 23.1815, lon: 79.9864 },
        { name: "Jalgaon", pincode: "425001", state: "Maharashtra", district: "Jalgaon", lat: 21.0077, lon: 75.5626 },
        { name: "Jalandhar", pincode: "144001", state: "Punjab", district: "Jalandhar", lat: 31.3260, lon: 75.5762 },
        { name: "Jalna", pincode: "431203", state: "Maharashtra", district: "Jalna", lat: 19.8347, lon: 75.8816 },
        { name: "Jaisalmer", pincode: "345001", state: "Rajasthan", district: "Jaisalmer", lat: 26.9157, lon: 70.9083 },
        { name: "Jambughoda", pincode: "389390", state: "Gujarat", district: "Panchmahal", lat: 22.3667, lon: 73.7167 },
        { name: "Jamkhandi", pincode: "587301", state: "Karnataka", district: "Bagalkot", lat: 16.5050, lon: 75.2974 },
        { name: "Jamkhed", pincode: "413201", state: "Maharashtra", district: "Ahmednagar", lat: 18.7300, lon: 75.3180 },
        { name: "Jamui", pincode: "811307", state: "Bihar", district: "Jamui", lat: 24.9200, lon: 86.2200 },
        { name: "Jamuria", pincode: "713336", state: "West Bengal", district: "Paschim Bardhaman", lat: 23.7000, lon: 87.0800 },
        { name: "Jambusar", pincode: "392150", state: "Gujarat", district: "Bharuch", lat: 22.0543, lon: 72.7981 },
        { name: "Jamner", pincode: "424206", state: "Maharashtra", district: "Jalgaon", lat: 20.8080, lon: 75.7760 },
        { name: "Jalore", pincode: "343001", state: "Rajasthan", district: "Jalore", lat: 25.3448, lon: 72.6174 },
        { name: "Jalpaiguri", pincode: "735101", state: "West Bengal", district: "Jalpaiguri", lat: 26.5405, lon: 88.7194 },
        { name: "Jaipur", pincode: "302001", state: "Rajasthan", district: "Jaipur", lat: 26.9124, lon: 75.7873 },
        { name: "Jagdalpur", pincode: "494001", state: "Chhattisgarh", district: "Bastar", lat: 19.0748, lon: 82.0084 },
        { name: "Jaunpur", pincode: "222001", state: "Uttar Pradesh", district: "Jaunpur", lat: 25.7464, lon: 82.6837 },
        { name: "Jind", pincode: "126102", state: "Haryana", district: "Jind", lat: 29.3167, lon: 76.3167 },
        { name: "Jhabua", pincode: "457661", state: "Madhya Pradesh", district: "Jhabua", lat: 22.7667, lon: 74.6000 },
        { name: "Jhalawar", pincode: "326001", state: "Rajasthan", district: "Jhalawar", lat: 24.5975, lon: 76.1611 },
        { name: "Jhunjhunu", pincode: "333001", state: "Rajasthan", district: "Jhunjhunu", lat: 28.1289, lon: 75.3995 },
        { name: "Jorhat", pincode: "785001", state: "Assam", district: "Jorhat", lat: 26.7509, lon: 94.2037 },
        { name: "Jeypore", pincode: "764001", state: "Odisha", district: "Koraput", lat: 18.8574, lon: 82.5694 },
        { name: "Jajpur", pincode: "755001", state: "Odisha", district: "Jajpur", lat: 20.8500, lon: 86.3333 },
        { name: "Jharsuguda", pincode: "768201", state: "Odisha", district: "Jharsuguda", lat: 21.8554, lon: 84.0062 },
        { name: "Jodhpur", pincode: "342001", state: "Rajasthan", district: "Jodhpur", lat: 26.2389, lon: 73.0243 },
        { name: "Jhansi", pincode: "284001", state: "Uttar Pradesh", district: "Jhansi", lat: 25.4484, lon: 78.5685 },
        { name: "Junagadh", pincode: "362001", state: "Gujarat", district: "Junagadh", lat: 21.5222, lon: 70.4579 },

        // Major Metros & Capital Cities
        { name: "Mumbai", pincode: "400001", state: "Maharashtra", district: "Mumbai City", lat: 19.0760, lon: 72.8777 },
        { name: "New Delhi", pincode: "110001", state: "Delhi", district: "New Delhi", lat: 28.6139, lon: 77.2090 },
        { name: "Bengaluru", pincode: "560001", state: "Karnataka", district: "Bengaluru Urban", lat: 12.9716, lon: 77.5946 },
        { name: "Hyderabad", pincode: "500001", state: "Telangana", district: "Hyderabad", lat: 17.3850, lon: 78.4867 },
        { name: "Chennai", pincode: "600001", state: "Tamil Nadu", district: "Chennai", lat: 13.0827, lon: 80.2707 },
        { name: "Kolkata", pincode: "700001", state: "West Bengal", district: "Kolkata", lat: 22.5726, lon: 88.3639 },
        { name: "Ahmedabad", pincode: "380001", state: "Gujarat", district: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
        { name: "Pune", pincode: "411001", state: "Maharashtra", district: "Pune", lat: 18.5204, lon: 73.8567 },
        { name: "Surat", pincode: "395001", state: "Gujarat", district: "Surat", lat: 21.1702, lon: 72.8311 },
        { name: "Lucknow", pincode: "226001", state: "Uttar Pradesh", district: "Lucknow", lat: 26.8467, lon: 80.9462 },
        { name: "Kanpur", pincode: "208001", state: "Uttar Pradesh", district: "Kanpur Nagar", lat: 26.4499, lon: 80.3319 },
        { name: "Nagpur", pincode: "440001", state: "Maharashtra", district: "Nagpur", lat: 21.1458, lon: 79.0882 },
        { name: "Indore", pincode: "452001", state: "Madhya Pradesh", district: "Indore", lat: 22.7196, lon: 75.8577 },
        { name: "Thane", pincode: "400601", state: "Maharashtra", district: "Thane", lat: 19.2183, lon: 72.9781 },
        { name: "Bhopal", pincode: "462001", state: "Madhya Pradesh", district: "Bhopal", lat: 23.2599, lon: 77.4126 },
        { name: "Visakhapatnam", pincode: "530001", state: "Andhra Pradesh", district: "Visakhapatnam", lat: 17.6868, lon: 83.2185 },
        { name: "Patna", pincode: "800001", state: "Bihar", district: "Patna", lat: 25.5941, lon: 85.1376 },
        { name: "Vadodara", pincode: "390001", state: "Gujarat", district: "Vadodara", lat: 22.3072, lon: 73.1812 },
        { name: "Ghaziabad", pincode: "201001", state: "Uttar Pradesh", district: "Ghaziabad", lat: 28.6692, lon: 77.4538 },
        { name: "Ludhiana", pincode: "141001", state: "Punjab", district: "Ludhiana", lat: 30.9010, lon: 75.8573 },
        { name: "Agra", pincode: "282001", state: "Uttar Pradesh", district: "Agra", lat: 27.1767, lon: 78.0081 },
        { name: "Nashik", pincode: "422001", state: "Maharashtra", district: "Nashik", lat: 19.9975, lon: 73.7898 },
        { name: "Faridabad", pincode: "121001", state: "Haryana", district: "Faridabad", lat: 28.4089, lon: 77.3178 },
        { name: "Meerut", pincode: "250001", state: "Uttar Pradesh", district: "Meerut", lat: 28.9845, lon: 77.7064 },
        { name: "Rajkot", pincode: "360001", state: "Gujarat", district: "Rajkot", lat: 22.3039, lon: 70.8022 },
        { name: "Kalyan-Dombivli", pincode: "421301", state: "Maharashtra", district: "Thane", lat: 19.2403, lon: 73.1305 },
        { name: "Vasai-Virar", pincode: "401201", state: "Maharashtra", district: "Palghar", lat: 19.4259, lon: 72.8225 },
        { name: "Varanasi", pincode: "221001", state: "Uttar Pradesh", district: "Varanasi", lat: 25.3176, lon: 82.9739 },
        { name: "Srinagar", pincode: "190001", state: "Jammu & Kashmir", district: "Srinagar", lat: 34.0837, lon: 74.7973 },
        { name: "Aurangabad", pincode: "431001", state: "Maharashtra", district: "Chhatrapati Sambhajinagar", lat: 19.8762, lon: 75.3433 },
        { name: "Dhanbad", pincode: "826001", state: "Jharkhand", district: "Dhanbad", lat: 23.7957, lon: 86.4304 },
        { name: "Amritsar", pincode: "143001", state: "Punjab", district: "Amritsar", lat: 31.6340, lon: 74.8723 },
        { name: "Navi Mumbai", pincode: "400703", state: "Maharashtra", district: "Thane", lat: 19.0330, lon: 73.0297 },
        { name: "Prayagraj", pincode: "211001", state: "Uttar Pradesh", district: "Prayagraj", lat: 25.4358, lon: 81.8463 },
        { name: "Ranchi", pincode: "834001", state: "Jharkhand", district: "Ranchi", lat: 23.3441, lon: 85.3096 },
        { name: "Howrah", pincode: "711101", state: "West Bengal", district: "Howrah", lat: 22.5958, lon: 88.2636 },
        { name: "Coimbatore", pincode: "641001", state: "Tamil Nadu", district: "Coimbatore", lat: 11.0168, lon: 76.9558 },
        { name: "Gwalior", pincode: "474001", state: "Madhya Pradesh", district: "Gwalior", lat: 26.2183, lon: 78.1828 },
        { name: "Vijayawada", pincode: "520001", state: "Andhra Pradesh", district: "NTR", lat: 16.5062, lon: 80.6480 },
        { name: "Madurai", pincode: "625001", state: "Tamil Nadu", district: "Madurai", lat: 9.9252, lon: 78.1198 },
        { name: "Raipur", pincode: "492001", state: "Chhattisgarh", district: "Raipur", lat: 21.2514, lon: 81.6296 },
        { name: "Kota", pincode: "324001", state: "Rajasthan", district: "Kota", lat: 25.2138, lon: 75.8648 },
        { name: "Chandigarh", pincode: "160017", state: "Chandigarh", district: "Chandigarh", lat: 30.7333, lon: 76.7794 },
        { name: "Guwahati", pincode: "781001", state: "Assam", district: "Kamrup Metropolitan", lat: 26.1445, lon: 91.7362 },
        { name: "Solapur", pincode: "413001", state: "Maharashtra", district: "Solapur", lat: 17.6599, lon: 75.9064 },
        { name: "Hubli-Dharwad", pincode: "580020", state: "Karnataka", district: "Dharwad", lat: 15.3647, lon: 75.1240 },
        { name: "Bareilly", pincode: "243001", state: "Uttar Pradesh", district: "Bareilly", lat: 28.3670, lon: 79.4304 },
        { name: "Moradabad", pincode: "244001", state: "Uttar Pradesh", district: "Moradabad", lat: 28.8386, lon: 78.7733 },
        { name: "Mysuru", pincode: "570001", state: "Karnataka", district: "Mysuru", lat: 12.2958, lon: 76.6394 },
        { name: "Gurugram", pincode: "122001", state: "Haryana", district: "Gurugram", lat: 28.4595, lon: 77.0266 },
        { name: "Aligarh", pincode: "202001", state: "Uttar Pradesh", district: "Aligarh", lat: 27.8974, lon: 78.0880 },
        { name: "Tiruchirappalli", pincode: "620001", state: "Tamil Nadu", district: "Tiruchirappalli", lat: 10.7905, lon: 78.7047 },
        { name: "Bhubaneswar", pincode: "751001", state: "Odisha", district: "Khurda", lat: 20.2961, lon: 85.8245 },
        { name: "Salem", pincode: "636001", state: "Tamil Nadu", district: "Salem", lat: 11.6643, lon: 78.1460 },
        { name: "Warangal", pincode: "506002", state: "Telangana", district: "Hanamkonda", lat: 17.9689, lon: 79.5941 },
        { name: "Thiruvananthapuram", pincode: "695001", state: "Kerala", district: "Thiruvananthapuram", lat: 8.5241, lon: 76.9366 },
        { name: "Kochi", pincode: "682001", state: "Kerala", district: "Ernakulam", lat: 9.9312, lon: 76.2673 },
        { name: "Dehradun", pincode: "248001", state: "Uttarakhand", district: "Dehradun", lat: 30.3165, lon: 78.0322 },
        { name: "Shimla", pincode: "171001", state: "Himachal Pradesh", district: "Shimla", lat: 31.1048, lon: 77.1734 },
        { name: "Panaji", pincode: "403001", state: "Goa", district: "North Goa", lat: 15.4909, lon: 73.8278 },
        { name: "Lonavala", pincode: "410401", state: "Maharashtra", district: "Pune", lat: 18.7557, lon: 73.4091 },
        { name: "Mahabaleshwar", pincode: "412806", state: "Maharashtra", district: "Satara", lat: 17.9237, lon: 73.6586 },
        { name: "Shirdi", pincode: "423109", state: "Maharashtra", district: "Ahmednagar", lat: 19.7667, lon: 74.4764 },
        { name: "Alibag", pincode: "402201", state: "Maharashtra", district: "Raigad", lat: 18.6414, lon: 72.8722 },
        { name: "Udaipur", pincode: "313001", state: "Rajasthan", district: "Udaipur", lat: 24.5854, lon: 73.7125 },
        { name: "Haridwar", pincode: "249401", state: "Uttarakhand", district: "Haridwar", lat: 29.9457, lon: 78.1642 },
        { name: "Rishikesh", pincode: "249201", state: "Uttarakhand", district: "Dehradun", lat: 30.0869, lon: 78.2676 },
        { name: "Manali", pincode: "175131", state: "Himachal Pradesh", district: "Kullu", lat: 32.2432, lon: 77.1892 },
        { name: "Gangtok", pincode: "737101", state: "Sikkim", district: "East Sikkim", lat: 27.3389, lon: 88.6065 },
        { name: "Shillong", pincode: "793001", state: "Meghalaya", district: "East Khasi Hills", lat: 25.5788, lon: 91.8933 },
        { name: "Leh", pincode: "194101", state: "Ladakh", district: "Leh", lat: 34.1526, lon: 77.5771 },
        { name: "Puducherry", pincode: "605001", state: "Puducherry", district: "Puducherry", lat: 11.9416, lon: 79.8083 }
    ];

    // Distance formatting helper
    function getDistanceFormattedFromUser(lat, lon) {
        const userLoc = state.userOriginCoord || [state.currLon, state.currLat];
        if (!userLoc) return "";
        const distM = haversineDistM(userLoc, [lon, lat]);
        if (distM < 1000) return `${Math.round(distM)} m`;
        return `${(distM / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
    }

    // Smart All-India Search Engine (Offline Gazetteer + Live Geocoding)
    function searchIndianGazetteer(query) {
        if (!query || query.trim().length === 0) return [];
        const q = query.trim().toLowerCase();
        
        // Match prefix, contains, pincode, state or district
        const matches = INDIAN_CITIES_GAZETTEER.map(item => {
            const nameLower = item.name.toLowerCase();
            const pinStr = item.pincode;
            const stateLower = item.state.toLowerCase();
            const distLower = item.district.toLowerCase();

            let score = 0;
            if (nameLower.startsWith(q)) score = 100 - (nameLower.length - q.length);
            else if (pinStr.startsWith(q)) score = 90;
            else if (nameLower.includes(q)) score = 70;
            else if (distLower.startsWith(q) || stateLower.startsWith(q)) score = 50;
            else if (distLower.includes(q) || stateLower.includes(q)) score = 30;

            return { item, score };
        }).filter(m => m.score > 0);

        matches.sort((a, b) => b.score - a.score);
        return matches.slice(0, 8).map(m => m.item);
    }

    function renderAutocompleteItem(item, isCurrentGps = false) {
        const div = document.createElement('div');
        div.className = isCurrentGps ? 'autocomplete-item gps-item' : 'autocomplete-item';

        if (isCurrentGps) {
            const gpsLon = state.userOriginCoord ? state.userOriginCoord[0] : state.currLon;
            const gpsLat = state.userOriginCoord ? state.userOriginCoord[1] : state.currLat;
            div.innerHTML = `
                <div style="font-size: 1.1rem;">📍</div>
                <div class="item-text">
                    <div class="item-title">
                        <span>Use Current GPS Location</span>
                        <span class="pincode-badge">LIVE GPS</span>
                    </div>
                    <div class="item-sub">
                        <span>Lat: ${gpsLat.toFixed(4)}, Lon: ${gpsLon.toFixed(4)}</span>
                        <span class="dist-tag">• 0 km (Your Position)</span>
                    </div>
                </div>
            `;
            return div;
        }

        const distText = getDistanceFormattedFromUser(item.lat, item.lon);
        div.innerHTML = `
            <div style="font-size: 1.1rem;">📍</div>
            <div class="item-text">
                <div class="item-title">
                    <span>${item.name}</span>
                    <span class="pincode-badge">PIN: ${item.pincode || 'India'}</span>
                </div>
                <div class="item-sub">
                    <span>${item.district ? item.district + ', ' : ''}${item.state}, India</span>
                    ${distText ? `<span class="dist-tag">• 🚗 ${distText} from your GPS</span>` : ''}
                </div>
            </div>
        `;
        return div;
    }

    function setupSmartSearch(inputEl, dropdownEl, onSelect) {
        let debounceTimer;

        async function updateSuggestions(query) {
            dropdownEl.innerHTML = '';
            const q = query.trim();

            // Always add Current GPS location as top option
            const gpsItem = renderAutocompleteItem(null, true);
            gpsItem.addEventListener('click', () => {
                const userLoc = state.userOriginCoord || [state.currLon, state.currLat];
                inputEl.value = "Current GPS Location";
                dropdownEl.classList.add('hidden');
                onSelect(userLoc, "Current GPS Location", "GPS");
            });
            dropdownEl.appendChild(gpsItem);

            // Fast instant suggestions from Indian Gazetteer
            const localResults = searchIndianGazetteer(q);
            localResults.forEach(item => {
                const itemEl = renderAutocompleteItem(item, false);
                itemEl.addEventListener('click', () => {
                    inputEl.value = `${item.name}, ${item.state}`;
                    dropdownEl.classList.add('hidden');
                    onSelect([item.lon, item.lat], `${item.name}, ${item.state}`, item.pincode);
                });
                dropdownEl.appendChild(itemEl);
            });

            dropdownEl.classList.remove('hidden');

            // Concurrently query Nominatim with India countrycode filter for rare streets/villages
            if (q.length >= 2) {
                try {
                    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&addressdetails=1&q=${encodeURIComponent(q)}&limit=6`;
                    const resp = await fetch(url);
                    const remoteData = await resp.json();

                    if (remoteData && remoteData.length > 0) {
                        remoteData.forEach(r => {
                            const lon = parseFloat(r.lon);
                            const lat = parseFloat(r.lat);
                            const name = r.display_name.split(',')[0];
                            const addr = r.address || {};
                            const stateName = addr.state || "India";
                            const distName = addr.state_district || addr.county || "";
                            const pin = addr.postcode || "";

                            // Prevent duplicate of local results
                            const isDuplicate = localResults.some(l => Math.abs(l.lat - lat) < 0.05 && Math.abs(l.lon - lon) < 0.05);
                            if (!isDuplicate) {
                                const liveItem = {
                                    name: name,
                                    pincode: pin,
                                    state: stateName,
                                    district: distName,
                                    lat: lat,
                                    lon: lon
                                };
                                const liveEl = renderAutocompleteItem(liveItem, false);
                                liveEl.addEventListener('click', () => {
                                    inputEl.value = `${name}, ${stateName}`;
                                    dropdownEl.classList.add('hidden');
                                    onSelect([lon, lat], `${name}, ${stateName}`, pin);
                                });
                                dropdownEl.appendChild(liveEl);
                            }
                        });
                    }
                } catch (err) {}
            }
        }

        inputEl.addEventListener('focus', () => {
            updateSuggestions(inputEl.value);
        });

        inputEl.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => updateSuggestions(e.target.value), 200);
        });

        document.addEventListener('click', (e) => {
            if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
                dropdownEl.classList.add('hidden');
            }
        });
    }

    // Attach Smart Search to All Inputs
    setupSmartSearch(floatingDestInput, floatingAutocompleteList, (coord, name, pin) => {
        state.destCoord = coord;
        state.destName = name;
        destMarker.setLngLat(coord).addTo(map);
        inputDestSearch.value = name;
        if (!state.userOriginCoord) {
            state.userOriginCoord = [72.8777, 19.0760];
        }
        fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
    });

    setupSmartSearch(inputDestSearch, destDropdown, (coord, name, pin) => {
        state.destCoord = coord;
        state.destName = name;
        destMarker.setLngLat(coord).addTo(map);
        floatingDestInput.value = name;
        if (state.userOriginCoord) {
            fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
        }
    });

    setupSmartSearch(inputOriginSearch, originDropdown, (coord, name, pin) => {
        state.userOriginCoord = coord;
        state.userOriginName = name;
        state.currLon = coord[0];
        state.currLat = coord[1];
        originMarker.setLngLat(coord).addTo(map);
        vehicleMarker.setLngLat(coord).addTo(map);
        map.flyTo({ center: coord, zoom: 15.0, pitch: 55 });
        if (state.destCoord) {
            fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
        }
    });

    btnFloatingSearchGo.addEventListener('click', () => {
        if (floatingDestInput.value.trim().length > 0) {
            const matches = searchIndianGazetteer(floatingDestInput.value.trim());
            if (matches.length > 0) {
                const target = matches[0];
                state.destCoord = [target.lon, target.lat];
                state.destName = `${target.name}, ${target.state}`;
                destMarker.setLngLat(state.destCoord).addTo(map);
                floatingDestInput.value = state.destName;
                inputDestSearch.value = state.destName;
                if (!state.userOriginCoord) state.userOriginCoord = [72.8777, 19.0760];
                fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
            }
        }
    });

    btnSearchOrigin.addEventListener('click', () => {
        if (inputOriginSearch.value.trim().length > 0) {
            const matches = searchIndianGazetteer(inputOriginSearch.value.trim());
            if (matches.length > 0) {
                const target = matches[0];
                state.userOriginCoord = [target.lon, target.lat];
                originMarker.setLngLat(state.userOriginCoord).addTo(map);
                vehicleMarker.setLngLat(state.userOriginCoord).addTo(map);
                if (state.destCoord) fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
            }
        }
    });

    btnSearchDest.addEventListener('click', () => {
        if (inputDestSearch.value.trim().length > 0) {
            const matches = searchIndianGazetteer(inputDestSearch.value.trim());
            if (matches.length > 0) {
                const target = matches[0];
                state.destCoord = [target.lon, target.lat];
                destMarker.setLngLat(state.destCoord).addTo(map);
                floatingDestInput.value = `${target.name}, ${target.state}`;
                if (state.userOriginCoord) fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
            }
        }
    });

    btnCalcRoute.addEventListener('click', () => {
        if (!state.userOriginCoord) state.userOriginCoord = [72.8777, 19.0760];
        if (!state.destCoord) {
            const matches = searchIndianGazetteer(inputDestSearch.value || "Lonavala");
            if (matches.length > 0) state.destCoord = [matches[0].lon, matches[0].lat];
            else state.destCoord = [73.4091, 18.7557];
        }
        fetchRealDrivingRoute(state.userOriginCoord, state.destCoord);
    });

    // 3. Reverse Geocoding
    async function reverseGeocode(lat, lon, isOrigin) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
            const resp = await fetch(url);
            const data = await resp.json();
            if (data && data.display_name) {
                const shortName = data.display_name.split(',').slice(0, 2).join(', ');
                if (isOrigin) {
                    inputOriginSearch.value = shortName;
                    state.userOriginName = shortName;
                } else {
                    inputDestSearch.value = shortName;
                    floatingDestInput.value = shortName;
                    state.destName = shortName;
                }
            }
        } catch (e) {}
    }

    btnUseLocation.addEventListener('click', () => {
        promptUserForLocation();
    });


    // =========================================================================
    // 4. OSRM ROUTE CALCULATION WITH CUMULATIVE PHYSICAL DISTANCE
    // =========================================================================

    function parseOSRMSteps(osrmLeg, coords) {
        if (!osrmLeg || !osrmLeg.steps || osrmLeg.steps.length === 0) {
            return generateSyntheticSteps(coords);
        }

        const steps = [];
        const totalCoords = coords.length;

        osrmLeg.steps.forEach((st, idx) => {
            const streetName = (st.name && st.name.trim().length > 0) ? st.name.trim() : "Main Road";
            const mType = st.maneuver ? st.maneuver.type : "turn";
            const mModifier = st.maneuver ? st.maneuver.modifier || "straight" : "straight";
            const mLoc = st.maneuver ? st.maneuver.location : null;
            
            let nearestIdx = 0;
            let minDist = Infinity;
            if (mLoc) {
                for (let i = 0; i < totalCoords; i++) {
                    const d = Math.hypot(coords[i][0] - mLoc[0], coords[i][1] - mLoc[1]);
                    if (d < minDist) {
                        minDist = d;
                        nearestIdx = i;
                    }
                }
            } else {
                nearestIdx = Math.floor((idx / osrmLeg.steps.length) * (totalCoords - 1));
            }

            const progressT = totalCoords > 1 ? nearestIdx / (totalCoords - 1) : 0;

            let instruction = "";
            if (mType === 'depart') instruction = `Head towards ${streetName}`;
            else if (mType === 'arrive') instruction = `You have arrived at your destination`;
            else if (mModifier === 'right' || mModifier === 'sharp right') instruction = `Turn right onto ${streetName}`;
            else if (mModifier === 'slight right') instruction = `Take the slight right onto ${streetName}`;
            else if (mModifier === 'left' || mModifier === 'sharp left') instruction = `Turn left onto ${streetName}`;
            else if (mModifier === 'slight left') instruction = `Take the slight left onto ${streetName}`;
            else if (mModifier === 'uturn') instruction = `Make a U-turn onto ${streetName}`;
            else if (mType === 'roundabout') instruction = `At the roundabout, take the exit onto ${streetName}`;
            else instruction = `Continue straight on ${streetName}`;

            steps.push({
                index: idx,
                streetName: streetName,
                type: mType,
                modifier: mModifier,
                instruction: instruction,
                distanceM: Math.round(st.distance || 0),
                progressT: progressT
            });
        });

        return steps;
    }

    function generateSyntheticSteps(coords) {
        const steps = [];
        const n = coords.length;
        if (n < 2) return steps;

        steps.push({
            index: 0,
            streetName: "Expressway",
            type: "depart",
            modifier: "straight",
            instruction: "Head along the road route",
            distanceM: 300,
            progressT: 0.0
        });

        let lastBearing = 0;
        for (let i = 1; i < n - 1; i += Math.max(1, Math.floor(n / 6))) {
            const p1 = coords[i];
            const p2 = coords[Math.min(n - 1, i + 1)];
            const dLon = p2[0] - p1[0];
            const dLat = p2[1] - p1[1];
            let bearing = Math.atan2(dLon, dLat) * (180 / Math.PI);
            if (bearing < 0) bearing += 360;

            const diff = bearing - lastBearing;
            lastBearing = bearing;

            if (Math.abs(diff) > 25) {
                const isRight = diff > 0;
                steps.push({
                    index: steps.length,
                    streetName: "Connecting Arterial",
                    type: "turn",
                    modifier: isRight ? "right" : "left",
                    instruction: isRight ? "Turn right onto connecting road" : "Turn left onto connecting road",
                    distanceM: 400,
                    progressT: i / (n - 1)
                });
            }
        }

        steps.push({
            index: steps.length,
            streetName: "Destination",
            type: "arrive",
            modifier: "straight",
            instruction: "Arrive at your destination",
            distanceM: 0,
            progressT: 1.0
        });

        return steps;
    }

    async function fetchRealDrivingRoute(startCoord, endCoord) {
        if (!startCoord || !endCoord) return;

        const url = `https://router.project-osrm.org/route/v1/driving/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?overview=full&geometries=geojson&steps=true`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                state.routeCoordinates = route.geometry.coordinates;
                const { dists, total } = buildCumulativeDistances(state.routeCoordinates);
                state.routeCumDists = dists;
                state.routeTotalDistM = total;
                state.routeDistKm = (total / 1000).toFixed(1);
                state.routeEtaMin = Math.max(1, Math.round(route.duration / 60));
                state.routeSteps = parseOSRMSteps(route.legs[0], state.routeCoordinates);
                
                drawRouteOn3DMap(state.routeCoordinates);
                updateGmapsDock();
                
                summaryEtaVal.innerText = `${state.routeEtaMin} min`;
                summaryDistVal.innerText = `(${state.routeDistKm} km)`;
                floatingRouteSummary.classList.remove('hidden');
                
                const firstStep = state.routeSteps[0] || { instruction: `Route to destination`, distanceM: 200, modifier: 'straight' };
                turnInstruction.innerText = firstStep.instruction;
                turnDistance.innerText = `Distance: ${state.routeDistKm} km`;
                turnSubInstruction.innerText = `ETA: ${state.routeEtaMin} mins • Tap 'Start Navigation'`;
                tripProgressText.innerText = `0.0 km / ${state.routeDistKm} km`;
                updateTurnIcon(firstStep.type, firstStep.modifier);
                
                const bounds = new maplibregl.LngLatBounds();
                state.routeCoordinates.forEach(pt => bounds.extend(pt));
                map.fitBounds(bounds, { padding: 80, pitch: 52, duration: 1000 });
            } else {
                generateFallbackRoute(startCoord, endCoord);
            }
        } catch (e) {
            generateFallbackRoute(startCoord, endCoord);
        }
    }

    function generateFallbackRoute(start, end) {
        const coords = [];
        const steps = 80;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const lon = start[0] + (end[0] - start[0]) * t;
            const lat = start[1] + (end[1] - start[1]) * t;
            coords.push([lon, lat]);
        }
        state.routeCoordinates = coords;
        const { dists, total } = buildCumulativeDistances(coords);
        state.routeCumDists = dists;
        state.routeTotalDistM = total;
        state.routeDistKm = (total / 1000).toFixed(1);
        state.routeEtaMin = Math.max(1, Math.round(state.routeDistKm * 1.2));
        state.routeSteps = generateSyntheticSteps(coords);
        
        summaryEtaVal.innerText = `${state.routeEtaMin} min`;
        summaryDistVal.innerText = `(${state.routeDistKm} km)`;
        floatingRouteSummary.classList.remove('hidden');

        drawRouteOn3DMap(coords);
        updateGmapsDock();
    }

    function drawRouteOn3DMap(coordinates) {
        if (!map || !map.isStyleLoaded() || !coordinates || coordinates.length < 2) return;

        if (map.getSource('route-src')) {
            map.getSource('route-src').setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates }
            });
        } else {
            map.addSource('route-src', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates }
                }
            });

            map.addLayer({
                id: 'route-layer',
                type: 'line',
                source: 'route-src',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#10b981',
                    'line-width': 7,
                    'line-opacity': 0.95
                }
            });
        }

        const n = coordinates.length;
        const sIdx = Math.floor(n * state.tunnelRange[0]);
        const eIdx = Math.min(n - 1, Math.ceil(n * state.tunnelRange[1]));
        const tunnelCoords = coordinates.slice(sIdx, eIdx + 1);

        if (map.getSource('tunnel-src')) {
            map.getSource('tunnel-src').setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: tunnelCoords }
            });
        } else {
            map.addSource('tunnel-src', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: tunnelCoords }
                }
            });

            map.addLayer({
                id: 'tunnel-layer',
                type: 'line',
                source: 'tunnel-src',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ef4444',
                    'line-width': 8,
                    'line-dasharray': [3, 2],
                    'line-opacity': 0.95
                }
            });
        }
    }

    function updateGmapsDock() {
        const remKm = (state.routeDistKm * (1.0 - state.tripProgress)).toFixed(1);
        const remMin = Math.max(1, Math.round(state.routeEtaMin * (1.0 - state.tripProgress)));
        dockTimeLeft.innerText = `${remMin} min`;
        dockDist.innerText = `${remKm} km`;

        const now = new Date();
        const etaDate = new Date(now.getTime() + remMin * 60000);
        const hours = etaDate.getHours().toString().padStart(2, '0');
        const mins = etaDate.getMinutes().toString().padStart(2, '0');
        dockEtaClock.innerText = `${hours}:${mins} ETA`;
    }

    // =========================================================================
    // 5. CAMERA & OFFLINE PROOF MODAL ACTIONS
    // =========================================================================
    btnCam3d.addEventListener('click', () => {
        state.cameraMode = '3d_chase';
        btnCam3d.classList.add('active');
        btnCamTop.classList.remove('active');
        btnCamFree.classList.remove('active');
        recenterCamera();
    });

    btnCamTop.addEventListener('click', () => {
        state.cameraMode = 'top_down';
        state.cameraFollow = true;
        btnCamTop.classList.add('active');
        btnCam3d.classList.remove('active');
        btnCamFree.classList.remove('active');
        map.easeTo({ pitch: 0, bearing: 0, zoom: 14.5, duration: 600 });
    });

    btnCamFree.addEventListener('click', () => {
        state.cameraMode = 'free_orbit';
        state.cameraFollow = false;
        btnCamFree.classList.add('active');
        btnCam3d.classList.remove('active');
        btnCamTop.classList.remove('active');
        freeLookNotice.classList.remove('hidden');
    });

    // Offline Proof Modal Triggers
    btnProveOfflineFab.addEventListener('click', () => {
        proofModalBackdrop.classList.remove('hidden');
    });

    btnCloseProofModal.addEventListener('click', () => {
        proofModalBackdrop.classList.add('hidden');
    });

    btnDoneProofModal.addEventListener('click', () => {
        proofModalBackdrop.classList.add('hidden');
    });

    btnTriggerInstantBlackout.addEventListener('click', () => {
        state.manualSignalOverride = true;
        state.gnssSignalPct = 0;
        sliderSignal.value = 0;
        proofModalBackdrop.classList.add('hidden');
        if (!state.isNavigating) startNavigation();
        speakVoice("Simulated 100% GNSS blackout triggered. NaviCore AI dead reckoning actively engaged with zero cloud requests.", true, "proof_blackout");
    });

    toggleGhostComparison.addEventListener('change', (e) => {
        state.ghostEnabled = e.target.checked;
        if (!state.ghostEnabled && ghostMarkerEl) {
            ghostMarkerEl.classList.add('hidden');
        }
    });

    // =========================================================================
    // 6. START / STOP NAVIGATION (Seamless 1-Click Launch)
    // =========================================================================
    function startNavigation() {
        if (!state.userOriginCoord || !state.destCoord || state.routeCoordinates.length < 2) {
            alert("Please search your destination in the search bar first.");
            return;
        }

        state.isNavigating = true;
        state.cameraFollow = true;
        state.distanceTraveledM = 0;
        state.ghostDriftM = 0;
        
        floatingSearchBox.classList.add('nav-active');
        freeLookNotice.classList.add('hidden');
        btnDoneNav.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg><span>Pause Navigation</span>`;
        state.spokenMilestones.clear();

        const destName = floatingDestInput.value || inputDestSearch.value || "your destination";
        const firstStep = state.routeSteps[0];
        const startInstruction = firstStep ? firstStep.instruction : "Head along the route";

        speakVoice(`Starting navigation to ${destName}. Total distance ${state.routeDistKm} kilometers. ${startInstruction}.`, true, "trip_start");

        map.flyTo({
            center: state.routeCoordinates[0],
            zoom: 16.8,
            pitch: 60,
            duration: 1000
        });
    }

    btnQuickStartNav.addEventListener('click', startNavigation);
    btnDoneNav.addEventListener('click', () => {
        if (state.isNavigating) {
            state.isNavigating = false;
            btnDoneNav.innerHTML = `<span>Resume Navigation</span>`;
        } else {
            startNavigation();
        }
    });

    btnDockStop.addEventListener('click', resetNavigation);
    btnResetNav.addEventListener('click', resetNavigation);

    function resetNavigation() {
        state.isNavigating = false;
        state.cameraFollow = true;
        state.tripProgress = 0.0;
        state.distanceTraveledM = 0;
        state.blackoutDuration = 0;
        state.manualSignalOverride = false;
        state.gnssSignalPct = 100;
        sliderSignal.value = 100;
        state.driftErrorM = 0.0;
        state.ghostDriftM = 0.0;
        state.trafficStopActive = false;
        toggleTrafficStop.checked = false;
        state.chartData = [];
        state.satellites = 18;
        state.spokenMilestones.clear();

        floatingSearchBox.classList.remove('nav-active');
        freeLookNotice.classList.add('hidden');
        btnDoneNav.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="3" fill="none"/></svg><span>Done & Start Route</span>`;

        if (ghostMarkerEl) ghostMarkerEl.classList.add('hidden');

        if (state.routeCoordinates.length > 0) {
            const startPt = state.routeCoordinates[0];
            state.currLon = startPt[0];
            state.currLat = startPt[1];
            state.ghostLon = startPt[0];
            state.ghostLat = startPt[1];
            vehicleMarker.setLngLat(startPt).addTo(map);
            map.flyTo({ center: startPt, pitch: 55, zoom: 15.0 });
        }
        updateUI();
    }

    // Signal Slider & Presets with Instant High-Contrast Visual Feedback
    function applyGnssSignalChange(val) {
        state.gnssSignalPct = val;
        state.manualSignalOverride = true;
        sliderSignal.value = val;
        if (val === 0) {
            state.engineMode = 'DEAD_RECKONING';
            state.satellites = 0;
            if (vehicleMarkerEl) vehicleMarkerEl.className = "vehicle-marker-3d dead-reckoning";
            if (ghostMarkerEl && state.ghostEnabled) {
                ghostMarkerEl.classList.remove('hidden');
                ghostMarker.setLngLat([state.currLon + 0.0003, state.currLat - 0.0002]).addTo(map);
            }
            speakVoice("GNSS fix stopped. 1D-TCN AI dead reckoning engaged.", true, "signal_cut_" + Date.now());
        } else {
            state.engineMode = 'OPEN_SKY';
            state.satellites = Math.round(4 + (val / 100) * 14);
            if (vehicleMarkerEl) vehicleMarkerEl.className = "vehicle-marker-3d";
            if (ghostMarkerEl) ghostMarkerEl.classList.add('hidden');
        }
        updateUI();
    }

    sliderSignal.addEventListener('input', (e) => {
        applyGnssSignalChange(parseInt(e.target.value));
        presetBtns.forEach(b => b.classList.remove('active'));
    });

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val);
            applyGnssSignalChange(val);
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    btnPothole.addEventListener('click', () => {
        state.potholeShock = 35.0;
    });

    toggleTrafficStop.addEventListener('change', (e) => {
        state.trafficStopActive = e.target.checked;
        if (state.trafficStopActive) {
            speakVoice("Traffic stop detected. Velocity clamped to zero.", true, "traffic_stop_" + Date.now());
        }
    });

    // Live Device GPS Tracking Mode
    function startLiveGpsTracking() {
        if (!navigator.geolocation) return;
        if (state.watchGpsId) navigator.geolocation.clearWatch(state.watchGpsId);

        state.watchGpsId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const spd = pos.coords.speed !== null ? pos.coords.speed * 3.6 : 0;
                
                state.currLon = lon;
                state.currLat = lat;
                state.speedKmh = spd;
                if (pos.coords.heading !== null) {
                    state.headingDeg = Math.round(pos.coords.heading);
                    state.smoothHeadingDeg = state.headingDeg;
                }
                vehicleMarker.setLngLat([lon, lat]).addTo(map);
                if (state.cameraFollow) {
                    map.easeTo({ center: [lon, lat], pitch: 60, bearing: state.smoothHeadingDeg, duration: 400 });
                }
                updateUI();
            },
            (err) => console.warn("GPS watch:", err),
            { enableHighAccuracy: true, maximumAge: 1000 }
        );
    }

    function stopLiveGpsTracking() {
        if (state.watchGpsId) {
            navigator.geolocation.clearWatch(state.watchGpsId);
            state.watchGpsId = null;
        }
    }

    // =========================================================================
    // 7. ROCK-STEADY 60 FPS MOTION & KALMAN-AI SIMULATOR
    // =========================================================================

    function mainAnimationLoop(timestamp) {
        const dt = Math.min(0.05, (timestamp - state.lastFrameTime) / 1000);
        state.lastFrameTime = timestamp;

        if (state.isNavigating && state.routeCoordinates.length >= 2 && state.driveMode !== 'live_gps') {
            // Speed in meters per second (Pure constant physical speed)
            let baseSpeedKmh = 50.0;
            if (state.driveMode === 'demo_3x') baseSpeedKmh = 160.0;

            if (state.trafficStopActive) {
                state.speedKmh = 0.0;
                state.forwardVx = 0.0;
            } else {
                state.speedKmh = baseSpeedKmh;
                state.forwardVx = baseSpeedKmh / 3.6; // ~13.88 m/s
                state.distanceTraveledM += state.forwardVx * dt;
            }

            state.tripProgress = Math.min(1.0, state.distanceTraveledM / Math.max(1, state.routeTotalDistM));

            // Destination reached -> Auto-Resend Loop
            if (state.tripProgress >= 1.0) {
                state.tripProgress = 1.0;
                state.isNavigating = false;
                state.speedKmh = 0.0;
                btnDoneNav.innerHTML = `<span>Auto-Resending Run in 2s...</span>`;
                turnInstruction.innerText = "🏁 Arrived at Destination!";
                turnDistance.innerText = "Looping Run";
                turnSubInstruction.innerText = "NaviCore AI auto-resending continuous navigation cycle...";
                updateTurnIcon("arrive", "straight");
                if (ghostMarkerEl) ghostMarkerEl.classList.add('hidden');
                speakVoice("You have arrived at your destination. Auto-resending navigation cycle.", true, "trip_arrival_" + Date.now());
                updateUI();

                // Seamless Auto-Resend & Continuous Navigation Loop
                if (!state.autoLoopTimeout) {
                    state.autoLoopTimeout = setTimeout(() => {
                        state.autoLoopTimeout = null;
                        if (state.routeCoordinates && state.routeCoordinates.length > 0) {
                            state.distanceTraveledM = 0;
                            state.tripProgress = 0.0;
                            state.isNavigating = true;
                            state.spokenMilestones.clear();
                            const startPt = state.routeCoordinates[0];
                            state.currLon = startPt[0];
                            state.currLat = startPt[1];
                            state.ghostLon = startPt[0];
                            state.ghostLat = startPt[1];
                            vehicleMarker.setLngLat(startPt).addTo(map);
                            floatingSearchBox.classList.add('nav-active');
                            btnDoneNav.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg><span>Pause Navigation</span>`;
                            if (state.cameraFollow) {
                                map.flyTo({ center: startPt, pitch: 60, zoom: 16.8, bearing: state.headingDeg, duration: 600 });
                            }
                        }
                    }, 2200);
                }
            } else {
                // Rock-Solid Exact Physical Distance Interpolation along Polyline
                const cumDists = state.routeCumDists;
                const targetDist = state.distanceTraveledM;
                let segIdx = 0;
                for (let i = 0; i < cumDists.length - 1; i++) {
                    if (cumDists[i + 1] >= targetDist) {
                        segIdx = i;
                        break;
                    }
                }

                const segStartDist = cumDists[segIdx];
                const segEndDist = cumDists[Math.min(cumDists.length - 1, segIdx + 1)];
                const segLen = Math.max(0.001, segEndDist - segStartDist);
                const segT = (targetDist - segStartDist) / segLen;

                const p1 = state.routeCoordinates[segIdx];
                const p2 = state.routeCoordinates[Math.min(state.routeCoordinates.length - 1, segIdx + 1)];

                state.currLon = p1[0] + (p2[0] - p1[0]) * segT;
                state.currLat = p1[1] + (p2[1] - p1[1]) * segT;

                const dLon = p2[0] - p1[0];
                const dLat = p2[1] - p1[1];
                let hdg = Math.atan2(dLon, dLat) * (180 / Math.PI);
                if (hdg < 0) hdg += 360;
                state.headingDeg = Math.round(hdg);

                // Smooth shortest-path angular damping
                let diffHdg = (state.headingDeg - state.smoothHeadingDeg + 540) % 360 - 180;
                state.smoothHeadingDeg = (state.smoothHeadingDeg + diffHdg * 0.14 + 360) % 360;

                // Turn guidance
                const inTunnel = (state.tripProgress >= state.tunnelRange[0] && state.tripProgress <= state.tunnelRange[1]);
                const remKm = (state.routeDistKm * (1.0 - state.tripProgress)).toFixed(1);

                let nextStep = null;
                let stepDistM = 0;
                if (state.routeSteps && state.routeSteps.length > 0) {
                    for (let i = 0; i < state.routeSteps.length; i++) {
                        const st = state.routeSteps[i];
                        if (st.progressT > state.tripProgress) {
                            nextStep = st;
                            stepDistM = Math.round((st.progressT - state.tripProgress) * state.routeTotalDistM);
                            break;
                        }
                    }
                }

                if (inTunnel) {
                    turnInstruction.innerText = "Tunnel Section (GNSS Blackout)";
                    turnDistance.innerText = "In Tunnel";
                    turnSubInstruction.innerText = `1D-TCN AI Virtual Odometer Active (${remKm} km to dest)`;
                    updateTurnIcon("tunnel", "tunnel");
                    speakVoice("Entering tunnel zone. Satellite signal lost. NaviCore AI dead reckoning activated.", false, "tunnel_enter");
                } else if (nextStep) {
                    const formattedDist = stepDistM > 1000 ? `${(stepDistM / 1000).toFixed(1)} km` : `${Math.round(stepDistM / 10) * 10} m`;
                    turnInstruction.innerText = nextStep.instruction;
                    turnDistance.innerText = `In ${formattedDist}`;
                    turnSubInstruction.innerText = `Then continue for ${remKm} km`;
                    updateTurnIcon(nextStep.type, nextStep.modifier);

                    if (stepDistM <= 450 && stepDistM > 250) {
                        speakVoice(`In 400 meters, ${nextStep.instruction.toLowerCase()}.`, false, `step_${nextStep.index}_adv`);
                    } else if (stepDistM <= 100 && stepDistM > 30) {
                        speakVoice(`${nextStep.instruction}, then continue for ${remKm} kilometers.`, false, `step_${nextStep.index}_now`);
                    }
                }

                // Tunnel Signal Handling
                if (!state.manualSignalOverride) {
                    if (inTunnel) {
                        state.gnssSignalPct = 0;
                        sliderSignal.value = 0;
                        state.satellites = 0;
                    } else {
                        state.gnssSignalPct = 100;
                        sliderSignal.value = 100;
                        state.satellites = 18;
                    }
                }

                if (!inTunnel && state.spokenMilestones.has("tunnel_enter") && !state.spokenMilestones.has("tunnel_exit")) {
                    speakVoice("Exiting tunnel. GPS signal restored. Continuing on route.", true, "tunnel_exit");
                }

                // AI Engine State & Ghost Vehicle Drift Simulation
                if (state.trafficStopActive || state.speedKmh < 0.5) {
                    state.engineMode = 'ZUPT_LOCKED';
                    state.zuptLocked = true;
                    state.zuptProb = 0.99;
                    state.forwardVx = 0.0;
                    state.confidencePct = 100.0;
                } else if (state.gnssSignalPct === 0) {
                    state.engineMode = 'DEAD_RECKONING';
                    state.zuptLocked = false;
                    state.zuptProb = 0.02;
                    state.blackoutDuration += dt;
                    state.driftErrorM += 0.003 * dt;
                    state.confidencePct = Math.max(89.0, 99.8 - state.blackoutDuration * 0.3);

                    // Simulate uncorrected IMU drift for the red Ghost Vehicle
                    if (state.ghostEnabled) {
                        state.ghostDriftM += 0.45 * dt * (state.blackoutDuration * 1.5);
                        const driftLon = Math.sin(state.blackoutDuration * 0.8) * (state.ghostDriftM / 111000);
                        const driftLat = Math.cos(state.blackoutDuration * 0.8) * (state.ghostDriftM / 111000);
                        state.ghostLon = state.currLon + driftLon;
                        state.ghostLat = state.currLat + driftLat;
                        
                        if (ghostMarkerEl) {
                            ghostMarkerEl.classList.remove('hidden');
                            ghostMarker.setLngLat([state.ghostLon, state.ghostLat]).addTo(map);
                            ghostMarkerEl.style.transform = `rotate(${state.smoothHeadingDeg + Math.sin(state.blackoutDuration) * 25}deg)`;
                        }
                    }
                } else {
                    state.engineMode = 'OPEN_SKY';
                    state.zuptLocked = false;
                    state.blackoutDuration = 0;
                    state.driftErrorM = 0.0;
                    state.ghostDriftM = 0.0;
                    if (ghostMarkerEl) ghostMarkerEl.classList.add('hidden');
                }
            }
        }

        // Apply lean angle to 2-wheeler
        if (vehicleMarkerEl) {
            let diffHdg = (state.headingDeg - state.smoothHeadingDeg + 540) % 360 - 180;
            if (state.vehicleProfile === 'motorcycle') {
                if (diffHdg > 3) {
                    vehicleMarkerEl.classList.add('leaning-right');
                    vehicleMarkerEl.classList.remove('leaning-left');
                } else if (diffHdg < -3) {
                    vehicleMarkerEl.classList.add('leaning-left');
                    vehicleMarkerEl.classList.remove('leaning-right');
                } else {
                    vehicleMarkerEl.classList.remove('leaning-left', 'leaning-right');
                }
            }
            vehicleMarkerEl.style.transform = `rotate(${state.smoothHeadingDeg}deg)`;
        }

        vehicleMarker.setLngLat([state.currLon, state.currLat]).addTo(map);

        // Camera Tracking (Only when cameraFollow is active)
        if (state.isNavigating && state.cameraFollow && state.cameraMode === '3d_chase') {
            map.jumpTo({
                center: [state.currLon, state.currLat],
                pitch: 60,
                bearing: state.smoothHeadingDeg
            });
        }

        // Telemetry chart & UI updates at ~10Hz
        if (Math.random() < 0.2) {
            if (state.potholeShock > 0) state.potholeShock *= 0.6;
            state.chartData.push({
                vx: state.forwardVx,
                az: 9.81 + state.potholeShock + (state.trafficStopActive ? Math.sin(timestamp * 0.02) * 1.5 : 0)
            });
            if (state.chartData.length > 40) state.chartData.shift();

            updateUI();
            renderChart();
        }

        requestAnimationFrame(mainAnimationLoop);
    }

    function updateUI() {
        const kmDone = (state.tripProgress * state.routeDistKm).toFixed(1);
        tripProgressText.innerText = `${kmDone} km / ${state.routeDistKm} km`;
        tripPctText.innerText = `${Math.round(state.tripProgress * 100)}%`;
        progressFill.style.width = `${state.tripProgress * 100}%`;
        updateGmapsDock();

        hudSats.innerText = state.satellites;
        hudSpeed.innerText = Math.round(state.speedKmh);
        hudElevation.innerText = `+${Math.round(state.elevationM + (state.tripProgress * 15))}`;
        hudHeading.innerText = Math.round(state.smoothHeadingDeg).toString().padStart(3, '0') + '°';

        if (state.gnssSignalPct === 0) {
            badgeSignal.innerText = "NO FIX (0 dB-Hz)";
            badgeSignal.style.color = "var(--red-neon)";
            badgeSignal.style.borderColor = "var(--red-neon)";
            hudSats.className = "hud-val accent-red";
        } else if (state.gnssSignalPct <= 40) {
            badgeSignal.innerText = `WEAK (${state.gnssSignalPct}%)`;
            badgeSignal.style.color = "var(--amber-neon)";
            badgeSignal.style.borderColor = "var(--amber-neon)";
            hudSats.className = "hud-val accent-amber";
        } else {
            badgeSignal.innerText = "STRONG (44 dB-Hz)";
            badgeSignal.style.color = "var(--green-neon)";
            badgeSignal.style.borderColor = "var(--green-neon)";
            hudSats.className = "hud-val accent-cyan";
        }

        if (state.engineMode === 'ZUPT_LOCKED') {
            navModeText.innerText = "ZUPT IDLE LOCK (22Hz DETECTED)";
            modeDot.className = "pulse-dot warning";
            beaconStatus.innerText = "TRAFFIC IDLE LOCK";
            beaconStatus.style.color = "var(--amber-neon)";
            beaconDetail.innerText = "Velocity Clamped to EXACT 0.00 m/s • Engine Idle Rejection";
            blackoutTimer.classList.remove('active');
            if (vehicleMarkerEl) vehicleMarkerEl.className = "vehicle-marker-3d zupt-lock";
        } else if (state.engineMode === 'DEAD_RECKONING') {
            navModeText.innerText = "AI DEAD RECKONING ACTIVE";
            modeDot.className = "pulse-dot blackout";
            beaconStatus.innerText = "TUNNEL GNSS BLACKOUT";
            beaconStatus.style.color = "var(--cyan-glow)";
            beaconDetail.innerText = "1D-TCN Virtual Odometer + Non-Holonomic 15-State ESKF";
            
            blackoutTimer.classList.add('active');
            const mins = Math.floor(state.blackoutDuration / 60).toString().padStart(2, '0');
            const secs = (state.blackoutDuration % 60).toFixed(1).padStart(4, '0');
            blackoutTimer.innerText = `DEAD RECKONING: ${mins}:${secs}`;
            if (vehicleMarkerEl) vehicleMarkerEl.className = "vehicle-marker-3d dead-reckoning";
        } else {
            navModeText.innerText = "OPEN SKY (GNSS 3D FIX)";
            modeDot.className = "pulse-dot active";
            beaconStatus.innerText = "OPEN SKY MODE";
            beaconStatus.style.color = "var(--green-neon)";
            beaconDetail.innerText = "Direct Satellite Positioning + 15-State ESKF Bias Learning";
            blackoutTimer.classList.remove('active');
            if (vehicleMarkerEl) vehicleMarkerEl.className = "vehicle-marker-3d";
        }

        valDrift.innerHTML = `${state.driftErrorM.toFixed(2)} <span class="unit">m</span>`;
        subDriftPct.innerText = `${((state.driftErrorM / (Math.max(1, state.routeDistKm) * 1000)) * 100).toFixed(4)}% of route`;
        valConf.innerHTML = `${state.confidencePct.toFixed(1)} <span class="unit">%</span>`;
        valVx.innerHTML = `${state.forwardVx.toFixed(1)} <span class="unit">m/s</span>`;
        
        valZupt.innerText = state.zuptLocked ? "LOCKED (0.0 m/s)" : "UNLOCKED";
        valZupt.style.color = state.zuptLocked ? "var(--amber-neon)" : "var(--text-main)";
        valZuptProb.innerText = state.zuptProb.toFixed(2);

        let leanRoll = -0.2;
        if (state.vehicleProfile === 'motorcycle' && state.isNavigating && !state.trafficStopActive) {
            leanRoll = Math.sin(performance.now() * 0.002) * 18.0;
        }
        const pitchVal = 1.4 + (state.potholeShock > 0 ? 5.2 : 0);
        valPitch.innerText = `+${pitchVal.toFixed(1)}°`;
        valRoll.innerText = `${leanRoll > 0 ? '+' : ''}${leanRoll.toFixed(1)}°`;
        horizonPitchRoll.style.transform = `translateY(${pitchVal * 2}px) rotate(${leanRoll}deg)`;

        benchNavicore.innerText = `${state.driftErrorM.toFixed(2)} m`;
        benchEkf.innerText = `${(state.driftErrorM * 45 + (state.engineMode === 'DEAD_RECKONING' ? 14.6 + state.ghostDriftM * 0.4 : 0)).toFixed(2)} m`;
        benchDouble.innerText = `${(state.driftErrorM * 240 + (state.engineMode === 'DEAD_RECKONING' ? 172.4 + state.ghostDriftM : 0)).toFixed(2)} m`;

        // Live Proof HUD values
        if (proofCovPos) proofCovPos.innerText = `${(0.0031 + state.driftErrorM * 0.001).toFixed(4)} m²`;
        if (proofSigmaVx) proofSigmaVx.innerText = `±${(0.024 + (state.engineMode === 'DEAD_RECKONING' ? 0.008 : 0)).toFixed(3)} m/s`;
    }

    function renderChart() {
        chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
        if (state.chartData.length < 2) return;

        const w = chartCanvas.width;
        const h = chartCanvas.height;
        const stepX = w / 40;

        chartCtx.strokeStyle = "#8b5cf6";
        chartCtx.lineWidth = 1.5;
        chartCtx.beginPath();
        for (let i = 0; i < state.chartData.length; i++) {
            const x = i * stepX;
            const normAz = ((state.chartData[i].az - 9.81) / 12.0) * (h / 3);
            const y = h / 2 - normAz;
            if (i === 0) chartCtx.moveTo(x, y);
            else chartCtx.lineTo(x, y);
        }
        chartCtx.stroke();

        chartCtx.strokeStyle = "#00f2fe";
        chartCtx.lineWidth = 2.0;
        chartCtx.beginPath();
        for (let i = 0; i < state.chartData.length; i++) {
            const x = i * stepX;
            const normV = (state.chartData[i].vx / 25.0) * (h - 10);
            const y = h - 5 - normV;
            if (i === 0) chartCtx.moveTo(x, y);
            else chartCtx.lineTo(x, y);
        }
        chartCtx.stroke();
    }

    window.addEventListener('load', () => {
        init3DMap();
        requestAnimationFrame(mainAnimationLoop);
    });

})();
