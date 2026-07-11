// Keyboard and global player controls manager

export function playTickSound(audioCtx) {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.02);
    
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.025);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.03);
  } catch (err) {
    console.warn('Sound synthesis ignored:', err);
  }
}

export function registerKeyboardShortcuts(audio, audioCtx, controls) {
  document.addEventListener('keydown', (e) => {
    // Escape key handling
    if (e.key === 'Escape' || e.code === 'Escape') {
      let closedAny = false;
      if (controls.isVisualizerActive()) {
        controls.toggleWaveformVisualizer(false);
        closedAny = true;
      }
      if (controls.cloudPanel.classList.contains('open')) {
        controls.cloudPanel.classList.remove('open');
        controls.cloudToggle.classList.remove('active');
        closedAny = true;
      }
      if (controls.playlistPanel.classList.contains('open')) {
        controls.playlistPanel.classList.remove('open');
        controls.playlistToggle.classList.remove('active');
        if (controls.newPlaylistForm) controls.newPlaylistForm.style.display = 'none';
        if (controls.importPlaylistForm) controls.importPlaylistForm.style.display = 'none';
        closedAny = true;
      }
      if (controls.settingsPanel.classList.contains('open')) {
        controls.settingsPanel.classList.remove('open');
        controls.settingsToggle.classList.remove('active');
        closedAny = true;
      }
      if (closedAny) {
        e.preventDefault();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
      }
      return;
    }

    const active = document.activeElement;
    if (active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable ||
      active.tagName === 'SELECT'
    )) {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        playTickSound(audioCtx);
        controls.playBtn.click();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        playTickSound(audioCtx);
        controls.prevBtn.click();
        break;

      case 'ArrowRight':
        e.preventDefault();
        playTickSound(audioCtx);
        controls.nextBtn.click();
        break;

      case 'ArrowUp':
        e.preventDefault();
        {
          let vol = parseFloat(controls.volumeBar.value) || 0;
          vol = Math.min(1, vol + 0.05);
          controls.volumeBar.value = vol.toFixed(2);
          audio.volume = vol;
          localStorage.setItem('userVolumePreference', controls.volumeBar.value);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        {
          let vol = parseFloat(controls.volumeBar.value) || 0;
          vol = Math.max(0, vol - 0.05);
          controls.volumeBar.value = vol.toFixed(2);
          audio.volume = vol;
          localStorage.setItem('userVolumePreference', controls.volumeBar.value);
        }
        break;

      case 'KeyV':
        e.preventDefault();
        playTickSound(audioCtx);
        controls.toggleWaveformVisualizer();
        break;

      case 'KeyM':
        e.preventDefault();
        playTickSound(audioCtx);
        controls.toggleMiniPlayer();
        break;

      default:
        break;
    }
  });
}
