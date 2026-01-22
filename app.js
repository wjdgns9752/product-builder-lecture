// Firebase Integration (Global UMD)
// Imports removed. Using 'firebase' global object.

const firebaseConfig = {
  apiKey: "AIzaSyB80YVLtFSBs2l3TiazSRj0xsgOBeUZG4I",
  authDomain: "noise-monitoring-5764d.firebaseapp.com",
  projectId: "noise-monitoring-5764d",
  storageBucket: "noise-monitoring-5764d.firebasestorage.app",
  messagingSenderId: "250708015230",
  appId: "1:250708015230:web:676e299df9ef6ca00d002f",
  measurementId: "G-1BCMY7SVDQ"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// --- CRITICAL: Global Function Definition (Must be at the top) ---
window.startMonitoring = async function() {
    console.log("Start button clicked (Global)");
    const btn = document.getElementById('init-btn');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "⌛ 초기화 중...";
    }

    try {
        const result = await startAudio();
        if(btn) {
            btn.disabled = false; // Always re-enable
            if (!result) {
                 btn.textContent = "모니터링 시작";
            }
        }
    } catch (e) {
        console.error("Critical Start Error:", e);
        alert(`❌ 실행 오류: ${e.message}`);
        if(btn) {
            btn.disabled = false;
            btn.textContent = "모니터링 시작";
        }
    }
};

// Auto-bind on load (Safety net)
document.addEventListener('DOMContentLoaded', () => {
    console.log("App Version: 20260121_FINAL_V4 (Chart Fix)");
    
    // Init Chart immediately if possible
    if (typeof initProbChart === 'function') {
        initProbChart();
            initHarmonicaChart();
    } else {
        // Retry if defined later (though it should be hoisted)
        setTimeout(() => { if(typeof initProbChart === 'function') initProbChart();
            initHarmonicaChart(); }, 1000);
    }

    const btn = document.getElementById('init-btn');
    if(btn) {
        btn.onclick = window.startMonitoring;
        console.log("Button event bound via DOMContentLoaded");
    }
});

// DOM Elements
const initBtn = document.getElementById('init-btn');
const recordBtn = document.getElementById('record-btn');
const quickCalibBtn = document.getElementById('quick-calib-btn');
const meterBar = document.getElementById('meter-bar');
const bgMarker = document.getElementById('bg-marker');
const currentVolSpan = document.getElementById('current-vol');
const bgVolSpan = document.getElementById('bg-vol');
const statusText = document.getElementById('status-text');
const durationBar = document.getElementById('duration-bar'); 
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const thresholdSlider = document.getElementById('threshold');
const thresholdVal = document.getElementById('threshold-val');
const audioAlarmCheckbox = document.getElementById('audio-alarm');
const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

// Auth / User Elements
const authModal = document.getElementById('auth-modal');
const authNicknameInput = document.getElementById('auth-nickname');
const btnStart = document.getElementById('btn-start');
const userNicknameDisplay = document.getElementById('user-nickname-display');
const userInfoModal = document.getElementById('user-info-modal'); // Onboarding

let currentUserId = localStorage.getItem('user_uid'); // Persist ID
let currentUserNickname = localStorage.getItem('user_nickname');
let userProfile = null;

// --- Auth / Nickname Logic ---
function checkAuth() {
    if (!currentUserId || !currentUserNickname) {
        // No User -> Show Nickname Modal
        authModal.classList.remove('hidden');
        userInfoModal.classList.add('hidden');
    } else {
        // User Exists
        userNicknameDisplay.textContent = currentUserNickname;
        authModal.classList.add('hidden');
        checkUserProfile(currentUserId);
    }
}

// Generate a simple UUID if not exists
function generateUUID() {
    return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

btnStart.addEventListener('click', (e) => {
    e.preventDefault();
    const nickname = authNicknameInput.value.trim();
    
    if (nickname) {
        // Create new session
        currentUserId = generateUUID();
        currentUserNickname = nickname;
        
        localStorage.setItem('user_uid', currentUserId);
        localStorage.setItem('user_nickname', currentUserNickname);
        
        userNicknameDisplay.textContent = currentUserNickname;
        authModal.classList.add('hidden');
        
        // New user needs profile setup
        showOnboarding(false);
    } else {
        alert("닉네임을 입력해주세요.");
    }
});


async function checkUserProfile(uid) {
    try {
        const docRef = db.collection("users").doc(uid);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            userProfile = docSnap.data();
            // Periodic Check (7 days)
            const lastUpdate = userProfile.updatedAt || 0;
            const now = Date.now();
            const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
            
            if ((now - lastUpdate) > CHECK_INTERVAL_MS) {
                showOnboarding(true); // Show Re-check
            }
        } else {
            // No Profile in DB -> Show Onboarding
            showOnboarding(false);
        }
    } catch (e) {
        console.error("Profile check failed:", e);
    }
}

function showOnboarding(isUpdate) {
    userInfoModal.classList.remove('hidden');
    userInfoModal.style.display = 'flex';
    if (isUpdate) {
        userInfoModal.querySelector('h2').textContent = "📅 정기 환경 점검";
        userInfoModal.querySelector('.desc').innerHTML = "7일이 지났습니다.<br>환경 정보를 업데이트해주세요.";
    }
}

async function saveUserInfo() {
    try {
        console.log("saveUserInfo called");
        
        // Hide modal immediately
        if (userInfoModal) {
            userInfoModal.classList.add('hidden');
            userInfoModal.style.display = 'none';
        }

        const housingType = document.getElementById('housing-type').value;
        const floorLevel = document.getElementById('floor-level').value;
        const envType = document.getElementById('env-type').value;

        const profile = {
            housingType,
            floorLevel,
            envType,
            updatedAt: Date.now()
        };

        // Save to localStorage
        localStorage.setItem('user_profile', JSON.stringify(profile));
        
        // Save to Firestore (Fire and forget, safe catch)
        if (currentUserId && typeof db !== 'undefined') {
            db.collection("users").doc(currentUserId).set(profile, { merge: true })
                .then(() => console.log("User profile saved to Firestore."))
                .catch((error) => console.error("Error saving user profile: ", error));
        }

        // Auto Start
        console.log("Attempting auto-start audio...");
        const success = await startAudio();
        if (!success) {
            console.warn("Auto-start failed.");
            if (initBtn) initBtn.style.display = 'block';
            // Alert strictly if it didn't work (and no permission modal showed)
            // But startAudio handles permission modal.
        }
    } catch (e) {
        console.error("saveUserInfo critical error:", e);
        alert("설정을 저장하는 중 오류가 발생했습니다: " + e.message);
        // Ensure modal is closed so user isn't stuck
        if (userInfoModal) userInfoModal.classList.add('hidden');
        if (initBtn) initBtn.style.display = 'block';
    }
}

// Init Check
checkAuth();

// Calibration Elements
const realDbInput = document.getElementById('real-db-input');
const autoCalibBtn = document.getElementById('auto-calib-btn');
const currentRawDbSpan = document.getElementById('current-raw-db');
const saveCalibBtn = document.getElementById('save-calib');
const cancelCalibBtn = document.getElementById('cancel-calib');
const calibBtn = document.getElementById('calibration-btn');
const calibModal = document.getElementById('calibration-modal');
const playNoiseBtn = document.getElementById('play-noise-btn');

// Evaluation Modal Elements
const modal = document.getElementById('evaluation-modal');
const rateBtns = document.querySelectorAll('.rate-btn');
const submitEvalBtn = document.getElementById('submit-eval');
const selectedValSpan = document.getElementById('selected-val');
const audioPreviewContainer = document.getElementById('audio-preview-container');
const noisePlayer = document.getElementById('noise-player');
const downloadLink = document.getElementById('download-recording');

// Classifier Elements
// Note: 'classCards' variable removed as it was using incorrect IDs. Elements are selected in updateInternalClassifierUI.

// --- TensorFlow.js YAMNet Integration ---
// 기존의 1/1 옥타브 밴드 분석을 경량화 딥러닝 모델(YAMNet)로 대체합니다.

let yamnetModel = null;
let aiProbChart = null;
let yamnetAudioBuffer = []; // Resampled audio buffer (16kHz)
const YAMNET_SAMPLE_RATE = 16000;
const YAMNET_INPUT_SIZE = 16000; // ~1 second window
let isModelProcessing = false;

// YAMNet Class Mapping moved to below
// const CLASS_MAPPING = ... (Removed duplicate)

let latestPredictionText = '';
// --- Visualizer Helpers (Restored) ---

// --- Color Map Helper (Magma-like) ---
function getMagmaColor(value) {
    const n = value / 255;
    if (n < 0.1) return `rgb(0, 0, 0)`; // Black
    if (n < 0.3) return `rgb(${Math.floor(80*n*3)}, 0, ${Math.floor(80*n*3 + 50)})`; // Deep Purple
    if (n < 0.6) return `rgb(${Math.floor(180*n)}, ${Math.floor(20*n)}, ${Math.floor(100*n)})`; // Red/Purple
    if (n < 0.8) return `rgb(255, ${Math.floor(150*(n-0.5)*2)}, 0)`; // Orange
    return `rgb(255, 255, ${Math.floor(255*(n-0.8)*5)})`; // Yellow/White
}

const OCTAVE_BANDS = [31.5, 63, 125, 250, 500, 1000];
let currentOctaveLevels = {};

function calculateOctaveLevels(dataArray, bufferLength, sampleRate) {
    const binSize = sampleRate / (bufferLength * 2);
    let levels = {};
    OCTAVE_BANDS.forEach(centerFreq => {
        const lowerFreq = centerFreq / 1.414;
        const upperFreq = centerFreq * 1.414;
        let startBin = Math.floor(lowerFreq / binSize);
        let endBin = Math.floor(upperFreq / binSize);
        if (startBin < 0) startBin = 0;
        if (endBin >= bufferLength) endBin = bufferLength - 1;
        let sum = 0;
        let count = 0;
        for (let i = startBin; i <= endBin; i++) {
            sum += dataArray[i];
            count++;
        }
        levels[centerFreq] = count > 0 ? sum / count : 0;
    });
    return levels;
}

// Resample audio to 16kHz and add to buffer
function processAudioForModel(timeData, originalSampleRate) {
    // if (!yamnetModel) return; // Allow buffer to fill even if model is loading

    // Simple Decimation / Linear Interpolation
    const ratio = originalSampleRate / YAMNET_SAMPLE_RATE;
    const newLength = Math.floor(timeData.length / ratio);
    
    for (let i = 0; i < newLength; i++) {
        const originalIndex = i * ratio;
        const index1 = Math.floor(originalIndex);
        const index2 = Math.min(index1 + 1, timeData.length - 1);
        const fraction = originalIndex - index1;
        
        // Linear Interpolation
        const value = timeData[index1] * (1 - fraction) + timeData[index2] * fraction;
        
        yamnetAudioBuffer.push(value);
    }

    // Keep buffer at reasonable size (sliding window)
    if (yamnetAudioBuffer.length > YAMNET_INPUT_SIZE + 4000) {
        yamnetAudioBuffer = yamnetAudioBuffer.slice(yamnetAudioBuffer.length - YAMNET_INPUT_SIZE);
    }
    
    // Update Step 2 Debug Info if Waiting
    const aiStep2 = document.getElementById('ai-step-recognition');
    if (aiStep2 && aiStep2.textContent.includes('대기 중')) {
        const bufferPct = Math.min(100, (yamnetAudioBuffer.length / YAMNET_INPUT_SIZE) * 100).toFixed(0);
        const modelState = yamnetModel ? "준비됨" : "로딩 중";
        aiStep2.innerHTML = `소리 패턴 대기 중...<br><span style='font-size:0.65rem; color:#999'>(데이터: ${bufferPct}% / AI: ${modelState})</span>`;
    }
}



