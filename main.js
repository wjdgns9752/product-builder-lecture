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

// DOM Elements
const initBtn = document.getElementById('init-btn');
const recordBtn = document.getElementById('record-btn');
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
const classCards = {
    floor: document.getElementById('type-floor'),
    home: document.getElementById('type-home'),
    road: document.getElementById('type-road'),
    train: document.getElementById('type-train'),
    air: document.getElementById('type-air')
};

// ...

// --- Lightweight Internal Sound Classifier (Heuristic) ---
// 외부 AI 모델 대신 주파수 특성(FFT)을 분석하여 소음원을 추정하는 자체 엔진입니다.
// 네트워크 오류 없이 즉시 동작하며 매우 가볍습니다.

let noiseHistory = []; // 최근 패턴 분석용

function analyzeNoiseCharacteristics(dataArray, bufferLength) {
    // 1. Calculate Band Energies
    let lowEnergy = 0;   // ~0-200Hz (Impact, Thud)
    let midLowEnergy = 0; // ~200-1000Hz (Car, Voice base)
    let midHighEnergy = 0; // ~1000-4000Hz (Voice, Siren, Construction)
    let highEnergy = 0;   // ~4000Hz+ (Hiss, Air, Metal)

    // FFT Size 2048 -> Bin size ~21.5 Hz
    // Indexes:
    // 0-9: 0~193Hz (Low)
    // 10-46: 215~989Hz (MidLow)
    // 47-186: 1010~3999Hz (MidHigh)
    // 187-1023: 4000Hz+ (High)

    for(let i=0; i<bufferLength; i++) {
        const val = dataArray[i];
        if (i < 10) lowEnergy += val;
        else if (i < 47) midLowEnergy += val;
        else if (i < 187) midHighEnergy += val;
        else highEnergy += val;
    }

    // Normalize by bin count
    lowEnergy /= 10;
    midLowEnergy /= 37;
    midHighEnergy /= 140;
    highEnergy /= (bufferLength - 187);

    // 2. Identify Dominant Source
    let result = { label: 'none', score: 0 };
    const maxVal = Math.max(lowEnergy, midLowEnergy, midHighEnergy, highEnergy);
    
    // Threshold to ignore silence
    if (maxVal < 30) {
        return { label: 'none', score: 0 };
    }

    // Heuristic Rules
    if (lowEnergy > midLowEnergy * 1.3 && lowEnergy > 50) {
        // 강한 저음 -> 층간소음 (발망치), 둥둥거리는 음악
        result = { label: 'Floor Impact', score: lowEnergy / 255 };
    } 
    else if (midHighEnergy > lowEnergy * 1.5 && midHighEnergy > 50) {
        // 날카로운 소리 -> 항공기(제트음), 금속음, 사이렌
        result = { label: 'Aircraft/Siren', score: midHighEnergy / 255 };
    } 
    else if (midLowEnergy > 50 && midLowEnergy > highEnergy) {
        // 중저음 웅웅거림 -> 도로교통, 일반 생활 소음
        if (Math.abs(midLowEnergy - midHighEnergy) < 20) {
            // 평탄한 소음 -> 도로/지하철
            result = { label: 'Road Traffic', score: midLowEnergy / 255 };
        } else {
            // 변화가 있는 중음 -> 생활 소음 (목소리 등)
            result = { label: 'Household', score: midLowEnergy / 255 };
        }
    }
    else {
        result = { label: 'Household', score: maxVal / 255 };
    }

    return result;
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
        train: document.getElementById('card-train'), // merged with road logic for simplicity
        air: document.getElementById('card-air'),
        none: document.getElementById('card-none')
    };
    
    Object.values(cards).forEach(c => c && c.classList.remove('active'));

    // Text Update
    let displayLabel = "대기 중";

    switch(analysis.label) {
        case 'Floor Impact':
            if(cards.floor) cards.floor.classList.add('active');
            displayLabel = "층간소음 (저주파)";
            break;
        case 'Aircraft/Siren':
            if(cards.air) cards.air.classList.add('active');
            displayLabel = "항공기/금속음";
            break;
        case 'Road Traffic':
            if(cards.road) cards.road.classList.add('active');
            displayLabel = "도로/지하철";
            break;
        case 'Household':
            if(cards.home) cards.home.classList.add('active');
            displayLabel = "생활 소음";
            break;
        default:
            if(cards.none) cards.none.classList.add('active');
            break;
    }

    if (resultText) {
        resultText.textContent = analysis.label === 'none' ? '소음 감지 대기 중' : `${displayLabel} 감지됨`;
    }
}

