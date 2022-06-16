import tag from 'html-tag-js';

class Python {
  name = 'Python';
  baseUrl = '';
  pyodide = null;
  $input = null;
  $page = null;
  $runBtn = null;
  async init($page) {
    this.$page = $page;
    this.$page.settitle('Python');

    let main = this.$page.get('.main');

    if (!main) {
      main = tag('div', { className: 'main' });
      this.$page.append(main);
    }

    main.style.padding = '10px';
    main.style.overflow = 'auto';
    main.style.boxSizing = 'border-box';

    const $script = tag('script', {
      src: this.baseUrl + 'lib/pyodide.js',
    });


    document.head.appendChild($script);
    await new Promise(resolve => $script.onload = resolve);
    this.pyodide = await loadPyodide({
      stdout: (msg) => this.print(msg),
      stderr: (err) => this.print(err, 'error'),
      stdin: () => this.read(),
    });

    this.$runBtn = tag('span', {
      className: 'icon play_arrow',
      attr: {
        action: 'run',
      },
      onclick: this.run.bind(this),
    });

    this.checkRunnable();
    editorManager.on('switch-file', this.checkRunnable.bind(this));
    editorManager.on('rename-file', this.checkRunnable.bind(this));
  }
  run() {
    this.$page.get('.main').innerHTML = '';
    this.$page.classList.remove('hide');
    this.$page.show();
    setTimeout(async () => {
      const code = editorManager.editor.getValue();
      const output = await this.pyodide.runPythonAsync(code);
      this.print(output);
    }, 600);
  }
  destroy() {
    if (this.$runBtn) {
      this.$runBtn.onclick = null;
      this.$runBtn.remove();
    }
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
      const $editIcon = $header.get('.icon.edit');
      $header.insertBefore(this.$runBtn, $editIcon);
    }
  }

  print(res, type) {
    if (!this.$page.isConnected) return;
    const $output = tag('div', {
      className: 'python-output',
    });
    $output.appendChild(tag('pre', {
      textContent: res,
      className: type
    }));
    const $main = this.$page.get('.main');
    if (!$main) this.$page.append(tag('div', { className: 'main' }));
    this.$page.get('.main').append($output);
  }

  read() {
    return prompt('(Python Input)>>>') || '';
  }
}

console.log('Python plugin');

if (window.acode) {
  const python = new Python();
  acode.setPluginInit('acode.plugin.python', (baseUrl, $page) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    python.baseUrl = baseUrl;
    python.init($page);
    console.log('Python plugin initialized');
  });
  acode.setPluginUnmount('acode.plugin.python', () => {
    python.destroy();
    console.log('Python plugin unmounted');
  })
}