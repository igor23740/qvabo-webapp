// Debug flag — keep false in production. Wrap any diagnostics in `if (DEBUG)`.
// Never log initData / initDataUnsafe / payload — they carry the signed Telegram session.
const DEBUG = false;

// Initialize Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// State
let uploadedImages = [];
let selectedAspectRatio = '1:1';
let selectedResolution = '1K';
let selectedCount = '1';
let selectedModel = 'nano-banana-pro';
let currentMode = 'image';
let selectedDuration = '8s';
let generateAudio = true;
let reveFast = false;

// Elements
const promptInput = document.getElementById('promptInput');
const charCount = document.getElementById('charCount');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const imagePreviews = document.getElementById('imagePreviews');
const imageCount = document.getElementById('imageCount');
const generateBtn = document.getElementById('generateBtn');
const validationMessage = document.getElementById('validationMessage');
const improveBtn = document.getElementById('improveBtn');
const toast = document.getElementById('toast');

// Character counter
promptInput.addEventListener('input', () => {
    charCount.textContent = promptInput.value.length;
    updateValidation();
});

// Активация по клавиатуре (Enter / Space) — выполняет ту же логику, что и клик
function onActivateKey(handler) {
    return function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            handler(e);
        }
    };
}

// Upload area
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('keydown', onActivateKey(() => fileInput.click()));

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

function handleFiles(files) {
    const maxFiles = (modelConfigs[selectedModel] && modelConfigs[selectedModel].maxFiles) || 10;
    const remaining = maxFiles - uploadedImages.length;
    const toAdd = Array.from(files).slice(0, Math.max(0, remaining));

    toAdd.forEach(file => {
        if (!file.type.startsWith('image/')) {
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            showToast('Фото больше 10 МБ — выберите меньше', 'error');
            return;
        }
        {
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedImages.push({
                    file: file,
                    dataUrl: e.target.result
                });
                updateImagePreviews();
            };
            reader.readAsDataURL(file);
        }
    });
}

function updateImagePreviews() {
    // DOM API вместо innerHTML с интерполяцией data-URL и inline onclick:
    // data-URL не попадает в HTML-парсер, обработчик удаления — через addEventListener.
    imagePreviews.textContent = '';
    uploadedImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';

        const imgEl = document.createElement('img');
        imgEl.width = 80;
        imgEl.height = 80;
        imgEl.src = img.dataUrl;
        imgEl.alt = 'Preview';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preview-remove';
        btn.textContent = '×';
        btn.setAttribute('aria-label', 'Удалить изображение');
        btn.addEventListener('click', () => removeImage(index));

        item.appendChild(imgEl);
        item.appendChild(btn);
        imagePreviews.appendChild(item);
    });
    // @ts-expect-error TS2322 — DOM принимает textContent=number через неявный toString()
    // на рантайме (стандартное поведение сеттера textContent), но lib.dom.d.ts объявляет
    // его строго string|null. Не баг, просто более узкий тип DOM-либы, чем реальный сеттер.
    imageCount.textContent = uploadedImages.length;
    updateValidation();
}

function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateImagePreviews();
}


