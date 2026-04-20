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
const gravity = 2200;    
const friction = 0.001;  
const jumpForce = -750; 
const moveSpeed = 450;   
const acceleration = 2500; 
const coyoteTime = 0.15; // Seconds of coyote time

let lastTime = 0; 
let gameTime = 0; 
const keys = {}; // Fixed: Added missing keys object

// Speedrun Timer
let startTime = 0;
let elapsedTime = 0;
let timerRunning = false;
let timerFinished = false;

function formatTime(ms) {
    let minutes = Math.floor(ms / 60000);
    let seconds = Math.floor((ms % 60000) / 1000);
    let centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
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
    color: '#ff4757'
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
    [
        {"x":5.5,"y":45.1875,"width":84,"height":17,"type":"PLATFORM"},{"x":129.5,"y":0.1875,"width":20,"height":59,"type":"PLATFORM"},{"x":22.5,"y":6.1875,"width":19,"height":22,"type":"SPAWN"},{"x":-0.5,"y":148.1875,"width":147,"height":25,"type":"SPIKE"},{"x":144.5,"y":149.1875,"width":74,"height":29,"type":"SPIKE"},{"x":-0.5,"y":162.1875,"width":238,"height":62,"type":"PLATFORM"},{"x":184.5,"y":94.1875,"width":180,"height":131,"type":"PLATFORM"},{"x":409.5,"y":-0.8125,"width":15,"height":228,"type":"PLATFORM"},{"x":302.5,"y":319.1875,"width":125,"height":28,"type":"SPIKE"},{"x":117.5,"y":326.1875,"width":191,"height":21,"type":"PLATFORM"},{"x":6.5,"y":393.1875,"width":794,"height":14,"type":"PLATFORM"},{"x":-0.5,"y":217.1875,"width":35,"height":190,"type":"PLATFORM"},{"x":417.5,"y":219.1875,"width":7,"height":107,"type":"SPIKE"},{"x":416.5,"y":218.1875,"width":265,"height":8,"type":"PLATFORM"},{"x":484.5,"y":350.1875,"width":30,"height":12,"type":"PLATFORM"},{"x":582.5,"y":305.1875,"width":50,"height":47,"type":"PLATFORM"},{"x":709.5,"y":288.1875,"width":79,"height":11,"type":"PLATFORM"},{"x":593.5,"y":4.1875,"width":9,"height":82,"type":"PLATFORM"},{"x":590.5,"y":-0.8125,"width":211,"height":9,"type":"PLATFORM"},{"x":599.5,"y":78.1875,"width":142,"height":8,"type":"PLATFORM"},{"x":743.5,"y":80.1875,"width":58,"height":7,"type":"PLATFORM","tx":683.5,"ty":79.1875,"isMoving":true},{"x":613.5,"y":24.1875,"width":31,"height":26,"type":"GOAL"},{"x":618.5,"y":62.1875,"width":39,"height":15,"type":"PORTAL_SHRINK"},{"x":654.5,"y":134.1875,"width":100,"height":20,"type":"PLATFORM"}
    ],

[{"x":0,"y":380,"width":800,"height":20,"type":"PLATFORM"},{"x":225,"y":139.1875,"width":70,"height":244,"type":"PLATFORM"},{"x":523,"y":70.1875,"width":80,"height":315,"type":"PLATFORM"},{"x":192,"y":298.1875,"width":41,"height":23,"type":"PLATFORM"},{"x":191,"y":223.1875,"width":38,"height":25,"type":"PLATFORM"},{"x":193,"y":160.1875,"width":45,"height":25,"type":"PLATFORM"},{"x":450.875,"y":69.9140625,"width":74,"height":20,"type":"PLATFORM","tx":448.875,"ty":379.9140625,"isMoving":true},{"x":500,"y":283.9971618652344,"width":29,"height":37,"type":"PLATFORM"},{"x":459,"y":201.99716186523438,"width":32,"height":32,"type":"PLATFORM"},{"x":500,"y":122.99716186523438,"width":33,"height":42,"type":"PLATFORM"},{"x":542.75,"y":64.671875,"width":45,"height":6,"type":"SPIKE","tx":542.75,"ty":71.671875,"isMoving":true},{"x":12.75,"y":329.671875,"width":24,"height":19,"type":"SPAWN"},{"x":260.75,"y":126.671875,"width":36,"height":15,"type":"PORTAL_SHRINK"},{"x":602.75,"y":361.671875,"width":200,"height":46,"type":"SPIKE"},{"x":694.75,"y":24.671875,"width":45,"height":40,"type":"GOAL"},{"x":527.75,"y":62.671875,"width":13,"height":9,"type":"PORTAL_NORMAL"}]
    
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
    reset: 'KeyR'
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
function startGame() {
    gameState = 'PLAYING';
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('controls-screen').style.display = 'none';
    document.getElementById('leaderboard-screen').style.display = 'none';
    document.getElementById('win-screen').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    startTime = Date.now();
    timerRunning = true;
    initLevel();
}

function resetRun() {
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
}

function showControls() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('controls-screen').style.display = 'flex';
    document.getElementById('leaderboard-screen').style.display = 'none';
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
    let heightDiff = newSize - player.height;
    player.width = newSize;
    player.height = newSize;
    player.y -= heightDiff; 
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
        initLevel();
    } else {
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
        resetRun();
    }
    if (e.code === controls.reset && gameState === 'PLAYING') {
        respawn();
    }
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

