const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const https = require('https');
const url = require('url');

// Сравнение версий
function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return 1;
    if (p1[i] < p2[i]) return -1;
  }
  return 0;
}

let mainWindow;

const MAX_LAUNCH = 10;

// ИСПРАВЛЕННЫЕ пути
const getBasePath = () => {
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\1cv8\\';
  } else if (process.platform === 'linux') {
    return '/opt/1cv8/x86_64/';
  } else {
    throw new Error('Неподдерживаемая ОС: ' + process.platform);
  }
};

const getLatestPlatform = () => {
  const basePath = getBasePath();
  console.log('🔍 Поиск платформ в:', basePath);

  if (!fs.existsSync(basePath)) {
    console.log('❌ Папка платформ не найдена:', basePath);
    return '';
  }

  try {
    const platforms = fs.readdirSync(basePath)
    .filter(dir => dir.startsWith('8.3.'));
    const sorted = platforms.sort((a, b) => b.localeCompare(a));
    console.log(' Найдены платформы:', sorted);
    return sorted[0] || '';
  } catch (err) {
    console.error('❌ Ошибка чтения платформ:', err.message);
    return '';
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                                 contextIsolation: true,
                                 nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  Menu.setApplicationMenu(null);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function loadConfig(configFile) {
  if (!fs.existsSync(configFile)) {
    throw new Error(`Конфигурация не найдена: ${configFile}`);
  }

  const lines = fs.readFileSync(configFile, 'utf-8').split('\n');
  const databases = [];
  const passwords = {};

  lines.forEach((line, index) => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 5) {
        const [category, name, address, login, pass] = parts;
        const id = index + 1;
        databases.push({ id, category, name, address, login });
        passwords[id] = pass;
      }
    }
  });

  return { databases, passwords };
}

// Автоматически берёт ПОСЛЕДНИЙ конфиг
ipcMain.handle('get-config-info', async () => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, '1c-launcher-app-settings.json');
  const defaultConfigPath = path.join(userDataPath, '1c_bases.conf');

  let settings = { theme: 'dark' };
  let configPath = '';
  let configExists = false;

  // 1. СОХРАНЁННЫЙ
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      configPath = settings.configFile || '';
      configExists = configPath && fs.existsSync(configPath);
      console.log(' Saved:', configPath, 'Exists:', configExists);
    } catch (err) {
      console.error('❌ Settings error:', err.message);
    }
  }

  // 2. FALLBACK
  if (!configPath || !configExists) {
    configPath = defaultConfigPath;
    configExists = fs.existsSync(configPath);
    console.log('🔄 Default:', configPath, 'Exists:', configExists);
  }

  return {
    configPath,
    configExists,
    platform: getLatestPlatform(),
               theme: settings.theme || 'dark'
  };
});