function updateInternalClassifierUI(analysis) {
    const resultText = document.getElementById('ai-result-text');
    const meterFill = document.getElementById('ai-meter-fill');

    // Update Meter
    if (meterFill) {
        meterFill.style.width = `${Math.min(100, analysis.score * 100)}%`;
    }

    // Cards
    const cards = {
        home: document.getElementById('card-home'),
        floor: document.getElementById('card-floor'),
        road: document.getElementById('card-road'),
        train: document.getElementById('card-train'), 
        air: document.getElementById('card-air'),
        none: document.getElementById('card-none')
    };
    
    Object.values(cards).forEach(c => c && c.classList.remove('active'));

    // Text Update
    let displayLabel = "대기 중";

    switch(analysis.label) {
        case 'Floor Impact':
            if(cards.floor) cards.floor.classList.add('active');
            displayLabel = "층간소음 (충격음 감지)";
            break;
        case 'Road Traffic':
            if(cards.road) cards.road.classList.add('active');
            displayLabel = "도로 소음 (차량)";
            break;
        case 'Household':
            if(cards.home) cards.home.classList.add('active');
            displayLabel = "생활 소음 (대화/가전)";
            break;
        case 'Train': // Added support
            if(cards.train) cards.train.classList.add('active');
            displayLabel = "철도/지하철 소음";
            break;
        case 'Air': // Added support
            if(cards.air) cards.air.classList.add('active');
            displayLabel = "항공기 소음";
            break;
        default:
            if(cards.none) cards.none.classList.add('active');
            break;
    }

    if (resultText) {
        resultText.textContent = analysis.label === 'none' ? '소음 감지 대기 중' : `${displayLabel} 감지됨 (${(analysis.score*100).toFixed(0)}%)`;
    }
}

// YAMNet Model URL (Direct from TFHub)
const YAMNET_MODEL_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';

// Global YAMNet Classes (Simplified)
const YAMNET_CLASSES = ["Speech", "Child speech, kid speaking", "Conversation", "Narration, monologue", "Babbling", "Speech synthesizer", "Shout", "Bellow", "Whoop", "Yell", "Children shouting", "Screaming", "Whispering", "Laughter", "Baby laughter", "Giggle", "Snicker", "Belly laugh", "Chuckle, chortle", "Crying, sobbing", "Baby cry, infant cry", "Whimper", "Wail, moan", "Sigh", "Singing", "Choir", "Yodeling", "Chant", "Mantra", "Child singing", "Synthetic singing", "Rapping", "Humming", "Groan", "Grunt", "Whistling", "Breathing", "Wheeze", "Snoring", "Gasp", "Pant", "Snort", "Cough", "Throat clearing", "Sneeze", "Sniff", "Run", "Shuffle", "Walk, footsteps", "Chewing, mastication", "Biting", "Gargling", "Stomach rumble", "Burping, eructation", "Hiccup", "Fart", "Hands", "Finger snapping", "Clapping", "Heart sounds, heartbeat", "Heart murmur", "Cheering", "Applause", "Chatter", "Crowd", "Hubbub, speech noise, speech babble", "Children playing", "Animal", "Domestic animals, pets", "Dog", "Bark", "Yip", "Howl", "Bow-wow", "Growling", "Whimper (dog)", "Cat", "Purr", "Meow", "Hiss", "Caterwaul", "Livestock, farm animals, working animals", "Horse", "Clip-clop", "Neigh, whinny", "Cattle, bovinae", "Moo", "Cowbell", "Pig", "Oink", "Goat", "Bleat", "Sheep", "Fowl", "Chicken, rooster", "Cluck", "Crowing, cock-a-doodle-doo", "Turkey", "Gobble", "Duck", "Quack", "Goose", "Honk", "Wild animals", "Roaring cats (lions, tigers)", "Roar", "Bird", "Bird vocalization, bird call, bird song", "Chirp, tweet", "Squawk", "Pigeon, dove", "Coo", "Crow", "Caw", "Owl", "Hoot", "Bird flight, flapping wings", "Canidae, dogs, wolves", "Rodents, rats, mice", "Mouse", "Patter", "Insect", "Cricket", "Mosquito", "Fly, housefly", "Buzz", "Bee, wasp, etc.", "Frog", "Croak", "Snake", "Rattle", "Whale vocalization", "Music", "Musical instrument", "Plucked string instrument", "Guitar", "Electric guitar", "Bass guitar", "Acoustic guitar", "Steel guitar, slide guitar", "Tapping (guitar technique)", "Strum", "Banjo", "Sitar", "Mandolin", "Zither", "Ukulele", "Keyboard (musical)", "Piano", "Electric piano", "Organ", "Electronic organ", "Hammond organ", "Synthesizer", "Sampler", "Harpsichord", "Percussion", "Drum kit", "Drum machine", "Drum", "Snare drum", "Rimshot", "Drum roll", "Bass drum", "Timpani", "Tabla", "Cymbal", "Hi-hat", "Wood block", "Tambourine", "Rattle (instrument)", "Maraca", "Gong", "Tubular bells", "Mallet percussion", "Marimba, xylophone", "Glockenspiel", "Vibraphone", "Steelpan", "Orchestra", "Brass instrument", "French horn", "Trumpet", "Trombone", "Bowed string instrument", "String section", "Violin, fiddle", "Pizzicato", "Cello", "Double bass", "Wind instrument, woodwind instrument", "Flute", "Saxophone", "Clarinet", "Harp", "Bell", "Church bell", "Jingle bell", "Bicycle bell", "Tuning fork", "Chime", "Wind chime", "Change ringing (campanology)", "Harmonica", "Accordion", "Bagpipes", "Didgeridoo", "Shofar", "Theremin", "Singing bowl", "Scratching (performance technique)", "Pop music", "Hip hop music", "Beatboxing", "Rock music", "Heavy metal", "Punk rock", "Grunge", "Progressive rock", "Rock and roll", "Psychedelic rock", "Rhythm and blues", "Soul music", "Reggae", "Country", "Swing music", "Bluegrass", "Funk", "Folk music", "Middle Eastern music", "Jazz", "Disco", "Classical music", "Opera", "Electronic music", "House music", "Techno", "Dubstep", "Drum and bass", "Electronica", "Electronic dance music", "Ambient music", "Trance music", "Music of Latin America", "Salsa music", "Flamenco", "Blues", "Music for children", "New-age music", "Vocal music", "A capella", "Music of Africa", "Afrobeat", "Christian music", "Gospel music", "Music of Asia", "Carnatic music", "Music of Bollywood", "Ska", "Traditional music", "Independent music", "Song", "Background music", "Theme music", "Jingle (music)", "Soundtrack music", "Lullaby", "Video game music", "Christmas music", "Dance music", "Wedding music", "Happy music", "Sad music", "Tender music", "Exciting music", "Angry music", "Scary music", "Wind", "Rustling leaves", "Wind noise (microphone)", "Thunderstorm", "Thunder", "Water", "Rain", "Raindrop", "Rain on surface", "Stream", "Waterfall", "Ocean", "Waves, surf", "Steam", "Gurgling", "Fire", "Crackle", "Vehicle", "Boat, Water vehicle", "Sailboat, sailing ship", "Rowboat, canoe, kayak", "Motorboat, speedboat", "Ship", "Motor vehicle (road)", "Car", "Vehicle horn, car horn, honking", "Toot", "Car alarm", "Power windows, electric windows", "Skidding", "Tire squeal", "Car passing by", "Race car, auto racing", "Truck", "Air brake", "Air horn, truck horn", "Reversing beeps", "Ice cream truck, ice cream van", "Bus", "Emergency vehicle", "Police car (siren)", "Ambulance (siren)", "Fire engine, fire truck (siren)", "Motorcycle", "Traffic noise, roadway noise", "Rail transport", "Train", "Train whistle", "Train horn", "Railroad car, train wagon", "Train wheels squealing", "Subway, metro, underground", "Aircraft", "Aircraft engine", "Jet engine", "Propeller, airscrew", "Helicopter", "Fixed-wing aircraft, airplane", "Bicycle", "Skateboard", "Engine", "Light engine (high frequency)", "Dental drill, dentist's drill", "Lawn mower", "Chainsaw", "Medium engine (mid frequency)", "Heavy engine (low frequency)", "Engine knocking", "Engine starting", "Idling", "Accelerating, revving, vroom", "Door", "Doorbell", "Ding-dong", "Sliding door", "Slam", "Knock", "Tap", "Squeak", "Cupboard open or close", "Drawer open or close", "Dishes, pots, and pans", "Cutlery, silverware", "Chopping (food)", "Frying (food)", "Microwave oven", "Blender", "Water tap, faucet", "Sink (filling or washing)", "Bathtub (filling or washing)", "Hair dryer", "Toilet flush", "Toothbrush", "Electric toothbrush", "Vacuum cleaner", "Zipper (clothing)", "Keys jangling", "Coin (dropping)", "Scissors", "Electric shaver, electric razor", "Shuffling cards", "Typing", "Typewriter", "Computer keyboard", "Writing", "Alarm", "Telephone", "Telephone bell ringing", "Ringtone", "Telephone dialing, DTMF", "Dial tone", "Busy signal", "Alarm clock", "Siren", "Civil defense siren", "Buzzer", "Smoke detector, smoke alarm", "Fire alarm", "Foghorn", "Whistle", "Steam whistle", "Mechanisms", "Ratchet, pawl", "Clock", "Tick", "Tick-tock", "Gears", "Pulleys", "Sewing machine", "Mechanical fan", "Air conditioning", "Cash register", "Printer", "Camera", "Single-lens reflex camera", "Tools", "Hammer", "Jackhammer", "Sawing", "Filing (rasp)", "Sanding", "Power tool", "Drill", "Explosion", "Gunshot, gunfire", "Machine gun", "Fusillade", "Artillery fire", "Cap gun", "Fireworks", "Firecracker", "Burst, pop", "Eruption", "Boom", "Wood", "Chop", "Splinter", "Crack", "Glass", "Chink, clink", "Shatter", "Liquid", "Splash, splatter", "Slosh", "Squish", "Drip", "Pour", "Trickle, dribble", "Gush", "Fill (with liquid)", "Spray", "Pump (liquid)", "Stir", "Boiling", "Sonar", "Arrow", "Whoosh, swoosh, swish", "Thump, thud", "Thunk", "Electronic tuner", "Effects unit", "Chorus effect", "Basketball bounce", "Bang", "Slap, smack", "Whack, thwack", "Smash, crash", "Breaking", "Bouncing", "Whip", "Flap", "Scratch", "Scrape", "Rub", "Roll", "Crushing", "Crumpling, crinkling", "Tearing", "Beep, bleep", "Ping", "Ding", "Clang", "Squeal", "Creak", "Rustle", "Whir", "Clatter", "Sizzle", "Clicking", "Clickety-clack", "Rumble", "Plop", "Jingle, tinkle", "Hum", "Zing", "Boing", "Crunch", "Silence", "Sine wave", "Harmonic", "Chirp tone", "Sound effect", "Pulse", "Inside, small room", "Inside, large room or hall", "Inside, public space", "Outside, urban or manmade", "Outside, rural or natural", "Reverberation", "Echo", "Noise", "Environmental noise", "Static", "Mains hum", "Distortion", "Sidetone", "Cacophony", "White noise", "Pink noise", "Throbbing", "Vibration", "Television", "Radio", "Field recording"];

// Global History for Map
let noiseHistory = [];
let aiSkipMode = false;

// --- Global Calibration Function (Accessible from HTML) ---
window.startCalibration = async function() {
    console.log("Calibration Triggered");
    
    // Ensure audio context is running
    if (!audioContext || audioContext.state === 'suspended') {
        try {
            await startAudio();
        } catch(e) {
            alert("마이크를 먼저 켜주세요.");
            return;
        }
    }
    
    const modal = document.getElementById('calibration-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        // Auto start pink noise for convenience -> REMOVED per user request
        // if(!isPlayingNoise) playPinkNoise();
    } else {
        alert("설정 화면 로드 오류");
    }
};

