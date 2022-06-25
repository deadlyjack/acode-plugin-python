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
  name = 'Python';
  baseUrl = '';
  pyodide = null;
  $input = null;
  $page = null;
  $runBtn = null;
  $style = null;

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
    const $main = this.$page.get('.main');
    if (!this.$page.isConnected) {
      this.$page.classList.remove('hide');
      this.$page.show();
    }

    $main.innerHTML = '';

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

    if (file.name.endsWith('.py')) {
      const $header = tag.get('header');
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
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.target.value + '\0';
      this.print(value, 'input');
      this.#cacheFile.writeFile(value);
      e.target.value = '';
    }
  }
}


console.log('Python plugin');

if (window.acode) {
  const python = new Python();
  acode.setPluginInit('acode.plugin.python', (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    python.baseUrl = baseUrl;
    python.init($page, cacheFile, cacheFileUrl);
    console.log('Python plugin initialized');
  });
  acode.setPluginUnmount('acode.plugin.python', () => {
    python.destroy();
    console.log('Python plugin unmounted');
  })
}