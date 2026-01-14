// Firebase Integration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB80YVLtFSBs2l3TiazSRj0xsgOBeUZG4I",
  authDomain: "noise-monitoring-5764d.firebaseapp.com",
  projectId: "noise-monitoring-5764d",
  storageBucket: "noise-monitoring-5764d.firebasestorage.app",
  messagingSenderId: "250708015230",
  appId: "1:250708015230:web:676e299df9ef6ca00d002f",
  measurementId: "G-1BCMY7SVDQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM Elements
const initBtn = document.getElementById('init-btn');
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
let isMonitoring = false;
let isPausedForEval = false; 
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

// Background Noise Tracking (in dB)
let backgroundLevel = 40; // Default est. dB
const adaptationRate = 0.005; 
const decayRate = 0.05;      

// Visualizer State
let tempCanvas = document.createElement('canvas');
let tempCtx = tempCanvas.getContext('2d');
tempCanvas.width = canvas.width;
tempCanvas.height = canvas.height;

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

// --- Audio Functions (Moved Up for Safety) ---
async function startAudio() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    microphone = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; 
    analyser.smoothingTimeConstant = 0.6; 
    
    microphone.connect(analyser);

    initBtn.style.display = 'none';
    isMonitoring = true;
    statusText.textContent = "상태: 모니터링 중...";
    
    // Start Analysis Loop
    analyze();
    drawSpectrogram();
    
    return true; // Success
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('마이크에 접근할 수 없습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
    return false; // Failed
  }
}

// --- Auto Calibration Logic (Loopback) ---
autoCalibBtn.addEventListener('click', async () => {
    console.log("Auto Calibration Started");
    
    // Ensure Audio Context is Ready
    if (!audioContext || audioContext.state === 'suspended') {
        const success = await startAudio();
        if (!success) {
            console.error("Failed to start audio for calibration");
            return;
        }
    }

    // Update UI
    autoCalibBtn.disabled = true;
    autoCalibBtn.textContent = "⏳ 측정 중... (최대 볼륨 유지)";
    
    try {
        // 1. Start Noise if not playing
        if (!isPlayingNoise) playPinkNoise();

        // 2. Wait for stabilization (1s)
        setTimeout(() => {
            // 3. Measure for 3 seconds
            let sumDb = 0;
            let samples = 0;
            
            const measurementInterval = setInterval(() => {
                // Read from the global calculated value, not the DOM for better precision
                // But currentVolumeValue is already calibrated, we need RAW value.
                // We can recalculate raw from currentVolumeValue or use the DOM span which shows raw.
                // Let's use the DOM span as it's updated in analyze() with rawDb.
                const rawDb = parseFloat(currentRawDbSpan.textContent);
                
                if (!isNaN(rawDb) && rawDb > -100) {
                    sumDb += rawDb;
                    samples++;
                }
            }, 100);

            setTimeout(() => {
                clearInterval(measurementInterval);
                stopPinkNoise();
                
                if (samples > 5) { // At least some valid samples
                    const avgRawDb = sumDb / samples;
                    // Heuristic: Max Volume Phone ~ 75dB SPL
                    const referenceSPL = 75; 
                    const newOffset = referenceSPL - avgRawDb;
                    
                    dbOffset = newOffset;
                    localStorage.setItem('dbOffset', dbOffset);
                    
                    alert(`[자동 보정 완료]\n평균 입력: ${avgRawDb.toFixed(1)} dBFS\n기준 출력: ${referenceSPL} dB\n보정값: ${newOffset.toFixed(1)} dB\n\n설정이 저장되었습니다.`);
                    calibModal.classList.add('hidden');
                } else {
                    alert("측정된 소리가 너무 작거나 없습니다.\n마이크 권한을 확인하거나 볼륨을 키워주세요.");
                }
                
                // Reset UI
                autoCalibBtn.disabled = false;
                autoCalibBtn.textContent = "🚀 자동 보정 시작";
            }, 3000); // Measure for 3s
            
        }, 1000); // Warmup 1s
    } catch (e) {
        console.error("Calibration Error:", e);
        alert("보정 중 오류가 발생했습니다.");
        autoCalibBtn.disabled = false;
        autoCalibBtn.textContent = "🚀 자동 보정 시작";
        stopPinkNoise();
    }
});

// --- Audio Initialization Button ---
initBtn.addEventListener('click', async () => {
  if (isMonitoring) return;
  await startAudio();
});

// --- Analysis Loop ---
function analyze() {
  requestAnimationFrame(analyze);

  if (!isMonitoring || isPausedForEval) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Calculate RMS
  let sum = 0;
  for(let i = 0; i < bufferLength; i++) {
    const x = dataArray[i] / 255; 
    sum += x * x;
  }
  const rms = Math.sqrt(sum / bufferLength);
  
  // Convert RMS to Decibels
  let rawDb = 20 * Math.log10(rms + 0.00001); 
  let calibratedDb = rawDb + dbOffset;
  
  if (calibratedDb < 0) calibratedDb = 0;
  
  currentVolumeValue = calibratedDb;
  
  // Calibration Modal Live Update
  if (!calibModal.classList.contains('hidden')) {
      currentRawDbSpan.textContent = rawDb.toFixed(1);
  }

  // Adaptive Background Logic
  if (calibratedDb < backgroundLevel) {
      backgroundLevel = Math.max(10, backgroundLevel * (1 - decayRate) + calibratedDb * decayRate);
  } else {
      backgroundLevel = backgroundLevel * (1 - adaptationRate) + calibratedDb * adaptationRate;
  }
  
  updateUI(calibratedDb, backgroundLevel);
  checkThreshold(calibratedDb, backgroundLevel);
}

