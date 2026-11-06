import './style.css'

type DownloadMode = 'video' | 'audio'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Não foi possível iniciar a aplicação.')
}

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="yt-dlp comando, início">
      <span class="brand-mark" aria-hidden="true">y.</span>
      <span>yt-dlp <strong>comando</strong></span>
    </a>
    <a class="top-link" href="https://github.com/yt-dlp/yt-dlp#installation" target="_blank" rel="noreferrer">
      Instalar yt-dlp <span aria-hidden="true">↗</span>
    </a>
  </header>

  <main>
    <section class="intro" aria-labelledby="page-title">
      <div class="eyebrow"><span class="eyebrow-dot"></span> FEITO PARA LINUX MINT</div>
      <h1 id="page-title">Seu terminal.<br /><span>Seu download.</span></h1>
      <p class="intro-copy">
        Cole um link do YouTube, escolha suas opções e receba um comando pronto para usar no terminal.
      </p>
    </section>

    <section class="workspace" aria-label="Gerador de comando">
      <div class="form-panel">
        <div class="panel-heading">
          <span class="step-number">01</span>
          <div>
            <h2>Configure seu comando</h2>
            <p>Preencha os campos para personalizar o download.</p>
          </div>
        </div>

        <form id="command-form">
          <label class="field-label" for="video-url">Link do YouTube</label>
          <div class="input-wrap url-wrap">
            <span class="url-icon" aria-hidden="true">↗</span>
            <input id="video-url" name="video-url" type="url" inputmode="url"
              placeholder="https://www.youtube.com/watch?v=..." autocomplete="url" spellcheck="false" />
            <button class="clear-button" id="clear-url" type="button" aria-label="Limpar link" hidden>×</button>
          </div>
          <p class="field-hint" id="url-hint">Aceita links de vídeos, Shorts e youtu.be.</p>
          <p class="field-error" id="url-error" role="alert" hidden></p>

          <div class="field-label mode-label" id="mode-label">O que você quer baixar?</div>
          <div class="mode-switch" role="group" aria-labelledby="mode-label">
            <button class="mode-option active" type="button" data-mode="video" aria-pressed="true">
              <span class="mode-icon" aria-hidden="true">▣</span>
              <span><strong>Vídeo</strong><small>Imagem e som</small></span>
            </button>
            <button class="mode-option" type="button" data-mode="audio" aria-pressed="false">
              <span class="mode-icon audio-icon" aria-hidden="true">♫</span>
              <span><strong>Áudio</strong><small>Som apenas</small></span>
            </button>
          </div>

          <div class="options-grid" id="video-options">
            <div class="select-field">
              <label class="field-label" for="resolution">Resolução máxima</label>
              <div class="select-wrap">
                <select id="resolution" name="resolution">
                  <option value="best">Melhor disponível</option>
                  <option value="2160">4K · 2160p</option>
                  <option value="1440">1440p</option>
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                </select>
                <span aria-hidden="true">⌄</span>
              </div>
            </div>
            <div class="select-field">
              <label class="field-label" for="video-format">Formato do vídeo</label>
              <div class="select-wrap">
                <select id="video-format" name="video-format">
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                </select>
                <span aria-hidden="true">⌄</span>
              </div>
            </div>
          </div>

          <div class="options-grid audio-options" id="audio-options" hidden>
            <div class="select-field">
              <label class="field-label" for="audio-format">Formato do áudio</label>
              <div class="select-wrap">
                <select id="audio-format" name="audio-format">
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="opus">Opus</option>
                  <option value="wav">WAV</option>
                </select>
                <span aria-hidden="true">⌄</span>
              </div>
            </div>
            <p class="audio-note">A conversão de áudio requer o FFmpeg instalado.</p>
          </div>

          <div class="select-field destination-field">
            <label class="field-label" for="destination">Salvar em</label>
            <div class="select-wrap destination-wrap">
              <select id="destination" name="destination">
                <option value="$HOME/Músicas">$HOME/Músicas</option>
                <option value="$HOME/Downloads">$HOME/Downloads</option>
                <option value="custom">Outra pasta…</option>
              </select>
              <span aria-hidden="true">⌄</span>
            </div>
            <input class="custom-path" id="custom-path" type="text" placeholder="/caminho/para/a/pasta"
              aria-label="Caminho personalizado para salvar" hidden />
            <p class="field-hint">A pasta precisa existir antes de executar o comando.</p>
          </div>

          <label class="checkbox-row">
            <input id="include-playlist" type="checkbox" />
            <span class="checkbox-custom" aria-hidden="true"></span>
            <span><strong>Baixar a playlist completa</strong><small>Por padrão, baixa apenas o vídeo do link.</small></span>
          </label>
        </form>
      </div>

      <aside class="result-panel" aria-labelledby="result-title">
        <div class="result-topline">
          <div class="panel-heading result-heading">
            <span class="step-number">02</span>
            <div>
              <h2 id="result-title">Comando gerado</h2>
              <p>Copie e cole no terminal do Linux Mint.</p>
            </div>
          </div>
          <span class="terminal-pill"><span></span> BASH</span>
        </div>

        <div class="command-box">
          <div class="command-dots" aria-hidden="true"><i></i><i></i><i></i></div>
          <pre><code id="command-output"># Seu comando aparecerá aqui