// 6. GAME ENGINE
function update(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000; 
    lastTime = timestamp;

    if (gameState !== 'PLAYING') {
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
            let progress = (Math.sin(gameTime) + 1) / 2;
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

    // --- 2. TIMER ---
    if (!timerRunning && !timerFinished) {
        if (keys[controls.jump] || keys[controls.left] || keys[controls.right]) {
            startTime = Date.now();
            timerRunning = true;
        }
    }
    if (timerRunning) {
        elapsedTime = Date.now() - startTime;
        document.getElementById('timer-display').innerText = formatTime(elapsedTime);
    }

    // --- 3. INPUTS & PHYSICS ---
    if (keys[controls.jump] && player.coyoteCounter > 0) {
        player.velY = jumpForce;
        player.jumping = true;
        player.coyoteCounter = 0; // Use up coyote time immediately
    }
    
    player.coyoteCounter -= dt;
    
    if (keys[controls.left]) {
        player.velX -= acceleration * dt;
    } else if (keys[controls.right]) {
        player.velX += acceleration * dt;
    } else {
        player.velX *= Math.pow(friction, dt);
    }

    player.velY += gravity * dt;

    if (player.velX > moveSpeed) player.velX = moveSpeed;
    if (player.velX < -moveSpeed) player.velX = -moveSpeed;

    // --- 4. Y-AXIS MOVE & COLLISION ---
    player.y += player.velY * dt; 
    
    worldObjects.forEach(obj => {
        if (player.x < obj.currentX + obj.width && player.x + player.width > obj.currentX &&
            player.y < obj.currentY + obj.height && player.y + player.height > obj.currentY) {
            
            if (obj.type === 'PLATFORM') {
                if (player.velY >= 0 && (player.y + player.height) - (player.velY * dt) <= obj.currentY + 10) { 
                    player.jumping = false;
                    player.coyoteCounter = coyoteTime; // Reset coyote time
                    player.velY = 0;
                    player.y = obj.currentY - player.height;
                    if (obj.isMoving) player.y += (obj.currentY - obj.oldY);
                } 
                else if (player.velY < 0 && player.y - (player.velY * dt) >= obj.currentY + obj.height - 10) {
                    player.velY = 0;
                    player.y = obj.currentY + obj.height;
                }
            } 
            else if (obj.type === 'SPIKE') respawn();
            else if (obj.type === 'GOAL') nextLevel();
            else if (obj.type === 'PORTAL_SHRINK') setPlayerSize(15);
            else if (obj.type === 'PORTAL_NORMAL') setPlayerSize(30);
            else if (obj.type === 'PORTAL_GROW') setPlayerSize(45);
        }
    });

    // --- 5. X-AXIS MOVE & COLLISION ---
    player.x += player.velX * dt;
    
    worldObjects.forEach(obj => {
        if (obj.isMoving && !player.jumping && 
            player.x < obj.currentX + obj.width && player.x + player.width > obj.currentX &&
            player.y + player.height >= obj.currentY - 5 && player.y + player.height <= obj.currentY + 10) {
            player.x += (obj.currentX - obj.oldX);
        }

        if (player.x < obj.currentX + obj.width && player.x + player.width > obj.currentX &&
            player.y < obj.currentY + obj.height && player.y + player.height > obj.currentY) {
            
            if (obj.type === 'PLATFORM') {
                if (player.y + player.height > obj.currentY + 5) {
                    if (player.velX > 0) { player.x = obj.currentX - player.width; player.velX = 0; }
                    else if (player.velX < 0) { player.x = obj.currentX + obj.width; player.velX = 0; }
                }
            } else if (obj.type === 'SPIKE') respawn();
            else if (obj.type === 'GOAL') nextLevel();
        }
    });

    if (player.x < 0) player.x = 0;
    if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;

    draw();
    requestAnimationFrame(update);
}

// 7. DRAWING FUNCTION
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    worldObjects.forEach(obj => {
        ctx.save();
        ctx.translate(obj.currentX + obj.width / 2, obj.currentY + obj.height / 2);
        ctx.rotate((obj.currentAngle || 0) * Math.PI / 180);
        
        if (obj.type === 'PLATFORM') ctx.fillStyle = '#2f3542';
        else if (obj.type === 'SPIKE') ctx.fillStyle = '#ff4757';
        else if (obj.type === 'GOAL') ctx.fillStyle = '#ffa502';
        else if (obj.type === 'SPAWN') ctx.fillStyle = '#2ed573';
        else if (obj.type === 'PORTAL_SHRINK') ctx.fillStyle = '#9c88ff';
        else if (obj.type === 'PORTAL_GROW') ctx.fillStyle = '#e1b12c';
        else if (obj.type === 'PORTAL_NORMAL') ctx.fillStyle = '#00a8ff';
        
        ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
        ctx.restore();
    });

    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
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

// START THE GAME
requestAnimationFrame(update);