async function setupAI(stream) {
    const sysBar = document.getElementById('system-status-bar');
    const sysMsg = document.getElementById('sys-msg');
    
    if(sysBar) sysBar.style.display = 'flex';
    if(sysMsg) sysMsg.textContent = "⏳ AI 엔진 준비 중...";

    try {
        if(sysMsg) sysMsg.textContent = "⏳ 모델 초기화 중... (CPU)";
        
        // Force CPU backend for stability
        await tf.setBackend('cpu');
        console.log("TF Backend:", tf.getBackend());
        
        // Load Graph Model directly from Kaggle/TFHub
        yamnetModel = await tf.loadGraphModel(YAMNET_MODEL_URL, { fromTFHub: true });
        
        if(sysBar) {
            sysMsg.textContent = "✅ AI 준비 완료";
            initProbChart();
            initHarmonicaChart();
            setTimeout(() => sysBar.style.display = 'none', 2000);
        }

    } catch (e) {
        console.warn("AI Setup Failed:", e);
        aiSkipMode = true;
        if(sysBar) sysBar.style.display = 'none';
    }
    return true;
}

// (Removed old DOMContentLoaded listener for calibration to avoid conflicts)

// YAMNet Class Mapping (Label keywords to App Categories)
// Enhanced Category Mapping
const CLASS_MAPPING = {
    'floor': ['knock', 'thump', 'thud', 'footsteps', 'walk', 'run', 'impact', 'door', 'slam', 'tap', 'clatter', 'shuffle', 'drop', 'fall', 'drag', 'jump', 'hop', 'skip', 'stomp'],
    'home': ['speech', 'conversation', 'talk', 'laugh', 'cry', 'shout', 'yell', 'scream', 'baby', 'child', 'cough', 'sneeze', 'domestic', 'vacuum', 'blender', 'water', 'dish', 'cook', 'fry', 'chop', 'music', 'tv', 'television', 'radio', 'instrument', 'piano', 'guitar', 'phone', 'ring', 'alarm', 'clock', 'dog', 'bark', 'cat', 'meow', 'pet'],
    'road': ['vehicle', 'traffic', 'car', 'bus', 'truck', 'motor', 'engine', 'horn', 'siren', 'tire', 'skid', 'brake', 'accelerat', 'revving', 'idling', 'street', 'roadway'],
    'train': ['train', 'rail', 'subway', 'metro', 'underground', 'station', 'locomotive', 'steam', 'whistle'],
    'air': ['aircraft', 'airplane', 'plane', 'helicopter', 'jet', 'propeller', 'aviation', 'fly', 'flight']
};

// Korean Translation Map for Common Classes
const YAMNET_KO_MAP = {
    'Speech': '말소리', 'Child speech, kid speaking': '아이 말소리', 'Conversation': '대화', 
    'Shout': '고함', 'Laughter': '웃음소리', 'Crying, sobbing': '울음소리', 'Baby cry, infant cry': '아기 울음',
    'Knock': '노크/두드림', 'Thump, thud': '쿵 소리', 'Footsteps': '발걸음', 'Walk, footsteps': '걷는 소리', 'Run': '뛰는 소리',
    'Door': '문 소리', 'Sliding door': '미닫이문', 'Slam': '문 쾅', 'Tap': '톡톡 소리', 'Squeak': '삐걱 소리',
    'Music': '음악', 'Television': 'TV 소리', 'Radio': '라디오', 'Musical instrument': '악기 소리',
    'Vacuum cleaner': '청소기', 'Blender': '믹서기', 'Water': '물 소리', 'Water tap, faucet': '수도꼭지', 'Toilet flush': '변기 물내림',
    'Dishes, pots, and pans': '그릇 달그락', 'Frying (food)': '튀기는 소리', 'Chopping (food)': '칼질 소리',
    'Vehicle': '차량', 'Motor vehicle (road)': '자동차', 'Car': '승용차', 'Vehicle horn, car horn, honking': '경적', 
    'Siren': '사이렌', 'Brake': '브레이크', 'Tire squeal': '타이어 소리', 'Traffic noise, roadway noise': '도로 교통',
    'Rail transport': '철도', 'Train': '기차', 'Subway, metro, underground': '지하철',
    'Aircraft': '항공기', 'Fixed-wing aircraft, airplane': '비행기', 'Helicopter': '헬리콥터',
    'Dog': '개 짖는 소리', 'Bark': '멍멍', 'Cat': '고양이', 'Meow': '야옹',
    'Silence': '조용함', 'Static': '지지직 잡음', 'Noise': '소음', 'White noise': '백색 소음'
};

function translateLabel(label) {
    if (YAMNET_KO_MAP[label]) return YAMNET_KO_MAP[label];
    // Partial match fallback
    for (const [key, val] of Object.entries(YAMNET_KO_MAP)) {
        if (label.includes(key)) return val;
    }
    return label; // Return original if no match
}


