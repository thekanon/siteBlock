function getWeekString(date = new Date()) {
  const firstJan = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - firstJan) / 86400000);
  const week = Math.ceil((days + firstJan.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const site = params.get('site');
  const title = document.getElementById('title');
  const container = document.getElementById('stats');
  if (!site) {
    container.textContent = '사이트 정보 없음';
    return;
  }
  title.textContent = `${site} 통계`;
  const key = `site_stats_${site}`;
  const result = await chrome.storage.local.get([key]);
  const data = result[key];
  if (!data) {
    container.textContent = '데이터 없음';
    return;
  }
  const dailyRows = Object.entries(data.daily)
    .sort()
    .map(([d, v]) => `<tr><td>${d}</td><td>${v.visits}</td><td>${Math.floor(v.time/1000/60)}</td></tr>`)
    .join('');
  const weeklyRows = Object.entries(data.weekly)
    .sort()
    .map(([w, v]) => `<tr><td>${w}</td><td>${v.visits}</td><td>${Math.floor(v.time/1000/60)}</td></tr>`)
    .join('');
  container.innerHTML = `
    <h3>일별 통계</h3>
    <table><tr><th>날짜</th><th>방문수</th><th>시간(분)</th></tr>${dailyRows}</table>
    <h3>주별 통계</h3>
    <table><tr><th>주</th><th>방문수</th><th>시간(분)</th></tr>${weeklyRows}</table>
  `;
});