ipcMain.handle('select-config', async () => {
  const result = await dialog.showOpenDialog(mainWindow || {}, {
    title: 'Выберите файл конфигурации баз (1c_bases.conf)',
                                             filters: [{ name: 'Config files', extensions: ['conf', 'txt'] }]
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('load-config', (event, configFile) => loadConfig(configFile));

ipcMain.handle('get-platforms', () => {
  const latest = getLatestPlatform();
  return latest ? [latest] : [];
});

ipcMain.handle('add-base', (event, { configFile, newDb }) => {
  const line = `${newDb.category}|${newDb.name}|${newDb.address}|${newDb.login}|${newDb.password}\n`;
  fs.appendFileSync(configFile, line, 'utf-8');
  return true;
});

//  ИСПРАВЛЕННОЕ сохранение
ipcMain.handle('save-config-path', (event, configPath) => {
  const settingsPath = path.join(app.getPath('userData'), '1c-launcher-app-settings.json');
  const settings = { configFile: configPath };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(' Сохранён:', settingsPath);
  return true;
});

// СОХРАНЕНИЕ ТЕМЫ
ipcMain.handle('save-theme', async (event, theme) => {
  const settingsPath = path.join(app.getPath('userData'), '1c-launcher-app-settings.json');
  let settings = { configFile: '' };

  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }

  settings.theme = theme;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(' Тема сохранена:', theme);
  return true;
});

// ПРОВЕРКА ОБНОВЛЕНИЙ
ipcMain.handle('check-for-updates', async () => {
  const settingsPath = path.join(app.getPath('userData'), '1c-launcher-app-settings.json');
  let settings = {};

  // Загружаем dismissed
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }

  const now = Date.now();
  const lastCheck = settings.lastUpdateCheck || 0;
  const DAY = 24 * 60 * 60 * 1000;

  // Rate-limit: 1 раз/день
  if (now - lastCheck < DAY) {
    const dismissed = settings.dismissedUpdate;
    return { available: false, dismissed };
  }

  settings.lastUpdateCheck = now;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return new Promise((resolve) => {
    const req = https.get('https://github.com/exJabberwocky/1c-launcher-app/latest', {
      headers: { 'User-Agent': '1C-Launcher' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latest = release.tag_name.replace(/^v/, '');
          const current = app.getVersion();

          if (compareVersions(latest, current) > 0) {
            resolve({
              available: true,
              version: latest,
              notes: release.body || 'Новые фичи!',
              url: release.html_url,
              dismissed: settings.dismissedUpdate === latest
            });
          } else {
            resolve({ available: false });
          }
        } catch {
          resolve({ available: false });
        }
      });
    });
    req.on('error', () => resolve({ available: false }));
    req.end();
  });
});

// СОХРАНИТЬ "ПОЗЖЕ"
ipcMain.handle('dismiss-update', async (event, version) => {
  const settingsPath = path.join(app.getPath('userData'), '1c-launcher-app-settings.json');
  let settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
  settings.dismissedUpdate = version;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return true;
});

ipcMain.handle('get-saved-config-path', () => {
  const settingsPath = path.join(app.getPath('userData'), '1c-launcher-app-settings.json');
  console.log('🔍 Ищем:', settingsPath);

  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      console.log(' Найден конфиг:', settings.configFile);
      return { path: settings.configFile || '' };
    } catch (err) {
      console.error('❌ Ошибка чтения:', err);
    }
  }
  return { path: '' };
});

//  Запуск баз
ipcMain.handle('launch-bases', async (event, { configFile, selectedIds, platform }) => {
  const { databases, passwords } = loadConfig(configFile);

  if (selectedIds.length > MAX_LAUNCH) {
    throw new Error(`Максимум ${MAX_LAUNCH} баз`);
  }

  const getExecPath = (platform) => {
    const basePath = getBasePath();
    if (process.platform === 'win32') {
      return path.join(basePath, platform, 'bin', '1cv8c.exe');
    } else {
      return path.join(basePath, platform, '1cv8c');
    }
  };

  const execPath = getExecPath(platform);

  if (!fs.existsSync(execPath)) {
    throw new Error(`1cv8c не найден:\n${execPath}`);
  }

  console.log(' Запуск из:', execPath);

  const errors = [];

  for (const id of selectedIds) {
    const db = databases.find(d => d.id === id);
    if (!db) continue;

    const args = [
      'ENTERPRISE',
      '/WS', db.address,
      '/OIDA-',
      '/N', db.login,
      '/P', passwords[id]
    ];

    try {
      if (process.platform === 'win32') {
        const child = spawn(execPath, args, {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        console.log(` Windows: ${db.name} запущена (PID: ${child.pid})`);
      } else {
        const script = `#!/bin/bash\nnohup "${execPath}" ${args.join(' ')} >/dev/null 2>&1 &`;
        const tmpScript = `/tmp/1c_launch_${Date.now()}_${id}.sh`;
        fs.writeFileSync(tmpScript, script);
        fs.chmodSync(tmpScript, 0o755);
        exec(`bash ${tmpScript}`);
        console.log(` Linux: ${db.name} запущена`);
      }
    } catch (err) {
      errors.push(`${db.name}: ${err.message}`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
});

ipcMain.handle('open-url', async (event, url) => {
  try {
    if (process.platform === 'win32') {
      exec(`start "" "${url}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch (err) {
    throw new Error(`Ошибка браузера: ${err.message}`);
  }
});