function updateUI(current, bg) {
  meterBar.style.width = `${Math.min(100, Math.max(0, current))}%`;
  bgMarker.style.left = `${Math.min(100, Math.max(0, bg))}%`;
  
  currentVolSpan.textContent = Math.round(current);
  bgVolSpan.textContent = Math.round(bg);
  
  if (current > 75) { 
     meterBar.style.backgroundColor = '#f44336'; 
  } else if (current > 50) { 
     meterBar.style.backgroundColor = '#ffeb3b'; 
  } else { 
     meterBar.style.backgroundColor = '#4caf50'; 
  }
}

function checkThreshold(current, bg) {
  if (Date.now() - lastEvalTime < GRACE_PERIOD_MS) {
      durationBar.style.width = '0%';
      return;
  }

  if (current < 30) { 
      noiseStartTime = 0;
      durationBar.style.width = '0%';
      statusText.textContent = "상태: 감지 중 (조용함)";
      return;
  }

  const percentIncrease = parseInt(thresholdSlider.value);
  const triggerGap = 25 - (percentIncrease / 100 * 20); 
  const triggerLevel = bg + triggerGap;
  
  if (current > triggerLevel) {
      if (noiseStartTime === 0) noiseStartTime = Date.now();
      
      const duration = Date.now() - noiseStartTime;
      const progress = Math.min(100, (duration / TRIGGER_DURATION_MS) * 100);
      durationBar.style.width = `${progress}%`;
      
      statusText.textContent = `상태: 소음 감지! 기준+${Math.round(triggerGap)}dB (${(duration/1000).toFixed(1)}s)`;

      if (duration > TRIGGER_DURATION_MS) {
          triggerAlarm();
      }
  } else {
      noiseStartTime = 0;
      durationBar.style.width = '0%';
      statusText.textContent = "상태: 감지 중...";
  }
}

function triggerAlarm() {
  if (isPausedForEval) return; 
  isPausedForEval = true; 
  noiseStartTime = 0;
  durationBar.style.width = '100%';
  
  statusText.textContent = "상태: 지속적 소음 발생! 평가 필요";
  if (audioAlarmCheckbox.checked) playBeep();
  showEvaluationModal();
}

function playBeep() {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.type = 'square';
    osc.frequency.value = 880; 
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
}

// --- Calibration Logic ---

calibBtn.addEventListener('click', async () => {
    if (!audioContext) await startAudio();
    calibModal.classList.remove('hidden');
});

cancelCalibBtn.addEventListener('click', () => {
    stopPinkNoise();
    calibModal.classList.add('hidden');
});

playNoiseBtn.addEventListener('click', () => {
    if (isPlayingNoise) stopPinkNoise();
    else playPinkNoise();
});

saveCalibBtn.addEventListener('click', () => {
    const realDb = parseFloat(realDbInput.value);
    const rawDbText = currentRawDbSpan.textContent;
    
    if (isNaN(realDb) || rawDbText === '...') {
        alert("실제 dB 값을 입력하고 마이크 입력을 확인해주세요.");
        return;
    }

    const currentRaw = parseFloat(rawDbText);
    dbOffset = realDb - currentRaw;
    
    localStorage.setItem('dbOffset', dbOffset);
    alert(`보정 완료! 보정값(${dbOffset.toFixed(1)}dB)이 저장되었습니다.`);
    stopPinkNoise();
    calibModal.classList.add('hidden');
});

function playPinkNoise() {
    if (!audioContext) return;
    
    // Pink Noise Generator
    const bufferSize = 4096;
    const pinkBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const data = pinkBuffer.getChannelData(0);
    
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    
    for(let i=0; i<data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        data[i] *= 0.11; 
        b6 = white * 0.115926;
    }

    noiseNode = audioContext.createBufferSource();
    noiseNode.buffer = pinkBuffer;
    noiseNode.loop = true;
    noiseNode.connect(audioContext.destination);
    noiseNode.start();
    
    isPlayingNoise = true;
    playNoiseBtn.textContent = "⏹️ 핑크 노이즈 중지";
}

function stopPinkNoise() {
    if (noiseNode) {
        noiseNode.stop();
        noiseNode = null;
    }
    isPlayingNoise = false;
    playNoiseBtn.textContent = "🔊 핑크 노이즈 재생";
}

// --- Evaluation / Survey Logic ---

function showEvaluationModal() {
  modal.classList.remove('hidden');
  resetRatingUI();
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

// Handle Rating Click
rateBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    rateBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRating = btn.dataset.val;
    selectedValSpan.textContent = selectedRating;
    checkSubmitReady();
  });
});

// Handle Chip Click
Object.entries(chipGroups).forEach(([type, chips]) => {
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            surveyData[type] = chip.dataset.val;
            checkSubmitReady();
        });
    });
});

function checkSubmitReady() {
    submitEvalBtn.disabled = (selectedRating === null);
}

submitEvalBtn.addEventListener('click', async () => {
  if (selectedRating === null) return;
  
  try {
    const payload = {
      rating: parseInt(selectedRating, 10),
      noiseLevel: parseFloat(currentVolumeValue.toFixed(1)),
      backgroundLevel: Math.round(backgroundLevel),
      context: {
          activity: surveyData.activity || 'unknown',
          source: surveyData.source || 'unknown'
      },
      userAgent: navigator.userAgent, 
      timestamp: serverTimestamp()
    };

    await addDoc(collection(db, "noise_evaluations"), payload);
    console.log("Firebase storage successful", payload);
  } catch (err) {
    console.error('Firebase storage error:', err);
  }
  
  hideEvaluationModal();
  lastEvalTime = Date.now();
  statusText.textContent = "상태: 안정화 중...";
  isPausedForEval = false; 
  meterBar.style.width = '0%';
  durationBar.style.width = '0%';
  if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
  }
});

// --- Visualizer ---
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