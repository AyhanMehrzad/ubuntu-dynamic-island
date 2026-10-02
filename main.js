const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

// Load local environment variables from .env
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {}

let mainWindow = null;
let currentWidth = 280;
let currentHeight = 44;
let isPinned = false;
let selectedDisplayId = null;
let customCompactWidth = 280;
let customCompactHeight = 44;

function getTargetDisplay() {
  const displays = screen.getAllDisplays();
  if (selectedDisplayId !== null && selectedDisplayId !== undefined) {
    const found = displays.find(d => String(d.id) === String(selectedDisplayId));
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

// Track CPU delta for accurate measurement without external tools
let previousCpuStats = null;
function getCpuUsageFromProc() {
  return new Promise((resolve) => {
    fs.readFile('/proc/stat', 'utf8', (err, data) => {
      if (err || !data) return resolve(0);
      const lines = data.split('\n');
      const cpuLine = lines.find(l => l.startsWith('cpu '));
      if (!cpuLine) return resolve(0);
      const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
      const idle = parts[3] + (parts[4] || 0); // idle + iowait
      const total = parts.reduce((acc, val) => acc + val, 0);

      if (!previousCpuStats) {
        previousCpuStats = { idle, total };
        return resolve(5); // initial placeholder
      }

      const idleDelta = idle - previousCpuStats.idle;
      const totalDelta = total - previousCpuStats.total;
      previousCpuStats = { idle, total };

      if (totalDelta <= 0) return resolve(0);
      const usage = Math.round(100 * (1 - idleDelta / totalDelta));
      resolve(Math.max(0, Math.min(100, usage)));
    });
  });
}

function getMemoryUsageFromProc() {
  return new Promise((resolve) => {
    fs.readFile('/proc/meminfo', 'utf8', (err, data) => {
      if (err || !data) return resolve({ total: 16, used: 8, percent: 50 });
      const stats = {};
      data.split('\n').forEach(line => {
        const [k, v] = line.split(':');
        if (k && v) {
          stats[k.trim()] = parseInt(v.trim().split(' ')[0], 10); // in kB
        }
      });
      const totalKb = stats['MemTotal'] || 16000000;
      const availKb = stats['MemAvailable'] || stats['MemFree'] || 8000000;
      const usedKb = totalKb - availKb;
      const percent = Math.round((usedKb / totalKb) * 100);
      resolve({
        totalGb: (totalKb / 1048576).toFixed(1),
        usedGb: (usedKb / 1048576).toFixed(1),
        percent
      });
    });
  });
}

function createWindow() {
  const targetDisplay = getTargetDisplay();
  const screenWidth = targetDisplay.bounds.width;

  currentWidth = customCompactWidth;
  currentHeight = customCompactHeight;
  const startX = targetDisplay.bounds.x + Math.round((screenWidth - currentWidth) / 2);
  const startY = targetDisplay.bounds.y + 10;

  mainWindow = new BrowserWindow({
    width: currentWidth,
    height: currentHeight,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: 'toolbar',
    title: 'Ubuntu Dynamic Island - Dio AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  // Ensure it stays above other windows on X11
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message}`);
  });

  mainWindow.webContents.once('did-finish-load', () => {
    // Start background desktop notification interception and MPRIS media poller
    startNotificationMonitor(mainWindow);
    startMediaPoller(mainWindow);

    const testArg = process.argv.find(arg => arg.startsWith('--test-state='));
    console.log('MAIN did-finish-load, argv:', process.argv, 'testArg:', testArg);
    if (testArg) {
      const state = testArg.split('=')[1];
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('Sending test:set-state to renderer:', state);
          mainWindow.webContents.send('test:set-state', state);
          if (process.argv.includes('--scroll=settings-bottom')) {
            setTimeout(() => {
              mainWindow.webContents.executeJavaScript("const el = document.getElementById('pane-settings'); if (el) el.scrollTop = 500;");
            }, 600);
          } else if (process.argv.includes('--scroll=settings-wake')) {
            setTimeout(() => {
              mainWindow.webContents.executeJavaScript("const el = document.getElementById('pane-settings'); if (el) el.scrollTop = 950;");
            }, 600);
          }
        }
      }, 500);
    }
  });

  mainWindow.on('blur', () => {
    if (!isPinned && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:blur');
    }
  });

  // Register Global Hotkeys
  const registerShortcut = (accel) => {
    try {
      return globalShortcut.register(accel, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut:toggle');
          mainWindow.focus();
        }
      });
    } catch (e) {
      console.warn(`Could not register ${accel}:`, e.message);
      return false;
    }
  };

  const registered = registerShortcut('CommandOrControl+Shift+Space') ||
                     registerShortcut('Alt+Space') ||
                     registerShortcut('Super+I');
  
  if (registered) {
    console.log('Global toggle shortcut successfully registered!');
  }

  // Ensure default microphone input is unmuted and set to full volume for Hey Dio
  exec('wpctl set-mute @DEFAULT_AUDIO_SOURCE@ 0 2>/dev/null && wpctl set-volume @DEFAULT_AUDIO_SOURCE@ 1.0 2>/dev/null || wpctl set-volume 53 1.0 2>/dev/null', () => {});
}

// Multi-Monitor Screen Handlers
ipcMain.handle('screen:get-displays', () => {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  return displays.map((d, idx) => ({
    id: String(d.id),
    index: idx,
    name: `Display ${idx + 1} (${d.bounds.width}x${d.bounds.height}${d.id === primaryId ? ' - Primary' : ''})`,
    isPrimary: d.id === primaryId,
    isSelected: selectedDisplayId ? String(d.id) === String(selectedDisplayId) : d.id === primaryId,
    bounds: d.bounds
  }));
});

ipcMain.handle('screen:set-display', (event, displayId) => {
  selectedDisplayId = displayId;
  const target = getTargetDisplay();
  const targetX = target.bounds.x + Math.round((target.bounds.width - currentWidth) / 2);
  const targetY = target.bounds.y + 10;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBounds({ x: targetX, y: targetY, width: currentWidth, height: currentHeight }, true);
  }
  return true;
});

// Custom Island Dimension Sizing
ipcMain.handle('island:set-custom-size', (event, { width, height }) => {
  if (width) customCompactWidth = parseInt(width, 10);
  if (height) customCompactHeight = parseInt(height, 10);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const target = getTargetDisplay();
    currentWidth = customCompactWidth;
    currentHeight = customCompactHeight;
    const targetX = target.bounds.x + Math.round((target.bounds.width - currentWidth) / 2);
    const targetY = target.bounds.y + 10;
    mainWindow.setBounds({ x: targetX, y: targetY, width: currentWidth, height: currentHeight }, true);
  }
  return { width: customCompactWidth, height: customCompactHeight };
});

// Window Bounds & Dynamic Morphing Handler
ipcMain.handle('island:resize', (event, { state, width, height }) => {
  console.log('MAIN island:resize -> state:', state, 'width:', width, 'height:', height);
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const targetDisplay = getTargetDisplay();
  const screenWidth = targetDisplay.bounds.width;

  let targetWidth = width || customCompactWidth;
  let targetHeight = height || customCompactHeight;

  if (state === 'compact') {
    targetWidth = customCompactWidth;
    targetHeight = customCompactHeight;
  } else if (state === 'quick') {
    targetWidth = Math.max(460, customCompactWidth + 80);
    targetHeight = Math.max(54, customCompactHeight + 10);
  } else if (state === 'notch') {
    // Apple Phone Notchbar Card (Spotify, Volume, Media & Quick Apps) - spacious and responsive
    targetWidth = 500;
    targetHeight = 242;
  } else if (state === 'notification') {
    // Cool Floating Dynamic Notification
    targetWidth = 480;
    targetHeight = 72;
  } else if (state === 'prompt') {
    targetWidth = 600;
    targetHeight = 94;
  } else if (state === 'expanded') {
    targetWidth = 760;
    targetHeight = 560;
  } else if (state === 'settings') {
    targetWidth = 780;
    targetHeight = 600;
  }

  currentWidth = targetWidth;
  currentHeight = targetHeight;
  const newX = targetDisplay.bounds.x + Math.round((screenWidth - targetWidth) / 2);
  const newY = targetDisplay.bounds.y + 10;

  mainWindow.setBounds({
    x: newX,
    y: newY,
    width: targetWidth,
    height: targetHeight
  }, true);

  return { width: targetWidth, height: targetHeight, x: newX, y: newY };
});

ipcMain.handle('island:collapse', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const targetDisplay = getTargetDisplay();
  const screenWidth = targetDisplay.bounds.width;
  currentWidth = customCompactWidth;
  currentHeight = customCompactHeight;
  mainWindow.setBounds({
    x: targetDisplay.bounds.x + Math.round((screenWidth - customCompactWidth) / 2),
    y: targetDisplay.bounds.y + 10,
    width: customCompactWidth,
    height: customCompactHeight
  }, true);
  return true;
});

ipcMain.handle('island:set-always-on-top', (event, flag) => {
  isPinned = !!flag;
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  return isPinned;
});

ipcMain.handle('island:hide', () => {
  if (mainWindow) mainWindow.minimize();
  return true;
});

ipcMain.handle('island:close', () => {
  app.quit();
});

// System Execution Handlers
ipcMain.handle('system:exec-command', (event, command) => {
  return new Promise((resolve) => {
    if (!command || typeof command !== 'string') {
      return resolve({ stdout: '', stderr: 'Empty command', code: 1 });
    }

    exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : (error ? error.message : ''),
        code: error ? (error.code || 1) : 0
      });
    });
  });
});

ipcMain.handle('system:open-url', async (event, url) => {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('system:open-path', async (event, filePath) => {
  try {
    const fullPath = filePath.startsWith('~') ? filePath.replace('~', os.homedir()) : filePath;
    const res = await shell.openPath(fullPath);
    if (res) {
      exec(`xdg-open "${fullPath}"`);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('system:launch-app', (event, appName) => {
  return new Promise((resolve) => {
    const appMap = {
      code: 'code',
      vscode: 'code',
      terminal: 'gnome-terminal',
      console: 'gnome-terminal',
      chrome: 'google-chrome',
      browser: 'google-chrome || firefox',
      firefox: 'firefox',
      files: 'nautilus',
      nautilus: 'nautilus',
      calculator: 'gnome-calculator',
      settings: 'gnome-control-center',
      spotify: 'spotify',
      youtube: 'google-chrome "https://youtube.com" 2>/dev/null || xdg-open "https://youtube.com"',
      discord: 'discord',
      slack: 'slack',
      telegram: 'telegram-desktop'
    };

    const targetCmd = appMap[appName.toLowerCase()] || appName;
    exec(`${targetCmd} &`, (err) => {
      if (err) {
        // Fallback to gtk-launch or gio launch
        exec(`gtk-launch ${appName} 2>/dev/null || gio launch /usr/share/applications/${appName}.desktop 2>/dev/null`);
      }
      resolve({ success: true, launched: targetCmd });
    });
  });
});

ipcMain.handle('system:get-stats', async () => {
  try {
    const [cpuPercent, memory] = await Promise.all([
      getCpuUsageFromProc(),
      getMemoryUsageFromProc()
    ]);

    // Disk usage
    const diskInfo = await new Promise((resolve) => {
      exec('df -h / | tail -n 1', (err, stdout) => {
        if (err || !stdout) return resolve({ used: '0%', avail: '0G' });
        const parts = stdout.trim().split(/\s+/);
        resolve({
          total: parts[1] || '0G',
          used: parts[2] || '0G',
          avail: parts[3] || '0G',
          percent: parts[4] || '0%'
        });
      });
    });

    // Uptime
    const uptime = await new Promise((resolve) => {
      exec('uptime -p', (err, stdout) => {
        resolve(stdout ? stdout.trim() : 'Unknown');
      });
    });

    return {
      cpu: cpuPercent,
      memory: memory.percent,
      memoryTotal: memory.totalGb + ' GB',
      memoryUsed: memory.usedGb + ' GB',
      disk: diskInfo.percent,
      diskAvail: diskInfo.avail,
      uptime: uptime.replace('up ', '')
    };
  } catch (err) {
    return { cpu: 12, memory: 45, disk: '50%', uptime: '1 hour' };
  }
});

ipcMain.handle('system:snip-screen', async () => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const snipPath = path.join(os.tmpdir(), `dio_snip_${timestamp}.png`);

    // Temporarily hide island so it does not block the user's view while cropping
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    // Call ImageMagick 'import' which allows the user to click & drag to crop any rectangular area on screen
    exec(`import "${snipPath}"`, (err) => {
      // Restore dynamic island immediately
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }

      if (err || !fs.existsSync(snipPath)) {
        return resolve({ ok: false, error: 'Snipping cancelled or failed' });
      }

      try {
        const imageBuffer = fs.readFileSync(snipPath);
        const base64Image = imageBuffer.toString('base64');
        resolve({
          ok: true,
          path: snipPath,
          base64: base64Image,
          mimeType: 'image/png'
        });
      } catch (readErr) {
        resolve({ ok: false, error: readErr.message });
      }
    });
  });
});

ipcMain.handle('system:focus-window', async (event, titlePattern) => {
  return new Promise((resolve) => {
    if (!titlePattern) return resolve({ success: false });
    exec(`wmctrl -a "${titlePattern.replace(/"/g, '\\"')}"`, (err) => {
      resolve({ success: !err });
    });
  });
});

