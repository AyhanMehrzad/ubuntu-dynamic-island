// Settings Controller & State Persistence
class SettingsManager {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'dark';
  }

  async init() {
    this.applyTheme(this.currentTheme);
    this.loadSavedValues();
    this.setupListeners();
    await this.syncAutostart();
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    document.body.className = `theme-${theme}`;

    const icon = document.getElementById('theme-icon');
    if (icon) {
      if (theme === 'light') {
        // Sun icon
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      } else {
        // Moon icon
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
      }
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    if (window.soundController) window.soundController.playPop();
  }

  loadSavedValues() {
    // Default models if not yet stored
    if (!localStorage.getItem('gemini_model')) {
      localStorage.setItem('gemini_model', 'gemini-2.0-flash');
    }
    if (!localStorage.getItem('avalai_model')) {
      localStorage.setItem('avalai_model', 'gpt-4o-mini');
    }
    if (!localStorage.getItem('openrouter_model')) {
      localStorage.setItem('openrouter_model', 'openrouter/free');
    }

    // AI Provider
    const providerSelect = document.getElementById('setting-ai-provider');
    const avalKeyVal = localStorage.getItem('avalai_key') || '';
    let savedProvider = localStorage.getItem('ai_provider');
    if (!savedProvider || savedProvider === 'builtin') {
      savedProvider = avalKeyVal ? 'avalai' : 'custom';
      localStorage.setItem('ai_provider', savedProvider);
    }
    if (providerSelect) {
      providerSelect.value = savedProvider;
      this.updateProviderVisibility(savedProvider);
    }

    // Aval AI
    const avalKey = document.getElementById('setting-avalai-key');
    const avalModel = document.getElementById('setting-avalai-model');
    if (avalKey) avalKey.value = localStorage.getItem('avalai_key') || '';
    if (avalModel) avalModel.value = localStorage.getItem('avalai_model') || 'gpt-4o-mini';

    // OpenRouter
    const orKey = document.getElementById('setting-openrouter-key');
    const orModel = document.getElementById('setting-openrouter-model');
    if (orKey) orKey.value = localStorage.getItem('openrouter_key') || '';
    if (orModel) orModel.value = localStorage.getItem('openrouter_model') || 'openrouter/free';

    // Gemini
    const gemKey = document.getElementById('setting-gemini-key');
    const gemModel = document.getElementById('setting-gemini-model');
    if (gemKey) gemKey.value = localStorage.getItem('gemini_key') || '';
    if (gemModel) gemModel.value = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';

    // Custom / Local Ollama
    const customEndpoint = document.getElementById('setting-custom-endpoint');
    const customModel = document.getElementById('setting-custom-model');
    if (customEndpoint) customEndpoint.value = localStorage.getItem('custom_endpoint') || 'http://localhost:11434/v1/chat/completions';
    if (customModel) customModel.value = localStorage.getItem('custom_model') || 'llama3.2:3b';
    this.populateLocalModels();

    // Notion
    const notionTok = document.getElementById('setting-notion-token');
    const notionDb = document.getElementById('setting-notion-database');
    if (notionTok) notionTok.value = localStorage.getItem('notion_token') || '';
    if (notionDb) notionDb.value = localStorage.getItem('notion_database_id') || '';

    // Wake Word & Microphone
    const wakeToggle = document.getElementById('setting-wakeword-toggle');
    if (wakeToggle) {
      wakeToggle.checked = localStorage.getItem('wakeword_enabled') !== 'false';
    }
    const wakeInput = document.getElementById('setting-wake-word-input');
    if (wakeInput) {
      wakeInput.value = localStorage.getItem('wake_word') || 'Hey Dio';
    }

    // Toggles
    const voiceToggle = document.getElementById('setting-voice-toggle');
    if (voiceToggle) {
      voiceToggle.checked = localStorage.getItem('voice_enabled') !== 'false';
      if (window.dioAgent) window.dioAgent.voiceEnabled = voiceToggle.checked;
    }

    const autoPauseToggle = document.getElementById('setting-autopause-toggle');
    if (autoPauseToggle) {
      autoPauseToggle.checked = localStorage.getItem('auto_pause_media') !== 'false';
    }

    const soundToggle = document.getElementById('setting-sound-toggle');
    if (soundToggle) {
      soundToggle.checked = localStorage.getItem('sound_enabled') !== 'false';
      if (window.soundController) window.soundController.enabled = soundToggle.checked;
    }

    const confirmToggle = document.getElementById('setting-confirm-cmd-toggle');
    if (confirmToggle) {
      confirmToggle.checked = localStorage.getItem('confirm_cmd') !== 'false';
    }

    // Personalization Profile
    let userProfile = { name: 'rupper', tone: 'bro', instructions: 'My primary IDE is Antigravity. I love clean code and direct answers. Always respond in spoken voice.' };
    try {
      const savedProfile = localStorage.getItem('dio_user_profile');
      if (savedProfile) userProfile = Object.assign(userProfile, JSON.parse(savedProfile));
    } catch (e) {}

    const nameInput = document.getElementById('setting-user-name');
    const toneSelect = document.getElementById('setting-persona-tone');
    const instText = document.getElementById('setting-user-instructions');
    if (nameInput) nameInput.value = userProfile.name || 'rupper';
    if (toneSelect) toneSelect.value = userProfile.tone || 'bro';
    if (instText) instText.value = userProfile.instructions || '';
  }

  updateProviderVisibility(provider) {
    const grpAval = document.getElementById('group-avalai');
    const grpOr = document.getElementById('group-openrouter');
    const grpGem = document.getElementById('group-gemini');
    const grpCustom = document.getElementById('group-custom');

    if (grpAval) grpAval.style.display = provider === 'avalai' ? 'flex' : 'none';
    if (grpOr) grpOr.style.display = provider === 'openrouter' ? 'flex' : 'none';
    if (grpGem) grpGem.style.display = provider === 'gemini' ? 'flex' : 'none';
    if (grpCustom) grpCustom.style.display = provider === 'custom' ? 'flex' : 'none';
  }

  async populateLocalModels() {
    const customModel = document.getElementById('setting-custom-model');
    if (!customModel) return;
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags');
      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map(m => m.name);
        if (models.length > 0) {
          const currentVal = localStorage.getItem('custom_model') || 'llama3.2:3b';
          customModel.innerHTML = '';
          models.forEach(mod => {
            const opt = document.createElement('option');
            opt.value = mod;
            let label = mod;
            if (mod.includes('llama3.2')) label += ' (Meta - Fast & Agentic)';
            else if (mod.includes('gemma')) label += ' (Google Gemma 2)';
            opt.textContent = label;
            customModel.appendChild(opt);
          });
          if (models.includes(currentVal)) {
            customModel.value = currentVal;
          }
        }
      }
    } catch (e) {}
  }

  setupListeners() {
    // Provider Change
    const providerSelect = document.getElementById('setting-ai-provider');
    if (providerSelect) {
      providerSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        localStorage.setItem('ai_provider', val);
        this.updateProviderVisibility(val);
      });
    }

    // Save Button
    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveAll();
        saveBtn.textContent = 'Saved!';
        setTimeout(() => { saveBtn.textContent = 'Save API Credentials'; }, 1800);
        if (window.soundController) window.soundController.playSuccess();
      });
    }

    // Save Personalization Button
    const btnSavePerson = document.getElementById('btn-save-personalization');
    if (btnSavePerson) {
      btnSavePerson.addEventListener('click', () => {
        const name = document.getElementById('setting-user-name')?.value.trim() || 'rupper';
        const tone = document.getElementById('setting-persona-tone')?.value || 'bro';
        const instructions = document.getElementById('setting-user-instructions')?.value.trim() || '';
        const profile = { name, tone, instructions };
        localStorage.setItem('dio_user_profile', JSON.stringify(profile));
        if (window.dioAgent) {
          window.dioAgent.userProfile = profile;
        }
        btnSavePerson.textContent = '✅ Profile Saved!';
        if (window.soundController) window.soundController.playSuccess();
        setTimeout(() => { btnSavePerson.textContent = '💾 Save Personalization'; }, 2000);
      });
    }

    // Autostart toggle
    const autostartToggle = document.getElementById('setting-autostart-toggle');
    if (autostartToggle) {
      autostartToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        if (window.electronAPI && window.electronAPI.setAutostartStatus) {
          await window.electronAPI.setAutostartStatus(enabled);
        }
        localStorage.setItem('autostart_enabled', enabled ? 'true' : 'false');
      });
    }

    // Auto-Pause Media toggle (Smart Audio Focus)
    const autoPauseToggle = document.getElementById('setting-autopause-toggle');
    if (autoPauseToggle) {
      autoPauseToggle.addEventListener('change', (e) => {
        const en = e.target.checked;
        localStorage.setItem('auto_pause_media', en ? 'true' : 'false');
        if (!en && window.dioAgent) {
          window.dioAgent.releaseAudioFocus(true);
        }
      });
    }

    // Voice toggle
    const voiceToggle = document.getElementById('setting-voice-toggle');
    if (voiceToggle) {
      voiceToggle.addEventListener('change', (e) => {
        const en = e.target.checked;
        localStorage.setItem('voice_enabled', en ? 'true' : 'false');
        if (window.jarvisAgent) window.jarvisAgent.voiceEnabled = en;
      });
    }

    // Sound toggle
    const soundToggle = document.getElementById('setting-sound-toggle');
    if (soundToggle) {
      soundToggle.addEventListener('change', (e) => {
        const en = e.target.checked;
        localStorage.setItem('sound_enabled', en ? 'true' : 'false');
        if (window.soundController) window.soundController.enabled = en;
      });
    }

    // Theme toggle button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Aval AI Links & Test
    const btnAvalKeys = document.getElementById('btn-open-avalai-keys');
    if (btnAvalKeys) {
      btnAvalKeys.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openUrl) {
          window.electronAPI.openUrl('https://chat.avalai.ir/platform/api-keys');
        } else {
          window.open('https://chat.avalai.ir/platform/api-keys', '_blank');
        }
      });
    }

    const btnTestAval = document.getElementById('btn-test-avalai-key');
    if (btnTestAval) {
      btnTestAval.addEventListener('click', async () => {
        const key = document.getElementById('setting-avalai-key')?.value.trim();
        const model = document.getElementById('setting-avalai-model')?.value || 'gpt-4o-mini';
        if (!key) {
          btnTestAval.textContent = '❌ Enter Aval AI Key';
          setTimeout(() => { btnTestAval.textContent = 'Test Aval AI Key'; }, 2000);
          return;
        }
        btnTestAval.textContent = 'Pinging Aval AI...';
        try {
          if (window.electronAPI && window.electronAPI.callAvalAI) {
            const res = await window.electronAPI.callAvalAI({
              apiKey: key,
              model: model,
              messages: [{ role: 'user', content: 'سلام' }]
            });
            if (res.ok) {
              btnTestAval.textContent = '✅ Aval AI Connected!';
              if (window.soundController) window.soundController.playSuccess();
            } else {
              const errMsg = res.data?.error?.message || `HTTP ${res.status}`;
              btnTestAval.textContent = `❌ ${errMsg.substring(0, 22)}`;
            }
          }
        } catch (e) {
          btnTestAval.textContent = '❌ Connection Error';
        }
        setTimeout(() => { btnTestAval.textContent = 'Test Aval AI Key'; }, 3500);
      });
    }

    // OpenRouter External Browser Links
    const btnOrKeys = document.getElementById('btn-open-openrouter-keys');
    if (btnOrKeys) {
      btnOrKeys.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openUrl) {
          window.electronAPI.openUrl('https://openrouter.ai/settings/keys');
        } else {
          window.open('https://openrouter.ai/settings/keys', '_blank');
        }
      });
    }

    const btnOrModels = document.getElementById('btn-open-openrouter-models');
    if (btnOrModels) {
      btnOrModels.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openUrl) {
          window.electronAPI.openUrl('https://openrouter.ai/models?order=pricing-low-to-high');
        } else {
          window.open('https://openrouter.ai/models?order=pricing-low-to-high', '_blank');
        }
      });
    }

    // OpenRouter Test Key
    const btnTestOr = document.getElementById('btn-test-openrouter-key');
    if (btnTestOr) {
      btnTestOr.addEventListener('click', async () => {
        const key = document.getElementById('setting-openrouter-key')?.value.trim();
        const model = document.getElementById('setting-openrouter-model')?.value;
        if (!key) {
          btnTestOr.textContent = '❌ Enter Key First';
          setTimeout(() => { btnTestOr.textContent = 'Test API Key'; }, 2000);
          return;
        }
        btnTestOr.textContent = 'Pinging OpenRouter...';
        try {
          if (window.electronAPI && window.electronAPI.callOpenRouter) {
            const res = await window.electronAPI.callOpenRouter({
              apiKey: key,
              model: model || 'openrouter/free',
              messages: [{ role: 'user', content: 'Say hello in two words' }]
            });
            if (res.ok) {
              btnTestOr.textContent = '✅ Key Valid & Working!';
              if (window.soundController) window.soundController.playSuccess();
            } else {
              const errMsg = res.data?.error?.message || `HTTP ${res.status}`;
              btnTestOr.textContent = `❌ ${errMsg.substring(0, 20)}`;
            }
          }
        } catch (e) {
          btnTestOr.textContent = '❌ Connection Error';
        }
        setTimeout(() => { btnTestOr.textContent = 'Test API Key'; }, 3500);
      });
    }

    // Gemini Test Key
    const btnTestGem = document.getElementById('btn-test-gemini-key');
    if (btnTestGem) {
      btnTestGem.addEventListener('click', async () => {
        const key = document.getElementById('setting-gemini-key')?.value.trim();
        const model = document.getElementById('setting-gemini-model')?.value || 'gemini-3.8-flash';
        if (!key) {
          btnTestGem.textContent = '❌ Enter Gemini Key';
          setTimeout(() => { btnTestGem.textContent = 'Test Gemini Key'; }, 2000);
          return;
        }
        btnTestGem.textContent = 'Pinging Gemini...';
        try {
          if (window.electronAPI && window.electronAPI.callGemini) {
            const res = await window.electronAPI.callGemini({
              apiKey: key,
              model: model,
              contents: [{ role: 'user', parts: [{ text: 'Hello Gemini' }] }]
            });
            if (res.ok) {
              btnTestGem.textContent = '✅ Gemini Connected!';
              if (window.soundController) window.soundController.playSuccess();
            } else {
              const errMsg = res.data?.error?.message || `HTTP ${res.status}`;
              btnTestGem.textContent = `❌ ${errMsg.substring(0, 22)}`;
            }
          }
        } catch (e) {
          btnTestGem.textContent = '❌ Connection Error';
        }
        setTimeout(() => { btnTestGem.textContent = 'Test Gemini Key'; }, 3500);
      });
    }

    // Custom / Local Ollama Test
    const btnTestCustom = document.getElementById('btn-test-custom-endpoint');
    if (btnTestCustom) {
      btnTestCustom.addEventListener('click', async () => {
        const ep = document.getElementById('setting-custom-endpoint')?.value.trim() || 'http://localhost:11434/v1/chat/completions';
        const mod = document.getElementById('setting-custom-model')?.value.trim() || 'llama3.2:3b';
        btnTestCustom.textContent = 'Pinging Ollama...';
        try {
          if (window.electronAPI && window.electronAPI.callCustomEndpoint) {
            const res = await window.electronAPI.callCustomEndpoint({
              endpoint: ep,
              model: mod,
              messages: [{ role: 'user', content: 'Say Ready in one word' }],
              max_tokens: 10
            });
            if (res.ok) {
              btnTestCustom.textContent = '✅ Local Ollama (RTX 4050) Ready!';
              if (window.soundController) window.soundController.playSuccess();
            } else {
              const errMsg = res.error || `HTTP ${res.status}`;
              btnTestCustom.textContent = `❌ ${errMsg.substring(0, 22)}`;
            }
          }
        } catch (e) {
          btnTestCustom.textContent = '❌ Offline / Unreachable';
        }
        setTimeout(() => { btnTestCustom.textContent = 'Test Local Model (Ollama)'; }, 3500);
      });
    }

    // Check / Start Ollama Service Button
    const btnRestartOllama = document.getElementById('btn-restart-ollama');
    if (btnRestartOllama) {
      btnRestartOllama.addEventListener('click', async () => {
        btnRestartOllama.textContent = 'Checking Daemon...';
        try {
          const res = await fetch('http://127.0.0.1:11434/api/tags');
          if (res.ok) {
            const data = await res.json();
            const models = (data.models || []).map(m => m.name).join(', ') || 'No models';
            btnRestartOllama.textContent = `🟢 Running: ${models.substring(0, 16)}`;
          } else {
            btnRestartOllama.textContent = '🔴 Ollama Error';
          }
        } catch (e) {
          btnRestartOllama.textContent = '🔴 Ollama Offline';
        }
        setTimeout(() => { btnRestartOllama.textContent = 'Check Service Status'; }, 3500);
      });
    }

    // Wake Word Toggle
    const wakeToggle = document.getElementById('setting-wakeword-toggle');
    if (wakeToggle) {
      wakeToggle.addEventListener('change', (e) => {
        const en = e.target.checked;
        localStorage.setItem('wakeword_enabled', en ? 'true' : 'false');
        if (window.dioAgent) {
          window.dioAgent.setWakeWordEnabled(en);
        }
      });
    }

    // Wake Word Input
    const wakeInput = document.getElementById('setting-wake-word-input');
    if (wakeInput) {
      wakeInput.addEventListener('input', (e) => {
        const val = e.target.value.trim() || 'Hey Dio';
        localStorage.setItem('wake_word', val);
        if (window.dioAgent) {
          window.dioAgent.wakeWord = val.toLowerCase();
        }
      });
    }

    // Test Mic Button
    const btnTestMic = document.getElementById('btn-test-mic');
    if (btnTestMic) {
      btnTestMic.addEventListener('click', () => {
        if (window.dioAgent) {
          window.dioAgent.toggleVoiceRecording();
        }
      });
    }

    // Test Voice Button
    const btnTestVoice = document.getElementById('btn-test-voice');
    if (btnTestVoice) {
      btnTestVoice.addEventListener('click', () => {
        if (window.dioAgent) {
          window.dioAgent.speak("Hello! I am Dio, your Ubuntu assistant. How can I help you today?");
        }
      });
    }

    // Voice Selection Dropdown
    const voiceSelect = document.getElementById('setting-voice-select');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
        const uri = e.target.value;
        localStorage.setItem('selected_voice_uri', uri);
        if (window.dioAgent && window.dioAgent.synth) {
          const voices = window.dioAgent.synth.getVoices();
          window.dioAgent.selectedVoice = voices.find(v => v.voiceURI === uri) || null;
        }
      });
    }

    // Monitor Selection
    this.setupMonitorSelection();

    // Sizing Sliders
    this.setupSizingControls();

    // Notification Interception & Tests
    const interceptToggle = document.getElementById('setting-notify-intercept-toggle');
    if (interceptToggle) {
      const savedIntercept = localStorage.getItem('notify_intercept') !== 'false';
      interceptToggle.checked = savedIntercept;
      interceptToggle.addEventListener('change', async (e) => {
        const en = e.target.checked;
        localStorage.setItem('notify_intercept', en ? 'true' : 'false');
        if (window.electronAPI && window.electronAPI.setNotificationSuppress) {
          await window.electronAPI.setNotificationSuppress(en);
        }
      });
    }

    const testNotifBtn = document.getElementById('btn-test-notification');
    if (testNotifBtn) {
      testNotifBtn.addEventListener('click', () => {
        if (window.islandApp) {
          window.islandApp.showNotification({
            icon: '💬',
            title: 'Telegram • Sarah Connor',
            desc: 'Hey! Dio in the Ubuntu Dynamic Island looks incredible 🚀'
          });
        }
      });
    }

    const testSystemNotifBtn = document.getElementById('btn-test-system-notification');
    if (testSystemNotifBtn) {
      testSystemNotifBtn.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.executeCommand) {
          await window.electronAPI.executeCommand('notify-send "Ubuntu Dynamic Island" "Real system notification intercepted by Dio! ✨" --icon=utilities-terminal --app-name="Ubuntu System"');
        }
      });
    }
  }

  populateVoiceSelect(voices, currentVoice) {
    const voiceSelect = document.getElementById('setting-voice-select');
    if (!voiceSelect || !voices || voices.length === 0) return;

    voiceSelect.innerHTML = voices.map(v => `
      <option value="${v.voiceURI}" ${(currentVoice && v.voiceURI === currentVoice.voiceURI) ? 'selected' : ''}>
        ${v.name} (${v.lang})
      </option>
    `).join('');
  }

  async setupMonitorSelection() {
    const monitorSelect = document.getElementById('setting-monitor-select');
    if (!monitorSelect) return;

    try {
      let displays = [];
      if (window.electronAPI && window.electronAPI.getDisplays) {
        displays = await window.electronAPI.getDisplays();
      } else {
        displays = [
          { id: '1', name: 'Display 1 (1920x1080 - Primary)', isSelected: true },
          { id: '2', name: 'Display 2 (1920x1080 - External)', isSelected: false }
        ];
      }

      const savedDisplay = localStorage.getItem('selected_monitor');
      monitorSelect.innerHTML = displays.map(d => `
        <option value="${d.id}" ${(savedDisplay ? savedDisplay === d.id : d.isSelected) ? 'selected' : ''}>
          ${d.name}
        </option>
      `).join('');

      monitorSelect.addEventListener('change', async (e) => {
        const displayId = e.target.value;
        localStorage.setItem('selected_monitor', displayId);
        if (window.electronAPI && window.electronAPI.setDisplay) {
          await window.electronAPI.setDisplay(displayId);
        }
        if (window.soundController) window.soundController.playPop();
      });
    } catch (err) {
      console.warn('Could not load displays:', err);
    }
  }

  setupSizingControls() {
    const widthSlider = document.getElementById('setting-pill-width');
    const widthVal = document.getElementById('val-pill-width');
    const heightSlider = document.getElementById('setting-pill-height');
    const heightVal = document.getElementById('val-pill-height');
    const clickSelect = document.getElementById('setting-click-behavior');

    const savedWidth = localStorage.getItem('pill_width') || '280';
    const savedHeight = localStorage.getItem('pill_height') || '44';
    const savedClick = localStorage.getItem('click_behavior') || 'notch';

    if (widthSlider && widthVal) {
      widthSlider.value = savedWidth;
      widthVal.textContent = `${savedWidth}px`;
      document.documentElement.style.setProperty('--pill-width', `${savedWidth}px`);

      widthSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        widthVal.textContent = `${val}px`;
        localStorage.setItem('pill_width', val);
        document.documentElement.style.setProperty('--pill-width', `${val}px`);
        if (window.electronAPI && window.electronAPI.setCustomSize) {
          window.electronAPI.setCustomSize({ width: val, height: heightSlider ? heightSlider.value : 44 });
        }
      });
    }

    if (heightSlider && heightVal) {
      heightSlider.value = savedHeight;
      heightVal.textContent = `${savedHeight}px`;
      document.documentElement.style.setProperty('--pill-height', `${savedHeight}px`);

      heightSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        heightVal.textContent = `${val}px`;
        localStorage.setItem('pill_height', val);
        document.documentElement.style.setProperty('--pill-height', `${val}px`);
        if (window.electronAPI && window.electronAPI.setCustomSize) {
          window.electronAPI.setCustomSize({ width: widthSlider ? widthSlider.value : 280, height: val });
        }
      });
    }

    if (clickSelect) {
      clickSelect.value = savedClick;
      clickSelect.addEventListener('change', (e) => {
        localStorage.setItem('click_behavior', e.target.value);
        if (window.soundController) window.soundController.playPop();
      });
    }
  }

  saveAll() {
    const provider = document.getElementById('setting-ai-provider').value;
    localStorage.setItem('ai_provider', provider);

    const avalKey = document.getElementById('setting-avalai-key')?.value.trim();
    const avalModel = document.getElementById('setting-avalai-model')?.value;
    if (avalKey) localStorage.setItem('avalai_key', avalKey);
    if (avalModel) localStorage.setItem('avalai_model', avalModel);

    const orKey = document.getElementById('setting-openrouter-key').value.trim();
    const orModel = document.getElementById('setting-openrouter-model').value;
    localStorage.setItem('openrouter_key', orKey);
    localStorage.setItem('openrouter_model', orModel);

    const gemKey = document.getElementById('setting-gemini-key').value.trim();
    const gemModel = document.getElementById('setting-gemini-model').value;
    localStorage.setItem('gemini_key', gemKey);
    localStorage.setItem('gemini_model', gemModel);

    const customEp = document.getElementById('setting-custom-endpoint').value.trim();
    const customMod = document.getElementById('setting-custom-model').value.trim();
    localStorage.setItem('custom_endpoint', customEp);
    localStorage.setItem('custom_model', customMod);

    const notionTok = document.getElementById('setting-notion-token').value.trim();
    const notionDb = document.getElementById('setting-notion-database').value.trim();
    if (window.notionManager) {
      window.notionManager.setCredentials(notionTok, notionDb);
    }

    const name = document.getElementById('setting-user-name')?.value.trim() || 'rupper';
    const tone = document.getElementById('setting-persona-tone')?.value || 'bro';
    const instructions = document.getElementById('setting-user-instructions')?.value.trim() || '';
    const profile = { name, tone, instructions };
    localStorage.setItem('dio_user_profile', JSON.stringify(profile));
    if (window.dioAgent) {
      window.dioAgent.userProfile = profile;
    }
  }

  async syncAutostart() {
    const autostartToggle = document.getElementById('setting-autostart-toggle');
    if (!autostartToggle) return;

    if (window.electronAPI && window.electronAPI.getAutostartStatus) {
      const isAuto = await window.electronAPI.getAutostartStatus();
      autostartToggle.checked = isAuto;
    } else {
      autostartToggle.checked = localStorage.getItem('autostart_enabled') === 'true';
    }
  }
}

window.settingsManager = new SettingsManager();
