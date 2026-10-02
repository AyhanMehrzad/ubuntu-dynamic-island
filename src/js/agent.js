// Dio Agent Engine - Multi-LLM, Tool Execution, Speech, Wake-Word & System Control
class DioAgent {
  constructor() {
    this.history = [];
    this.isThinking = false;
    this.speechRecognition = null;
    this.wakeRecognizer = null;
    this.isRecording = false;
    this.isWakeWordListening = false;
    this.wakeWordEnabled = localStorage.getItem('wakeword_enabled') !== 'false';
    this.wakeWord = (localStorage.getItem('wake_word') || 'Hey Dio').toLowerCase().trim();
    this.synth = window.speechSynthesis;
    this.voiceEnabled = localStorage.getItem('voice_enabled') !== 'false';
    this.selectedVoice = null;
    this.voicePitch = parseFloat(localStorage.getItem('voice_pitch') || '1.0');
    this.voiceRate = parseFloat(localStorage.getItem('voice_rate') || '1.05');
    this.isAudioSuppressed = false;
    this._releaseTimer = null;
    this.currentAttachment = null;
    this.isSnipActive = false;
    this.isSpeakingPending = false;
    this.isLiveConversationMode = false;
    this.pendingWakeSamples = null;
    this.recordingStartTime = 0;
    this.userProfile = this.loadUserProfile();
    this.latestDesktopContext = null;
  }

  loadUserProfile() {
    try {
      const raw = localStorage.getItem('dio_user_profile');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      name: 'rupper',
      tone: 'bro',
      instructions: 'My primary IDE is Antigravity. I love clean code and direct answers. Always respond in spoken voice.'
    };
  }

  async getDesktopContext() {
    let desktopInfo = {
      activeWindow: '',
      openWindows: [],
      timestamp: new Date().toLocaleString()
    };
    try {
      if (window.electronAPI && window.electronAPI.getDesktopContext) {
        desktopInfo = await window.electronAPI.getDesktopContext();
      }
    } catch (e) {}

    // Pull active media
    let mediaStr = 'No media playing';
    if (window.islandApp && window.islandApp.currentMedia && window.islandApp.currentMedia.isPlaying) {
      const m = window.islandApp.currentMedia;
      mediaStr = `Playing "${m.title || 'Unknown'}" by ${m.artist || 'Unknown'}`;
    }

    // Pull system stats
    let statsStr = '';
    if (window.systemManager && window.systemManager.stats) {
      const s = window.systemManager.stats;
      statsStr = `CPU: ${s.cpu}%, RAM: ${s.memory}%, Vol: ${s.volume}%`;
    }

    const res = {
      activeWindow: desktopInfo.activeWindow || 'Desktop',
      openWindows: desktopInfo.openWindows || [],
      timestamp: desktopInfo.timestamp || new Date().toLocaleString(),
      media: mediaStr,
      stats: statsStr
    };
    this.latestDesktopContext = res;
    return res;
  }

  async searchWebKnowledge(query) {
    if (!window.electronAPI || !window.electronAPI.webSearch) return null;
    try {
      const cleanQuery = query.replace(/^(search for|search|look up|find out|google|what is the latest on|latest news on)\s+/i, '').trim();
      const res = await window.electronAPI.webSearch(cleanQuery || query);
      if (res && res.ok) {
        return res;
      }
    } catch (e) {}
    return null;
  }

  getPersonalizedSystemPrompt(desktopContext = null) {
    const user = this.userProfile || this.loadUserProfile();
    let toneGuide = '';
    if (user.tone === 'bro') {
      toneGuide = `You speak like an energetic, cool, supportive tech partner and bro. Call the user "${user.name || 'bro'}" naturally. Be warm, confident, and proactive.`;
    } else if (user.tone === 'jarvis') {
      toneGuide = `You speak like an advanced, articulate British AI butler (Jarvis style). Address the user as "${user.name || 'sir'}". Be crisp, polished, and sophisticated.`;
    } else if (user.tone === 'concise') {
      toneGuide = `You are an ultra-concise technical assistant. Address the user as "${user.name || 'developer'}". Zero fluff, direct answers, maximum information density.`;
    } else {
      toneGuide = `Address the user as "${user.name || 'friend'}". Be helpful, friendly, and clear.`;
    }

    let contextSection = '';
    if (desktopContext) {
      contextSection = `
REAL-TIME DESKTOP & SYSTEM CONTEXT:
• Active Foreground Window: "${desktopContext.activeWindow || 'Desktop'}"
• Open Windows: ${Array.isArray(desktopContext.openWindows) ? desktopContext.openWindows.join(', ') : 'None'}
• Local System Time: ${desktopContext.timestamp || new Date().toLocaleString()}
• Audio Status: ${desktopContext.media || 'None'}
• System Health: ${desktopContext.stats || 'Nominal'}
`;
    }

    return `You are Dio, an autonomous Linux desktop AI companion living in the Ubuntu Dynamic Island widget.
USER PROFILE:
• Name: ${user.name || 'rupper'}
• Personality & Tone: ${toneGuide}
• Custom User Preferences: ${user.instructions || 'Antigravity IDE user, speaks aloud.'}

DESKTOP AGENCY & CONTROL CAPABILITIES:
You have FULL ROOT-LEVEL AGENCY AND DIRECT CONTROL over the user's running desktop applications (such as Antigravity IDE, Google Chrome, VS Code, Spotify, Telegram, Terminal) and Linux desktop environment.
You can switch to apps, focus windows, type into them, and execute commands.
NEVER say "I cannot interact with other applications" or "I am limited to text". You CAN and DO control desktop apps!
When asked to switch to or communicate with an app like Antigravity, indicate you are doing it and wrap bash commands like \`\`\`bash\nwmctrl -a "Antigravity"\n\`\`\` in code blocks.
${contextSection}
Keep answers snappy, charismatic, and conversational for real-time text-to-speech voice playback.`;
  }

