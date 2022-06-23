import tag from 'html-tag-js';

class Python {
  #worker;
  #onInitError;
  #onInitSuccess;
  #onRunSuccess;
  #onRunError;
  #cacheFile;
  #cacheFileUrl;
  name = 'Python';
  baseUrl = '';
  pyodide = null;
  $input = null;
  $page = null;
  $runBtn = null;

  async init($page, cacheFile, cacheFileUrl) {

    this.#cacheFileUrl = cacheFileUrl;

    $page.id = 'acode-plugin-python';
    this.$refresh = tag('span', {
      className: 'icon refresh',
      attr: {
        action: 'refresh',
      },
      onclick: async () => {
        await this.initWorker();
        this.run();
      },
    });
    this.$page = $page;
    this.$page.settitle('Python');
    this.$page.get('header').append(this.$refresh);
    this.#cacheFile = cacheFile;
    const onhide = $page.onhide;
    $page.onhide = () => {
      this.#cacheFile.writeFile('\0');
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

    this.$input = tag('textarea', {
      onkeydown: this.#onkeydown.bind(this),
      style: {
        backgroundColor: 'transparent',
        color: 'inherit',
        width: '100%',
        border: 'none',
      },
    });
    this.checkRunnable();
    editorManager.on('switch-file', this.checkRunnable.bind(this));
    editorManager.on('rename-file', this.checkRunnable.bind(this));

    await this.initWorker();
  }

  async initWorker() {
    if (this.#worker) this.#worker.terminate();
    if (window.toast) {
      window.toast('Python is loading...');
    }
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
    if (window.toast) {
      window.toast('Python is loaded.');
    }
  }

  async run() {
    await this.#cacheFile.writeFile('');
    this.$page.get('.main').innerHTML = '';
    this.#append(this.$input);

    if (!this.$page.isConnected) {
      this.$page.classList.remove('hide');
      this.$page.show();
    }
    setTimeout(async () => {
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
    }, 600);
  }

  destroy() {
    if (this.$runBtn) {
      this.$runBtn.onclick = null;
      this.$runBtn.remove();
    }
    if (this.#worker) this.#worker.terminate();
    editorManager.off('switch-file', this.checkRunnable.bind(this));
    editorManager.off('rename-file', this.checkRunnable.bind(this));
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
      className: 'python-output',
    });
    $output.appendChild(tag('pre', {
      textContent: res,
      style: {
        color: type === 'error' ? 'orangered' : 'inherit',
      }
    }));
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
      this.$input.focus();
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
      const value = this.$input.value;
      this.print(value);
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