/* Panel de administración de Nuevo Pacto Apopa.
   - El equipo entra solo con la contraseña de administración.
   - La llave de GitHub se guarda cifrada con esa contraseña en data/acceso.json.
   - Las fotos se suben a la carpeta images/ del repositorio y el contenido a data/site.json.
   - Cada "Guardar y publicar" crea un commit; GitHub Pages actualiza el sitio en 1 a 2 minutos. */
(function () {
  "use strict";
  var DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  var DATA_PATH = "data/site.json", ACCESS_PATH = "data/acceso.json", ITER = 310000;
  var STORE_KEY = "np-admin";
  var $ = function (id) { return document.getElementById(id); };

  var cfg = null;          // {owner, repo, branch, token}
  var state = null;        // contenido de site.json
  var dataSha = null;
  var removed = [];        // fotos quitadas; se borran del repositorio al guardar si ya nadie las usa
  var localUrls = {};      // vista previa de fotos recién subidas
  var accessBox = null;    // contenido de acceso.json
  var pendingPass = "";    // contraseña escrita antes de conectar GitHub por primera vez
  var dirty = false, saving = false;

  /* ---------- utilidades ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "class") el.className = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function b64encodeText(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decodeText(b64) { return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, "")))); }
  function bytesToB64(b) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function b64ToBytes(s) { var r = atob(s), b = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = rej; r.readAsDataURL(blob);
    });
  }
  function photoSrc(p) { if (localUrls[p.src]) return localUrls[p.src]; return /^images\/[\w.\-]+$/.test(p.src || "") ? "../" + p.src : ""; }

  /* ---------- GitHub ---------- */
  function api(method, path, body) {
    var url = "https://api.github.com/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + path;
    return fetch(url, {
      method: method,
      headers: { "Authorization": "Bearer " + cfg.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var err = new Error((j && j.message) || ("HTTP " + r.status)); err.status = r.status; throw err; }
        return j;
      });
    });
  }
  function contentsPath(p) { return "/contents/" + p.split("/").map(encodeURIComponent).join("/"); }
  function getFile(p) { return api("GET", contentsPath(p) + "?ref=" + encodeURIComponent(cfg.branch)); }
  function putFile(p, b64, message, sha) {
    var body = { message: message, content: b64, branch: cfg.branch };
    if (sha) body.sha = sha;
    return api("PUT", contentsPath(p), body);
  }
  function deleteFile(p, message) {
    return getFile(p).then(function (f) {
      return api("DELETE", contentsPath(p), { message: message, sha: f.sha, branch: cfg.branch });
    }).catch(function (e) { if (e.status !== 404) throw e; });
  }
  function explain(e) {
    if (!e) return "Ocurrió un error.";
    if (e.status === 401) return "La llave de GitHub no es válida o ya venció.";
    if (e.status === 403) return "La llave de GitHub no tiene permiso de escritura (Contents: Read and write).";
    if (e.status === 404) return "No se encontró el repositorio. Revisa los datos del repositorio.";
    if (e.status === 409) return "Alguien más guardó cambios al mismo tiempo. Recarga la página e inténtalo otra vez.";
    if (e.status === 422) return "GitHub rechazó el archivo. Si es una foto, prueba con una más pequeña.";
    if (e instanceof TypeError) return "Sin conexión. Revisa el internet.";
    return "Error de GitHub: " + e.message;
  }

  /* ---------- llave cifrada con la contraseña ---------- */
  var enc = new TextEncoder(), dec = new TextDecoder();
  function deriveKey(pass, salt, iter) {
    return crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encryptCfg(c, pass) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pass, salt, ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(JSON.stringify(c)));
    }).then(function (ct) {
      return { v: 1, iter: ITER, salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(ct)) };
    });
  }
  function decryptCfg(box, pass) {
    return deriveKey(pass, b64ToBytes(box.salt), box.iter || ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(box.iv) }, key, b64ToBytes(box.data));
    }).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }
  function loadAccess() {
    return fetch("../" + ACCESS_PATH + "?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.data && j.salt && j.iv ? j : null; }, function () { return null; });
  }

  /* ---------- sesión en este dispositivo ---------- */
  function loadSaved() { try { var s = localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function persist(c, remember) {
    try { localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY); (remember ? localStorage : sessionStorage).setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY); } catch (e) {} }

  function guessRepo() {
    var m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    if (!m) return null;
    var seg = location.pathname.split("/").filter(Boolean);
    return { owner: m[1], repo: seg.length && seg[0] !== "admin" ? seg[0] : m[1] + ".github.io" };
  }

  /* ---------- pantallas de entrada ---------- */
  function hideTopActions() { $("aSave").hidden = true; $("aLogout").hidden = true; $("aStatus").textContent = ""; }
  function showPw(msg) {
    $("aLogin").hidden = false; $("aMain").hidden = true; $("loginLoading").hidden = true; hideTopActions();
    $("setupForm").hidden = true; $("pwForm").hidden = false;
    var e = $("pwErr"); e.hidden = !msg; e.textContent = msg || "";
    $("pPass").value = ""; $("pPass").focus();
  }
  function showSetup(msg) {
    $("aLogin").hidden = false; $("aMain").hidden = true; $("loginLoading").hidden = true; hideTopActions();
    $("pwForm").hidden = true; $("setupForm").hidden = false;
    $("sPassWrap").querySelector("label").textContent = pendingPass ? "Repite la contraseña de administración" : "Contraseña de administración";
    var g = guessRepo();
    if (!$("gOwner").value) $("gOwner").value = (g && g.owner) || "";
    if (!$("gRepo").value) $("gRepo").value = (g && g.repo) || "";
    if (!g) $("setupForm").querySelector("details").open = true;
    var e = $("setupErr"); e.hidden = !msg; e.textContent = msg || "";
  }

  function connect(c) {
    cfg = c;
    return api("GET", "").then(function (repo) {
      if (repo && repo.permissions && repo.permissions.push === false) { var er = new Error("sin permiso"); er.status = 403; throw er; }
      return getFile(DATA_PATH);
    }).then(function (f) {
      dataSha = f.sha;
      state = JSON.parse(b64decodeText(f.content));
      ["contact", "social", "message"].forEach(function (k) { state[k] = state[k] || {}; });
      ["schedule", "events", "photos", "gallery"].forEach(function (k) { state[k] = Array.isArray(state[k]) ? state[k] : []; });
      openPanel();
    });
  }

  // 1) Contraseña
  $("pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = $("pPass").value, remember = $("pRemember").checked;
    var btn = $("pwBtn"); btn.disabled = true; btn.textContent = "Entrando…";
    var done = function () { btn.disabled = false; btn.textContent = "Entrar"; };
    if (!accessBox) {
      // Todavía no se ha conectado GitHub: se pide la llave una sola vez.
      if (pass.length < 8) { showPw("Escribe la contraseña completa."); return done(); }
      pendingPass = pass; done(); showSetup("");
      return;
    }
    decryptCfg(accessBox, pass).then(function (c) {
      return connect(c).then(function () { persist(c, remember); }, function (err) {
        cfg = null;
        showPw(err && (err.status === 401 || err.status === 403)
          ? "La contraseña es correcta, pero la llave de GitHub venció. Quien administra la cuenta debe renovarla con “Conectar o renovar la llave de GitHub”."
          : explain(err));
      });
    }, function () { showPw("Contraseña incorrecta."); }).then(done);
  });

  // 2) Conectar GitHub (primera vez o renovar la llave)
  $("setupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = $("sPass").value;
    if (pendingPass && pass !== pendingPass) return showSetup("La contraseña no coincide con la que escribiste al entrar. Revísala.");
    if (pass.length < 8) return showSetup("Escribe la contraseña de administración.");
    var c = { owner: $("gOwner").value.trim(), repo: $("gRepo").value.trim(), branch: $("gBranch").value.trim() || "main", token: $("gToken").value.trim() };
    if (!c.owner || !c.repo) { $("setupForm").querySelector("details").open = true; return showSetup("Completa el usuario y el repositorio de GitHub."); }
    var btn = $("setupBtn"); btn.disabled = true; btn.textContent = "Conectando…";
    connect(c).then(function () {
      return Promise.all([encryptCfg(c, pass), getFile(ACCESS_PATH).then(function (f) { return f.sha; }, function () { return null; })]);
    }).then(function (r) {
      return putFile(ACCESS_PATH, b64encodeText(JSON.stringify(r[0], null, 2) + "\n"), "Conectar panel de administración", r[1]).then(function () {
        accessBox = r[0]; pendingPass = ""; persist(c, true);
        $("gToken").value = ""; $("sPass").value = "";
        notice("Listo. GitHub quedó conectado. En 1 a 2 minutos el equipo ya puede entrar solo con la contraseña.");
      });
    }).catch(function (err) {
      if (!state) { cfg = null; showSetup(explain(err)); }
      else notice("Entraste, pero no se pudo guardar la conexión: " + explain(err), true);
    }).then(function () { btn.disabled = false; btn.textContent = "Conectar y entrar"; });
  });
  $("toSetup").addEventListener("click", function (e) { e.preventDefault(); pendingPass = ""; showSetup(""); });
  $("toPw").addEventListener("click", function (e) { e.preventDefault(); pendingPass = ""; showPw(""); });
  $("aLogout").addEventListener("click", function () {
    if (dirty && !$("aLogout").dataset.armed) { $("aLogout").dataset.armed = "1"; $("aLogout").textContent = "Salir sin guardar"; $("aStatus").textContent = "Tienes cambios sin guardar."; return; }
    dirty = false; forget(); location.reload();
  });

  /* ---------- panel ---------- */
  function notice(text, isErr) { var n = $("aNotice"); n.hidden = false; n.className = isErr ? "err" : "okmsg"; n.textContent = text; window.scrollTo({ top: 0, behavior: "smooth" }); }
  function setDirty() {
    dirty = true;
    var st = $("aStatus"); st.textContent = "Cambios sin guardar"; st.classList.add("dirty");
    $("aSave").disabled = saving; $("aSave2").disabled = saving;
  }
  function getK(path) { var p = path.split("."); return state[p[0]][p[1]]; }
  function setK(path, v) { var p = path.split("."); state[p[0]][p[1]] = v; }
  var uid = 0;
  function inp(val, onv, type) {
    var el = h("input", { id: "x" + (++uid), type: type || "text" }); el.value = val || "";
    el.addEventListener("input", function () { onv(el.value); setDirty(); });
    return el;
  }
  function labelFor(el, text, cls) { return h("div", { class: "field" + (cls ? " " + cls : "") }, [h("label", { for: el.id, text: text }), el]); }

  function renderSched() {
    var box = $("aSched"); box.textContent = "";
    state.schedule.forEach(function (x, i) {
      var sel = h("select", { id: "sd" + (++uid) }, DAYS.map(function (d) { return h("option", { value: d, text: d }); }));
      sel.value = x.day; sel.addEventListener("change", function () { x.day = sel.value; setDirty(); });
      box.appendChild(h("div", { class: "row sched" }, [
        labelFor(sel, "Día"),
        labelFor(inp(x.time, function (v) { x.time = v; }), "Hora"),
        labelFor(inp(x.name, function (v) { x.name = v; }), "Nombre del servicio", "name"),
        h("button", { type: "button", class: "icon-btn", "aria-label": "Quitar servicio", title: "Quitar", onclick: function () { state.schedule.splice(i, 1); renderSched(); setDirty(); } }, ["✕"])
      ]));
    });
  }
  function renderEvents() {
    var box = $("aEvents"); box.textContent = "";
    if (!state.events.length) box.appendChild(h("p", { class: "empty", text: "No hay eventos. Agrega el primero con el botón de abajo." }));
    state.events.forEach(function (e, i) {
      var ta = h("textarea", { id: "ed" + (++uid) }); ta.value = e.desc || "";
      ta.addEventListener("input", function () { e.desc = ta.value; setDirty(); });
      var past = e.date && e.date < todayISO();
      box.appendChild(h("div", { class: "row event" }, [
        labelFor(inp(e.date, function (v) { e.date = v; }, "date"), past ? "Fecha (ya pasó)" : "Fecha"),
        labelFor(inp(e.time, function (v) { e.time = v; }), "Hora"),
        labelFor(inp(e.title, function (v) { e.title = v; }), "Título", "title"),
        h("button", { type: "button", class: "icon-btn", "aria-label": "Eliminar evento", title: "Eliminar", onclick: function () { state.events.splice(i, 1); renderEvents(); setDirty(); } }, ["✕"]),
        labelFor(ta, "Descripción", "desc")
      ]));
    });
  }

  /* Dos álbumes: "photos" (portada) y "gallery" (Somos iglesia) */
  var ALBUMS = {
    photos: { grid: "heroGrid", file: "heroFile", drop: "heroDrop", msg: "heroMsg", prefix: "portada", empty: "Todavía no hay fotos de portada. Mientras tanto se ve el amanecer sobre el volcán." },
    gallery: { grid: "galGrid", file: "galFile", drop: "galDrop", msg: "galMsg", prefix: "iglesia", empty: "Todavía no hay fotos. La sección “Somos iglesia” se muestra en cuanto subas la primera." }
  };
  function renderAlbum(key) {
    var A = ALBUMS[key], list = state[key], box = $(A.grid); box.textContent = "";
    if (!list.length) box.appendChild(h("p", { class: "empty", text: A.empty }));
    list.forEach(function (p, i) {
      var alt = inp(p.alt, function (v) { p.alt = v; });
      alt.setAttribute("placeholder", "Descripción (opcional)"); alt.setAttribute("aria-label", "Descripción de la foto");
      box.appendChild(h("div", { class: "photo" }, [
        h("img", { src: photoSrc(p), alt: "" }),
        h("div", { class: "pbody" }, [
          alt,
          h("div", { class: "ptools" }, [
            h("span", { class: "hint", text: "Foto " + (i + 1) + " de " + list.length }),
            h("div", { class: "grp" }, [
              h("button", { type: "button", class: "icon-btn plain", "aria-label": "Mover antes", disabled: i === 0, onclick: function () { move(i, -1); } }, ["←"]),
              h("button", { type: "button", class: "icon-btn plain", "aria-label": "Mover después", disabled: i === list.length - 1, onclick: function () { move(i, 1); } }, ["→"]),
              h("button", { type: "button", class: "icon-btn", "aria-label": "Quitar foto", title: "Quitar", onclick: function () { removed.push(p.src); list.splice(i, 1); renderAlbum(key); setDirty(); } }, ["✕"])
            ])
          ])
        ])
      ]));
    });
    function move(i, d) { var t = list[i]; list[i] = list[i + d]; list[i + d] = t; renderAlbum(key); setDirty(); }
  }

  function shrink(file) {
    return new Promise(function (resolve) {
      if (!window.createImageBitmap) return resolve(file);
      createImageBitmap(file).then(function (bmp) {
        var max = 1920, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
        var c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b || file); }, "image/jpeg", 0.84);
      }, function () { resolve(file); });
    });
  }
  function uploadFiles(key, files) {
    var A = ALBUMS[key], msg = $(A.msg);
    var list = Array.prototype.filter.call(files, function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); });
    if (!list.length) { msg.hidden = false; msg.className = "err"; msg.textContent = "Elige fotos en formato JPG, PNG o WEBP."; return; }
    var done = 0, failed = 0, lastErr = null;
    msg.hidden = false; msg.className = "uploading"; msg.textContent = "Subiendo 0 de " + list.length + "… no cierres esta página.";
    list.reduce(function (chain, f) {
      return chain.then(function () {
        return shrink(f).then(function (b) {
          var ext = b.type === "image/jpeg" ? "jpg" : (b.type.split("/")[1] || "jpg");
          var path = "images/" + A.prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "." + ext;
          return blobToB64(b).then(function (b64) { return putFile(path, b64, "Subir foto " + path); }).then(function () {
            localUrls[path] = URL.createObjectURL(b);
            state[key].push({ src: path, alt: "" });
            done++; renderAlbum(key); setDirty();
          });
        }).catch(function (err) { failed++; lastErr = err; }).then(function () {
          msg.textContent = "Subiendo " + (done + failed) + " de " + list.length + "… no cierres esta página.";
        });
      });
    }, Promise.resolve()).then(function () {
      if (failed) { msg.className = "err"; msg.textContent = done + " fotos subidas, " + failed + " con error. " + explain(lastErr); }
      else { msg.className = "uploading"; msg.textContent = (done === 1 ? "1 foto subida." : done + " fotos subidas.") + " Ahora pulsa “Guardar y publicar”."; }
    });
  }

  function bindFields() {
    document.querySelectorAll("[data-k]").forEach(function (el) {
      el.value = getK(el.dataset.k) || "";
      el.addEventListener("input", function () { setK(el.dataset.k, el.value); setDirty(); });
    });
  }

  function save() {
    if (saving) return;
    saving = true; $("aSave").disabled = true; $("aSave2").disabled = true;
    var st = $("aStatus"); st.textContent = "Publicando…"; st.classList.remove("dirty");
    putFile(DATA_PATH, b64encodeText(JSON.stringify(state, null, 2) + "\n"), "Actualizar contenido del sitio", dataSha).then(function (r) {
      dataSha = r && r.content && r.content.sha;
      var used = {};
      state.photos.concat(state.gallery).forEach(function (p) { used[p.src] = true; });
      var toDelete = removed.filter(function (p, i, a) { return !used[p] && a.indexOf(p) === i && /^images\/[\w.\-]+$/.test(p); });
      removed = [];
      return toDelete.reduce(function (ch, p) { return ch.then(function () { return deleteFile(p, "Quitar foto " + p).catch(function () {}); }); }, Promise.resolve());
    }).then(function () {
      dirty = false; st.textContent = "Publicado";
      notice("Cambios guardados. El sitio se actualiza en 1 a 2 minutos.");
    }, function (err) {
      st.textContent = "No se guardó"; st.classList.add("dirty");
      $("aSave").disabled = false; $("aSave2").disabled = false;
      notice(explain(err), true);
    }).then(function () { saving = false; });
  }

  var bound = false;
  function openPanel() {
    $("aLogin").hidden = true; $("aMain").hidden = false;
    $("aSave").hidden = false; $("aLogout").hidden = false;
    $("aStatus").textContent = "Sin cambios"; $("aStatus").classList.remove("dirty");
    renderAlbum("photos"); renderAlbum("gallery"); renderEvents(); renderSched();
    if (bound) return; bound = true;
    bindFields();
    $("aAddSched").addEventListener("click", function () { state.schedule.push({ day: "Domingo", time: "", name: "" }); renderSched(); setDirty(); });
    $("aAddEvent").addEventListener("click", function () { state.events.push({ date: todayISO(), time: "", title: "", desc: "" }); renderEvents(); setDirty(); var r = $("aEvents").lastChild; if (r && r.querySelector) r.querySelector("input").focus(); });
    $("aSave").addEventListener("click", save); $("aSave2").addEventListener("click", save);
    Object.keys(ALBUMS).forEach(function (key) {
      var A = ALBUMS[key], drop = $(A.drop);
      $(A.file).addEventListener("change", function (e) { uploadFiles(key, e.target.files); e.target.value = ""; });
      ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
      ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
      drop.addEventListener("drop", function (e) { if (e.dataTransfer) uploadFiles(key, e.dataTransfer.files); });
    });
  }
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- inicio ---------- */
  loadAccess().then(function (box) {
    accessBox = box;
    var saved = loadSaved();
    if (saved && saved.token) connect(saved).catch(function (err) { forget(); showPw(explain(err)); });
    else showPw("");
  });
})();