# depois que você colar um link do YouTube.</code></pre>
        </div>
        <p class="command-error" id="command-error" role="status" hidden></p>
        <button class="copy-button" id="copy-command" type="button" disabled>
          <span aria-hidden="true">▣</span> <span id="copy-label">Copiar comando</span>
          <span class="copy-shortcut">CTRL + C</span>
        </button>
        <div class="result-footnote">
          <span class="info-icon" aria-hidden="true">i</span>
          <p>Este site apenas monta o comando. O download acontece no seu computador, pelo <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noreferrer">yt-dlp</a>.</p>
        </div>
      </aside>
    </section>

    <section class="notice" aria-label="Aviso">
      <span class="notice-icon" aria-hidden="true">↗</span>
      <p><strong>Use com responsabilidade.</strong> Baixe apenas conteúdos que você criou, que estejam em domínio público ou para os quais tenha autorização. Respeite os direitos autorais e os termos da plataforma.</p>
    </section>
  </main>

  <footer>
    <span>yt-dlp comando <span class="footer-separator">·</span> Feito para Linux Mint</span>
    <a href="https://github.com/yt-dlp/yt-dlp#usage-and-options" target="_blank" rel="noreferrer">Documentação do yt-dlp <span aria-hidden="true">↗</span></a>
  </footer>
`

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Elemento obrigatório não encontrado: ${selector}`)
  return element
}

const urlInput = getElement<HTMLInputElement>('#video-url')
const clearButton = getElement<HTMLButtonElement>('#clear-url')
const urlHint = getElement<HTMLParagraphElement>('#url-hint')
const urlError = getElement<HTMLParagraphElement>('#url-error')
const commandOutput = getElement<HTMLElement>('#command-output')
const commandError = getElement<HTMLParagraphElement>('#command-error')
const copyButton = getElement<HTMLButtonElement>('#copy-command')
const copyLabel = getElement<HTMLSpanElement>('#copy-label')
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('.mode-option')]
const videoOptions = getElement<HTMLDivElement>('#video-options')
const audioOptions = getElement<HTMLDivElement>('#audio-options')
const resolutionSelect = getElement<HTMLSelectElement>('#resolution')
const videoFormatSelect = getElement<HTMLSelectElement>('#video-format')
const audioFormatSelect = getElement<HTMLSelectElement>('#audio-format')
const destinationSelect = getElement<HTMLSelectElement>('#destination')
const customPathInput = getElement<HTMLInputElement>('#custom-path')
const playlistCheckbox = getElement<HTMLInputElement>('#include-playlist')

