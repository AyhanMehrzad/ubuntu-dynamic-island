// Browser Mock Bridge for Testing Outside Electron
if (!window.electronAPI) {
  console.log('[Dynamic Island] Running in Browser Preview Mode.');

  // Add simulated desktop wallpaper background for preview
  document.addEventListener('DOMContentLoaded', () => {
    document.body.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)';
    document.body.style.minHeight = '100vh';
    document.body.style.display = 'flex';
    document.body.style.flexDirection = 'column';
    document.body.style.alignItems = 'center';
    document.body.style.paddingTop = '16px';

    // Add browser preview banner
    const banner = document.createElement('div');
    banner.style.cssText = 'position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); padding: 6px 14px; border-radius: 9999px; color: #94a3b8; pointer-events: none; z-index: 9999;';
    banner.innerHTML = '✨ Ubuntu Dynamic Island Preview • Press <span style="color:#fff;font-weight:600;">ESC</span> to collapse • Click pill to expand';
    document.body.appendChild(banner);
  });

  window.electronAPI = {
    resizeIsland: async ({ state, width, height }) => {
      return { state, width, height };
    },
    collapseIsland: async () => true,
    expandIsland: async () => true,
    setAlwaysOnTop: async (flag) => flag,
    hideIsland: async () => true,
    closeApp: async () => true,
    executeCommand: async (cmd) => {
      await new Promise(r => setTimeout(r, 400));
      if (cmd.includes('free')) {
        return { stdout: '               total        used        free      shared  buff/cache   available\nMem:           15710        6681        1121        1093        8924        9028\nSwap:           4095           0        4095', stderr: '', code: 0 };
      }
      if (cmd.includes('uptime')) {
        return { stdout: 'up 3 hours, 42 minutes, 1 user, load average: 0.42, 0.38, 0.35', stderr: '', code: 0 };
      }
      if (cmd.includes('ps')) {
        return { stdout: 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nrupper    2241  4.8  3.2 4192000 524000 ?      Sl   16:15   0:14 code\nrupper    3412  3.2  2.8 3840000 450000 ?      Sl   16:12   0:08 google-chrome', stderr: '', code: 0 };
      }
      return { stdout: `[Simulation: bash -c "${cmd}"]\nCommand executed successfully.`, stderr: '', code: 0 };
    },
    openUrl: async (url) => {
      window.open(url, '_blank');
      return { success: true };
    },
    openPath: async (p) => {
      return { success: true, simulated: true };
    },
    launchApp: async (app) => {
      return { success: true, app, simulated: true };
    },
    getSystemStats: async () => {
      return {
        cpu: Math.round(14 + Math.random() * 15),
        memory: 42,
        memoryTotal: '16.0 GB',
        memoryUsed: '6.7 GB',
        disk: '48%',
        diskAvail: '180 GB',
        uptime: '3 hours, 42 mins'
      };
    },
    setVolume: async (lvl) => ({ success: true, level: lvl }),
    getVolume: async () => ({ volume: 80, muted: false }),
    mediaControl: async (action) => ({ success: true, action }),
    getAutostartStatus: async () => false,
    setAutostartStatus: async (en) => en,
    callOpenRouter: async ({ apiKey, model, messages }) => {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/ubuntu-dynamic-island'
        },
        body: JSON.stringify({ model, messages })
      });
      const data = await resp.json();
      return { ok: resp.ok, status: resp.status, data };
    },
    callGemini: async ({ apiKey, model, contents, systemInstruction }) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemInstruction }] } })
      });
      const data = await resp.json();
      return { ok: resp.ok, status: resp.status, data };
    },
    callCustomEndpoint: async () => ({ ok: false, error: 'Not available in browser mode' }),
    callNotion: async () => ({ ok: false, error: 'Not available in browser mode' }),
    onToggleShortcut: () => {},
    onWindowBlur: () => {}
  };
}
