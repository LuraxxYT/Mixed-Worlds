const screens = {
  boot: document.getElementById("boot-screen"),
  login: document.getElementById("login-screen"),
  desktop: document.getElementById("desktop-screen")
};

const desktopEl = document.getElementById("desktop");
const startBtn = document.getElementById("start-btn");
const startMenu = document.getElementById("start-menu");
const clock = document.getElementById("clock");
const taskbarApps = document.getElementById("taskbar-apps");
const dialog = document.getElementById("dialog");
const dialogMessage = document.getElementById("dialog-message");
let zCounter = 10;

const defaultFS = {
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
        "explorer.bos": { name: "explorer.bos", type: "app", content: "explorer", icon: "https://cdn-icons-png.flaticon.com/512/3767/3767084.png" },
        "editor.bos": { name: "editor.bos", type: "app", content: "editor", icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png" },
        "settings.bos": { name: "settings.bos", type: "app", content: `<h2>Einstellungen</h2><p>Theme: Blau</p><p>Benutzer: Admin</p><p>BrowserOS Version: 1.0</p>`, icon: "https://cdn-icons-png.flaticon.com/512/3524/3524659.png" },
        "about.bos": { name: "about.bos", type: "app", content: `<h1>BrowserOS</h1><p>Ein Browser-Betriebssystem mit Login, Dateiexplorer, Editor, Verknüpfungen und Dateiverwaltung.</p>`, icon: "https://cdn-icons-png.flaticon.com/512/942/942748.png" }
      }
    },
    System: {
      name: "System",
      type: "folder",
      children: {
        "index.html": { name: "index.html", type: "file", content: "SYSTEM", system: true },
        "kernel.bos": { name: "kernel.bos", type: "file", content: "SYSTEM KERNEL", system: true }
      }
    }
  }
};

let fs = loadFS();
let selectedPath = "/Desktop";
let editorState = { path: null };

function saveFS() {
  localStorage.setItem("browseros_fs", JSON.stringify(fs));
}

