import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    limit, 
    getDocs, 
    serverTimestamp,
    doc,
    getDocFromServer,
    onSnapshot,
    setDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Test connection
async function testConnection() {
    try {
        await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
            console.warn("Firestore is operating in offline mode.");
        }
    }
}
testConnection();

// Global Announcement Listener
onSnapshot(doc(db, "announcements", "global"), (doc) => {
    const banner = document.getElementById('announcement-banner');
    if (doc.exists() && doc.data().active) {
        banner.innerText = doc.data().message;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
});

// Admin Detection
onAuthStateChanged(auth, (user) => {
    const adminBtn = document.getElementById('admin-panel-btn');
    const loginLink = document.getElementById('admin-login-link');
    if (user && user.email === "nineteenp2@gmail.com") {
        adminBtn.style.display = 'block';
        if (loginLink) loginLink.style.display = 'none';
    } else {
        adminBtn.style.display = 'none';
        if (loginLink) loginLink.style.display = 'block';
    }
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 400;

// --- 1. SETTINGS & VARIABLES ---
let mobileMode = localStorage.getItem('platformer_mobile') === 'true';
let sfxEnabled = localStorage.getItem('platformer_sfx') !== 'false';

// --- AUDIO SYSTEM ---
class SoundEngine {
    constructor() {
        this.ctx = null;
    }
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    play(freq, duration, type = 'sine', volume = 0.1, ramp = true) {
        if (!sfxEnabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (ramp) {
            osc.frequency.exponentialRampToValueAtTime(freq * 0.01, this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    jump() { this.play(500, 0.15, 'sine', 0.12); }
    land() { this.play(100, 0.1, 'triangle', 0.1, false); }
    death() { this.play(200, 0.4, 'sawtooth', 0.1); }
    portal() { this.play(800, 0.2, 'square', 0.06); }
    click() { this.play(1000, 0.05, 'sine', 0.1, false); }
    win() {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => {
            setTimeout(() => this.play(f, 0.3, 'sine', 0.1), i * 100);
        });
    }
}
const sfx = new SoundEngine();

const gravity = 2200;    
const friction = 0.001;  
const jumpForce = -750; 
const moveSpeed = 450;   
const acceleration = 2500; 
const coyoteTime = 0.25; // Seconds of coyote time

// --- JUICE & POLISH ---
let particles = [];
let trails = [];
let screenShake = 0;
let shakeTime = 0;

function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 400,
            vy: (Math.random() - 0.5) * 400,
            life: 0.5 + Math.random() * 0.5,
            color,
            size: 2 + Math.random() * 4
        });
    }
}

function addTrail(x, y, w, h, color) {
    trails.push({ x, y, w, h, color, life: 0.3 });
}

function setShake(amount, duration) {
    screenShake = amount;
    shakeTime = duration;
}

let lastTime = 0; 
let gameTime = 0; 
const keys = {}; 
const touchKeys = { left: false, right: false, jump: false };

// Speedrun Timer
let startTime = 0;
let elapsedTime = 0;
let timerRunning = false;
let timerFinished = false;
let dialogueActive = false;
let currentNpc = null;

function formatTime(ms) {
    let minutes = Math.floor(ms / 60000);
    let seconds = Math.floor((ms % 60000) / 1000);
    let centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

// --- HELPER FOR ROTATED COLLISION ---
function getRotatedOverlap(p, obj) {
    const angle = (obj.currentAngle || 0) * (Math.PI / 180);
    const cx = obj.currentX + obj.width / 2;
    const cy = obj.currentY + obj.height / 2;

    const pCorners = [
        { x: p.x, y: p.y },
        { x: p.x + p.width, y: p.y },
        { x: p.x, y: p.y + p.height },
        { x: p.x + p.width, y: p.y + p.height }
    ];

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = obj.width / 2;
    const hh = obj.height / 2;

    const oCorners = [
        { x: cx + (-hw) * cos - (-hh) * sin, y: cy + (-hw) * sin + (-hh) * cos },
        { x: cx + (hw) * cos - (-hh) * sin, y: cy + (hw) * sin + (-hh) * cos },
        { x: cx + (hw) * cos - (hh) * sin, y: cy + (hw) * sin + (hh) * cos },
        { x: cx + (-hw) * cos - (hh) * sin, y: cy + (-hw) * sin + (hh) * cos }
    ];

    const axes = [
        { x: 1, y: 0 }, { x: 0, y: 1 },
        { x: cos, y: sin }, { x: -sin, y: cos }
    ];

    let minOverlap = Infinity;
    let overlapAxis = { x: 0, y: 0 };

    for (const axis of axes) {
        let minP = Infinity, maxP = -Infinity;
        for (const pt of pCorners) {
            const proj = pt.x * axis.x + pt.y * axis.y;
            minP = Math.min(minP, proj);
            maxP = Math.max(maxP, proj);
        }
        let minO = Infinity, maxO = -Infinity;
        for (const pt of oCorners) {
            const proj = pt.x * axis.x + pt.y * axis.y;
            minO = Math.min(minO, proj);
            maxO = Math.max(maxO, proj);
        }
        const overlap = Math.min(maxP, maxO) - Math.max(minP, minO);
        if (overlap < 0) return null;
        if (overlap < minOverlap) {
            minOverlap = overlap;
            overlapAxis = axis;
        }
    }

    const centerDist = { x: (p.x + p.width / 2) - cx, y: (p.y + p.height / 2) - cy };
    if (centerDist.x * overlapAxis.x + centerDist.y * overlapAxis.y < 0) {
        overlapAxis.x = -overlapAxis.x;
        overlapAxis.y = -overlapAxis.y;
    }
    return { x: overlapAxis.x * minOverlap, y: overlapAxis.y * minOverlap };
}

// 2. PLAYER DEFINITION
const player = {
    x: 50,
    y: 300,
    width: 30,
    height: 30,
    velX: 0,
    velY: 0,
    jumping: false,
    coyoteCounter: 0,
    color: '#00d2ff'
};

// 3. THE LEVEL DATABASE
const LEVEL_DATABASE = [
    [
        {"x":0,"y":380,"width":800,"height":20,"type":"PLATFORM"},{"x":50,"y":330,"width":30,"height":30,"type":"SPAWN"},{"x":700,"y":300,"width":50,"height":80,"type":"GOAL"},{"x":391.5,"y":254.1875,"width":51,"height":131,"type":"PLATFORM"},{"x":271.5,"y":313.1875,"width":60,"height":25,"type":"PLATFORM"}
    ],
     [
        {"x":0,"y":380,"width":800,"height":20,"type":"PLATFORM"},
        {"x":2.5,"y":347.1875,"width":805,"height":59,"type":"SPIKE"},
        {"x":38.5,"y":148.1875,"width":34,"height":27,"type":"SPAWN"},
        {"x":7.5,"y":181.1875,"width":106,"height":57,"type":"PLATFORM"},
        {"x":183.5,"y":189.1875,"width":42,"height":22,"type":"PLATFORM"},
        {"x":318.5,"y":253.1875,"width":42,"height":32,"type":"PLATFORM"},
        {"x":426.5,"y":318.1875,"width":70,"height":16,"type":"PLATFORM"},
        {"x":587.5,"y":253.1875,"width":55,"height":29,"type":"PLATFORM"},
       {"x":670.5,"y":173.1875,"width":127,"height":18,"type":"PLATFORM"},
        {"x":770.5,"y":142.1875,"width":30,"height":33,"type":"GOAL"}
    ],
    [
        {"x":0,"y":380,"width":800,"height":20,"type":"PLATFORM"},
        {"x":173.5,"y":107.1875,"width":483,"height":23,"type":"SPIKE","tx":172.5,"ty":356.1875,"isMoving":true},
        {"x":743.5,"y":309.1875,"width":58,"height":68,"type":"GOAL"},
        {"x":5.5,"y":350.1875,"width":41,"height":22,"type":"SPAWN"}
    ],
    [
        {"x":33.5,"y":311.1875,"width":83,"height":38,"type":"PLATFORM"},
     {"x":203.5,"y":328.1875,"width":53,"height":27,"type":"PLATFORM","tx":202.5,"ty":182.1875,"isMoving":true},
        {"x":321.5,"y":181.1875,"width":74,"height":31,"type":"PLATFORM","tx":319.5,"ty":325.1875,"isMoving":true},
        {"x":471.5,"y":342.1875,"width":47,"height":22,"type":"PLATFORM","tx":470.5,"ty":179.1875,"isMoving":true},
        {"x":639.5,"y":330.1875,"width":73,"height":37,"type":"PLATFORM","tx":637.5,"ty":95.1875,"isMoving":true},
        {"x":648.5,"y":22.1875,"width":69,"height":59,"type":"GOAL"},
        {"x":40.5,"y":278.1875,"width":39,"height":33,"type":"SPAWN"},
        {"x":5.5,"y":395.1875,"width":800,"height":12,"type":"SPIKE"}
    ], 
    [{"x":0,"y":-15,"width":800,"height":20,"type":"PLATFORM","angle":0,"currentX":0,"currentY":-15,"currentAngle":0},{"x":5.5,"y":45.1875,"width":84,"height":17,"type":"PLATFORM","currentX":5.5,"currentY":45.1875,"currentAngle":0},{"x":200.5,"y":-12.8125,"width":20,"height":59,"type":"PLATFORM","currentX":200.5,"currentY":-12.8125,"currentAngle":0},{"x":22.5,"y":6.1875,"width":19,"height":22,"type":"SPAWN","currentX":22.5,"currentY":6.1875,"currentAngle":0},{"x":-0.5,"y":148.1875,"width":147,"height":25,"type":"SPIKE","currentX":-0.5,"currentY":148.1875,"currentAngle":0},{"x":144.5,"y":149.1875,"width":74,"height":29,"type":"SPIKE","currentX":144.5,"currentY":149.1875,"currentAngle":0},{"x":-0.5,"y":162.1875,"width":238,"height":62,"type":"PLATFORM","currentX":-0.5,"currentY":162.1875,"currentAngle":0},{"x":184.5,"y":94.1875,"width":180,"height":131,"type":"PLATFORM","currentX":184.5,"currentY":94.1875,"currentAngle":0},{"x":409.5,"y":-0.8125,"width":15,"height":228,"type":"PLATFORM","currentX":409.5,"currentY":-0.8125,"currentAngle":0},{"x":356.5,"y":326.1875,"width":70,"height":22,"type":"SPIKE","currentX":356.5,"currentY":326.1875,"currentAngle":0},{"x":199.5,"y":324.1875,"width":191,"height":21,"type":"PLATFORM","currentX":199.5,"currentY":324.1875,"currentAngle":0},{"x":6.5,"y":393.1875,"width":794,"height":14,"type":"PLATFORM","currentX":6.5,"currentY":393.1875,"currentAngle":0},{"x":-0.5,"y":217.1875,"width":35,"height":190,"type":"PLATFORM","currentX":-0.5,"currentY":217.1875,"currentAngle":0},{"x":417.5,"y":219.1875,"width":7,"height":107,"type":"SPIKE","currentX":417.5,"currentY":219.1875,"currentAngle":0},{"x":416.5,"y":218.1875,"width":265,"height":8,"type":"PLATFORM","currentX":416.5,"currentY":218.1875,"currentAngle":0},{"x":484.5,"y":350.1875,"width":30,"height":12,"type":"PLATFORM","currentX":484.5,"currentY":350.1875,"currentAngle":0},{"x":582.5,"y":305.1875,"width":50,"height":47,"type":"PLATFORM","currentX":582.5,"currentY":305.1875,"currentAngle":0},{"x":709.5,"y":288.1875,"width":79,"height":11,"type":"PLATFORM","currentX":709.5,"currentY":288.1875,"currentAngle":0},{"x":593.5,"y":4.1875,"width":9,"height":82,"type":"PLATFORM","currentX":593.5,"currentY":4.1875,"currentAngle":0},{"x":590.5,"y":-0.8125,"width":211,"height":9,"type":"PLATFORM","currentX":590.5,"currentY":-0.8125,"currentAngle":0},{"x":599.5,"y":78.1875,"width":142,"height":8,"type":"PLATFORM","currentX":599.5,"currentY":78.1875,"currentAngle":0},{"x":743.5,"y":80.1875,"width":58,"height":7,"type":"PLATFORM","tx":683.5,"ty":79.1875,"isMoving":true,"currentX":687.1067640458604,"currentY":79.24761273409767,"currentAngle":0},{"x":613.5,"y":24.1875,"width":31,"height":26,"type":"GOAL","currentX":613.5,"currentY":24.1875,"currentAngle":0},{"x":654.5,"y":134.1875,"width":100,"height":20,"type":"PLATFORM","currentX":654.5,"currentY":134.1875,"currentAngle":0},{"x":442.5,"y":110.1875,"width":62,"height":17,"type":"PLATFORM","currentX":442.5,"currentY":110.1875,"currentAngle":0},{"x":451.5,"y":55.1875,"width":6,"height":37,"type":"PLATFORM","currentX":451.5,"currentY":55.1875,"currentAngle":0},{"x":454.5,"y":55.1875,"width":20,"height":9,"type":"PLATFORM","currentX":454.5,"currentY":55.1875,"currentAngle":0},{"x":468.5,"y":62.1875,"width":9,"height":12,"type":"PLATFORM","currentX":468.5,"currentY":62.1875,"currentAngle":0},{"x":455.5,"y":73.1875,"width":17,"height":9,"type":"PLATFORM","currentX":455.5,"currentY":73.1875,"currentAngle":0},{"x":471.5,"y":78.1875,"width":9,"height":14,"type":"PLATFORM","currentX":471.5,"currentY":78.1875,"currentAngle":0},{"x":488.5,"y":57.1875,"width":23,"height":6,"type":"PLATFORM","currentX":488.5,"currentY":57.1875,"currentAngle":0},{"x":492.5,"y":83.1875,"width":20,"height":7,"type":"PLATFORM","currentX":492.5,"currentY":83.1875,"currentAngle":0},{"x":497.5,"y":61.1875,"width":9,"height":25,"type":"PLATFORM","currentX":497.5,"currentY":61.1875,"currentAngle":0},{"x":533.5,"y":64.1875,"width":6,"height":26,"type":"PLATFORM","currentX":533.5,"currentY":64.1875,"currentAngle":0},{"x":533.5,"y":58.1875,"width":20,"height":11,"type":"PLATFORM","currentX":533.5,"currentY":58.1875,"currentAngle":0},{"x":538.5,"y":75.1875,"width":13,"height":6,"type":"PLATFORM","currentX":538.5,"currentY":75.1875,"currentAngle":0},{"x":549.5,"y":70.1875,"width":7,"height":11,"type":"PLATFORM","currentX":549.5,"currentY":70.1875,"currentAngle":0},{"x":550.5,"y":67.1875,"width":7,"height":8,"type":"PLATFORM","currentX":550.5,"currentY":67.1875,"currentAngle":0},{"x":26.5,"y":223.1875,"width":20,"height":175,"type":"SPIKE","currentX":26.5,"currentY":223.1875,"currentAngle":0},{"x":469.5,"y":384.1875,"width":337,"height":21,"type":"SPIKE","currentX":469.5,"currentY":384.1875,"currentAngle":0},{"x":325.5,"y":76.1875,"width":16,"height":18,"type":"PORTAL_SHRINK","currentX":218.5,"currentY":308.1875,"currentAngle":0}],

[
    {"x":0,"y":380,"width":800,"height":20,"type":"PLATFORM"},{"x":225,"y":139.1875,"width":70,"height":244,"type":"PLATFORM"},{"x":523,"y":70.1875,"width":80,"height":315,"type":"PLATFORM"},{"x":192,"y":298.1875,"width":41,"height":23,"type":"PLATFORM"},{"x":191,"y":223.1875,"width":38,"height":25,"type":"PLATFORM"},{"x":193,"y":160.1875,"width":45,"height":25,"type":"PLATFORM"},{"x":450.875,"y":69.9140625,"width":74,"height":20,"type":"PLATFORM","tx":448.875,"ty":379.9140625,"isMoving":true},{"x":500,"y":283.9971618652344,"width":29,"height":37,"type":"PLATFORM"},{"x":459,"y":201.99716186523438,"width":32,"height":32,"type":"PLATFORM"},{"x":500,"y":122.99716186523438,"width":33,"height":42,"type":"PLATFORM"},{"x":542.75,"y":64.671875,"width":45,"height":6,"type":"SPIKE","tx":542.75,"ty":71.671875,"isMoving":true},{"x":12.75,"y":329.671875,"width":24,"height":19,"type":"SPAWN"},{"x":260.75,"y":126.671875,"width":36,"height":15,"type":"PORTAL_SHRINK"},{"x":602.75,"y":361.671875,"width":200,"height":46,"type":"SPIKE"},{"x":694.75,"y":24.671875,"width":45,"height":40,"type":"GOAL"},{"x":527.75,"y":62.671875,"width":13,"height":9,"type":"PORTAL_NORMAL"}
    ],


[
    {"x":0,"y":380,"width":800,"height":20,"type":"SPIKE","angle":0},{"x":5.5,"y":209.1875,"width":59,"height":23,"type":"PLATFORM"},{"x":186.5,"y":208.1875,"width":376,"height":22,"type":"PLATFORM","spinSpeed":56,"isSpinning":true},{"x":678.5,"y":211.1875,"width":57,"height":18,"type":"PLATFORM"},{"x":30.5,"y":182.1875,"width":16,"height":15,"type":"SPAWN"},{"x":734.5,"y":157.1875,"width":37,"height":37,"type":"GOAL"}
]  
];

let currentLevelIndex = 0;
let worldObjects = [];
let spawnPoint = { x: 50, y: 300 };
let gameState = 'TITLE'; // TITLE, PLAYING

// --- CONTROLS CONFIG ---
let controls = {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    jump: 'Space',
    reset: 'KeyR',
    interact: 'KeyE'
};

// Load controls from local storage
const savedControls = localStorage.getItem('platformer_controls');
if (savedControls) {
    try {
        controls = JSON.parse(savedControls);
    } catch (e) {
        console.error("Failed to parse saved controls", e);
    }
}

let remappingKey = null;

function remapKey(action) {
    remappingKey = action;
    const btn = document.getElementById(`key-${action}`);
    btn.innerText = 'Press any key...';
    btn.classList.add('waiting');
}

function saveControls() {
    localStorage.setItem('platformer_controls', JSON.stringify(controls));
}

// --- UI MANAGEMENT ---
function toggleMobileMode() {
    mobileMode = !mobileMode;
    localStorage.setItem('platformer_mobile', mobileMode);
    updateSettingsUI();
    sfx.click();
}

function toggleSFX() {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('platformer_sfx', sfxEnabled);
    updateSettingsUI();
    if (sfxEnabled) sfx.click();
}

function updateSettingsUI() {
    const mobileBtn = document.getElementById('toggle-mobile');
    const sfxBtn = document.getElementById('toggle-sfx');
    const touchControls = document.getElementById('touch-controls');

    if (mobileBtn) {
        mobileBtn.innerText = mobileMode ? 'ON' : 'OFF';
        mobileBtn.className = mobileMode ? 'active' : '';
    }
    if (sfxBtn) {
        sfxBtn.innerText = sfxEnabled ? 'ON' : 'OFF';
        sfxBtn.className = sfxEnabled ? 'active' : '';
    }
    if (touchControls) {
        touchControls.style.display = (mobileMode && gameState === 'PLAYING') ? 'flex' : 'none';
    }
}

function startGame() {
    gameState = 'PLAYING';
    dialogueActive = false;
    document.getElementById('dialogue-box').style.display = 'none';
    document.getElementById('interaction-prompt').style.display = 'none';
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('controls-screen').style.display = 'none';
    document.getElementById('leaderboard-screen').style.display = 'none';
    document.getElementById('win-screen').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    updateSettingsUI();
    sfx.click();
    
    // Reset timer state but wait for movement
    timerRunning = false;
    timerFinished = false;
    elapsedTime = 0;
    document.getElementById('timer-display').innerText = "00:00.00";
    
    initLevel();
}

function resetRun(backToMenu = true) {
    dialogueActive = false;
    document.getElementById('dialogue-box').style.display = 'none';
    document.getElementById('interaction-prompt').style.display = 'none';
    if (backToMenu) {
        gameState = 'TITLE';
        currentLevelIndex = 0;
        timerRunning = false;
        timerFinished = false;
        elapsedTime = 0;
        document.getElementById('title-screen').style.display = 'flex';
        document.getElementById('controls-screen').style.display = 'none';
        document.getElementById('leaderboard-screen').style.display = 'none';
        document.getElementById('win-screen').style.display = 'none';
        document.getElementById('ui').style.display = 'none';
    } else {
        // Auto-play: Reset run but keep level at 0 and start immediately
        currentLevelIndex = 0;
        startGame();
    }
}

function showControls() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('controls-screen').style.display = 'flex';
    document.getElementById('leaderboard-screen').style.display = 'none';
    updateSettingsUI();
    // Update button labels
    for (let action in controls) {
        document.getElementById(`key-${action}`).innerText = controls[action];
    }
}

function showTitle() {
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('controls-screen').style.display = 'none';
    document.getElementById('leaderboard-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'flex';
    loadAdminScores();
}

async function loadAdminScores() {
    const list = document.getElementById('admin-highscore-list');
    list.innerHTML = '<p>Loading scores...</p>';
    try {
        const q = query(collection(db, "highscores"), orderBy("time", "asc"), limit(50));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            list.innerHTML = '<p>No scores found.</p>';
            return;
        }
        list.innerHTML = '';
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '5px';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            row.innerHTML = `
                <span>${data.userName} - ${formatTime(data.time)}</span>
                <button onclick="deleteScore('${docSnap.id}')" style="padding: 2px 8px; font-size: 10px; background: #ff4757; box-shadow: 0 2px #c0392b;">Delete</button>
            `;
            list.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p>Error loading scores.</p>';
    }
}

async function deleteScore(docId) {
    if (!confirm("Are you sure you want to delete this score?")) return;
    try {
        await deleteDoc(doc(db, "highscores", docId));
        alert("Score deleted.");
        loadAdminScores(); // Refresh list
    } catch (e) {
        console.error(e);
        alert("Failed to delete score. Permission denied?");
    }
}

async function postAnnouncement() {
    const input = document.getElementById('announcement-input');
    const message = input.value.trim();
    if (!message) return;

    try {
        await setDoc(doc(db, "announcements", "global"), {
            message: message,
            active: true,
            createdAt: serverTimestamp()
        });
        alert("Announcement posted!");
    } catch (e) {
        console.error(e);
        alert("Permission denied. Only the admin can post.");
    }
}

async function clearAnnouncement() {
    try {
        await setDoc(doc(db, "announcements", "global"), {
            message: "",
            active: false,
            createdAt: serverTimestamp()
        });
        document.getElementById('announcement-input').value = "";
        alert("Announcement cleared.");
    } catch (e) {
        console.error(e);
        alert("Permission denied.");
    }
}

async function adminLogin() {
    try {
        await signInWithPopup(auth, provider);
    } catch (e) {
        console.error(e);
        alert("Login failed.");
    }
}

async function showLeaderboard() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('leaderboard-screen').style.display = 'flex';
    const list = document.getElementById('highscore-list');
    list.innerHTML = '<p>Loading...</p>';

    try {
        // Fetch a larger batch to account for duplicates
        const q = query(collection(db, "highscores"), orderBy("time", "asc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            list.innerHTML = '<p>No scores yet! Be the first!</p>';
            return;
        }

        list.innerHTML = '';
        const uniqueNames = new Set();
        let displayCount = 0;

        querySnapshot.forEach((doc) => {
            if (displayCount >= 5) return;

            const data = doc.data();
            const normalizedName = data.userName.trim().toLowerCase();

            // Only add if we haven't seen this name (case-insensitive) in this leaderboard view
            if (!uniqueNames.has(normalizedName)) {
                uniqueNames.add(normalizedName);
                displayCount++;

                const row = document.createElement('div');
                row.innerHTML = `
                    <span>${displayCount}. ${data.userName}</span>
                    <span>${formatTime(data.time)}</span>
                `;
                list.appendChild(row);
            }
        });

        if (displayCount === 0) {
            list.innerHTML = '<p>No scores yet! Be the first!</p>';
        }
    } catch (e) {
        console.error("Error loading scores:", e);
        list.innerHTML = '<p>Error loading scores.</p>';
    }
}

async function submitScore() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim();
    const btn = document.getElementById('submit-score-btn');

    if (!name) {
        alert("Please enter your name!");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Signing in...";

    try {
        // If not signed in, prompt Google Login
        if (!auth.currentUser) {
            await signInWithPopup(auth, provider);
        }

        btn.innerText = "Submitting...";

        await addDoc(collection(db, "highscores"), {
            userId: auth.currentUser.uid,
            userName: name,
            time: elapsedTime,
            createdAt: serverTimestamp()
        });
        alert("Score submitted!");
        resetRun();
    } catch (e) {
        console.error("Error submitting score:", e);
        
        let msg = "Error submitting score.";
        if (e.code === 'auth/popup-blocked') {
            msg = "Login popup blocked. Please allow popups and try again.";
        } else if (e.code === 'permission-denied') {
            msg = "Permission denied. Check Firestore rules.";
        }
        
        alert(msg);
        btn.disabled = false;
        btn.innerText = "Submit Score";
    }
}

// --- PORTAL LOGIC ---
function setPlayerSize(newSize) {
    if (player.width === newSize) return; 
    sfx.portal();
    setShake(5, 0.15);
    spawnParticles(player.x + player.width/2, player.y + player.height/2, player.color, 15);
    let heightDiff = newSize - player.height;
    player.width = newSize;
    player.height = newSize;
    player.y -= heightDiff; 
}

// --- NPC & DIALOGUE ---
function openDialogue(text) {
    if (!text) return;
    dialogueActive = true;
    document.getElementById('dialogue-text').innerText = text;
    document.getElementById('dialogue-box').style.display = 'flex';
    sfx.click();
}

function closeDialogue() {
    dialogueActive = false;
    document.getElementById('dialogue-box').style.display = 'none';
    sfx.click();
}

// 4. LEVEL LOGIC
function initLevel() {
    worldObjects = LEVEL_DATABASE[currentLevelIndex];
    document.getElementById('level-display').innerText = currentLevelIndex + 1;
    const spawn = worldObjects.find(o => o.type === 'SPAWN');
    if (spawn) {
        spawnPoint = { x: spawn.x, y: spawn.y };
    }
    respawn();
}

function respawn() {
    sfx.death();
    setShake(10, 0.2);
    spawnParticles(player.x + player.width/2, player.y + player.height/2, player.color, 25);
    player.x = spawnPoint.x;
    player.y = spawnPoint.y;
    player.width = 30; 
    player.height = 30;
    player.velX = 0;
    player.velY = 0;
    player.jumping = false;
}

function nextLevel() {
    currentLevelIndex++;
    if (currentLevelIndex < LEVEL_DATABASE.length) {
        sfx.portal();
        initLevel();
    } else {
        sfx.win();
        timerRunning = false;
        timerFinished = true;
        gameState = 'WIN';
        document.getElementById('ui').style.display = 'none';
        document.getElementById('win-screen').style.display = 'flex';
        document.getElementById('final-time-text').innerText = `Final Time: ${formatTime(elapsedTime)}`;
        document.getElementById('player-name-input').value = '';
        document.getElementById('submit-score-btn').disabled = false;
        document.getElementById('submit-score-btn').innerText = "Submit Score";
    }
}

// 5. INPUT LISTENERS
window.addEventListener('keydown', (e) => {
    if (remappingKey) {
        controls[remappingKey] = e.code;
        const btn = document.getElementById(`key-${remappingKey}`);
        btn.innerText = e.code;
        btn.classList.remove('waiting');
        remappingKey = null;
        saveControls(); // Save after remap
        return;
    }

    keys[e.code] = true;
    if (e.key === '\\') {
        window.location.href = 'editor.html';
    }
    if (e.key === 'Escape') {
        resetRun(true);
    }
    if (e.code === controls.reset && (gameState === 'PLAYING' || gameState === 'WIN')) {
        resetRun(false);
    }
    if (e.code === controls.interact && gameState === 'PLAYING') {
        if (dialogueActive) {
            closeDialogue();
        } else if (currentNpc) {
            openDialogue(currentNpc.dialogue);
        }
    }
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

// Touch Listeners
function setupTouchEvents() {
    const attach = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchKeys[key] = true;
            sfx.init(); // Initialize audio on first interaction
        });
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            touchKeys[key] = false;
        });
        el.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            touchKeys[key] = false;
        });
    };
    attach('touch-left', 'left');
    attach('touch-right', 'right');
    attach('touch-jump', 'jump');
}
setupTouchEvents();
updateSettingsUI();

