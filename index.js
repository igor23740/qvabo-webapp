// Debug flag — keep false in production. Wrap any diagnostics in `if (DEBUG)`.
// Never log initData / initDataUnsafe / payload — they carry the signed Telegram session.
const DEBUG = false;

// Initialize Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// 22.07.2026: юзер, открывший Mini App по прямой ссылке и не запускавший бота, не получает
// НИЧЕГО — Telegram запрещает боту писать первым («bot can't initiate conversation»), поэтому
// ни результаты, ни отказы «не хватает баллов» до него не доходят (6 из 47 юзеров базы).
// Штатное лечение Telegram: requestWriteAccess (Bot API 6.9+) — нативный попап «Разрешить боту
// писать вам». Просим на входе и страхуемся перед генерацией. Юзеры с диалогом (allows_write_to_pm
// = true) попапа не видят вообще — для них ничего не меняется.
let botWriteGranted = false; // Allow, полученный в этой сессии (initData не перечитывается)
function hasBotWriteAccess() {
    return botWriteGranted || tg?.initDataUnsafe?.user?.allows_write_to_pm === true;
}
function requestBotWriteAccess(cb) {
    // Старый клиент без метода — не блокируем, ведём себя как раньше (хуже не станет)
    if (!tg || typeof tg.requestWriteAccess !== 'function' ||
        !(typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('6.9'))) { cb(true); return; }
    try {
        tg.requestWriteAccess((granted) => { if (granted) botWriteGranted = true; cb(!!granted); });
    } catch (e) { cb(true); }
}
if (tg && tg.initDataUnsafe?.user && !hasBotWriteAccess()) {
    requestBotWriteAccess(() => {});
}

// State
let uploadedImages = [];
let uploadedVideoRef = null; // {file, dataUrl, duration} — референс движения для Kling Motion Control
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
        if (file.size > 4 * 1024 * 1024) {
            // Честное предупреждение: тяжёлый файл на медленной сети едет заметно дольше
            showToast('Файл ' + (file.size / 1048576).toFixed(1) + ' МБ: на медленной сети отправка будет дольше обычного', 'success');
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

// === Референс-видео (Kling Motion Control) ===
// Лимит файла 9 МБ: тело вебхука n8n ограничено 16 МБ на весь JSON, base64 добавляет ~37%.
const MAX_VIDEO_REF_SIZE = 9 * 1024 * 1024;
const videoRefArea = document.getElementById('videoRefArea');
const videoRefInput = document.getElementById('videoRefInput');
if (videoRefArea && videoRefInput) {
    videoRefArea.addEventListener('click', () => videoRefInput.click());
    videoRefArea.addEventListener('keydown', onActivateKey(() => videoRefInput.click()));
    videoRefInput.addEventListener('change', (e) => handleVideoRef(e.target.files && e.target.files[0]));
}

function handleVideoRef(file) {
    if (!file) return;
    if (!(file.type === 'video/mp4' || file.type === 'video/quicktime')) {
        showToast('Нужен файл MP4 или MOV', 'error');
        videoRefInput.value = '';
        return;
    }
    if (file.size > MAX_VIDEO_REF_SIZE) {
        showToast('Видео больше 9 МБ — обрежьте или сожмите (обычно хватает 720p до 10 секунд)', 'error');
        videoRefInput.value = '';
        return;
    }
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
        const dur = probe.duration;
        URL.revokeObjectURL(probe.src);
        if (!isFinite(dur) || dur < 3 || dur > 30) {
            showToast('Длительность видео должна быть от 3 до 30 секунд', 'error');
            videoRefInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            uploadedVideoRef = { file: file, dataUrl: ev.target.result, duration: Math.ceil(dur) };
            updateVideoRefStatus();
        };
        reader.readAsDataURL(file);
    };
    probe.onerror = () => {
        URL.revokeObjectURL(probe.src);
        showToast('Не удалось прочитать видео — попробуйте другой файл', 'error');
        videoRefInput.value = '';
    };
    probe.src = URL.createObjectURL(file);
}

function updateVideoRefStatus() {
    const st = document.getElementById('videoRefStatus');
    if (st) {
        st.textContent = uploadedVideoRef
            ? '✓ ' + (uploadedVideoRef.file.name || 'видео') + ' · ' + uploadedVideoRef.duration + ' сек'
            : 'Видео не выбрано';
    }
    updateValidation();
}

// --- Звук-образец (MiniMax H3, reference_audio) ---
// 01.08: у MiniMax аудио на входе БЕСПЛАТНО (их Input Asset Pricing), поэтому баллы за него не берём.
// Ограничения из их доки: WAV или MP3, 2–15 секунд, до 15 МБ.
const MAX_AUDIO_REF_SIZE = 9 * 1024 * 1024;   // 9 МБ — не их лимит, а наш: тело вебхука n8n 16 МБ, base64 +37%
const AUDIO_REF_MIME = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3'];
let uploadedAudioRef = null;
const audioRefArea = document.getElementById('audioRefArea');
const audioRefInput = document.getElementById('audioRefInput');
if (audioRefArea && audioRefInput) {
    audioRefArea.addEventListener('click', () => audioRefInput.click());
    audioRefArea.addEventListener('keydown', onActivateKey(() => audioRefInput.click()));
    audioRefInput.addEventListener('change', (e) => handleAudioRef(e.target.files && e.target.files[0]));
}

function handleAudioRef(file) {
    if (!file) return;
    if (AUDIO_REF_MIME.indexOf(String(file.type).toLowerCase()) === -1) {
        showToast('Нужен файл WAV или MP3', 'error');
        audioRefInput.value = '';
        return;
    }
    if (file.size > MAX_AUDIO_REF_SIZE) {
        showToast('Аудио больше 9 МБ — возьмите файл покороче или сожмите', 'error');
        audioRefInput.value = '';
        return;
    }
    const probe = document.createElement('audio');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
        const dur = probe.duration;
        URL.revokeObjectURL(probe.src);
        if (!isFinite(dur) || dur < 2 || dur > 15) {
            showToast('Длительность аудио должна быть от 2 до 15 секунд', 'error');
            audioRefInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            uploadedAudioRef = { file: file, dataUrl: ev.target.result, duration: Math.ceil(dur) };
            updateAudioRefStatus();
        };
        reader.readAsDataURL(file);
    };
    probe.onerror = () => {
        URL.revokeObjectURL(probe.src);
        showToast('Не удалось прочитать аудио — попробуйте другой файл', 'error');
        audioRefInput.value = '';
    };
    probe.src = URL.createObjectURL(file);
}

function updateAudioRefStatus() {
    const st = document.getElementById('audioRefStatus');
    if (st) {
        st.textContent = uploadedAudioRef
            ? '✓ ' + (uploadedAudioRef.file.name || 'аудио') + ' · ' + uploadedAudioRef.duration + ' сек'
            : 'Аудио не выбрано';
    }
}

