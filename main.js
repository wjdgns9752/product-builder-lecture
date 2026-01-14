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

const initBtn = document.getElementById('init-btn');
const meterBar = document.getElementById('meter-bar');
const bgMarker = document.getElementById('bg-marker');
const currentVolSpan = document.getElementById('current-vol');
const bgVolSpan = document.getElementById('bg-vol');
const statusText = document.getElementById('status-text');
const durationBar = document.getElementById('duration-bar'); // New
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const thresholdSlider = document.getElementById('threshold');
const thresholdVal = document.getElementById('threshold-val');
const audioAlarmCheckbox = document.getElementById('audio-alarm');
const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

// Modal Elements
const modal = document.getElementById('evaluation-modal');
const rateBtns = document.querySelectorAll('.rate-btn');
const submitEvalBtn = document.getElementById('submit-eval');
const selectedValSpan = document.getElementById('selected-val');

let audioContext;
let analyser;
let microphone;
let isMonitoring = false;
let isPausedForEval = false; 
let selectedRating = null;
let currentVolumeValue = 0; // Current noise level to save

// Duration Logic
let noiseStartTime = 0;
const TRIGGER_DURATION_MS = 2000; // 2 seconds

// Grace period logic
let lastEvalTime = 0;
const GRACE_PERIOD_MS = 3000; 

// Background Noise Tracking
let backgroundLevel = 30; 
const adaptationRate = 0.005; 
const decayRate = 0.05;      

// Spectrogram variables
let tempCanvas = document.createElement('canvas');
let tempCtx = tempCanvas.getContext('2d');
tempCanvas.width = canvas.width;
tempCanvas.height = canvas.height;

// Theme Logic
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
  body.classList.add('dark-mode');
}

themeToggleBtn.addEventListener('click', () => {
  body.classList.toggle('dark-mode');
  const theme = body.classList.contains('dark-mode') ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
});

// Settings Logic
thresholdSlider.addEventListener('input', (e) => {
  thresholdVal.textContent = e.target.value;
});

// Audio Logic
initBtn.addEventListener('click', async () => {
  if (isMonitoring) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    microphone = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3; 
    
    microphone.connect(analyser);

    initBtn.style.display = 'none';
    
    isMonitoring = true;
    statusText.textContent = "상태: 초기화 및 배경 소음 학습 중...";
    
    // Start loops
    analyze();
    drawSpectrogram();
    
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('마이크에 접근할 수 없습니다. 권한을 허용해주세요.');
  }
});

function analyze() {
  requestAnimationFrame(analyze);

  if (!isMonitoring) return;
  if (isPausedForEval) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for(let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const average = sum / bufferLength;
  
  // Normalize
  let currentVolume = Math.round((average / 255) * 100 * 3.0);
  currentVolumeValue = currentVolume; // Store for saving
  
  // Adaptive Background Logic
  if (currentVolume < backgroundLevel) {
      backgroundLevel = Math.max(10, backgroundLevel * (1 - decayRate) + currentVolume * decayRate);
  } else {
      backgroundLevel = backgroundLevel * (1 - adaptationRate) + currentVolume * adaptationRate;
  }
  
  updateUI(currentVolume, backgroundLevel);
  checkThreshold(currentVolume, backgroundLevel);
}

function updateUI(current, bg) {
  meterBar.style.width = `${Math.min(100, current)}%`;
  bgMarker.style.left = `${Math.min(100, bg)}%`;
  currentVolSpan.textContent = Math.round(current);
  bgVolSpan.textContent = Math.round(bg);
  
  if (current > bg * 1.5) {
     meterBar.style.backgroundColor = '#f44336'; 
  } else if (current > bg * 1.2) {
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

  const MIN_ABSOLUTE_VOLUME = 15; 
  if (current < MIN_ABSOLUTE_VOLUME) {
      noiseStartTime = 0;
      durationBar.style.width = '0%';
      statusText.textContent = "상태: 감지 중 (조용함)";
      return;
  }

  const percentIncrease = parseInt(thresholdSlider.value);
  const triggerLevel = bg * (1 + percentIncrease / 100);
  
  if (current > triggerLevel) {
      // Noise exceeded threshold
      if (noiseStartTime === 0) {
          noiseStartTime = Date.now();
      }
      
      const duration = Date.now() - noiseStartTime;
      const progress = Math.min(100, (duration / TRIGGER_DURATION_MS) * 100);
      durationBar.style.width = `${progress}%`;
      
      statusText.textContent = `상태: 지속 소음 감지 중 (${(duration/1000).toFixed(1)}s)`;

      if (duration > TRIGGER_DURATION_MS) {
          triggerAlarm();
      }

  } else {
      // Noise dropped below threshold
      // Optional: Add a small decay here so brief silences don't instantly reset duration
      // For now, instant reset is safer to prevent false alarms
      noiseStartTime = 0;
      durationBar.style.width = '0%';
      statusText.textContent = "상태: 감지 중...";
  }
}

function triggerAlarm() {
  if (isPausedForEval) return; 
  
  isPausedForEval = true; 
  noiseStartTime = 0; // Reset for next time
  durationBar.style.width = '100%'; // Show full bar
  
  statusText.textContent = "상태: 지속적 소음 발생! 평가 필요";
  if (audioAlarmCheckbox.checked) {
    playBeep();
  }

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

// Evaluation Logic
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
}

rateBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    rateBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRating = btn.dataset.val;
    selectedValSpan.textContent = selectedRating;
    submitEvalBtn.disabled = false;
  });
});

submitEvalBtn.addEventListener('click', async () => {
  if (selectedRating === null) return;

  console.log(`User evaluated noise event: ${selectedRating}/10`);

  // Save to Firebase
  try {
    await addDoc(collection(db, "noise_evaluations"), {
      rating: parseInt(selectedRating, 10),
      noiseLevel: currentVolumeValue,
      backgroundLevel: Math.round(backgroundLevel),
      timestamp: serverTimestamp()
    });
    console.log("Firebase storage successful");
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


function drawSpectrogram() {
  requestAnimationFrame(drawSpectrogram);

  if (!isMonitoring) return;
  if (isPausedForEval) return; 

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