// 6. GAME ENGINE
function update(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000; 
    lastTime = timestamp;

    if (gameState !== 'PLAYING') {
        requestAnimationFrame(update);
        return;
    }

    if (dialogueActive) {
        lastTime = timestamp;
        requestAnimationFrame(update);
        return;
    }

    if (dt > 0.1) dt = 0.1;
    gameTime += dt * 2; 

    // --- 1. UPDATE PLATFORM POSITIONS & ROTATION ---
    worldObjects.forEach(obj => {
        if (obj.isMoving) {
            obj.oldX = obj.currentX || obj.x;
            obj.oldY = obj.currentY || obj.y;
            // Use moveSpeed as a frequency multiplier (default 1)
            let progress = (Math.sin(gameTime * (obj.moveSpeed || 1)) + 1) / 2;
            obj.currentX = obj.x + (obj.tx - obj.x) * progress;
            obj.currentY = obj.y + (obj.ty - obj.y) * progress;
        } else {
            obj.currentX = obj.x;
            obj.currentY = obj.y;
        }

        if (obj.isSpinning) {
            obj.currentAngle = (obj.currentAngle || 0) + (obj.spinSpeed || 0) * dt;
        } else {
            obj.currentAngle = obj.angle || 0;
        }
    });

    // Update Particles
    particles = particles.filter(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        return p.life > 0;
    });

    // Update Trails
    trails = trails.filter(t => {
        t.life -= dt;
        return t.life > 0;
    });

    // Update Shake
    if (shakeTime > 0) {
        shakeTime -= dt;
    } else {
        screenShake = 0;
    }

    // --- 2. TIMER ---
    if (!timerRunning && !timerFinished) {
        if (keys[controls.jump] || keys[controls.left] || keys[controls.right] || touchKeys.jump || touchKeys.left || touchKeys.right) {
            startTime = Date.now();
            timerRunning = true;
        }
    }
    if (timerRunning) {
        elapsedTime = Date.now() - startTime;
        document.getElementById('timer-display').innerText = formatTime(elapsedTime);
    }

    // --- 3. INPUTS & PHYSICS ---
    currentNpc = null;
    document.getElementById('interaction-prompt').style.display = 'none';

    worldObjects.forEach(obj => {
        if (obj.type === 'NPC') {
            const dx = (player.x + player.width/2) - (obj.currentX + obj.width/2);
            const dy = (player.y + player.height/2) - (obj.currentY + obj.height/2);
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 100) {
                currentNpc = obj;
                const prompt = document.getElementById('interaction-prompt');
                prompt.style.display = 'block';
                // Position prompt above NPC (relative to game-container)
                prompt.style.left = (obj.currentX + obj.width / 2) + 'px';
                prompt.style.top = (obj.currentY - 30) + 'px';
            }
        }
    });

    if ((keys[controls.jump] || touchKeys.jump) && player.coyoteCounter > 0) {
        player.velY = jumpForce;
        player.jumping = true;
        player.coyoteCounter = 0; // Use up coyote time immediately
        sfx.jump();
    }
    
    player.coyoteCounter -= dt;
    
    if (keys[controls.left] || touchKeys.left) {
        player.velX -= acceleration * dt;
        addTrail(player.x, player.y, player.width, player.height, player.color);
    } else if (keys[controls.right] || touchKeys.right) {
        player.velX += acceleration * dt;
        addTrail(player.x, player.y, player.width, player.height, player.color);
    } else {
        player.velX *= Math.pow(friction, dt);
    }

    player.velY += gravity * dt;

    if (player.velX > moveSpeed) player.velX = moveSpeed;
    if (player.velX < -moveSpeed) player.velX = -moveSpeed;

    // --- 4. Y-AXIS MOVE & COLLISION ---
    player.y += player.velY * dt; 
    
    worldObjects.forEach(obj => {
        if ((obj.currentAngle || 0) % 360 !== 0) {
            const overlap = getRotatedOverlap(player, obj);
            if (overlap) {
                if (obj.type === 'PLATFORM') {
                    if (obj.isSpinning) {
                        const cx = obj.currentX + obj.width / 2;
                        const cy = obj.currentY + obj.height / 2;
                        const rx = (player.x + player.width / 2) - cx;
                        const ry = (player.y + player.height / 2) - cy;
                        const deltaAngle = (obj.spinSpeed || 0) * dt * (Math.PI / 180);
                        player.x += (rx * Math.cos(deltaAngle) - ry * Math.sin(deltaAngle)) - rx;
                        player.y += (rx * Math.sin(deltaAngle) + ry * Math.cos(deltaAngle)) - ry;
                    }
                    const finalOverlap = getRotatedOverlap(player, obj);
                    if (finalOverlap) {
                        player.x += finalOverlap.x;
                        player.y += finalOverlap.y;
                        if (Math.abs(finalOverlap.y) > Math.abs(finalOverlap.x)) {
                            if (finalOverlap.y < 0) {
                                player.jumping = false;
                                player.coyoteCounter = coyoteTime;
                                player.velY = 0;
                            } else {
                                player.velY = 0;
                            }
                        } else {
                            player.velX = 0;
                        }
                    }
                }
                else if (obj.type === 'SPIKE') respawn();
                else if (obj.type === 'GOAL') nextLevel();
                else if (obj.type === 'PORTAL_SHRINK') setPlayerSize(15);
                else if (obj.type === 'PORTAL_NORMAL') setPlayerSize(30);
                else if (obj.type === 'PORTAL_GROW') setPlayerSize(45);
            }
        } else {
            const physX = obj.currentX;
            const physY = obj.currentY;
            if (player.x < physX + obj.width && player.x + player.width > physX &&
                player.y < physY + obj.height && player.y + player.height > physY) {
                if (obj.type === 'PLATFORM') {
                    if (player.velY >= 0 && (player.y + player.height) - (player.velY * dt) <= physY + 10) { 
                        if (player.jumping) {
                            spawnParticles(player.x + player.width/2, physY, '#fff', 5);
                            sfx.land();
                        }
                        player.jumping = false;
                        player.coyoteCounter = coyoteTime;
                        player.velY = 0;
                        player.y = physY - player.height;
                        if (obj.isMoving) player.y += (obj.currentY - obj.oldY);
                    } 
                    else if (player.velY < 0 && player.y - (player.velY * dt) >= physY + obj.height - 10) {
                        player.velY = 0;
                        player.y = physY + obj.height;
                    }
                } 
                else if (obj.type === 'SPIKE') respawn();
                else if (obj.type === 'GOAL') nextLevel();
                else if (obj.type === 'PORTAL_SHRINK') setPlayerSize(15);
                else if (obj.type === 'PORTAL_NORMAL') setPlayerSize(30);
                else if (obj.type === 'PORTAL_GROW') setPlayerSize(45);
            }
        }
    });

    // --- 5. X-AXIS MOVE & COLLISION ---
    player.x += player.velX * dt;
    
    worldObjects.forEach(obj => {
        if ((obj.currentAngle || 0) % 360 === 0) {
            const physX = obj.currentX;
            const physY = obj.currentY;
            if (obj.isMoving && !player.jumping && 
                player.x < physX + obj.width && player.x + player.width > physX &&
                player.y + player.height >= physY - 5 && player.y + player.height <= physY + 10) {
                player.x += (obj.currentX - obj.oldX);
            }
            if (player.x < physX + obj.width && player.x + player.width > physX &&
                player.y < physY + obj.height && player.y + player.height > physY) {
                if (obj.type === 'PLATFORM') {
                    if (player.y + player.height > physY + 5) {
                        if (player.velX > 0) { player.x = physX - player.width; player.velX = 0; }
                        else if (player.velX < 0) { player.x = physX + obj.width; player.velX = 0; }
                    }
                } else if (obj.type === 'SPIKE') respawn();
                else if (obj.type === 'GOAL') nextLevel();
            }
        }
    });

    if (player.x < 0) player.x = 0;
    if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;

    draw();
    requestAnimationFrame(update);
}

