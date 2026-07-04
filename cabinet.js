        var DEBUG = false;
        // ===== Config =====
        var CABINET_URL = 'https://coaladot.fun/webhook/qvabo-cabinet';
        var ACTION_URL  = 'https://coaladot.fun/webhook/qvabo-webapp';

        var tg = window.Telegram && window.Telegram.WebApp;

        // Demo data (used only outside Telegram, for layout preview)
        var DEMO = {
            user:   { id: 0, name: 'Гость', username: 'user' },
            balance:{ paid: 140, free: 5, total: 145 },
            total_spent: 12,
            free_claimed: true,
            history: [
                { type: 'topup',  amount: 140, date: '2026-06-06', label: 'Пакет «Старт»' },
                { type: 'free',   amount: 5,   date: '2026-06-06', label: 'За подписку' },
                { type: 'spend',  amount: 2,   date: '2026-06-06', label: 'Генерация' },
                { type: 'refund', amount: 1,   date: '2026-06-06', label: 'Возврат за сбой' },
                { type: 'spend',  amount: 3,   date: '2026-06-05', label: 'Генерация' }
            ]
        };

        var chatId = null;
        var initData = '';

        // ===== Telegram init =====
        (function () {
            if (tg) {
                tg.ready();
                try { tg.expand(); } catch (e) {}
                if (tg.BackButton) {
                    tg.BackButton.show();
                    tg.BackButton.onClick(function () { window.location.href = 'index.html'; });
                }
                initData = tg.initData || '';
                var u = tg.initDataUnsafe && tg.initDataUnsafe.user;
                if (u && u.id) {
                    chatId = u.id;
                }
            }
        })();

        // ===== Helpers =====
        var $ = function (id) { return document.getElementById(id); };

        function show(el) { el.classList.remove('hidden'); }
        function hide(el) { el.classList.add('hidden'); }

        var toastEl = $('toast');
        var toastTimer;
        function showToast(text) {
            toastEl.textContent = text;
            toastEl.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
        }

        function initial(name) {
            return (name && name.trim()) ? name.trim().charAt(0) : '🙂';
        }

        function fmtDate(iso) {
            // "2026-06-06" -> "06.06.2026"
            if (!iso || iso.indexOf('-') === -1) return iso || '';
            var p = iso.split('-');
            return p[2] + '.' + p[1] + '.' + p[0];
        }

        // ===== Telegram links via native opener =====
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

        // ===== Render =====
        function renderHistory(history) {
            var card = $('historyCard');
            card.innerHTML = '';
            if (!history || !history.length) {
                var empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.innerHTML = '<span class="es-emoji">🗂</span>Пока пусто';
                card.appendChild(empty);
                return;
            }
            history.slice(0, 10).forEach(function (op) {
                var sign, iconClass, amtClass;
                if (op.type === 'topup' || op.type === 'free') {
                    sign = '+'; iconClass = 'plus-green'; amtClass = 'green';
                } else if (op.type === 'refund') {
                    sign = '+'; iconClass = 'plus-gray'; amtClass = 'gray';
                } else { // spend
                    sign = '−'; iconClass = 'minus-gray'; amtClass = 'gray';
                }
                var row = document.createElement('div');
                row.className = 'history-row';

                // icon (sign — внутренняя константа, но кладём через textContent)
                var iconEl = document.createElement('div');
                iconEl.className = 'h-icon ' + iconClass;
                iconEl.textContent = sign;

                // body: label + date — ВСЕ значения из API через textContent
                var bodyEl = document.createElement('div');
                bodyEl.className = 'h-body';

                var labelEl = document.createElement('div');
                labelEl.className = 'h-label';
                labelEl.textContent = op.label || (op.type === 'spend' ? 'Генерация' : 'Операция');

                var dateEl = document.createElement('div');
                dateEl.className = 'h-date';
                dateEl.textContent = fmtDate(op.date);

                bodyEl.appendChild(labelEl);
                bodyEl.appendChild(dateEl);

                // amount: знак + сумма из API через textContent
                var amountEl = document.createElement('div');
                amountEl.className = 'h-amount ' + amtClass;
                amountEl.textContent = sign + op.amount;

                row.appendChild(iconEl);
                row.appendChild(bodyEl);
                row.appendChild(amountEl);
                card.appendChild(row);
            });
        }

        function render(d) {
            // greeting (предпочитаем имя из Telegram, фолбэк — из ответа эндпоинта)
            var nm = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name)
                     || (d.user && d.user.name) || 'друг';
            $('userName').textContent = nm;
            $('avatar').textContent = initial(nm);

            var b = d.balance || { paid: 0, free: 0, total: 0 };
            $('balanceTotal').textContent = b.total;
            $('balancePaid').textContent = b.paid;
            $('balanceFree').textContent = b.free;

            if (b.total <= 0) {
                hide($('balanceBreakdown'));
                show($('balanceEmpty'));
            } else {
                show($('balanceBreakdown'));
                hide($('balanceEmpty'));
            }

            $('totalSpent').textContent = (typeof d.total_spent === 'number') ? d.total_spent : 0;

            if (d.free_claimed) {
                hide($('freeAvailable'));
                show($('freeClaimed'));
            } else {
                show($('freeAvailable'));
                hide($('freeClaimed'));
            }

            renderHistory(d.history);

            // swap states
            hide($('skeleton'));
            hide($('errorState'));
            show($('data'));
        }

        function showError() {
            hide($('skeleton'));
            hide($('data'));
            show($('errorState'));
        }

        function showLoading() {
            hide($('errorState'));
            hide($('data'));
            show($('skeleton'));
        }

        // ===== Fetch cabinet data =====
        function loadCabinet() {
            // Outside Telegram → demo mode
            if (!tg || !chatId) {
                show($('tgNotice'));
                $('userName').textContent = DEMO.user.name;
                $('avatar').textContent = initial(DEMO.user.name);
                setTimeout(function () { render(DEMO); }, 400);
                return;
            }

            showLoading();
            fetch(CABINET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cabinet', chat_id: chatId, initData: initData })
            })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) { render(data); })
            .catch(function (err) {
                if (DEBUG) console.error('cabinet load failed:', err);
                showError();
            });
        }

        // ===== Claim free generations =====
        function claimFree() {
            var btn = $('claimFreeBtn');
            if (btn.disabled) return;

            if (!tg || !chatId) {
                showToast('Доступно только внутри Telegram');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Забираем…';
            if (tg.HapticFeedback) { try { tg.HapticFeedback.impactOccurred('medium'); } catch (e) {} }

            fetch(ACTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'claim_free', chat_id: chatId, initData: initData })
            })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                showToast('Готово! Проверь сообщение от бота 🎁');
                // refetch cabinet after ~2s so balance updates
                setTimeout(function () {
                    btn.disabled = false;
                    btn.innerHTML = '🎁 Забрать 5 бесплатных';
                    loadCabinet();
                }, 2000);
            })
            .catch(function (err) {
                if (DEBUG) console.error('claim_free failed:', err);
                showToast('Не получилось. Попробуй ещё раз');
                btn.disabled = false;
                btn.innerHTML = '🎁 Забрать 5 бесплатных';
            });
        }

        // ===== Wire up =====
        $('claimFreeBtn').addEventListener('click', claimFree);
        $('retryBtn').addEventListener('click', loadCabinet);

        // Go
        loadCabinet();
