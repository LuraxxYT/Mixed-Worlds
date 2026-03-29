const $ = (s) => document.querySelector(s);
const screens = { boot: $("#boot-screen"), login: $("#login-screen"), desktop: $("#desktop-screen") };
const desktop = $("#desktop");
const taskbarApps = $("#taskbar-apps");
const startMenu = $("#start-menu");
const contextMenu = $("#context-menu");
const dialog = $("#dialog");
const dialogMessage = $("#dialog-message");
const root = document.documentElement;
let z = 10;
let activeHostDir = null;
let hostMode = false;

const iconMap = {
  folder: "assets/icons/folder.svg",
  file: "assets/icons/file.svg",
  app: "assets/icons/app.svg",
  shortcut: "assets/icons/shortcut.svg",
  system: "assets/icons/system.svg"
};

const baseState = {
  auth: { user: "Admin", pass: "browseros" },
  settings: {
    accent: "#45b6ff",
    wallpaper: "radial-gradient(circle at 20% 20%, #1d2671, #111827 55%, #090d14)",
    windowOpacity: 0.96,
    iconSize: 64,
    use24h: true
  },
  fs: {
    name: "",
    type: "folder",
    children: {
      Desktop: { name: "Desktop", type: "folder", children: {} },
      Dokumente: { name: "Dokumente", type: "folder", children: {} },
      Downloads: { name: "Downloads", type: "folder", children: {} },
      Apps: {
        name: "Apps",
        type: "folder",
        children: {
          "explorer.bos": { name: "explorer.bos", type: "app", appType: "system", system: true },
          "editor.bos": { name: "editor.bos", type: "app", appType: "system", system: true },
          "settings.bos": { name: "settings.bos", type: "app", appType: "system", system: true },
          "store.bos": { name: "store.bos", type: "app", appType: "system", system: true },
          "about.bos": { name: "about.bos", type: "app", appType: "html", content: `<div style='font:16px/1.5 Segoe UI;padding:12px'><h2>BrowserOS X</h2><p>✨ Modernes Browser-System mit Fenster-Manager, Explorer, Editor, Einstellungszentrale, App-Upload, Verknüpfungen und optionalem echten Ordnerzugriff über die File System Access API.</p></div>`, system: true }
        }
      },
      System: {
        name: "System",
        type: "folder",
        children: {
          "index.html": { name: "index.html", type: "file", content: "SYSTEM", system: true },
          "shell.core": { name: "shell.core", type: "file", content: "SYSTEM CORE", system: true }
        }
      }
    }
  }
};

let state = null;

async function loadState() {
  const saved = localStorage.getItem("browserosx_state");
  if (saved) return JSON.parse(saved);
  const fromDisk = await buildFSFromProjectFiles();
  const boot = structuredClone(baseState);
  if (fromDisk) boot.fs = fromDisk;
  return boot;
}
function saveState() { localStorage.setItem("browserosx_state", JSON.stringify(state)); }

async function buildFSFromProjectFiles() {
  try {
    const manifestRes = await fetch("os-manifest.json", { cache: "no-store" });
    if (!manifestRes.ok) return null;
    const manifest = await manifestRes.json();

    const root = { name: "", type: "folder", children: {} };
    const folderNames = Object.keys(manifest);
    for (const folder of folderNames) {
      root.children[folder] = { name: folder, type: "folder", children: {} };
      const entries = manifest[folder] || {};
      for (const [name, kind] of Object.entries(entries)) {
        const path = `${folder}/${name}`;
        let content = "";
        if (kind === "app" || kind === "file" || kind === "system") {
          const res = await fetch(path, { cache: "no-store" });
          if (res.ok) content = await res.text();
        }
        root.children[folder].children[name] = {
          name,
          type: kind === "app" ? "app" : "file",
          appType: kind === "app" ? (name === "about.bos" ? "html" : "system") : undefined,
          content,
          system: kind === "system" || folder === "System"
        };
      }
    }
    return root;
  } catch {
    return null;
  }
}
function show(screen) { Object.values(screens).forEach((el) => el.classList.remove("active")); screens[screen].classList.add("active"); }
function showError(message) { dialogMessage.textContent = message; dialog.classList.remove("hidden"); }