// === Model-dependent parameter switching ===
const modelConfigs = {
    'nano-banana-pro': {
        aspectRatios: [
            {value:'auto',icon:'▢'}, {value:'21:9',icon:'▬'}, {value:'16:9',icon:'▬'},
            {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'5:4',icon:'▢'},
            {value:'1:1',icon:'▢'}, {value:'4:5',icon:'▯'}, {value:'3:4',icon:'▯'},
            {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'1K', label:'1K'},
            {value:'2K', label:'2K'},
            {value:'4K', label:'4K'}
        ],
        defaultAspect: '1:1',
        defaultRes: '1K'
    },
    'gpt-image-2': {
        aspectRatios: [
            {value:'auto',icon:'▢'}, {value:'21:9',icon:'▬'}, {value:'16:9',icon:'▬'},
            {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'5:4',icon:'▢'},
            {value:'1:1',icon:'▢'}, {value:'4:5',icon:'▯'}, {value:'3:4',icon:'▯'},
            {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'1K', label:'1K'},
            {value:'2K', label:'2K'},
            {value:'4K', label:'4K'}
        ],
        defaultAspect: '1:1',
        defaultRes: '1K'
    },
    'flux-2-pro': {
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'},
            {value:'1:1',icon:'▢'}, {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'},
            {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'1K', label:'1K'},
            {value:'2K', label:'2K'}
        ],
        defaultAspect: '1:1',
        defaultRes: '1K'
    },
    'seedream-5': {
        aspectRatios: [
            {value:'auto',icon:'▢'}, {value:'21:9',icon:'▬'}, {value:'16:9',icon:'▬'},
            {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'5:4',icon:'▢'},
            {value:'1:1',icon:'▢'}, {value:'4:5',icon:'▯'}, {value:'3:4',icon:'▯'},
            {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'1K', label:'1K'},
            {value:'2K', label:'2K'},
            {value:'4K', label:'4K'}
        ],
        defaultAspect: '1:1',
        defaultRes: '1K'
    },
    'grok': {
        // [DOC kie.ai grok-imagine] t2i: только aspect_ratio (1:1,16:9,9:16,2:3,3:2),
        // НЕТ resolution; i2i — 1 референс. resolutions:[] -> блок Resolution скрывается.
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'3:2',icon:'▬'},
            {value:'1:1',icon:'▢'},
            {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [],
        defaultAspect: '1:1',
        defaultRes: null
    },
    'ideogram-v3': {
        // [DOC kie.ai ideogram/v3] НЕТ resolution/4K: размер только через image_size enum (маппинг на бэке).
        // rendering_speed=BALANCED фиксируется в Kie Mapper. resolutions:[] -> блок Resolution = note.
        // textOnly: i2i-режимы Ideogram (remix/character) у kie дают 500 — загрузка фото скрыта, только t2i.
        textOnly: true,
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'4:3',icon:'▬'},
            {value:'1:1',icon:'▢'},
            {value:'3:4',icon:'▯'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [],
        defaultAspect: '1:1',
        defaultRes: null
    },
    'reve': {
        // Reve Create (t2i) НАПРЯМУЮ через api.reve.com (мимо kie). API: только aspect_ratio (7 значений), БЕЗ resolution.
        // Режим по числу фото: 0 = Create (t2i), 1 = Edit (фото+инструкция), 2-6 = Remix. Фото опционально.
        // ⚠️ API-версия = reve-create@20250915 (сентябрь). Reve 2.0 (хорошая кириллица) пока ТОЛЬКО в вебе, не в API.
        isReve: true,
        promptLimit: 2560,  // Reve API жёстко режет prompt на 2560 символов (иначе HTTP 400)
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'},
            {value:'1:1',icon:'▢'}, {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'},
            {value:'9:16',icon:'▯'}
        ],
        resolutions: [],
        defaultAspect: '1:1',
        defaultRes: null
    },
    'recraft-removebg': {
        // [DOC kie.ai recraft/remove-background] утилита: вход только image (URL), без промпта/форматов.
        // utility -> скрыть промпт/формат/разрешение/количество; requiresReference -> фото обязательно.
        utility: true,
        noPrompt: true,
        requiresReference: true,
        uploadHint: 'Загрузите 1 фото — уберём фон и вернём PNG с прозрачностью.',
        aspectRatios: [],
        resolutions: [],
        defaultAspect: null,
        defaultRes: null
    },
    'recraft-upscale': {
        // [DOC kie.ai recraft/crisp-upscale] утилита: вход только image, увеличивает до ~4K (множитель не задаётся).
        utility: true,
        noPrompt: true,
        requiresReference: true,
        uploadHint: 'Загрузите 1 фото (лучше не огромное) — увеличим до ~4K. Очень тяжёлые результаты Telegram может не принять.',
        aspectRatios: [],
        resolutions: [],
        defaultAspect: null,
        defaultRes: null
    },
    'veo-3.1': {
        apiSlug: 'veo-3.1',
        provider: 'google',
        audioToggle: false,
        aspectRatios: [
            {value:'1:1',icon:'▢'}, {value:'16:9',icon:'▬'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'720p', label:'720p'},
            {value:'1080p', label:'1080p'},
            {value:'4k', label:'4K'}
        ],
        durations: [
            {value:'4s', label:'4s'},
            {value:'6s', label:'6s'},
            {value:'8s', label:'8s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '720p',
        defaultDuration: '8s'
    },
    'seedance-2-fast': {
        apiSlug: 'bytedance/seedance-2.0-fast',
        provider: 'openrouter',
        audioToggle: true,
        aspectRatios: [
            {value:'1:1',icon:'▢'}, {value:'16:9',icon:'▬'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'480p', label:'480p'},
            {value:'720p', label:'720p'}
        ],
        durations: [
            {value:'5s', label:'5s'},
            {value:'10s', label:'10s'},
            {value:'15s', label:'15s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '720p',
        defaultDuration: '15s'
    },
    'seedance-2-mini': {
        apiSlug: 'seedance-2-mini',
        provider: 'kie',
        audioToggle: true,
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'1:1',icon:'▢'},
            {value:'3:4',icon:'▯'}, {value:'9:16',icon:'▯'}, {value:'adaptive',icon:'▢'}
        ],
        resolutions: [
            {value:'480p', label:'480p'},
            {value:'720p', label:'720p'}
        ],
        durations: [
            {value:'4s', label:'4s'}, {value:'5s', label:'5s'}, {value:'6s', label:'6s'},
            {value:'7s', label:'7s'}, {value:'8s', label:'8s'}, {value:'9s', label:'9s'},
            {value:'10s', label:'10s'}, {value:'11s', label:'11s'}, {value:'12s', label:'12s'},
            {value:'13s', label:'13s'}, {value:'14s', label:'14s'}, {value:'15s', label:'15s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '720p',
        defaultDuration: '5s',
        showcase: { logo: 'bytedance.png?v=1', video: 'seedance-preview.mp4', sub: 'Пример — ролик по раскадровке (мотозаезд)' }
    },
    'grok-video': {
        apiSlug: 'grok-video',
        provider: 'kie',
        audioToggle: false,   // у Grok звук нативный, тумблера нет
        requiresReference: true,   // Grok 1.5 = image-to-video: фото обязательно
        maxFiles: 1,               // Grok API принимает максимум 1 изображение (<= 1 items)
        refHint: 'Модель Grok Imagine Video 1.5 работает только с одним изображением. Загрузите 1 фото или раскадровку — Grok оживит его в видео; без фото генерация не начнётся.',
        notice: '⚡️ Высокий спрос на новинку — возможны задержки и редкие осечки. За неудачу баллы вернём автоматически.',
        aspectRatios: [
            {value:'auto',icon:'▢'}, {value:'16:9',icon:'▬'}, {value:'9:16',icon:'▯'},
            {value:'1:1',icon:'▢'}, {value:'4:3',icon:'▬'}, {value:'3:4',icon:'▯'},
            {value:'3:2',icon:'▬'}, {value:'2:3',icon:'▯'}
        ],
        resolutions: [
            {value:'480p', label:'480p'},
            {value:'720p', label:'720p'}
        ],
        durations: [
            {value:'1s', label:'1s'}, {value:'2s', label:'2s'}, {value:'3s', label:'3s'},
            {value:'4s', label:'4s'}, {value:'5s', label:'5s'}, {value:'6s', label:'6s'},
            {value:'7s', label:'7s'}, {value:'8s', label:'8s'}, {value:'9s', label:'9s'},
            {value:'10s', label:'10s'}, {value:'11s', label:'11s'}, {value:'12s', label:'12s'},
            {value:'13s', label:'13s'}, {value:'14s', label:'14s'}, {value:'15s', label:'15s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '480p',
        defaultDuration: '5s',
        showcase: { logo: 'grok.png', video: 'grok-preview.mp4', sub: 'Пример — оживление раскадровки в видео' }
    }
};

// Video aspect ratios (only these 3 active in video mode)
const videoAspectRatios = ['1:1', '16:9', '9:16'];

// Видео-режим открыт только для своих (whitelist). Остальным — заглушка.
// Это косметический гейт; реальная защита — Access Gate на бэкенде.
// ДУБЛЬ: та же константа продублирована в tariffs.js:141 (независимая копия для
// страницы тарифов, скрывающая план «Для видео»). Код не трогаем (правило проекта —
// только комментарии), но держать оба списка синхронными вручную при правке whitelist.
const VIDEO_WHITELIST = [371324849, 369287553];
function isVideoWhitelisted() {
    try {
        const uid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
        return VIDEO_WHITELIST.includes(Number(uid));
    } catch (e) { return false; }
}

// Mode switching
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));

    const isVideo = mode === 'video';

    // Video tab: рабочая только для whitelist (свои). Остальным — заглушка «скоро».
    const mainWork = document.getElementById('mainWork');
    const videoPh = document.getElementById('videoPlaceholder');
    const videoEnabled = isVideo && isVideoWhitelisted();
    if (isVideo && !videoEnabled) {
        if (mainWork) mainWork.classList.add('hidden');
        if (videoPh) videoPh.classList.remove('hidden');
        generateBtn.style.display = 'none';
        document.getElementById('headerTitle').textContent = '🎬 AI Video Generator';
        document.getElementById('headerDesc').textContent = 'Раздел видео скоро откроется — мы его готовим.';
        return;
    }
    if (mainWork) mainWork.classList.remove('hidden');
    if (videoPh) videoPh.classList.add('hidden');
    generateBtn.style.display = '';

    // Header
    document.getElementById('headerTitle').textContent = isVideo ? '🎬 AI Video Generator' : '🎨 AI Image Generator';
    document.getElementById('headerDesc').textContent = isVideo
        ? 'Генерируйте видео с помощью AI. Text-to-video и Image-to-video.'
        : 'Создавайте потрясающие изображения с помощью передовых технологий искусственного интеллекта. Превращайте свои идеи в визуальные шедевры.';

    // Show/hide sections
    document.getElementById('countSection').classList.toggle('hidden', isVideo);
    document.getElementById('durationSection').classList.toggle('hidden', !isVideo);
    // audioSection visibility is now driven by per-model config.audioToggle in updateModelParams()

    // Upload label
    const uploadTitle = document.querySelector('#uploadSection .section-title');
    if (uploadTitle) {
        uploadTitle.textContent = isVideo ? 'Загрузить изображение (Optional)' : 'Загрузить изображения (Optional)';
    }
    const uploadHint = document.querySelector('#uploadSection p');
    if (uploadHint) {
        uploadHint.textContent = isVideo ? 'Загрузите 1 изображение для Image-to-Video.' : 'Можно загрузить до 10 изображений.';
    }

    // Model dropdown — show/hide options by mode
    document.querySelectorAll('#modelDropdown .dropdown-option').forEach(opt => {
        const optMode = opt.dataset.mode || 'image';
        opt.style.display = (optMode === mode || optMode === 'both') ? '' : 'none';
    });

    // Auto-select first visible model
    if (isVideo) {
        selectedModel = 'seedance-2-mini';
        document.getElementById('modelName').textContent = 'Seedance 2.0 Mini';
        document.getElementById('modelDesc').textContent = 'ByteDance · Видео';
        const iconEl = document.querySelector('#modelDropdown .dropdown-selected .model-icon');
        iconEl.className = 'model-icon seedance';
        iconEl.textContent = 'S';
    } else {
        selectedModel = 'nano-banana-pro';
        document.getElementById('modelName').textContent = 'Nano-Banana 2';
        document.getElementById('modelDesc').textContent = 'Google Gemini · Рендеринг текста';
        const iconEl = document.querySelector('#modelDropdown .dropdown-selected .model-icon');
        iconEl.className = 'model-icon google';
        iconEl.textContent = 'G';
    }

    updateModelParams(selectedModel);

    // Generate button text
    generateBtn.innerHTML = isVideo
        ? '<span>🎬</span><span>Generate Video</span>'
        : '<span>✨</span><span>Generate</span>';

    // Validation text
    document.getElementById('validationText').textContent = isVideo
        ? 'Пожалуйста, предоставьте описание видео для генерации'
        : 'Пожалуйста, предоставьте описание изображения для генерации';
}

// Tab click handlers
document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

function updateModelParams(model) {
    const config = modelConfigs[model] || modelConfigs['nano-banana-pro'];

    // --- Per-model notice (e.g. Grok high-demand warning) ---
    const noticeEl = document.getElementById('modelNotice');
    if (noticeEl) {
        if (config.notice) { noticeEl.textContent = config.notice; noticeEl.style.display = 'block'; }
        else { noticeEl.style.display = 'none'; }
    }

    // --- Витрина модели (лого + пример-ролик), напр. Grok video ---
    const showcaseEl = document.getElementById('modelShowcase');
    if (showcaseEl) {
        if (config.showcase) {
            const lg = document.getElementById('showcaseLogo');
            const vd = document.getElementById('showcaseVideo');
            const sb = document.getElementById('showcaseSub');
            if (lg) lg.style.backgroundImage = "url('" + config.showcase.logo + "')";
            if (sb) sb.textContent = config.showcase.sub || 'Пример работы модели';
            if (vd) {
                if (config.showcase.video) {
                    if (vd.getAttribute('src') !== config.showcase.video) vd.src = config.showcase.video;
                    vd.style.display = '';
                    const pp = vd.play(); if (pp && pp.catch) pp.catch(function () {});
                } else {
                    vd.pause(); vd.removeAttribute('src'); vd.style.display = 'none';
                }
            }
            showcaseEl.style.display = 'flex';
        } else {
            const vd = document.getElementById('showcaseVideo');
            if (vd) { vd.pause(); vd.removeAttribute('src'); }
            showcaseEl.style.display = 'none';
        }
    }

    // --- Per-model prompt length limit ---
    // Reve API hard-caps the prompt at 2560 chars (HTTP 400 otherwise). Other models default to 5000.
    // Enforce in the field (maxlength blocks typing past the cap), reflect the cap in the counter,
    // and show an explicit note under the prompt so nobody pastes a longer prompt and hits a failure.
    const DEFAULT_PROMPT_LIMIT = 5000;
    const promptLimit = config.promptLimit || DEFAULT_PROMPT_LIMIT;
    promptInput.maxLength = promptLimit;
    const charLimitEl = document.getElementById('charLimit');
    if (charLimitEl) charLimitEl.textContent = promptLimit;
    if (promptInput.value.length > promptLimit) promptInput.value = promptInput.value.slice(0, promptLimit);
    charCount.textContent = promptInput.value.length;
    const plNote = document.getElementById('promptLimitNote');
    if (plNote) {
        if (config.promptLimit) {
            plNote.textContent = '✏️ Лимит промпта для этой модели: ' + promptLimit + ' знаков, длиннее ввести нельзя.';
            plNote.style.display = 'block';
        } else {
            plNote.style.display = 'none';
        }
    }

    // --- Audio toggle visibility (only for models that support audio on/off) ---
    document.getElementById('audioSection').classList.toggle('hidden', !config.audioToggle);
    document.getElementById('reveFastSection').classList.toggle('hidden', !config.isReve);

    // --- Utility models (recraft remove-bg / upscale): photo in -> file out.
    // No prompt / aspect / resolution / count — only the photo upload, which is mandatory. ---
    const isUtility = !!config.utility;
    document.getElementById('promptSection').classList.toggle('hidden', isUtility);
    document.getElementById('aspectSection').classList.toggle('hidden', isUtility);
    document.getElementById('resolutionSection').classList.toggle('hidden', isUtility);
    document.getElementById('countSection').classList.toggle('hidden', isUtility);
    if (isUtility) {
        const us = document.getElementById('uploadSection');
        us.classList.remove('hidden');
        const usTitle = us.querySelector('.section-title');
        const usHint = us.querySelector('p');
        if (usTitle) usTitle.textContent = 'Загрузить фото';
        if (usHint) usHint.textContent = config.uploadHint || 'Загрузите одно фото.';
        updateValidation();
        return;
    }

    // --- Reference-required note: mandatory photo input (Grok i2v) ---
    const refNote = document.getElementById('refRequiredNote');
    if (refNote) {
        if (config.requiresReference) {
            refNote.textContent = '⚠️ ' + (config.refHint || 'Для этой модели нужно загрузить фото — без него генерация не начнётся.');
            refNote.style.display = 'block';
        } else {
            refNote.style.display = 'none';
        }
    }

    // --- Image upload visibility: hide for text-only models ---
    // Ideogram V3 i2i (remix) returns 500 on kie, so this model is text-only:
    // hide the upload block and drop any already-picked photos so nothing goes to i2i.
    const uploadSectionEl = document.getElementById('uploadSection');
    if (uploadSectionEl) {
        uploadSectionEl.classList.toggle('hidden', !!config.textOnly);
        // Подписи блока загрузки — по конфигу модели (кол-во фото + обязательность),
        // иначе остаётся дефолт «изображения (Optional) / до 10», что противоречит Grok i2v (ровно 1 фото, обязательно).
        const ut = uploadSectionEl.querySelector('.section-title');
        const up = uploadSectionEl.querySelector('p');
        const mf = config.maxFiles || 10;
        const mandatory = !!config.requiresReference;
        const noun = mf === 1 ? 'изображение' : 'изображения';
        if (ut) ut.textContent = 'Загрузить ' + noun + (mandatory ? '' : ' (Optional)');
        if (up) up.textContent = mandatory
            ? (mf === 1 ? 'Нужно 1 фото или раскадровку.' : 'Нужно загрузить фото.')
            : (mf === 1 ? 'Можно загрузить 1 изображение.' : 'Можно загрузить до ' + mf + ' изображений.');
        const imgMax = document.getElementById('imageMax');
        if (imgMax) imgMax.textContent = mf;
    }
    if (config.textOnly && uploadedImages.length) { uploadedImages = []; updateImagePreviews(); }

    updateValidation();

    // --- Update Aspect Ratio chips ---
    const chipsContainer = document.getElementById('aspectRatioChips');
    chipsContainer.innerHTML = '';
    config.aspectRatios.forEach(ar => {
        const chip = document.createElement('div');
        chip.className = 'chip' + (ar.value === config.defaultAspect ? ' active' : '');
        chip.dataset.value = ar.value;
        chip.innerHTML = '<span class="chip-icon">' + ar.icon + '</span> ' + ar.value;
        chip.addEventListener('click', () => {
            chipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            // ВЕРДИКТ (аудит index.js:580): DOMStringMap типизирует dataset.value как
            // string|undefined, но undefined тут недостижим — этот же forEach несколькими
            // строками выше сам проставляет chip.dataset.value = ar.value для каждого чипа,
            // а ar.value всегда непустая строка из modelConfigs. Не баг, юзер "undefined" не увидит.
            selectedAspectRatio = chip.dataset.value;
        });
        chipsContainer.appendChild(chip);
    });
    selectedAspectRatio = config.defaultAspect;

    // --- Update Resolution dropdown ---
    // Models without a resolution axis (e.g. Grok Imagine) keep the block VISIBLE
    // but swap the picker for an explicit note — otherwise the missing block leaves
    // a vacuum and users mistake the count picker below for resolution. No resolution
    // is sent to the backend.
    const resSection = document.getElementById('resolutionSection');
    const resHint = document.getElementById('resolutionHint');
    const resDropdownEl = document.getElementById('resolutionDropdown');
    const resNote = document.getElementById('resolutionNote');
    resSection.classList.remove('hidden');
    if (!config.resolutions || config.resolutions.length === 0) {
        resHint.style.display = 'none';
        resDropdownEl.style.display = 'none';
        resNote.style.display = 'block';
        // ВЕРДИКТ (аудит index.js:600): не UI-баг. Ранний return сразу после этой строки
        // пропускает единственный код ниже, который пишет resValue.textContent — значит
        // "null"/"undefined" на экране никогда не появится (блок resolutionDropdown к тому
        // же display:none, вместо него показан resNote с фиксированным текстом-объяснением).
        // null уходит только в исходящий payload генерации для моделей без оси разрешения
        // (grok/ideogram-v3/reve/recraft-*); как это поле трактует бэкенд (Kie Mapper) — вне
        // области этого фронтенд-аудита, не проверялось.
        selectedResolution = null;
        return;
    }
    resHint.style.display = '';
    resDropdownEl.style.display = '';
    resNote.style.display = 'none';
    const resOptions = document.querySelector('#resolutionDropdown .dropdown-options');
    const resValue = document.getElementById('resolutionValue');
    resOptions.innerHTML = '';
    config.resolutions.forEach(res => {
        const opt = document.createElement('div');
        opt.className = 'dropdown-option' + (res.value === config.defaultRes ? ' active' : '');
        opt.dataset.value = res.value;
        opt.textContent = res.label;
        opt.addEventListener('click', () => {
            resOptions.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            resValue.textContent = res.label;
            selectedResolution = res.value;
            document.getElementById('resolutionDropdown').classList.remove('open');
        });
        resOptions.appendChild(opt);
    });
    resValue.textContent = config.resolutions.find(r => r.value === config.defaultRes)?.label || config.defaultRes;
    selectedResolution = config.defaultRes;

    // --- Update Duration dropdown (video only) ---
    if (config.durations && config.durations.length) {
        const durOptions = document.querySelector('#durationDropdown .dropdown-options');
        const durValue = document.getElementById('durationValue');
        durOptions.innerHTML = '';
        config.durations.forEach(dur => {
            const opt = document.createElement('div');
            opt.className = 'dropdown-option' + (dur.value === config.defaultDuration ? ' active' : '');
            opt.dataset.value = dur.value;
            opt.textContent = dur.label;
            opt.addEventListener('click', () => {
                durOptions.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                durValue.textContent = dur.label;
                selectedDuration = dur.value;
                document.getElementById('durationDropdown').classList.remove('open');
            });
            durOptions.appendChild(opt);
        });
        durValue.textContent = config.durations.find(d => d.value === config.defaultDuration)?.label || config.defaultDuration;
        selectedDuration = config.defaultDuration;
    }
}

// Aspect Ratio chips
document.querySelectorAll('#aspectRatioChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('#aspectRatioChips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedAspectRatio = chip.dataset.value;
    });
});

