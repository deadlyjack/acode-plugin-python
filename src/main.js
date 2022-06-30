import style from './style.scss';
import tag from 'html-tag-js';

class Python {
  #worker;
  #onInitError;
  #onInitSuccess;
  #onRunSuccess;
  #onRunError;
  #cacheFile;
  #cacheFileUrl;
  #workerInitialized = false;
  #isInput = false;
  name = 'Python';
  baseUrl = '';
  pyodide = null;
  $input = null;
  $page = null;
  $runBtn = null;
  $style = null;
  #codes = [];
  #niddle = 0;
  #inputCount = 0;

  async init($page, cacheFile, cacheFileUrl) {

    this.#cacheFileUrl = cacheFileUrl;

    $page.id = 'acode-plugin-python';
    this.$page = $page;
    this.$page.settitle('Python');

    this.#cacheFile = cacheFile;

    const onhide = $page.onhide;
    $page.onhide = () => {
      if (this.#workerInitialized) {
        this.#worker.terminate();
        this.#workerInitialized = false;
      }
      onhide();
    }

    let main = this.$page.get('.main');

    if (!main) {
      main = tag('div', { className: 'main' });
      this.$page.append(main);
    }

    main.style.padding = '10px';
    main.style.overflow = 'auto';
    main.style.boxSizing = 'border-box';

    this.$runBtn = tag('span', {
      className: 'icon play_arrow',
      attr: {
        action: 'run',
      },
      onclick: this.run.bind(this),
    });

    this.$style = tag('style', {
      textContent: style,
    });

    this.$input = tag('div', {
      className: 'print input',
      child: tag('textarea', {
        onkeydown: this.#onkeydown.bind(this),
        oninput: this.#oninput.bind(this),
      }),
    });

    this.checkRunnable();
    editorManager.on('switch-file', this.checkRunnable.bind(this));
    editorManager.on('rename-file', this.checkRunnable.bind(this));
    document.head.append(this.$style);
  }

