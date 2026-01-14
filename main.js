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

// Background Noise Tracking (in dB)
let backgroundLevel = 40; // Default est. dB
const adaptationRate = 0.005; 
const decayRate = 0.05;      

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
  if (isMonitoring) {
      if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume();
      }
      return true;
  }

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

    initBtn.style.display = 'none';
    recordBtn.classList.remove('hidden'); // Show record button
    isMonitoring = true;
    statusText.textContent = "상태: 모니터링 중...";
    
    analyze();
    drawSpectrogram();
    
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        globalStream = stream; // Store for MediaRecorder
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; 
        analyser.smoothingTimeConstant = 0.6; 
        microphone.connect(analyser);
        initBtn.style.display = 'none';
        isMonitoring = true;
        analyze();
        drawSpectrogram();
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
        statusText.textContent = "상태: 마이크 보정 중... (평가 중지)";

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
        autoCalibBtn.textContent = `⏳ 측정 중... (기기: ${model})`;
        
        try {
            if (!isPlayingNoise) playPinkNoise();

            setTimeout(() => {
                let sumDb = 0;
                let samples = 0;
                const measurementInterval = setInterval(() => {
                    const rawDb = parseFloat(currentRawDbSpan.textContent);
                    if (!isNaN(rawDb) && rawDb > -100) {
                        sumDb += rawDb;
                        samples++;
                    }
                }, 100);

                setTimeout(() => {
                    clearInterval(measurementInterval);
                    stopPinkNoise();
                    
                    if (samples > 5) { 
                        const avgRawDb = sumDb / samples;
                        dbOffset = referenceSPL - avgRawDb;
                        localStorage.setItem('dbOffset', dbOffset);
                        alert(`[자동 보정 완료]\n보정값: ${dbOffset.toFixed(1)} dB`);
                        calibModal.classList.add('hidden');
                    }
                    
                    // Cooldown to prevent tail noise alarm
                    setTimeout(() => {
                        autoCalibBtn.disabled = false;
                        autoCalibBtn.textContent = "🚀 자동 보정 시작";
                        isCalibrating = false;
                        statusText.textContent = "상태: 감지 중...";
                    }, 1500);
                }, 3000); 
            }, 1000); 
        } catch (e) {
            autoCalibBtn.disabled = false;
            isCalibrating = false;
            stopPinkNoise();
        }
    });
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
      let lowEnergy = 0, midLowEnergy = 0, midHighEnergy = 0;
      for(let i=0; i<10; i++) lowEnergy += dataArray[i];
      for(let i=10; i<42; i++) midLowEnergy += dataArray[i];
      for(let i=42; i<170; i++) midHighEnergy += dataArray[i];
      
      lowEnergy /= 10; midLowEnergy /= 32; midHighEnergy /= 128;
      const maxEnergy = Math.max(lowEnergy, midLowEnergy, midHighEnergy);
      
      Object.values(classCards).forEach(c => c.classList.remove('active'));
      if (maxEnergy === lowEnergy) classCards.floor.classList.add('active'); 
      else if (maxEnergy === midLowEnergy) {
           if (midLowEnergy > 150) classCards.air.classList.add('active'); 
           else classCards.road.classList.add('active');
      } else classCards.home.classList.add('active');
  } else {
      Object.values(classCards).forEach(c => c.classList.remove('active'));
  }

  // Background
  if (calibratedDb < backgroundLevel) {
      backgroundLevel = Math.max(10, backgroundLevel * (1 - decayRate) + calibratedDb * decayRate);
  } else backgroundLevel = backgroundLevel * (1 - adaptationRate) + calibratedDb * adaptationRate;
  
  updateUI(calibratedDb, backgroundLevel);
  checkThreshold(calibratedDb, backgroundLevel);
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
  
  // Auto-download the labeled file for training data
  if (downloadLink.href) {
      downloadLink.click();
  }

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