/* Nuevo Pacto Apopa: arma el sitio con los datos de data/site.json.
   Los datos se editan desde /admin/ (el panel guarda los cambios en GitHub). */
(function () {
  "use strict";
  var DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  var MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  var WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  var EMPTY = { contact: {}, social: {}, schedule: [], events: [], message: {}, photos: [], gallery: [] };

  var $ = function (id) { return document.getElementById(id); };
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
  function safeUrl(u) { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : "#"; }
  /* Solo rutas de la carpeta images/ del propio sitio. */
  function photoSrc(p, base) { var s = String(p && p.src || ""); return /^images\/[\w.\-]+$/.test(s) ? (base || "") + s : ""; }
  /* Un enlace sin dirección se oculta (por ejemplo una red social que la iglesia no usa). */
  function setLink(id, url) { var a = $(id); if (!a) return; var u = safeUrl(url); a.href = u; a.hidden = u === "#"; if (u !== "#") { a.target = "_blank"; a.rel = "noopener"; } }
  function timeNode(t) {
    if (!String(t || "").trim()) return null;
    var m = String(t || "").trim().match(/^(.*?)\s*(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)$/i);
    return h("span", { class: "time" }, m ? [m[1] + " ", h("small", { text: m[2].toUpperCase().replace(/[.\s]/g, "") })] : [String(t || "")]);
  }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  var slideTimer = null, slideIdx = 0;
  function render(s) {
    s = Object.assign({}, EMPTY, s);
    var c = s.contact || {}, so = s.social || {}, m = s.message || {};

    // Portada: carrusel de fotos
    var heroPhotos = s.photos.filter(function (p) { return p.hero !== false && photoSrc(p); });
    var slides = $("heroSlides"), dots = $("heroDots");
    slides.textContent = ""; dots.textContent = "";
    clearInterval(slideTimer); slideIdx = 0;
    $("hero").classList.toggle("has-photos", heroPhotos.length > 0);
    heroPhotos.forEach(function (p, i) {
      slides.appendChild(h("div", { class: "slide" + (i === 0 ? " on" : ""), style: "background-image:url('" + photoSrc(p) + "')" }));
      if (heroPhotos.length > 1) dots.appendChild(h("button", { class: i === 0 ? "on" : "", "aria-label": "Foto " + (i + 1), onclick: function () { go(i); restart(); } }));
    });
    function go(i) {
      var all = slides.children, ds = dots.children;
      if (!all.length) return;
      all[slideIdx].classList.remove("on"); if (ds[slideIdx]) ds[slideIdx].classList.remove("on");
      slideIdx = (i + all.length) % all.length;
      all[slideIdx].classList.add("on"); if (ds[slideIdx]) ds[slideIdx].classList.add("on");
    }
    function restart() {
      clearInterval(slideTimer);
      if (heroPhotos.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) slideTimer = setInterval(function () { go(slideIdx + 1); }, 6000);
    }
    restart();

    // Horarios
    var week = $("weekGrid"); week.textContent = "";
    DAYS.forEach(function (d) {
      var items = s.schedule.filter(function (x) { return x.day === d; });
      var cell = h("div", { class: "day" + (items.length ? " on" : ""), role: "listitem" }, [h("span", { class: "dname", text: d })]);
      if (!items.length) cell.appendChild(h("span", { class: "rest", text: "—" }));
      items.forEach(function (x) { cell.appendChild(h("div", { class: "slot" }, [timeNode(x.time), h("span", { class: "what", text: x.name })])); });
      week.appendChild(cell);
    });
    $("schedAddr").textContent = (c.address || "Apopa, San Salvador") + ", Apopa, El Salvador";
    setLink("mapsBtn", c.maps);

    // Enlaces
    setLink("liveLink", so.live); setLink("heroLive", so.live); setLink("musicLink", so.music);
    setLink("sFacebook", so.facebook); setLink("sInstagram", so.instagram); setLink("sYoutube", so.youtube); setLink("sTiktok", so.tiktok);

    // Somos iglesia: carrusel con sus propias fotos
    var track = $("galTrack"), gdots = $("galDots"); track.textContent = ""; gdots.textContent = "";
    var gal = (s.gallery || []).filter(function (p) { return photoSrc(p); });
    $("somos-iglesia").hidden = gal.length === 0;
    gal.forEach(function (p, i) {
      track.appendChild(h("figure", null, [h("img", { src: photoSrc(p), alt: p.alt || "Foto de la iglesia Nuevo Pacto Apopa", loading: "lazy" }), p.alt ? h("figcaption", { text: p.alt }) : null]));
      if (gal.length > 1) gdots.appendChild(h("button", { "aria-label": "Foto " + (i + 1), onclick: function () { galGo(i); galRestart(); } }));
    });
    galIdx = 0; markGalDot(); galRestart();

    // Mensaje
    $("msgSeries").textContent = m.series || ""; $("msg-title").textContent = m.title || "";
    $("msgMeta").textContent = m.meta || ""; $("msgText").textContent = m.text || "";
    setLink("msgPlayer", m.url); setLink("msgBtn", m.url);

    // Eventos (los pasados se ocultan)
    var list = $("evList"); list.textContent = "";
    var today = todayISO();
    var evs = s.events.filter(function (e) { return e.date && e.date >= today && e.title; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!evs.length) list.appendChild(h("p", { class: "empty", text: "Pronto publicaremos nuevos eventos. Síguenos en redes para enterarte." }));
    evs.forEach(function (e) {
      var p = e.date.split("-"), dt = new Date(+p[0], +p[1] - 1, +p[2]);
      list.appendChild(h("article", { class: "ev" }, [
        h("div", { class: "date" }, [h("b", { text: String(dt.getDate()).padStart(2, "0") }), h("span", { text: MONTHS[dt.getMonth()] })]),
        h("div", null, [h("h3", { text: e.title }), e.desc ? h("p", { text: e.desc }) : null]),
        h("span", { class: "when", text: WD[dt.getDay()] + (e.time ? " · " + e.time : "") })
      ]));
    });

    // Contacto
    $("cPhone").textContent = c.phone || ""; $("cEmail").textContent = c.email || ""; $("cAddr").textContent = c.address || "";
    $("cPhone").parentNode.hidden = !c.phone; $("cEmail").parentNode.hidden = !c.email;
  }

  // Carrusel "Somos iglesia": avanza solo cada 5 segundos y se pausa al tocarlo
  var galIdx = 0, galTimer = null, galPaused = false;
  function markGalDot() { var ds = $("galDots").children; for (var i = 0; i < ds.length; i++) ds[i].classList.toggle("on", i === galIdx); }
  function galGo(i) {
    var t = $("galTrack"), figs = t.children; if (!figs.length) return;
    galIdx = (i + figs.length) % figs.length;
    t.scrollTo({ left: figs[galIdx].offsetLeft - t.offsetLeft });
    markGalDot();
  }
  function galRestart() {
    clearInterval(galTimer);
    if ($("galTrack").children.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      galTimer = setInterval(function () { if (!galPaused && !document.hidden) galGo(galIdx + 1); }, 5000);
  }
  var gt = $("galTrack");
  gt.addEventListener("mouseenter", function () { galPaused = true; });
  gt.addEventListener("mouseleave", function () { galPaused = false; });
  gt.addEventListener("touchstart", function () { galPaused = true; }, { passive: true });
  gt.addEventListener("scroll", function () {
    var figs = gt.children, best = 0, bd = Infinity;
    for (var i = 0; i < figs.length; i++) { var d = Math.abs(figs[i].offsetLeft - gt.offsetLeft - gt.scrollLeft); if (d < bd) { bd = d; best = i; } }
    if (best !== galIdx) { galIdx = best; markGalDot(); }
  }, { passive: true });

  // Controles
  $("galPrev").addEventListener("click", function () { galGo(galIdx - 1); galRestart(); });
  $("galNext").addEventListener("click", function () { galGo(galIdx + 1); galRestart(); });
  var menuBtn = $("menuBtn"), menu = $("menu");
  menuBtn.addEventListener("click", function () { var o = menu.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", o); menuBtn.textContent = o ? "Cerrar" : "Menú"; });
  menu.addEventListener("click", function (e) { if (e.target.tagName === "A") { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.textContent = "Menú"; } });
  document.querySelectorAll(".copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = $(b.dataset.copy), txt = el.textContent;
      var done = function () { b.textContent = "Copiado"; setTimeout(function () { b.textContent = "Copiar"; }, 1600); };
      var fb = function () { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Seleccionado"; };
      try { navigator.clipboard.writeText(txt).then(done, fb); } catch (e) { fb(); }
    });
  });

  render(EMPTY);
  fetch("data/site.json?v=" + Date.now(), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { console.warn("No se pudo cargar data/site.json. Abre el sitio desde un servidor (GitHub Pages) y no como archivo local."); });
})();
