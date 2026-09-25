/**
 * NaviCore AI — Module 1: 3D Vector Map Renderer & Vehicle Layer Engine
 * Smart India Hackathon 2026 | Problem Statement ID: 260168
 */

window.NaviCore = window.NaviCore || {};

var state = {
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
var btnUseLocation = document.getElementById('btn-use-my-location');
var userCoordsPreview = document.getElementById('user-coords-preview');

var floatingSearchBox = document.getElementById('floating-search-box');
var floatingDestInput = document.getElementById('floating-dest-input');
var btnFloatingSearchGo = document.getElementById('btn-floating-search-go');
var floatingAutocompleteList = document.getElementById('floating-autocomplete-list');
var modeChips = document.querySelectorAll('.mode-chip');

var floatingRouteSummary = document.getElementById('floating-route-summary');
var summaryEtaVal = document.getElementById('summary-eta-val');
var summaryDistVal = document.getElementById('summary-dist-val');
var btnQuickStartNav = document.getElementById('btn-quick-start-nav');

var freeLookNotice = document.getElementById('free-look-notice');
var btnRecenterNotice = document.getElementById('btn-recenter-notice');
var btnRecenterFab = document.getElementById('btn-recenter-fab');
var btnProveOfflineFab = document.getElementById('btn-prove-offline-fab');

var proofModalBackdrop = document.getElementById('proof-modal-backdrop');
var btnCloseProofModal = document.getElementById('btn-close-proof-modal');
var btnDoneProofModal = document.getElementById('btn-done-proof-modal');
var btnTriggerInstantBlackout = document.getElementById('btn-trigger-instant-blackout');
var toggleGhostComparison = document.getElementById('toggle-ghost-comparison');

var proofCovPos = document.getElementById('proof-cov-pos');
var proofSigmaVx = document.getElementById('proof-sigma-vx');
var proofBiasAccel = document.getElementById('proof-bias-accel');
var proofBiasGyro = document.getElementById('proof-bias-gyro');

var selectDriveMode = document.getElementById('select-drive-mode');
var selectVehicleProfile = document.getElementById('select-vehicle-profile');
var styleBtns = document.querySelectorAll('.btn-style');

var inputOriginSearch = document.getElementById('input-origin-search');
var btnSearchOrigin = document.getElementById('btn-search-origin');
var originDropdown = document.getElementById('origin-autocomplete-list');

var inputDestSearch = document.getElementById('input-dest-search');
var btnSearchDest = document.getElementById('btn-search-dest');
var destDropdown = document.getElementById('dest-autocomplete-list');

var btnCalcRoute = document.getElementById('btn-calc-route');
var btnDoneNav = document.getElementById('btn-done-nav');
var btnVoiceToggle = document.getElementById('btn-voice-toggle');
var voiceIcon = document.getElementById('voice-icon');
var voiceText = document.getElementById('voice-text');
var btnSpeakStep = document.getElementById('btn-speak-step');
var btnResetNav = document.getElementById('btn-reset-nav');
var btnDockStop = document.getElementById('btn-dock-stop');

var sliderSignal = document.getElementById('slider-gnss-signal');
var badgeSignal = document.getElementById('signal-quality-badge');
var presetBtns = document.querySelectorAll('.btn-preset');

var btnCam3d = document.getElementById('btn-cam-3d');
var btnCamTop = document.getElementById('btn-cam-top');
var btnCamFree = document.getElementById('btn-cam-free');

var navModePill = document.getElementById('nav-mode-pill');
var modeDot = document.getElementById('mode-dot');
var navModeText = document.getElementById('nav-mode-text');
var blackoutTimer = document.getElementById('blackout-timer');

var turnInstruction = document.getElementById('turn-instruction');
var turnDistance = document.getElementById('turn-distance');
var turnSubInstruction = document.getElementById('gmaps-sub-instruction');
var turnIconBox = document.getElementById('turn-icon-box');
var beaconStatus = document.getElementById('beacon-status-label');
var beaconDetail = document.getElementById('beacon-detail-label');

var hudSpeed = document.getElementById('hud-speed');
var hudElevation = document.getElementById('hud-elevation');
var hudHeading = document.getElementById('hud-heading');
var hudSats = document.getElementById('hud-sats');

var dockTimeLeft = document.getElementById('dock-time-left');
var dockDist = document.getElementById('dock-dist');
var dockEtaClock = document.getElementById('dock-eta-clock');

var progressFill = document.getElementById('progress-fill');
var tripProgressText = document.getElementById('trip-progress-text');
var tripPctText = document.getElementById('trip-pct-text');

var valDrift = document.getElementById('val-drift');
var subDriftPct = document.getElementById('sub-drift-pct');
var valConf = document.getElementById('val-confidence');
var valVx = document.getElementById('val-vx');
var valZupt = document.getElementById('val-zupt');
var valZuptProb = document.getElementById('val-zupt-prob');

var horizonPitchRoll = document.getElementById('horizon-pitch-roll');
var valPitch = document.getElementById('val-pitch');
var valRoll = document.getElementById('val-roll');

var benchNavicore = document.getElementById('bench-navicore-drift');
var benchEkf = document.getElementById('bench-ekf-drift');
var benchDouble = document.getElementById('bench-double-drift');

var btnPothole = document.getElementById('btn-inject-pothole');
var toggleTrafficStop = document.getElementById('toggle-traffic-stop');

var chartCanvas = document.getElementById('telemetry-chart');
var chartCtx = chartCanvas.getContext('2d');

var map, vehicleMarkerEl, vehicleMarker, ghostMarkerEl, ghostMarker, originMarker, destMarker;
var audioCtx = null;
var cachedVoices = [];

// Map Styles (100% Free Vector & Raster Styles)
var MAP_STYLES = {
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

