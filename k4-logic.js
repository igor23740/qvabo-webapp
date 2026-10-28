// Собрано из qvabolanding/web/lib/cabinet/kling4-pult.ts (коммит f56fbe1) — правила Kling 4.0 те же, что у сайта и ноды K4 Prep бота. Руками не править: пересобрать командой из README (esbuild --format=iife --global-name=K4Logic).
"use strict";
var K4Logic = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // D:/qvabolanding-wt/masterskaya/web/lib/cabinet/kling4-pult.ts
  var kling4_pult_exports = {};
  __export(kling4_pult_exports, {
    K4_AUDIO_MAX_BYTES: () => K4_AUDIO_MAX_BYTES,
    K4_AUDIO_MIMES: () => K4_AUDIO_MIMES,
    K4_LIMITS: () => K4_LIMITS,
    K4_TAGS: () => K4_TAGS,
    KLING4_SLUG: () => KLING4_SLUG,
    isKling4Model: () => isKling4Model,
    k4BilledSec: () => k4BilledSec,
    k4BlockReason: () => k4BlockReason,
    k4DurationSec: () => k4DurationSec,
    k4Group: () => k4Group,
    k4MaxFrames: () => k4MaxFrames,
    k4MentionIssue: () => k4MentionIssue,
    k4Points: () => k4Points,
    parseKling4Pult: () => parseKling4Pult
  });
  var KLING4_SLUG = "kling-4";
  function isKling4Model(slug) {
    return slug === KLING4_SLUG;
  }
  var K4_LIMITS = {
    refImages: 10,
    photosTotal: 38,
    elements: 7,
    videoElements: 3,
    elementPhotosMin: 2,
    elementPhotosMax: 4,
    elementVideoSec: [3, 8],
    videos: 5,
    videoSec: [2, 30],
    videoTotalSec: 30,
    voices: 3,
    audios: 10,
    materials: 15,
    midFrames: 8,
    maxFrames: 10,
    nameLen: 40,
    descLen: 100,
    durationSec: [3, 30]
  };
  var K4_TAGS = ["character", "animal", "prop", "costume", "scene", "effect", "others"];
  var K4_AUDIO_MIMES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/x-m4a", "audio/aac"];
  var K4_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
  function k4MaxFrames(durationSec) {
    return Math.min(K4_LIMITS.maxFrames, durationSec + 1);
  }
  function k4Group(photos, videos, audios) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    const out = { refs: [], videos: [], elements: [], voices: [] };
    const el = (name, tag, description = "") => {
      let e = out.elements.find((x) => x.name === name);
      if (!e) {
        e = { name, tag, description, photos: [] };
        out.elements.push(e);
      }
      return e;
    };
    for (const p of photos) {
      const name = (_c = (_b = (_a = p.ans) == null ? void 0 : _a.name) == null ? void 0 : _b.trim()) != null ? _c : "";
      if (((_d = p.ans) == null ? void 0 : _d.role) === "char" && name) el(name, p.ans.tag, (_f = (_e = p.ans.description) == null ? void 0 : _e.trim()) != null ? _f : "").photos.push(p.key);
      else out.refs.push({ key: p.key, name: ((_g = p.ans) == null ? void 0 : _g.role) === "ref" ? name : "" });
    }
    for (const v of videos) {
      const name = (_j = (_i = (_h = v.ans) == null ? void 0 : _h.name) == null ? void 0 : _i.trim()) != null ? _j : "";
      const e = ((_k = v.ans) == null ? void 0 : _k.role) === "char" && name ? el(name, "character") : null;
      if (e && !e.video) e.video = v.key;
      else out.videos.push({ key: v.key, name: ((_l = v.ans) == null ? void 0 : _l.role) === "ref" ? name : "" });
    }
    for (const a of audios) {
      const name = (_n = (_m = a.ans) == null ? void 0 : _m.name.trim()) != null ? _n : "";
      if (!name) continue;
      if (((_o = a.ans) == null ? void 0 : _o.role) === "voice") out.voices.push({ name, audio: a.key });
      else {
        const e = out.elements.find((x) => x.name === name);
        if (e && !e.voice) e.voice = a.key;
      }
    }
    return out;
  }
  function k4DurationSec(duration) {
    const m = /^(\d+)s$/.exec(String(duration != null ? duration : "").trim());
    return m ? Number(m[1]) : 5;
  }
  var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  function optName(v) {
    if (v === void 0) return void 0;
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (s.length > K4_LIMITS.nameLen) return null;
    return s.length ? s : void 0;
  }
  function parseKling4Pult(raw, counts) {
    const bad = (error) => ({ ok: false, error });
    if (raw === void 0) raw = { v: 1, photos: [], videos: [], audios: [], elements: [] };
    if (!isObj(raw) || raw.v !== 1) return bad("bad_params");
    const arr = (k) => raw[k] === void 0 ? [] : raw[k];
    const photosRaw = arr("photos"), videosRaw = arr("videos"), audiosRaw = arr("audios"), elementsRaw = arr("elements");
    if (!Array.isArray(photosRaw) || !Array.isArray(videosRaw) || !Array.isArray(audiosRaw) || !Array.isArray(elementsRaw)) return bad("bad_params");
    if (photosRaw.length !== counts.images || videosRaw.length !== counts.videos || audiosRaw.length !== counts.audios) return bad("bad_params");
    if (counts.images > K4_LIMITS.photosTotal || counts.videos > K4_LIMITS.videos || counts.audios > K4_LIMITS.audios) return bad("bad_params");
    const elements = [];
    const elByName = /* @__PURE__ */ new Map();
    for (const e of elementsRaw) {
      if (!isObj(e)) return bad("bad_params");
      const name = optName(e.name);
      if (!name) return bad("bad_params");
      const key = name.toLowerCase();
      if (elByName.has(key)) return bad("k4_duplicate_name");
      let tag;
      if (e.tag !== void 0) {
        if (typeof e.tag !== "string" || !K4_TAGS.includes(e.tag)) return bad("bad_params");
        tag = e.tag;
      }
      let description;
      if (e.description !== void 0) {
        if (typeof e.description !== "string" || e.description.trim().length > K4_LIMITS.descLen) return bad("bad_params");
        description = e.description.trim() || void 0;
      }
      elements.push({ name, ...tag ? { tag } : {}, ...description ? { description } : {} });
      elByName.set(key, { imgs: 0, vids: 0, voice: 0, tag });
    }
    if (elements.length > K4_LIMITS.elements) return bad("bad_params");
    const owner = (v) => {
      const n = optName(v);
      if (n === null) return { ok: false };
      if (n === void 0) return { ok: true };
      return elByName.has(n.toLowerCase()) ? { ok: true, key: n.toLowerCase() } : { ok: false };
    };
    const photos = [];
    let first = 0, last = 0, mid = 0, plainImg = 0;
    for (const p of photosRaw) {
      if (!isObj(p)) return bad("bad_params");
      const out = {};
      if (p.frame !== void 0) {
        if (p.frame !== "first" && p.frame !== "mid" && p.frame !== "last") return bad("bad_params");
        out.frame = p.frame;
      }
      const name = optName(p.name);
      if (name === null) return bad("bad_params");
      if (name) out.name = name;
      const own = owner(p.element);
      if (!own.ok) return bad("bad_params");
      if (own.key) {
        if (out.frame) return bad("bad_params");
        out.element = elements.find((e) => e.name.toLowerCase() === own.key).name;
        elByName.get(own.key).imgs++;
      } else if (out.frame === "first") first++;
      else if (out.frame === "last") last++;
      else if (out.frame === "mid") mid++;
      else plainImg++;
      photos.push(out);
    }
    if (first > 1 || last > 1 || mid > K4_LIMITS.midFrames) return bad("bad_params");
    const videos = [];
    let plainVid = 0, vidEls = 0, totalSec = 0;
    for (const v of videosRaw) {
      if (!isObj(v)) return bad("bad_params");
      const sec = v.sec;
      if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return bad("bad_params");
      const s = Math.round(sec * 10) / 10;
      const out = { sec: s };
      const name = optName(v.name);
      if (name === null) return bad("bad_params");
      if (name) out.name = name;
      const own = owner(v.element);
      if (!own.ok) return bad("bad_params");
      if (own.key) {
        const el = elByName.get(own.key);
        if (s < K4_LIMITS.elementVideoSec[0] || s > K4_LIMITS.elementVideoSec[1]) return bad("k4_element_video_sec");
        if (el.tag && el.tag !== "character") return bad("bad_params");
        el.vids++;
        out.element = elements.find((e) => e.name.toLowerCase() === own.key).name;
      } else {
        if (s < K4_LIMITS.videoSec[0] || s > K4_LIMITS.videoSec[1]) return bad("k4_video_sec");
        plainVid++;
      }
      totalSec += s;
      videos.push(out);
    }
    if (totalSec > K4_LIMITS.videoTotalSec + 0.05) return bad("k4_video_total_sec");
    const audios = [];
    let voices = 0;
    for (const a of audiosRaw) {
      if (!isObj(a)) return bad("bad_params");
      const out = {};
      const own = owner(a.element);
      if (!own.ok) return bad("bad_params");
      if (own.key) {
        const el = elByName.get(own.key);
        if (el.voice > 0 || el.tag && el.tag !== "character") return bad("bad_params");
        el.voice++;
        out.element = elements.find((e) => e.name.toLowerCase() === own.key).name;
      } else {
        const name = optName(a.name);
        if (!name) return bad("bad_params");
        out.name = name;
        voices++;
      }
      audios.push(out);
    }
    for (const el of elByName.values()) {
      if (el.vids > 1 || el.vids === 1 && el.imgs > 0) return bad("bad_params");
      if (el.vids === 0 && (el.imgs < K4_LIMITS.elementPhotosMin || el.imgs > K4_LIMITS.elementPhotosMax)) return bad("k4_element_photos");
      if (el.vids === 1) vidEls++;
    }
    const hasFrames = first + mid + last > 0;
    if (hasFrames && (plainImg || videos.length || elements.length || audios.length)) return bad("k4_frames_conflict");
    if (hasFrames && first + mid + last > k4MaxFrames(counts.duration)) return bad("k4_too_many_frames");
    if (plainImg > K4_LIMITS.refImages || vidEls > K4_LIMITS.videoElements || plainVid + vidEls > K4_LIMITS.videos || voices > K4_LIMITS.voices) return bad("bad_params");
    if (plainImg + plainVid + elements.length + voices > K4_LIMITS.materials) return bad("k4_too_many_materials");
    const seen = /* @__PURE__ */ new Set();
    const names = [...elements.map((e) => e.name), ...audios.filter((a) => !a.element).map((a) => a.name), ...photos.filter((p) => !p.element && p.name).map((p) => p.name), ...videos.filter((v) => !v.element && v.name).map((v) => v.name)];
    for (const n of names) {
      const k = n.toLowerCase();
      if (seen.has(k)) return bad("k4_duplicate_name");
      seen.add(k);
    }
    return { ok: true, value: { v: 1, photos, videos, audios, elements } };
  }
  function k4BilledSec(durationSec, videoSecs) {
    const vin = videoSecs.reduce((s, x) => s + (Number(x) || 0), 0);
    if (vin <= 0) return durationSec;
    return vin <= durationSec ? durationSec * 2 : Math.round((vin + durationSec) * 10) / 10;
  }
  function k4Points(w, resolution, durationSec, videoSecs) {
    const r = resolution === "1080p" ? "1080p" : "720p";
    const d = Math.max(K4_LIMITS.durationSec[0], Math.min(K4_LIMITS.durationSec[1], Math.round(durationSec)));
    const hasVideo = videoSecs.some((x) => (Number(x) || 0) > 0);
    const rate = hasVideo ? w.per_sec_video[r] : w.per_sec[r];
    return Math.max(1, Math.round(rate * k4BilledSec(d, hasVideo ? videoSecs : [])));
  }
  function k4BlockReason(params, durationSec, prompt = "") {
    var _a;
    const len = (v) => Array.isArray(v) ? v.length : 0;
    const r = parseKling4Pult(params.pult, { images: len(params.image_uploads), videos: len(params.video_uploads), audios: len(params.audio_uploads), duration: durationSec });
    if (r.ok) {
      const bad = k4MentionIssue(prompt, r.value);
      return bad ? `\u0412 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \xAB${bad}\xBB, \u0430 \u0442\u0430\u043A\u043E\u0433\u043E \u0444\u043E\u0442\u043E, \u0432\u0438\u0434\u0435\u043E, \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0438\u043B\u0438 \u0433\u043E\u043B\u043E\u0441\u0430 \u043D\u0435\u0442` : null;
    }
    const T = {
      k4_element_photos: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0443 \u043D\u0443\u0436\u043D\u043E \u043E\u0442 2 \u0434\u043E 4 \u0444\u043E\u0442\u043E \u0438\u043B\u0438 \u043E\u0434\u043D\u043E \u0432\u0438\u0434\u0435\u043E",
      k4_element_video_sec: "\u0412\u0438\u0434\u0435\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430: \u043E\u0442 3 \u0434\u043E 8 \u0441\u0435\u043A\u0443\u043D\u0434",
      k4_video_sec: "\u0412\u0438\u0434\u0435\u043E-\u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441: \u043E\u0442 2 \u0434\u043E 30 \u0441\u0435\u043A\u0443\u043D\u0434",
      k4_video_total_sec: "\u0412\u0441\u0435 \u0432\u0438\u0434\u0435\u043E \u0432\u043C\u0435\u0441\u0442\u0435: \u043D\u0435 \u0434\u043E\u043B\u044C\u0448\u0435 30 \u0441\u0435\u043A\u0443\u043D\u0434",
      k4_frames_conflict: "\u041A\u043B\u044E\u0447\u0435\u0432\u044B\u0435 \u043A\u0430\u0434\u0440\u044B \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442 \u0431\u0435\u0437 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u043E\u0432, \u0432\u0438\u0434\u0435\u043E, \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439 \u0438 \u0433\u043E\u043B\u043E\u0441\u043E\u0432",
      k4_too_many_frames: `\u041F\u0440\u0438 \u0434\u043B\u0438\u043D\u0435 ${durationSec} \u0441 \u043A\u0430\u0434\u0440\u043E\u0432 \u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 ${k4MaxFrames(durationSec)}`,
      k4_too_many_materials: "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0432\u0441\u0435\u0433\u043E \u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 15",
      k4_duplicate_name: "\u0418\u043C\u0435\u043D\u0430 \u0444\u043E\u0442\u043E, \u0432\u0438\u0434\u0435\u043E, \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439 \u0438 \u0433\u043E\u043B\u043E\u0441\u043E\u0432 \u043D\u0435 \u0434\u043E\u043B\u0436\u043D\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C\u0441\u044F"
    };
    return (_a = T[r.error]) != null ? _a : "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B: \u0447\u0442\u043E-\u0442\u043E \u043D\u0435 \u043F\u043E \u043F\u0440\u0430\u0432\u0438\u043B\u0430\u043C Kling 4.0";
  }
  var K4_NAME_CH = "A-Za-z\u0410-\u042F\u0430-\u044F\u0401\u04510-9_";
  var reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function k4MentionIssue(prompt, pult) {
    const frames = pult.photos.some((p) => p.frame);
    const user = [];
    const kie = /* @__PURE__ */ new Set();
    let img = 0, mid = 0, vid = 0;
    pult.photos.forEach((p, i) => {
      if (p.element) return;
      user.push(`@Image${i + 1}`);
      if (p.name) user.push(`@${p.name}`);
      if (p.frame === "first") kie.add("first_frame");
      else if (p.frame === "last") kie.add("last_frame");
      else if (p.frame === "mid") kie.add(`keyframe_${++mid}`);
      else kie.add(`image_${++img}`);
    });
    pult.videos.forEach((v, k) => {
      if (v.element) return;
      user.push(`@Video${k + 1}`);
      if (v.name) user.push(`@${v.name}`);
      kie.add(`video_${++vid}`);
    });
    pult.elements.forEach((e, j) => {
      user.push(`@${e.name}`);
      kie.add(`Char${j + 1}`);
    });
    let voice = 0;
    pult.audios.forEach((a) => {
      if (!a.element && a.name) {
        user.push(`@${a.name}`);
        kie.add(`Voice${++voice}`);
      }
    });
    if (frames) {
      for (const k of [...kie]) if (/^(image|video)_|^Char|^Voice/.test(k)) kie.delete(k);
    }
    let t = prompt;
    for (const u of [...user].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(reEsc(u) + `(?![${K4_NAME_CH}])`, "g"), " ");
    const re = new RegExp(`@([${K4_NAME_CH}]+)`, "g");
    let m;
    while ((m = re.exec(t)) !== null) if (!kie.has(m[1])) return `@${m[1]}`;
    return null;
  }
  return __toCommonJS(kling4_pult_exports);
})();