ipcMain.handle('system:type-text', async (event, { text, pressEnter } = {}) => {
  return new Promise((resolve) => {
    if (!text) return resolve({ success: false });
    const safeText = JSON.stringify(text);
    const enterCmd = pressEnter ? "pyautogui.press('enter')" : "";
    const pyScript = `import pyautogui, time; time.sleep(0.2); pyautogui.write(${safeText}); ${enterCmd}`;
    exec(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, (err) => {
      resolve({ success: !err });
    });
  });
});

// Zero-latency background desktop context cache
let cachedDesktopContext = { activeWindow: 'Antigravity IDE', openWindows: ['Antigravity IDE'], timestamp: new Date().toLocaleString() };

function updateDesktopContextAsync() {
  exec('xprop -root _NET_ACTIVE_WINDOW 2>/dev/null; wmctrl -l 2>/dev/null', (err, stdout) => {
    if (err || !stdout) return;
    try {
      const lines = stdout.split('\n');
      let activeHex = null;
      const openWindows = [];
      let activeWindow = '';

      for (const line of lines) {
        if (line.includes('_NET_ACTIVE_WINDOW(WINDOW)')) {
          const match = line.match(/0x[0-9a-fA-F]+/);
          if (match) activeHex = parseInt(match[0], 16);
        } else if (line.trim().startsWith('0x')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            const wid = parseInt(parts[0], 16);
            const title = parts.slice(3).join(' ').trim();
            if (title && !title.startsWith('Desktop Icons') && !title.includes('v2rayN')) {
              openWindows.push(title);
              if (activeHex !== null && wid === activeHex) {
                activeWindow = title;
              }
            }
          }
        }
      }

      cachedDesktopContext = {
        activeWindow: activeWindow || cachedDesktopContext.activeWindow || 'Desktop',
        openWindows: openWindows.length > 0 ? openWindows : cachedDesktopContext.openWindows,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    } catch (e) {}
  });
}