// Dropdowns
function setupDropdown(dropdownId, valueId, onSelect) {
    const dropdown = document.getElementById(dropdownId);
    const selected = dropdown.querySelector('.dropdown-selected');
    const options = dropdown.querySelectorAll('.dropdown-option');
    const valueSpan = document.getElementById(valueId);

    selected.addEventListener('click', () => {
        // Close other dropdowns
        document.querySelectorAll('.dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });
        dropdown.classList.toggle('open');
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            valueSpan.textContent = option.dataset.value;
            onSelect(option.dataset.value);
            dropdown.classList.remove('open');
        });
    });
}

setupDropdown('resolutionDropdown', 'resolutionValue', (val) => selectedResolution = val);
// Count picker: keep selectedCount and surface an explicit cost warning when >1,
// so nobody mistakes this for a resolution setting and gets charged multiple times.
function updateCountWarning(val) {
    selectedCount = val;
    const w = document.getElementById('countWarning');
    const n = parseInt(val, 10) || 1;
    if (n > 1) {
        w.textContent = '⚠️ Будет создано ' + n + ' изображения — спишется как ' + n + ' генерации (×' + n + ').';
        w.style.display = 'block';
    } else {
        w.style.display = 'none';
    }
}
setupDropdown('countDropdown', 'countValue', updateCountWarning);
setupDropdown('durationDropdown', 'durationValue', (val) => selectedDuration = val);