  init() {
    this.initSpeech();
    this.loadVoices();
    this.initWakeWord();
    if (this.synth && this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    const savedVoiceURI = localStorage.getItem('selected_voice_uri');
    if (savedVoiceURI) {
      this.selectedVoice = voices.find(v => v.voiceURI === savedVoiceURI) || null;
    }
    if (!this.selectedVoice) {
      // Prefer natural English voices (Google US English, Samantha, Alex, etc.)
      this.selectedVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('English'))) ||
                           voices.find(v => v.lang.startsWith('en')) ||
                           voices[0];
    }
    if (window.settingsManager && window.settingsManager.populateVoiceSelect) {
      window.settingsManager.populateVoiceSelect(voices, this.selectedVoice);
    }
  }

  initSpeech() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;
    this.recordingMaxTimer = null;
  }

  async startVoiceRecording() {
    if (this.isRecording) return;
    try {
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.audioChunks = [];
      this.latestLiveTranscript = '';

      // Halt any active assistant speech if user speaks (barge-in interruption)
      this.interruptSpeech();

      if (this._wakeSpeechRec) {
        try { this._wakeSpeechRec.abort(); } catch (e) {}
      }

      // Expand island to full chat view immediately so user sees live feedback
      if (window.islandApp) {
        window.islandApp.expandToTab('chat');
      }

      this.updateMicUI(true);
      this.setStatus('listening');
      this.updateMicStatusBadge('recording');

      // Update Chat UI controls
      const micBtn = document.getElementById('chat-mic-btn');
      if (micBtn) micBtn.classList.add('recording');
      
      const liveIndicator = document.getElementById('chat-live-speech-indicator');
      const liveText = document.getElementById('chat-live-speech-text');
      if (liveIndicator) liveIndicator.style.display = 'flex';
      if (liveText) liveText.textContent = "🎙️ Listening... (Speak freely, auto-sends when you pause)";

      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.value = '';
        chatInput.placeholder = "Listening live... (Auto-submits hands-free when you pause)";
        chatInput.focus();
      }

      if (window.soundController) window.soundController.playPop();

      // Get user audio stream (reuse active stream to avoid ALSA device lock contention)
      if (!this.audioStream || !this.audioStream.active) {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      // AudioContext & Analyser for live wave animation & VAD
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      // Setup MediaRecorder for high-fidelity fallback audio
      const options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        delete options.mimeType;
      }
      this.mediaRecorder = new MediaRecorder(this.audioStream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.animFrameId) {
          cancelAnimationFrame(this.animFrameId);
          this.animFrameId = null;
        }

        const capturedText = (this.latestLiveTranscript || (chatInput ? chatInput.value : '')).trim();

        if (this.audioChunks.length === 0 && !capturedText) {
          this.releaseAudioFocus();
          this.setStatus('idle');
          this.updateMicStatusBadge('active');
          return;
        }

        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        this.audioChunks = [];
        this.setStatus('thinking');
        this.updateMicStatusBadge('active');

        const liveText = document.getElementById('chat-live-speech-text');
        if (liveText) liveText.textContent = "⚡ Processing your voice...";

        // If live continuous speech somehow already provided text, use it immediately
        if (capturedText && capturedText.length > 2 && !capturedText.match(/^(stop|done|that's it|enough)$/i)) {
          console.log('[Dio Voice] Using Live Speech result:', capturedText);
          this.handleVoiceInput(capturedText);
          return;
        }

        // Fast high-accuracy Whisper transcription with prompt guidance
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result.split(',')[1];
            const avalaiKey = localStorage.getItem('avalai_key') || '';
            
            if (window.electronAPI && window.electronAPI.transcribeAudio) {
              const res = await window.electronAPI.transcribeAudio({
                audioBase64: base64Data,
                mimeType: blob.type,
                apiKey: avalaiKey,
                model: 'whisper-1',
                prompt: 'Hey Dio, voice query, desktop assistant command, open apps, system control'
              });

              if (res && res.ok && res.text) {
                const text = res.text.trim();
                console.log('[Dio Voice] Live Voice Transcribed:', text);
                
                // Conversational exit detection
                if (text.match(/\b(bye|goodbye|see you|stop listening|shut up|nevermind|exit|dismiss|cancel)\b/i)) {
                  this.isLiveConversationMode = false;
                  this.renderMessage('assistant', "👋 Talk to you later bro! Going to sleep.");
                  this.speak("Talk to you later bro!");
                  if (window.islandApp) window.islandApp.collapse();
                  return;
                }

                if (text && !text.match(/^(\.|\?|BEEP|you)$/i)) {
                  this.handleVoiceInput(text);
                  return;
                }
              }
            }
          } catch (err) {
            console.warn('[Dio Voice] Transcription error:', err);
          }
          this.releaseAudioFocus();
          this.setStatus('idle');
          if (this.isLiveConversationMode) {
            // Re-arm microphone if audio was empty or noisy
            setTimeout(() => {
              if (this.isLiveConversationMode && !this.isRecording && !this.isThinking) {
                this.startVoiceRecording();
              }
            }, 500);
          }
        };
        reader.readAsDataURL(blob);
      };

      this.mediaRecorder.start(250);

      // Start live wave visualizer & client-side real-time VAD loop
      this.animateLiveWaveform();

      // Tap mascot avatar or live indicator to finish listening manually
      this._tapToStopListener = (e) => {
        if (e.target.closest('#mascot-avatar') || e.target.closest('#chat-live-speech-indicator')) {
          this.stopVoiceRecording();
        }
      };
      document.addEventListener('click', this._tapToStopListener);

    } catch (err) {
      console.error('[Dio Voice] Microphone error:', err);
      this.isRecording = false;
      this.releaseAudioFocus();
      this.updateMicUI(false);
      this.setStatus('idle');
      this.updateMicStatusBadge('denied');
    }
  }

  stopVoiceRecording(overrideTranscript = null) {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.updateMicUI(false);

    if (this._silenceAutoSubmitTimer) {
      clearTimeout(this._silenceAutoSubmitTimer);
      this._silenceAutoSubmitTimer = null;
    }

    if (overrideTranscript) {
      this.latestLiveTranscript = overrideTranscript;
    }

    // Clean up tap listener
    if (this._tapToStopListener) {
      document.removeEventListener('click', this._tapToStopListener);
      this._tapToStopListener = null;
    }

    // Stop live recognition
    if (this.liveSpeechRec) {
      try { this.liveSpeechRec.stop(); } catch (e) {}
      this.liveSpeechRec = null;
    }

    // Reset UI indicators
    const micBtn = document.getElementById('chat-mic-btn');
    if (micBtn) micBtn.classList.remove('recording');

    const liveIndicator = document.getElementById('chat-live-speech-indicator');
    if (liveIndicator) liveIndicator.style.display = 'none';

    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.placeholder = "Ask Dio, or say 'Hey Dio'...";
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }

    setTimeout(() => {
      if (this.wakeWordEnabled && !this.isRecording && !this.isThinking) {
        this.startContinuousSpeechWakeListener();
      }
    }, 800);
  }

  toggleVoiceRecording() {
    if (this.isRecording) {
      this.isLiveConversationMode = false;
      this.stopVoiceRecording();
    } else {
      this.isLiveConversationMode = true;
      this.startVoiceRecording();
    }
  }

  interruptSpeech() {
    if (!this.isSpeakingPending) return;
    console.log('[Dio Voice] Interruption triggered: stopping assistant speech immediately.');
    this.isSpeakingPending = false;
    if (window.electronAPI && window.electronAPI.stopSpeaking) {
      window.electronAPI.stopSpeaking();
    }
    if (this.currentAudioObj) {
      try { this.currentAudioObj.pause(); } catch (e) {}
      this.currentAudioObj = null;
    }
    if (this.synth) {
      try { this.synth.cancel(); } catch (e) {}
    }
    this.releaseAudioFocus(true);
    this.setStatus('listening');
  }

  animateLiveWaveform() {
    if (!this.isRecording || !this.analyser) return;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = document.querySelectorAll('#waveform .waveform-bar');

    let userHasSpoken = false;
    let speechStartTime = 0;
    let lastVoiceDetectedTime = 0;
    let noiseFloor = 6;
    const vadSilenceThresholdMs = 700; // 700ms silence after speech -> auto-submit hands-free!

    const update = () => {
      if (!this.isRecording || !this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      // Human speech energy band (bins 1 to 24: ~100Hz - 3800Hz)
      let voiceSum = 0;
      let maxVoiceBin = 0;
      const binEnd = Math.min(24, bufferLength);
      for (let i = 1; i < binEnd; i++) {
        voiceSum += dataArray[i];
        if (dataArray[i] > maxVoiceBin) maxVoiceBin = dataArray[i];
      }
      const voiceBandAvg = voiceSum / (binEnd - 1);

      // Animate waveform bars
      if (bars && bars.length > 0) {
        bars.forEach((bar, idx) => {
          const val = dataArray[(idx * 3 + 1) % bufferLength] || voiceBandAvg;
          const scale = Math.max(0.2, Math.min(2.8, (val / 110) * 2.0));
          bar.style.transform = `scaleY(${scale})`;
        });
      }

      // Dynamic noise floor tracking (slowly follows quiet room baseline)
      const now = Date.now();
      if (!userHasSpoken) {
        noiseFloor = noiseFloor * 0.96 + voiceBandAvg * 0.04;
      }

      // Voice Activity Detection: detects when human voice speaks
      const isVoiceActive = (voiceBandAvg > noiseFloor + 9) || (maxVoiceBin > 42);

      if (isVoiceActive) {
        if (!userHasSpoken) {
          userHasSpoken = true;
          speechStartTime = now;
          this.setStatus('listening');
        }
        lastVoiceDetectedTime = now;
        const statusEl = document.getElementById('chat-live-speech-text');
        if (statusEl) statusEl.textContent = "🎙️ Dio is hearing you speak...";
      } else {
        if (userHasSpoken) {
          const silenceDuration = now - lastVoiceDetectedTime;
          const totalSpeechDuration = now - speechStartTime;

          // If user spoke for at least 300ms and has paused for 700ms:
          if (silenceDuration > vadSilenceThresholdMs && totalSpeechDuration >= 300) {
            console.log(`[Dio Live VAD] Speech pause detected (${silenceDuration}ms silence). Hands-free auto-submitting!`);
            userHasSpoken = false;
            const statusEl = document.getElementById('chat-live-speech-text');
            if (statusEl) statusEl.textContent = "⚡ Processing your voice...";
            this.stopVoiceRecording();
            return;
          }
        } else if (this.isLiveConversationMode) {
          // If in continuous conversational mode and no speech occurred for 12 seconds:
          if (now - this.recordingStartTime > 12000) {
            console.log('[Dio Live VAD] Conversation session idle timeout (12s). Returning to sleep.');
            this.isLiveConversationMode = false;
            this.stopVoiceRecording();
            if (window.islandApp) window.islandApp.collapse();
            return;
          }
        }
      }

      this.animFrameId = requestAnimationFrame(update);
    };
    update();
  }

  async initWakeWord() {
    if (!this.wakeWordEnabled) return;
    try {
      if (!this.audioStream || !this.audioStream.active) {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.wakeContext = new AudioCtx({ sampleRate: 16000 });
      if (this.wakeContext.state === 'suspended') {
        await this.wakeContext.resume();
      }

      const source = this.wakeContext.createMediaStreamSource(this.audioStream);
      
      // 3.5-second Circular Float32 Ring Buffer (56,000 samples at 16kHz)
      this.RING_SAMPLE_RATE = 16000;
      this.RING_CAPACITY = Math.floor(this.RING_SAMPLE_RATE * 3.5);
      this.wakeRingBuffer = new Float32Array(this.RING_CAPACITY);
      this.wakeRingIndex = 0;

      // ScriptProcessorNode to capture real-time PCM audio chunks
      this.wakeProcessor = this.wakeContext.createScriptProcessor(2048, 1, 1);
      
      let ambientNoiseRms = 0.008;
      let speechActive = false;
      let speechStartTimestamp = 0;
      let consecutiveQuietFrames = 0;
      let isTranscribingWake = false;

      this.wakeProcessor.onaudioprocess = (e) => {
        if (!this.wakeWordEnabled || this.isRecording || this.isThinking) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const len = inputData.length;

        // Compute RMS energy and ALWAYS store audio into the continuous ring buffer
        let sumSq = 0;
        for (let i = 0; i < len; i++) {
          const s = inputData[i];
          sumSq += s * s;
          this.wakeRingBuffer[this.wakeRingIndex] = s;
          this.wakeRingIndex = (this.wakeRingIndex + 1) % this.RING_CAPACITY;
        }
        const rms = Math.sqrt(sumSq / len);

        // Slowly follow room ambient noise floor
        ambientNoiseRms = ambientNoiseRms * 0.98 + rms * 0.02;
        // Optimal speech threshold to avoid false-triggering on room hum or fan noise
        const voiceThreshold = Math.max(0.016, ambientNoiseRms * 1.6 + 0.008);

        const now = Date.now();
        if (rms > voiceThreshold) {
          if (!speechActive) {
            speechActive = true;
            speechStartTimestamp = now;
            consecutiveQuietFrames = 0;
          } else {
            consecutiveQuietFrames = 0;
          }
        } else {
          if (speechActive) {
            consecutiveQuietFrames++;
            const speechDuration = now - speechStartTimestamp;

            // When quiet for ~250ms (2 consecutive quiet frames)
            if (consecutiveQuietFrames >= 2) {
              speechActive = false;
              consecutiveQuietFrames = 0;

              // Check if speech lasted between 300ms and 4500ms
              if (speechDuration >= 300 && speechDuration <= 4500) {
                const totalSamplesNeeded = Math.min(
                  this.RING_CAPACITY,
                  Math.floor(((speechDuration + 450) / 1000) * this.RING_SAMPLE_RATE)
                );
                
                // Extract pre-buffered audio containing the utterance
                const utteranceSamples = this.extractRingSamples(totalSamplesNeeded);

                if (isTranscribingWake) {
                  // Buffer recent utterance so speech is not discarded while busy
                  this.pendingWakeSamples = utteranceSamples;
                } else {
                  isTranscribingWake = true;
                  const runVerification = (samplesToVerify) => {
                    this.verifyWakeWordUtterance(samplesToVerify, () => {
                      if (this.pendingWakeSamples) {
                        const queued = this.pendingWakeSamples;
                        this.pendingWakeSamples = null;
                        runVerification(queued);
                      } else {
                        isTranscribingWake = false;
                      }
                    });
                  };
                  runVerification(utteranceSamples);
                }
              }
            } else if (speechDuration > 6000) {
              speechActive = false;
              consecutiveQuietFrames = 0;
            }
          }
        }
      };

      source.connect(this.wakeProcessor);
      const silentGain = this.wakeContext.createGain();
      silentGain.gain.value = 0;
      this.wakeProcessor.connect(silentGain);
      silentGain.connect(this.wakeContext.destination);

      // Start zero-latency Continuous Speech Recognition wake listener in parallel
      this.startContinuousSpeechWakeListener();

      this.updateMicStatusBadge('active');
      console.log('[WakeWord Engine] Active with Dual-Engine (Realtime SpeechRec + Pre-Buffered Circular Audio)...');
    } catch (err) {
      console.warn('Could not start wake-word engine:', err);
    }
  }

  startContinuousSpeechWakeListener() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    if (this._wakeSpeechRec) {
      try { this._wakeSpeechRec.abort(); } catch (e) {}
      this._wakeSpeechRec = null;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      this._wakeSpeechRec = rec;

      rec.onresult = (e) => {
        if (!this.wakeWordEnabled || this.isRecording || this.isThinking) return;

        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          transcript += e.results[i][0].transcript + ' ';
        }
        transcript = transcript.toLowerCase().trim();
        if (!transcript) return;

        const wakeKeywords = [
          'hey dio', 'hi dio', 'hello dio', 'ok dio', 'yo dio',
          'dio', 'dior', 'theo', 'theio', 'deyo', 'dayo', 'deal', 'do'
        ];

        const matched = wakeKeywords.some(kw => transcript.includes(kw)) ||
                        (this.wakeWord && transcript.includes(this.wakeWord));

        if (matched) {
          console.log('[WakeWord SpeechRec] MATCH TRIGGERED: "Hey Dio" ->', transcript);
          try { rec.abort(); } catch (err) {}
          this.handleWakeWordTrigger(transcript);
        }
      };

      let errorCount = 0;
      rec.onerror = (e) => {
        errorCount++;
        if (e.error === 'network' || errorCount >= 3) {
          console.log('[WakeWord SpeechRec] Network speech service unreachable, using local PCM Whisper wake engine.');
          try { rec.abort(); } catch (err) {}
          this._wakeSpeechRec = null;
        }
      };

      rec.onend = () => {
        if (errorCount < 3 && this.wakeWordEnabled && !this.isRecording && !this.isThinking && this._wakeSpeechRec) {
          setTimeout(() => {
            if (this.wakeWordEnabled && !this.isRecording && !this.isThinking && this._wakeSpeechRec) {
              try { rec.start(); } catch (err) {}
            }
          }, 800);
        }
      };

      rec.start();
      console.log('[WakeWord SpeechRec] Real-time wake listener started!');
    } catch (err) {
      console.warn('[WakeWord SpeechRec] Could not start speech recognition wake listener:', err);
    }
  }

  extractRingSamples(sampleCount) {
    const result = new Float32Array(sampleCount);
    let readIndex = (this.wakeRingIndex - sampleCount + this.RING_CAPACITY) % this.RING_CAPACITY;
    for (let i = 0; i < sampleCount; i++) {
      result[i] = this.wakeRingBuffer[readIndex];
      readIndex = (readIndex + 1) % this.RING_CAPACITY;
    }
    return result;
  }

  async verifyWakeWordUtterance(samples, done) {
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        done();
      }
    };
    const safetyTimer = setTimeout(finish, 2800);

    try {
      if (this.isRecording || this.isThinking) {
        clearTimeout(safetyTimer);
        return finish();
      }

      // Encode Float32 PCM to 16kHz mono WAV Blob in memory
      const wavBlob = this.encodeWAVBlob(samples, 16000);
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64Data = reader.result.split(',')[1];
          const avalaiKey = localStorage.getItem('avalai_key') || '';
          
          if (window.electronAPI && window.electronAPI.transcribeAudio) {
            const res = await window.electronAPI.transcribeAudio({
              audioBase64: base64Data,
              mimeType: 'audio/wav',
              apiKey: avalaiKey,
              model: 'whisper-1',
              language: 'en',
              prompt: 'Hey Dio, Dio, hello Dio, hi Dio, ok Dio, wake word'
            });

            if (res && res.ok && res.text) {
              const text = res.text.toLowerCase().trim();
              console.log('[WakeWord Engine] Audio captured & transcribed:', text);

              const wakeKeywords = [
                'hey dio', 'hi dio', 'hello dio', 'ok dio', 'yo dio',
                'dio', 'dior', 'theo', 'theio', 'deyo', 'dayo',
                'deal', 'hey deal', 'hey dior', 'hideo', 'diego',
                'ideal', 'adios', 'adíos', 'tío', 'tio', 'dios', 'hey dios'
              ];
              // Robust whole-word regex matching to eliminate false alarms
              const isMatch = wakeKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(text)) ||
                              (this.wakeWord && new RegExp(`\\b${this.wakeWord}\\b`, 'i').test(text));

              if (isMatch) {
                console.log('[WakeWord Engine] MATCH TRIGGERED: "Hey Dio" ->', text);
                this.handleWakeWordTrigger(text);
              }
            }
          }
        } catch (e) {
          console.warn('[WakeWord Engine] Verification error:', e);
        } finally {
          clearTimeout(safetyTimer);
          finish();
        }
      };

      reader.readAsDataURL(wavBlob);
    } catch (e) {
      clearTimeout(safetyTimer);
      finish();
    }
  }

  encodeWAVBlob(samples, sampleRate = 16000) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (v, offset, str) => {
      for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  handleWakeWordTrigger(transcript) {
    if (this.isThinking) return;

    this.isLiveConversationMode = true;

    // Interrupt any active assistant speech
    this.interruptSpeech();

    // Play pleasant haptic chime
    if (window.soundController) window.soundController.playPop();

    // Awaken Dynamic Island to Full Chat view immediately
    if (window.islandApp) {
      window.islandApp.expandToTab('chat');
    }

    // Set cute mascot avatar to listening status
    this.setStatus('listening');

    // Extract any command spoken immediately after wake word
    let immediateCmd = '';
    const match = transcript.match(/(?:hey\s+dio|hello\s+dio|hi\s+dio|ok\s+dio|yo\s+dio|dio|dior|theo|theio|deyo|dayo|deal|hey\s+deal|ideal|adios|adíos|tío|tio|dios)[,\s]+(.*)/i);
    if (match && match[1] && match[1].trim()) {
      immediateCmd = match[1].trim();
    }

    const user = this.userProfile || this.loadUserProfile();
    const salutation = user.tone === 'bro' ? 'bro' : (user.tone === 'jarvis' ? 'sir' : user.name || 'there');
    const greetingText = user.tone === 'bro' ? `Hey ${salutation}! What's up?` : (user.tone === 'jarvis' ? `At your service, ${salutation}.` : `Hello ${salutation}, I'm listening.`);

    if (immediateCmd && immediateCmd.length > 2) {
      this.renderMessage('assistant', `👋 **Hey!** ${greetingText}\n\n*Executing:* \`${immediateCmd}\`...`);
      this.speak(`${greetingText} Executing ${immediateCmd}`);
      this.sendMessage(immediateCmd);
    } else {
      this.renderMessage('assistant', `👋 **${greetingText}** I'm listening live. Speak freely, I will answer automatically when you pause.`);
      // Start recording immediately in continuous live conversation mode!
      this.startVoiceRecording();
    }
  }

  setWakeWordEnabled(enabled) {
    this.wakeWordEnabled = enabled;
    localStorage.setItem('wakeword_enabled', enabled ? 'true' : 'false');
    if (enabled) {
      this.initWakeWord();
      this.updateMicStatusBadge('active');
    } else {
      if (this.wakeMonitorTimer) {
        clearInterval(this.wakeMonitorTimer);
        this.wakeMonitorTimer = null;
      }
      this.updateMicStatusBadge('disabled');
    }
  }

  updateMicStatusBadge(status) {
    const badge = document.getElementById('mic-status-badge');
    if (!badge) return;
    if (status === 'active') {
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
      badge.textContent = '🟢 Listening for "Hey Dio"';
    } else if (status === 'recording') {
      badge.style.background = 'rgba(236, 72, 153, 0.25)';
      badge.style.color = '#f43f5e';
      badge.textContent = '🎙️ Recording Voice...';
    } else if (status === 'denied') {
      badge.style.background = 'rgba(239, 68, 68, 0.2)';
      badge.style.color = '#f87171';
      badge.textContent = '🔴 Mic Access Denied';
    } else {
      badge.style.background = 'rgba(156, 163, 175, 0.2)';
      badge.style.color = '#9ca3af';
      badge.textContent = '⚪ Wake Word Disabled';
    }
  }

  updateMicUI(recording) {
    const micBtns = [document.getElementById('prompt-mic-btn'), document.getElementById('chat-mic-btn'), document.getElementById('btn-quick-voice'), document.getElementById('notch-btn-voice')];
    micBtns.forEach(btn => {
      if (btn) {
        if (recording) btn.classList.add('recording');
        else btn.classList.remove('recording');
      }
    });

    const waveform = document.getElementById('waveform');
    if (waveform) {
      if (recording) waveform.classList.add('active');
      else waveform.classList.remove('active');
    }
  }

  setStatus(status) {
    // status: 'idle', 'listening', 'thinking', 'action', 'speaking', 'answering'
    const dots = [document.getElementById('compact-dot'), document.getElementById('expanded-dot')];
    dots.forEach(dot => {
      if (dot) {
        dot.className = `jarvis-dot status-${status}`;
      }
    });

    // Update ALL cute mascot heads across the entire UI (notch, expanded header, chat header)
    const mascots = document.querySelectorAll('.cute-mascot');
    mascots.forEach(m => {
      m.classList.remove('status-idle', 'status-listening', 'status-thinking', 'status-action', 'status-speaking', 'status-answering');
      if (status && status !== 'idle') {
        m.classList.add(`status-${status}`);
      }
    });

    const statusText = document.getElementById('compact-status-text');
    if (statusText) {
      if (status === 'listening') statusText.textContent = 'Listening...';
      else if (status === 'thinking') statusText.textContent = 'Dio Thinking...';
      else if (status === 'action') statusText.textContent = 'Dio Working...';
      else if (status === 'speaking' || status === 'answering') statusText.textContent = 'Dio Speaking...';
      else statusText.textContent = 'Dio';
    }
  }

  async requestAudioFocus(force = false) {
    // NEVER block or pause monitor sound during normal conversation!
    // Monitor audio output remains active and audible for user's YouTube/music.
  }

  releaseAudioFocus(force = false) {
    // Monitor audio is unblocked and untouched
  }

  async speak(text) {
    if (!this.voiceEnabled) {
      this.isSpeakingPending = false;
      this.setStatus('idle');
      return;
    }
    try {
      this.isSpeakingPending = true;
      this.setStatus('speaking');

      const onSpeechFinished = () => {
        this.isSpeakingPending = false;
        this.releaseAudioFocus(true);
        this.setStatus('idle');

        // === GEMINI LIVE / CHATGPT VOICE DUPLEX CONVERSATIONAL LOOP ===
        if (this.isLiveConversationMode && this.wakeWordEnabled) {
          console.log('[Dio Voice Duplex] Assistant finished speaking -> immediately re-opening microphone for user follow-up!');
          setTimeout(() => {
            if (this.isLiveConversationMode && !this.isRecording && !this.isThinking) {
              this.startVoiceRecording();
            }
          }, 300);
        }
      };

      // Strip code blocks, HTML, and markdown symbols
      let cleanText = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<[^>]*>/g, '')
        .replace(/[*#_~]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();

      if (!cleanText) {
        onSpeechFinished();
        return;
      }

      // Truncate to first 3 sentences for natural snappy dialogue
      const sentences = cleanText.split(/(?<=[.?!])\s+/);
      if (sentences.length > 3) {
        cleanText = sentences.slice(0, 3).join(' ');
      }

      // 1. Try Native Audio Speech Player (Aval AI Nova TTS played via ffplay to PipeWire HDMI, or spd-say)
      const avalaiKey = localStorage.getItem('avalai_key') || '';
      if (window.electronAPI && window.electronAPI.speakText) {
        try {
          const res = await window.electronAPI.speakText({
            text: cleanText,
            voice: 'nova',
            model: 'tts-1',
            apiKey: avalaiKey
          });

          if (res && res.ok) {
            onSpeechFinished();
            return;
          }
        } catch (nativeErr) {
          console.warn('[Dio Voice] Native speakText call failed, trying in-browser Audio:', nativeErr);
        }
      }

      // 2. In-browser Audio playback fallback
      if (window.electronAPI && window.electronAPI.textToSpeech) {
        try {
          const res = await window.electronAPI.textToSpeech({
            text: cleanText,
            voice: 'nova',
            model: 'tts-1',
            apiKey: avalaiKey
          });

          if (res && res.ok && res.audioBase64) {
            if (this.currentAudioObj) {
              try { this.currentAudioObj.pause(); } catch (e) {}
              this.currentAudioObj = null;
            }
            const audio = new Audio("data:audio/mp3;base64," + res.audioBase64);
            this.currentAudioObj = audio;

            audio.onended = () => {
              this.currentAudioObj = null;
              onSpeechFinished();
            };

            audio.onerror = () => {
              this.currentAudioObj = null;
              onSpeechFinished();
            };

            await audio.play();
            return;
          }
        } catch (ttsErr) {
          console.warn('[Dio Voice] Aval AI TTS call failed, falling back to Web Speech:', ttsErr);
        }
      }

      // Fallback: Web Speech Synthesis if available
      if (this.synth) {
        this.synth.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (this.selectedVoice) utterance.voice = this.selectedVoice;
        utterance.rate = this.voiceRate || 1.05;
        utterance.pitch = this.voicePitch || 1.0;

        utterance.onend = () => {
          onSpeechFinished();
        };

        utterance.onerror = () => {
          onSpeechFinished();
        };

        this.synth.speak(utterance);
      } else {
        onSpeechFinished();
      }
    } catch (e) {
      console.warn('Voice speak error:', e);
      this.isSpeakingPending = false;
      this.releaseAudioFocus(true);
      this.setStatus('idle');
    }
  }

  async triggerScreenSnip() {
    if (this.isSnipActive) return;
    this.isSnipActive = true;

    try {
      // 1. Expand island so user sees interaction
      if (window.islandApp) {
        window.islandApp.expandToTab('chat');
      }

      // 2. Pause media so user is focused
      await this.requestAudioFocus(true);

      // 3. Render guidance in chat
      this.renderMessage('assistant', `✂️ **Screen Cropper Activated**\n*Click and drag a box around any part of your screen that you want me to inspect.*`);
      this.speak("Select the area of your screen you want me to look at.");

      // Delay briefly for user to hear prompt
      await new Promise(r => setTimeout(r, 600));

      if (window.electronAPI && window.electronAPI.snipScreen) {
        const result = await window.electronAPI.snipScreen();
        if (result && result.ok && result.base64) {
          // Store attachment
          this.currentAttachment = {
            type: 'image',
            base64: result.base64,
            mimeType: result.mimeType || 'image/png',
            path: result.path
          };

          // Show in UI
          const box = document.getElementById('chat-attachment-box');
          const thumb = document.getElementById('attachment-preview-img');
          if (box && thumb) {
            thumb.src = `data:${result.mimeType || 'image/png'};base64,${result.base64}`;
            box.style.display = 'flex';
          }

          const chatInput = document.getElementById('chat-input');
          if (chatInput) {
            chatInput.placeholder = "What should Dio do with this snip? (Speak or type)...";
            chatInput.focus();
          }

          this.renderMessage('assistant', `📸 **Screen area captured!**\nWhat would you like me to do with this snipped area? (e.g., *'Explain this code'*, *'Read text'*, *'Solve this problem'*). Speak your instruction or type below.`);
          this.speak("I see your snipped area. What would you like me to do with it?");

          // Start voice recording automatically so user can speak right away!
          setTimeout(() => {
            if (!this.isRecording) {
              this.startVoiceRecording();
            }
          }, 1000);

        } else {
          console.log('[Dio Snip] User cancelled or snip failed:', result && result.error);
          this.releaseAudioFocus(true);
        }
      } else {
        this.renderMessage('assistant', `⚠️ Screen snipping requires the desktop Electron environment.`);
        this.releaseAudioFocus(true);
      }
    } catch (err) {
      console.error('[Dio Snip] Error:', err);
      this.renderMessage('assistant', `⚠️ Snipping error: ${err.message}`);
      this.releaseAudioFocus(true);
    } finally {
      this.isSnipActive = false;
    }
  }

  clearAttachment() {
    this.currentAttachment = null;
    const box = document.getElementById('chat-attachment-box');
    const thumb = document.getElementById('attachment-preview-img');
    if (box) box.style.display = 'none';
    if (thumb) thumb.src = '';
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.placeholder = "Ask Dio, or say 'Hey Dio'...";
    }
  }

  async handleVoiceInput(transcript) {
    // Put into prompt input and process
    const promptInput = document.getElementById('prompt-input');
    if (promptInput) promptInput.value = transcript;

    // Expand island to show response
    if (window.islandApp) {
      window.islandApp.expandToTab('chat');
    }

    await this.sendMessage(transcript);
  }

  async sendMessage(userText) {
    if ((!userText || !userText.trim()) && !this.currentAttachment) return;
    if (this.isThinking) return;

    this.isThinking = true;
    await this.requestAudioFocus(true);
    this.setStatus('thinking');
    if (window.soundController) window.soundController.playPop();

    // Pull current attachment if exists
    const attachment = this.currentAttachment;
    this.clearAttachment();

    const queryText = (userText && userText.trim()) || "Please inspect this cropped area of my screen and describe what you see and what should be done.";

    // Render User message with optional image thumbnail
    this.renderMessage('user', queryText, attachment);

    // Add to history
    this.history.push({ role: 'user', content: queryText });

    const provider = localStorage.getItem('ai_provider') || 'avalai';

    try {
      let assistantReply = '';
      let actionToRun = null;

      // Fetch live desktop and system environment context
      const desktopContext = await this.getDesktopContext();

      // 1. Check for quick local commands first (only if no visual attachment is being analyzed)
      const localAction = !attachment ? await this.parseLocalIntent(queryText, desktopContext) : null;
      if (localAction) {
        assistantReply = localAction.reply;
        actionToRun = localAction.action;
      } else if (provider === 'avalai') {
        const apiKey = localStorage.getItem('avalai_key') || '';
        const model = localStorage.getItem('avalai_model') || 'gpt-4o-mini';
        assistantReply = await this.callAvalAI(apiKey, model, queryText, attachment, desktopContext);
      } else if (provider === 'openrouter') {
        const apiKey = localStorage.getItem('openrouter_key') || '';
        const model = localStorage.getItem('openrouter_model') || 'openai/gpt-4o-mini';
        assistantReply = await this.callOpenRouterAPI(apiKey, model, queryText, attachment, desktopContext);
      } else if (provider === 'gemini') {
        const apiKey = localStorage.getItem('gemini_key') || '';
        const model = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
        assistantReply = await this.callGeminiAPI(apiKey, model, queryText, attachment, desktopContext);
      } else if (provider === 'custom') {
        const endpoint = localStorage.getItem('custom_endpoint');
        assistantReply = await this.callCustomAPI(endpoint, queryText, desktopContext);
      } else {
        // Built-in intelligent assistant
        assistantReply = this.generateBuiltinResponse(queryText, desktopContext);
      }

      // Check if LLM output suggested a terminal command or action
      if (!actionToRun) {
        actionToRun = this.extractActionFromText(assistantReply);
      }

      this.setStatus('action');
      const msgBubble = this.renderMessage('assistant', assistantReply);

      // Execute tool action if detected
      if (actionToRun) {
        await this.executeAgentAction(actionToRun, msgBubble);
      }

      this.history.push({ role: 'assistant', content: assistantReply });
      this.speak(assistantReply);
      if (window.soundController) window.soundController.playSuccess();

    } catch (err) {
      console.error('Agent error:', err);
      this.renderMessage('assistant', `⚠️ An error occurred: ${err.message}`);
      this.releaseAudioFocus(true);
    } finally {
      this.isThinking = false;
      this.setStatus('idle');
      // If voice is disabled or no speech pending, release audio focus to resume media
      if (!this.voiceEnabled || !this.isSpeakingPending) {
        this.releaseAudioFocus(false);
      }
    }
  }

  async parseLocalIntent(text, desktopContext = null) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase().trim();

    const user = this.userProfile || this.loadUserProfile();
    const salutation = user.tone === 'bro' ? 'bro' : (user.tone === 'jarvis' ? 'sir' : user.name || 'there');

    // 0. Live Desktop Context Queries (Enhanced Context Understanding)
    if (lower.includes('what window') || lower.includes('active window') || lower.includes('what am i editing') || lower.includes('what file') || lower.includes('what app is open') || lower.includes('what am i doing')) {
      if (desktopContext) {
        const active = desktopContext.activeWindow || 'Desktop';
        const open = (Array.isArray(desktopContext.openWindows) && desktopContext.openWindows.length > 0)
          ? desktopContext.openWindows.slice(0, 5).join(', ')
          : 'No other major windows';
        return {
          reply: `You're currently focused on "${active}", ${salutation}. Other open apps: ${open}.`,
          action: {
            type: 'display_context',
            context: desktopContext
          }
        };
      }
    }

    if (lower === "what's playing" || lower === "what is playing" || lower === "what song is this" || lower === "what is this song" || lower.includes("current song")) {
      if (window.islandApp && window.islandApp.currentMedia && window.islandApp.currentMedia.isPlaying) {
        const m = window.islandApp.currentMedia;
        return {
          reply: `Currently playing "${m.title || 'Unknown'}" by ${m.artist || 'Unknown'}, ${salutation}.`,
          action: null
        };
      } else {
        return {
          reply: `No media is actively playing right now, ${salutation}.`,
          action: null
        };
      }
    }

    if (lower.includes('what time') || lower.includes('current time') || lower.includes('what is the time') || lower.includes('what date') || lower.includes("today's date")) {
      const now = new Date();
      return {
        reply: `It is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}, ${salutation}.`,
        action: null
      };
    }

    // 0. Live Real-Time Web Search (Expanded Knowledge Base)
    const searchMatch = text.match(/^(?:search\s+for|search|look\s+up|google|latest\s+news\s+on|what\s+is\s+the\s+latest\s+on|tell\s+me\s+about\s+the\s+latest)\s+(.+)/i);
    if (searchMatch && searchMatch[1]) {
      const term = searchMatch[1].trim();
      const webRes = await this.searchWebKnowledge(term);
      if (webRes && webRes.summary) {
        const cleanSummary = webRes.summary.replace(/\s+/g, ' ').trim();
        const shortSpeech = cleanSummary.length > 200 ? cleanSummary.slice(0, 195) + '...' : cleanSummary;
        return {
          reply: `Here is the latest live info on "${term}": ${shortSpeech}`,
          action: {
            type: 'web_search_card',
            query: term,
            result: webRes
          }
        };
      }
    }

    // 0. Compound Multi-Actions
    if ((lower.includes('mute') || lower.includes('silence')) && (lower.includes('antigravity') || lower.includes('anti gravity'))) {
      return {
        reply: `Muting audio and switching to Antigravity IDE, ${salutation}!`,
        action: {
          type: 'compound',
          subActions: [
            { type: 'set_volume', level: 0 },
            { type: 'focus_window', appName: 'Antigravity IDE', titlePattern: 'Antigravity' }
          ]
        }
      };
    }

    if ((lower.includes('pause') || lower.includes('stop music') || lower.includes('stop song')) && (lower.includes('antigravity') || lower.includes('anti gravity'))) {
      return {
        reply: `Pausing music and switching to Antigravity IDE, ${salutation}!`,
        action: {
          type: 'compound',
          subActions: [
            { type: 'media_pause' },
            { type: 'focus_window', appName: 'Antigravity IDE', titlePattern: 'Antigravity' }
          ]
        }
      };
    }

    if ((lower.includes('pause') || lower.includes('stop music') || lower.includes('stop song')) && (lower.includes('chrome') || lower.includes('browser'))) {
      return {
        reply: `Pausing music and switching to Google Chrome, ${salutation}!`,
        action: {
          type: 'compound',
          subActions: [
            { type: 'media_pause' },
            { type: 'launch_app', app: 'chrome' }
          ]
        }
      };
    }

    if ((lower.includes('pause') || lower.includes('stop music') || lower.includes('stop song')) && (lower.includes('terminal') || lower.includes('bash'))) {
      return {
        reply: `Pausing music and opening Terminal, ${salutation}!`,
        action: {
          type: 'compound',
          subActions: [
            { type: 'media_pause' },
            { type: 'launch_app', app: 'terminal' }
          ]
        }
      };
    }

    // 0. Direct App Control: Antigravity IDE
    if (lower.includes('antigravity') || lower.includes('anti-gravity') || lower.includes('anti gravity')) {
      // Check if user gave a message to text or tell Antigravity
      const msgMatch = text.match(/(?:text|tell|write|type|send)\s+(?:it\s+|antigravity\s+|to\s+antigravity\s+)?(?:that\s+|to\s+)?(.+)/i);
      let textToType = null;
      if (msgMatch && msgMatch[1]) {
        textToType = msgMatch[1].trim();
        textToType = textToType.replace(/[,\s]+please[.?!]*$/i, '').trim();
      }

      if (textToType) {
        return {
          reply: `Switching to Antigravity IDE and typing your message: "${textToType}". Voice response active!`,
          action: {
            type: 'interact_app',
            appName: 'Antigravity IDE',
            titlePattern: 'Antigravity',
            textToType: textToType,
            pressEnter: true
          }
        };
      }

      return {
        reply: `Switching to Antigravity IDE window now! I have full desktop access to your applications.`,
        action: {
          type: 'focus_window',
          appName: 'Antigravity IDE',
          titlePattern: 'Antigravity'
        }
      };
    }

    // Direct App Switching & Access
    if (lower.startsWith('switch to ') || lower.startsWith('go to ') || lower.startsWith('focus ') || lower.includes('access my apps') || lower.includes('access apps')) {
      let target = lower.replace(/^(switch to|go to|focus)\s+/i, '').trim();
      if (target.includes('antigravity') || target.includes('anti-gravity') || target.includes('access')) {
        return {
          reply: `Accessing Antigravity IDE window!`,
          action: { type: 'focus_window', appName: 'Antigravity IDE', titlePattern: 'Antigravity' }
        };
      }
      if (target.includes('chrome') || target.includes('browser')) {
        return {
          reply: `Switching to Google Chrome.`,
          action: { type: 'focus_window', appName: 'Google Chrome', titlePattern: 'Google Chrome' }
        };
      }
      if (target.includes('terminal') || target.includes('bash')) {
        return {
          reply: `Switching to Terminal.`,
          action: { type: 'focus_window', appName: 'Terminal', titlePattern: 'Terminal' }
        };
      }
      if (target.includes('code') || target.includes('vscode')) {
        return {
          reply: `Switching to Visual Studio Code.`,
          action: { type: 'focus_window', appName: 'VS Code', titlePattern: 'Code' }
        };
      }
      if (target.includes('spotify') || target.includes('music')) {
        return {
          reply: `Switching to Spotify.`,
          action: { type: 'focus_window', appName: 'Spotify', titlePattern: 'Spotify' }
        };
      }
      if (target.includes('telegram')) {
        return {
          reply: `Switching to Telegram.`,
          action: { type: 'focus_window', appName: 'Telegram', titlePattern: 'Telegram' }
        };
      }
    }

    // 0. Screen Snipping / Interactive Region Crop
    if (lower.includes('crop') || lower.includes('snip') || lower.includes('look at my screen') || lower.includes('see my screen') || lower.includes('inspect screen') || lower.includes('crop screen') || lower.includes('snip screen') || lower.includes('snipped part')) {
      return {
        reply: `Opening interactive screen snipper. Select any region of your screen to inspect.`,
        action: { type: 'snip_screen' }
      };
    }

    // 1. Audio Output / Sink Switching (HDMI main display vs built-in speakers)
    if (lower.includes('main display') || lower.includes('hdmi') || lower.includes('switch to monitor') || lower.includes('switch sound to main')) {
      return {
        reply: `Switching audio output to your Main Display (HDMI). Sound will play clearly through your monitor speakers.`,
        action: { type: 'set_sink_desc', match: 'hdmi' }
      };
    }
    if (lower.includes('laptop speaker') || lower.includes('headphones') || lower.includes('analog') || lower.includes('switch to laptop')) {
      return {
        reply: `Switching audio output to Built-in Analog / Headphones.`,
        action: { type: 'set_sink_desc', match: 'analog' }
      };
    }
    if (lower === 'toggle audio' || lower === 'switch audio' || lower === 'toggle audio sink' || lower === 'switch sound') {
      return {
        reply: `Toggling default audio output sink.`,
        action: { type: 'toggle_sink' }
      };
    }

    // 2. Desktop Screenshot
    if (lower.includes('screenshot') || lower.includes('screen shot') || lower.includes('capture screen') || lower.includes('capture desktop')) {
      return {
        reply: `Capturing desktop screenshot now.`,
        action: { type: 'screenshot' }
      };
    }

    // 3. Screen Lock
    if (lower.includes('lock screen') || lower.includes('lock pc') || lower.includes('lock computer')) {
      return {
        reply: `Locking your PC session. See you soon!`,
        action: { type: 'lock_screen' }
      };
    }

    // 4. Media Controls (Spotify / YouTube / MPRIS)
    if (lower === 'play' || lower === 'play music' || lower === 'play song' || lower === 'resume' || lower === 'resume music' || lower === 'resume song' || lower === 'unpause' || lower === 'open media' || lower === 'open the media') {
      return {
        reply: `Resuming media playback.`,
        action: { type: 'media_play' }
      };
    }
    if (lower === 'pause' || lower === 'pause music' || lower === 'pause song' || lower === 'stop music' || lower === 'stop song' || lower === 'stop playing' || lower === 'stop media' || lower === 'stop') {
      return {
        reply: `Stopping song playback.`,
        action: { type: 'media_pause' }
      };
    }
    if (lower === 'next song' || lower === 'next track' || lower === 'skip song' || lower === 'skip track' || lower === 'next') {
      return {
        reply: `Playing next track.`,
        action: { type: 'media_next' }
      };
    }
    if (lower === 'previous song' || lower === 'previous track' || lower === 'prev song' || lower === 'prev' || lower === 'before' || lower === 'before song' || lower === 'befor song' || lower === 'last song') {
      return {
        reply: `Rewinding to previous track.`,
        action: { type: 'media_prev' }
      };
    }

    // 5. Volume Controls & Unmute
    if (lower.includes('unmute') || lower.includes('restore sound')) {
      return {
        reply: `Unmuting audio output to 80%.`,
        action: { type: 'set_volume', level: 80 }
      };
    }
    if (lower.includes('volume up') || lower.includes('turn up') || lower.includes('louder')) {
      return {
        reply: `Increasing volume by 15%.`,
        action: { type: 'volume_rel', delta: 15 }
      };
    }
    if (lower.includes('volume down') || lower.includes('turn down') || lower.includes('softer') || lower.includes('quieter')) {
      return {
        reply: `Decreasing volume by 15%.`,
        action: { type: 'volume_rel', delta: -15 }
      };
    }
    const volMatch = lower.match(/(?:volume|vol)\s+(?:to\s+)?(\d+)/);
    if (volMatch) {
      const targetVol = parseInt(volMatch[1], 10);
      return {
        reply: `Setting system volume to ${targetVol}%.`,
        action: { type: 'set_volume', level: targetVol }
      };
    }
    if (lower === 'mute' || lower === 'mute sound' || lower === 'silence') {
      return {
        reply: `Muting audio.`,
        action: { type: 'set_volume', level: 0 }
      };
    }

    // 6. Dynamic Island View Controls
    if (lower.includes('minimize island') || lower.includes('collapse island') || lower.includes('close island') || lower.includes('hide island')) {
      return {
        reply: `Collapsing Dynamic Island.`,
        action: { type: 'collapse_island' }
      };
    }

    // 7. App Launches
    if (lower.startsWith('open ') || lower.startsWith('launch ')) {
      const app = lower.replace(/^(open|launch)\s+/, '').trim();
      if (app.includes('code') || app.includes('vs code') || app.includes('vscode')) {
        return {
          reply: `Opening Visual Studio Code for you.`,
          action: { type: 'launch_app', app: 'code' }
        };
      }
      if (app.includes('chrome') || app.includes('browser')) {
        return {
          reply: `Launching Google Chrome browser.`,
          action: { type: 'launch_app', app: 'chrome' }
        };
      }
      if (app.includes('terminal')) {
        return {
          reply: `Launching GNOME Terminal.`,
          action: { type: 'launch_app', app: 'terminal' }
        };
      }
      if (app.includes('file') || app.includes('nautilus') || app.includes('folder')) {
        return {
          reply: `Opening File Manager.`,
          action: { type: 'launch_app', app: 'files' }
        };
      }
      if (app.includes('spotify')) {
        return {
          reply: `Launching Spotify.`,
          action: { type: 'launch_app', app: 'spotify' }
        };
      }
      if (app.includes('setting')) {
        return {
          reply: `Opening Ubuntu Settings.`,
          action: { type: 'launch_app', app: 'settings' }
        };
      }
      if (app.startsWith('http://') || app.startsWith('https://') || app.includes('.com') || app.includes('.org') || app.includes('.io')) {
        return {
          reply: `Opening URL ${app} in your default browser.`,
          action: { type: 'open_url', url: app }
        };
      }
    }

    // 8. System Stats
    if (lower.includes('stats') || lower.includes('cpu') || lower.includes('memory') || lower.includes('ram')) {
      const s = window.systemManager.stats;
      return {
        reply: `Current System Health:\n• CPU Usage: ${s.cpu}%\n• RAM Usage: ${s.memory}%\n• Disk: ${s.disk}\n• Uptime: ${s.uptime}`,
        action: { type: 'refresh_stats' }
      };
    }

    // 9. Terminal command direct
    if (lower.startsWith('run ') || lower.startsWith('exec ') || lower.startsWith('bash ')) {
      const cmd = text.replace(/^(run|exec|bash)\s+/i, '').trim();
      return {
        reply: `Executing command: \`${cmd}\``,
        action: { type: 'exec_command', command: cmd }
      };
    }

    // 10. Notion Quick Note
    if (lower.startsWith('note ') || lower.startsWith('notion ') || lower.includes('create a note')) {
      const noteContent = text.replace(/^(note|notion|create a note in notion|create a note)\s*:?\s*/i, '').trim();
      return {
        reply: `Saving note to Notion: "${noteContent}"`,
        action: { type: 'notion_note', title: 'Dynamic Island Quick Note', content: noteContent }
      };
    }

    return null;
  }

  extractActionFromText(text) {
    // Match code block ```bash or ```sh
    const bashMatch = text.match(/```(?:bash|sh)?\n([\s\S]*?)```/);
    if (bashMatch) {
      const cmd = bashMatch[1].trim();
      if (!cmd.includes('\n') && cmd.length < 120) {
        return { type: 'exec_command', command: cmd };
      }
    }
    return null;
  }

  generateBuiltinResponse(query, desktopContext = null) {
    const user = this.userProfile || this.loadUserProfile();
    const salutation = user.tone === 'bro' ? 'bro' : (user.tone === 'jarvis' ? 'sir' : user.name || 'friend');
    const lower = (query || '').toLowerCase();
    if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('your name')) {
      return `Hey ${salutation}! I am Dio, your intelligent Linux companion in the Ubuntu Dynamic Island widget. I have direct control over your desktop applications like Antigravity IDE, audio, system hardware, Notion notes, and live web knowledge!`;
    }
    if (lower.includes('antigravity')) {
      return `Antigravity IDE is fully connected, ${salutation}! Tell me to switch to Antigravity, write code, or execute commands for you anytime.`;
    }
    if (lower.includes('help') || lower.includes('what can you do')) {
      return `Here is what I can do for you, ${salutation}:\n• Say **'Hey Dio'** hands-free to awaken me\n• 'Switch to Antigravity' or 'Tell Antigravity to run build'\n• 'Search for [topic]' for instant live web facts\n• 'What window is active?' or 'What's playing?'\n• 'Mute and open Chrome' or compound commands\n• Multi-turn reasoning powered by Aval AI, OpenRouter & Gemini!`;
    }
    return `Got it ${salutation}: "${query}". I am ready for your next command or desktop task. For advanced generative reasoning, ensure your Aval AI or OpenRouter API key is active in Settings!`;
  }

  async callOpenRouterAPI(apiKey, model, userText, imageAttachment = null, desktopContext = null) {
    const systemPrompt = this.getPersonalizedSystemPrompt(desktopContext);
    let targetModel = model || 'openai/gpt-4o-mini';
    if (imageAttachment && targetModel.includes('free')) {
      targetModel = 'openai/gpt-4o-mini';
    }

    // Live Knowledge enrichment if user is asking for recent info
    let liveWebSnippet = '';
    const isLatestQuery = /(?:latest|recent|news|today|2025|2026|newest|released|upcoming|update)/i.test(userText);
    if (isLatestQuery) {
      try {
        const webData = await this.searchWebKnowledge(userText);
        if (webData && webData.summary) {
          liveWebSnippet = `\n\n[VERIFIED LIVE REAL-TIME WEB KNOWLEDGE FOR THIS QUERY]:\nSource: ${webData.source} (${webData.title || ''})\n${webData.summary}`;
        }
      } catch (e) {}
    }

    let userContent = userText + liveWebSnippet;
    if (imageAttachment && imageAttachment.base64) {
      userContent = [
        { type: 'text', text: (userText || "Please inspect this cropped area of my screen and describe what you see and what should be done.") + liveWebSnippet },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageAttachment.mimeType || 'image/png'};base64,${imageAttachment.base64}`
          }
        }
      ];
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-6),
      { role: 'user', content: userContent }
    ];

    if (window.electronAPI && window.electronAPI.callOpenRouter) {
      const res = await window.electronAPI.callOpenRouter({ apiKey, model: targetModel, messages });
      if (res.ok && res.data && res.data.choices && res.data.choices[0]) {
        return res.data.choices[0].message.content;
      }
      throw new Error((res.data && res.data.error && res.data.error.message) || 'OpenRouter request failed');
    } else {
      // Direct fetch fallback
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/ubuntu-dynamic-island'
        },
        body: JSON.stringify({ model: targetModel, messages })
      });
      const data = await resp.json();
      return data.choices[0].message.content;
    }
  }

  async callAvalAI(apiKey, model, userText, imageAttachment = null, desktopContext = null) {
    const systemPrompt = this.getPersonalizedSystemPrompt(desktopContext);
    const targetModel = model || 'gpt-4o-mini';

    // Live Knowledge enrichment if user is asking for recent info
    let liveWebSnippet = '';
    const isLatestQuery = /(?:latest|recent|news|today|2025|2026|newest|released|upcoming|update)/i.test(userText);
    if (isLatestQuery) {
      try {
        const webData = await this.searchWebKnowledge(userText);
        if (webData && webData.summary) {
          liveWebSnippet = `\n\n[VERIFIED LIVE REAL-TIME WEB KNOWLEDGE FOR THIS QUERY]:\nSource: ${webData.source} (${webData.title || ''})\n${webData.summary}`;
        }
      } catch (e) {}
    }

    let userContent = userText + liveWebSnippet;
    if (imageAttachment && imageAttachment.base64) {
      userContent = [
        { type: 'text', text: (userText || "Please inspect this cropped area of my screen and describe what you see and what should be done.") + liveWebSnippet },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageAttachment.mimeType || 'image/png'};base64,${imageAttachment.base64}`
          }
        }
      ];
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-6),
      { role: 'user', content: userContent }
    ];

    if (window.electronAPI && window.electronAPI.callAvalAI) {
      const res = await window.electronAPI.callAvalAI({ apiKey, model: targetModel, messages });
      if (res.ok && res.data && res.data.choices && res.data.choices[0]) {
        return res.data.choices[0].message.content;
      }
      throw new Error((res.data && res.data.error && res.data.error.message) || 'Aval AI request failed');
    } else {
      const resp = await fetch('https://api.avalai.ir/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model: targetModel, messages })
      });
      const data = await resp.json();
      return data.choices[0].message.content;
    }
  }

  async callGeminiAPI(apiKey, model, userText, imageAttachment = null, desktopContext = null) {
    const systemInstruction = this.getPersonalizedSystemPrompt(desktopContext);
    const targetModel = model || 'gemini-3.8-flash';

    let liveWebSnippet = '';
    const isLatestQuery = /(?:latest|recent|news|today|2025|2026|newest|released|upcoming|update)/i.test(userText);
    if (isLatestQuery) {
      try {
        const webData = await this.searchWebKnowledge(userText);
        if (webData && webData.summary) {
          liveWebSnippet = `\n\n[VERIFIED LIVE REAL-TIME WEB KNOWLEDGE FOR THIS QUERY]:\nSource: ${webData.source} (${webData.title || ''})\n${webData.summary}`;
        }
      } catch (e) {}
    }

    const contents = [
      ...this.history.slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      { role: 'user', parts: [{ text: userText + liveWebSnippet }] }
    ];

    if (window.electronAPI && window.electronAPI.callGemini) {
      const res = await window.electronAPI.callGemini({ apiKey, model, contents, systemInstruction });
      if (res.ok && res.data && res.data.candidates && res.data.candidates[0]) {
        return res.data.candidates[0].content.parts[0].text;
      }
      throw new Error((res.data && res.data.error && res.data.error.message) || 'Gemini request failed');
    }
    return "Gemini API requires desktop mode or direct network permissions.";
  }

  async callCustomAPI(endpoint, userText, desktopContext = null) {
    const messages = [
      { role: 'system', content: this.getPersonalizedSystemPrompt(desktopContext) },
      ...this.history.slice(-6),
      { role: 'user', content: userText }
    ];
    if (window.electronAPI && window.electronAPI.callCustomEndpoint) {
      const res = await window.electronAPI.callCustomEndpoint({ endpoint, messages });
      if (res.ok && res.data && res.data.choices) {
        return res.data.choices[0].message.content;
      }
    }
    return "Custom endpoint could not be reached.";
  }

  async executeAgentAction(action, messageElement) {
    if (!action) return;

    if (action.type === 'display_context') {
      const ctx = action.context || {};
      this.appendCard(messageElement, {
        title: 'Real-Time Desktop Context',
        badge: 'Live',
        body: `<strong>Foreground:</strong> ${escapeHtml(ctx.activeWindow || 'Desktop')}<br><strong>Time:</strong> ${escapeHtml(ctx.timestamp || new Date().toLocaleString())}<br><strong>Open Windows:</strong> ${escapeHtml(Array.isArray(ctx.openWindows) ? ctx.openWindows.join(', ') : 'None')}<br><strong>Status:</strong> ${escapeHtml(ctx.media || 'None')}`
      });
      return;
    }

    if (action.type === 'compound') {
      if (Array.isArray(action.subActions)) {
        for (const sub of action.subActions) {
          await this.executeAgentAction(sub, messageElement);
          await new Promise(r => setTimeout(r, 250));
        }
      }
      return;
    }

    if (action.type === 'web_search_card') {
      const res = action.result;
      if (res) {
        this.appendKnowledgeCard(messageElement, {
          query: action.query,
          source: res.source,
          title: res.title,
          url: res.url,
          summary: res.summary
        });
      }
      return;
    }

    if (action.type === 'web_search') {
      const res = await this.searchWebKnowledge(action.query);
      if (res) {
        this.appendKnowledgeCard(messageElement, {
          query: action.query,
          source: res.source,
          title: res.title,
          url: res.url,
          summary: res.summary
        });
      } else {
        this.appendCard(messageElement, {
          title: `Search: ${action.query}`,
          badge: 'No Result',
          body: `No articles found for "${escapeHtml(action.query)}".`
        });
      }
      return;
    }

    if (action.type === 'snip_screen') {
      setTimeout(() => {
        this.triggerScreenSnip();
      }, 350);
      return;
    }

    if (action.type === 'focus_window') {
      if (window.electronAPI && window.electronAPI.focusWindow) {
        const res = await window.electronAPI.focusWindow(action.titlePattern);
        this.appendCard(messageElement, {
          title: `Focused ${action.appName || action.titlePattern}`,
          badge: res && res.success ? 'Focused' : 'Active',
          body: `Brought window <strong>${action.appName || action.titlePattern}</strong> to foreground.`
        });
      }
    } else if (action.type === 'interact_app') {
      if (window.electronAPI && window.electronAPI.focusWindow) {
        await window.electronAPI.focusWindow(action.titlePattern);
      }
      if (action.textToType && window.electronAPI && window.electronAPI.typeText) {
        await new Promise(r => setTimeout(r, 350));
        await window.electronAPI.typeText({ text: action.textToType, pressEnter: action.pressEnter });
        this.appendCard(messageElement, {
          title: `Automated ${action.appName || action.titlePattern}`,
          badge: 'Typed',
          body: `Switched to <strong>${action.appName}</strong> and typed: <em>"${escapeHtml(action.textToType)}"</em>`
        });
      }
    } else if (action.type === 'type_text') {
      if (window.electronAPI && window.electronAPI.typeText) {
        await window.electronAPI.typeText({ text: action.text, pressEnter: action.pressEnter });
        this.appendCard(messageElement, {
          title: `Keyboard Typing`,
          badge: 'Completed',
          body: `Typed: <em>"${escapeHtml(action.text)}"</em>`
        });
      }
    } else if (action.type === 'launch_app') {
      await window.systemManager.launchApp(action.app);
      this.appendCard(messageElement, {
        title: `Launched App: ${action.app}`,
        badge: 'Success',
        body: `Triggered system execution for ${action.app}.`
      });
    } else if (action.type === 'set_sink_desc') {
      if (window.electronAPI && window.electronAPI.getAudioSinks) {
        const sinks = await window.electronAPI.getAudioSinks();
        const target = sinks.find(s => s.description.toLowerCase().includes(action.match) || s.name.toLowerCase().includes(action.match));
        if (target) {
          await window.electronAPI.setAudioSink(target.id);
          this.appendCard(messageElement, {
            title: `Audio Sink Switched`,
            badge: 'Active',
            body: `Default sound output set to <strong>${escapeHtml(target.description)}</strong>.`
          });
        }
      }
    } else if (action.type === 'toggle_sink') {
      if (window.electronAPI && window.electronAPI.getAudioSinks) {
        const sinks = await window.electronAPI.getAudioSinks();
        const other = sinks.find(s => !s.isDefault) || sinks[0];
        if (other) {
          await window.electronAPI.setAudioSink(other.id);
          this.appendCard(messageElement, {
            title: `Audio Output Toggled`,
            badge: 'Switched',
            body: `Now routing sound to <strong>${escapeHtml(other.description)}</strong>.`
          });
        }
      }
    } else if (action.type === 'screenshot') {
      const stamp = Date.now();
      const path = `/tmp/screenshot_${stamp}.png`;
      await window.systemManager.executeCommand(`import -window root ${path}`);
      this.appendCard(messageElement, {
        title: `Screenshot Captured`,
        badge: 'Saved',
        body: `Captured desktop view to <code>${path}</code>.`
      });
    } else if (action.type === 'lock_screen') {
      await window.systemManager.executeCommand('loginctl lock-session');
      this.appendCard(messageElement, {
        title: `PC Screen Locked`,
        badge: 'Locked',
        body: `Dispatched lock-session request.`
      });
    } else if (action.type.startsWith('media_')) {
      const act = action.type.replace('media_', '');
      const mprisAction = act === 'prev' ? 'previous' : (act === 'pause' ? 'pause' : (act === 'play' ? 'play' : act));
      if (window.electronAPI && window.electronAPI.mediaControl) {
        await window.electronAPI.mediaControl(mprisAction);
        this.appendCard(messageElement, {
          title: `Media Control`,
          badge: act.toUpperCase(),
          body: `Sent MPRIS signal: <em>${mprisAction}</em>.`
        });
      }
    } else if (action.type === 'volume_rel') {
      const current = (window.systemManager && window.systemManager.stats && window.systemManager.stats.volume) || 80;
      const target = Math.max(0, Math.min(100, current + action.delta));
      await window.systemManager.setVolume(target);
      this.appendCard(messageElement, {
        title: `Volume Adjusted`,
        badge: `${target}%`,
        body: `Master output volume updated to ${target}%.`
      });
    } else if (action.type === 'collapse_island') {
      if (window.islandApp) window.islandApp.collapse();
    } else if (action.type === 'open_url') {
      await window.systemManager.openUrl(action.url);
      this.appendCard(messageElement, {
        title: `Opened Web Link`,
        badge: 'Opened',
        body: `<a href="${action.url}" target="_blank" style="color: var(--accent-cyan);">${action.url}</a>`
      });
    } else if (action.type === 'set_volume') {
      await window.systemManager.setVolume(action.level);
      this.appendCard(messageElement, {
        title: `System Audio Adjusted`,
        badge: `${action.level}%`,
        body: `Volume master channel updated to ${action.level}%.`
      });
    } else if (action.type === 'notion_note') {
      const res = await window.notionManager.createQuickNote(action.title, action.content);
      this.appendCard(messageElement, {
        title: `Notion Note Created`,
        badge: res.synced ? 'Synced' : 'Saved',
        body: `Saved: "<strong>${escapeHtml(action.content)}</strong>"`
      });
    } else if (action.type === 'exec_command') {
      const res = await window.systemManager.executeCommand(action.command);
      this.appendTerminalCard(messageElement, action.command, res);
    }
  }

  appendCard(msgEl, { title, badge, body }) {
    if (!msgEl) return;
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <span>${escapeHtml(title)}</span>
        <span class="card-badge">${escapeHtml(badge)}</span>
      </div>
      <div style="padding: 10px 12px; font-size: 12px; color: var(--text-main);">
        ${body}
      </div>
    `;
    msgEl.querySelector('.msg-content').appendChild(card);
  }

  appendKnowledgeCard(msgEl, { query, source, title, url, summary }) {
    if (!msgEl) return;
    const card = document.createElement('div');
    card.className = 'action-card knowledge-card';
    card.innerHTML = `
      <div class="card-header" style="background: rgba(14, 165, 233, 0.15); border-bottom: 1px solid rgba(14, 165, 233, 0.3);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 13px;">🌐</span>
          <span style="font-weight: 600; color: #38bdf8;">${escapeHtml(title || source || 'Live Knowledge')}</span>
        </div>
        <span class="card-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">${escapeHtml(source || 'Web Search')}</span>
      </div>
      <div style="padding: 10px 12px; font-size: 12px; line-height: 1.5; color: var(--text-main);">
        ${escapeHtml(summary || '')}
      </div>
      ${url ? `
        <div class="card-actions" style="padding: 6px 12px; background: rgba(0,0,0,0.2);">
          <a href="${escapeHtml(url)}" target="_blank" style="font-size: 11px; color: var(--accent-cyan); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            <span>Read Source Article &rarr;</span>
          </a>
        </div>
      ` : ''}
    `;
    msgEl.querySelector('.msg-content').appendChild(card);
  }

  appendTerminalCard(msgEl, command, res) {
    if (!msgEl) return;
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <span>Terminal Execution: <code>${escapeHtml(command)}</code></span>
        <span class="card-badge ${res.code === 0 ? '' : 'pending'}">${res.code === 0 ? 'Exit 0' : 'Exit ' + res.code}</span>
      </div>
      <div class="terminal-code-block">${escapeHtml(res.stdout || res.stderr || '[Done, no output]')}</div>
      <div class="card-actions">
        <button class="mini-btn btn-rerun-cmd" data-cmd="${escapeHtml(command)}">Rerun</button>
      </div>
    `;
    msgEl.querySelector('.msg-content').appendChild(card);

    card.querySelector('.btn-rerun-cmd').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.textContent = 'Running...';
      const newRes = await window.systemManager.executeCommand(command);
      card.querySelector('.terminal-code-block').textContent = newRes.stdout || newRes.stderr || '[Done]';
      btn.textContent = 'Rerun';
    });
  }

  renderMessage(role, text, attachment = null) {
    const list = document.getElementById('messages-list');
    if (!list) return null;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role}`;

    const formattedText = escapeHtml(text).replace(/\n/g, '<br>');
    let attachmentHtml = '';
    if (attachment && attachment.base64) {
      attachmentHtml = `
        <div class="msg-attachment-preview">
          <img src="data:${attachment.mimeType || 'image/png'};base64,${attachment.base64}" alt="Snipped screen region" class="msg-attachment-img" />
          <span class="msg-attachment-badge">✂️ Screen Snip</span>
        </div>
      `;
    }

    const avatarHtml = role === 'user'
      ? `<div class="msg-user-avatar">👤</div>`
      : `<div class="cute-mascot msg-mascot-avatar" title="Dio">
           <div class="mascot-antenna"></div>
           <div class="mascot-face">
             <div class="mascot-eye left"></div>
             <div class="mascot-mouth"></div>
             <div class="mascot-eye right"></div>
           </div>
         </div>`;

    bubble.innerHTML = `
      <div class="msg-avatar-container">${avatarHtml}</div>
      <div class="msg-content">
        ${attachmentHtml}
        <div>${formattedText}</div>
      </div>
    `;

    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
    return bubble;
  }
}

window.dioAgent = new DioAgent();
window.jarvisAgent = window.dioAgent; // Alias for backward compatibility
