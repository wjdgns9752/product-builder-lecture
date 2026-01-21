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
        await startAudio();
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
        if(sysMsg) sysMsg.textContent = "⏳ 모델 초기화 중...";
        
        // Load Graph Model directly from Kaggle/TFHub
        yamnetModel = await tf.loadGraphModel(YAMNET_MODEL_URL, { fromTFHub: true });
        
        if(sysBar) {
            sysMsg.textContent = "✅ AI 준비 완료";
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
const CLASS_MAPPING = {
    'floor': ['knock', 'thump', 'thud', 'footsteps', 'bumping', 'impact', 'door', 'beat', 'tap', 'clatter', 'shuffling', 'walking'],
    'home': ['speech', 'conversation', 'laughter', 'domestic', 'vacuum', 'blender', 'water', 'music', 'television', 'shout', 'singing', 'baby', 'child', 'bark', 'meow', 'dish', 'glass', 'cooking', 'alarm'],
    'road': ['vehicle', 'traffic', 'car', 'bus', 'truck', 'motor', 'siren', 'horn', 'tire', 'engine', 'skidding', 'transport', 'emergency'],
    'train': ['rail', 'train', 'subway', 'metro', 'locomotive', 'railroad'],
    'air': ['aircraft', 'airplane', 'helicopter', 'jet', 'propeller', 'aviation']
};

async function analyzeNoiseCharacteristics() {
    // Safety check
    if (!yamnetModel) return { label: 'none', score: 0 };
    
    // Reset stuck processing
    if (isModelProcessing) {
        if (window.lastModelStartTime && Date.now() - window.lastModelStartTime > 2000) {
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

    try {
        const inputData = yamnetAudioBuffer.slice(yamnetAudioBuffer.length - YAMNET_INPUT_SIZE);
        
        // Prepare Tensor: [1, 16000] (Batch size of 1)
        const inputTensor = tf.tensor(inputData).expandDims(0);
        
        // Execute Model
        const results = yamnetModel.execute(inputTensor); // Use execute for GraphModel
        
        // YAMNet typically returns [scores, embeddings, log_mel]. 
        // We need scores (index 0). 
        // If results is a single tensor, use it. If array, take first.
        let scoreTensor;
        if (Array.isArray(results)) {
            scoreTensor = results[0];
        } else {
            scoreTensor = results;
        }

        const scores = await scoreTensor.data(); // Async data retrieval
        
        // Cleanup
        inputTensor.dispose();
        if (Array.isArray(results)) {
            results.forEach(t => t.dispose());
        } else {
            results.dispose();
        }

        // Map scores to classes
        const predictions = [];
        for(let i=0; i<scores.length; i++) {
            if (YAMNET_CLASSES[i]) {
                predictions.push({
                    className: YAMNET_CLASSES[i],
                    probability: scores[i]
                });
            }
        }
        
        // Sort descending
        predictions.sort((a, b) => b.probability - a.probability);
        const rawPredictions = predictions;

        if (!rawPredictions || rawPredictions.length === 0) {
            isModelProcessing = false;
            return { label: 'none', score: 0 };
        }

        // Dashboard Status Update
        const recEl = document.getElementById('ai-step-recognition');
        const reasonEl = document.getElementById('ai-reasoning');
        
        const topPrediction = rawPredictions[0];
        const rawLabel = topPrediction.className || 'none';
        const maxScore = topPrediction.probability || 0;

        latestPredictionText = `${rawLabel} (${(maxScore*100).toFixed(0)}%)`;

        if (recEl && reasonEl) {
            if (true) { // Always show for debugging
                const top3Names = rawPredictions.slice(0, 3).map(p => `${p.className}(${(p.probability*100).toFixed(0)}%)`).join(', ');
                recEl.textContent = `🎯 감지: ${rawLabel}`;
                recEl.style.color = "#2196f3";
                reasonEl.innerHTML = `분석 중: <strong>${rawLabel}</strong> 특징이 가장 강함.<br><small>후보: ${top3Names}</small>`;
            } else {
                recEl.textContent = `대기 (최대: ${(maxScore*100).toFixed(1)}%)`;
                recEl.style.color = "#4caf50";
            }
        }

        // Map to App Categories
        let bestLabel = 'none';
        let highestCategoryScore = 0;

        const candidates = rawPredictions.slice(0, 5);
        for (const pred of candidates) {
            const labelLower = pred.className.toLowerCase();
            for (const [category, keywords] of Object.entries(CLASS_MAPPING)) {
                if (keywords.some(k => labelLower.includes(k))) {
                    if (pred.probability > highestCategoryScore) {
                        highestCategoryScore = pred.probability;
                        bestLabel = category;
                    }
                }
            }
        }
        
        // Threshold for final decision
        if (highestCategoryScore < 0.05) bestLabel = 'none';

        // Update Card UI
        const cards = {
            home: document.getElementById('card-home'),
            floor: document.getElementById('card-floor'),
            road: document.getElementById('card-road'),
            train: document.getElementById('card-train'), 
            air: document.getElementById('card-air'),
            none: document.getElementById('card-none')
        };
        
        Object.values(cards).forEach(c => c && c.classList.remove('active'));
        const cardKey = bestLabel === 'none' ? 'none' : bestLabel;
        if (cards[cardKey]) cards[cardKey].classList.add('active');

        isModelProcessing = false;
        return { label: bestLabel, score: highestCategoryScore };

    } catch (e) {
        console.error("AI Inference Error:", e);
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
    tempCtx.fillStyle = getMagmaColor(value);
    
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
    if (!isMonitoring || !map || Date.now() - lastMapRecordTime < 5000) return;
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        const timestamp = new Date().toLocaleTimeString();
        let color = currentVolumeValue > 65 ? '#f44336' : (currentVolumeValue > 50 ? '#ffeb3b' : '#4caf50');
        
        const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: color,
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        marker.bindPopup(`<b>${currentVolumeValue.toFixed(1)} dB</b><br>시간: ${timestamp}`);
        noiseHistory.push({ lat, lng, db: currentVolumeValue, marker });
        saveMapData();
        
        if (noiseHistory.length > 50) {
            const old = noiseHistory.shift();
            map.removeLayer(old.marker);
        }
        lastMapRecordTime = Date.now();
    }, null, { enableHighAccuracy: true });
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

    initBtn.style.display = 'none';
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
        initBtn.style.display = 'none';
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
  
  if (!calibModal.classList.contains('hidden')) {
      currentRawDbSpan.textContent = rawDb.toFixed(1);
  }

  // 4. Run Classifier (Model) & Update Dose-Response
  if (calibratedDb > 40 && !isCalibrating) { 
      analyzeNoiseCharacteristics().then(result => {
          // Update UI regardless of 'none' label to ensure status reflects current state
          updateInternalClassifierUI(result);
          if(result.label !== 'none') {
              updateDoseVisuals(calibratedDb, result.label); 
          }
      }).catch(err => console.error("AI Analysis Loop Error:", err));
  } else {
      updateInternalClassifierUI({ label: 'none', score: 0 });
      // updateDoseVisuals(calibratedDb, 'none'); // Optional: Update chart background point even if silence
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
  if (ph && ct && dbBuffer.length > 10) {
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
function updateAnalysis() {
    if (dbBuffer.length < 5) return;

    const sortedDb = [...dbBuffer].sort((a, b) => a - b);
    const L90 = sortedDb[Math.floor(sortedDb.length * 0.1)];
    const L10 = sortedDb[Math.floor(sortedDb.length * 0.9)];
    const maxDb = Math.max(...dbBuffer);
    
    let sumEnergy = 0;
    for (let db of dbBuffer) {
        sumEnergy += Math.pow(10, db / 10);
    }
    const Leq = 10 * Math.log10(sumEnergy / dbBuffer.length);

    // Update Analysis View Elements
    const valL90 = document.getElementById('val-l90');
    const valEvent = document.getElementById('val-event');
    const valMax = document.getElementById('val-max');
    
    if (valL90) valL90.textContent = L90.toFixed(1);
    if (valEvent) valEvent.textContent = (Leq - L90).toFixed(1);
    if (valMax) valMax.textContent = maxDb.toFixed(1);

    // Update Analysis Comment
    const badge = document.getElementById('noise-badge');
    const comment = document.getElementById('analysis-comment');
    
    if (badge && comment) {
        if (Leq > 70) {
            badge.textContent = "위험";
            badge.className = "badge impulsive";
            comment.textContent = "심한 소음! 장시간 노출 시 난청 위험이 있습니다.";
        } else if (Leq > 55) {
            badge.textContent = "경고";
            badge.className = "badge intermittent";
            comment.textContent = "조용한 집중이 불가능한 수준입니다.";
        } else {
            badge.textContent = "양호";
            badge.className = "badge steady";
            comment.textContent = "안정적이고 쾌적한 소음 수준입니다.";
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
            if (!doseChart) {
                initDoseChart();
            }
            // Update analysis with current buffer data
            updateAnalysis();
            if (currentVolumeValue > 0) {
                // Determine source for dose visuals update
                // (Using the last detected or default to none)
                updateDoseVisuals(currentVolumeValue, 'none'); 
            }
        }
    });
});

// --- Dose-Response Analysis (Chart.js) ---
let doseChart = null;
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
