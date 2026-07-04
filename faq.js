        // ===== Telegram Mini App init =====
        (function () {
            var tg = window.Telegram && window.Telegram.WebApp;
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

        // Активация по клавиатуре (Enter / Space) — как клик
        function activateOnKey(el, handler) {
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    handler();
                }
            });
        }

        // ===== Accordion logic (categories) =====
        document.querySelectorAll('.cat-head').forEach(function (head) {
            // Доступность: заголовок-аккордеон управляется с клавиатуры
            head.setAttribute('role', 'button');
            head.setAttribute('tabindex', '0');
            head.setAttribute('aria-expanded', head.closest('.category').classList.contains('open') ? 'true' : 'false');
            function toggleCat() {
                var cat = head.closest('.category');
                var open = cat.classList.toggle('open');
                head.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            head.addEventListener('click', toggleCat);
            activateOnKey(head, toggleCat);
        });

        // ===== Accordion logic (Q&A) =====
        document.querySelectorAll('.qa-q').forEach(function (q) {
            // Доступность: вопрос-аккордеон управляется с клавиатуры
            q.setAttribute('role', 'button');
            q.setAttribute('tabindex', '0');
            q.setAttribute('aria-expanded', q.closest('.qa').classList.contains('open') ? 'true' : 'false');
            function toggleQa() {
                var qa = q.closest('.qa');
                var open = qa.classList.toggle('open');
                q.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            q.addEventListener('click', toggleQa);
            activateOnKey(q, toggleQa);
        });

        // ===== Telegram-ссылки через нативный openTelegramLink (с фолбэком) =====
        document.querySelectorAll('a[href^="https://t.me/"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                var tg = window.Telegram && window.Telegram.WebApp;
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