function loadFS() {
  const data = localStorage.getItem("browseros_fs");
  return data ? JSON.parse(data) : structuredClone(defaultFS);
}

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function getNode(path) {
  const parts = path.split("/").filter(Boolean);
  let node = fs;
  for (const part of parts) {
    if (!node.children || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

function getParent(path) {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  const parentPath = "/" + parts.join("/");
  return { parent: getNode(parentPath || "/"), name };
}

function ensureShortcut(name, target, folder = "/Desktop") {
  const base = getNode(folder);
  if (base && !base.children[`${name}.lnk.bos`]) {
    base.children[`${name}.lnk.bos`] = {
      name: `${name}.lnk.bos`,
      type: "shortcut",
      target
    };
  }
}

function initSystem() {
  ensureShortcut("Explorer", "/Apps/explorer.bos");
  ensureShortcut("Editor", "/Apps/editor.bos");
  ensureShortcut("Dokumente", "/Dokumente");
  saveFS();
}

function renderDesktop() {
  desktopEl.innerHTML = "";
  const desktopFolder = getNode("/Desktop");
  const entries = Object.values(desktopFolder.children);
  entries.forEach((entry) => {
    const icon = document.createElement("div");
    icon.className = "desktop-icon";
    const iconUrl = entry.type === "shortcut"
      ? "https://cdn-icons-png.flaticon.com/512/545/545682.png"
      : "https://cdn-icons-png.flaticon.com/512/716/716784.png";
    icon.innerHTML = `<img src="${iconUrl}" alt="icon"><div>${entry.name}</div>`;
    icon.ondblclick = () => openEntry(`/Desktop/${entry.name}`);
    desktopEl.appendChild(icon);
  });
}

function openEntry(path) {
  const node = getNode(path);
  if (!node) return;

  if (node.type === "shortcut") {
    openEntry(node.target);
    return;
  }

  if (node.type === "folder") {
    openExplorer(path);
    return;
  }

  if (node.type === "app") {
    if (node.content === "explorer") openExplorer("/");
    else if (node.content === "editor") openEditor(path);
    else openHtmlApp(node.name, node.content);
    return;
  }

  if (node.type === "file") openEditor(path);
}

function createWindow(title, renderFn) {
  const tpl = document.getElementById("window-template");
  const win = tpl.content.firstElementChild.cloneNode(true);
  const titleEl = win.querySelector(".window-title");
  const contentEl = win.querySelector(".window-content");
  titleEl.textContent = title;
  win.style.zIndex = ++zCounter;
  win.style.top = `${60 + Math.floor(Math.random() * 80)}px`;
  win.style.left = `${70 + Math.floor(Math.random() * 150)}px`;

  win.querySelector(".close-btn").onclick = () => {
    const id = win.dataset.taskId;
    win.remove();
    const btn = document.getElementById(id);
    if (btn) btn.remove();
  };
  win.querySelector(".min-btn").onclick = () => (win.style.display = "none");
  win.querySelector(".max-btn").onclick = () => {
    win.style.top = "0";
    win.style.left = "0";
    win.style.width = "100%";
    win.style.height = "calc(100% - 42px)";
  };

  win.addEventListener("mousedown", () => (win.style.zIndex = ++zCounter));

  makeDraggable(win);
  renderFn(contentEl, win);
  document.body.appendChild(win);

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  win.dataset.taskId = taskId;
  const btn = document.createElement("button");
  btn.id = taskId;
  btn.className = "task-btn";
  btn.textContent = title;
  btn.onclick = () => {
    win.style.display = "flex";
    win.style.zIndex = ++zCounter;
  };
  taskbarApps.appendChild(btn);
}

function makeDraggable(win) {
  const bar = win.querySelector(".window-titlebar");
  let drag = false;
  let dx = 0;
  let dy = 0;
  bar.addEventListener("mousedown", (e) => {
    drag = true;
    dx = e.clientX - win.offsetLeft;
    dy = e.clientY - win.offsetTop;
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    win.style.left = `${e.clientX - dx}px`;
    win.style.top = `${e.clientY - dy}px`;
  });
  document.addEventListener("mouseup", () => (drag = false));
}

function openExplorer(path = "/") {
  createWindow(`Explorer - ${path}`, (content) => {
    content.innerHTML = `<div class="explorer-wrap"><div class="tree"></div><div class="files"></div></div>`;
    const tree = content.querySelector(".tree");
    const files = content.querySelector(".files");

    const renderTree = () => {
      tree.innerHTML = "";
      tree.appendChild(makeTreeNode("/", fs));
    };

    const renderFiles = (targetPath) => {
      selectedPath = targetPath;
      const node = getNode(targetPath);
      files.innerHTML = `
        <div class="toolbar">
          <button id="new-folder">Neuer Ordner</button>
          <button id="new-file">Neue Datei</button>
          <button id="new-shortcut">Neue Verknüpfung</button>
          <button id="upload-file">Upload</button>
          <button id="refresh">Aktualisieren</button>
        </div>
        <h4>Pfad: ${targetPath}</h4>
        <table><thead><tr><th>Name</th><th>Typ</th><th>Aktion</th></tr></thead><tbody></tbody></table>`;
      const tbody = files.querySelector("tbody");
      Object.values(node.children || {}).forEach((entry) => {
        const tr = document.createElement("tr");
        const typeLabel = entry.system ? `${entry.type.toUpperCase()} (SYSTEM)` : entry.type.toUpperCase();
        tr.innerHTML = `<td>${entry.name}</td><td>${typeLabel}</td><td></td>`;
        const td = tr.querySelector("td:last-child");

        const openBtn = document.createElement("button");
        openBtn.textContent = "Öffnen";
        openBtn.onclick = () => openEntry(`${targetPath === "/" ? "" : targetPath}/${entry.name}`);
        td.appendChild(openBtn);

        const editBtn = document.createElement("button");
        editBtn.textContent = "Bearbeiten";
        editBtn.onclick = () => openEditor(`${targetPath === "/" ? "" : targetPath}/${entry.name}`);
        td.appendChild(editBtn);

        const moveBtn = document.createElement("button");
        moveBtn.textContent = "Verschieben";
        moveBtn.onclick = () => moveEntry(`${targetPath === "/" ? "" : targetPath}/${entry.name}`);
        td.appendChild(moveBtn);

        const delBtn = document.createElement("button");
        delBtn.textContent = "Löschen";
        delBtn.onclick = () => deleteEntry(`${targetPath === "/" ? "" : targetPath}/${entry.name}`, renderTree, () => renderFiles(targetPath));
        td.appendChild(delBtn);
        tbody.appendChild(tr);
      });

      files.querySelector("#new-folder").onclick = () => {
        const name = prompt("Ordnername:");
        if (!name) return;
        node.children[name] = { name, type: "folder", children: {} };
        saveFS();
        renderTree();
        renderFiles(targetPath);
      };

      files.querySelector("#new-file").onclick = () => {
        const name = prompt("Dateiname (z.B. note.txt):");
        if (!name) return;
        node.children[name] = { name, type: "file", content: "" };
        saveFS();
        renderFiles(targetPath);
      };

      files.querySelector("#new-shortcut").onclick = () => {
        const name = prompt("Name der Verknüpfung:");
        const target = prompt("Zielpfad, z.B. /Apps/explorer.bos");
        if (!name || !target) return;
        node.children[`${name}.lnk.bos`] = { name: `${name}.lnk.bos`, type: "shortcut", target };
        saveFS();
        renderFiles(targetPath);
        renderDesktop();
      };

      files.querySelector("#upload-file").onclick = () => uploadToPath(targetPath, renderFiles, renderTree);
      files.querySelector("#refresh").onclick = () => {
        renderTree();
        renderFiles(targetPath);
      };
    };

    renderTree();
    renderFiles(path);
  });
}

function makeTreeNode(path, node) {
  const wrap = document.createElement("div");
  const label = document.createElement("div");
  label.textContent = path === "/" ? "Root" : `${node.name || "Root"}`;
  label.style.cursor = "pointer";
  label.onclick = () => openExplorer(path);
  wrap.appendChild(label);

  if (node.type === "folder" && node.children) {
    Object.values(node.children)
      .filter((child) => child.type === "folder")
      .forEach((child) => {
        const childPath = `${path === "/" ? "" : path}/${child.name}`;
        const childNode = makeTreeNode(childPath, child);
        childNode.style.paddingLeft = "14px";
        wrap.appendChild(childNode);
      });
  }

  return wrap;
}

function uploadToPath(path, rerenderFiles, rerenderTree) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".bos,.txt,.html,.json,*/*";
  input.onchange = async () => {
    const folder = getNode(path);
    for (const file of input.files) {
      const text = await file.text();
      const type = file.name.endsWith(".bos") ? "app" : "file";
      folder.children[file.name] = {
        name: file.name,
        type,
        content: text,
        icon: "https://cdn-icons-png.flaticon.com/512/716/716784.png"
      };
    }
    saveFS();
    rerenderTree();
    rerenderFiles(path);
    renderDesktop();
  };
  input.click();
}

function deleteEntry(path, rerenderTree, rerenderFiles) {
  const node = getNode(path);
  if (!node) return;
  if (node.system) {
    showError("Konte nicht gelöscht werden ERROR Acsses denied");
    return;
  }
  const { parent, name } = getParent(path);
  if (parent && parent.children[name]) {
    delete parent.children[name];
    saveFS();
    rerenderTree();
    rerenderFiles();
    renderDesktop();
  }
}

function moveEntry(path) {
  const targetFolderPath = prompt("Neuer Zielordner (z.B. /Dokumente):");
  if (!targetFolderPath) return;
  const node = getNode(path);
  const targetFolder = getNode(targetFolderPath);
  if (!node || !targetFolder || targetFolder.type !== "folder") {
    alert("Ungültiger Zielordner");
    return;
  }
  if (node.system) {
    showError("Konte nicht verschoben werden ERROR Acsses denied");
    return;
  }
  const { parent, name } = getParent(path);
  delete parent.children[name];
  targetFolder.children[name] = node;
  saveFS();
  openExplorer(targetFolderPath);
  renderDesktop();
}

function openEditor(path = null) {
  createWindow("Editor", (content) => {
    const node = path ? getNode(path) : { name: "neu.txt", content: "", type: "file" };
    editorState.path = path;
    content.innerHTML = `
      <div class="toolbar">
        <button id="save">Speichern</button>
        <button id="save-as">Speichern unter</button>
      </div>
      <div>Datei: ${node?.name || "neu.txt"}</div>
      <textarea class="editor-area">${escapeHtml(node?.content || "")}</textarea>`;

    const area = content.querySelector("textarea");
    content.querySelector("#save").onclick = () => {
      if (!editorState.path) return alert("Bitte Speichern unter nutzen.");
      const n = getNode(editorState.path);
      n.content = area.value;
      saveFS();
      alert("Gespeichert");
    };
    content.querySelector("#save-as").onclick = () => {
      const target = prompt("Pfad inkl. Dateiname, z.B. /Dokumente/text.txt");
      if (!target) return;
      const { parent, name } = getParent(target);
      if (!parent || parent.type !== "folder") return alert("Ungültiger Pfad");
      parent.children[name] = {
        name,
        type: name.endsWith(".bos") ? "app" : "file",
        content: area.value
      };
      editorState.path = target;
      saveFS();
      renderDesktop();
      alert("Gespeichert unter " + target);
    };
  });
}

function openHtmlApp(name, html) {
  createWindow(name, (content) => {
    content.innerHTML = `<div>${html}</div>`;
  });
}

function showError(message) {
  dialogMessage.textContent = message;
  dialog.classList.remove("hidden");
}

document.getElementById("dialog-close").onclick = () => dialog.classList.add("hidden");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
setInterval(updateClock, 1000);
updateClock();

startBtn.onclick = () => startMenu.classList.toggle("hidden");
startMenu.querySelectorAll("button[data-app]").forEach((btn) => {
  btn.onclick = () => {
    openEntry(`/Apps/${btn.dataset.app}`);
    startMenu.classList.add("hidden");
  };
});

document.getElementById("logout-btn").onclick = () => {
  showScreen("login");
  startMenu.classList.add("hidden");
};

document.getElementById("login-btn").onclick = () => {
  const user = document.getElementById("username-input").value;
  const pass = document.getElementById("password-input").value;
  if (user === "Admin" && pass === "browseros") {
    showScreen("desktop");
    renderDesktop();
  } else {
    alert("Falsche Zugangsdaten");
  }
};

setTimeout(() => showScreen("login"), 1500);
initSystem();