function applySettings() {
  root.style.setProperty("--accent", state.settings.accent);
  root.style.setProperty("--wallpaper", state.settings.wallpaper);
  root.style.setProperty("--icon-size", `${state.settings.iconSize}px`);
  root.style.setProperty("--win-bg", `rgba(244, 249, 255, ${state.settings.windowOpacity})`);
}

function seedDesktop() {
  const d = getNode("/Desktop");
  if (!d.children["Explorer.lnk.bos"]) d.children["Explorer.lnk.bos"] = { name: "Explorer.lnk.bos", type: "shortcut", target: "/Apps/explorer.bos" };
  if (!d.children["Editor.lnk.bos"]) d.children["Editor.lnk.bos"] = { name: "Editor.lnk.bos", type: "shortcut", target: "/Apps/editor.bos" };
  if (!d.children["Einstellungen.lnk.bos"]) d.children["Einstellungen.lnk.bos"] = { name: "Einstellungen.lnk.bos", type: "shortcut", target: "/Apps/settings.bos" };
  saveState();
}

function pathParts(path) { return path.split("/").filter(Boolean); }
function getNode(path) {
  if (path === "/") return state.fs;
  let cur = state.fs;
  for (const p of pathParts(path)) {
    if (!cur.children?.[p]) return null;
    cur = cur.children[p];
  }
  return cur;
}
function getParent(path) {
  const parts = pathParts(path); const name = parts.pop(); const pp = "/" + parts.join("/");
  return { parent: getNode(pp || "/"), name };
}

function iconFor(node) {
  if (node.system) return iconMap.system;
  return iconMap[node.type] || iconMap.file;
}

function renderDesktop() {
  desktop.innerHTML = "";
  const entries = Object.values(getNode("/Desktop").children || {});
  entries.forEach((entry) => {
    const el = document.createElement("div");
    el.className = "desktop-icon";
    el.innerHTML = `<img class='icon-img' src='${iconFor(entry)}' alt='icon'><div>${entry.name}</div>`;
    el.ondblclick = () => openEntry(`/Desktop/${entry.name}`);
    el.oncontextmenu = (e) => openDesktopContextMenu(e, `/Desktop/${entry.name}`);
    desktop.appendChild(el);
  });
}

function openDesktopContextMenu(e, path) {
  e.preventDefault();
  contextMenu.innerHTML = "";
  addMenuBtn("🗑️ Löschen", () => deleteVirtual(path));
  addMenuBtn("✏️ Umbenennen", () => renameVirtual(path));
  addMenuBtn("📋 Verknüpfung erstellen", () => createShortcutPrompt(path));
  contextMenu.style.left = `${e.clientX}px`;
  contextMenu.style.top = `${e.clientY}px`;
  contextMenu.classList.remove("hidden");
}

function addMenuBtn(label, fn) {
  const b = document.createElement("button"); b.textContent = label;
  b.onclick = () => { fn(); contextMenu.classList.add("hidden"); };
  contextMenu.appendChild(b);
}
document.addEventListener("click", () => contextMenu.classList.add("hidden"));

function openEntry(path) {
  const node = getNode(path);
  if (!node) return;
  if (node.type === "shortcut") return openEntry(node.target);
  if (node.type === "folder") return openExplorer(path);
  if (node.type === "file") return openEditor(path);
  if (node.type === "app") {
    if (node.appType === "system" || ["explorer.bos", "editor.bos", "settings.bos", "store.bos"].includes(node.name)) {
      if (node.name === "explorer.bos") return openExplorer("/");
      if (node.name === "editor.bos") return openEditor();
      if (node.name === "settings.bos") return openSettings();
      if (node.name === "store.bos") return openStore();
    }
    return openHtmlApp(node.name, node.content || "<h2>Leere App</h2>");
  }
}