  async initWorker() {
    if (this.#worker) this.#worker.terminate();
    this.#worker = new Worker(this.baseUrl + 'worker.js');
    this.#worker.postMessage({
      action: 'init',
      baseUrl: this.baseUrl,
      cacheFileUrl: this.#cacheFileUrl,
    });
    this.#worker.onmessage = this.#workerOnMessage.bind(this);
    await new Promise((resolve, error) => {
      this.#onInitSuccess = resolve;
      this.#onInitError = error;
    });
    this.#workerInitialized = true;
  }

  async run() {
    this.#showPage();
    await this.#cacheFile.writeFile('');
    this.#append(this.$input);

    this.print('Python initializing');
    try {
      await this.initWorker();
    } catch (error) {
      this.print(error, 'error');
      return;
    }

    const code = editorManager.editor.getValue();
    await this.runCode(code);
  }

  async terminal() {
    this.#showPage();
  }

  async runCode(code) {
    this.#worker.postMessage({
      action: 'run',
      code,
    });
    try {
      const res = await new Promise((resolve, error) => {
        this.#onRunSuccess = resolve;
        this.#onRunError = error;
      });
      this.print(res, 'output');
    } catch (error) {
      this.print(error, 'error');
    }
  }

  destroy() {
    if (this.$runBtn) {
      this.$runBtn.onclick = null;
      this.$runBtn.remove();
    }

    if (this.#workerInitialized) this.#worker.terminate();

    editorManager.off('switch-file', this.checkRunnable.bind(this));
    editorManager.off('rename-file', this.checkRunnable.bind(this));
    this.$style.remove();
  }

  checkRunnable() {
    const file = editorManager.activeFile;

    if (this.$runBtn.isConnected) {
      this.$runBtn.remove();
    }

    if (file?.name.endsWith('.py')) {
      const $header = root.get('header');
      $header.get('.icon.play_arrow')?.remove();
      $header.insertBefore(this.$runBtn, $header.lastChild);
    }
  }

  print(res, type) {
    if (!this.$page.isConnected) return;
    const $output = tag('div', {
      className: `print ${type || ''}`,
      textContent: res,
    });
    this.#append($output, this.$input);
  }

  #showPage() {
    const $main = this.$page.get('.main');
    if (!this.$page.isConnected) {
      this.$page.classList.remove('hide');
      this.$page.show();
    }
    $main.innerHTML = '';
  }

  #clearConsole() {
    this.$page.get('.main').innerHTML = '';
    this.#append(this.$input);
  }

  #append(...$el) {
    const $main = this.$page.get('.main');
    if (!$main) this.$page.append(tag('div', { className: 'main' }));
    this.$page.get('.main').append(...$el);
  }

  async #workerOnMessage(e) {
    const {
      action,
      success,
      error,
      text,
    } = e.data;
    if (action === 'init') {
      if (success) {
        this.#onInitSuccess();
      } else {
        this.#onInitError(error);
      }
    }
    if (action === 'run') {
      if (success) {
        this.#onRunSuccess();
      } else {
        this.#onRunError(error);
      }
    }
    if (action === 'input') {
      this.#isInput = true;
      if (text) this.print(text);
      await this.#cacheFile.writeFile('');
      this.$input.get('textarea').focus();
    }
    if (action === 'stdout') {
      this.print(text);
    }
    if (action === 'stderr') {
      this.print(text, 'error');
    }
  }

  #onkeydown(e) {
    const value = e.target.value;
    const lines = value.split('\n');
    const canGoUp = this.#getCursorPosition() === 1;
    const canGoDown = this.#getCursorPosition() === lines.length;
    // if up arrow is pressed, show previous code
    if (canGoUp && e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.#niddle > 0) {
        this.#niddle -= 1;
        e.target.value = this.#codes[this.#niddle];
      }
    }

    // if down arrow is pressed, show next code
    if (canGoDown && e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.#niddle < this.#codes.length) {
        this.#niddle += 1;
        e.target.value = this.#codes[this.#niddle] || '';
      }
    }

    // if ctrl + l is pressed, clear the input
    if (e.key === 'l' && e.ctrlKey) {
      this.#clearConsole();
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      e.target.value += '\t';
    }
  }

  #getCursorPosition() {
    const $textarea = this.$input.get('textarea');
    const {
      selectionStart,
      selectionEnd,
    } = $textarea;

    if (selectionStart !== selectionEnd) return;
    const lines = $textarea.value;

    // get the line number of the cursor
    return lines.slice(0, selectionStart).split('\n').length;
  }

  #oninput(e) {
    const $el = e.target;
    let { value } = $el;
    $el.style.height = `${$el.scrollHeight}px`;
    // check if new line is added
    if (value.endsWith('\n')) {
      if (this.#isInput) {
        this.#isInput = false;
        value = value.slice(0, -1);
        this.#cacheFile.writeFile(value + `\0${this.#inputCount++}`);
        this.print(value, 'input');
        this.$input.get('textarea').value = '';
        return;
      }

      if (!this.#isIncomplete(value)) {
        this.#codes.push(value.trim());
        this.#niddle = this.#codes.length;
        this.print(value, 'input');
        this.runCode(value);
        this.$input.get('textarea').value = '';
      }
    }
  }

  #isIncomplete(code) {
    const lines = code.trim().split('\n');
    let lastLine = lines[lines.length - 1];

    // if last line ends with ':', it is incomplete
    if (/:$/.test(lastLine)) {
      return true;
    }

    // if last line starts with tab or soft tab, it is incomplete
    if (/^\W+/.test(lastLine)) {
      if (/\n\n$/.test(code)) {
        return false;
      }
      return true;
    }

    return false;
  }
}

if (window.acode) {
  const python = new Python();
  acode.setPluginInit('acode.plugin.python', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    python.baseUrl = baseUrl;
    python.init($page, cacheFile, cacheFileUrl);
  });
  acode.setPluginUnmount('acode.plugin.python', () => {
    python.destroy();
  });
  // future reference
  if (acode.registerShortcut) {
    acode.registerShortcut('Python Console', python.terminal.bind(python), 'Python');
  }
  if (acode.registerMenu) {
    acode.registerMenu('Python Console', python.terminal.bind(python), 'Python');
  }
}