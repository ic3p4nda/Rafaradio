// Audio management module

export const audio = document.getElementById('audio') || new Audio();
if (!audio.preload) audio.preload = 'auto';

export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;

let sourceNode = null;
try {
  sourceNode = audioCtx.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
} catch (e) {
  console.warn('MediaElementSource may have already been connected:', e);
}

export const bufferLength = analyser.frequencyBinCount;
export const dataArray = new Uint8Array(bufferLength);

document.addEventListener(
  'click',
  () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  },
  { once: true }
);

// Volume and crossfade state
let crossfadeInterval = null;
const CROSSFADE_DURATION = 400; // 400ms

export function fadeVolumeTo(targetVolume, durationMs, callback) {
  if (crossfadeInterval) clearInterval(crossfadeInterval);
  
  const startVolume = audio.volume;
  const difference = targetVolume - startVolume;
  const stepTime = 20; // 20ms steps
  const totalSteps = durationMs / stepTime;
  let currentStep = 0;

  crossfadeInterval = setInterval(() => {
    currentStep++;
    const fraction = currentStep / totalSteps;
    const newVol = startVolume + difference * fraction;
    audio.volume = Math.max(0, Math.min(1, newVol));

    if (currentStep >= totalSteps) {
      clearInterval(crossfadeInterval);
      audio.volume = targetVolume;
      if (callback) callback();
    }
  }, stepTime);
}

export async function playWithFade(volumeBarValue, enableFade = true) {
  const targetVol = parseFloat(volumeBarValue);
  if (enableFade) {
    audio.volume = 0;
    await audio.play();
    fadeVolumeTo(targetVol, CROSSFADE_DURATION);
  } else {
    audio.volume = targetVol;
    await audio.play();
  }
}

export function pauseWithFade(volumeBarValue, enableFade = true, callback) {
  if (enableFade) {
    fadeVolumeTo(0, CROSSFADE_DURATION, () => {
      audio.pause();
      audio.volume = parseFloat(volumeBarValue);
      if (callback) callback();
    });
  } else {
    audio.pause();
    if (callback) callback();
  }
}

// Sleep Timer State & Logic
export let sleepTimerTimeout = null;
export let sleepTimerInterval = null;
export let sleepTimerEndTime = null;

export function startSleepTimer(minutes, onFinished, onUpdate) {
  clearSleepTimer();
  if (minutes <= 0) return;

  sleepTimerEndTime = Date.now() + minutes * 60000;
  
  if (onUpdate) onUpdate(sleepTimerEndTime);
  
  sleepTimerInterval = setInterval(() => {
    if (onUpdate) onUpdate(sleepTimerEndTime);
  }, 1000);

  sleepTimerTimeout = setTimeout(() => {
    if (onFinished) onFinished();
    clearSleepTimer();
  }, minutes * 60000);
}

export function clearSleepTimer() {
  if (sleepTimerTimeout) clearTimeout(sleepTimerTimeout);
  if (sleepTimerInterval) clearInterval(sleepTimerInterval);
  sleepTimerTimeout = null;
  sleepTimerInterval = null;
  sleepTimerEndTime = null;
}