// 7. DRAWING FUNCTION
function draw() {
    ctx.save();
    
    // Background Grid
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Apply Shake
    if (shakeTime > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    }

    // Draw Trails
    trails.forEach(t => {
        ctx.globalAlpha = t.life * 2;
        ctx.fillStyle = t.color;
        ctx.fillRect(t.x, t.y, t.w, t.h);
    });
    ctx.globalAlpha = 1;
    
    worldObjects.forEach(obj => {
        ctx.save();
        ctx.translate(obj.currentX + obj.width / 2, obj.currentY + obj.height / 2);
        ctx.rotate((obj.currentAngle || 0) * Math.PI / 180);
        
        let color = '#fff';
        let glow = false;
        
        if (obj.type === 'PLATFORM') {
            color = '#2f3542';
            ctx.strokeStyle = '#3f4552';
            ctx.lineWidth = 1;
        }
        else if (obj.type === 'SPIKE') {
            color = '#ff4757';
            glow = true;
        }
        else if (obj.type === 'GOAL') {
            color = '#ffa502';
            glow = true;
        }
        else if (obj.type === 'SPAWN') color = '#2ed573';
        else if (obj.type === 'PORTAL_SHRINK') { color = '#9c88ff'; glow = true; }
        else if (obj.type === 'PORTAL_GROW') { color = '#e1b12c'; glow = true; }
        else if (obj.type === 'PORTAL_NORMAL') { color = '#00a8ff'; glow = true; }
        else if (obj.type === 'NPC') {
            color = '#fd79a8';
            glow = true;
        }
        
        if (glow) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
        }
        
        ctx.fillStyle = color;
        if (obj.type === 'NPC') {
            // NPC character drawing (matching editor look)
            ctx.beginPath();
            ctx.arc(0, -obj.height/4, obj.width/3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-obj.width/2.5, 0, obj.width/1.25, obj.height/2);
            
            // Eyes
            ctx.fillStyle = 'white';
            ctx.fillRect(-obj.width/8, -obj.height/4 - obj.height/10, obj.width/15, obj.height/15);
            ctx.fillRect(obj.width/15, -obj.height/4 - obj.height/10, obj.width/15, obj.height/15);
        } else {
            ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
        }
        
        ctx.restore();
    });

    // Draw Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // Draw Player
    ctx.shadowBlur = 10;
    ctx.shadowColor = player.color;
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    ctx.restore();
}

// Expose functions for inline HTML event handlers (since script is now type="module")
window.startGame = startGame;
window.resetRun = resetRun;
window.showControls = showControls;
window.showTitle = showTitle;
window.showLeaderboard = showLeaderboard;
window.submitScore = submitScore;
window.remapKey = remapKey;
window.showAdminPanel = showAdminPanel;
window.postAnnouncement = postAnnouncement;
window.clearAnnouncement = clearAnnouncement;
window.adminLogin = adminLogin;
window.loadAdminScores = loadAdminScores;
window.deleteScore = deleteScore;
window.toggleMobileMode = toggleMobileMode;
window.toggleSFX = toggleSFX;
window.setPlayerSize = setPlayerSize;
window.openDialogue = openDialogue;
window.closeDialogue = closeDialogue;

// START THE GAME
requestAnimationFrame(update);
