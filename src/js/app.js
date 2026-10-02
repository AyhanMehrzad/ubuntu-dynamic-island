// Dynamic Island Application Coordinator
class IslandApp {
  constructor() {
    this.currentState = 'compact'; // 'compact', 'quick', 'notch', 'notification', 'prompt', 'expanded'
    this.currentTab = 'chat';
    this.isPinned = false;
    this.notifTimeout = null;
    this.isMediaPlaying = true;
  }

  async init() {
    // Apply saved custom pill dimensions
    const savedWidth = localStorage.getItem('pill_width') || '280';
    const savedHeight = localStorage.getItem('pill_height') || '44';
    document.documentElement.style.setProperty('--pill-width', `${savedWidth}px`);
    document.documentElement.style.setProperty('--pill-height', `${savedHeight}px`);

    // Initialize subsystems
    if (window.systemManager) window.systemManager.init();
    if (window.notionManager) window.notionManager.init();
    if (window.jarvisAgent) window.jarvisAgent.init();
    if (window.settingsManager) await window.settingsManager.init();

    this.bindEvents();
    this.setupElectronIPC();
  }

  async setState(state, targetWidth, targetHeight) {
    this.currentState = state;
    const island = document.getElementById('island');
    if (!island) return;

    // Play haptic sound
    if (window.soundController) {
      if (state === 'compact') window.soundController.playCollapse();
      else if (state === 'notification') window.soundController.playSuccess();
      else window.soundController.playExpand();
    }

    // Toggle views
    const views = {
      compact: document.getElementById('view-compact'),
      quick: document.getElementById('view-quick'),
      notch: document.getElementById('view-notch'),
      notification: document.getElementById('view-notification'),
      prompt: document.getElementById('view-prompt'),
      expanded: document.getElementById('view-expanded')
    };

    Object.keys(views).forEach(key => {
      if (views[key]) {
        views[key].style.display = key === state ? (key === 'expanded' ? 'flex' : 'flex') : 'none';
      }
    });

    island.className = `dynamic-island state-${state}`;

    // Apply custom compact dimensions if returning to compact
    if (state === 'compact') {
      const w = parseInt(localStorage.getItem('pill_width') || '280', 10);
      const h = parseInt(localStorage.getItem('pill_height') || '44', 10);
      island.style.width = `${w}px`;
      island.style.height = `${h}px`;
      targetWidth = w;
      targetHeight = h;
    } else {
      island.style.width = '';
      island.style.height = '';
    }

    // Notify Electron to resize window bounds so desktop clicks are not blocked!
    if (window.electronAPI && window.electronAPI.resizeIsland) {
      await window.electronAPI.resizeIsland(state, targetWidth, targetHeight);
    }
  }