function createWindow(title, renderer) {
  const win = $("#window-template").content.firstElementChild.cloneNode(true);
  const titleEl = win.querySelector(".window-title");
  const content = win.querySelector(".window-content");
  titleEl.textContent = title;
  win.style.zIndex = ++z;
  win.style.top = `${70 + Math.random() * 80}px`;
  win.style.left = `${100 + Math.random() * 120}px`;
  win.addEventListener("mousedown", () => win.style.zIndex = ++z);

  const close = win.querySelector(".close-btn");
  const min = win.querySelector(".min-btn");
  const max = win.querySelector(".max-btn");

  close.onclick = () => {
    const tid = win.dataset.taskid; win.remove();
    const btn = document.getElementById(tid); if (btn) btn.remove();
  };
  min.onclick = () => win.style.display = "none";
  max.onclick = () => {
    if (win.dataset.max === "1") {
      win.dataset.max = "0";
      win.style.inset = "";
      win.style.width = "min(860px, 90vw)";
      win.style.height = "min(560px, 76vh)";
    } else {
      win.dataset.max = "1";
      win.style.top = "8px"; win.style.left = "8px";
      win.style.width = "calc(100% - 16px)";
      win.style.height = "calc(100% - 70px)";
    }
  };

  makeDraggable(win);
  renderer(content, win);
  document.body.appendChild(win);

  const tid = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  win.dataset.taskid = tid;
  const b = document.createElement("button");
  b.id = tid;
  b.className = "task-btn";
  b.textContent = title;
  b.onclick = () => { win.style.display = "flex"; win.style.zIndex = ++z; };
  taskbarApps.appendChild(b);
}

function makeDraggable(win) {
  const bar = win.querySelector(".window-titlebar");
  let drag = false, dx = 0, dy = 0;
  bar.addEventListener("mousedown", (e) => {
    drag = true;
    dx = e.clientX - win.offsetLeft;
    dy = e.clientY - win.offsetTop;
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag || win.dataset.max === "1") return;
    win.style.left = `${Math.max(0, e.clientX - dx)}px`;
    win.style.top = `${Math.max(0, e.clientY - dy)}px`;
  });
  document.addEventListener("mouseup", () => drag = false);
}

function openExplorer(path = "/") {
  createWindow(`📁 Explorer ${hostMode ? "(Host)" : "(Virtual)"} - ${path}`, (content) => {
    content.innerHTML = `
      <div class='toolbar'>
        <button id='mode-switch'>${hostMode ? "💾 Virtualer Modus" : "🧷 Host-Ordner Modus"}</button>
        <button id='bind-host'>📂 Host-Ordner verbinden</button>
        <button id='up'>⬆️ Hoch</button>
        <button id='new-folder'>📁 Neuer Ordner</button>
        <button id='new-file'>📄 Neue Datei</button>
        <button id='new-shortcut'>🔗 Neue Verknüpfung</button>
        <button id='upload'>📤 Upload</button>
        <button id='refresh'>🔄 Aktualisieren</button>
      </div>
      <div class='explorer-layout'>
        <div class='panel'><div id='tree'></div></div>
        <div class='panel' id='list'></div>
      </div>`;

    const tree = content.querySelector("#tree");
    const list = content.querySelector("#list");
    let currentPath = path;

    const refresh = async () => {
      if (hostMode && activeHostDir) {
        renderHostTree(tree, activeHostDir, "");
        await renderHostList(list, activeHostDir, currentPath, (p) => currentPath = p, refresh);
      } else {
        renderVirtualTree(tree, "/", state.fs, (p) => { currentPath = p; refresh(); });
        renderVirtualList(list, currentPath, (p) => { currentPath = p; refresh(); });
      }
    };

    content.querySelector("#mode-switch").onclick = async () => {
      hostMode = !hostMode;
      openExplorer("/");
    };

    content.querySelector("#bind-host").onclick = async () => {
      if (!window.showDirectoryPicker) return showError("Dein Browser unterstützt keinen echten Ordnerzugriff (File System Access API). Nutze Chrome/Edge.");
      activeHostDir = await window.showDirectoryPicker({ mode: "readwrite" });
      hostMode = true;
      openExplorer("/");
    };

    content.querySelector("#up").onclick = () => {
      if (currentPath === "/" || currentPath === "") return;
      const parts = pathParts(currentPath); parts.pop(); currentPath = "/" + parts.join("/");
      refresh();
    };

    content.querySelector("#new-folder").onclick = async () => {
      const name = prompt("Ordnername:"); if (!name) return;
      if (hostMode && activeHostDir) {
        const h = await getHostHandle(currentPath || "/");
        await h.getDirectoryHandle(name, { create: true });
      } else {
        const node = getNode(currentPath); if (!node || node.type !== "folder") return;
        node.children[name] = { name, type: "folder", children: {} }; saveState();
      }
      refresh();
    };

    content.querySelector("#new-file").onclick = async () => {
      const name = prompt("Dateiname:"); if (!name) return;
      if (hostMode && activeHostDir) {
        const h = await getHostHandle(currentPath || "/");
        const file = await h.getFileHandle(name, { create: true });
        const w = await file.createWritable(); await w.write(""); await w.close();
      } else {
        const node = getNode(currentPath); node.children[name] = { name, type: "file", content: "" }; saveState();
      }
      refresh();
    };

    content.querySelector("#new-shortcut").onclick = async () => {
      const name = prompt("Name:"); const target = prompt("Zielpfad:");
      if (!name || !target) return;
      const fileName = `${name}.lnk.bos`;
      if (hostMode && activeHostDir) {
        const dir = await getHostHandle(currentPath || "/");
        const fh = await dir.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable(); await w.write(JSON.stringify({ type: "shortcut", target }, null, 2)); await w.close();
      } else {
        const node = getNode(currentPath);
        node.children[fileName] = { name: fileName, type: "shortcut", target }; saveState(); renderDesktop();
      }
      refresh();
    };

    content.querySelector("#upload").onclick = () => uploadInto(currentPath, refresh);
    content.querySelector("#refresh").onclick = refresh;
    refresh();
  });
}

