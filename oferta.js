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