// Background poller updates every 2 seconds without blocking any IPC
setInterval(updateDesktopContextAsync, 2000);
updateDesktopContextAsync();

ipcMain.handle('system:get-desktop-context', async () => {
  return cachedDesktopContext;
});

ipcMain.handle('system:web-search', async (event, query) => {
  try {
    if (!query) return { ok: false, error: 'Empty search query' };
    const encoded = encodeURIComponent(query.trim());

    // 1. Wikipedia summary search
    try {
      const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.trim().replace(/\s+/g, '_'))}`;
      const wikiRes = await fetch(wikiUrl);
      if (wikiRes.ok) {
        const data = await wikiRes.json();
        if (data.extract) {
          return {
            ok: true,
            source: 'Wikipedia',
            title: data.title,
            url: data.content_urls && data.content_urls.desktop ? data.content_urls.desktop.page : '',
            summary: data.extract
          };
        }
      }
    } catch (e) {}

    // 2. DuckDuckGo Instant Answer API
    try {
      const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`);
      if (ddgRes.ok) {
        const data = await ddgRes.json();
        if (data.AbstractText) {
          return {
            ok: true,
            source: data.AbstractSource || 'DuckDuckGo',
            url: data.AbstractURL,
            summary: data.AbstractText
          };
        }
      }
    } catch (e) {}

    // 3. DuckDuckGo HTML Search Scrape
    try {
      const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const snippets = [];
        const regex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = regex.exec(html)) !== null && snippets.length < 3) {
          snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
        }
        if (snippets.length > 0) {
          return {
            ok: true,
            source: 'Web Search',
            summary: snippets.join('\n\n')
          };
        }
      }
    } catch (e) {}

    return { ok: false, error: 'No live web answers found' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('system:set-volume', (event, level) => {
  return new Promise((resolve) => {
    const safeLevel = Math.max(0, Math.min(100, parseInt(level, 10)));
    exec(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${(safeLevel / 100).toFixed(2)} && wpctl set-mute @DEFAULT_AUDIO_SINK@ 0 2>/dev/null || amixer -D pulse sset Master ${safeLevel}% 2>/dev/null || amixer sset Master ${safeLevel}%`, (err) => {
      resolve({ success: !err, level: safeLevel });
    });
  });
});

ipcMain.handle('system:get-volume', () => {
  return new Promise((resolve) => {
    exec('wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null || amixer sget Master 2>/dev/null', (err, stdout) => {
      if (err || !stdout) return resolve({ volume: 80, muted: false });
      const wpMatch = stdout.match(/Volume:\s+([0-9.]+)/);
      if (wpMatch) {
        const volPct = Math.round(parseFloat(wpMatch[1]) * 100);
        const isMuted = stdout.includes('[MUTED]');
        return resolve({ volume: volPct, muted: isMuted });
      }
      const match = stdout.match(/\[(\d+)%\]/);
      const isMuted = stdout.includes('[off]');
      const volume = match ? parseInt(match[1], 10) : 80;
      resolve({ volume, muted: isMuted });
    });
  });
});

ipcMain.handle('system:get-audio-sinks', async () => {
  return new Promise((resolve) => {
    exec('wpctl status 2>/dev/null', (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const lines = stdout.split('\n');
      const sinks = [];
      let inSinks = false;
      for (const line of lines) {
        if (line.includes('Sinks:')) {
          inSinks = true;
          continue;
        }
        if (inSinks && (line.includes('Sink endpoints:') || line.includes('Sources:') || (line.includes('├─') && !line.includes('Sinks:')))) {
          inSinks = false;
          break;
        }
        if (inSinks) {
          const match = line.match(/([*]?)\s+(\d+)\.\s+(.*?)\s+\[vol:/);
          if (match) {
            sinks.push({
              isDefault: match[1] === '*',
              id: parseInt(match[2], 10),
              name: match[3].trim()
            });
          }
        }
      }
      resolve(sinks);
    });
  });
});

ipcMain.handle('system:set-audio-sink', async (event, sinkId) => {
  return new Promise((resolve) => {
    exec(`wpctl set-default ${sinkId} && wpctl set-mute ${sinkId} 0`, (err) => {
      resolve({ success: !err, sinkId });
    });
  });
});

// -------------------------------------------------------------
// Comprehensive MPRIS2 Media Query & Control (Spotify, YouTube/Chrome/Firefox/Brave)
// -------------------------------------------------------------
let lastActivePlayerName = 'org.mpris.MediaPlayer2.spotify';
let cachedMediaSignature = null;
let mediaPollTimer = null;

function getActiveMediaInfo() {
  return new Promise((resolve) => {
    exec('gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames 2>/dev/null', (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const matches = stdout.match(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g);
      if (!matches || matches.length === 0) return resolve(null);

      const allPlayers = matches.map(m => m.replace(/'/g, ''));
      const hasSpotifyMain = allPlayers.includes('org.mpris.MediaPlayer2.spotify');

      // Filter out dummy CEF instances (e.g. Spotify's internal chromium child process)
      const players = allPlayers.filter(p => {
        if (hasSpotifyMain && p.startsWith('org.mpris.MediaPlayer2.chromium.instance')) {
          return false;
        }
        return true;
      });

      const promises = players.map(playerName => {
        return new Promise(res => {
          exec(`gdbus call --session --dest ${playerName} --object-path /org/mpris/MediaPlayer2 --method org.freedesktop.DBus.Properties.GetAll org.mpris.MediaPlayer2.Player 2>/dev/null`, { timeout: 800 }, (e, out) => {
            if (e || !out) return res(null);
            
            const statusMatch = out.match(/'PlaybackStatus':\s*<['"]([^'"]+)['"]>/);
            const titleMatch = out.match(/'xesam:title':\s*<['"]([^'"]+)['"]>/);
            const artistMatch = out.match(/'xesam:artist':\s*<\[\s*['"]([^'"]+)['"]/);
            const albumMatch = out.match(/'xesam:album':\s*<['"]([^'"]+)['"]>/);
            const artMatch = out.match(/'mpris:artUrl':\s*<['"]([^'"]+)['"]>/);
            const urlMatch = out.match(/'xesam:url':\s*<['"]([^'"]+)['"]>/);
            const posMatch = out.match(/'Position':\s*<(?:int64|uint64)\s+(\d+)>/);
            const lenMatch = out.match(/'mpris:length':\s*<(?:int64|uint64)\s+(\d+)>/);
            const canNextMatch = out.match(/'CanGoNext':\s*<(true|false)>/);
            const canPrevMatch = out.match(/'CanGoPrevious':\s*<(true|false)>/);
            const canSeekMatch = out.match(/'CanSeek':\s*<(true|false)>/);

            const status = statusMatch ? statusMatch[1] : 'Stopped';
            const title = titleMatch ? titleMatch[1] : '';
            const artist = artistMatch ? artistMatch[1] : '';
            const album = albumMatch ? albumMatch[1] : '';
            const artUrl = artMatch ? artMatch[1] : '';
            const url = urlMatch ? urlMatch[1] : '';
            const positionSec = posMatch ? Math.floor(parseInt(posMatch[1], 10) / 1000000) : 0;
            const lengthSec = lenMatch ? Math.floor(parseInt(lenMatch[1], 10) / 1000000) : 0;

            let playerType = 'media';
            const lowerPlayer = playerName.toLowerCase();
            if (lowerPlayer.includes('spotify')) playerType = 'spotify';
            else if (lowerPlayer.includes('chromium') || lowerPlayer.includes('chrome') || lowerPlayer.includes('firefox') || lowerPlayer.includes('brave') || lowerPlayer.includes('edge')) {
              if (url.includes('youtube.com') || title.includes('YouTube') || artist.includes('YouTube')) {
                playerType = 'youtube';
              } else {
                playerType = 'browser';
              }
            } else if (lowerPlayer.includes('vlc') || lowerPlayer.includes('mpv')) {
              playerType = 'video';
            }

            if (title || status === 'Playing') {
              res({
                playerName,
                playerType,
                status,
                isPlaying: status === 'Playing',
                title: title || 'Audio Playing',
                artist: artist || (playerType === 'youtube' ? 'YouTube' : (playerType === 'spotify' ? 'Spotify' : 'Web Audio')),
                album,
                artUrl,
                url,
                positionSec,
                lengthSec,
                canGoNext: canNextMatch ? canNextMatch[1] === 'true' : true,
                canGoPrev: canPrevMatch ? canPrevMatch[1] === 'true' : true,
                canSeek: canSeekMatch ? canSeekMatch[1] === 'true' : true
              });
            } else {
              res(null);
            }
          });
        });
      });

      Promise.all(promises).then(results => {
        const valid = results.filter(Boolean);
        // Priority 1: Currently Playing player
        const playing = valid.find(r => r.isPlaying);
        if (playing) {
          lastActivePlayerName = playing.playerName;
          return resolve(playing);
        }
        // Priority 2: Spotify if it has title
        const spotify = valid.find(r => r.playerName.includes('spotify') && r.title);
        if (spotify) {
          lastActivePlayerName = spotify.playerName;
          return resolve(spotify);
        }
        // Priority 3: Any player with a title
        if (valid.length > 0) {
          lastActivePlayerName = valid[0].playerName;
          return resolve(valid[0]);
        }
        resolve(null);
      }).catch(() => resolve(null));
    });
  });
}

ipcMain.handle('system:media-control', async (event, arg1, arg2) => {
  let action, playerName, positionSec, offsetSec;
  if (arg1 && typeof arg1 === 'object') {
    action = (arg1.action || '').toLowerCase();
    playerName = arg1.playerName;
    positionSec = arg1.positionSec;
    offsetSec = arg1.offsetSec;
  } else {
    action = (arg1 || '').toLowerCase();
    playerName = arg2;
  }

  // Resolve target player dynamically
  let target = playerName;
  if (!target || !target.startsWith('org.mpris.MediaPlayer2')) {
    const active = await getActiveMediaInfo();
    if (active && active.playerName) {
      target = active.playerName;
    } else {
      const listNames = await new Promise(res => {
        exec('gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames 2>/dev/null', (e, stdout) => {
          if (!e && stdout) {
            const matches = stdout.match(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g);
            if (matches) return res(matches.map(m => m.replace(/'/g, '')));
          }
          res([]);
        });
      });
      target = listNames.find(p => p.includes('spotify')) || 
               listNames.find(p => p.includes('chromium') || p.includes('chrome') || p.includes('firefox')) || 
               listNames[0] || 'org.mpris.MediaPlayer2.spotify';
    }
  }

  const isSpotify = target && target.includes('spotify');

  const execGdbus = (method, extra = '') => {
    return new Promise(res => {
      exec(`gdbus call --session --dest ${target} --object-path /org/mpris/MediaPlayer2 --method org.mpris.MediaPlayer2.Player.${method} ${extra} 2>/dev/null`, (err, stdout) => {
        res({ success: !err, stdout: stdout || '' });
      });
    });
  };

  if (action === 'play') {
    await execGdbus('Play');
  } else if (action === 'pause') {
    await execGdbus('Pause');
  } else if (action === 'toggle' || action === 'playpause') {
    const toggleRes = await execGdbus('PlayPause');
    if (!toggleRes.success) {
      // Fallback: check status and play/pause
      const statRes = await new Promise(r => {
        exec(`gdbus call --session --dest ${target} --object-path /org/mpris/MediaPlayer2 --method org.freedesktop.DBus.Properties.Get org.mpris.MediaPlayer2.Player PlaybackStatus 2>/dev/null`, (err, stdout) => {
          r(!err && stdout && stdout.includes('Playing') ? 'Playing' : 'Paused');
        });
      });
      if (statRes === 'Playing') await execGdbus('Pause');
      else await execGdbus('Play');
    }
  } else if (action === 'stop') {
    // True stop: Stop, Pause, and seek back to 0:00
    await execGdbus('Stop');
    await execGdbus('Pause');
    await execGdbus('Seek', '-- -999999999');
  } else if (action === 'next') {
    if (isSpotify) {
      await execGdbus('Next');
    } else {
      const nextRes = await execGdbus('Next');
      // If Next is not available (e.g. single YouTube non-playlist video), seek +10s forward
      if (!nextRes.success) {
        await execGdbus('Seek', '10000000');
      }
    }
  } else if (action === 'prev' || action === 'previous' || action === 'before' || action === 'befor') {
    if (isSpotify) {
      // Check current position in Spotify
      const pos = await new Promise(r => {
        exec(`gdbus call --session --dest ${target} --object-path /org/mpris/MediaPlayer2 --method org.freedesktop.DBus.Properties.Get org.mpris.MediaPlayer2.Player Position 2>/dev/null`, (err, stdout) => {
          if (!err && stdout) {
            const m = stdout.match(/int64\s+(\d+)/);
            if (m) return r(parseInt(m[1], 10));
          }
          r(0);
        });
      });

      if (pos > 3000000) {
        // Track played > 3s: first Previous rewinds to 0:00, second Previous jumps to the previous track!
        await execGdbus('Previous');
        await new Promise(r => setTimeout(r, 80));
        await execGdbus('Previous');
      } else {
        await execGdbus('Previous');
      }
    } else {
      const prevRes = await execGdbus('Previous');
      // If Previous is not available (e.g. single YouTube non-playlist video), seek -10s backward
      // CRITICAL: Must use '--' before negative number or gdbus treats -10000000 as command line flag!
      if (!prevRes.success) {
        await execGdbus('Seek', '-- -10000000');
      }
    }
  } else if (action === 'seek') {
    if (positionSec !== undefined) {
      const targetMicro = Math.floor(positionSec * 1000000);
      // Rewind to 0 then seek forward to target position
      await execGdbus('Seek', '-- -999999999');
      if (targetMicro > 0) {
        await execGdbus('Seek', `${targetMicro}`);
      }
    } else if (offsetSec !== undefined) {
      const offsetMicro = Math.floor(offsetSec * 1000000);
      await execGdbus('Seek', offsetMicro < 0 ? `-- ${offsetMicro}` : `${offsetMicro}`);
    }
  }

  // Immediately broadcast updated media info to window for instant UI update
  setTimeout(async () => {
    const updatedMedia = await getActiveMediaInfo();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media:change', updatedMedia);
    }
  }, 80);

  return { success: true, action, targetPlayer: target };
});

ipcMain.handle('system:get-media', async () => {
  return await getActiveMediaInfo();
});

// Smart Audio Focus: Auto-pause MPRIS media players during voice recording and Dio speech (no hard audio muting)
let mediaPausedByDio = [];

ipcMain.handle('system:pause-all-media', async () => {
  return new Promise((resolve) => {
    // Query all DBus MPRIS players (Spotify, Chrome, Firefox, VLC, etc.)
    exec('gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames 2>/dev/null', (err, stdout) => {
      let players = [];
      if (!err && stdout) {
        const matches = stdout.match(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g);
        if (matches) players = matches.map(m => m.replace(/'/g, ''));
      }

      const pausePromises = players.map(p => {
        return new Promise((res) => {
          exec(`gdbus call --session --dest ${p} --object-path /org/mpris/MediaPlayer2 --method org.freedesktop.DBus.Properties.Get org.mpris.MediaPlayer2.Player PlaybackStatus 2>/dev/null`, (e, out) => {
            if (!e && out && out.includes('Playing')) {
              if (!mediaPausedByDio.includes(p)) {
                mediaPausedByDio.push(p);
              }
              exec(`gdbus call --session --dest ${p} --object-path /org/mpris/MediaPlayer2 --method org.mpris.MediaPlayer2.Player.Pause 2>/dev/null`, () => {
                res(p);
              });
            } else {
              res(null);
            }
          });
        });
      });

      Promise.all(pausePromises).then(() => {
        resolve({ paused: mediaPausedByDio });
      }).catch(() => {
        resolve({ paused: mediaPausedByDio });
      });
    });
  });
});

ipcMain.handle('system:resume-all-media', async () => {
  return new Promise((resolve) => {
    const playersToResume = [...mediaPausedByDio];
    mediaPausedByDio = [];

    // Resume MPRIS players that were paused by Dio
    const resumePromises = playersToResume.map(p => {
      return new Promise(res => {
        exec(`gdbus call --session --dest ${p} --object-path /org/mpris/MediaPlayer2 --method org.mpris.MediaPlayer2.Player.Play 2>/dev/null`, () => res(p));
      });
    });

    Promise.all(resumePromises).then(() => {
      resolve({ resumed: playersToResume });
    }).catch(() => {
      resolve({ resumed: playersToResume });
    });
  });
});

// -------------------------------------------------------------
// D-Bus Desktop Notifications Interceptor (Intercept all Ubuntu notifications)
// -------------------------------------------------------------
let notificationProcess = null;
let lastNotificationHash = '';
let lastNotificationTime = 0;
let suppressGnomeBanners = true;

function restoreGnomeBanners() {
  exec('gsettings set org.gnome.desktop.notifications show-banners true 2>/dev/null');
}

function setGnomeNotificationSuppression(suppress) {
  suppressGnomeBanners = suppress;
  if (suppress) {
    exec('gsettings set org.gnome.desktop.notifications show-banners false 2>/dev/null');
  } else {
    restoreGnomeBanners();
  }
}

ipcMain.handle('system:set-notify-suppress', (event, suppress) => {
  setGnomeNotificationSuppression(suppress);
  return { success: true, suppressed: suppress };
});

function startNotificationMonitor(targetWindow) {
  if (suppressGnomeBanners) {
    exec('gsettings set org.gnome.desktop.notifications show-banners false 2>/dev/null');
  }

  try {
    notificationProcess = spawn('dbus-monitor', [
      '--session',
      "interface='org.freedesktop.Notifications',member='Notify'",
      "sender='org.gnome.Shell',type='method_return'"
    ]);

    let currentCall = null;
    let stringBuffer = [];

    notificationProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        // Auto-dismiss native GNOME notification popup as soon as assigned an ID
        if (suppressGnomeBanners) {
          const retMatch = line.match(/^\s*uint32\s+(\d+)$/);
          if (retMatch) {
            const notifId = retMatch[1];
            exec(`gdbus call --session --dest org.freedesktop.Notifications --object-path /org/freedesktop/Notifications --method org.freedesktop.Notifications.CloseNotification ${notifId} 2>/dev/null`);
          }
        }

        if (line.includes('member=Notify')) {
          currentCall = { appName: '', icon: '', summary: '', body: '' };
          stringBuffer = [];
        } else if (currentCall) {
          const match = line.match(/^\s*string\s+"(.*)"$/);
          if (match) {
            stringBuffer.push(match[1]);
            if (stringBuffer.length >= 4) {
              currentCall.appName = stringBuffer[0];
              currentCall.icon = stringBuffer[1];
              currentCall.summary = stringBuffer[2];
              currentCall.body = stringBuffer[3];

              const now = Date.now();
              const hash = `${currentCall.appName}:${currentCall.summary}:${currentCall.body}`;
              if (hash !== lastNotificationHash || (now - lastNotificationTime > 1500)) {
                lastNotificationHash = hash;
                lastNotificationTime = now;
                if (targetWindow && !targetWindow.isDestroyed()) {
                  targetWindow.webContents.send('notification:system', {
                    appName: currentCall.appName,
                    icon: currentCall.icon,
                    title: currentCall.summary,
                    desc: currentCall.body
                  });
                }
              }
              currentCall = null;
              stringBuffer = [];
            }
          }
        }
      }
    });

    notificationProcess.on('error', (err) => {
      console.warn('Notification monitor error:', err.message);
    });

    notificationProcess.on('exit', () => {
      notificationProcess = null;
    });
  } catch (err) {
    console.error('Failed to start notification monitor:', err);
  }
}

function startMediaPoller(targetWindow) {
  if (mediaPollTimer) clearInterval(mediaPollTimer);
  const poll = async () => {
    try {
      if (!targetWindow || targetWindow.isDestroyed()) return;
      const media = await getActiveMediaInfo();
      const currentSignature = media 
        ? `${media.playerName}:${media.status}:${media.title}:${media.artist}:${media.artUrl}:${media.isPlaying ? Math.floor((media.positionSec || 0) / 2) : (media.positionSec || 0)}` 
        : 'none';
      if (currentSignature !== cachedMediaSignature) {
        cachedMediaSignature = currentSignature;
        targetWindow.webContents.send('media:change', media);
      }
    } catch (e) {}
  };
  poll();
  mediaPollTimer = setInterval(poll, 1000);
}

// Autostart Management for Ubuntu
const autostartDir = path.join(os.homedir(), '.config', 'autostart');
const autostartFile = path.join(autostartDir, 'ubuntu-dynamic-island.desktop');

ipcMain.handle('autostart:get-status', () => {
  try {
    if (!fs.existsSync(autostartFile)) return false;
    const content = fs.readFileSync(autostartFile, 'utf8');
    return content.includes('X-GNOME-Autostart-enabled=true');
  } catch (err) {
    return false;
  }
});

ipcMain.handle('autostart:set-status', (event, enabled) => {
  try {
    if (!fs.existsSync(autostartDir)) {
      fs.mkdirSync(autostartDir, { recursive: true });
    }
    if (enabled) {
      const launchScript = path.join(__dirname, 'scripts', 'launch.sh');
      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      const desktopEntry = `[Desktop Entry]
Type=Application
Exec=${launchScript}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=2
Name=Ubuntu Dynamic Island
Comment=Apple-Style Dynamic Island with Dio AI Agent
Icon=${fs.existsSync(iconPath) ? iconPath : 'utilities-terminal'}
Categories=Utility;
`;
      fs.writeFileSync(autostartFile, desktopEntry, 'utf8');
      return true;
    } else {
      if (fs.existsSync(autostartFile)) {
        fs.unlinkSync(autostartFile);
      }
      return false;
    }
  } catch (err) {
    console.error('Error toggling autostart:', err);
    return false;
  }
});

// AI Proxies (OpenRouter, Gemini, Notion)
ipcMain.handle('ai:openrouter', async (event, { apiKey, model, messages, tools, temperature }) => {
  try {
    const body = {
      model: model || 'openai/gpt-4o-mini',
      messages,
      temperature: temperature !== undefined ? temperature : 0.7
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/ubuntu-dynamic-island',
        'X-Title': 'Ubuntu Dynamic Island Dio'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ai:avalai', async (event, { apiKey, model, messages, tools, temperature, max_tokens } = {}) => {
  try {
    const body = {
      model: model || 'gpt-4o-mini',
      messages,
      temperature: temperature !== undefined ? temperature : 0.35
    };
    if (max_tokens) {
      body.max_tokens = max_tokens;
    }
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch('https://api.avalai.ir/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ai:transcribe-audio', async (event, { audioBase64, mimeType, apiKey, model, language, prompt } = {}) => {
  try {
    const key = apiKey || process.env.AVALAI_API_KEY || '';
    const targetModel = model || 'whisper-1';
    
    if (!audioBase64) {
      return { ok: false, error: 'No audio data provided' };
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const type = mimeType || 'audio/webm';
    const extension = type.includes('wav') ? 'wav' : (type.includes('mp4') || type.includes('m4a') ? 'm4a' : 'webm');
    const filename = `recording.${extension}`;

    const form = new FormData();
    const blob = new Blob([buffer], { type });
    form.append('file', blob, filename);
    form.append('model', targetModel);
    if (language) {
      form.append('language', language);
    }
    if (prompt) {
      form.append('prompt', prompt);
    }

    const res = await fetch('https://api.avalai.ir/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`
      },
      body: form
    });

    const data = await res.json();
    return { ok: res.ok, status: res.status, text: (data && data.text) ? data.text.trim() : '', data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ai:text-to-speech', async (event, { text, voice, apiKey, model } = {}) => {
  try {
    const key = apiKey || process.env.AVALAI_API_KEY || '';
    const targetModel = model || 'tts-1';
    const targetVoice = voice || 'nova';

    if (!text || !text.trim()) {
      return { ok: false, error: 'No text provided' };
    }

    const res = await fetch('https://api.avalai.ir/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: targetModel,
        input: text.slice(0, 1000),
        voice: targetVoice
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return { ok: true, audioBase64: base64, mimeType: 'audio/mp3' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Active assistant speech process tracker for instant barge-in interruption
let activeSpeechProc = null;

ipcMain.handle('system:stop-speaking', () => {
  if (activeSpeechProc) {
    try { activeSpeechProc.kill('SIGTERM'); } catch (e) {}
    activeSpeechProc = null;
  }
  exec("pkill -9 -f 'ffplay.*dio_voice' 2>/dev/null; spd-say --cancel 2>/dev/null", () => {});
  return true;
});

// Expose environment keys to renderer
ipcMain.handle('env:get-keys', () => ({
  avalaiKey: process.env.AVALAI_API_KEY || ''
}));

// System Audio Playback for Dio Assistant Speech (directly outputs to HDMI/PipeWire)
ipcMain.handle('system:speak-text', async (event, { text, voice, apiKey, model } = {}) => {
  return new Promise(async (resolve) => {
    const key = apiKey || process.env.AVALAI_API_KEY || '';
    const targetModel = model || 'tts-1';
    const targetVoice = voice || 'nova';

    // Cancel any previous speech immediately
    if (activeSpeechProc) {
      try { activeSpeechProc.kill('SIGTERM'); } catch (e) {}
      activeSpeechProc = null;
    }
    exec("pkill -9 -f 'ffplay.*dio_voice' 2>/dev/null", () => {});

    // Ensure HDMI / master sink is always unmuted
    exec('wpctl set-mute @DEFAULT_AUDIO_SINK@ 0 2>/dev/null && wpctl set-volume @DEFAULT_AUDIO_SINK@ 0.90 2>/dev/null');

    if (!text || !text.trim() || !key) {
      return resolve({ ok: false, error: 'Empty text or missing API key' });
    }

    const clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/[*#_~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // First-sentence punchy speech synthesis for instant playback (<2.0s generation)
    const sentences = clean.split(/(?<=[.?!])\s+/).filter(s => s && s.trim());
    let shortText = sentences[0] || clean;
    if (shortText.length < 45 && sentences.length > 1) {
      shortText = `${sentences[0]} ${sentences[1]}`;
    }
    if (shortText.length > 115) {
      shortText = shortText.slice(0, 110).replace(/[,\s]+[^,\s]*$/, '') + '.';
    }
    shortText = shortText.trim();

    // Aval AI High-Fidelity Nova Speech (natural human voice)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.avalai.ir/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          input: shortText,
          voice: targetVoice
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const tmpFile = path.join(os.tmpdir(), `dio_voice_${Date.now()}.mp3`);
        fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));

        activeSpeechProc = exec(`ffplay -nodisp -autoexit "${tmpFile}" 2>/dev/null`, () => {
          activeSpeechProc = null;
          try { fs.unlinkSync(tmpFile); } catch (e) {}
          resolve({ ok: true, engine: 'avalai' });
        });
        return;
      } else {
        const errText = await res.text();
        console.warn('[AvalAI TTS] Speech API error:', errText);
      }
    } catch (e) {
      console.warn('[AvalAI TTS] Speech fetch error:', e.message);
    }

    // Gracefully fallback to browser natural voice (never robotic spd-say)
    resolve({ ok: false, error: 'Falling back to browser natural voice' });
  });
});

ipcMain.handle('ai:gemini', async (event, { apiKey, model, contents, systemInstruction, tools }) => {
  try {
    const targetModel = model || 'gemini-3.8-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    
    const body = { contents };
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }
    if (tools) {
      body.tools = tools;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ai:custom', async (event, { endpoint, apiKey, model, messages, max_tokens, temperature } = {}) => {
  try {
    let targetEndpoint = (endpoint || 'http://127.0.0.1:11434/v1/chat/completions').trim();
    if (targetEndpoint.includes('//localhost:')) {
      targetEndpoint = targetEndpoint.replace('//localhost:', '//127.0.0.1:');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    let requestedModel = model || 'llama3.2:3b';
    const body = {
      model: requestedModel,
      messages,
      temperature: temperature !== undefined ? temperature : 0.35
    };
    if (max_tokens) {
      body.max_tokens = max_tokens;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    let res = await fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    let data = await res.json();

    // If requested model was not found (404), seamlessly retry with llama3.2:3b or gemma2:2b
    if (!res.ok && res.status === 404 && requestedModel !== 'llama3.2:3b') {
      console.warn(`[ai:custom] Model '${requestedModel}' not found (404), auto-retrying with llama3.2:3b...`);
      body.model = 'llama3.2:3b';
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 18000);
      try {
        const retryRes = await fetch(targetEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: retryController.signal
        });
        clearTimeout(retryTimeout);
        if (retryRes.ok) {
          res = retryRes;
          data = await retryRes.json();
        }
      } catch (retryErr) {
        clearTimeout(retryTimeout);
      }
    }

    const errorMsg = !res.ok ? ((data && data.error && (data.error.message || data.error)) || `HTTP ${res.status}`) : undefined;
    return { ok: res.ok, status: res.status, data, error: errorMsg };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('notion:api', async (event, { endpoint, method, body, token }) => {
  try {
    const url = `https://api.notion.com/v1/${endpoint.replace(/^\//, '')}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    };

    const options = {
      method: method || 'GET',
      headers
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (permission === 'media') return true;
      return true;
    });
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') return callback(true);
      callback(true);
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function cleanupOnExit() {
  if (mediaPollTimer) {
    clearInterval(mediaPollTimer);
    mediaPollTimer = null;
  }
  if (notificationProcess) {
    try { notificationProcess.kill(); } catch (e) {}
    notificationProcess = null;
  }
}

app.on('before-quit', cleanupOnExit);

app.on('will-quit', () => {
  cleanupOnExit();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  cleanupOnExit();
  if (process.platform !== 'darwin') app.quit();
});

process.on('SIGINT', () => {
  cleanupOnExit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupOnExit();
  process.exit(0);
});
