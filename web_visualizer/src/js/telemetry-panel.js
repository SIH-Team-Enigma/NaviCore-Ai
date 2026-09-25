/**
 * NaviCore AI — Module 2: Telemetry Panel, Voice Guidance & Route Engine
 * Smart India Hackathon 2026 | Problem Statement ID: 260168
 */

window.NaviCore = window.NaviCore || {};

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
// =========================================================================
// 2. COMPREHENSIVE ALL-INDIA CITIES & TOWNS GAZETTEER DATABASE
// =========================================================================
var INDIAN_CITIES_GAZETTEER = [
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
