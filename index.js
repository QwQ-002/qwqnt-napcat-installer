const { app, dialog, BrowserWindow } = require('electron');
const { resolve, basename } = require('path');
const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');

/** @type {Electron.BrowserWindow} */
let progressBar;

const updateFramework = async path => {
    progressTitle('NapCat 更新中')
    progressContent('准备更新...');
    progressSet(-1);
    const entries = await fs.promises.readdir(path, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = resolve(path, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'config') continue;
            await fs.promises.rm(fullPath, { recursive: true, force: true });
        } else
            await fs.promises.unlink(fullPath);
    }
};

const getLatestFrameworkUrl = () => new Promise((resolve, reject) => {
    progressContent('正在查找最新版下载链接...');
    https.get({
        hostname: 'api.github.com',
        path: `/repos/NapNeko/NapCatQQ/releases/latest`,
        headers: {
            'User-Agent': 'Electron-App',
            'Accept': 'application/vnd.github.v3+json'
        },
    }, res => {
        let release = '';
        res.on('data', chunk => release += chunk);
        res.on('end', () => {
            release = JSON.parse(release);
            release = release.assets.find(it => it.name === 'NapCat.Framework.zip');
            resolve(release.browser_download_url);
        });
    }).on('error', reject);
});

const downloadFramework = (url, dest) => new Promise((resolve, reject) => {
    progressContent('正在下载压缩包...');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    const file = fs.createWriteStream(dest);
    const onResponse = res => {
        const total = parseInt(res.headers['content-length'], 10);
        let downloaded = 0;
        res.on('data', chunk => {
            downloaded += chunk.length;
            progressSet(downloaded / total);
            file.write(chunk);
        });
        res.on('end', () => {
            file.end();
            progressSet(1);
            resolve();
        });
        res.on('error', reject);
    };

    const options = { headers: { 'User-Agent': 'Electron-App', }, };
    https.get(url, options, res => (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        ? https.get(res.headers.location, options, onResponse).on('error', err => reject(err))
        : onResponse(res))
        .on('error', err => reject(err));
});

const unzipFramework = (from, to) => new Promise((resolve, reject) => {
    progressContent('开始解压...');
    progressSet(-1);
    const stat = fs.statSync(from);
    const total = stat.size;
    const file = fs.createReadStream(from);
    let processed = 0;
    file.on('data', chunk => {
        processed += chunk.length;
        progressSet(processed / total);
    });
    file.pipe(unzipper.Extract({ path: to }))
        .on('close', async () => {
            progressSet(1);
            await fs.promises.unlink(from);
            resolve();
        })
        .on('error', reject);
});

const patchFramework = async path => {
    progressContent('正在修补...');
    progressSet(-1);

    const packageJsonPath = resolve(path, 'package.json');
    const basePkg = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const patchPkg = await fs.promises.readFile(resolve(__dirname, 'patch', 'package.json'), 'utf-8');
    const mergedPkg = { ...JSON.parse(basePkg), ...JSON.parse(patchPkg) };
    await fs.promises.writeFile(packageJsonPath, JSON.stringify(mergedPkg, null, 2));
    progressSet(1 / 2);

    const rendererJsPath = resolve(path, 'renderer.js');
    const baseRenderer = await fs.promises.readFile(rendererJsPath, 'utf-8');
    const patchRenderer = await fs.promises.readFile(resolve(__dirname, 'patch', 'renderer.js'), 'utf-8');
    const mergedRenderer = baseRenderer + patchRenderer;
    await fs.promises.writeFile(rendererJsPath, mergedRenderer);
    progressSet(2 / 2);
};

const disableSelf = async () => {
    progressContent('收尾工作...');
    progressSet(-1);

    await fs.promises.rename(
        __dirname,
        resolve(__dirname, '..', '.' + basename(__dirname))
    );
};

app.whenReady().then(async () => {
    progressBar = new BrowserWindow({
        alwaysOnTop: true,
        frame: false,
        closable: false,
        width: 400,
        height: 140,
        title: 'NapCat',
    });
    progressBar.loadFile(resolve(__dirname, 'progress.html'));
    progressSet(-1);

    try {
        const frameworkZipPath = resolve(__dirname, 'temp.zip');
        const frameworkPath = resolve(qwqnt.framework.paths.plugins, 'napcat');
        if (fs.existsSync(frameworkPath)) await updateFramework(frameworkPath);
        const frameworkUrl = await getLatestFrameworkUrl();
        await downloadFramework(frameworkUrl, frameworkZipPath);
        await unzipFramework(frameworkZipPath, frameworkPath);
        await patchFramework(frameworkPath);
        await disableSelf();

        progressTitle('NapCat 已完成安装 🎉');
        progressContent('现在重启应用就可以使用 NapCat 了哦 ~');
        progressSet(1);
    } catch (e) {
        progressTitle('NapCat 安装失败 ⚠️');
        progressContent('Oops! 安装好像出问题了！');
        progressSet(1);
        dialog.showErrorBox('NapCat 安装器', String(e.stack || e));
    }
});

function progressTitle(content) {
    progressBar.webContents
        .executeJavaScript(`title.innerHTML = String.raw\`${content}\``);
}

function progressContent(content) {
    progressBar.webContents
        .executeJavaScript(`content.innerHTML = String.raw\`${content}\``);
}

function progressSet(/* 0 ~ 1 */ value) {
    progressBar.webContents.executeJavaScript(value == -1
        ? `progress.removeAttribute('value')`
        : `progress.value = ${value * 100}`);
    if (value === -1) progressBar.setProgressBar(.5, { mode: 'indeterminate' });
    else progressBar.setProgressBar(value);
}