// --- Роль второй картинки (MiniMax H3): образец стиля или последний кадр ролика ---
let h3ImageRole = 'reference';
const h3RoleGroup = document.getElementById('h3RoleGroup');
if (h3RoleGroup) {
    h3RoleGroup.querySelectorAll('.orient-option').forEach(opt => {
        const pick = () => {
            h3ImageRole = opt.dataset.value === 'last' ? 'last' : 'reference';
            h3RoleGroup.querySelectorAll('.orient-option').forEach(o => {
                const on = o === opt;
                o.classList.toggle('active', on);
                o.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            const hint = document.getElementById('h3RoleHint');
            if (hint) hint.textContent = (h3ImageRole === 'last')
                ? 'Первое фото — начало ролика, второе — чем он закончится'
                : 'Все фото модель использует как образцы стиля и героев';
        };
        opt.addEventListener('click', pick);
        opt.addEventListener('keydown', onActivateKey(pick));
    });
}

// Ориентация персонажа (character_orientation kie) — добровольный выбор юзера, как в нативном Kling.
// 'video': ракурс как в референс-видео (kie рекомендует, референс до 30 с);
// 'image': ракурс как на фото (kie принимает референс до 10 с — гейт на кнопке генерации).
let charOrientation = 'video';
const charOrientGroup = document.getElementById('charOrientGroup');
const orientHint = document.getElementById('orientHint');
function updateOrientHint() {
    if (orientHint) {
        orientHint.textContent = charOrientation === 'image'
            ? 'Видео с движением до 10 секунд'
            : 'Видео с движением до 30 секунд';
    }
}
if (charOrientGroup) {
    charOrientGroup.querySelectorAll('.orient-option').forEach((opt) => {
        const pick = () => {
            charOrientation = opt.dataset.value === 'image' ? 'image' : 'video';
            charOrientGroup.querySelectorAll('.orient-option').forEach((o) => {
                const on = o === opt;
                o.classList.toggle('active', on);
                o.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            updateOrientHint();
        };
        opt.addEventListener('click', pick);
        opt.addEventListener('keydown', onActivateKey(pick));
    });
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
    'seedream-5-pro': {
        // Seedream 5 Pro (V2) — флагман ByteDance. Basic=1K / High=2K (4K нет). До 10 фото (i2i). nsfw_checker вкл (Фаза 1).
        // aspect_ratio: 7 значений, подтверждено живым дропдауном kie 09.07 (auto/21:9/5:4/4:5 НЕ поддерживаются).
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'3:2',icon:'▬'},
            {value:'1:1',icon:'▢'},
            {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'1K', label:'1K'},
            {value:'2K', label:'2K'}
        ],
        defaultAspect: '1:1',
        defaultRes: '1K',
        maxFiles: 10
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
    'ideogram-v4': {
        // [DOC developer.ideogram.ai /v1/ideogram-v4/generate] ПРЯМОЙ Ideogram API (мимо kie, 24.07.2026).
        // Повод ухода с kie: там только V3 и он постоянно лежал. Прямой даёт 4.0 (релиз 03.06.2026):
        // нативный 2K без апскейла, кириллица (проверено боем 24.07), лучшая типографика среди открытых моделей.
        // Режим TURBO фиксируется в Ideogram Prep. Размер задаётся ОДНИМ значением resolution из палитры модели
        // (23 варианта, те же, что на сайте Ideogram) — маппинг AR -> resolution на бэке, поэтому resolutions:[].
        // 24.07: i2i включён. У 4.0 картинка идёт в отдельную ручку /remix (в generate таких полей нет):
        // одна картинка ≤10 МБ, JPEG/PNG/WebP, промпт обязателен и в этом режиме. Цена та же, что у t2i.
        // Результат приходит документом (2K-типографика, sendPhoto бы её пережал).
        maxFiles: 1,
        uploadHint: 'Можно приложить 1 картинку — модель переделает её по вашему описанию. До 10 МБ, JPEG, PNG или WebP.',
        promptLimit: 5000,
        showcase: { logo: 'ideogram.png?v=1', logoTint: '#5b8cff', image: 'ideogram-v4-preview.webp?v=20260724b', sub: 'Пример — надписи на русском, Ideogram 4.0' },
        aspectRatios: [
            {value:'3:1',icon:'▬'}, {value:'2:1',icon:'▬'}, {value:'16:9',icon:'▬'}, {value:'16:10',icon:'▬'},
            {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'5:4',icon:'▢'},
            {value:'1:1',icon:'▢'},
            {value:'4:5',icon:'▯'}, {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'},
            {value:'10:16',icon:'▯'}, {value:'9:16',icon:'▯'}, {value:'1:2',icon:'▯'}, {value:'1:3',icon:'▯'}
        ],
        // 24.07 (заказ владельца): выбор режима рендера отдан юзеру в тот же блок, где раньше было разрешение.
        // У модели нет оси 1K/2K/4K (размер задаёт соотношение сторон), зато есть Turbo/Default/Quality —
        // они и стоят по-разному, поэтому баллы подписаны прямо в списке, чтобы человек видел, за что платит.
        // FLASH у 4.0 не поднят («coming soon», API отдаёт 400) — в списке его нет.
        resLabel: 'Качество',
        resHint: 'Чем выше качество, тем больше деталей и дороже генерация',
        resolutions: [
            {value:'TURBO', label:'Turbo · 2 балла · быстро'},
            {value:'DEFAULT', label:'Default · 4 балла · детальнее'},
            {value:'QUALITY', label:'Quality · 7 баллов · максимум деталей'}
        ],
        defaultAspect: '1:1',
        defaultRes: 'TURBO'
    },
    'reve': {
        // Reve 2.1 (V2 API) НАПРЯМУЮ через api.reve.com (мимо kie): v2/image/create|edit, включён per-account 08.07.26.
        // Режим по числу фото: 0 = Create (t2i), 1 = Edit (фото+инструкция), 2-8 = Create с references. Фото опционально.
        // Палитра форматов V2 подтверждена живыми пробами 08.07 (15 значений + auto). Тумблера Fast в V2 нет.
        isReve: true,
        maxFiles: 8,        // V2 references: до 8 фото
        promptLimit: 4000,  // Лимит V2 (живой проб 08.07: «prompt length must be no more than 4000 characters»)
        aspectRatios: [
            {value:'auto',icon:'▢'},
            {value:'4:1',icon:'▬'}, {value:'3:1',icon:'▬'}, {value:'21:9',icon:'▬'}, {value:'2:1',icon:'▬'},
            {value:'17:9',icon:'▬'}, {value:'16:9',icon:'▬'}, {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'},
            {value:'1:1',icon:'▢'},
            {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'},
            {value:'1:2',icon:'▯'}, {value:'1:3',icon:'▯'}, {value:'1:4',icon:'▯'}
        ],
        resolutions: [],
        defaultAspect: '1:1',
        defaultRes: null
    },
    'recraft-v41-pro': {
        // [DOC recraft.ai /v1/images/generations] ПРЯМОЙ Recraft API (мимо kie). Только t2i (Фаза 1:
        // i2i-цена V4.1 не опубликована Recraft'ом — фото не принимаем). Промпт до 10000 знаков.
        // Разрешение фиксировано моделью (2048×2048 … 3072px по длинной стороне) — блок Resolution скрыт.
        // Результат приходит файлом-документом (полиграфия = оригинал без пережатия Telegram).
        // Витрина: «снежный барс» 16:9 — реальная тестовая генерация 17.07 («изумительная картинка», владелец);
        // до деплоя recraft-pro-preview.webp скрыта onerror-фоллбеком.
        textOnly: true,
        promptLimit: 10000,
        showcase: { logo: 'recraft.png', image: 'recraft-pro-preview.webp?v=20260717a', sub: 'Пример — печатное качество Recraft V4.1 Pro' },
        aspectRatios: [
            {value:'auto',icon:'▢'},
            {value:'2:1',icon:'▬'}, {value:'16:9',icon:'▬'}, {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'5:4',icon:'▬'},
            {value:'1:1',icon:'▢'},
            {value:'4:5',icon:'▯'}, {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}, {value:'1:2',icon:'▯'}
        ],
        resolutions: [],
        defaultAspect: '1:1',
        defaultRes: null
    },
    'recraft-v41-vector': {
        // Настоящий вектор: приходит SVG-ФАЙЛОМ (документ), редактируется в Illustrator/Figma/Inkscape.
        // Для художников и дизайнеров: логотипы, иконки, иллюстрации со слоями и чистой геометрией.
        // Палитра форматов та же, что у растровой V4.1 (дока Recraft 17.07).
        // Витрина: до деплоя recraft-vector-preview.svg скрыта onerror-фоллбеком (паттерн видео-вкладок);
        // файл = реальная тестовая генерация «феникс над городом» 16:9 (премиум-позиционирование, заказ владельца 17.07).
        textOnly: true,
        promptLimit: 10000,
        showcase: { logo: 'recraft.png', image: 'recraft-vector-preview.svg?v=20260717a', sub: 'Пример — настоящий вектор (SVG), Recraft V4.1' },
        aspectRatios: [
            {value:'auto',icon:'▢'},
            {value:'2:1',icon:'▬'}, {value:'16:9',icon:'▬'}, {value:'3:2',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'5:4',icon:'▬'},
            {value:'1:1',icon:'▢'},
            {value:'4:5',icon:'▯'}, {value:'3:4',icon:'▯'}, {value:'2:3',icon:'▯'}, {value:'9:16',icon:'▯'}, {value:'1:2',icon:'▯'}
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
    'topaz-upscale': {
        // [DOC kie.ai topaz/image-upscale] утилита: image_url + upscale_factor "2" (фикс, выход ≤4K) + nsfw_checker (бэкенд).
        // Вход ужимается до 2048px по длинной стороне перед отправкой (shrinkForTopaz) — тир закупки предсказуем (решение 09.07).
        utility: true,
        noPrompt: true,
        requiresReference: true,
        uploadHint: 'Загрузите 1 фото — ИИ восстановит детали и чёткость, увеличит до 4K. Результат придёт файлом.',
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
    'seedance-2': {
        // [DOC docs.kie.ai/market/bytedance/seedance-2] bytedance/seedance-2 (СТАРШАЯ, 16.07.2026): t2v + i2v
        // (1 фото = первый кадр), duration 4–15 c, generate_audio bool, aspect = палитра Mini + 21:9.
        // Качества ТОЛЬКО 1080p/4k — развод линеек с Mini (480p/720p) без пересечения цен, решение владельца 16.07 вечер.
        // Модель умеет референсы-видео/аудио и последний кадр — в v1 фронтом не выдаются (бэкенд-хвост по отмашке).
        apiSlug: 'seedance-2',
        provider: 'kie',
        audioToggle: true,
        maxFiles: 1,
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'21:9',icon:'▬'}, {value:'4:3',icon:'▬'}, {value:'1:1',icon:'▢'},
            {value:'3:4',icon:'▯'}, {value:'9:16',icon:'▯'}, {value:'adaptive',icon:'▢'}
        ],
        resolutions: [
            {value:'1080p', label:'1080p'},
            {value:'4k', label:'4K · Ultra HD'}
        ],
        durations: [
            {value:'4s', label:'4s'}, {value:'5s', label:'5s'}, {value:'6s', label:'6s'},
            {value:'7s', label:'7s'}, {value:'8s', label:'8s'}, {value:'9s', label:'9s'},
            {value:'10s', label:'10s'}, {value:'11s', label:'11s'}, {value:'12s', label:'12s'},
            {value:'13s', label:'13s'}, {value:'14s', label:'14s'}, {value:'15s', label:'15s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '1080p',
        defaultDuration: '5s',
        showcase: { logo: 'bytedance.png?v=1', video: 'seedance2-preview.mp4', sub: 'Пример — ролик Seedance 2.0 со звуком' }
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
    'minimax-h3': {
        // [DOC platform.minimax.io/docs/api-reference/video-generation-v2-create] MiniMax H3 / Hailuo 03 (01.08.2026):
        // ПРЯМОЙ API MiniMax, не kie — первая наша видео-ветка без посредника. t2v + i2v (первый кадр).
        // resolution только 2K (768P — закрытая бета). duration целое 4–15: бэкенд принимает весь диапазон,
        // здесь показываем привычные 4/6/8/10; ползунок можно добавить потом, не трогая бэкенд.
        // ⛔ Фильтр контента НЕОТКЛЮЧАЕМЫЙ — параметра у модели нет, Промо+ его тут не снимает (говорим честно).
        // ⚖️ Доступ с тарифа «Промо» и выше (решение владельца 01.08): младшим бэкенд отвечает адресным отказом.
        apiSlug: 'minimax-h3',
        provider: 'minimax',
        audioToggle: false,   // звук у H3 нативный, тумблера нет
        // ⛔ Решение владельца 01.08: РОВНО 5 картинок и ни одной больше — столько MiniMax отдаёт бесплатно,
        // платные (6-я и далее по $0,04) не подключаем. Ограничение только у этой модели.
        maxFiles: 5,
        // Режим reference-to-video: видео на входе допускается и ОПЛАЧИВАЕТСЯ отдельно —
        // MiniMax тарифицирует его секунды по ставке ролика, поэтому цена = выход + вход.
        optionalVideoRef: true,
        // Звук-образец (reference_audio) — у MiniMax бесплатный, в цену не входит.
        optionalAudioRef: true,
        // Выбор роли второй картинки: образец стиля (reference_image) или финальный кадр (last_frame).
        imageRoles: true,
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'9:16',icon:'▯'}, {value:'1:1',icon:'▢'},
            {value:'4:3',icon:'▬'}, {value:'3:4',icon:'▯'}, {value:'21:9',icon:'▬'}
        ],
        resolutions: [
            {value:'2K', label:'2K'}
        ],
        // Полный диапазон API: любое целое 4–15 (дока api-reference/video-generation-v2-create).
        // Урезать нельзя — у H3 длительность и есть главный рычаг цены (10 баллов за секунду).
        durations: [
            {value:'4s', label:'4s'}, {value:'5s', label:'5s'}, {value:'6s', label:'6s'},
            {value:'7s', label:'7s'}, {value:'8s', label:'8s'}, {value:'9s', label:'9s'},
            {value:'10s', label:'10s'}, {value:'11s', label:'11s'}, {value:'12s', label:'12s'},
            {value:'13s', label:'13s'}, {value:'14s', label:'14s'}, {value:'15s', label:'15s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '2K',
        defaultDuration: '6s',
        // Витрина: боевая генерация владельца 01.08 (task 426168891248950, 2K, 10 с). Из неё вырезаны
        // два бракованных куска (быстрая драка и падение — там распадалась геометрия), оставлены чистые,
        // переходы мягкие; сжато до 720p/523 КБ по прецеденту Seedance и Omni. Звук убран — витрина немая.
        showcase: { logo: 'minimax-h3.png?v=20260801', video: 'minimax-h3-preview.mp4?v=20260801', sub: 'Пример — экшен-сцена в 2K' }
    },
    'gemini-omni-video': {
        // [DOC docs.kie.ai/market/gemini-omni-video] gemini-omni-video (22.07.2026): t2v + i2v (1 фото-референс),
        // duration ТОЛЬКО 4/6/8/10 (enum kie, строка), AR только 16:9|9:16, качества 720p/1080p/4k.
        // 1080p по цене 720p (демпинг kie). Звук родной и бесплатный, тумблера нет.
        // ⛔ nsfw_checker у модели в схеме kie НЕТ — фильтр Google не отключается ни на одном тарифе (FAQ/плашки говорят честно).
        // Витрина = реальная генерация владельца 22.07 (1080p 10s по раскадровке, сжата до 488 КБ по прецеденту Seedance).
        apiSlug: 'gemini-omni-video',
        provider: 'kie',
        audioToggle: false,
        maxFiles: 1,
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'9:16',icon:'▯'}
        ],
        resolutions: [
            {value:'720p', label:'720p'},
            {value:'1080p', label:'1080p'},
            {value:'4k', label:'4K · Ultra HD'}
        ],
        durations: [
            {value:'4s', label:'4s'}, {value:'6s', label:'6s'},
            {value:'8s', label:'8s'}, {value:'10s', label:'10s'}
        ],
        defaultAspect: '16:9',
        defaultRes: '720p',
        defaultDuration: '8s',
        showcase: { logo: 'gemini-omni.png?v=1', video: 'omni-preview.mp4?v=20260722d', side: 'omni-side.svg?v=20260722d', sub: 'Пример: мультик по раскадровке, звук из модели' }
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
    },
    'kling-video': {
        // [DOC docs.kie.ai/market/kling/kling-3-0] kling-3.0/video: t2v + i2v (1 фото = первый кадр),
        // duration '3'..'15' (строка), mode std/pro/4K, sound bool, aspect_ratio 16:9|9:16|1:1.
        // Ось «Разрешение» на фронте = режим качества (std/pro/4k), бэкенд Kling VIDEO PREP мапит в mode.
        apiSlug: 'kling-video',
        provider: 'kie',
        audioToggle: true,
        maxFiles: 1,
        promptLimit: 2500,
        aspectRatios: [
            {value:'16:9',icon:'▬'}, {value:'9:16',icon:'▯'}, {value:'1:1',icon:'▢'}
        ],
        resolutions: [
            {value:'std', label:'Standard · 720p'},
            {value:'pro', label:'Pro · 1080p'},
            {value:'4k', label:'4K · Ultra HD'}
        ],
        durations: [
            {value:'3s', label:'3s'}, {value:'4s', label:'4s'}, {value:'5s', label:'5s'},
            {value:'6s', label:'6s'}, {value:'7s', label:'7s'}, {value:'8s', label:'8s'},
            {value:'9s', label:'9s'}, {value:'10s', label:'10s'}, {value:'11s', label:'11s'},
            {value:'12s', label:'12s'}, {value:'13s', label:'13s'}, {value:'14s', label:'14s'},
            {value:'15s', label:'15s'}
        ],
        defaultAspect: '16:9',
        defaultRes: 'std',
        defaultDuration: '5s',
        showcase: { logo: 'kling.png', video: 'kling-preview.mp4?v=20260714e', sub: 'Пример — ролик Kling 3.0 со звуком' }
    },
    'kling-motion': {
        // [DOC docs.kie.ai/market/kling/motion-control-v3] kling-3.0/motion-control:
        // input_urls (1 фото персонажа, обязательно) + video_urls (1 видео 3–30с, обязательно),
        // prompt опционален, mode 720p/1080p. Длительность не выбирается — берётся из референс-видео.
        apiSlug: 'kling-motion',
        provider: 'kie',
        audioToggle: false,
        requiresReference: true,
        requiresVideoRef: true,
        promptOptional: true,
        maxFiles: 1,
        promptLimit: 2500,
        refHint: 'Kling Motion Control переносит движение из вашего видео на персонажа с фото. Нужны 1 фото (голова, плечи и корпус в кадре) и видео с движением 3–30 секунд.',
        noAspect: true,
        aspectRatios: [],
        resolutions: [
            {value:'720p', label:'720p'},
            {value:'1080p', label:'1080p'}
        ],
        durations: [],
        defaultAspect: null,
        defaultRes: '720p',
        defaultDuration: null,
        showcase: { logo: 'kling.png', video: 'kling-motion-preview.mp4?v=20260715b', sub: 'Пример: перенос движения на персонажа с фото' }
    }
};

// Video aspect ratios (only these 3 active in video mode)
const videoAspectRatios = ['1:1', '16:9', '9:16'];

// Вайтлист снят 2026-07-06 (kie пополнен) — видео-режим открыт всем.
// Константа и каркас функции оставлены для быстрого отката: вернуть
// `return VIDEO_WHITELIST.includes(Number(uid));`. Реальная защита — Access Gate на бэкенде.
// ДУБЛЬ: та же константа продублирована в tariffs.js (страница тарифов) — там гейт
// снят той же правкой; при возврате вайтлиста править оба файла синхронно.
const VIDEO_WHITELIST = [371324849, 369287553];
function isVideoWhitelisted() {
    try {
        const uid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
        return true; // вайтлист снят 2026-07-06: kie пополнен, видео открыто для всех
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
        selectedModel = 'seedance-2'; // 16.07 сессия 3: дефолт видео-режима = СТАРШАЯ (заказ владельца «главной вкладкой — Seedance 2.0»)
        document.getElementById('modelName').textContent = 'Seedance 2.0';
        document.getElementById('modelDesc').textContent = 'ByteDance · Видео-флагман, до 4K';
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
            if (lg) {
                // 24.07: logoTint — перекрасить логотип, как значок модели на вкладке (иконка Ideogram
                // тёмная и сливалась с фоном витрины). Без tint — обычная картинка; сброс обязателен,
                // иначе маска переезжает на следующую выбранную модель.
                if (config.showcase.logoTint) {
                    lg.style.backgroundImage = 'none';
                    lg.style.backgroundColor = config.showcase.logoTint;
                    lg.style.webkitMaskImage = "url('" + config.showcase.logo + "')";
                    lg.style.maskImage = "url('" + config.showcase.logo + "')";
                    lg.style.webkitMaskSize = lg.style.maskSize = 'contain';
                    lg.style.webkitMaskRepeat = lg.style.maskRepeat = 'no-repeat';
                    lg.style.webkitMaskPosition = lg.style.maskPosition = 'center';
                } else {
                    lg.style.webkitMaskImage = lg.style.maskImage = 'none';
                    lg.style.backgroundColor = 'transparent';
                    lg.style.backgroundImage = "url('" + config.showcase.logo + "')";
                }
            }
            if (sb) sb.textContent = config.showcase.sub || 'Пример работы модели';
            if (vd) {
                if (config.showcase.video) {
                    // Файл-пример может ещё не быть задеплоен (404) — тогда прячем витрину целиком,
                    // чтобы не показывать чёрный пустой блок.
                    vd.onerror = function () { showcaseEl.style.display = 'none'; };
                    if (vd.getAttribute('src') !== config.showcase.video) vd.src = config.showcase.video;
                    vd.style.display = '';
                    const pp = vd.play(); if (pp && pp.catch) pp.catch(function () {});
                } else {
                    vd.pause(); vd.removeAttribute('src'); vd.style.display = 'none';
                }
            }
            // Витрина-картинка (17.07, вкладка Recraft Vector): тот же контракт, что у видео —
            // файла ещё нет (404) -> onerror прячет витрину целиком, никакого пустого блока.
            const im = document.getElementById('showcaseImage');
            if (im) {
                if (config.showcase.image) {
                    im.onerror = function () { showcaseEl.style.display = 'none'; };
                    if (im.getAttribute('src') !== config.showcase.image) im.src = config.showcase.image;
                    im.style.display = '';
                } else {
                    im.removeAttribute('src'); im.style.display = 'none';
                }
            }
            // Боковина витрины (22.07, Omni, просьба владельца): вертикальная колонка-плейсхолдер
            // слева от ролика. Файл не доехал (404) -> прячем только боковину, ролик остаётся.
            const sd = document.getElementById('showcaseSide');
            if (sd) {
                if (config.showcase.side) {
                    sd.onerror = function () { sd.style.display = 'none'; };
                    if (sd.getAttribute('src') !== config.showcase.side) sd.src = config.showcase.side;
                    sd.style.display = '';
                } else {
                    sd.removeAttribute('src'); sd.style.display = 'none';
                }
            }
            showcaseEl.style.display = 'flex';
        } else {
            const vd = document.getElementById('showcaseVideo');
            if (vd) { vd.pause(); vd.removeAttribute('src'); }
            const im = document.getElementById('showcaseImage');
            if (im) { im.removeAttribute('src'); }
            showcaseEl.style.display = 'none';
        }
    }

    // --- Per-model prompt length limit ---
    // Reve V2 API hard-caps the prompt at 4000 chars (HTTP 400 otherwise). Other models default to 5000.
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
    // Reve V2 (08.07.26): параметра fast в API нет — секция скрыта для всех моделей.
    document.getElementById('reveFastSection').classList.add('hidden');

    // --- Utility models (recraft remove-bg / upscale): photo in -> file out.
    // No prompt / aspect / resolution / count — only the photo upload, which is mandatory. ---
    const isUtility = !!config.utility;
    document.getElementById('promptSection').classList.toggle('hidden', isUtility);
    // noAspect: у модели нет оси соотношения сторон (Kling Motion Control — формат берётся из референса)
    document.getElementById('aspectSection').classList.toggle('hidden', isUtility || !!config.noAspect);
    document.getElementById('resolutionSection').classList.toggle('hidden', isUtility);
    // Счётчик количества — только для картинок: видео-ветка всегда шлёт count:1,
    // а блок «Количество изображений» в видео-режиме только путал (дефект и до Kling).
    document.getElementById('countSection').classList.toggle('hidden', isUtility || currentMode === 'video');
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

    // --- Референс-видео (Kling Motion Control): показать/спрятать секцию, сбросить выбранное ---
    const vrsEl = document.getElementById('videoRefSection');
    if (vrsEl) {
        // 01.08: у MiniMax H3 видео-референс ОПЦИОНАЛЕН (режим reference-to-video), поэтому секция
        // показывается и по optionalVideoRef — но обязательным файл при этом не становится.
        const showVideoRef = !!(config.requiresVideoRef || config.optionalVideoRef);
        vrsEl.classList.toggle('hidden', !showVideoRef);
        if (!showVideoRef && uploadedVideoRef) {
            uploadedVideoRef = null;
            if (videoRefInput) videoRefInput.value = '';
            updateVideoRefStatus();
        }
    }
    // --- Звук-образец и роль второй картинки (MiniMax H3): показываем только там, где поддерживается ---
    const arsEl = document.getElementById('audioRefSection');
    if (arsEl) {
        arsEl.classList.toggle('hidden', !config.optionalAudioRef);
        if (!config.optionalAudioRef && uploadedAudioRef) {
            uploadedAudioRef = null;
            if (audioRefInput) audioRefInput.value = '';
            updateAudioRefStatus();
        }
    }
    const h3rg = document.getElementById('h3RoleGroup');
    const h3rh = document.getElementById('h3RoleHint');
    if (h3rg) h3rg.classList.toggle('hidden', !config.imageRoles);
    if (h3rh) h3rh.classList.toggle('hidden', !config.imageRoles);
    if (!config.imageRoles) h3ImageRole = 'reference';

    // --- Ориентация персонажа (Kling Motion Control): чекбоксы под моделью, только для этой модели ---
    if (charOrientGroup) {
        charOrientGroup.classList.toggle('hidden', !config.requiresVideoRef);
        if (orientHint) orientHint.classList.toggle('hidden', !config.requiresVideoRef);
        if (config.requiresVideoRef) updateOrientHint();
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
    // Ideogram 4.0: Фаза 1 без референсов (у прямого API i2i есть, заводим по спросу):
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
        // (grok/ideogram-v4/reve/recraft-*); как это поле трактует бэкенд (Kie Mapper) — вне
        // области этого фронтенд-аудита, не проверялось.
        selectedResolution = null;
        return;
    }
    resHint.style.display = '';
    resDropdownEl.style.display = '';
    resNote.style.display = 'none';
    // 24.07: у моделей без оси разрешения этот блок может работать как ось качества (Ideogram: Turbo/Default/Quality).
    const resTitle = document.getElementById('resolutionTitle');
    const resHintEl = document.getElementById('resolutionHint');
    if (resTitle) resTitle.textContent = config.resLabel || 'Разрешение';
    if (resHintEl) resHintEl.textContent = config.resHint || 'Разрешение изображения для генерации';
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
    // У Kling Motion Control длительность не выбирается (равна длине референс-видео) — ось скрываем.
    if (currentMode === 'video') {
        document.getElementById('durationSection').classList.toggle('hidden', !(config.durations && config.durations.length));
        if (!(config.durations && config.durations.length)) selectedDuration = null;
    }
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
        modelIconEl.textContent = {'google':'G','flux':'F','seedream':'S','seedance':'S','openai':'O','grok':'X','ideogram':'✦','recraft':'R','reve':'◆','topaz':'T'}[option.dataset.icon] || 'S';

        modelDropdown.classList.remove('open');
        updateModelParams(selectedModel);
        // 17.07: схлопывание длинного списка сохраняет пиксельный scroll — при выборе НИЖНИХ
        // карточек (Recraft) вьюпорт проваливался ниже карточки и витрина «улетала за границу».
        // После выбора всегда возвращаемся к карточке модели (заголовок + витрина в кадре).
        modelDropdown.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const needsVideoRef = !!cfg.requiresVideoRef; // обязательно видео с движением (Kling Motion Control)
    const hasPrompt = promptInput.value.trim().length > 0;
    const hasRef = uploadedImages.length > 0;
    const promptOk = noPrompt || !!cfg.promptOptional || hasPrompt;
    const refOk = !needsRef || hasRef;
    const videoRefOk = !needsVideoRef || !!uploadedVideoRef;

    if (!promptOk) {
        document.getElementById('validationText').textContent = currentMode === 'video'
            ? 'Пожалуйста, предоставьте описание видео для генерации'
            : 'Пожалуйста, предоставьте описание изображения для генерации';
        validationMessage.classList.add('show');
    } else if (!refOk) {
        document.getElementById('validationText').textContent = '⚠️ Загрузите фото — для этой операции оно обязательно.';
        validationMessage.classList.add('show');
    } else if (!videoRefOk) {
        document.getElementById('validationText').textContent = '⚠️ Загрузите видео с движением — без него генерация не начнётся.';
        validationMessage.classList.add('show');
    } else {
        validationMessage.classList.remove('show');
    }

    generateBtn.disabled = !(promptOk && refOk && videoRefOk);
}

// Ужатая копия первого референса для «Улучшить промпт»: до 512px по большей
// стороне, JPEG. Полное качество уходит только в генерацию; улучшателю хватает
// миниатюры, чтобы видеть реальную сцену. При любой ошибке — просто без картинки.
async function buildImproveReference() {
    if (!uploadedImages.length) return null;
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = uploadedImages[0].dataUrl;
        });
        const MAX_SIDE = 512;
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // JPEG не знает прозрачности — подложка белым, иначе PNG с альфой станет чёрным
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.85);
    } catch (_) {
        return null;
    }
}

// Апскейл PRO (Topaz): вход ужимается до 2048px по длинной стороне (JPEG) — при факторе ×2
// выход ≤4K и закупка у kie не выскакивает из тира $0.10. Меньший вход не трогаем.
// kie kling-3.0/motion-control принимает фото ТОЛЬКО JPEG/PNG (webp отклоняет мгновенным
// «File type not supported» — ERR-20260715-001). Telegram-юзеры часто шлют webp:
// конвертируем на месте через canvas (по образцу shrinkForTopaz). Что canvas не декодирует
// (например heic) — отдаём как есть, бэкенд ответит честной ошибкой без списания.
async function ensureJpegPng(dataUrl) {
    try {
        const mime = String(dataUrl).slice(5, String(dataUrl).indexOf(';')).toLowerCase();
        if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/jpg') return dataUrl;
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        // JPEG не знает прозрачности — подложка белым (как в shrinkForTopaz)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.92);
    } catch (_) {
        return dataUrl;
    }
}

async function shrinkForTopaz(dataUrl) {
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        const MAX_SIDE = 2048;
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale >= 1) return dataUrl;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // JPEG не знает прозрачности — подложка белым (как в buildImproveReference)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.92);
    } catch (_) {
        return dataUrl;
    }
}

// === Суммарный бюджет тела вебхука ===
// n8n принимает тело до 16 МБ (дефолт), base64 добавляет ~37%. Поштучный лимит 10 МБ
// это не ловит: три фото по 7 МБ проходят поштучно и убивают запрос ДО воркфлоу
// (PayloadTooLargeError, инцидент 21.07 — юзер видит молчаливое «не принимает»).
// Перед отправкой сумма фото+видео сверяется с бюджетом; перебор лечится пережатием
// фото от самого тяжёлого к меньшим (2048px / JPEG 0.92, как вход Topaz) — качество
// оригинала страдает только там, где без этого запрос вообще не дошёл бы.
const WEBHOOK_IMAGES_BUDGET = 14 * 1024 * 1024;

async function shrinkReference(dataUrl) {
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        const MAX_SIDE = 2048;
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // JPEG не знает прозрачности — подложка белым (как shrinkForTopaz); в отличие
        // от него пережимаем и файлы мелкие по сторонам (тяжёлый PNG 2000px тоже перебор).
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', 0.92);
        // Пережатие не выиграло места (уже плотный JPEG) — оставляем оригинал
        return out.length < dataUrl.length ? out : dataUrl;
    } catch (_) {
        return dataUrl;
    }
}

