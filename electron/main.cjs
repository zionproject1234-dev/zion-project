const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const loudness = require('loudness');
const si = require('systeminformation');

let mainWindow;

function createWindow() {
    const isDev = !app.isPackaged;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../public/favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
    });

    mainWindow.loadURL(
        isDev
            ? 'http://localhost:5173'
            : `file://${path.join(__dirname, '../dist/index.html')}`
    );
}

app.on('ready', () => {
    createWindow();

    ipcMain.handle('get-volume', async () => {
        try {
            return await loudness.getVolume();
        } catch (e) {
            return 50;
        }
    });

    ipcMain.handle('set-volume', async (event, level) => {
        try {
            await loudness.setVolume(level);
        } catch (e) {
            exec(`powershell -Command "$obj = New-Object -ComObject Shell.Application; for($i=0; $i<50; $i++) { $obj.SystemVolumeDown() }; for($i=0; $i<${Math.floor(level / 2)}; $i++) { $obj.SystemVolumeUp() }"`);
        }
        return true;
    });

    ipcMain.handle('set-brightness', async (event, level) => {
        const command = `powershell "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${level})"`;
        exec(command, (error) => {
            if (error) console.error(`Brightness Error: ${error}`);
        });
        return true;
    });

    ipcMain.handle('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.handle('window-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) mainWindow.unmaximize();
            else mainWindow.maximize();
        }
    });

    ipcMain.handle('window-close', () => {
        if (mainWindow) mainWindow.close();
    });

    ipcMain.handle('get-metrics', async () => {
        try {
            const cpuLoad = await si.currentLoad();
            const mem = await si.mem();
            const temp = await si.cpuTemperature();
            return {
                cpu: Math.round(cpuLoad.currentLoad),
                ram: Math.round((mem.active / mem.total) * 100),
                temp: temp.main || 45
            };
        } catch (e) {
            return { cpu: 0, ram: 0, temp: 45 };
        }
    });

    ipcMain.handle('launch-app', async (event, appName) => {
        const apps = {
            'chrome': 'start chrome',
            'notepad': 'notepad',
            'calc': 'calc',
            'code': 'code',
            'powershell': 'start powershell'
        };
        const cmd = apps[appName.toLowerCase()] || `start ${appName}`;
        exec(cmd, (err) => {
            if (err) console.error(`Launch Error: ${err}`);
        });
        return true;
    });

    ipcMain.handle('scan-directory', async (event, folderPath) => {
        return new Promise((resolve) => {
            const cmd = `dir "${folderPath}" /b /s`;
            exec(cmd, (err, stdout) => {
                if (err) resolve([]);
                const files = stdout ? stdout.split('\n').filter(f => f.trim()).slice(0, 50) : [];
                resolve(files);
            });
        });
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