let mode: DownloadMode = 'video'

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function quoteDestination(path: string): string {
  if (path === '$HOME') return '"$HOME"'
  if (path.startsWith('$HOME/')) {
    const suffix = path.slice('$HOME/'.length).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')
    return `"$HOME/${suffix}"`
  }
  return shellQuote(path)
}

function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const isYoutubeHost = host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com'
    const isShortHost = host === 'youtu.be'
    if (!isYoutubeHost && !isShortHost) return false

    if (isShortHost) return url.pathname.split('/').filter(Boolean).length === 1
    return url.pathname === '/watch' ? url.searchParams.has('v') :
      /^\/(shorts|embed|live)\/[^/]+/.test(url.pathname)
  } catch {
    return false
  }
}

function getDestination(): string {
  if (destinationSelect.value === 'custom') return customPathInput.value.trim()
  return destinationSelect.value
}

function buildCommand(url: string): string {
  const destination = getDestination()
  const playlist = playlistCheckbox.checked ? '' : ' --no-playlist'
  const savePath = `-P ${quoteDestination(destination)}`

  if (mode === 'audio') {
    return `yt-dlp -x --audio-format ${audioFormatSelect.value}${playlist} ${savePath} ${shellQuote(url)}`
  }

  const resolution = resolutionSelect.value
  const format = resolution === 'best'
    ? 'bv*+ba/b'
    : `bv*[height<=${resolution}]+ba/b[height<=${resolution}]`
  return `yt-dlp -f ${shellQuote(format)} --merge-output-format ${videoFormatSelect.value}${playlist} ${savePath} ${shellQuote(url)}`
}

function render(): void {
  const url = urlInput.value.trim()
  clearButton.hidden = url.length === 0
  urlError.hidden = true
  urlHint.hidden = false
  commandError.hidden = true

  const destination = getDestination()
  if (destinationSelect.value === 'custom' && !destination) {
    commandOutput.textContent = '# Informe uma pasta para salvar o arquivo.'
    copyButton.disabled = true
    return
  }

  if (!url) {
    commandOutput.textContent = '# Seu comando aparecerá aqui\n# depois que você colar um link do YouTube.'
    copyButton.disabled = true
    return
  }

  if (!isYouTubeUrl(url)) {
    commandOutput.textContent = '# Cole um link válido de vídeo do YouTube.'
    urlHint.hidden = true
    urlError.textContent = 'Confira o link. Use um endereço youtube.com ou youtu.be de vídeo.'
    urlError.hidden = false
    copyButton.disabled = true
    return
  }

  commandOutput.textContent = buildCommand(url)
  copyButton.disabled = false
}

urlInput.addEventListener('input', render)
urlInput.addEventListener('paste', () => requestAnimationFrame(render))
clearButton.addEventListener('click', () => {
  urlInput.value = ''
  urlInput.focus()
  render()
})

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode === 'audio' ? 'audio' : 'video'
    modeButtons.forEach((option) => {
      const selected = option === button
      option.classList.toggle('active', selected)
      option.setAttribute('aria-pressed', String(selected))
    })
    videoOptions.hidden = mode !== 'video'
    audioOptions.hidden = mode !== 'audio'
    render()
  })
})

resolutionSelect.addEventListener('change', render)
videoFormatSelect.addEventListener('change', render)
audioFormatSelect.addEventListener('change', render)
playlistCheckbox.addEventListener('change', render)
destinationSelect.addEventListener('change', () => {
  const useCustomPath = destinationSelect.value === 'custom'
  customPathInput.hidden = !useCustomPath
  if (useCustomPath) customPathInput.focus()
  render()
})
customPathInput.addEventListener('input', render)

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(commandOutput.textContent ?? '')
    copyLabel.textContent = 'Comando copiado!'
    copyButton.classList.add('copied')
    window.setTimeout(() => {
      copyLabel.textContent = 'Copiar comando'
      copyButton.classList.remove('copied')
    }, 1800)
  } catch (error) {
    commandError.textContent = 'Não foi possível copiar automaticamente. Selecione o comando e copie manualmente.'
    commandError.hidden = false
    console.error('Falha ao copiar o comando:', error)
  }
})
