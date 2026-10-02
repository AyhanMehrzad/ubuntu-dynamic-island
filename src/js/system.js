// System Monitoring & Device Control Engine
class SystemManager {
  constructor() {
    this.stats = {
      cpu: 10,
      memory: 42,
      disk: '48%',
      volume: 80,
      uptime: '1 hour'
    };
    this.listeners = [];
    this.pollInterval = null;
  }

  init() {
    this.pollStats();
    this.pollInterval = setInterval(() => this.pollStats(), 3000);
    this.initClock();
  }

  initClock() {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const timeElem = document.getElementById('compact-time');
      if (timeElem) timeElem.textContent = `${hours}:${mins}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  async pollStats() {
    try {
      if (window.electronAPI && window.electronAPI.getSystemStats) {
        const stats = await window.electronAPI.getSystemStats();
        const vol = await window.electronAPI.getVolume();
        this.stats = { ...stats, volume: vol.volume, muted: vol.muted };
      } else {
        // Mock fallback for browser preview
        this.stats.cpu = Math.round(12 + Math.random() * 22);
        this.stats.memory = Math.round(44 + Math.random() * 4);
        this.stats.disk = '45%';
        this.stats.volume = 80;
        this.stats.uptime = '3 hours';
      }
      this.updateUI();
    } catch (e) {
      console.warn('System poll error:', e);
    }
  }

  updateUI() {
    // Compact pill stats
    const cpuEl = document.getElementById('metric-cpu');
    const ramEl = document.getElementById('metric-ram');
    if (cpuEl) cpuEl.textContent = `CPU ${this.stats.cpu}%`;
    if (ramEl) ramEl.textContent = `RAM ${this.stats.memory}%`;

    // Dashboard Tab stats
    const dashCpuVal = document.getElementById('dash-cpu-val');
    const dashCpuBar = document.getElementById('dash-cpu-bar');
    if (dashCpuVal) dashCpuVal.textContent = `${this.stats.cpu}%`;
    if (dashCpuBar) dashCpuBar.style.width = `${this.stats.cpu}%`;

    const dashRamVal = document.getElementById('dash-ram-val');
    const dashRamBar = document.getElementById('dash-ram-bar');
    if (dashRamVal) dashRamVal.textContent = `${this.stats.memory}%`;
    if (dashRamBar) dashRamBar.style.width = `${this.stats.memory}%`;

    const dashDiskVal = document.getElementById('dash-disk-val');
    const dashDiskBar = document.getElementById('dash-disk-bar');
    if (dashDiskVal) dashDiskVal.textContent = this.stats.disk;
    if (dashDiskBar) dashDiskBar.style.width = this.stats.disk;

    const dashVolVal = document.getElementById('dash-vol-val');
    const dashVolBar = document.getElementById('dash-vol-bar');
    if (dashVolVal) dashVolVal.textContent = `${this.stats.volume}%`;
    if (dashVolBar) dashVolBar.style.width = `${this.stats.volume}%`;
  }

  async executeCommand(command) {
    if (window.electronAPI && window.electronAPI.executeCommand) {
      return await window.electronAPI.executeCommand(command);
    }
    // Simulation for browser mode
    return {
      stdout: `[Simulation: bash -c "${command}"]\nExecution completed with status 0.`,
      stderr: '',
      code: 0
    };
  }

  async launchApp(appName) {
    if (window.electronAPI && window.electronAPI.launchApp) {
      return await window.electronAPI.launchApp(appName);
    }
    return { success: true, simulated: true, app: appName };
  }

  async openUrl(url) {
    if (window.electronAPI && window.electronAPI.openUrl) {
      return await window.electronAPI.openUrl(url);
    }
    window.open(url, '_blank');
    return { success: true };
  }

  async openPath(path) {
    if (window.electronAPI && window.electronAPI.openPath) {
      return await window.electronAPI.openPath(path);
    }
    return { success: true, simulated: true, path };
  }

  async setVolume(level) {
    if (window.electronAPI && window.electronAPI.setVolume) {
      return await window.electronAPI.setVolume(level);
    }
    this.stats.volume = level;
    this.updateUI();
    return { success: true, level };
  }
}

window.systemManager = new SystemManager();
