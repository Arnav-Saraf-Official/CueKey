const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')

const PORT = 38472
const isDev = !app.isPackaged

let mainWindow = null

function createWindow(loadURL) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Sightread',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f1014',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(loadURL)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function startServer(rootDir) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.otf': 'font/otf',
    '.mid': 'audio/midi',
    '.midi': 'audio/midi',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.js.map': 'application/json',
  }

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]
    // SPA fallback: serve index.html for any path that doesn't match a file
    const filePath = path.join(rootDir, urlPath)

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase()
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
      fs.createReadStream(filePath).pipe(res)
    } else {
      // SPA fallback
      const indexPath = path.join(rootDir, 'index.html')
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        fs.createReadStream(indexPath).pipe(res)
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Sightread server running at http://127.0.0.1:${PORT}`)
  })

  return server
}

app.whenReady().then(() => {
  if (isDev) {
    // Dev mode: load from Vite dev server
    const devURL = `http://localhost:5173`
    createWindow(devURL)
  } else {
    // Production: serve build files from local HTTP server
    const buildDir = path.join(__dirname, '..', 'build', 'client')
    startServer(buildDir)
    createWindow(`http://127.0.0.1:${PORT}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isDev) {
        createWindow('http://localhost:5173')
      } else {
        createWindow(`http://127.0.0.1:${PORT}`)
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
