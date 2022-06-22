async function loadPyodideAndPackages(baseUrl = '', packages) {
  importScripts(`${baseUrl}/lib/pyodide.js`);
  self.pyodide = await loadPyodide({
    stdout: (msg) => { stdout(msg) },
    stderr: (msg) => { stdout(msg) },
    stdin: () => { return stdin() },
  });
  if (Array.isArray(packages)) {
    await self.pyodide.installPackages(packages);
  }
}

const actions = {
  async init(data) {
    const { packages, baseUrl, cacheFileUrl } = data;
    self.cacheFileUrl = cacheFileUrl;
    try {
      await loadPyodideAndPackages(baseUrl, packages);

      // override python input
      await self.pyodide.runPython(`import sys
def input(prompt=''):
    print(prompt)
    return sys.stdin.readline()

__builtins__.input = input
`);

      self.postMessage({
        action: 'init',
        success: true,
      });
    } catch (error) {
      self.postMessage({
        action: 'init',
        success: false,
        error,
      });
    }
  },
  async run(data) {
    const { code } = data;
    try {
      await self.pyodide.loadPackagesFromImports(code);
      const output = await self.pyodide.runPythonAsync(code);
      self.postMessage({
        action: 'run',
        success: true,
        output,
      });
    } catch (error) {
      self.postMessage({
        action: 'run',
        success: false,
        error,
      });
    }
  },
  input(data) {
    const { line } = data;
    self.line = line;
  },
}

self.onmessage = async function (e) {
  const {
    action
  } = e.data;

  if (actions[action]) {
    await actions[action](e.data);
  }
};

self.line = '';

function stdout(msg) {
  self.postMessage({
    action: 'stdout',
    text: msg,
  });
}

function stderr(msg) {
  self.postMessage({
    action: 'stderr',
    text: msg,
  });
}

function stdin(str = '') {
  self.postMessage({
    action: 'input',
    text: str,
  });
  let line = '';
  while (!line) {
    line = read();
  }
  return line.replace('\0', '');
}

function read() {
  const xhr = new XMLHttpRequest();
  xhr.timeout = 1000;
  xhr.open('GET', self.cacheFileUrl, false);
  try {
    xhr.send();
    return xhr.responseText;
  } catch (err) {
    throw err instanceof Error ? err : new Error(err);
  }
}