async function fitImagesToBudget(data) {
    const videoLen = data.video ? data.video.length : 0;
    const total = () => videoLen + data.images.reduce((s, u) => s + u.length, 0);
    if (total() <= WEBHOOK_IMAGES_BUDGET) return true;
    const heaviestFirst = data.images
        .map((u, i) => ({ i, len: u.length }))
        .sort((a, b) => b.len - a.len);
    for (const { i } of heaviestFirst) {
        data.images[i] = await shrinkReference(data.images[i]);
        if (total() <= WEBHOOK_IMAGES_BUDGET) return true;
    }
    return false;
}

// === Параллельная закачка тяжёлых файлов (tus-приёмник, 22.07.2026) ===
// Один TCP-поток на дальнем VPN-маршруте с потерями не выбирает канал юзера (стенд+бой
// 21-22.07: параллель быстрее в 2,6 раза, сборка бит-в-бит, сверка размера в n8n).
// Файл режется на части и едет одновременно на upload1-6.coaladot.fun (отдельные
// соединения — у каждого поддомена свой сертификат, браузер не склеивает их в одно).
// Любой сбой любой части после ретрая -> молчаливый фолбэк на старый base64-путь.
// ⚠️ Каждый приёмник обязан быть перечислен в connect-src CSP (index.html). Поддомены
// НЕ покрываются записью https://coaladot.fun — браузер режет запрос до выхода в сеть,
// tus молча уходит в base64-фолбэк и в логах сервера этого не видно (разбор 04.08.2026:
// механизм так простоял мёртвым с 22.07 по 04.08). Добавляешь upload7 — правь и CSP.
const TUS_ENDPOINTS = ['upload1', 'upload2', 'upload3', 'upload4', 'upload5', 'upload6']
    .map(h => 'https://' + h + '.coaladot.fun/files/');