  expandToTab(tabName) {
    this.currentTab = tabName;
    this.setState('expanded', 760, 560);

    // Switch tab
    const tabs = document.querySelectorAll('.nav-tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    panes.forEach(pane => {
      if (pane.id === `pane-${tabName}`) pane.classList.add('active');
      else pane.classList.remove('active');
    });
  }

  collapse() {
    if (this.notifTimeout) {
      clearTimeout(this.notifTimeout);
      this.notifTimeout = null;
    }
    const w = parseInt(localStorage.getItem('pill_width') || '280', 10);
    const h = parseInt(localStorage.getItem('pill_height') || '44', 10);
    this.setState('compact', w, h);
  }

  async syncNotchData() {
    // Sync current media info
    try {
      if (window.electronAPI && window.electronAPI.getMediaInfo) {
        const media = await window.electronAPI.getMediaInfo();
        if (media) {
          this.updateMediaDisplay(media);
        }
      }
    } catch (e) {}

    // Sync volume slider
    if (window.systemManager) {
      const vol = window.systemManager.stats.volume || 80;
      const slider = document.getElementById('notch-volume-slider');
      const label = document.getElementById('notch-volume-label');
      if (slider) slider.value = vol;
      if (label) label.textContent = `${vol}%`;
    }
  }

  updateMediaDisplay(media) {
    this.currentMedia = media;
    const defaultContainer = document.getElementById('compact-default-container');
    const mediaContainer = document.getElementById('compact-media-container');
    const mediaTitle = document.getElementById('compact-media-title');
    const mediaArtist = document.getElementById('compact-media-artist');
    const artImg = document.getElementById('compact-art-img');
    const badge = document.getElementById('compact-media-badge');
    const eq = document.getElementById('compact-equalizer');
    const compactPlayIcon = document.getElementById('compact-play-icon');

    // Notch elements
    const notchTitle = document.getElementById('notch-track-title');
    const notchArtist = document.getElementById('notch-track-artist');
    const vinyl = document.getElementById('vinyl-disc');
    const notchPlayIcon = document.getElementById('play-pause-icon');

    const hasMedia = media && (media.isPlaying || (media.status === 'Paused' && media.title));

    if (hasMedia) {
      const isSpotify = (media.playerType === 'spotify');
      const isYoutube = (media.playerType === 'youtube');

      if (mediaTitle) mediaTitle.textContent = media.title || 'Audio Playing';
      if (mediaArtist) mediaArtist.textContent = media.artist || (isSpotify ? 'Spotify' : (isYoutube ? 'YouTube' : 'Media Player'));
      if (notchTitle) notchTitle.textContent = media.title || 'Audio Playing';
      if (notchArtist) notchArtist.textContent = media.artist || (isSpotify ? 'Spotify' : (isYoutube ? 'YouTube' : 'Media Player'));

      // Update Art
      if (media.artUrl) {
        if (artImg) {
          artImg.style.backgroundImage = `url("${media.artUrl}")`;
          artImg.textContent = '';
        }
        if (vinyl) {
          vinyl.style.backgroundImage = `url("${media.artUrl}")`;
          vinyl.style.backgroundSize = 'cover';
          vinyl.style.backgroundPosition = 'center';
        }
      } else {
        if (artImg) {
          artImg.style.backgroundImage = '';
          artImg.textContent = isYoutube ? '▶️' : (isSpotify ? '🎵' : '🎧');
        }
        if (vinyl) {
          vinyl.style.backgroundImage = '';
        }
      }

      // Update badge & equalizer theme
      if (badge) {
        badge.className = isYoutube ? 'compact-media-badge youtube' : 'compact-media-badge';
      }
      if (eq) {
        eq.className = isYoutube ? 'compact-equalizer youtube' : 'compact-equalizer';
        if (!media.isPlaying) eq.classList.add('paused');
        else eq.classList.remove('paused');
      }

      // Update Vinyl spin
      if (vinyl) {
        if (media.isPlaying) vinyl.classList.remove('paused');
        else vinyl.classList.add('paused');
      }

      // Correct Play/Pause icons: playing -> show pause icon; paused -> show play icon
      const pauseSvg = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      const playSvg = '<polygon points="5 3 19 12 5 21 5 3"/>';

      if (compactPlayIcon) compactPlayIcon.innerHTML = media.isPlaying ? pauseSvg : playSvg;
      if (notchPlayIcon) notchPlayIcon.innerHTML = media.isPlaying ? pauseSvg : playSvg;

      // Update Music Progress Scrubber Bar
      const timeCurrent = document.getElementById('notch-time-current');
      const timeTotal = document.getElementById('notch-time-total');
      const progressFill = document.getElementById('notch-progress-fill');

      const formatTime = (sec) => {
        if (isNaN(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
      };

      if (media.lengthSec && media.lengthSec > 0) {
        if (timeTotal) timeTotal.textContent = formatTime(media.lengthSec);
        const pos = media.positionSec || 0;
        if (timeCurrent) timeCurrent.textContent = formatTime(pos);
        const pct = Math.min(100, Math.max(0, (pos / media.lengthSec) * 100));
        if (progressFill) progressFill.style.width = `${pct}%`;
      } else {
        if (timeTotal) timeTotal.textContent = '--:--';
        if (timeCurrent) timeCurrent.textContent = '0:00';
        if (progressFill) progressFill.style.width = '0%';
      }

      // Smooth progress ticker
      if (media.isPlaying) {
        this.startMediaProgressTicker();
      } else {
        this.stopMediaProgressTicker();
      }

      // Switch compact pill to media view
      const island = document.getElementById('island');
      if (island) island.classList.add('has-media');

      if (this.currentState === 'compact') {
        if (defaultContainer) defaultContainer.style.display = 'none';
        if (mediaContainer) mediaContainer.style.display = 'flex';
        const mediaW = 355;
        const savedH = parseInt(localStorage.getItem('pill_height') || '44', 10);
        if (window.electronAPI && window.electronAPI.resizeIsland) {
          window.electronAPI.resizeIsland('compact', mediaW, savedH);
        }
      }
    } else {
      this.stopMediaProgressTicker();
      // Revert to default status capsule
      const island = document.getElementById('island');
      if (island) island.classList.remove('has-media');

      if (defaultContainer) defaultContainer.style.display = 'flex';
      if (mediaContainer) mediaContainer.style.display = 'none';
      if (this.currentState === 'compact') {
        const savedW = parseInt(localStorage.getItem('pill_width') || '280', 10);
        const savedH = parseInt(localStorage.getItem('pill_height') || '44', 10);
        if (window.electronAPI && window.electronAPI.resizeIsland) {
          window.electronAPI.resizeIsland('compact', savedW, savedH);
        }
      }
    }
  }

  startMediaProgressTicker() {
    this.stopMediaProgressTicker();
    this.mediaProgressTimer = setInterval(() => {
      if (this.currentMedia && this.currentMedia.isPlaying && this.currentMedia.lengthSec > 0) {
        this.currentMedia.positionSec = (this.currentMedia.positionSec || 0) + 1;
        if (this.currentMedia.positionSec > this.currentMedia.lengthSec) {
          this.currentMedia.positionSec = this.currentMedia.lengthSec;
        }
        const timeCurrent = document.getElementById('notch-time-current');
        const progressFill = document.getElementById('notch-progress-fill');
        const m = Math.floor(this.currentMedia.positionSec / 60);
        const s = Math.floor(this.currentMedia.positionSec % 60);
        if (timeCurrent) timeCurrent.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        const pct = Math.min(100, Math.max(0, (this.currentMedia.positionSec / this.currentMedia.lengthSec) * 100));
        if (progressFill) progressFill.style.width = `${pct}%`;
      }
    }, 1000);
  }

  stopMediaProgressTicker() {
    if (this.mediaProgressTimer) {
      clearInterval(this.mediaProgressTimer);
      this.mediaProgressTimer = null;
    }
  }

  showNotification({ title, desc, icon = '💬', duration = 5000 }) {
    if (this.notifTimeout) clearTimeout(this.notifTimeout);

    const island = document.getElementById('island');
    if (island) island.classList.remove('has-media');

    const iconEl = document.getElementById('notif-icon');
    const titleEl = document.getElementById('notif-title');
    const descEl = document.getElementById('notif-desc');

    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = title || 'Dio Notification';
    if (descEl) descEl.textContent = desc || '';

    this.setState('notification', 480, 72);

    this.notifTimeout = setTimeout(() => {
      if (this.currentState === 'notification') {
        this.collapse();
      }
    }, duration);
  }

  bindEvents() {
    const island = document.getElementById('island');

    // Interactive Mascot Eye Tracking: Eyes follow user cursor with micro-physics
    if (island) {
      island.addEventListener('mousemove', (e) => {
        const mascot = document.getElementById('mascot-avatar');
        if (!mascot) return;
        if (mascot.classList.contains('status-listening') || mascot.classList.contains('status-thinking') || mascot.classList.contains('status-action')) return;
        const rect = mascot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const angle = Math.atan2(dy, dx);
        const dist = Math.min(2.0, Math.hypot(dx, dy) / 35);
        const eyeX = (Math.cos(angle) * dist).toFixed(2);
        const eyeY = (Math.sin(angle) * dist).toFixed(2);

        const eyes = document.querySelectorAll('.mascot-eye');
        eyes.forEach(eye => {
          eye.style.transform = `translate(${eyeX}px, ${eyeY}px)`;
        });
      });

      island.addEventListener('mouseleave', () => {
        const eyes = document.querySelectorAll('.mascot-eye');
        eyes.forEach(eye => {
          eye.style.transform = '';
        });
      });
    }

    // 1. Compact Pill Interactions
    const compactView = document.getElementById('view-compact');
    if (compactView) {
      compactView.addEventListener('click', (e) => {
        if (e.target.closest('#btn-compact-media-play')) {
          e.stopPropagation();
          const btn = e.target.closest('#btn-compact-media-play');
          btn.style.transform = 'scale(0.85)';
          setTimeout(() => { btn.style.transform = ''; }, 120);
          const targetPlayer = this.currentMedia?.playerName;
          if (window.electronAPI && window.electronAPI.mediaControl) {
            window.electronAPI.mediaControl('toggle', targetPlayer);
          }
          if (window.soundController) window.soundController.playPop();
          return;
        }

        if (e.target.closest('#btn-compact-media-prev')) {
          e.stopPropagation();
          const btn = e.target.closest('#btn-compact-media-prev');
          btn.style.transform = 'scale(0.85)';
          setTimeout(() => { btn.style.transform = ''; }, 120);
          const targetPlayer = this.currentMedia?.playerName;
          if (window.electronAPI && window.electronAPI.mediaControl) {
            window.electronAPI.mediaControl('prev', targetPlayer);
          }
          if (window.soundController) window.soundController.playPop();
          return;
        }

        if (e.target.closest('#btn-compact-media-stop')) {
          e.stopPropagation();
          const btn = e.target.closest('#btn-compact-media-stop');
          btn.style.transform = 'scale(0.85)';
          setTimeout(() => { btn.style.transform = ''; }, 120);
          const targetPlayer = this.currentMedia?.playerName;
          if (this.currentMedia) {
            this.currentMedia.isPlaying = false;
            this.currentMedia.positionSec = 0;
            this.updateMediaDisplay(this.currentMedia);
          }
          if (window.electronAPI && window.electronAPI.mediaControl) {
            window.electronAPI.mediaControl('stop', targetPlayer);
          }
          if (window.soundController) window.soundController.playPop();
          return;
        }

        if (e.target.closest('#btn-compact-media-next')) {
          e.stopPropagation();
          const btn = e.target.closest('#btn-compact-media-next');
          btn.style.transform = 'scale(0.85)';
          setTimeout(() => { btn.style.transform = ''; }, 120);
          const targetPlayer = this.currentMedia?.playerName;
          if (window.electronAPI && window.electronAPI.mediaControl) {
            window.electronAPI.mediaControl('next', targetPlayer);
          }
          if (window.soundController) window.soundController.playPop();
          return;
        }

        // Compact Media area or expand button click -> open Notchbar
        if (e.target.closest('#compact-media-click-area') || e.target.closest('#btn-compact-media-expand')) {
          e.stopPropagation();
          this.setState('notch', 500, 242);
          this.syncNotchData();
          return;
        }

        // Voice mic click
        if (e.target.closest('#btn-quick-voice')) {
          e.stopPropagation();
          this.setState('prompt', 590, 88);
          if (window.jarvisAgent) window.jarvisAgent.toggleVoiceRecording();
          return;
        }
        // Expand caret click
        if (e.target.closest('#btn-expand-island')) {
          e.stopPropagation();
          this.expandToTab('chat');
          return;
        }

        // Action configured in settings (Notchbar default)
        const behavior = localStorage.getItem('click_behavior') || 'notch';
        if (behavior === 'notch') {
          this.setState('notch', 500, 242);
          this.syncNotchData();
        } else if (behavior === 'quick') {
          this.setState('quick', 450, 50);
        } else {
          this.expandToTab('chat');
        }
      });
    }

    // 2. Apple Phone Notchbar Controls
    const notchExpand = document.getElementById('notch-btn-expand');
    if (notchExpand) notchExpand.addEventListener('click', () => this.expandToTab('chat'));

    const notchClose = document.getElementById('notch-btn-close');
    if (notchClose) notchClose.addEventListener('click', () => this.collapse());

    const notchVoice = document.getElementById('notch-btn-voice');
    if (notchVoice) {
      notchVoice.addEventListener('click', () => {
        this.setState('prompt', 590, 88);
        if (window.jarvisAgent) window.jarvisAgent.toggleVoiceRecording();
      });
    }

    // Media Buttons (targeting active Spotify or YouTube player)
    const mPlay = document.getElementById('mbtn-play');
    const mPrev = document.getElementById('mbtn-prev');
    const mNext = document.getElementById('mbtn-next');
    const mStop = document.getElementById('mbtn-stop');

    if (mPlay) {
      mPlay.addEventListener('click', async (e) => {
        e.stopPropagation();
        mPlay.style.transform = 'scale(0.9)';
        setTimeout(() => { mPlay.style.transform = ''; }, 120);
        const targetPlayer = this.currentMedia?.playerName;
        if (window.electronAPI && window.electronAPI.mediaControl) {
          await window.electronAPI.mediaControl('toggle', targetPlayer);
        }
        if (window.soundController) window.soundController.playPop();
      });
    }

    if (mStop) {
      mStop.addEventListener('click', async (e) => {
        e.stopPropagation();
        mStop.style.transform = 'scale(0.85)';
        setTimeout(() => { mStop.style.transform = ''; }, 120);
        const targetPlayer = this.currentMedia?.playerName;
        if (this.currentMedia) {
          this.currentMedia.isPlaying = false;
          this.currentMedia.positionSec = 0;
          this.updateMediaDisplay(this.currentMedia);
        }
        if (window.electronAPI && window.electronAPI.mediaControl) {
          await window.electronAPI.mediaControl('stop', targetPlayer);
        }
        if (window.soundController) window.soundController.playPop();
      });
    }

    if (mPrev) {
      mPrev.addEventListener('click', async (e) => {
        e.stopPropagation();
        mPrev.style.transform = 'scale(0.85)';
        setTimeout(() => { mPrev.style.transform = ''; }, 120);
        const targetPlayer = this.currentMedia?.playerName;
        if (window.electronAPI && window.electronAPI.mediaControl) {
          await window.electronAPI.mediaControl('prev', targetPlayer);
        }
        if (window.soundController) window.soundController.playPop();
      });
    }

    if (mNext) {
      mNext.addEventListener('click', async (e) => {
        e.stopPropagation();
        mNext.style.transform = 'scale(0.85)';
        setTimeout(() => { mNext.style.transform = ''; }, 120);
        const targetPlayer = this.currentMedia?.playerName;
        if (window.electronAPI && window.electronAPI.mediaControl) {
          await window.electronAPI.mediaControl('next', targetPlayer);
        }
        if (window.soundController) window.soundController.playPop();
      });
    }

    // Music Progress Scrubber Click-to-Seek
    const notchScrubberTrack = document.getElementById('notch-progress-track');
    if (notchScrubberTrack) {
      notchScrubberTrack.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this.currentMedia || !this.currentMedia.lengthSec || this.currentMedia.lengthSec <= 0) return;
        const rect = notchScrubberTrack.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const targetSec = Math.floor(pct * this.currentMedia.lengthSec);

        // Instant visual feedback
        this.currentMedia.positionSec = targetSec;
        const progressFill = document.getElementById('notch-progress-fill');
        const timeCurrent = document.getElementById('notch-time-current');
        if (progressFill) progressFill.style.width = `${pct * 100}%`;
        const m = Math.floor(targetSec / 60);
        const s = Math.floor(targetSec % 60);
        if (timeCurrent) timeCurrent.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;

        if (window.electronAPI && window.electronAPI.seekMedia) {
          await window.electronAPI.seekMedia(targetSec, this.currentMedia?.playerName);
        }
      });
    }

    // Notch Volume Slider
    const notchVolSlider = document.getElementById('notch-volume-slider');
    const notchVolLabel = document.getElementById('notch-volume-label');
    if (notchVolSlider) {
      notchVolSlider.addEventListener('input', async (e) => {
        const val = parseInt(e.target.value, 10);
        if (notchVolLabel) notchVolLabel.textContent = `${val}%`;
        if (window.systemManager) {
          await window.systemManager.setVolume(val);
        }
      });
    }

    // Notch App Chips
    const notchAppChips = document.querySelectorAll('.notch-app-chip');
    notchAppChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        const app = chip.getAttribute('data-launch');
        if (app && window.systemManager) {
          chip.style.transform = 'scale(0.95)';
          setTimeout(() => { chip.style.transform = ''; }, 140);
          await window.systemManager.launchApp(app);
          if (window.soundController) window.soundController.playSuccess();
        }
      });
    });

    // Notch Audio Output Sink Toggle (HDMI Main Display vs Analog Speakers)
    const notchSinkBtn = document.getElementById('notch-btn-audio-sink');
    const notchSinkText = document.getElementById('notch-sink-text');
    if (notchSinkBtn) {
      notchSinkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.electronAPI && window.electronAPI.getAudioSinks) {
          const sinks = await window.electronAPI.getAudioSinks();
          const other = sinks.find(s => !s.isDefault) || sinks[0];
          if (other) {
            await window.electronAPI.setAudioSink(other.id);
            if (notchSinkText) {
              notchSinkText.textContent = other.description.toLowerCase().includes('hdmi') ? 'Main Display' : 'Laptop Audio';
            }
            if (window.soundController) window.soundController.playPop();
          }
        }
      });
    }

    // 3. Notification Banner Interactions
    const notifDismiss = document.getElementById('notif-btn-dismiss');
    if (notifDismiss) {
      notifDismiss.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
      });
    }

    const notifView = document.getElementById('view-notification');
    if (notifView) {
      notifView.addEventListener('click', () => {
        if (this.notifTimeout) clearTimeout(this.notifTimeout);
        this.expandToTab('chat');
      });
    }

    // 4. Quick Bar Buttons
    const qPrompt = document.getElementById('qbtn-prompt');
    if (qPrompt) qPrompt.addEventListener('click', () => {
      this.setState('prompt', 590, 88);
      setTimeout(() => document.getElementById('prompt-input')?.focus(), 50);
    });

    const qVoice = document.getElementById('qbtn-voice');
    if (qVoice) qVoice.addEventListener('click', () => {
      this.setState('prompt', 590, 88);
      if (window.jarvisAgent) window.jarvisAgent.toggleVoiceRecording();
    });

    const qStats = document.getElementById('qbtn-stats');
    if (qStats) qStats.addEventListener('click', () => this.expandToTab('system'));

    const qNotion = document.getElementById('qbtn-notion');
    if (qNotion) qNotion.addEventListener('click', () => this.expandToTab('notion'));

    const qSettings = document.getElementById('qbtn-settings');
    if (qSettings) qSettings.addEventListener('click', () => this.expandToTab('settings'));

    const qCollapse = document.getElementById('qbtn-collapse');
    if (qCollapse) qCollapse.addEventListener('click', () => this.collapse());

    // 5. Prompt View Events
    const promptInput = document.getElementById('prompt-input');
    const promptMic = document.getElementById('prompt-mic-btn');
    const promptExpand = document.getElementById('prompt-expand-btn');
    const promptClose = document.getElementById('prompt-close-btn');

    if (promptInput) {
      promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = promptInput.value.trim();
          if (val) {
            promptInput.value = '';
            this.expandToTab('chat');
            if (window.jarvisAgent) window.jarvisAgent.sendMessage(val);
          }
        } else if (e.key === 'Escape') {
          this.collapse();
        }
      });
    }

    if (promptMic) {
      promptMic.addEventListener('click', () => {
        if (window.jarvisAgent) window.jarvisAgent.toggleVoiceRecording();
      });
    }

    if (promptExpand) {
      promptExpand.addEventListener('click', () => this.expandToTab('chat'));
    }

    if (promptClose) {
      promptClose.addEventListener('click', () => this.collapse());
    }

    // 6. Expanded Hub Events
    const tabBtns = document.querySelectorAll('.nav-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.expandToTab(tab);
        if (window.soundController) window.soundController.playPop();
      });
    });

    const pinBtn = document.getElementById('btn-pin-toggle');
    if (pinBtn) {
      pinBtn.addEventListener('click', async () => {
        this.isPinned = !this.isPinned;
        pinBtn.style.color = this.isPinned ? 'var(--accent-blue)' : 'var(--text-main)';
        if (window.electronAPI && window.electronAPI.setAlwaysOnTop) {
          await window.electronAPI.setAlwaysOnTop(this.isPinned);
        }
        if (window.soundController) window.soundController.playPop();
      });
    }

    const collapseHubBtn = document.getElementById('btn-collapse-hub');
    if (collapseHubBtn) {
      collapseHubBtn.addEventListener('click', () => this.collapse());
    }

    // Chat bottom bar & actions
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatMicBtn = document.getElementById('chat-mic-btn');
    const btnSnipScreen = document.getElementById('btn-snip-screen');
    const btnRemoveAttachment = document.getElementById('btn-remove-attachment');

    const handleChatSend = () => {
      if (!chatInput) return;
      let text = chatInput.value.trim();
      const hasAttachment = window.dioAgent && window.dioAgent.currentAttachment;
      if (!text && hasAttachment) {
        text = "Please inspect this cropped area of my screen and describe what you see and what should be done.";
      }
      if (text) {
        chatInput.value = '';
        if (window.dioAgent) window.dioAgent.sendMessage(text);
        else if (window.jarvisAgent) window.jarvisAgent.sendMessage(text);
      }
    };

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleChatSend();
      });
    }

    if (chatSendBtn) chatSendBtn.addEventListener('click', handleChatSend);

    if (chatMicBtn) {
      chatMicBtn.addEventListener('click', () => {
        if (window.dioAgent) window.dioAgent.toggleVoiceRecording();
        else if (window.jarvisAgent) window.jarvisAgent.toggleVoiceRecording();
      });
    }

    if (btnSnipScreen) {
      btnSnipScreen.addEventListener('click', () => {
        if (window.dioAgent) window.dioAgent.triggerScreenSnip();
      });
    }

    if (btnRemoveAttachment) {
      btnRemoveAttachment.addEventListener('click', () => {
        if (window.dioAgent) window.dioAgent.clearAttachment();
      });
    }

    // Suggestions
    const suggestionChips = document.querySelectorAll('.suggestion-chip');
    suggestionChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const action = chip.getAttribute('data-action');
        if (action === 'snip') {
          if (window.dioAgent) window.dioAgent.triggerScreenSnip();
          return;
        }
        const query = chip.getAttribute('data-query');
        if (query) {
          const agent = window.dioAgent || window.jarvisAgent;
          if (agent) agent.sendMessage(query);
        }
      });
    });

    // Chat Header Actions (Hey Dio simulation and Clear history)
    const btnTriggerWake = document.getElementById('btn-trigger-wakeword');
    if (btnTriggerWake) {
      btnTriggerWake.addEventListener('click', () => {
        if (window.dioAgent) {
          window.dioAgent.handleWakeWordTrigger('hey dio');
        }
      });
    }

    const btnClearChat = document.getElementById('btn-clear-chat');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => {
        const list = document.getElementById('messages-list');
        if (list) {
          list.innerHTML = `
            <div class="message-bubble assistant">
              <div class="msg-avatar">⚡</div>
              <div class="msg-content">
                <strong>History Cleared.</strong> Dio is online and ready for your next voice or text instruction.
              </div>
            </div>
          `;
        }
        if (window.dioAgent) window.dioAgent.history = [];
        if (window.soundController) window.soundController.playPop();
      });
    }

    // App Launch Tiles
    const actionTiles = document.querySelectorAll('.action-tile');
    actionTiles.forEach(tile => {
      tile.addEventListener('click', async () => {
        const app = tile.getAttribute('data-launch');
        if (app && window.systemManager) {
          tile.style.transform = 'scale(0.96)';
          setTimeout(() => { tile.style.transform = ''; }, 150);
          await window.systemManager.launchApp(app);
          if (window.soundController) window.soundController.playSuccess();
        }
      });
    });

    // Direct Terminal Runner
    const termInput = document.getElementById('direct-term-input');
    const termBtn = document.getElementById('btn-run-term');
    const termOut = document.getElementById('term-live-output');

    const runDirectTerm = async () => {
      if (!termInput || !termOut) return;
      const cmd = termInput.value.trim();
      if (!cmd) return;

      termOut.style.display = 'block';
      termOut.textContent = `$ ${cmd}\nExecuting...`;
      const res = await window.systemManager.executeCommand(cmd);
      termOut.textContent = `$ ${cmd}\n${res.stdout || res.stderr || '[Done, no output]'}`;
      if (window.soundController) window.soundController.playPop();
    };

    if (termInput) {
      termInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runDirectTerm();
      });
    }
    if (termBtn) termBtn.addEventListener('click', runDirectTerm);

    // Notion Quick Note
    const saveNotionBtn = document.getElementById('btn-save-notion');
    if (saveNotionBtn) {
      saveNotionBtn.addEventListener('click', async () => {
        const titleEl = document.getElementById('notion-note-title');
        const bodyEl = document.getElementById('notion-note-body');
        const fbEl = document.getElementById('notion-create-feedback');

        const title = titleEl ? titleEl.value.trim() : '';
        const body = bodyEl ? bodyEl.value.trim() : '';

        if (!title && !body) return;

        saveNotionBtn.textContent = 'Saving...';
        const res = await window.notionManager.createQuickNote(title, body);
        saveNotionBtn.textContent = 'Save to Notion';

        if (res.success) {
          if (titleEl) titleEl.value = '';
          if (bodyEl) bodyEl.value = '';
          if (fbEl) {
            fbEl.textContent = '✓ Note saved successfully!';
            setTimeout(() => { fbEl.textContent = ''; }, 2500);
          }
          if (window.soundController) window.soundController.playSuccess();
        }
      });
    }

    // Configure Notion Auth Button
    const configNotionBtn = document.getElementById('btn-open-notion-auth');
    if (configNotionBtn) {
      configNotionBtn.addEventListener('click', () => {
        this.expandToTab('settings');
        document.getElementById('setting-notion-token')?.focus();
      });
    }

    // Global keyboard listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.currentState !== 'compact') {
          this.collapse();
        }
      }
    });
  }

  setupElectronIPC() {
    if (window.electronAPI) {
      window.electronAPI.onToggleShortcut(() => {
        if (this.currentState === 'compact') {
          const behavior = localStorage.getItem('click_behavior') || 'notch';
          if (behavior === 'notch') {
            this.setState('notch', 500, 242);
            this.syncNotchData();
          } else {
            this.setState('prompt', 590, 88);
            setTimeout(() => document.getElementById('prompt-input')?.focus(), 50);
          }
        } else {
          this.collapse();
        }
      });

      window.electronAPI.onWindowBlur(() => {
        if (!this.isPinned && this.currentState !== 'compact' && this.currentState !== 'notification') {
          this.collapse();
        }
      });

      // Intercept and display real Ubuntu desktop notifications in Dynamic Island
      if (window.electronAPI.onSystemNotification) {
        window.electronAPI.onSystemNotification((data) => {
          let icon = data.icon || '💬';
          const lowerApp = (data.appName || '').toLowerCase();
          if (lowerApp.includes('spotify')) icon = '🎵';
          else if (lowerApp.includes('telegram')) icon = '✈️';
          else if (lowerApp.includes('discord')) icon = '👾';
          else if (lowerApp.includes('slack')) icon = '💼';
          else if (lowerApp.includes('chrome') || lowerApp.includes('firefox') || lowerApp.includes('browser')) icon = '🌐';
          else if (lowerApp.includes('code') || lowerApp.includes('terminal')) icon = '⚡';
          else if (lowerApp.includes('mail') || lowerApp.includes('thunderbird')) icon = '✉️';
          else if (lowerApp.includes('youtube')) icon = '▶️';

          const displayTitle = data.appName ? `${data.appName} • ${data.title || 'Notification'}` : (data.title || 'Dio Notification');
          this.showNotification({
            icon,
            title: displayTitle,
            desc: data.desc || '',
            duration: 5500
          });
        });
      }

      // Real-time MPRIS media changes (Spotify & YouTube tab playback)
      if (window.electronAPI.onMediaChange) {
        window.electronAPI.onMediaChange((media) => {
          this.updateMediaDisplay(media);
        });
      }

      if (window.electronAPI.onTestSetState) {
        window.electronAPI.onTestSetState((state) => {
          this.isPinned = true;
          if (state === 'notch') {
            this.setState('notch', 500, 242);
            this.syncNotchData();
          } else if (state === 'notification') {
            this.showNotification({
              icon: '💬',
              title: 'Telegram • Sarah Connor',
              desc: 'Hey! The Dio Ubuntu Dynamic Island looks incredible 🚀',
              duration: 30000
            });
          } else if (state === 'settings') {
            this.expandToTab('settings');
          } else if (state === 'expanded' || state === 'chat') {
            this.expandToTab('chat');
          } else if (state === 'snip_preview') {
            this.expandToTab('chat');
            const box = document.getElementById('chat-attachment-box');
            const thumb = document.getElementById('attachment-preview-img');
            if (box && thumb) {
              thumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%2338bdf8"><rect width="24" height="24" rx="4" fill="%230f172a"/><path d="M12 2L2 7l10 5 10-5-10-5z" fill="%2338bdf8"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="%2338bdf8" stroke-width="2" fill="none"/></svg>';
              box.style.display = 'flex';
            }
          } else if (state === 'compact') {
            this.isPinned = false;
            this.collapse();
          }
        });
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.islandApp = new IslandApp();
  window.islandApp.init();
});