// Audio toggle
const audioToggleEl = document.getElementById('audioToggle');
function toggleAudio() {
    audioToggleEl.classList.toggle('active');
    generateAudio = audioToggleEl.classList.contains('active');
    audioToggleEl.setAttribute('aria-checked', generateAudio ? 'true' : 'false');
}
audioToggleEl.addEventListener('click', toggleAudio);
audioToggleEl.addEventListener('keydown', onActivateKey(toggleAudio));

// Reve Fast toggle
const reveFastToggleEl = document.getElementById('reveFastToggle');
function toggleReveFast() {
    reveFastToggleEl.classList.toggle('active');
    reveFast = reveFastToggleEl.classList.contains('active');
    reveFastToggleEl.setAttribute('aria-checked', reveFast ? 'true' : 'false');
}
reveFastToggleEl.addEventListener('click', toggleReveFast);
reveFastToggleEl.addEventListener('keydown', onActivateKey(toggleReveFast));

// Model dropdown (custom handler for complex options)
const modelDropdown = document.getElementById('modelDropdown');
const modelSelected = modelDropdown.querySelector('.dropdown-selected');
const modelOptions = modelDropdown.querySelectorAll('.dropdown-option');
const modelNameEl = document.getElementById('modelName');
const modelDescEl = document.getElementById('modelDesc');
const modelIconEl = modelDropdown.querySelector('.dropdown-selected .model-icon');