const TUS_PARTS = 6;
const TUS_MIN_PART = 512 * 1024; // мельче не режем: накладные расходы съедают выгоду

function tusPartCount(size) {
    return Math.max(1, Math.min(TUS_PARTS, Math.floor(size / TUS_MIN_PART) || 1));
}

function dataUrlToBlob(dataUrl) {
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
}

async function tusCreate(endpoint, len, concatHeader) {
    /** @type {Record<string, string>} */
    const headers = { 'Tus-Resumable': '1.0.0' };
    if (len != null) headers['Upload-Length'] = String(len);
    if (concatHeader) headers['Upload-Concat'] = concatHeader;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
        const res = await fetch(endpoint, { method: 'POST', headers, signal: ctl.signal });
        if (res.status !== 201) throw new Error('tus create ' + res.status);
        const loc = res.headers.get('Location');
        if (!loc) throw new Error('tus create: no Location');
        return loc;
    } finally {
        clearTimeout(timer);
    }
}

function tusPatch(url, blob, onLoaded) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PATCH', url);
        xhr.timeout = 300000; // потолок на часть; часть ~2 МБ едет минуты даже на слабом канале
        xhr.setRequestHeader('Tus-Resumable', '1.0.0');
        xhr.setRequestHeader('Upload-Offset', '0');
        xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
        xhr.upload.onprogress = (e) => { if (onLoaded && e.lengthComputable) onLoaded(e.loaded); };
        xhr.onload = () => (xhr.status === 204 ? resolve(null) : reject(new Error('tus patch ' + xhr.status)));
        xhr.onerror = () => reject(new Error('tus patch network'));
        xhr.ontimeout = () => reject(new Error('tus patch timeout'));
        xhr.send(blob);
    });
}