function initProbChart() {
    const ctx = document.getElementById('aiProbChart');
    if (!ctx) return;
    
    aiProbChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['시스템 준비', '대기 중', '-', '-', '-'],
            datasets: [{
                label: '확률 (%)',
                data: [100, 0, 0, 0, 0],
                backgroundColor: ['#4caf50', '#e0e0e0', '#e0e0e0', '#e0e0e0', '#e0e0e0'],
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 }, // Disable initial animation for instant visibility
            scales: {
                x: { display: false, max: 100 },
                y: { ticks: { font: { size: 11, weight: 'bold' } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

async function analyzeNoiseCharacteristics() {
    // Safety check
    if (!yamnetModel) return { label: 'none', score: 0 };
    
    // Reset stuck processing (Fail fast after 0.5s)
    if (isModelProcessing) {
        if (window.lastModelStartTime && Date.now() - window.lastModelStartTime > 500) {
            console.warn("Model processing timed out, resetting...");
            isModelProcessing = false;
        } else {
            return { label: 'none', score: 0 };
        }
    }

    if (yamnetAudioBuffer.length < YAMNET_INPUT_SIZE) {
        return { label: 'none', score: 0 };
    }

    isModelProcessing = true;
    window.lastModelStartTime = Date.now();
    
    // UI Feedback: Start Processing (Removed to prevent flickering)
    const recEl = document.getElementById('ai-step-recognition');
    // if (recEl) recEl.textContent = "⚡ AI 분석 중...";

    try {
        const inputData = yamnetAudioBuffer.slice(yamnetAudioBuffer.length - YAMNET_INPUT_SIZE);
        const inputTensor = tf.tensor(inputData); // 1D Tensor [16000]
        
        // Execute Model with Race Timeout (2s limit for stability)
        const scores = await Promise.race([
            (async () => {
                const results = yamnetModel.execute(inputTensor);
                const scoreTensor = Array.isArray(results) ? results[0] : results;
                const data = await scoreTensor.data();
                if (Array.isArray(results)) results.forEach(t => t.dispose());
                else results.dispose();
                return data;
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
        ]);

        inputTensor.dispose();

        // Process Results
        const predictions = [];
        for(let i=0; i<scores.length; i++) {
            if (YAMNET_CLASSES[i]) {
                predictions.push({
                    className: YAMNET_CLASSES[i],
                    probability: scores[i],
                    koName: translateLabel(YAMNET_CLASSES[i])
                });
            }
        }
        
        // Sort
        predictions.sort((a, b) => b.probability - a.probability);
        const topPredictions = predictions.slice(0, 5); // Top 5

        // Determine Category (Check top 3 results)
        let bestCategory = 'none';
        let categoryScore = 0;
        let detectedSoundName = topPredictions[0].koName;

        for (const pred of topPredictions.slice(0, 3)) {
            // Check threshold for valid detection (e.g. > 10%)
            if (pred.probability < 0.1) continue; 

            const labelLower = pred.className.toLowerCase();
            for (const [category, keywords] of Object.entries(CLASS_MAPPING)) {
                if (keywords.some(k => labelLower.includes(k))) {
                    if (pred.probability > categoryScore) {
                        categoryScore = pred.probability;
                        bestCategory = category;
                        detectedSoundName = pred.koName; // Keep the specific sound name
                    }
                }
            }
        }

        // Update UI
        const reasonEl = document.getElementById('ai-reasoning');
        
        // 1. Update Chart
        if (aiProbChart) {
            aiProbChart.data.labels = topPredictions.map(p => p.koName);
            aiProbChart.data.datasets[0].data = topPredictions.map(p => (p.probability * 100).toFixed(1));
            // Highlight the top bar
            aiProbChart.data.datasets[0].backgroundColor = topPredictions.map((p, i) => i === 0 ? '#ff9800' : '#2196f3');
            aiProbChart.update();
        }

        // 2. Update Text
        const topName = topPredictions[0].koName;
        const topProb = (topPredictions[0].probability * 100).toFixed(0);
        
        latestPredictionText = `${topName} (${topProb}%)`;

        if (recEl && reasonEl) {
            recEl.innerHTML = `🎯 감지: <strong>${topName}</strong> <small>(${topProb}%)</small>`;
            recEl.style.color = "#2196f3";
            
            if (bestCategory !== 'none') {
                const catNames = {
                    'floor': '층간소음', 'home': '생활소음', 'road': '도로교통', 
                    'train': '철도/지하철', 'air': '항공기'
                };
                reasonEl.innerHTML = `분석 결과: <strong>'${detectedSoundName}'</strong> 소리가 감지되어 <strong>[${catNames[bestCategory]}]</strong>으로 분류됩니다.`;
                reasonEl.style.background = "#e3f2fd";
                reasonEl.style.borderColor = "#2196f3";
            } else {
                reasonEl.innerHTML = `현재 <strong>'${topName}'</strong> 소리가 가장 유력하지만, 특정 카테고리(층간/교통 등)로 분류하기에는 불명확합니다.`;
                reasonEl.style.background = "#fffde7";
                reasonEl.style.borderColor = "#fbc02d";
            }
        }

        // 3. Update Classification Cards
        const cards = {
            home: document.getElementById('card-home'),
            floor: document.getElementById('card-floor'),
            road: document.getElementById('card-road'),
            train: document.getElementById('card-train'), 
            air: document.getElementById('card-air'),
            none: document.getElementById('card-none')
        };
        
        Object.values(cards).forEach(c => c && c.classList.remove('active'));
        const cardKey = bestCategory === 'none' ? 'none' : bestCategory;
        
        // Dynamic Label for 'None' card
        if (cards.none) {
            const noneLabel = cards.none.querySelector('.label');
            if (noneLabel) {
                if (bestCategory === 'none' && topPredictions[0].probability > 0.1) {
                    noneLabel.textContent = "기타/미분류";
                    cards.none.style.background = "#fff3e0"; // Light orange
                } else {
                    noneLabel.textContent = "대기 중";
                    cards.none.style.background = "";
                }
            }
        }

        if (cards[cardKey]) {
            cards[cardKey].classList.add('active');
            // Visual pulse effect for active card
            cards[cardKey].style.transform = "scale(1.05)";
            setTimeout(() => cards[cardKey].style.transform = "scale(1)", 200);
        }

        isModelProcessing = false;
        return { label: bestCategory, score: topPredictions[0].probability };

    } catch (e) {
        console.error("AI Inference Error:", e);
        // Error Feedback
        const recEl = document.getElementById('ai-step-recognition');
        if (recEl) recEl.innerHTML = `<span style='color:red'>⚠️ 오류: ${e.message}</span>`;
        
        isModelProcessing = false;
        return { label: 'none', score: 0 };
    }
}


function drawSpectrogram() {
  requestAnimationFrame(drawSpectrogram);
  if (!isMonitoring || isPausedForEval) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const width = canvas.width;
  const height = canvas.height;

  // Move the existing image to the left
  tempCtx.drawImage(canvas, -1, 0);
  
  // Draw new frequency data at the right edge
  for (let i = 0; i < bufferLength; i++) {
    const value = dataArray[i];
    const percent = value / 255;
    const hue = (1 - percent) * 240; 
    tempCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    
    // Scale height to focus on audible range
    const y = height - (i / (bufferLength / 2)) * height;
    tempCtx.fillRect(width - 1, y, 1, 2);
  }
  
  canvasCtx.clearRect(0, 0, width, height);
  canvasCtx.drawImage(tempCanvas, 0, 0);

  // Overlay AI Recognition Text
  if (latestPredictionText) {
      canvasCtx.font = "12px sans-serif";
      canvasCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
      canvasCtx.fillRect(0, 0, 200, 24);
      canvasCtx.fillStyle = "#00ff00";
      canvasCtx.fillText("AI: " + latestPredictionText, 5, 16);
  }
}

// Automatic Noise Mapping Logic
let lastMapRecordTime = 0;
function autoRecordToMap() {
    if (!isMonitoring || Date.now() - lastMapRecordTime < 5000) return;
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const timestamp = new Date().toLocaleTimeString();
        let marker = null;

        if (map) {
            let color = currentVolumeValue > 65 ? '#f44336' : (currentVolumeValue > 50 ? '#ffeb3b' : '#4caf50');
            marker = L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: color,
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
            marker.bindPopup(`<b>${currentVolumeValue.toFixed(1)} dB</b><br>시간: ${timestamp}`);
        }
        
        noiseHistory.push({ lat, lng, db: currentVolumeValue, marker });
        saveMapData(); // Persist
        
        if (noiseHistory.length > 50) {
            const old = noiseHistory.shift();
            if (old.marker && map) map.removeLayer(old.marker);
        }
        lastMapRecordTime = Date.now();
    }, null, { enableHighAccuracy: true });
}

// --- Map Persistence ---
function saveMapData() {
    if (!noiseHistory || noiseHistory.length === 0) return;
    // Map markers cannot be stringified directly, filter to data
    const data = noiseHistory.map(h => ({lat: h.lat, lng: h.lng, db: h.db}));
    localStorage.setItem('noiseMapHistory', JSON.stringify(data));
}

function loadMapData() {
    const data = localStorage.getItem('noiseMapHistory');
    if (data && map) {
        try {
            // Clear existing markers to avoid duplicates if re-loading
            noiseHistory.forEach(h => {
                if (h.marker && map.hasLayer(h.marker)) map.removeLayer(h.marker);
            });
            noiseHistory = []; // Reset and reload

            const history = JSON.parse(data);
            history.forEach(h => {
                const color = h.db > 65 ? '#f44336' : (h.db > 50 ? '#ffeb3b' : '#4caf50');
                const marker = L.circleMarker([h.lat, h.lng], {
                    radius: 8,
                    fillColor: color,
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);
                marker.bindPopup(`<b>${h.db.toFixed(1)} dB</b><br>기록됨`);
                noiseHistory.push({ lat: h.lat, lng: h.lng, db: h.db, marker });
            });
        } catch(e) {
            console.error("Failed to load map history", e);
        }
    }
}


// Survey Elements
const chipGroups = {
    activity: document.querySelectorAll('.chip[data-type="activity"]'),
    source: document.querySelectorAll('.chip[data-type="source"]')
};
let surveyData = {
    activity: null,
    source: null
};

// State Variables
let audioContext;
let analyser;
let microphone;
let globalStream = null; // Store stream for MediaRecorder
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordedBlob = null;
let currentAudioUrl = null;

let isMonitoring = false;
let isPausedForEval = false; 
let isCalibrating = false; // Prevents alarm during calibration
let selectedRating = null;
let currentVolumeValue = 0; 

// Calibration State
let dbOffset = parseFloat(localStorage.getItem('dbOffset')) || 0; 
let noiseNode = null; 
let isPlayingNoise = false;

// Duration Logic
let noiseStartTime = 0;
const TRIGGER_DURATION_MS = 2000; 
let lastEvalTime = 0;
const GRACE_PERIOD_MS = 3000; 
let audioInitTime = 0; // Warm-up timer

// Background Noise Tracking (in dB)
let backgroundLevel = 40; // Default est. dB
const adaptationRate = 0.005;
const decayRate = 0.05;      

// --- Advanced Analysis Variables ---
const dbBuffer = []; // Stores recent dB values for stats (L90, Leq)
const BUFFER_SIZE = 300; // Approx 30 seconds (assuming 100ms push)
let lastAnalysisTime = 0;

// Advanced Metrics Globals
let lastDbValue = 0;
let currentImpulse = 0;
let currentCentroid = 0;
let recentEvents = [];
const EVENT_COOLDOWN_MS = 2000;
let lastEventTime = 0;

// Visualizer State
let tempCanvas = document.createElement('canvas');
let tempCtx = tempCanvas.getContext('2d');
tempCanvas.width = canvas.width;
tempCanvas.height = canvas.height;

// Permission Modal
const permissionModal = document.getElementById('permission-modal');

// --- Theme Logic ---
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
  body.classList.add('dark-mode');
}
themeToggleBtn.addEventListener('click', () => {
  body.classList.toggle('dark-mode');
  const theme = body.classList.contains('dark-mode') ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
});

// --- Settings Logic ---
thresholdSlider.addEventListener('input', (e) => {
  thresholdVal.textContent = e.target.value;
});

// Watchdog for Analysis Loop
let watchdogTimer = null;

// --- Audio Functions ---
async function startAudio() {
  try {
    if (audioContext && audioContext.state === 'closed') {
        audioContext = null;
    }
    // ... (Existing setup code) ...

    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Only create stream if not already created
    if (!microphone) {
        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        globalStream = stream; // Store for MediaRecorder
        
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; 
        analyser.smoothingTimeConstant = 0.6; 
        
        microphone.connect(analyser);
        
        // Start AI Module independently (Don't await, let it load in background)
        setupAI(stream).catch(e => console.error("AI Init Failed:", e));
    }

    // UI Update for Active State
    if (initBtn) {
        initBtn.textContent = "모니터링 중지";
        initBtn.classList.add('recording-active'); // Add style class for visual feedback
        initBtn.style.display = 'block'; // Keep it visible
        initBtn.onclick = window.stopMonitoring; // Change action
    }

    recordBtn.classList.remove('hidden'); // Show record button
    // quickCalibBtn stays visible at all times
    
    if (!isMonitoring) {
        isMonitoring = true;
        audioInitTime = Date.now(); // Set warm-up start time
        statusText.textContent = "상태: 안정화 중..."; // Update status
        analyze();
        drawSpectrogram();
        
        // Start Watchdog
        if(watchdogTimer) clearInterval(watchdogTimer);
        watchdogTimer = setInterval(() => {
            if(isMonitoring && Date.now() - lastAnalysisTime > 2000) {
                console.warn("Analysis loop stalled. Restarting...");
                analyze();
            }
        }, 1000);
    }
    
    return true; 
  } catch (err) {
    console.error('Error accessing microphone:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        if(permissionModal) {
            permissionModal.classList.remove('hidden');
            permissionModal.style.display = 'flex';
        } else {
            alert("마이크 권한이 차단되었습니다. 설정을 확인해주세요.");
        }
        return false;
    }
    // Simple fallback
    try {
        if (!microphone) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            globalStream = stream;
            microphone = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048; 
            analyser.smoothingTimeConstant = 0.6; 
            microphone.connect(analyser);
        }
        
        if (initBtn) {
            initBtn.textContent = "모니터링 중지";
            initBtn.classList.add('recording-active');
            initBtn.style.display = 'block';
            initBtn.onclick = window.stopMonitoring;
        }

        // quickCalibBtn stays visible
        
        if (!isMonitoring) {
            isMonitoring = true;
            analyze();
            drawSpectrogram();
        }
        return true;
    } catch (fallbackErr) {
        return false;
    }
  }
}

// Stop Monitoring Function
window.stopMonitoring = async function() {
    console.log("Stopping monitoring...");
    isMonitoring = false;
    
    if (audioContext && audioContext.state === 'running') {
        await audioContext.suspend();
    }
    
    if (watchdogTimer) clearInterval(watchdogTimer);
    
    // UI Reset
    if (initBtn) {
        initBtn.textContent = "모니터링 시작";
        initBtn.disabled = false;
        initBtn.classList.remove('recording-active');
        initBtn.onclick = window.startMonitoring; // Reset action
    }
    
    statusText.textContent = "상태: 중지됨";
    // Optional: Hide record button if we want to fully reset
    // recordBtn.classList.add('hidden'); 
};

// --- Recorder Logic ---
function startRecording() {
    if (!globalStream || isRecording) return;
    try {
        mediaRecorder = new MediaRecorder(globalStream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.start();
        isRecording = true;
        // console.log("Recording started...");
    } catch (e) {
        console.error("MediaRecorder start failed", e);
    }
}

function stopRecording(save = false) {
    if (!mediaRecorder || !isRecording) return;
    
    // We need to wait for the final 'dataavailable' event
    // So we wrap the stop logic in a promise or handle it in onstop
    
    return new Promise((resolve) => {
        mediaRecorder.onstop = () => {
            isRecording = false;
            // console.log("Recording stopped. Saved:", save);
            if (save && audioChunks.length > 0) {
                recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
                resolve(recordedBlob);
            } else {
                recordedBlob = null;
                resolve(null);
            }
        };
        mediaRecorder.stop();
    });
}

function cancelRecording() {
    if (isRecording && mediaRecorder) {
        // Stop without saving intent (though stop() always fires dataavailable, logic above handles save flag)
        mediaRecorder.stop(); 
        isRecording = false;
        audioChunks = []; // Clear immediately
        recordedBlob = null;
        // console.log("Recording cancelled.");
    }
}

// --- Device Detection Helper ---
function getDeviceReferenceSPL() {
    const ua = navigator.userAgent;
    let model = "Unknown Device";
    let refSPL = 75; 

    if (/iPhone|iPad|iPod/.test(ua)) {
        model = "Apple iPhone/iPad";
        refSPL = 79; 
    } else {
        const match = ua.match(/;\s([^;]+)\sBuild/);
        if (match) {
            model = match[1].trim();
            if (model.includes("SM-S") || model.includes("SM-G") || model.includes("SM-N") || model.includes("SM-F")) {
                refSPL = 78;
            } else if (model.includes("SM-A") || model.includes("SM-M")) {
                refSPL = 74;
            } else if (model.toLowerCase().includes("pixel")) {
                refSPL = 77;
            }
        }
    }
    return { model, refSPL };
}

// --- Auto Calibration Logic ---
if (autoCalibBtn) {
    autoCalibBtn.addEventListener('click', async () => {
        // Reset Eval UI
        isPausedForEval = false;
        if (modal) modal.classList.add('hidden');

        // Set Flag
        isCalibrating = true;
        statusText.textContent = "상태: 마이크 정밀 보정 중... (3단계)";

        if (!audioContext || audioContext.state === 'suspended') {
            const success = await startAudio();
            if (!success) {
                isCalibrating = false;
                return;
            }
        }

        const { model, refSPL } = getDeviceReferenceSPL();
        const referenceSPL = refSPL; 

        autoCalibBtn.disabled = true;
        
        try {
            const iterations = 3;
            let measuredOffsets = [];

            for (let i = 1; i <= iterations; i++) {
                autoCalibBtn.textContent = `⏳ 측정 중... (${i}/${iterations})`;
                statusText.textContent = `상태: 측정 ${i}/${iterations} 진행 중...`;
                
                // 1. Play Noise
                if (!isPlayingNoise) playPinkNoise();
                
                // Wait for noise to stabilize
                await new Promise(r => setTimeout(r, 1000));

                // 2. Measure
                let sumDb = 0;
                let samples = 0;
                const measurePromise = new Promise(resolve => {
                    const interval = setInterval(() => {
                        const rawDb = parseFloat(currentRawDbSpan.textContent);
                        if (!isNaN(rawDb) && rawDb > -100) {
                            sumDb += rawDb;
                            samples++;
                        }
                    }, 100);

                    // Measure for 2 seconds
                    setTimeout(() => {
                        clearInterval(interval);
                        resolve(samples > 0 ? sumDb / samples : null);
                    }, 2000);
                });

                const avgRawDb = await measurePromise;
                
                // 3. Stop Noise (briefly)
                stopPinkNoise();
                await new Promise(r => setTimeout(r, 500)); // Quiet gap

                if (avgRawDb !== null) {
                    const offset = referenceSPL - avgRawDb;
                    measuredOffsets.push(offset);
                    console.log(`Calibration Step ${i}: Raw=${avgRawDb.toFixed(2)}, Offset=${offset.toFixed(2)}`);
                }
            }

            // Final Calculation
            if (measuredOffsets.length > 0) {
                // 1. Calculate Average
                const totalOffset = measuredOffsets.reduce((a, b) => a + b, 0);
                const finalOffset = totalOffset / measuredOffsets.length;

                // 2. Calculate Standard Deviation (Stability Check)
                const variance = measuredOffsets.reduce((sum, val) => sum + Math.pow(val - finalOffset, 2), 0) / measuredOffsets.length;
                const stdDev = Math.sqrt(variance);

                // 3. Determine Precision Grade
                let grade = '';
                let gradeDesc = '';
                
                if (stdDev < 1.0) {
                    grade = 'S (최우수)';
                    gradeDesc = '아주 완벽해요! 전문 장비 수준의 안정성입니다.';
                } else if (stdDev < 2.5) {
                    grade = 'A (우수)';
                    gradeDesc = '안정적입니다. 일상 모니터링에 충분해요.';
                } else if (stdDev < 5.0) {
                    grade = 'B (보통)';
                    gradeDesc = '약간의 편차가 있어요. 주변이 시끄러웠나요?';
                } else {
                    grade = 'F (불안정)';
                    gradeDesc = '측정값이 튑니다. 더 조용한 곳에서 다시 해보세요.';
                }

                dbOffset = finalOffset;
                localStorage.setItem('dbOffset', dbOffset);
                
                alert(`[정밀 보정 완료]\n\n🏆 마이크/환경 등급: ${grade}\n📊 안정성(편차): ±${stdDev.toFixed(2)}dB\n✅ 최종 보정값: ${dbOffset.toFixed(1)} dB\n\n💡 ${gradeDesc}`);
                calibModal.classList.add('hidden');
            } else {
                alert("측정 오류가 발생했습니다. 다시 시도해주세요.");
            }

        } catch (e) {
            console.error(e);
            alert("보정 중 오류 발생");
        } finally {
            // Reset UI
            autoCalibBtn.disabled = false;
            autoCalibBtn.textContent = "🚀 정밀 자동 보정 시작 (3회)";
            isCalibrating = false;
            statusText.textContent = "상태: 감지 중...";
            stopPinkNoise();
        }
    });
}

// --- Admin Mode Logic ---
const adminBtn = document.getElementById('admin-mode-btn');
const adminModal = document.getElementById('admin-modal');
const adminAppDbSpan = document.getElementById('admin-app-db');
const adminRefInput = document.getElementById('admin-ref-db');
const adminLogBtn = document.getElementById('admin-log-btn');
const adminLogTable = document.getElementById('admin-log-table');
const adminMaeSpan = document.getElementById('admin-mae');

let adminLogs = [];
let isAdminModeOpen = false;

if (adminBtn) {
    adminBtn.addEventListener('click', (e) => {
        e.preventDefault();
        adminModal.classList.remove('hidden');
        isAdminModeOpen = true;
        updateAdminDisplay();
    });
}

function updateAdminDisplay() {
    if (!isAdminModeOpen || adminModal.classList.contains('hidden')) {
        isAdminModeOpen = false;
        return;
    }
    requestAnimationFrame(updateAdminDisplay);
    // Update current App dB in Admin Modal
    adminAppDbSpan.textContent = currentVolumeValue.toFixed(1);
}

if (adminLogBtn) {
    adminLogBtn.addEventListener('click', () => {
        const refDb = parseFloat(adminRefInput.value);
        const appDb = parseFloat(adminAppDbSpan.textContent);

        if (isNaN(refDb)) {
            alert("소음계 측정값(숫자)을 입력해주세요.");
            return;
        }

        const diff = appDb - refDb;
        const logItem = {
            id: adminLogs.length + 1,
            app: appDb.toFixed(1),
            ref: refDb.toFixed(1),
            diff: diff.toFixed(1)
        };
        adminLogs.push(logItem);
        renderAdminLogs();
        adminRefInput.value = ''; // Clear input
        adminRefInput.focus();
    });
}

function renderAdminLogs() {
    adminLogTable.innerHTML = adminLogs.map(log => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding:8px;">${log.id}</td>
            <td style="padding:8px;">${log.app}</td>
            <td style="padding:8px;">${log.ref}</td>
            <td style="padding:8px; color:${Math.abs(log.diff) > 3 ? 'red' : 'green'}">${log.diff > 0 ? '+' : ''}${log.diff}</td>
        </tr>
    `).join('');

    // Calculate MAE (Mean Absolute Error)
    const totalError = adminLogs.reduce((sum, log) => sum + Math.abs(parseFloat(log.diff)), 0);
    const mae = totalError / adminLogs.length;
    adminMaeSpan.textContent = mae.toFixed(2);
}

// --- Audio Init Button (Removed due to inline onclick) ---
// initBtn.addEventListener('click', async () => {
//   await startAudio();
// });

// --- Analysis Loop ---
function analyze() {
  requestAnimationFrame(analyze);
  if (!isMonitoring || isPausedForEval) return;

  const bufferLength = analyser.frequencyBinCount;
  
  // 1. Frequency Data for Visualizer & dB
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // --- Calculate Spectral Centroid ---
  let sumFreq = 0;
  let sumAmp = 0;
  for (let i = 0; i < bufferLength; i++) {
      sumFreq += i * dataArray[i];
      sumAmp += dataArray[i];
  }
  currentCentroid = sumAmp > 0 ? sumFreq / sumAmp : 0;


  // 2. Time Domain Data for AI Model
  const timeData = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(timeData);
  // Feed to YAMNet Buffer (resampled to 16kHz)
  processAudioForModel(timeData, audioContext.sampleRate);

  // 3. dB Calculation
  let sum = 0;
  for(let i = 0; i < bufferLength; i++) {
    const x = dataArray[i] / 255; 
    sum += x * x;
  }
  const rms = Math.sqrt(sum / bufferLength);
  
  // Visualize Step 1 (Fingerprint) Activity
  const step1Card = document.querySelector('.step-card'); // First one is Step 1
  if (step1Card) {
      const intensity = Math.min(1, rms * 5);
      step1Card.style.borderColor = `rgba(33, 150, 243, ${0.3 + intensity})`;
      step1Card.style.boxShadow = `0 0 ${intensity * 10}px rgba(33, 150, 243, ${0.5})`;
  }

  let rawDb = 20 * Math.log10(rms + 0.00001); 
  let calibratedDb = rawDb + dbOffset;
  if (calibratedDb < 0) calibratedDb = 0;
  currentVolumeValue = calibratedDb;

  // --- Calculate Impulse ---
  let delta = calibratedDb - lastDbValue;
  if (delta > 3) { // Rapid rise
      currentImpulse += delta * 2; 
  } else {
      currentImpulse *= 0.9; // Decay
  }
  if (currentImpulse > 100) currentImpulse = 100;
  lastDbValue = calibratedDb;

  
  if (!calibModal.classList.contains('hidden')) {
      currentRawDbSpan.textContent = rawDb.toFixed(1);
  }

  // 4. Run Classifier (Model) & Update Dose-Response
  if (calibratedDb > 10 && !isCalibrating) { 
      analyzeNoiseCharacteristics().then(result => {
          // Update UI regardless of 'none' label to ensure status reflects current state
          updateInternalClassifierUI(result);
          if(result.label !== 'none') {
              updateDoseVisuals(calibratedDb, result.label); 
          }
      }).catch(err => console.error("AI Analysis Loop Error:", err));
  } else {
      updateInternalClassifierUI({ label: 'none', score: 0 });
      // Update Step 2 explicitly for Quiet state
      const step2 = document.getElementById('ai-step-recognition');
      if (step2) {
          step2.innerHTML = `조용함 (AI 분석 대기)<br><span style='font-size:0.65rem; color:#999'>입력 신호가 약합니다 (${calibratedDb.toFixed(1)}dB)</span>`;
          step2.style.color = "#999";
      }
      // Update Chart for Quiet
      if (aiProbChart) {
          aiProbChart.data.labels = ['조용함', '-', '-', '-', '-'];
          aiProbChart.data.datasets[0].data = [100, 0, 0, 0, 0];
          aiProbChart.data.datasets[0].backgroundColor = ['#9e9e9e', '#e0e0e0', '#e0e0e0', '#e0e0e0', '#e0e0e0'];
          aiProbChart.update();
      }
  }

  // 5. Update Visualizer Data (Octave Bands)
  currentOctaveLevels = calculateOctaveLevels(dataArray, bufferLength, audioContext.sampleRate);

  // Background
  if (calibratedDb < backgroundLevel) {
      backgroundLevel = Math.max(10, backgroundLevel * (1 - decayRate) + calibratedDb * decayRate);
  } else backgroundLevel = backgroundLevel * (1 - adaptationRate) + calibratedDb * adaptationRate;
  
  // Push to Buffer for Advanced Analysis
  dbBuffer.push(calibratedDb);
  if (dbBuffer.length > BUFFER_SIZE) dbBuffer.shift();

  // Show content if data exists
  const ph = document.getElementById('analysis-placeholder');
  const ct = document.getElementById('analysis-content');
  if (ph && ct && dbBuffer.length > 0) {
      ph.style.display = 'none';
      ct.style.display = 'block';
  }

  // Run Advanced Analysis & Auto Map every 500ms
  const now = Date.now();
  if (now - lastAnalysisTime > 500) {
      updateAnalysis();
      autoRecordToMap(); // Enable automatic mapping
      lastAnalysisTime = now;
  }

  updateUI(calibratedDb, backgroundLevel);
  checkThreshold(calibratedDb, backgroundLevel);
}

// --- Advanced Analysis Function ---

function initHarmonicaChart() {
    const ctx = document.getElementById('harmonicaTrendChart');
    if (!ctx) return;
    
    harmonicaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(30).fill(''),
            datasets: [
                { label: 'Harmonica', data: Array(30).fill(null), borderColor: '#2196f3', tension: 0.4, pointRadius: 0 },
                { label: 'Intrusive', data: Array(30).fill(null), borderColor: '#ff9800', tension: 0.4, pointRadius: 0 },
                { label: 'IR', data: Array(30).fill(null), borderColor: '#9c27b0', tension: 0.4, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { display: false }
            },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
            animation: { duration: 0 }
        }
    });
}

function updateAnalysis() {
    if (dbBuffer.length < 5) return;

    // 1. Basic Stats
    const sortedDb = [...dbBuffer].sort((a, b) => a - b);
    const L90 = sortedDb[Math.floor(sortedDb.length * 0.1)]; // Background
    const L10 = sortedDb[Math.floor(sortedDb.length * 0.9)]; // Peak
    const maxDb = Math.max(...dbBuffer);
    
    let sumEnergy = 0;
    let sumSqDiff = 0;
    let meanDb = 0;
    
    for (let db of dbBuffer) {
        sumEnergy += Math.pow(10, db / 10);
        meanDb += db;
    }
    meanDb /= dbBuffer.length;
    
    for (let db of dbBuffer) {
        sumSqDiff += Math.pow(db - meanDb, 2);
    }
    
    const Leq = 10 * Math.log10(sumEnergy / dbBuffer.length);
    const stdDev = Math.sqrt(sumSqDiff / dbBuffer.length); 

    // 2. Research Metrics Calculation
    // IR (Intermittency Ratio / Irregularity) approx: L10 - L90
    // Intrusiveness: Leq - L90
    // Harmonica Index: L90 + 2 * (L10 - L90) -> Background + 2 * Fluctuation
    
    const IR = L10 - L90;
    const Intrusiveness = Math.max(0, Leq - L90);
    const Harmonica = L90 + 2 * IR;

    // 3. Pitch Character
    let pitchLabel = "중음";
    let pitchColor = "#4caf50";
    if (currentCentroid < 50) { pitchLabel = "저음 (웅~)"; pitchColor = "#795548"; }
    else if (currentCentroid > 200) { pitchLabel = "고음 (쇳소리)"; pitchColor = "#f44336"; }

    // 4. Update UI Elements
    const valL90 = document.getElementById('val-l90');
    // Research Metrics UI
    const valHarmonica = document.getElementById('val-harmonica');
    const valIntrusive = document.getElementById('val-intrusive');
    const valIrResearch = document.getElementById('val-ir-research');
    
    if (valL90) valL90.textContent = L90.toFixed(1);
    if (valHarmonica) valHarmonica.textContent = Harmonica.toFixed(1);
    if (valIntrusive) valIntrusive.textContent = Intrusiveness.toFixed(1);
    if (valIrResearch) valIrResearch.textContent = IR.toFixed(1);

    // Old Impulse UI (kept for dashboard consistency if elements exist)
    const valImpulse = document.getElementById('val-impulse');
    const barImpulse = document.getElementById('bar-impulse');
    if (valImpulse) valImpulse.textContent = currentImpulse.toFixed(0);
    if (barImpulse) barImpulse.style.width = `${Math.min(100, currentImpulse)}%`;
    
    const valIrregular = document.getElementById('val-irregular');
    if (valIrregular) valIrregular.textContent = stdDev.toFixed(1); // Keep StdDev for 'Var'
    
    const valPitch = document.getElementById('val-pitch');
    if (valPitch) {
        valPitch.textContent = pitchLabel;
        valPitch.style.color = pitchColor;
    }

    // 5. Update Trend Chart
    if (harmonicaChart) {
        const labels = harmonicaChart.data.labels;
        const dHarmonica = harmonicaChart.data.datasets[0].data;
        const dIntrusive = harmonicaChart.data.datasets[1].data;
        const dIR = harmonicaChart.data.datasets[2].data;
        
        // Shift
        dHarmonica.shift(); dHarmonica.push(Harmonica);
        dIntrusive.shift(); dIntrusive.push(Intrusiveness);
        dIR.shift(); dIR.push(IR);
        
        harmonicaChart.update('none'); // Efficient update
    }

    // 6. Event Detection & Logging
    const now = Date.now();
    let detectedEventLabel = 'none';

    if ((currentImpulse > 30 || Leq > 70) && (now - lastEventTime > EVENT_COOLDOWN_MS)) {
        lastEventTime = now;
        
        const timeStr = new Date().toLocaleTimeString();
        let eventType = "알 수 없음";
        
        if (typeof latestPredictionText !== 'undefined' && latestPredictionText && !latestPredictionText.includes("대기")) {
            eventType = latestPredictionText.split('(')[0].trim();
        } else {
            if (currentImpulse > 50) eventType = "충격음 (쿵!)";
            else if (currentCentroid > 200) eventType = "고주파 소음";
            else eventType = "지속 소음";
        }
        
        detectedEventLabel = eventType; // Set for stats

        const logList = document.getElementById('noise-event-list');
        if (logList) {
            const li = document.createElement('li');
            li.style.borderBottom = "1px solid #eee";
            li.style.padding = "4px 0";
            li.innerHTML = `<span style="color:#666; font-size:0.75rem;">${timeStr}</span> 
                            <strong style="color:#333;">${eventType}</strong> 
                            <span style="background:${Leq>70?'#ffebee':'#f1f8e9'}; color:${Leq>70?'#c62828':'#33691e'}; padding:2px 4px; border-radius:4px; font-size:0.7rem;">${Leq.toFixed(0)}dB</span>`;
            
            logList.prepend(li);
            if (logList.children.length > 5 && logList.lastElementChild) logList.lastElementChild.remove();
            
            const emptyMsg = logList.querySelector('li[style*="text-align:center"]');
            if (emptyMsg) emptyMsg.remove();
        }
    }

    // 7. Update 24H Report Stats
    if (typeof updateDailyStats === 'function') {
        updateDailyStats(Leq, { harmonica: Harmonica, ir: IR, intrusive: Intrusiveness }, detectedEventLabel);
    }

    // Update Analysis Comment
    const badge = document.getElementById('noise-badge');
    const comment = document.getElementById('analysis-comment');
    
    if (badge && comment) {
        if (Harmonica > 80) { // Using Harmonica Index for status
            badge.textContent = "위험";
            badge.className = "badge impulsive";
            comment.textContent = "심각한 소음 스트레스 환경입니다. (HI > 80)";
        } else if (Harmonica > 65) {
            badge.textContent = "주의";
            badge.className = "badge intermittent";
            comment.textContent = "다소 시끄럽습니다. 휴식이 필요합니다.";
        } else {
            badge.textContent = "쾌적";
            badge.className = "badge steady";
            comment.textContent = "안정적인 소음 환경입니다.";
        }
    }
}


// Map Marker Color logic
function getNoiseColor(db) {
    return db > 65 ? '#f44336' : (db > 50 ? '#ffeb3b' : '#4caf50');
}

function clearMapMarkers() {
    noiseHistory.forEach(item => map.removeLayer(item.marker));
    noiseHistory = [];
}

const clearMapBtn = document.getElementById('btn-clear-map');
if (clearMapBtn) clearMapBtn.addEventListener('click', clearMapMarkers);

function updateUI(current, bg) {
  meterBar.style.width = `${Math.min(100, Math.max(0, current))}%`;
  bgMarker.style.left = `${Math.min(100, Math.max(0, bg))}%`;
  currentVolSpan.textContent = Math.round(current);
  bgVolSpan.textContent = Math.round(bg);
  if (current > 75) meterBar.style.backgroundColor = '#f44336'; 
  else if (current > 50) meterBar.style.backgroundColor = '#ffeb3b'; 
  else meterBar.style.backgroundColor = '#4caf50'; 
}

function checkThreshold(current, bg) {
  // 0. Warm-up Period (Ignore first 3 seconds)
  if (Date.now() - audioInitTime < 3000) {
      statusText.textContent = "상태: 마이크 안정화 중...";
      backgroundLevel = current; // Instantly adapt background
      durationBar.style.width = '0%';
      noiseStartTime = 0;
      return;
  }

  if (isCalibrating) {
      statusText.textContent = "상태: 마이크 보정 중... (평가 일시중지)";
      durationBar.style.width = '0%';
      return; 
  }
  if (Date.now() - lastEvalTime < GRACE_PERIOD_MS) {
      durationBar.style.width = '0%';
      return;
  }
  if (current < 30) { 
      noiseStartTime = 0;
      if (isRecording && !recordBtn.classList.contains('manual-lock')) { 
          cancelRecording();
          recordBtn.textContent = "🔴 녹음 시작";
          recordBtn.classList.remove('recording');
      }
      durationBar.style.width = '0%';
      statusText.textContent = "상태: 감지 중 (조용함)";
      return;
  }
  const triggerGap = 25 - (parseInt(thresholdSlider.value) / 100 * 20); 
  const triggerLevel = bg + triggerGap;
  if (current > triggerLevel) {
      if (noiseStartTime === 0) {
          noiseStartTime = Date.now();
          startRecording();
          recordBtn.textContent = "⏹️ 녹음 중지/완료";
          recordBtn.classList.add('recording');
      }
      const duration = Date.now() - noiseStartTime;
      durationBar.style.width = `${Math.min(100, (duration / TRIGGER_DURATION_MS) * 100)}%`;
      statusText.textContent = `상태: 소음 감지! 기준+${Math.round(triggerGap)}dB (${(duration/1000).toFixed(1)}s)`;
      if (duration > TRIGGER_DURATION_MS) triggerAlarm();
  } else {
      noiseStartTime = 0;
      if (isRecording && !recordBtn.classList.contains('manual-lock')) {
          cancelRecording();
          recordBtn.textContent = "🔴 녹음 시작";
          recordBtn.classList.remove('recording');
      }
      durationBar.style.width = '0%';
      statusText.textContent = "상태: 감지 중...";
  }
}

async function triggerAlarm() {
  if (isPausedForEval) return; 
  isPausedForEval = true; 
  noiseStartTime = 0;
  durationBar.style.width = '100%';
  statusText.textContent = "상태: 지속적 소음 발생! 평가 필요";
  
  // Stop and save recording
  recordedBlob = await stopRecording(true);
  
  // Reset Button UI
  recordBtn.textContent = "🔴 녹음 시작";
  recordBtn.classList.remove('recording');
  recordBtn.classList.remove('manual-lock');

  if (audioAlarmCheckbox.checked) playBeep();
  showEvaluationModal();
}

function showEvaluationModal() {
  modal.classList.remove('hidden');
  resetRatingUI();

  // Setup Audio Player if blob exists
  if (recordedBlob) {
      audioPreviewContainer.style.display = 'block';
      
      if (currentAudioUrl) {
          URL.revokeObjectURL(currentAudioUrl);
      }
      currentAudioUrl = URL.createObjectURL(recordedBlob);
      
      noisePlayer.src = currentAudioUrl;
      downloadLink.href = currentAudioUrl;
      const dateStr = new Date().toLocaleString().replace(/[:\/\s]/g, '-');
      downloadLink.download = `[미분류]_${dateStr}.webm`;
  } else {
      audioPreviewContainer.style.display = 'none';
  }
}

function hideEvaluationModal() {
  modal.classList.add('hidden');
}

function resetRatingUI() {
  selectedRating = null;
  selectedValSpan.textContent = '-';
  submitEvalBtn.disabled = true;
  rateBtns.forEach(btn => btn.classList.remove('selected'));
  Object.values(chipGroups).forEach(group => {
      group.forEach(chip => chip.classList.remove('selected'));
  });
  surveyData = { activity: null, source: null };
}

function playBeep() {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.type = 'square'; osc.frequency.value = 880; 
    gain.gain.value = 0.1;
    osc.start(); osc.stop(audioContext.currentTime + 0.1);
}

// Button Events
calibBtn.addEventListener('click', async () => {
    if (!audioContext) await startAudio();
    calibModal.classList.remove('hidden');
});
cancelCalibBtn.addEventListener('click', () => {
    stopPinkNoise(); calibModal.classList.add('hidden');
});
playNoiseBtn.addEventListener('click', () => {
    if (isPlayingNoise) stopPinkNoise(); else playPinkNoise();
});
saveCalibBtn.addEventListener('click', () => {
    const realDb = parseFloat(realDbInput.value);
    const currentRaw = parseFloat(currentRawDbSpan.textContent);
    if (isNaN(realDb) || isNaN(currentRaw)) return;
    dbOffset = realDb - currentRaw;
    localStorage.setItem('dbOffset', dbOffset);
    alert(`보정 완료!`);
    stopPinkNoise(); calibModal.classList.add('hidden');
});

// Manual Record Button Logic
recordBtn.addEventListener('click', async () => {
    // Ensure mic is on
    if (!audioContext) {
        await startAudio();
    }
    
    if (!isRecording) {
        // Start Recording
        startRecording();
        recordBtn.textContent = "⏹️ 녹음 중지/완료";
        recordBtn.classList.add('recording');
        recordBtn.classList.add('manual-lock'); // Mark as manual so threshold doesn't cancel it
        statusText.textContent = "상태: 수동 녹음 중...";
    } else {
        // Stop Recording
        recordBtn.textContent = "⏳ 처리 중...";
        recordedBlob = await stopRecording(true);
        
        // Reset UI
        recordBtn.textContent = "🔴 녹음 시작";
        recordBtn.classList.remove('recording');
        recordBtn.classList.remove('manual-lock');
        statusText.textContent = "상태: 모니터링 중...";
        
        // Show Modal
        showEvaluationModal();
    }
});

rateBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    rateBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRating = btn.dataset.val;
    selectedValSpan.textContent = selectedRating;
    checkSubmitReady();
  });
});

Object.entries(chipGroups).forEach(([type, chips]) => {
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            surveyData[type] = chip.dataset.val;
            
            // Update filename if source is selected
            if (type === 'source' && downloadLink.href) {
                const dateStr = new Date().toLocaleString().replace(/[:\/\s]/g, '-');
                // Use the Korean label text if available, or the value
                const labelText = chip.textContent.split('(')[0].trim(); // Get Korean part
                downloadLink.download = `[${labelText}]_${dateStr}.webm`;
            }
            
            checkSubmitReady();
        });
    });
});

function checkSubmitReady() {
    // Enable submit if rating is selected (source is optional but recommended for data)
    submitEvalBtn.disabled = (selectedRating === null);
}

submitEvalBtn.addEventListener('click', async () => {
  if (selectedRating === null) return;
  
  try {
    const profile = JSON.parse(localStorage.getItem('user_profile')) || {};
    const payload = {
      rating: parseInt(selectedRating, 10),
      noiseLevel: parseFloat(currentVolumeValue.toFixed(1)),
      backgroundLevel: Math.round(backgroundLevel),
      context: { activity: surveyData.activity || 'unknown', source: surveyData.source || 'unknown' },
      userProfile: profile,
      userAgent: navigator.userAgent, 
      timestamp: firebase.firestore.FieldValue.serverTimestamp() // Fixed: Using global firebase object
      // Note: We are not uploading the audio blob to Firestore here because it requires Storage setup.
      // The user can download it locally.
    };
    // Fixed: Using compat syntax
    await db.collection("noise_evaluations").add(payload);
  } catch (err) { console.error(err); }
  hideEvaluationModal();
  lastEvalTime = Date.now();
  statusText.textContent = "상태: 안정화 중...";
  isPausedForEval = false; 
  meterBar.style.width = '0%';
  durationBar.style.width = '0%';
  
  recordedBlob = null; // Clear memory
  if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
  }
  
  if (audioContext && audioContext.state === 'suspended') await audioContext.resume();
});

function playPinkNoise() {
    if (!audioContext) return;
    const pinkBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const data = pinkBuffer.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    for(let i=0; i<data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520; b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
    }
    noiseNode = audioContext.createBufferSource();
    noiseNode.buffer = pinkBuffer; noiseNode.loop = true;
    noiseNode.connect(audioContext.destination); noiseNode.start();
    isPlayingNoise = true; playNoiseBtn.textContent = "⏹️ 핑크 노이즈 중지";
}

function stopPinkNoise() {
    if (noiseNode) { noiseNode.stop(); noiseNode = null; }
    isPlayingNoise = false; playNoiseBtn.textContent = "🔊 핑크 노이즈 재생";
}

// --- Navigation & View Logic ---
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
let mapInitialized = false;
let map = null;
let currentMapMarker = null;

navItems.forEach(nav => {
    nav.addEventListener('click', () => {
        // Switch Active Nav
        navItems.forEach(n => n.classList.remove('active'));
        nav.classList.add('active');

        // Switch View
        const targetId = nav.dataset.target;
        views.forEach(v => {
            if(v.id === targetId) v.classList.add('active');
            else v.classList.remove('active');
        });

        // Special Init for Map
        if (targetId === 'view-map') {
            if (!mapInitialized) {
                initMap();
            } else if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                    updateUserLocation();
                }, 100);
            }
        }
        
        // Special Init for Analysis
        if (targetId === 'view-analysis') {
            if (!doseChart) initDoseChart();
            if (!harmonicaChart) initHarmonicaChart();
            
            // Force resize/update for charts that were hidden
            setTimeout(() => {
                if (doseChart) { doseChart.resize(); doseChart.update(); }
                if (harmonicaChart) { harmonicaChart.resize(); harmonicaChart.update(); }
            }, 50);

            // Update analysis with current buffer data
            updateAnalysis();
            if (currentVolumeValue > 0) {
                updateDoseVisuals(currentVolumeValue, 'none'); 
            }
        }
    });
});

// --- Dose-Response Analysis (Chart.js) ---
let doseChart = null;
let harmonicaChart = null;
const doseCtx = document.getElementById('doseResponseChart');

function initDoseChart() {
    if (!doseCtx) return; 
    
    // Generate Curves Data
    const dbs = [];
    const roadData = [];
    const railData = [];
    const airData = [];
    
    for (let l = 45; l <= 85; l+=1) {
        dbs.push(l);
        roadData.push(calcHA(l, 'road'));
        railData.push(calcHA(l, 'train'));
        airData.push(calcHA(l, 'air'));
    }

    doseChart = new Chart(doseCtx, {
        type: 'line',
        data: {
            labels: dbs,
            datasets: [
                {
                    label: 'Road Traffic',
                    data: roadData,
                    borderColor: '#ff9800',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: 'Railway',
                    data: railData,
                    borderColor: '#4caf50',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: 'Aircraft',
                    data: airData,
                    borderColor: '#2196f3',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: 'Current Noise',
                    data: [], // Point to be updated
                    borderColor: '#f44336',
                    backgroundColor: '#f44336',
                    type: 'bubble',
                    pointRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { title: { display: true, text: 'Noise Level (dB)' } },
                y: { title: { display: true, text: '% Highly Annoyed (%HA)' }, min: 0, max: 100 }
            },
            plugins: {
                tooltip: { enabled: true },
                legend: { position: 'bottom' }
            }
        }
    });
}

// Miedema & Oudshoorn (2001) Approximation
function calcHA(L, type) {
    let val = 0;
    // Normalized to Ldn (Assuming L_current approx Ldn for instant impact visualization)
    // Formulas usually require Ldn. We treat current Leq as a proxy for "If this noise continued..."
    
    if (type === 'road') {
        // Road: 9.868*10^-4 * (L-42)^3 ... simplified linear approx for UI speed
        // Polynomial:
        if (L < 42) return 0;
        val = 9.868e-4 * Math.pow(L-42, 3) - 1.436e-2 * Math.pow(L-42, 2) + 0.5118 * (L-42);
    } else if (type === 'train') {
        if (L < 32) return 0;
        val = 7.239e-4 * Math.pow(L-32, 3) - 7.851e-3 * Math.pow(L-32, 2) + 0.1695 * (L-32);
    } else if (type === 'air') {
        if (L < 30) return 0;
        // Aircraft curve is steeper
        val = 9.868e-4 * Math.pow(L-30, 3) - 1.436e-2 * Math.pow(L-30, 2) + 0.5118 * (L-30); 
    }
    
    return Math.min(100, Math.max(0, val));
}

function updateDoseVisuals(db, sourceLabel) {
    if (!doseChart) initDoseChart();
    if (!doseChart) return;

    // Map source label to curve type
    let type = 'road'; // default
    if (sourceLabel === 'Train') type = 'train';
    else if (sourceLabel === 'Air') type = 'air';
    else if (sourceLabel === 'Floor Impact') type = 'road'; // Treat impulsive as road curve for now or separate? Use Road as baseline.
    
    // Update detected source text
    const txt = document.getElementById('detected-source-text');
    if (txt) txt.textContent = sourceLabel !== 'none' ? sourceLabel : '배경 소음';

    const ha = calcHA(db, type);
    const haSpan = document.getElementById('ha-percent');
    if (haSpan) haSpan.textContent = ha.toFixed(1);

    // Update Bubble
    // The bubble dataset is index 3
    doseChart.data.datasets[3].data = [{x: db, y: ha, r: 8}];
    doseChart.update('none'); // Efficient update
}


// --- Leaflet Map Logic ---
function initMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    // Default: Seoul City Hall
    map = L.map('map-container').setView([37.5665, 126.9780], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapInitialized = true;
    loadMapData();
    updateUserLocation();
}

function updateUserLocation() {
    if (!navigator.geolocation || !map) return; 
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        
        map.setView([lat, lng], 16);

        if (currentMapMarker) map.removeLayer(currentMapMarker);
        
        // Color based on dB
        let color = '#4caf50'; // Green
        if (currentVolumeValue > 65) color = '#f44336'; // Red
        else if (currentVolumeValue > 50) color = '#ffeb3b'; // Yellow

        currentMapMarker = L.circle([lat, lng], {
            color: color,
            fillColor: color,
            fillOpacity: 0.5,
            radius: 30 // Fixed visual size or accuracy
        }).addTo(map);

        currentMapMarker.bindPopup("<b>현재 소음: " + currentVolumeValue.toFixed(1) + " dB</b><br>정확도: " + acc + "m").openPopup();

    }, (err) => {
        console.error("Geo Location Error", err);
        alert("위치 정보를 가져올 수 없습니다.");
    }, { enableHighAccuracy: true });
}

// Bind Update Button
const locBtn = document.getElementById('btn-update-location');
if (locBtn) locBtn.addEventListener('click', updateUserLocation);

// --- Map Persistence ---
function saveMapData() {
    localStorage.setItem('noiseMapHistory', JSON.stringify(noiseHistory.map(h => ({lat: h.lat, lng: h.lng, db: h.db}))));
}

function loadMapData() {
    const data = localStorage.getItem('noiseMapHistory');
    if (data && map) {
        const history = JSON.parse(data);
        history.forEach(h => {
            const color = h.db > 65 ? '#f44336' : (h.db > 50 ? '#ffeb3b' : '#4caf50');
            const marker = L.circleMarker([h.lat, h.lng], {
                radius: 8,
                fillColor: color,
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
            marker.bindPopup(`<b>${h.db.toFixed(1)} dB</b><br>(Saved)`);
            noiseHistory.push({ lat: h.lat, lng: h.lng, db: h.db, marker });
        });
    }
}

// --- 24H Report Logic ---

let dailyStats = loadDailyStats() || resetDailyStats();
let reportCharts = {};

function resetDailyStats() {
    return {
        date: new Date().toLocaleDateString(),
        hourly: Array(24).fill(null).map(() => ({ count: 0, maxDb: 0, sumDb: 0, n: 0 })),
        dayEvents: 0,
        nightEvents: 0,
        daySumDb: 0, dayCount: 0,
        nightSumDb: 0, nightCount: 0,
        sourceCounts: {},
        events: [], // List of significant events with details
        metrics: {
            harmonica: [], // Hourly avg
            ir: [],
            intrusive: []
        }
    };
}

function loadDailyStats() {
    const data = localStorage.getItem('dailyStats');
    if (data) {
        const stats = JSON.parse(data);
        if (stats.date !== new Date().toLocaleDateString()) return resetDailyStats();
        return stats;
    }
    return null;
}

function saveDailyStats() {
    localStorage.setItem('dailyStats', JSON.stringify(dailyStats));
}

function updateDailyStats(db, metrics, eventLabel) {
    const now = new Date();
    const hour = now.getHours();
    const isNight = (hour >= 22 || hour < 6);

    // 1. Hourly Aggregation
    dailyStats.hourly[hour].n++;
    dailyStats.hourly[hour].sumDb += db;
    if (db > dailyStats.hourly[hour].maxDb) dailyStats.hourly[hour].maxDb = db;

    // 2. Day/Night Aggregation
    if (isNight) {
        dailyStats.nightSumDb += db;
        dailyStats.nightCount++;
    } else {
        dailyStats.daySumDb += db;
        dailyStats.dayCount++;
    }

    // 3. Event Tracking
    if (eventLabel && eventLabel !== 'none') {
        dailyStats.hourly[hour].count++;
        if (isNight) dailyStats.nightEvents++; else dailyStats.dayEvents++;
        
        dailyStats.sourceCounts[eventLabel] = (dailyStats.sourceCounts[eventLabel] || 0) + 1;

        // Log significant event
        dailyStats.events.unshift({
            time: now.toLocaleTimeString(),
            label: eventLabel,
            maxDb: db,
            hi: metrics.harmonica
        });
        
        if (dailyStats.events.length > 50) dailyStats.events.pop();
    }

    // 4. Metrics Tracking (Simple hourly average for graph)
    // Initialize array if needed
    if (!dailyStats.metrics.harmonica[hour]) dailyStats.metrics.harmonica[hour] = [];
    dailyStats.metrics.harmonica[hour].push(metrics.harmonica);
    
    saveDailyStats();
}

function initReportCharts() {
    // Hourly Events Chart
    const ctxHourly = document.getElementById('hourlyEventsChart');
    if (ctxHourly) {
        reportCharts.hourly = new Chart(ctxHourly, {
            type: 'line',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}시`),
                datasets: [{
                    label: '소음 이벤트 수',
                    data: Array(24).fill(0),
                    borderColor: '#2196f3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Day/Night Chart
    const ctxDN = document.getElementById('dayNightChart');
    if (ctxDN) {
        reportCharts.dn = new Chart(ctxDN, {
            type: 'doughnut',
            data: {
                labels: ['주간 (06-22)', '야간 (22-06)'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#ff9800', '#3f51b5']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Source Distribution Chart
    const ctxSource = document.getElementById('sourceDistChart');
    if (ctxSource) {
        reportCharts.source = new Chart(ctxSource, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Metrics Trend Chart
    const ctxMetrics = document.getElementById('dailyMetricsChart');
    if (ctxMetrics) {
        reportCharts.metrics = new Chart(ctxMetrics, {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}시`),
                datasets: [
                    { label: 'Harmonica (평균)', data: [], backgroundColor: '#4caf50' },
                    { label: '최대 dB', data: [], type: 'line', borderColor: '#f44336', borderDash: [5, 5] }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function renderReport() {
    // 1. Stats
    const dayAvg = dailyStats.dayCount > 0 ? (dailyStats.daySumDb / dailyStats.dayCount).toFixed(1) : '-';
    const nightAvg = dailyStats.nightCount > 0 ? (dailyStats.nightSumDb / dailyStats.nightCount).toFixed(1) : '-';
    
    document.getElementById('report-total-events').textContent = dailyStats.dayEvents + dailyStats.nightEvents;
    document.getElementById('report-day-avg').textContent = dayAvg;
    document.getElementById('report-night-avg').textContent = nightAvg;

    // 2. Charts
    if (!reportCharts.hourly) initReportCharts();

    // Hourly
    if (reportCharts.hourly) {
        reportCharts.hourly.data.datasets[0].data = dailyStats.hourly.map(h => h.count);
        reportCharts.hourly.update();
    }

    // Day/Night
    if (reportCharts.dn) {
        reportCharts.dn.data.datasets[0].data = [dailyStats.dayEvents, dailyStats.nightEvents];
        reportCharts.dn.update();
    }

    // Source
    if (reportCharts.source) {
        const sources = Object.keys(dailyStats.sourceCounts);
        const sourceData = Object.values(dailyStats.sourceCounts);
        reportCharts.source.data.labels = sources;
        reportCharts.source.data.datasets[0].data = sourceData;
        reportCharts.source.update();
    }

    // Metrics
    if (reportCharts.metrics) {
        const avgHI = dailyStats.metrics.harmonica.map(arr => {
            if (!arr || arr.length === 0) return 0;
            return arr.reduce((a, b) => a + b, 0) / arr.length;
        });
        const maxDBs = dailyStats.hourly.map(h => h.maxDb);
        
        reportCharts.metrics.data.datasets[0].data = avgHI;
        reportCharts.metrics.data.datasets[1].data = maxDBs;
        reportCharts.metrics.update();
    }

    // 3. Log Table
    const tbody = document.getElementById('daily-log-table-body');
    if (tbody) {
        if (dailyStats.events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">데이터가 없습니다.</td></tr>';
        } else {
            tbody.innerHTML = dailyStats.events.map(e => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;">${e.time}</td>
                    <td style="padding: 8px;">${e.label}</td>
                    <td style="padding: 8px; font-weight:bold;">${e.maxDb.toFixed(1)}</td>
                    <td style="padding: 8px;">${e.hi.toFixed(0)}</td>
                </tr>
            `).join('');
        }
    }
}

        // Hook into existing view switch logic

    navItems.forEach(nav => {

        nav.addEventListener('click', () => {

            if (nav.dataset.target === 'view-report') {

                renderReport();

                // Force resize charts after tab becomes visible

                setTimeout(() => {

                    Object.values(reportCharts).forEach(chart => {

                        if (chart) {

                            chart.resize();

                            chart.update();

                        }

                    });

                }, 50);

            }

            

            // Settings Tab Visualization

            if (nav.dataset.target === 'view-info') {

                // Update Threshold Display

                if (thresholdVal && thresholdSlider) {

                    thresholdVal.textContent = thresholdSlider.value;

                }

                // Update Auth/Profile Info

                const nick = localStorage.getItem('user_nickname');

                const uid = localStorage.getItem('user_uid');

                const profile = JSON.parse(localStorage.getItem('user_profile') || '{}');

                const offset = localStorage.getItem('dbOffset') || 0;

                

                // If you want to visualize these in the settings tab, ensure elements exist

                // For now, just ensuring the slider and basic inputs are synced

            }

        });

    });

    



// --- Demo Data Population (For Visualization) ---
function populateDemoData() {
    // ABORT if real monitoring is active to prevent data corruption
    if (isMonitoring) return; 

    console.log("Populating Demo Data...");
    const now = new Date();



    const currentHour = now.getHours();







    // 1. Report Data (dailyStats)



    // Only populate if empty



    if (dailyStats.dayEvents === 0 && dailyStats.nightEvents === 0) {



        // Generate realistic pattern: Quiet night, busy rush hours, moderate day



        const sources = ['도로교통', '층간소음', '말소리', '항공기', '지하철'];



        



        for (let h = 0; h < 24; h++) {



            // Determine activity level (0-1)



            let activity = 0.1;



            if (h >= 7 && h <= 9) activity = 0.9; // Morning Rush



            else if (h >= 18 && h <= 20) activity = 0.8; // Evening Rush



            else if (h >= 10 && h <= 17) activity = 0.5; // Day



            



            // Events count



            const count = Math.floor(Math.random() * 10 * activity);



            dailyStats.hourly[h].count = count;



            



            // Stats



            if (h >= 6 && h < 22) {



                dailyStats.dayEvents += count;



                dailyStats.daySumDb += (50 + activity * 20) * count; 



                dailyStats.dayCount += count;



            } else {



                dailyStats.nightEvents += count;



                dailyStats.nightSumDb += (40 + activity * 10) * count;



                dailyStats.nightCount += count;



            }







            // Max dB & Metrics



            dailyStats.hourly[h].maxDb = 50 + (activity * 40) + (Math.random() * 10);



            



            // Fake Harmonica Index history (30 mins samples per hour)



            if (!dailyStats.metrics.harmonica[h]) dailyStats.metrics.harmonica[h] = [];



            for(let i=0; i<6; i++) {



                dailyStats.metrics.harmonica[h].push(5 + (activity * 50) + (Math.random() * 20));



            }



        }







        // Source Distribution



        for(let i=0; i<50; i++) {



            const src = sources[Math.floor(Math.random() * sources.length)];



            dailyStats.sourceCounts[src] = (dailyStats.sourceCounts[src] || 0) + 1;



        }







        // Event Log (Last 10 events)



        for(let i=0; i<10; i++) {



            const h = Math.max(0, currentHour - Math.floor(i/2));



            const min = Math.floor(Math.random() * 60);



            const timeStr = `${h}:${min < 10 ? '0'+min : min}:00`;



            const label = sources[Math.floor(Math.random() * sources.length)];



            dailyStats.events.push({



                time: timeStr,



                label: label,



                maxDb: 60 + Math.random() * 30,



                hi: 50 + Math.random() * 40



            });



        }



        



        saveDailyStats();



    }







    // 2. Map Data (noiseHistory)
    if (noiseHistory.length < 5) { // Relaxed condition
        const centerLat = 37.5665;
        const centerLng = 126.9780;
        
        for(let i=0; i<10; i++) {
            const lat = centerLat + (Math.random() - 0.5) * 0.01;
            const lng = centerLng + (Math.random() - 0.5) * 0.01;
            const db = 45 + Math.random() * 40;
            noiseHistory.push({ lat, lng, db, marker: null });
        }
        saveMapData();
    }

    // 3. Analysis Data (dbBuffer & Charts)
    // Check if buffer is empty OR if we need to force visuals for demo
    // If buffer is small (< 50) or average level is very low (silence), inject demo data
    const isSilent = dbBuffer.length > 0 && (dbBuffer.reduce((a,b)=>a+b,0)/dbBuffer.length < 35);
    
    if (dbBuffer.length < 50 || isSilent) {
        // Fill buffer with interesting dummy data
        dbBuffer.length = 0; // Clear existing silence
        let val = 50;
        for(let i=0; i<300; i++) {
            val += (Math.random() - 0.5) * 10;
            if (val < 40) val = 40;
            if (val > 80) val = 80;
            if (Math.random() > 0.95) val += 15; // Random peaks
            dbBuffer.push(val);
        }
        
        // Force init charts if missing
        if (!harmonicaChart && typeof initHarmonicaChart === 'function') initHarmonicaChart();
        if (!doseChart && typeof initDoseChart === 'function') initDoseChart();

        // Populate Harmonica Chart History
        if (harmonicaChart) {
            const dataLen = harmonicaChart.data.labels.length; // usually 30
            const dHarmonica = harmonicaChart.data.datasets[0].data;
            const dIntrusive = harmonicaChart.data.datasets[1].data;
            const dIR = harmonicaChart.data.datasets[2].data;

            for(let i=0; i<dataLen; i++) {
                dHarmonica[i] = 50 + Math.random() * 20;
                dIntrusive[i] = 10 + Math.random() * 10;
                dIR[i] = 5 + Math.random() * 5;
            }
            harmonicaChart.update();
        }

        // Populate Dose Chart Point
        if (doseChart) {
            updateDoseVisuals(65, 'Road Traffic');
        }

        // Force update analysis UI text
        updateAnalysis();
    }
}







            for(let i=0; i<300; i++) {







                val += (Math.random() - 0.5) * 5;







                if (val < 40) val = 40;







                if (val > 80) val = 80;







                dbBuffer.push(val);







            }







            







            // Force init charts if missing







            if (!harmonicaChart && typeof initHarmonicaChart === 'function') initHarmonicaChart();







            if (!doseChart && typeof initDoseChart === 'function') initDoseChart();







    







            // Populate Harmonica Chart History







            if (harmonicaChart) {







                const dataLen = harmonicaChart.data.labels.length; // usually 30







                const dHarmonica = harmonicaChart.data.datasets[0].data;







                const dIntrusive = harmonicaChart.data.datasets[1].data;







                const dIR = harmonicaChart.data.datasets[2].data;







    







                for(let i=0; i<dataLen; i++) {







                    dHarmonica[i] = 50 + Math.random() * 20;







                    dIntrusive[i] = 10 + Math.random() * 10;







                    dIR[i] = 5 + Math.random() * 5;







                }







                harmonicaChart.update();







            }







    







            // Populate Dose Chart Point







            if (doseChart) {







                updateDoseVisuals(65, 'Road Traffic');







            }







    







            // Force update analysis UI text







            updateAnalysis();







        }







    }







    







// Run Demo Data Population on Load



// (Wrapped in timeout to ensure other inits are done)



setTimeout(populateDemoData, 1500);






