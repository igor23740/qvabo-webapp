        var DEBUG = false;
        // ===== Telegram Mini App init =====
        var tg = window.Telegram && window.Telegram.WebApp;
        (function () {
            if (tg) {
                tg.ready();
                try { tg.expand(); } catch (e) {}
                if (tg.BackButton) {
                    tg.BackButton.show();
                    tg.BackButton.onClick(function () {
                        window.location.href = 'index.html';
                    });
                }
            }
        })();

        // ===== Telegram-ссылки через нативный openTelegramLink (с фолбэком) =====
        document.querySelectorAll('a[href^="https://t.me/"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                if (tg && typeof tg.openTelegramLink === 'function') {
                    e.preventDefault();
                    // @ts-expect-error TS2339 — link здесь всегда <a> (селектор
                    // 'a[href^="https://t.me/"]'), но querySelectorAll по составному
                    // селектору типизируется как generic Element в lib.dom.d.ts
                    // (не как HTMLAnchorElement), .href не виден без потери типа на SVG.
                    tg.openTelegramLink(link.href);
                }
            });
        });

        // ===== Toast helper =====
        var toastEl = document.getElementById('toast');
        var toastTimer;
        function showToast(text) {
            toastEl.textContent = text;
            toastEl.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () {
                toastEl.classList.remove('show');
            }, 2600);
        }

        // ===== Бэкенд-связь =====
        // Контракт сверен с живым воркфлоу O1JO6wxE0PfzWPrOvaN8S (coaladot.fun):
        //   buy:        { action:'buy', package:'start'|'teaser'|'promo'|'pro'|'max', chat_id:<number> }
        //               ('max' = «Блокбастер»: карточка-витрина без кнопки, ключа на бэке пока нет)
        //   claim_free: { action:'claim_free', chat_id:<number> }
        // HTTP-ответ пустой — ссылка на оплату / результат подписки приходят
        // сообщением бота в личный чат (решение владельца, Вариант А).
        var WEBHOOK_URL = 'https://coaladot.fun/webhook/qvabo-webapp';

        function getChatId() {
            if (tg && tg.initDataUnsafe) {
                if (tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) return tg.initDataUnsafe.user.id;
                if (tg.initDataUnsafe.chat && tg.initDataUnsafe.chat.id) return tg.initDataUnsafe.chat.id;
            }
            return null;
        }

        function postAction(payload) {
            // initData нужен бэкенду для проверки подписи Telegram (иначе запрос отклонится)
            var full = Object.assign({ initData: (tg && tg.initData) || '' }, payload);
            return fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(full)
            });
        }

        function setBtnLoading(btn, loading) {
            if (loading) {
                if (btn.dataset.label == null) btn.dataset.label = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = 'Минутку…';
            } else {
                btn.disabled = false;
                if (btn.dataset.label != null) btn.innerHTML = btn.dataset.label;
            }
        }

        // ===== Оплата =====
        // Фронт только шлёт action=buy; бот собирает платёжную ссылку Robokassa
        // и присылает её кнопкой в личный чат пользователя.
        document.querySelectorAll('.pay-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled) return;
                var pkg = btn.dataset.package;
                var chatId = getChatId();

                if (!tg || !chatId) {
                    // Превью вне Telegram — реального chat_id нет.
                    showToast('Откройте оплату через бота в Telegram');
                    if (DEBUG) console.log('BUY payload (preview):', { action: 'buy', package: pkg });
                    return;
                }

                if (tg.HapticFeedback) { try { tg.HapticFeedback.impactOccurred('medium'); } catch (e) {} }
                setBtnLoading(btn, true);

                postAction({ action: 'buy', package: pkg, chat_id: chatId })
                    .then(function (r) {
                        if (!r.ok) throw new Error('сервер ' + r.status);
                        showToast('💬 Ссылка на оплату отправлена в чат с ботом');
                        setTimeout(function () { try { tg.close(); } catch (e) {} }, 1800);
                    })
                    .catch(function (err) {
                        showToast('Не удалось: ' + err.message);
                        setBtnLoading(btn, false);
                    });
            });
        });

        // ===== Бесплатные генерации (за подписку на канал) =====
        // Фронт шлёт action=claim_free; бот проверяет подписку на @qvabo_studio
        // (getChatMember) и один раз начисляет 5 генераций, ответ — сообщением в чат.
        var freeBtn = document.getElementById('freeClaimBtn');
        if (freeBtn) {
            freeBtn.addEventListener('click', function () {
                if (freeBtn.disabled) return;
                var chatId = getChatId();

                if (!tg || !chatId) {
                    showToast('Откройте через бота в Telegram');
                    if (DEBUG) console.log('CLAIM_FREE payload (preview):', { action: 'claim_free' });
                    return;
                }

                if (tg.HapticFeedback) { try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {} }
                setBtnLoading(freeBtn, true);

                postAction({ action: 'claim_free', chat_id: chatId })
                    .then(function (r) {
                        if (!r.ok) throw new Error('сервер ' + r.status);
                        showToast('🎁 Готово! Загляните в чат с ботом');
                        setTimeout(function () { try { tg.close(); } catch (e) {} }, 1800);
                    })
                    .catch(function (err) {
                        showToast('Не удалось: ' + err.message);
                        setBtnLoading(freeBtn, false);
                    });
            });
        }

        // ===== Видео-тарифы: вайтлист снят 2026-07-06 — карточки видны всем =====
        // Косметический гейт (как видео-вкладка в index.js). Реальная защита оплаты — Access Gate на бэкенде.
        // Константа оставлена для быстрого отката: вернуть
        // `if (VIDEO_WHITELIST.indexOf(Number(uid)) !== -1) {`. ДУБЛЬ: index.js —
        // там гейт снят той же правкой; при возврате вайтлиста править оба файла синхронно.
        var VIDEO_WHITELIST = [371324849, 369287553];
        (function () {
            try {
                var uid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
                if (true) { // вайтлист снят 2026-07-06: видео-тарифы видны всем
                    // 05.07: + большие видео-пакеты «Промо»/«Трейлер»/«Блокбастер» — открываются вместе с видео
                    ['videoPlan', 'promoPlan', 'proPlan', 'maxPlan'].forEach(function (id) {
                        var el = document.getElementById(id);
                        if (el) el.style.display = '';
                    });
                }
            } catch (e) {}
        })();