async function tusUploadPart(endpoint, blob, onLoaded) {
    // одна повторная попытка: обрыв единичной части не роняет весь файл
    for (let attempt = 0; ; attempt++) {
        try {
            const url = await tusCreate(endpoint, blob.size, 'partial');
            await tusPatch(url, blob, onLoaded);
            return url;
        } catch (e) {
            if (attempt >= 1) throw e;
        }
    }
}

async function tusUploadBlob(blob, onProgress) {
    const n = tusPartCount(blob.size);
    const partSize = Math.ceil(blob.size / n);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(blob.slice(i * partSize, Math.min(blob.size, (i + 1) * partSize)));
    const loaded = new Array(n).fill(0);
    const report = () => { if (onProgress) onProgress(Math.min(blob.size, loaded.reduce((a, b) => a + b, 0)), blob.size); };
    const urls = await Promise.all(parts.map((p, i) =>
        tusUploadPart(TUS_ENDPOINTS[i % TUS_ENDPOINTS.length], p, (l) => { loaded[i] = l; report(); })));
    // финал: сервер сшивает части в исходный файл (байты не перекодируются)
    const finalLoc = await tusCreate(TUS_ENDPOINTS[0], null, 'final;' + urls.join(' '));
    report();
    const id = finalLoc.split('/').pop();
    if (!id) throw new Error('tus: empty id');
    return { id, size: blob.size };
}