modelSelected.addEventListener('click', () => {
    document.querySelectorAll('.dropdown').forEach(d => {
        if (d !== modelDropdown) d.classList.remove('open');
    });
    modelDropdown.classList.toggle('open');
});

modelOptions.forEach(option => {
    option.addEventListener('click', () => {
        modelOptions.forEach(o => o.classList.remove('active'));
        option.classList.add('active');

        selectedModel = option.dataset.value;
        modelNameEl.textContent = option.dataset.name;
        modelDescEl.textContent = option.dataset.desc;

        // Update icon
        modelIconEl.className = 'model-icon ' + option.dataset.icon;
        modelIconEl.textContent = {'google':'G','flux':'F','seedream':'S','seedance':'S','openai':'O','grok':'X','ideogram':'✦','recraft':'R','reve':'◆'}[option.dataset.icon] || 'S';

        modelDropdown.classList.remove('open');
        updateModelParams(selectedModel);
    });
});

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
    }
});

// Validation
function updateValidation() {
    const cfg = modelConfigs[selectedModel] || {};
    const noPrompt = !!cfg.noPrompt;          // утилиты (recraft) — промпт не нужен
    const needsRef = !!cfg.requiresReference; // обязательно фото
    const hasPrompt = promptInput.value.trim().length > 0;
    const hasRef = uploadedImages.length > 0;
    const promptOk = noPrompt || hasPrompt;
    const refOk = !needsRef || hasRef;

    if (!promptOk) {
        document.getElementById('validationText').textContent = currentMode === 'video'
            ? 'Пожалуйста, предоставьте описание видео для генерации'
            : 'Пожалуйста, предоставьте описание изображения для генерации';
        validationMessage.classList.add('show');
    } else if (!refOk) {
        document.getElementById('validationText').textContent = '⚠️ Загрузите фото — для этой операции оно обязательно.';
        validationMessage.classList.add('show');
    } else {
        validationMessage.classList.remove('show');
    }

    generateBtn.disabled = !(promptOk && refOk);
}

