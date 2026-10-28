// Панель Kling 4.0 в Mini App (28.10.2026), как пульт сайта (qvabolanding Kling4Panel, «как у Seedance» по слову владельца):
// режимы «Референсы» и «Ключевые кадры»; в «Референсах» сетки «Фото», «Видео», «Голоса», и каждый новый файл сам спрашивает,
// кто или что это. Персонажи и голоса собираются из ответов (K4Logic.k4Group), правила, причина блокировки и метки = K4Logic
// (k4-logic.js собран из файла сайта, тот же код, что у сайта и ноды K4 Prep бота). В заказ: image_uploads, video_uploads,
// audio_uploads (tus) и pult, как у сайта; файлы грузятся при нажатии «Сгенерировать».
(function () {
  "use strict";
  var L = window.K4Logic;
  var TAG_LABEL = { character: "Человек", animal: "Животное", prop: "Предмет", costume: "Костюм", scene: "Место", effect: "Эффект", others: "Другое" };
  var VIDEO_MAX = 9 * 1024 * 1024;
  var st = fresh(), seq = 0, root = null, opts = {};

  function fresh() { return { mode: "refs", files: {}, photoKeys: [], videoKeys: [], audioKeys: [], ans: {}, first: null, mids: [], last: null, keepSound: false, askKey: null }; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t) { if (typeof showToast === "function") showToast(t, "error"); }
  function changed() { render(); renderAsk(); if (opts.onChange) opts.onChange(); }
  function durSec() { return opts.getDurationSec ? opts.getDurationSec() : 5; }

  function grouped() {
    return L.k4Group(
      st.photoKeys.map(function (k) { return { key: k, ans: st.ans[k] }; }),
      st.videoKeys.map(function (k) { return { key: k, ans: st.ans[k] }; }),
      st.audioKeys.map(function (k) { return { key: k, ans: st.ans[k] }; })
    );
  }

  // Порядок файлов в заказе как у сайта: фото (референсы, потом фото персонажей), видео (референсы, потом персонажей),
  // звук (отдельные голоса, потом голоса персонажей); разметка pult ссылается на эти позиции.
  function order() {
    var o = { imageKeys: [], photos: [], videoKeys: [], vmeta: [], audioKeys: [], ameta: [], els: [] };
    if (st.mode === "frames") {
      var fr = [[st.first, "first"]].concat(st.mids.map(function (k) { return [k, "mid"]; }), [[st.last, "last"]]);
      fr.forEach(function (p) { if (p[0] && st.files[p[0]]) { o.imageKeys.push(p[0]); o.photos.push({ frame: p[1] }); } });
      return o;
    }
    var g = grouped();
    o.els = g.elements;
    g.refs.forEach(function (r) { o.imageKeys.push(r.key); o.photos.push(r.name ? { name: r.name } : {}); });
    g.elements.forEach(function (e) { e.photos.forEach(function (k) { o.imageKeys.push(k); o.photos.push({ element: e.name }); }); });
    g.videos.forEach(function (v) { var sec = st.files[v.key].sec || 0; o.videoKeys.push(v.key); o.vmeta.push(v.name ? { sec: sec, name: v.name } : { sec: sec }); });
    g.elements.forEach(function (e) { if (e.video) { o.videoKeys.push(e.video); o.vmeta.push({ sec: st.files[e.video].sec || 0, element: e.name }); } });
    g.voices.forEach(function (v) { o.audioKeys.push(v.audio); o.ameta.push({ name: v.name }); });
    g.elements.forEach(function (e) { if (e.voice) { o.audioKeys.push(e.voice); o.ameta.push({ element: e.name }); } });
    return o;
  }
  function pultOf(o) {
    return { v: 1, photos: o.photos, videos: o.vmeta, audios: o.ameta, elements: o.els.map(function (e) {
      var x = { name: e.name, tag: e.tag }; if (e.description) x.description = e.description; return x;
    }) };
  }
  function keepSoundOn(o) { return st.mode === "refs" && st.keepSound && o.vmeta.some(function (v) { return !v.element; }); }

  function tokens() {
    var t = [];
    if (st.mode === "refs") {
      var g = grouped();
      g.refs.forEach(function (r, i) { t.push(r.name ? "@" + r.name : "@Image" + (i + 1)); });
      g.elements.forEach(function (e) { t.push("@" + e.name); });
      g.voices.forEach(function (v) { t.push("@" + v.name); });
      g.videos.forEach(function (v, i) { t.push(v.name ? "@" + v.name : "@Video" + (i + 1)); });
    } else {
      var n = (st.first ? 1 : 0) + st.mids.length + (st.last ? 1 : 0);
      for (var i = 0; i < n; i++) t.push("@Image" + (i + 1));
    }
    return t;
  }

  // ---- файлы ----
  function probe(file, tag) {
    return new Promise(function (resolve) {
      var el = document.createElement(tag), url = URL.createObjectURL(file);
      el.preload = "metadata";
      el.onloadedmetadata = function () { var d = el.duration; URL.revokeObjectURL(url); resolve(isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : 0); };
      el.onerror = function () { URL.revokeObjectURL(url); resolve(0); };
      el.src = url;
    });
  }
  function readDataUrl(file) {
    return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsDataURL(file); });
  }
  // Фото JPG или PNG (kie), не тяжелее приёмника: прочее (HEIC, WEBP) переводится в JPEG, крупное ужимается, как у остальных моделей.
  async function normImage(file) {
    var ok = file.type === "image/jpeg" || file.type === "image/png";
    if (ok && (typeof CLOUD_IMG_LIMIT === "undefined" || file.size <= CLOUD_IMG_LIMIT)) return file;
    var url = await readDataUrl(file);
    if (!ok && typeof ensureJpegPng === "function") url = await ensureJpegPng(url);
    if (typeof CLOUD_IMG_LIMIT !== "undefined" && typeof shrinkReference === "function" && typeof dataUrlToBlob === "function") {
      var b = dataUrlToBlob(url);
      if (b && b.size > CLOUD_IMG_LIMIT) url = await shrinkReference(url);
    }
    return typeof dataUrlToBlob === "function" ? dataUrlToBlob(url) : file;
  }
  function room(target) {
    var g = grouped(), lim = L.K4_LIMITS;
    var materials = g.refs.length + g.videos.length + g.elements.length + g.voices.length;
    if (target === "photo") return Math.min(lim.photosTotal - st.photoKeys.length, lim.materials - materials);
    if (target === "video") return Math.min(lim.videos - st.videoKeys.length, lim.materials - materials);
    if (target === "audio") return Math.min(lim.audios - st.audioKeys.length, lim.materials - materials);
    var n = (st.first ? 1 : 0) + st.mids.length + (st.last ? 1 : 0), max = L.k4MaxFrames(durSec());
    if (target === "mid") return Math.min(lim.midFrames - st.mids.length, max - n);
    return (target === "first" ? !st.first : !st.last) && n < max ? 1 : 0;
  }
  async function pick(files, target) {
    var kind = target === "video" ? "vid" : target === "audio" ? "aud" : "img";
    var r = room(target);
    if (r <= 0) { toast("Достигнут предел Kling 4.0"); return; }
    var list = Array.prototype.slice.call(files, 0, r), firstNew = null;
    for (var i = 0; i < list.length; i++) {
      var f = list[i], key = "k" + (++seq), item = { key: key, kind: kind, file: f };
      if (kind === "img") {
        if (!/^image\//.test(f.type)) { toast("«" + f.name + "»: нужно фото JPG или PNG"); continue; }
        item.file = await normImage(f);
        item.url = await readDataUrl(item.file); // превью dataUrl, как у остальных моделей Mini App
      } else if (kind === "vid") {
        if (!(f.type === "video/mp4" || f.type === "video/quicktime")) { toast("«" + f.name + "»: нужно видео MP4 или MOV"); continue; }
        if (f.size > VIDEO_MAX) { toast("«" + f.name + "»: больше 9 МБ, сожмите файл"); continue; }
        item.sec = await probe(f, "video");
        var vs = L.K4_LIMITS.videoSec;
        if (item.sec < vs[0] || item.sec > vs[1]) { toast("Видео: от " + vs[0] + " до " + vs[1] + " секунд"); continue; }
      } else {
        if (L.K4_AUDIO_MIMES.indexOf(f.type) === -1) { toast("«" + f.name + "»: нужна запись MP3, WAV, M4A или AAC"); continue; }
        if (f.size > L.K4_AUDIO_MAX_BYTES) { toast("«" + f.name + "»: больше 10 МБ"); continue; }
        item.sec = await probe(f, "audio");
      }
      st.files[key] = item;
      if (target === "photo") st.photoKeys.push(key);
      else if (target === "video") st.videoKeys.push(key);
      else if (target === "audio") st.audioKeys.push(key);
      else if (target === "first") st.first = key;
      else if (target === "last") st.last = key;
      else st.mids.push(key);
      if (!firstNew && (target === "photo" || target === "video" || target === "audio")) firstNew = key;
    }
    if (firstNew && !st.askKey) st.askKey = firstNew; // новый файл сразу спрашивает, кто или что это
    changed();
  }
  function drop(key) {
    delete st.files[key]; delete st.ans[key];
    st.photoKeys = st.photoKeys.filter(function (k) { return k !== key; });
    st.videoKeys = st.videoKeys.filter(function (k) { return k !== key; });
    st.audioKeys = st.audioKeys.filter(function (k) { return k !== key; });
    st.mids = st.mids.filter(function (k) { return k !== key; });
    if (st.first === key) st.first = null;
    if (st.last === key) st.last = null;
    if (st.askKey === key) st.askKey = null;
    changed();
  }

  // ---- разметка панели ----
  function label(kind, a) {
    if (!a) return kind === "audio" ? "чей голос?" : kind === "video" ? "что это?" : "кто/что это?";
    var n = (a.name || "").trim();
    if (a.role === "owner") return "голос: " + n;
    if (a.role === "voice") return n || "голос";
    if (a.role === "char") return n || "персонаж";
    return n || "референс";
  }
  function tile(kind, key, cap) {
    var f = st.files[key];
    var body = f.url ? '<img src="' + f.url + '" alt="">' : '<div class="k4-file">' + (f.kind === "vid" ? "▶" : "♪") + " " + (f.sec ? f.sec + " с" : "") + "</div>";
    var a = st.ans[key], capHtml = cap === undefined
      ? '<button type="button" class="k4-cap' + (a ? "" : " ask") + '" data-act="ask" data-k="' + key + '">' + esc(label(kind, a)) + "</button>"
      : (cap ? '<span class="k4-cap">' + esc(cap) + "</span>" : "");
    return '<div class="k4-cell"><div class="preview-item k4-tile" data-act="' + (cap === undefined ? "ask" : "") + '" data-k="' + key + '">' + body +
      '<button type="button" class="k4-x" data-act="drop" data-k="' + key + '" aria-label="Удалить файл">×</button></div>' + capHtml + "</div>";
  }
  function addTile(target, accept, multiple, title) {
    if (room(target) <= 0) return "";
    return '<label class="preview-item k4-add" title="' + esc(title) + '">+<input type="file" data-target="' + target + '" accept="' + accept + '"' + (multiple ? " multiple" : "") + "></label>";
  }
  function render() {
    if (!root) return;
    var h = '<div class="chips-container k4-modes">' +
      '<button type="button" class="chip' + (st.mode === "refs" ? " active" : "") + '" data-act="mode" data-v="refs">Референсы</button>' +
      '<button type="button" class="chip' + (st.mode === "frames" ? " active" : "") + '" data-act="mode" data-v="frames">Ключевые кадры</button></div>';
    var img = "image/jpeg,image/png,image/*";
    if (st.mode === "frames") {
      h += '<p class="k4-hint">Кадры по порядку: первый, до 8 промежуточных, последний. При длине ' + durSec() + " с кадров до " + L.k4MaxFrames(durSec()) + ".</p>";
      h += '<div class="k4-sub">Первый кадр</div><div class="k4-grid">' + (st.first ? tile("frame", st.first, "") : addTile("first", img, false, "Первый кадр")) + "</div>";
      h += '<div class="k4-sub">Промежуточные кадры</div><div class="k4-grid">' + st.mids.map(function (k, i) { return tile("frame", k, String(i + 1)); }).join("") + addTile("mid", img, true, "Промежуточный кадр") + "</div>";
      h += '<div class="k4-sub">Последний кадр</div><div class="k4-grid">' + (st.last ? tile("frame", st.last, "") : addTile("last", img, false, "Последний кадр")) + "</div>";
    } else {
      h += '<p class="k4-hint">Каждый файл спросит, кто или что это. Персонаж: 2–4 фото с одним именем или одно видео 3–8 с, голос по желанию.</p>';
      h += '<div class="k4-sub">Фото</div><div class="k4-grid">' + st.photoKeys.map(function (k) { return tile("photo", k); }).join("") + addTile("photo", img, true, "Фото: JPG или PNG") + "</div>";
      h += '<div class="k4-sub">Видео</div><div class="k4-grid">' + st.videoKeys.map(function (k) { return tile("video", k); }).join("") + addTile("video", "video/mp4,video/quicktime", true, "Видео: MP4 или MOV, 2–30 с, до 9 МБ") + "</div>";
      if (grouped().videos.length) h += '<div class="toggle-row"><span class="toggle-label">Звук из видео</span><div class="toggle-switch' + (st.keepSound ? " active" : "") + '" role="switch" tabindex="0" aria-checked="' + st.keepSound + '" aria-label="Звук из видео" data-act="keep"></div></div>';
      h += '<div class="k4-sub">Голоса</div><div class="k4-grid">' + st.audioKeys.map(function (k) { return tile("audio", k); }).join("") + addTile("audio", L.K4_AUDIO_MIMES.join(","), true, "Запись голоса: MP3, WAV, M4A или AAC") + "</div>";
    }
    var t = tokens();
    if (t.length) h += '<div class="k4-sub">Вставить в описание</div><div class="chips-container">' + t.map(function (x) { return '<button type="button" class="chip" data-act="ins" data-v="' + esc(x) + '">' + esc(x) + "</button>"; }).join("") + "</div>";
    root.innerHTML = h;
  }

  // ---- вопрос к файлу (окно поверх, вид окон Mini App) ----
  var askEl = null;
  function photoChars(except) {
    var out = [];
    st.photoKeys.forEach(function (k) { var a = st.ans[k]; if (k !== except && a && a.role === "char" && a.name.trim() && out.indexOf(a.name.trim()) === -1) out.push(a.name.trim()); });
    return out;
  }
  function chip(on, act, v, text, disabled, title) {
    return '<button type="button" class="chip' + (on ? " active" : "") + '" data-act="' + act + '" data-v="' + esc(v) + '"' + (disabled ? " disabled" : "") + (title ? ' title="' + esc(title) + '"' : "") + ">" + esc(text) + "</button>";
  }
  function input(field, value, ph, max) {
    return '<input type="text" class="k4-input" data-field="' + field + '" value="' + esc(value || "") + '" placeholder="' + esc(ph) + '" maxlength="' + max + '">';
  }
  function askModel() {
    var key = st.askKey, f = key && st.files[key];
    if (!f) return null;
    var a = st.ans[key], m = { key: key, f: f };
    if (st.photoKeys.indexOf(key) !== -1) {
      var others = photoChars(key), isChar = a && a.role === "char", isNew = isChar && others.indexOf(a.name.trim()) === -1;
      m.title = "Кто или что на фото " + (st.photoKeys.indexOf(key) + 1) + "?"; m.remove = "убрать фото";
      m.can = !!a && (a.role === "ref" || a.name.trim().length > 0);
      m.body = '<div class="chips-container">' + chip(isChar, "pa", "char", "Персонаж") + chip(a && a.role === "ref", "pa", "ref", "Референс") + "</div>" +
        (isChar ? (others.length ? '<div class="chips-container k4-gap">' + others.map(function (n) { return chip(a.name.trim() === n, "join", n, n); }).join("") + "</div>" : "") +
          input("name", a.name, others.length ? "или новое имя, например Кот" : "имя персонажа, например Герой", L.K4_LIMITS.nameLen) +
          (isNew ? '<div class="chips-container k4-gap">' + L.K4_TAGS.map(function (t) { return chip(a.tag === t, "tag", t, TAG_LABEL[t]); }).join("") + "</div>" +
            input("desc", a.description, "короткое описание (необязательно)", L.K4_LIMITS.descLen) : "") : "") +
        (a && a.role === "ref" ? input("name", a.name, "имя для описания (необязательно)", L.K4_LIMITS.nameLen) : "");
    } else if (st.videoKeys.indexOf(key) !== -1) {
      var es = L.K4_LIMITS.elementVideoSec, charOk = f.sec >= es[0] && f.sec <= es[1];
      var taken = a && a.role === "char" && photoChars("").indexOf(a.name.trim()) !== -1;
      m.title = "Что это за видео " + (st.videoKeys.indexOf(key) + 1) + "?"; m.remove = "убрать видео";
      m.can = !!a && (a.role === "ref" || (a.name.trim().length > 0 && !taken));
      m.body = '<div class="chips-container">' + chip(a && a.role === "ref", "va", "ref", "Референс") + chip(a && a.role === "char", "va", "char", "Персонаж", !charOk, charOk ? "" : "Персонаж из видео: ролик от " + es[0] + " до " + es[1] + " с") + "</div>" +
        (a ? input("name", a.name, a.role === "char" ? "имя персонажа" : "имя для описания (необязательно)", L.K4_LIMITS.nameLen) : "") +
        (taken ? '<p class="k4-hint">Это имя уже у персонажа с фото: у персонажа или 2–4 фото, или одно видео</p>' : "");
    } else {
      var g = grouped(), humans = g.elements.filter(function (e) { return e.tag === "character"; }).map(function (e) { return e.name; });
      var voiced = function (n) { return st.audioKeys.some(function (k) { var x = st.ans[k]; return k !== key && x && x.role === "owner" && x.name.trim() === n; }); };
      var own = st.audioKeys.filter(function (k) { var x = st.ans[k]; return k !== key && x && x.role === "voice"; }).length;
      m.title = "Чей это голос?"; m.remove = "убрать запись";
      m.can = !!a && (a.role === "owner" || a.name.trim().length > 0);
      m.body = '<div class="chips-container">' + humans.map(function (n) { return chip(a && a.role === "owner" && a.name === n, "owner", n, n, voiced(n)); }).join("") +
        chip(a && a.role === "voice", "voice", "voice", "Отдельный голос", own >= L.K4_LIMITS.voices) + "</div>" +
        (a && a.role === "voice" ? input("name", a.name, "имя голоса, например Диктор", L.K4_LIMITS.nameLen) : "") +
        (humans.length ? "" : '<p class="k4-hint">Голос персонажа: сначала отметьте фото как «Персонаж» с типом «Человек»</p>');
    }
    return m;
  }
  function renderAsk() {
    if (!askEl) return;
    var m = askModel();
    if (!m) { askEl.classList.remove("show"); askEl.innerHTML = ""; return; }
    var focus = document.activeElement && askEl.contains(document.activeElement) ? document.activeElement.getAttribute("data-field") : null;
    var caret = focus ? document.activeElement.selectionStart : null;
    var head = m.f.url ? '<img class="k4-ask-img" src="' + m.f.url + '" alt="">' : '<div class="k4-ask-img k4-file">' + (m.f.kind === "vid" ? "▶" : "♪") + "</div>";
    askEl.innerHTML = '<div class="block-modal-card k4-ask-card" role="dialog" aria-label="' + esc(m.title) + '"><div class="k4-ask-head">' + head + '<div class="k4-ask-q">' + esc(m.title) + "</div></div>" + m.body +
      '<div class="k4-ask-ops"><button type="button" class="chip" data-act="remove">' + esc(m.remove) + '</button><button type="button" class="chip active" data-act="done"' + (m.can ? "" : " disabled") + ">готово</button></div></div>";
    askEl.classList.add("show");
    if (focus) { var el = askEl.querySelector('[data-field="' + focus + '"]'); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* поле без каретки */ } } }
  }
  function setAns(next) { st.ans[st.askKey] = next; changed(); }
  function nextAsk(after) {
    var all = st.photoKeys.concat(st.videoKeys, st.audioKeys);
    var rest = all.slice(all.indexOf(after) + 1).filter(function (k) { return !st.ans[k]; });
    return rest.length ? rest[0] : null;
  }
  function onAskClick(e) {
    if (e.target === askEl) { st.askKey = null; changed(); return; } // щелчок по подложке закрывает
    var b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    var act = b.getAttribute("data-act"), v = b.getAttribute("data-v"), a = st.ans[st.askKey] || null;
    if (act === "pa") setAns(v === "char" ? { role: "char", name: (a && a.name) || "", tag: a && a.role === "char" ? a.tag : "character", description: a && a.role === "char" ? a.description : undefined } : { role: "ref", name: (a && a.name) || "" });
    else if (act === "join") setAns(Object.assign({}, a, { name: v }));
    else if (act === "tag") setAns(Object.assign({}, a, { tag: v }));
    else if (act === "va") setAns({ role: v, name: (a && a.name) || "" });
    else if (act === "owner") setAns({ role: "owner", name: v });
    else if (act === "voice") setAns({ role: "voice", name: a && a.role === "voice" ? a.name : "" });
    else if (act === "remove") drop(st.askKey);
    else if (act === "done") { st.askKey = nextAsk(st.askKey); changed(); }
  }
  function onAskInput(e) {
    var fld = e.target.getAttribute("data-field"); if (!fld || !st.askKey) return;
    var a = Object.assign({}, st.ans[st.askKey]);
    if (fld === "desc") a.description = e.target.value; else a.name = e.target.value;
    setAns(a);
  }

  function onPanelClick(e) {
    var b = e.target.closest("[data-act]"); if (!b || !root.contains(b)) return;
    var act = b.getAttribute("data-act"), k = b.getAttribute("data-k");
    if (act === "drop") { e.stopPropagation(); drop(k); }
    else if (act === "ask" && k) { st.askKey = k; changed(); }
    else if (act === "mode") { st.mode = b.getAttribute("data-v"); st.askKey = null; changed(); }
    else if (act === "keep") { st.keepSound = !st.keepSound; changed(); }
    else if (act === "ins" && opts.prompt) {
      var ta = opts.prompt, s = ta.selectionStart != null ? ta.selectionStart : ta.value.length, en = ta.selectionEnd != null ? ta.selectionEnd : s;
      var add = (s > 0 && !/\s$/.test(ta.value.slice(0, s)) ? " " : "") + b.getAttribute("data-v") + " ";
      ta.value = ta.value.slice(0, s) + add + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + add.length;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function onPanelChange(e) {
    if (e.target.matches('input[type="file"][data-target]')) { var t = e.target.getAttribute("data-target"), fs = e.target.files; pick(fs, t); }
  }

  window.K4MiniApp = {
    /** Подключить панель: el = секция, prompt = поле описания, getDurationSec, onChange (перепроверка формы). */
    mount: function (el, o) {
      opts = o || {};
      if (root !== el) { root = el; root.addEventListener("click", onPanelClick); root.addEventListener("change", onPanelChange); }
      if (!askEl) {
        askEl = document.createElement("div"); askEl.className = "block-modal k4-ask"; document.body.appendChild(askEl);
        askEl.addEventListener("click", onAskClick); askEl.addEventListener("input", onAskInput);
      }
      render(); renderAsk();
    },
    /** Новый заход на Kling 4.0: панель пустая. */
    reset: function () { st = fresh(); render(); renderAsk(); },
    /** Почему нельзя отправить (null = можно): тот же разбор, что у сайта и бота. */
    blockReason: function (prompt, durationSec) {
      var o = order();
      return L.k4BlockReason({ pult: pultOf(o), image_uploads: o.imageKeys, video_uploads: o.videoKeys, audio_uploads: o.audioKeys }, durationSec, prompt || "");
    },
    /** Файлы на tus по порядку заказа и поля заказа (как у сайта). upload(blob, onLoaded) → {id, size}; progress(pct). */
    buildPayload: async function (upload, progress) {
      var o = order(), keys = o.imageKeys.concat(o.videoKeys, o.audioKeys), refs = {};
      var total = keys.reduce(function (s, k) { return s + st.files[k].file.size; }, 0), done = {};
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], f = st.files[k].file;
        var r = await upload(f, function (l) { done[k] = l; if (progress) progress(total ? Math.min(100, Math.floor(Object.keys(done).reduce(function (s, x) { return s + done[x]; }, 0) * 100 / total)) : 100); });
        refs[k] = { id: r.id, size: r.size, mime: f.type || "application/octet-stream" };
      }
      var map = function (list) { return list.map(function (k) { return refs[k]; }); };
      var fields = { image_uploads: map(o.imageKeys), video_uploads: map(o.videoKeys), audio_uploads: map(o.audioKeys), pult: pultOf(o) };
      if (keepSoundOn(o)) fields.keep_original_sound = true;
      return fields;
    },
    /** Для проверки и показа: текущий заказ без загрузки. */
    preview: function () { var o = order(); return { pult: pultOf(o), images: o.imageKeys.length, videos: o.videoKeys.length, audios: o.audioKeys.length, keep_original_sound: keepSoundOn(o) || undefined }; },
  };
})();