function setThumbProgress(index, pct) {
    const item = imagePreviews.querySelectorAll('.preview-item')[index];
    if (!item) return;
    let ov = item.querySelector('.preview-progress');
    if (pct == null) { if (ov) ov.remove(); return; }
    if (!ov) {
        ov = document.createElement('div');
        ov.className = 'preview-progress';
        item.appendChild(ov);
    }
    ov.textContent = pct + '%';
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
            // Есть референс — шлём ужатую копию, чтобы улучшатель видел сцену
            const refImage = await buildImproveReference();

            // Synchronous endpoint: returns { improved: "<text>" } and we drop it
            // straight into the prompt field (no copy-from-chat).
            const res = await fetch('https://coaladot.fun/webhook/qvabo-improve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({
                    action: 'improve_prompt',
                    prompt: promptInput.value,
                    chat_id: chatId,
                    initData: tg.initData
                }, refImage ? { image: refImage } : {}))
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
    // Kling Motion Control: без референс-видео не стартуем.
    if (genCfg.requiresVideoRef && !uploadedVideoRef) {
        showToast('Загрузите видео с движением — без него генерация не начнётся', 'error');
        return;
    }
    // kie принимает референс до 10 секунд при ориентации «как на фото» (при «как в видео» до 30).
    if (genCfg.requiresVideoRef && uploadedVideoRef && charOrientation === 'image' && uploadedVideoRef.duration > 10) {
        showToast('При ориентации «как на фото» видео до 10 секунд. Выберите «как в видео» или загрузите короче', 'error');
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
         * @property {string} [video]
         * @property {string} [character_orientation]
         * @property {boolean} [reve_fast]
         * @property {{id: string, size: number, mime: string}[]} [image_uploads]
         * @property {{id: string, size: number, mime: string}} [video_upload]
         */
        // === Параллельная отправка референсов через tus-приёмник (22.07.2026) ===
        // Reve остаётся на старом пути: его HTTP-нода читает base64 прямо из body.
        // Сбой закачки/недоступный приёмник -> tusImageRefs=null -> старый base64-путь ниже.
        let tusImageRefs = null;
        let tusVideoRef = null;
        {
            const cfg = modelConfigs[selectedModel] || {};
            const wantVideoRef = !!(currentMode === 'video' && (cfg.requiresVideoRef || cfg.optionalVideoRef) && uploadedVideoRef);
            const wantTus = selectedModel !== 'reve' && (uploadedImages.length > 0 || wantVideoRef);
            if (wantTus) {
                try {
                    /** @type {{blob: Blob, mime: string, thumbIndex: number|null, isVideo: boolean}[]} */
                    const jobs = [];
                    if (currentMode === 'video') {
                        if (uploadedImages.length) {
                            const im = uploadedImages[0];
                            // Kling motion: kie валидирует расширение — webp и прочее конвертируем в JPEG (ERR-20260715-001)
                            const blob = cfg.requiresVideoRef ? dataUrlToBlob(await ensureJpegPng(im.dataUrl)) : im.file;
                            if (!blob) throw new Error('blob convert fail');
                            jobs.push({ blob, mime: blob.type || im.file.type || 'image/jpeg', thumbIndex: 0, isVideo: false });
                        }
                        if (wantVideoRef) {
                            jobs.push({ blob: uploadedVideoRef.file, mime: uploadedVideoRef.file.type || 'video/mp4', thumbIndex: null, isVideo: true });
                        }
                    } else if (selectedModel === 'topaz-upscale' && uploadedImages.length) {
                        // Topaz: прежнее ужатие входа сохранено (лимит модели), едет уже ужатое
                        const blob = dataUrlToBlob(await shrinkForTopaz(uploadedImages[0].dataUrl));
                        if (!blob) throw new Error('blob convert fail');
                        jobs.push({ blob, mime: blob.type || 'image/jpeg', thumbIndex: 0, isVideo: false });
                    } else {
                        uploadedImages.forEach((im, i) => jobs.push({ blob: im.file, mime: im.file.type || 'image/jpeg', thumbIndex: i, isVideo: false }));
                    }
                    const totalBytes = jobs.reduce((s, j) => s + j.blob.size, 0);
                    const done = new Array(jobs.length).fill(0);
                    const refresh = () => {
                        const sum = done.reduce((a, b) => a + b, 0);
                        const pct = totalBytes ? Math.min(100, Math.floor(sum * 100 / totalBytes)) : 100;
                        generateBtn.innerHTML = '<div class="spinner"></div><span>Отправка файлов… ' + pct + '%</span>';
                    };
                    refresh();
                    const refs = [];
                    for (let k = 0; k < jobs.length; k++) {
                        const j = jobs[k];
                        const r = await tusUploadBlob(j.blob, (l) => {
                            done[k] = l;
                            refresh();
                            if (j.thumbIndex != null) setThumbProgress(j.thumbIndex, Math.min(100, Math.floor(l * 100 / j.blob.size)));
                        });
                        if (j.thumbIndex != null) setThumbProgress(j.thumbIndex, null);
                        refs.push({ id: r.id, size: r.size, mime: j.mime, isVideo: j.isVideo });
                    }
                    tusImageRefs = refs.filter(r => !r.isVideo).map(r => ({ id: r.id, size: r.size, mime: r.mime }));
                    const v = refs.find(r => r.isVideo);
                    if (v) tusVideoRef = { id: v.id, size: v.size, mime: v.mime };
                } catch (e) {
                    tusImageRefs = null;
                    tusVideoRef = null;
                    uploadedImages.forEach((_, i) => setThumbProgress(i, null));
                }
                generateBtn.innerHTML = '<div class="spinner"></div><span>Generating...</span>';
            }
        }
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
                // 01.08: сколько картинок реально уходит — берём из лимита модели. У всех видео-моделей
                // он равен 1 (поведение не меняется), у MiniMax H3 — 5 (столько MiniMax отдаёт бесплатно).
                images: uploadedImages.slice(0, Math.max(1, Number(videoConfig.maxFiles) || 1)).map(img => img.dataUrl)
            };
            // Kling Motion Control: длительность = замеренная длина референс-видео,
            // сам референс уходит отдельным полем video (data-URL, ≤9 МБ — проверено при выборе файла).
            if (videoConfig.requiresVideoRef && uploadedVideoRef) {
                data.video = uploadedVideoRef.dataUrl;
                data.duration = uploadedVideoRef.duration + 's';
                data.character_orientation = charOrientation;
                // Фото персонажа для kie motion-control: webp и прочее -> JPEG на месте
                if (data.images.length) data.images = [await ensureJpegPng(data.images[0])];
            }
            // 01.08, MiniMax H3: видео-образец необязателен, длительность ролика человек выбирает сам.
            // ⚠️ ДЕНЬГИ: MiniMax тарифицирует секунды входного видео вместе с роликом, поэтому его длину
            // обязательно передаём отдельным полем — по нему Balance Cost Check считает цену.
            if (videoConfig.optionalVideoRef && uploadedVideoRef) {
                data.video = uploadedVideoRef.dataUrl;
                data.ref_video_sec = uploadedVideoRef.duration;
            }
            // Звук-образец: у MiniMax он бесплатный, поэтому в цену не входит и в баллах не отражается.
            if (videoConfig.optionalAudioRef && uploadedAudioRef) {
                data.audio = uploadedAudioRef.dataUrl;
            }
            // Роль второй картинки: «последний кадр» переводит запрос в режим первый→последний кадр.
            if (videoConfig.imageRoles && h3ImageRole === 'last' && uploadedImages.length >= 2) {
                data.h3_last_frame = true;
            }
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
            // Topaz: ужать вход до 2048px (см. shrinkForTopaz), бэкенд берёт только 1-е фото
            if (selectedModel === 'topaz-upscale' && data.images.length) {
                data.images = [await shrinkForTopaz(data.images[0])];
            }
        }

        // Референсы уже уехали параллельными частями -> в вебхук идут лёгкие ссылки
        // вместо base64 (бэкенд заберёт файлы внутренней сетью и сверит размер).
        if (tusImageRefs && (tusImageRefs.length || tusVideoRef)) {
            data.image_uploads = tusImageRefs;
            data.images = [];
            if (tusVideoRef) {
                data.video_upload = tusVideoRef;
                delete data.video;
                // Длительность образца нужна для цены и на этом пути тоже — файл уехал ссылкой,
                // но секунды считает Balance Cost Check, а не бэкенд по файлу.
                if (uploadedVideoRef && uploadedVideoRef.duration) data.ref_video_sec = uploadedVideoRef.duration;
            }
        }

        // Сумма референсов больше бюджета вебхука -> тяжёлые фото пережимаются на месте;
        // не влезло даже после пережатия (видео 9 МБ + нежмущийся файл) -> честный отказ.
        if (data.images && data.images.length && !(await fitImagesToBudget(data))) {
            showToast('Фото слишком большие, не получилось ужать. Уберите часть фото или выберите файлы полегче', 'error');
            resetButton();
            return;
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
        // Без права бота писать доставка невозможна (результат уходит сообщением в чат) —
        // не сжигаем попытку молча, а просим разрешение; отказ = честный тост, запрос не шлём.
        if (!hasBotWriteAccess()) {
            requestBotWriteAccess((granted) => {
                if (!granted) {
                    showToast('Результат приходит сообщением от бота. Разреши боту писать тебе и повтори', 'error');
                    resetButton();
                    return;
                }
                sendData(data); // право получено — теперь проверка пройдёт
            });
            return;
        }
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