// Improve Prompt button
improveBtn.addEventListener('click', async () => {
    if (!promptInput.value.trim()) {
        showToast('Сначала введите промпт', 'error');
        return;
    }

    // Визуальная индикация — кнопка в состоянии loading
    improveBtn.disabled = true;
    improveBtn.innerHTML = '⏳ Улучшаю...';
    improveBtn.style.opacity = '0.7';

    // Собираем chat_id
    let chatId = null;
    if (tg && tg.initDataUnsafe) {
        chatId = tg.initDataUnsafe.user?.id || tg.initDataUnsafe.chat?.id;
    }

    if (tg && tg.initData) {
        try {
            // Synchronous endpoint: returns { improved: "<text>" } and we drop it
            // straight into the prompt field (no copy-from-chat).
            const res = await fetch('https://coaladot.fun/webhook/qvabo-improve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'improve_prompt',
                    prompt: promptInput.value,
                    chat_id: chatId,
                    initData: tg.initData
                })
            });

            let improved = '';
            try {
                const data = await res.json();
                improved = (data && (data.improved || data.output || data.text) || '').trim();
            } catch (_) {}

            if (improved) {
                promptInput.value = improved;
                updateValidation();
                improveBtn.innerHTML = '✅ Готово';
            } else {
                showToast('Не удалось улучшить промпт, попробуйте ещё раз', 'error');
                improveBtn.innerHTML = '✨ Улучшить Prompt';
            }

            // Через 2 сек возвращаем исходную надпись кнопки
            setTimeout(() => {
                improveBtn.disabled = false;
                improveBtn.innerHTML = '✨ Улучшить Prompt';
                improveBtn.style.opacity = '1';
            }, 2000);

        } catch (error) {
            showToast('Не удалось улучшить промпт, попробуйте ещё раз', 'error');
            improveBtn.disabled = false;
            improveBtn.innerHTML = '✨ Улучшить Prompt';
            improveBtn.style.opacity = '1';
        }
    } else {
        showToast('Нет данных Telegram', 'error');
        improveBtn.disabled = false;
        improveBtn.innerHTML = '✨ Улучшить Prompt';
        improveBtn.style.opacity = '1';
    }
});

// Generate button
generateBtn.addEventListener('click', async () => {
    const genCfg = modelConfigs[selectedModel] || {};
    if (!genCfg.noPrompt && !promptInput.value.trim()) {
        showToast('Please enter a description', 'error');
        return;
    }
    // Models that require a photo (Grok i2v, recraft utilities) must not fire without one.
    if (genCfg.requiresReference && uploadedImages.length === 0) {
        showToast('Загрузите фото — для этой операции оно обязательно', 'error');
        return;
    }

    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    generateBtn.innerHTML = '<div class="spinner"></div><span>Generating...</span>';

    try {
        /**
         * Тело запроса на генерацию — форма отличается по ветке (video/image), поэтому
         * все поля кроме action/prompt/model/aspectRatio/resolution/count/images
         * помечены опциональными: provider/duration/generateAudio кладёт только видео-
         * ветка, provider(image)/reve_fast — image-ветка, и то не всегда (см. if ниже).
         * @typedef {Object} GeneratePayload
         * @property {string} action
         * @property {string} prompt
         * @property {string} model
         * @property {string} [provider]
         * @property {string} aspectRatio
         * @property {string|null} resolution
         * @property {string} [duration]
         * @property {boolean} [generateAudio]
         * @property {number|string} count
         * @property {string[]} images
         * @property {boolean} [reve_fast]
         */
        /** @type {GeneratePayload} */
        let data;
        if (currentMode === 'video') {
            const videoConfig = modelConfigs[selectedModel] || {};
            data = {
                action: 'generate_video',
                prompt: promptInput.value,
                model: videoConfig.apiSlug || selectedModel,
                provider: videoConfig.provider || 'google',
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                duration: selectedDuration,
                generateAudio: videoConfig.audioToggle ? generateAudio : true,
                count: 1,
                images: uploadedImages.slice(0, 1).map(img => img.dataUrl)
            };
        } else {
            const imageConfig = modelConfigs[selectedModel] || {};
            data = {
                action: 'generate',
                prompt: promptInput.value,
                model: imageConfig.apiSlug || selectedModel,
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                count: selectedCount,
                images: uploadedImages.map(img => img.dataUrl)
            };
            if (imageConfig.provider) data.provider = imageConfig.provider;
            if (imageConfig.isReve) data.reve_fast = reveFast;
        }

        sendData(data);
    } catch (error) {
        showToast('Не удалось отправить запрос, попробуйте ещё раз', 'error');
        resetButton();
    }
});

