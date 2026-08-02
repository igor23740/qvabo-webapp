  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch(e){} }
  function goBack(){
    if (tg && tg.BackButton) { try { tg.close(); return; } catch(e){} }
    if (document.referrer) { history.back(); } else { location.href = 'index.html'; }
  }
  if (tg && tg.BackButton) {
    try { tg.BackButton.show(); tg.BackButton.onClick(function(){ location.href='index.html'; }); } catch(e){}
  }
  document.getElementById('backBtn').addEventListener('click', goBack);
  // Внешние ссылки (qvabo.studio и др.) — в системный браузер, не прерывая чтение оферты.
  // t.me-ссылки оставлены штатному поведению (переход в чат — осознанное действие юзера).
  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="http"]') : null;
    if (!a) return;
    var h = a.getAttribute('href');
    if (h.indexOf('https://t.me/') === 0) return;
    ev.preventDefault();
    if (tg && tg.openLink) { try { tg.openLink(h); return; } catch(e){} }
    window.open(h, '_blank', 'noopener');
  });