async function setupAI(stream) {
    // 기존 AI setup 대체: 단순히 UI 초기화만 수행
    const statusLabel = document.getElementById('ai-loader');
    if(statusLabel) statusLabel.textContent = "✅ 자체 분석 엔진 가동 (Lightweight)";
    
    // 분석은 main loop의 analyze() 에서 호출됨
    return true;
}

// (Legacy functions removed/replaced)


// ... rest of the code ...

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

// --- Audio Functions ---
async function startAudio() {
  try {
    if (audioContext && audioContext.state === 'closed') {
        audioContext = null;
    }

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
        
        // Start AI Module independently
        setupAI(stream);
    }

    initBtn.style.display = 'none';
    recordBtn.classList.remove('hidden'); // Show record button
    
    if (!isMonitoring) {
        isMonitoring = true;
        audioInitTime = Date.now(); // Set warm-up start time
        statusText.textContent = "상태: 안정화 중..."; // Update status
        analyze();
        drawSpectrogram();
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

// --- Audio Init Button ---
initBtn.addEventListener('click', async () => {
  await startAudio();
});

// --- Analysis Loop ---
function analyze() {
  requestAnimationFrame(analyze);
  if (!isMonitoring || isPausedForEval) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for(let i = 0; i < bufferLength; i++) {
    const x = dataArray[i] / 255; 
    sum += x * x;
  }
  const rms = Math.sqrt(sum / bufferLength);
  let rawDb = 20 * Math.log10(rms + 0.00001); 
  let calibratedDb = rawDb + dbOffset;
  if (calibratedDb < 0) calibratedDb = 0;
  currentVolumeValue = calibratedDb;
  
  if (!calibModal.classList.contains('hidden')) {
      currentRawDbSpan.textContent = rawDb.toFixed(1);
  }

  // Classifier
  if (calibratedDb > 40 && !isCalibrating) { 
      // Use the new Heuristic Engine
      const analysisResult = analyzeNoiseCharacteristics(dataArray, bufferLength);
      updateInternalClassifierUI(analysisResult);
  } else {
      updateInternalClassifierUI({ label: 'none', score: 0 });
  }

  // Background
  if (calibratedDb < backgroundLevel) {
      backgroundLevel = Math.max(10, backgroundLevel * (1 - decayRate) + calibratedDb * decayRate);
  } else backgroundLevel = backgroundLevel * (1 - adaptationRate) + calibratedDb * adaptationRate;
  
  // Push to Buffer for Advanced Analysis
  dbBuffer.push(calibratedDb);
  if (dbBuffer.length > BUFFER_SIZE) dbBuffer.shift();

  // Run Advanced Analysis every 500ms
  const now = Date.now();
  if (now - lastAnalysisTime > 500) {
      updateAnalysis();
      lastAnalysisTime = now;
  }

  updateUI(calibratedDb, backgroundLevel);
  checkThreshold(calibratedDb, backgroundLevel);
}

// --- Advanced Analysis Function ---
function updateAnalysis() {
    if (dbBuffer.length < 50) return; // Need at least 5 seconds of data

    // 1. Calculate Statistics (Sorted for Percentiles)
    const sortedDb = [...dbBuffer].sort((a, b) => a - b);
    const L90 = sortedDb[Math.floor(sortedDb.length * 0.1)]; // Background (Quiet 10%)
    const L10 = sortedDb[Math.floor(sortedDb.length * 0.9)]; // Peak (Noisy 10%)
    
    // Calculate Leq (Logarithmic Average)
    let sumEnergy = 0;
    for (let db of dbBuffer) {
        sumEnergy += Math.pow(10, db / 10);
    }
    const Leq = 10 * Math.log10(sumEnergy / dbBuffer.length);

    // 2. Metrics for Harmonica & Event Index
    const eventImpact = Math.max(0, Leq - L90); // Component of noise due to events
    const fluctuation = L10 - L90; // Intermittency Proxy
    const intrusivenessRatio = (eventImpact / Math.max(1, Leq)) * 100; // % of total noise that is 'event'

    // 3. Update UI Elements
    const valL90 = document.getElementById('val-l90');
    if (valL90) valL90.textContent = L90.toFixed(1);
    
    const valEvent = document.getElementById('val-event');
    if (valEvent) valEvent.textContent = eventImpact.toFixed(1);
    
    const valIr = document.getElementById('val-ir');
    if (valIr) valIr.textContent = fluctuation.toFixed(1); // Using Fluctuation as simplified IR

    // Dynamic Descriptions (Academic/Scientific Context)
    const descEvent = document.getElementById('desc-event');
    const descIr = document.getElementById('desc-ir');
    
    if (descEvent) {
        if (eventImpact < 3) descEvent.textContent = "Low Salience (배경 소음 우세)";
        else if (eventImpact < 8) descEvent.textContent = "Moderate Salience (이벤트 감지됨)";
        else descEvent.textContent = "High Acoustic Salience (강한 돌발성, Harmonica Index↑)";
    }
    
    if (descIr) {
        if (fluctuation < 10) descIr.textContent = "Constant (시간적 구조 안정)";
        else if (fluctuation < 30) descIr.textContent = "Fluctuating (일반적 변동)";
        else descIr.textContent = "High Intermittency (높은 간헐성, DYNAMAP 기준)";
    }

    // Harmonica 'Pencil' Visualization
    const pencilWrapper = document.querySelector('.pencil-wrapper');
    const pencilBody = document.getElementById('pencil-body');
    const pencilTip = document.getElementById('pencil-tip');
    const labelBody = document.getElementById('label-body');
    const labelTip = document.getElementById('label-tip');

    if (pencilWrapper && pencilBody && pencilTip) {
        // Map dB to % (Scale: 0dB to 120dB)
        const maxScale = 120;
        const totalLeqPercent = Math.min(100, Math.max(0, (Leq / maxScale) * 100));
        
        // Width of the entire pencil (Total Leq)
        pencilWrapper.style.width = `${totalLeqPercent}%`;
        
        // Inside the pencil: split between Body (L90) and Tip (Event)
        // Ratio of Background to Total
        const totalVal = Math.max(0.1, Leq); // Avoid divide by zero
        const bodyPercent = (L90 / totalVal) * 100;
        const tipPercent = 100 - bodyPercent;

        pencilBody.style.width = `${bodyPercent}%`;
        pencilTip.style.width = `${tipPercent}%`;
        
        // Update Labels inside pencil
        if (labelBody) labelBody.textContent = L90.toFixed(0);
        if (labelTip) labelTip.textContent = eventImpact > 1 ? `+${eventImpact.toFixed(0)}` : '';
    }
    
    // 4. Generate Comment (Contextual Analysis)
    const badge = document.getElementById('noise-badge');
    const comment = document.getElementById('analysis-comment');
    
    if (badge && comment) {
        // Logic based on HARMONICA/DYNAMAP concepts
        if (fluctuation < 5) {
            badge.textContent = "Steady (지속음)";
            badge.className = "badge steady";
            comment.textContent = "변동이 적은 지속적인 소음입니다. (예: 냉장고, 멀리서 들리는 도로 소음)";
        } else if (eventImpact > 10) {
            badge.textContent = "Impulsive (충격음)";
            badge.className = "badge impulsive";
            comment.textContent = `배경 소음보다 ${eventImpact.toFixed(0)}dB 높은 돌발 소음이 감지됩니다. 불쾌감이 클 수 있습니다. (예: 발소리, 물건 낙하)`;
        } else {
            badge.textContent = "Intermittent (간헐적)";
            badge.className = "badge intermittent";
            comment.textContent = "불규칙한 소음 변화가 감지됩니다. (예: 대화 소리, 가까운 TV 소리)";
        }
    }
}

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
      timestamp: serverTimestamp()
      // Note: We are not uploading the audio blob to Firestore here because it requires Storage setup.
      // The user can download it locally.
    };
    await addDoc(collection(db, "noise_evaluations"), payload);
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

function drawSpectrogram() {
  requestAnimationFrame(drawSpectrogram);
  if (!isMonitoring || isPausedForEval) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  canvasCtx.drawImage(canvas, -1, 0);
  for (let i = 0; i < bufferLength; i++) {
    const value = dataArray[i];
    const percent = value / 255;
    const hue = (1 - percent) * 240; 
    canvasCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    const y = height - Math.floor((i / bufferLength) * height);
    const h = Math.ceil(height / bufferLength); 
    canvasCtx.fillRect(width - 1, y - h, 1, h);
  }
}

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