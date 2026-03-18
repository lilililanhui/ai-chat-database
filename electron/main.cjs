const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AI 知识库助手',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
  });

  // 开发模式连接 Vite 开发服务器
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载构建产物
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 在默认浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  if (isDev) {
    // 开发模式下由 npm run dev:server 启动
    return;
  }

  // 生产模式启动服务器
  const serverPath = path.join(__dirname, '..', 'server', 'index.ts');
  serverProcess = spawn('npx', ['tsx', serverPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3000' },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server] ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data}`);
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