function sendData(data) {
    // Получаем chat_id из разных источников
    let chatId = null;
    if (tg && tg.initDataUnsafe) {
        if (tg.initDataUnsafe.user) {
            chatId = tg.initDataUnsafe.user.id;
        } else if (tg.initDataUnsafe.chat) {
            chatId = tg.initDataUnsafe.chat.id;
        }
    }

    if (tg && tg.initData) {
        // Только подписанная строка initData + chat_id. Весь initDataUnsafe не шлём.
        const payload = {
            ...data,
            chat_id: chatId,
            initData: tg.initData
        };

        fetch('https://coaladot.fun/webhook/qvabo-webapp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        })
        .then(async response => {
            if (DEBUG) console.log('Response status:', response.status);
            // Тело может быть пустым/не-JSON — не роняем поток.
            const body = await response.json().catch(() => ({}));

            // Сетевой/серверный сбой (не 2xx) ИЛИ явная ошибка в теле — не закрываем приложение.
            if (!response.ok || body.error || body.ok === false) {
                const msg = body.error ? 'Сервис временно недоступен, попробуйте ещё раз' : ('Ошибка сервера ' + response.status);
                throw new Error(msg);
            }

            // Бэкенд отвечает мгновенно: генерация асинхронная, результат придёт
            // сообщением в чат. Поэтому формулировка честная — «отправлен», не «запущена».
            showToast('🚀 Запрос отправлен — результат придёт в чат', 'success');
            setTimeout(() => tg.close(), 1500);
        })
        .catch(error => {
            if (DEBUG) console.error('Fetch error:', error);
            showToast('Не удалось отправить запрос, попробуйте ещё раз', 'error');
            resetButton();
        });
    } else {
        // For testing outside Telegram OR no initData
        if (DEBUG) console.log('No tg.initData');
        showToast('Нет данных Telegram', 'error');
        resetButton();
    }
}

function resetButton() {
    generateBtn.disabled = false;
    generateBtn.classList.remove('loading');
    generateBtn.innerHTML = currentMode === 'video'
        ? '<span>🎬</span><span>Generate Video</span>'
        : '<span>✨</span><span>Generate</span>';
    updateValidation();
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== A11y: кастомные дропдауны (combobox + listbox) =====
// Существующие click-обработчики не трогаем — добавляем роли, синхронизацию
// aria-expanded и клавиатуру (Enter/Space открыть/выбрать, Esc закрыть, стрелки — навигация).
document.querySelectorAll('.dropdown').forEach(dropdown => {
    const selected = dropdown.querySelector('.dropdown-selected');
    const optionsBox = dropdown.querySelector('.dropdown-options');
    if (!selected || !optionsBox) return;

    selected.setAttribute('role', 'combobox');
    selected.setAttribute('tabindex', '0');
    selected.setAttribute('aria-haspopup', 'listbox');
    selected.setAttribute('aria-expanded', dropdown.classList.contains('open') ? 'true' : 'false');
    optionsBox.setAttribute('role', 'listbox');

    // aria-expanded следует за классом .open (его переключают разные обработчики)
    new MutationObserver(() => {
        selected.setAttribute('aria-expanded', dropdown.classList.contains('open') ? 'true' : 'false');
    }).observe(dropdown, { attributes: true, attributeFilter: ['class'] });

    // role=option выставляем и динамически (resolution/count/duration перерисовываются)
    function tagOptions() {
        optionsBox.querySelectorAll('.dropdown-option').forEach(o => {
            o.setAttribute('role', 'option');
            o.setAttribute('aria-selected', o.classList.contains('active') ? 'true' : 'false');
        });
    }
    tagOptions();
    new MutationObserver(tagOptions).observe(optionsBox, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    // Клавиатура на заголовке дропдауна
    selected.addEventListener('keydown', e => {
        const opts = Array.from(optionsBox.querySelectorAll('.dropdown-option'))
            .filter(o => o.offsetParent !== null);
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            selected.click();
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('open');
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && opts.length) {
            e.preventDefault();
            if (!dropdown.classList.contains('open')) { selected.click(); return; }
            const cur = opts.findIndex(o => o.classList.contains('active'));
            const next = e.key === 'ArrowDown'
                ? Math.min(opts.length - 1, cur + 1)
                : Math.max(0, cur - 1);
            opts[next].click();
            selected.focus();
        }
    });
});

// ===== A11y: чипы соотношения сторон (radiogroup / radio) =====
// Контейнер перерисовывается в updateModelParams — навешиваем на сам контейнер
// (делегирование клавиатуры) + помечаем роли при каждом изменении.
const aspectChipsEl = document.getElementById('aspectRatioChips');
if (aspectChipsEl) {
    aspectChipsEl.setAttribute('role', 'radiogroup');
    aspectChipsEl.setAttribute('aria-label', 'Соотношение сторон');

    function tagChips() {
        aspectChipsEl.querySelectorAll('.chip').forEach(chip => {
            chip.setAttribute('role', 'radio');
            const active = chip.classList.contains('active');
            chip.setAttribute('aria-checked', active ? 'true' : 'false');
            // только активный чип в tab-порядке (паттерн radiogroup)
            chip.setAttribute('tabindex', active ? '0' : '-1');
        });
    }
    tagChips();
    new MutationObserver(tagChips).observe(aspectChipsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    // Enter/Space — выбрать чип под фокусом; стрелки — перемещение по radiogroup
    aspectChipsEl.addEventListener('keydown', e => {
        const chips = Array.from(aspectChipsEl.querySelectorAll('.chip'));
        const focused = document.activeElement;
        // ВЕРДИКТ (аудит index.js:1056): document.activeElement типизирован Element|null,
        // но null практически недостижим здесь — это keydown-обработчик самого чипа, то
        // есть событие уже означает, что чип в фокусе (activeElement указывает на него же).
        // Даже в невозможном крайнем случае null: Array.prototype.indexOf(null) просто
        // вернёт -1, а следующая строка (if (idx === -1) return;) уже это обрабатывает
        // без падения. Не баг.
        const idx = chips.indexOf(focused);
        if (idx === -1) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            focused.click();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = chips[Math.min(chips.length - 1, idx + 1)];
            n.click(); n.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const p = chips[Math.max(0, idx - 1)];
            p.click(); p.focus();
        }
    });
}

// ===== A11y: вкладки режима (Image / Video) =====
document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.setAttribute('role', 'button');
    tab.setAttribute('tabindex', '0');
    tab.addEventListener('keydown', onActivateKey(() => tab.click()));
});