function renderVirtualTree(container, path, node, onOpen) {
  container.innerHTML = "";
  const walk = (p, n, depth = 0) => {
    const row = document.createElement("div");
    row.style.paddingLeft = `${depth * 12}px`;
    row.textContent = `📁 ${p === "/" ? "Root" : n.name}`;
    row.style.cursor = "pointer";
    row.onclick = () => onOpen(p);
    container.appendChild(row);
    Object.values(n.children || {}).filter((c) => c.type === "folder").forEach((child) => {
      const cp = `${p === "/" ? "" : p}/${child.name}`;
      walk(cp, child, depth + 1);
    });
  };
  walk(path, node, 0);
}

function renderVirtualList(container, path, onOpenPath) {
  const node = getNode(path || "/");
  if (!node || node.type !== "folder") return;
  const rows = Object.values(node.children || {});
  container.innerHTML = `<h4>Pfad: ${path}</h4><table class='file-table'><thead><tr><th>Name</th><th>Typ</th><th>Aktion</th></tr></thead><tbody></tbody></table>`;
  const tbody = container.querySelector("tbody");

  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><img class='mini-icon' src='${iconFor(entry)}' alt='icon'> ${entry.name}</td><td>${entry.system ? "SYSTEM" : entry.type.toUpperCase()}</td><td><div class='actions'></div></td>`;
    const actions = tr.querySelector(".actions");

    btn(actions, "Öffnen", () => {
      const full = `${path === "/" ? "" : path}/${entry.name}`;
      if (entry.type === "folder") onOpenPath(full);
      else openEntry(full);
    });
    btn(actions, "Bearbeiten", () => openEditor(`${path === "/" ? "" : path}/${entry.name}`));
    btn(actions, "Umbenennen", () => renameVirtual(`${path === "/" ? "" : path}/${entry.name}`, () => renderVirtualList(container, path, onOpenPath)));
    btn(actions, "Verschieben", () => moveVirtual(`${path === "/" ? "" : path}/${entry.name}`, () => renderVirtualList(container, path, onOpenPath)));
    btn(actions, "Löschen", () => deleteVirtual(`${path === "/" ? "" : path}/${entry.name}`, () => renderVirtualList(container, path, onOpenPath)));

    tbody.appendChild(tr);
  });
}

function btn(parent, label, onClick) {
  const b = document.createElement("button"); b.textContent = label; b.onclick = onClick; parent.appendChild(b);
}

function deleteVirtual(path, cb = renderDesktop) {
  const n = getNode(path);
  if (!n) return;
  if (n.system) return showError("Konte nicht gelöscht werden ERROR Acsses denied");
  const { parent, name } = getParent(path);
  delete parent.children[name];
  saveState();
  renderDesktop();
  cb?.();
}

function renameVirtual(path, cb = renderDesktop) {
  const n = getNode(path);
  if (!n) return;
  if (n.system) return showError("Konte nicht bearbeitet werden ERROR Acsses denied");
  const newName = prompt("Neuer Name:", n.name);
  if (!newName || newName === n.name) return;
  const { parent, name } = getParent(path);
  delete parent.children[name];
  n.name = newName;
  parent.children[newName] = n;
  saveState();
  renderDesktop();
  cb?.();
}

function moveVirtual(path, cb = renderDesktop) {
  const n = getNode(path);
  if (!n) return;
  if (n.system) return showError("Konte nicht verschoben werden ERROR Acsses denied");
  const targetPath = prompt("Zielordner, z.B. /Dokumente");
  if (!targetPath) return;
  const target = getNode(targetPath);
  if (!target || target.type !== "folder") return alert("Ungültiger Zielordner.");
  const { parent, name } = getParent(path);
  delete parent.children[name];
  target.children[name] = n;
  saveState();
  renderDesktop();
  cb?.();
}

function createShortcutPrompt(targetPath) {
  const d = getNode("/Desktop");
  const name = prompt("Name der Verknüpfung:");
  if (!name) return;
  d.children[`${name}.lnk.bos`] = { name: `${name}.lnk.bos`, type: "shortcut", target: targetPath };
  saveState();
  renderDesktop();
}

async function uploadInto(currentPath, refresh) {
  const input = document.createElement("input");
  input.type = "file"; input.multiple = true; input.accept = ".bos,.html,.txt,.json,*/*";
  input.onchange = async () => {
    for (const file of input.files) {
      const text = await file.text();
      if (hostMode && activeHostDir) {
        const dir = await getHostHandle(currentPath || "/");
        const fh = await dir.getFileHandle(file.name, { create: true });
        const w = await fh.createWritable(); await w.write(text); await w.close();
      } else {
        const parent = getNode(currentPath || "/");
        const isBos = file.name.endsWith(".bos");
        parent.children[file.name] = { name: file.name, type: isBos ? "app" : "file", appType: "html", content: text };
      }
    }
    saveState();
    renderDesktop();
    refresh();
  };
  input.click();
}

function openEditor(path = null) {
  createWindow("📝 Editor", async (content) => {
    let fileName = path ? pathParts(path).at(-1) : "neu.txt";
    let initial = "";
    if (hostMode && activeHostDir && path) {
      const f = await readHostFile(path);
      if (f) initial = f;
    } else if (path) {
      initial = getNode(path)?.content || "";
    }

    content.innerHTML = `
      <div class='toolbar'>
        <button id='save'>💾 Speichern</button>
        <button id='saveas'>📌 Speichern unter</button>
      </div>
      <div><strong>Datei:</strong> <span id='fname'>${fileName}</span></div>
      <textarea class='editor-area'>${escapeHtml(initial)}</textarea>`;

    const area = content.querySelector("textarea");
    content.querySelector("#save").onclick = async () => {
      if (!path) return alert("Nutze Speichern unter.");
      if (hostMode && activeHostDir) {
        await writeHostFile(path, area.value);
      } else {
        const node = getNode(path);
        if (node.system) return showError("Konte nicht bearbeitet werden ERROR Acsses denied");
        node.content = area.value; saveState();
      }
      alert("Gespeichert ✅");
    };

    content.querySelector("#saveas").onclick = async () => {
      const target = prompt("Voller Pfad inkl Datei, z.B. /Dokumente/test.html");
      if (!target) return;
      if (hostMode && activeHostDir) {
        await writeHostFile(target, area.value, true);
      } else {
        const { parent, name } = getParent(target);
        if (!parent || parent.type !== "folder") return alert("Ungültiger Pfad");
        parent.children[name] = {
          name,
          type: name.endsWith(".bos") ? "app" : "file",
          appType: "html",
          content: area.value
        };
        saveState();
      }
      fileName = target;
      content.querySelector("#fname").textContent = target;
      renderDesktop();
      alert("Gespeichert ✅");
    };
  });
}

function openHtmlApp(name, html) {
  createWindow(`🧩 ${name}`, (content) => {
    content.innerHTML = `<iframe class='app-frame' sandbox='allow-scripts allow-modals allow-forms allow-downloads' srcdoc="${escapeAttr(html)}"></iframe>`;
  });
}

function openSettings() {
  createWindow("⚙️ Einstellungen", (content) => {
    content.innerHTML = `
      <h2>System-Einstellungen</h2>
      <div class='kv'>
        <label>Accent-Farbe</label><input id='s-accent' type='color' value='${state.settings.accent}' />
        <label>Icon-Größe</label><input id='s-icons' type='range' min='42' max='90' value='${state.settings.iconSize}' />
        <label>Fenster-Transparenz</label><input id='s-opacity' type='range' min='0.78' max='1' step='0.01' value='${state.settings.windowOpacity}' />
        <label>Wallpaper</label>
        <select id='s-wall'>
          <option value='radial-gradient(circle at 20% 20%, #1d2671, #111827 55%, #090d14)'>Galaxy</option>
          <option value='linear-gradient(120deg,#1f2937,#0f172a,#0b0f1a)'>Slate</option>
          <option value='linear-gradient(120deg,#0b7285,#1c7ed6,#3b5bdb)'>Ocean</option>
          <option value='linear-gradient(120deg,#3f0071,#6500b8,#2f00ff)'>Neon</option>
        </select>
        <label>Uhrformat</label>
        <select id='s-time'>
          <option value='24'>24h</option>
          <option value='12'>12h</option>
        </select>
      </div>
      <hr>
      <h3>Account</h3>
      <div class='kv'>
        <label>Benutzername</label><input id='s-user' value='${state.auth.user}' />
        <label>Passwort</label><input id='s-pass' value='${state.auth.pass}' />
      </div>
      <div class='toolbar'><button id='save-settings'>💾 Speichern</button><button id='factory-reset'>♻️ Werkseinstellungen</button></div>`;

    content.querySelector("#s-wall").value = state.settings.wallpaper;
    content.querySelector("#s-time").value = state.settings.use24h ? "24" : "12";

    content.querySelector("#save-settings").onclick = () => {
      state.settings.accent = content.querySelector("#s-accent").value;
      state.settings.iconSize = Number(content.querySelector("#s-icons").value);
      state.settings.windowOpacity = Number(content.querySelector("#s-opacity").value);
      state.settings.wallpaper = content.querySelector("#s-wall").value;
      state.settings.use24h = content.querySelector("#s-time").value === "24";
      state.auth.user = content.querySelector("#s-user").value || "Admin";
      state.auth.pass = content.querySelector("#s-pass").value || "browseros";
      saveState();
      applySettings();
      renderDesktop();
      alert("Einstellungen gespeichert ✅");
    };

    content.querySelector("#factory-reset").onclick = () => {
      if (!confirm("Wirklich alles zurücksetzen?")) return;
      localStorage.removeItem("browserosx_state");
      state = structuredClone(baseState);
      seedDesktop();
      applySettings();
      renderDesktop();
      alert("Zurückgesetzt ✅");
    };
  });
}

function openStore() {
  createWindow("🧩 App Hub", (content) => {
    const samples = [
      { n: "clockplus.bos", html: `<div style='font-family:Segoe UI;padding:20px'><h1>⏰ Clock+</h1><p id='t'></p><script>setInterval(()=>document.getElementById('t').textContent=new Date().toLocaleString(),500)</script></div>` },
      { n: "paint-lite.bos", html: `<canvas id='c' width='620' height='360' style='border:1px solid #ddd'></canvas><script>const c=document.getElementById('c'),x=c.getContext('2d');let d=false;c.onmousedown=()=>d=true;c.onmouseup=()=>d=false;c.onmousemove=e=>{if(!d)return;x.fillRect(e.offsetX,e.offsetY,2,2)}</script>` },
      { n: "todo.bos", html: `<div style='font-family:Segoe UI;padding:14px'><h2>✅ Todo</h2><input id='i'><button onclick='a()'>Add</button><ul id='l'></ul><script>function a(){const v=i.value.trim();if(!v)return;const li=document.createElement('li');li.textContent=v;l.appendChild(li);i.value='';}</script></div>` }
    ];
    content.innerHTML = `<h2>App Hub</h2><p>Installiere fertige BOS-Apps mit einem Klick.</p><div id='cards'></div>`;
    const cards = content.querySelector("#cards");
    samples.forEach((s) => {
      const box = document.createElement("div");
      box.className = "panel";
      box.style.marginBottom = "8px";
      box.innerHTML = `<strong>${s.n}</strong><p>Installiert die App in /Apps.</p><button>Installieren</button>`;
      box.querySelector("button").onclick = () => {
        const apps = getNode("/Apps");
        apps.children[s.n] = { name: s.n, type: "app", appType: "html", content: s.html };
        saveState();
        alert(`${s.n} installiert ✅`);
      };
      cards.appendChild(box);
    });
  });
}

async function renderHostTree(container, dirHandle, path) {
  container.innerHTML = "<p>📂 Host-Dateisystem</p>";
  const walk = async (handle, p, depth = 0) => {
    const row = document.createElement("div");
    row.style.paddingLeft = `${depth * 12}px`;
    row.style.cursor = "pointer";
    row.textContent = `📁 ${p || "/"}`;
    container.appendChild(row);
    for await (const [name, child] of handle.entries()) {
      if (child.kind === "directory") await walk(child, `${p}/${name}`.replace(/^\/+/, "/"), depth + 1);
    }
  };
  await walk(dirHandle, path || "");
}

async function renderHostList(container, rootHandle, path, setPath, refresh) {
  const h = await getHostHandle(path || "/");
  container.innerHTML = `<h4>Host Pfad: ${path || "/"}</h4><table class='file-table'><thead><tr><th>Name</th><th>Typ</th><th>Aktion</th></tr></thead><tbody></tbody></table>`;
  const tbody = container.querySelector("tbody");

  for await (const [name, entry] of h.entries()) {
    const tr = document.createElement("tr");
    const hostIcon = entry.kind === "directory" ? iconMap.folder : iconMap.file;
    tr.innerHTML = `<td><img class="mini-icon" src="${hostIcon}" alt="icon"> ${name}</td><td>${entry.kind.toUpperCase()}</td><td><div class='actions'></div></td>`;
    const actions = tr.querySelector(".actions");
    btn(actions, "Öffnen", async () => {
      if (entry.kind === "directory") { setPath(`${path === "/" ? "" : path}/${name}` || "/"); await refresh(); }
      else openHostFile(`${path === "/" ? "" : path}/${name}`);
    });
    btn(actions, "Löschen", async () => {
      await h.removeEntry(name, { recursive: true });
      await refresh();
    });
    tbody.appendChild(tr);
  }
}

async function getHostHandle(path) {
  if (!activeHostDir) throw new Error("Kein Host-Ordner verbunden.");
  if (!path || path === "/") return activeHostDir;
  let cur = activeHostDir;
  for (const part of pathParts(path)) cur = await cur.getDirectoryHandle(part, { create: true });
  return cur;
}

async function readHostFile(path) {
  const parts = pathParts(path);
  const name = parts.pop();
  const dir = await getHostHandle("/" + parts.join("/"));
  try {
    const fh = await dir.getFileHandle(name);
    const f = await fh.getFile();
    return await f.text();
  } catch { return null; }
}

async function writeHostFile(path, content, create = false) {
  const parts = pathParts(path);
  const name = parts.pop();
  const dir = await getHostHandle("/" + parts.join("/"));
  const fh = await dir.getFileHandle(name, { create: true || create });
  const w = await fh.createWritable(); await w.write(content); await w.close();
}

async function openHostFile(path) {
  const text = await readHostFile(path);
  const name = pathParts(path).at(-1) || "Datei";
  if (name.endsWith(".bos") || name.endsWith(".html")) openHtmlApp(name, text || "");
  else openEditor(path);
}

function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function escapeAttr(s) { return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

function clockTick() {
  if (!state) return;
  const now = new Date();
  const opts = state.settings.use24h
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
    : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true };
  $("#clock").textContent = now.toLocaleTimeString("de-DE", opts);
}
setInterval(clockTick, 1000); clockTick();

$("#start-btn").onclick = () => startMenu.classList.toggle("hidden");
$("#show-desktop-btn").onclick = () => document.querySelectorAll(".window").forEach((w) => w.style.display = "none");
$("#dialog-close").onclick = () => dialog.classList.add("hidden");
$("#logout-btn").onclick = () => { show("login"); startMenu.classList.add("hidden"); };

startMenu.querySelectorAll("button[data-open-app]").forEach((btn) => {
  btn.onclick = () => { openEntry(`/Apps/${btn.dataset.openApp}`); startMenu.classList.add("hidden"); };
});

$("#login-btn").onclick = () => {
  if (!state) return;
  const user = $("#username-input").value.trim();
  const pass = $("#password-input").value;
  if (user === state.auth.user && pass === state.auth.pass) {
    show("desktop"); renderDesktop();
  } else alert("❌ Falsche Zugangsdaten");
};

setTimeout(() => show("login"), 1200);


(async function bootstrap(){
  state = await loadState();
  seedDesktop();
  applySettings();
  renderDesktop();
})();