// ===== Контекстное меню поля Prompt =====
// Десктопные клиенты Telegram гасят системное меню вебвью: правый клик в textarea
// не даёт «Вставить», работает только Ctrl+V. Рисуем своё меню. Мобилки (android/ios)
// и обычный браузер не трогаем — там родное меню живо и лучше нашего.

// Чистая вставка с учётом остатка места по maxLength (maxLength <= 0 — без лимита)
function ctxComputeInsert(value, selStart, selEnd, clip, maxLen) {
    const room = maxLen > 0 ? maxLen - (value.length - (selEnd - selStart)) : Infinity;
    const text = room < clip.length ? clip.slice(0, Math.max(0, room)) : clip;
    return {
        value: value.slice(0, selStart) + text + value.slice(selEnd),
        caret: selStart + text.length,
        clipped: text.length < clip.length
    };
}

(function () {
    const platform = (tg && tg.platform) || '';
    if (!/^(tdesktop|macos|unigram)$/.test(platform)) return;
    if (!promptInput) return;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    [
        { action: 'paste', label: 'Вставить' },
        { action: 'copy', label: 'Копировать' },
        { action: 'cut', label: 'Вырезать' },
        { action: 'selectall', label: 'Выделить всё' }
    ].forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctx-menu-item';
        b.setAttribute('role', 'menuitem');
        b.dataset.action = it.action;
        b.textContent = it.label;
        menu.appendChild(b);
    });
    document.body.appendChild(menu);

    function hideMenu() { menu.style.display = 'none'; }
    hideMenu();

    promptInput.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const hasSel = promptInput.selectionStart !== promptInput.selectionEnd;
        menu.querySelectorAll('.ctx-menu-item').forEach(b => {
            b.disabled = (b.dataset.action === 'copy' || b.dataset.action === 'cut') && !hasSel;
        });
        // показать невидимо, замерить и прижать к краям экрана
        menu.style.visibility = 'hidden';
        menu.style.display = 'block';
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - r.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - r.height - 8)) + 'px';
        menu.style.visibility = '';
    });

    ['pointerdown', 'wheel'].forEach(ev => document.addEventListener(ev, (e) => {
        if (!menu.contains(e.target)) hideMenu();
    }, true));
    window.addEventListener('resize', hideMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });

    function insertClip(clip) {
        if (typeof clip !== 'string' || !clip) return false;
        const r = ctxComputeInsert(promptInput.value, promptInput.selectionStart, promptInput.selectionEnd, clip, promptInput.maxLength);
        promptInput.value = r.value;
        promptInput.setSelectionRange(r.caret, r.caret);
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        promptInput.focus();
        if (r.clipped) showToast('Текст обрезан по лимиту поля', 'error');
        return true;
    }

    // Каскад способов достать буфер: Clipboard API → Telegram API → execCommand → подсказка
    async function doPaste() {
        try {
            if (insertClip(await navigator.clipboard.readText())) return;
        } catch (err) { /* нет разрешения — пробуем следующий способ */ }
        if (tg && typeof tg.readTextFromClipboard === 'function') {
            try {
                const text = await new Promise((resolve) => {
                    let done = false;
                    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 1500);
                    tg.readTextFromClipboard((t) => { if (!done) { done = true; clearTimeout(timer); resolve(t); } });
                });
                if (insertClip(text)) return;
            } catch (err) { /* доступно не для всех типов запуска Mini App */ }
        }
        promptInput.focus();
        try { if (document.execCommand('paste')) return; } catch (err) { }
        showToast('Не получилось достать текст из буфера. Нажмите Ctrl+V', 'error');
    }

    async function doCopy(cut) {
        const s = promptInput.selectionStart, e = promptInput.selectionEnd;
        if (s === e) return;
        const text = promptInput.value.slice(s, e);
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (err) { }
        if (!ok) {
            promptInput.focus();
            promptInput.setSelectionRange(s, e);
            try { ok = document.execCommand(cut ? 'cut' : 'copy'); } catch (err) { }
            if (ok && cut) { promptInput.dispatchEvent(new Event('input', { bubbles: true })); return; }
        }
        if (!ok) { showToast('Не получилось скопировать', 'error'); return; }
        if (cut) {
            promptInput.setRangeText('', s, e, 'start');
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        promptInput.focus();
    }

    menu.addEventListener('click', (e) => {
        const btn = e.target.closest('.ctx-menu-item');
        if (!btn || btn.disabled) return;
        hideMenu();
        const a = btn.dataset.action;
        if (a === 'paste') doPaste();
        else if (a === 'copy') doCopy(false);
        else if (a === 'cut') doCopy(true);
        else if (a === 'selectall') { promptInput.focus(); promptInput.select(); }
    });
})();

// Initial validation
updateValidation();
