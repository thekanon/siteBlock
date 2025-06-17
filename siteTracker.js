export const TEMP_ALLOW_TIME = 5 * 60 * 1000; // 5분
export const DAILY_LIMIT_WARNING = 10 * 60 * 1000; // 10분

export class SiteTracker {
  constructor() {
    this.visitStartTime = {};
    this.init();
  }

  init() {

    // 만료된 임시 허용 정리
    this.cleanupExpiredTempAllows();

    // 주기적으로 정리 작업 실행 (5분마다)
    setInterval(() => {
      this.cleanupExpiredTempAllows();
    }, 5 * 60 * 1000);

    // 웹 네비게이션 이벤트 리스너 (가장 중요)
    chrome.webNavigation.onBeforeNavigate.addListener((details) => {
      if (details.frameId === 0) {
        // 메인 프레임만
        this.handleBeforeNavigation(details.tabId, details.url);
      }
    });

    chrome.webNavigation.onCompleted.addListener((details) => {
      if (details.frameId === 0) {
        // 메인 프레임만
        this.handleNavigation(details.tabId, details.url);
      }
    });

    // 탭 업데이트 이벤트 리스너
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "loading" && tab.url) {
        this.handleBeforeNavigation(tabId, tab.url);
      }
      if (changeInfo.status === "complete" && tab.url) {
        this.handleNavigation(tabId, tab.url);
      }
    });

    // 탭 제거 이벤트 리스너
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.recordVisitEnd(tabId);
    });

    // 활성 탭 변경 이벤트 리스너
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.recordVisitEnd(activeInfo.tabId);
    });
  }

  async handleBeforeNavigation(tabId, url) {
    try {
      const domain = this.extractDomain(url);

      const blockedSites = await this.getBlockedSites();

      const matched = this.matchBlockedSite(domain, blockedSites);

      if (matched) {
        // 임시 허용 상태 확인
        const isTemporarilyAllowed = await this.checkTemporaryAllow(matched);

        if (isTemporarilyAllowed) {
          // 방문 시작 시간 기록 (임시 허용된 경우)
          this.visitStartTime[tabId] = {
            domain: matched,
            startTime: Date.now(),
            tempAllowed: true,
          };
          return;
        }

        await this.recordVisit(matched);
        const stats = await this.getTodayStats(matched);

        // 즉시 차단 페이지로 리다이렉트
        const blockPageUrl = chrome.runtime.getURL(
          `block-page.html?domain=${encodeURIComponent(domain)}&visits=${
            stats.visits
          }&time=${stats.time}`
        );

        chrome.tabs.update(tabId, { url: blockPageUrl });
        return;
      }
    } catch (error) {
    }
  }

  async handleNavigation(tabId, url) {
    try {
      const domain = this.extractDomain(url);

      // 차단 페이지가 아닌 경우에만 방문 기록
      if (!url.includes("block-page.html")) {
        await this.recordVisit(domain);
        this.visitStartTime[tabId] = { domain, startTime: Date.now() };
      }
    } catch (error) {
    }
  }

  async recordVisitEnd(tabId) {
    if (this.visitStartTime[tabId]) {
      const { domain, startTime, tempAllowed } = this.visitStartTime[tabId];
      const duration = Date.now() - startTime;
      this.recordVisitDuration(domain, duration);
      if (tempAllowed) {
        await this.updateTempAllowRemaining(domain, duration);
      }
      delete this.visitStartTime[tabId];
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      let hostname = urlObj.hostname;

      // www. 제거
      if (hostname.startsWith("www.")) {
        hostname = hostname.substring(4);
      }

      return hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  matchBlockedSite(domain, blockedSites) {
    for (const site of blockedSites) {
      if (domain === site || domain.endsWith("." + site)) {
        return site;
      }
    }
    return null;
  }

  async getBlockedSites() {
    try {
      const result = await chrome.storage.sync.get(["blockedSites"]);
      return result.blockedSites || [];
    } catch (error) {
      return [];
    }
  }

  async recordVisit(domain) {
    try {
      const today = this.getTodayString();
      const key = `visits_${domain}_${today}`;

      const result = await chrome.storage.local.get([key]);
      const currentVisits = result[key] || 0;

      await chrome.storage.local.set({
        [key]: currentVisits + 1,
      });

      await this.updateSiteStats(domain, 1, 0);
      await this.updateVisitTracking(domain);

    } catch (error) {
    }
  }

  async recordVisitDuration(domain, duration) {
    try {
      const today = this.getTodayString();
      const key = `time_${domain}_${today}`;

      const result = await chrome.storage.local.get([key]);
      const currentTime = result[key] || 0;

      await chrome.storage.local.set({
        [key]: currentTime + duration,
      });

      await this.updateSiteStats(domain, 0, duration);
      await this.checkDailyLimitWarning();

    } catch (error) {
    }
  }

  async getTodayStats(domain) {
    try {
      const today = this.getTodayString();
      const visitKey = `visits_${domain}_${today}`;
      const timeKey = `time_${domain}_${today}`;

      const result = await chrome.storage.local.get([visitKey, timeKey]);

      return {
        visits: result[visitKey] || 0,
        time: Math.floor((result[timeKey] || 0) / 1000 / 60), // 분 단위로 변환
      };
    } catch (error) {
      return { visits: 0, time: 0 };
    }
  }

  async checkTemporaryAllow(domain) {
    try {
      const tempAllowKey = `temp_allow_${domain}`;
      const result = await chrome.storage.local.get([tempAllowKey]);
      const data = result[tempAllowKey];

      if (data) {
        let remaining = 0;
        if (typeof data === "number") {
          remaining = data - Date.now();
        } else if (typeof data.remaining === "number") {
          remaining = data.remaining;
        }

        if (remaining > 0) {
          return true;
        } else {
          await chrome.storage.local.remove([tempAllowKey]);
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async cleanupExpiredTempAllows() {
    try {
      const storage = await chrome.storage.local.get();
      const now = Date.now();
      const keysToRemove = [];

      for (const [key, value] of Object.entries(storage)) {
        if (key.startsWith("temp_allow_")) {
          if (typeof value === "number" && value < now) {
            keysToRemove.push(key);
          } else if (value && typeof value.remaining === "number" && value.remaining <= 0) {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
    }
  }

  async updateTempAllowRemaining(domain, duration) {
    const key = `temp_allow_${domain}`;
    const result = await chrome.storage.local.get([key]);
    const data = result[key];
    if (!data) return;

    let remaining = 0;
    if (typeof data === "number") {
      remaining = data - Date.now();
    } else if (typeof data.remaining === "number") {
      remaining = data.remaining;
    }

    remaining -= duration;

    if (remaining > 0) {
      await chrome.storage.local.set({ [key]: { remaining } });
    } else {
      await chrome.storage.local.remove([key]);
    }
  }

  async updateSiteStats(domain, visits, time) {
    const key = `site_stats_${domain}`;
    const result = await chrome.storage.local.get([key]);
    const stats = result[key] || { daily: {}, weekly: {}, total: { visits: 0, time: 0 } };

    const today = this.getTodayString();
    const week = this.getWeekString();

    stats.total.visits += visits;
    stats.total.time += time;

    if (!stats.daily[today]) {
      stats.daily[today] = { visits: 0, time: 0 };
    }
    stats.daily[today].visits += visits;
    stats.daily[today].time += time;

    if (!stats.weekly[week]) {
      stats.weekly[week] = { visits: 0, time: 0 };
    }
    stats.weekly[week].visits += visits;
    stats.weekly[week].time += time;

    await chrome.storage.local.set({ [key]: stats });
  }

  async updateVisitTracking(domain) {
    const { visit_tracking = {} } = await chrome.storage.local.get(["visit_tracking"]);
    visit_tracking[domain] = (visit_tracking[domain] || 0) + 1;
    await chrome.storage.local.set({ visit_tracking });
  }

  getWeekString(date = new Date()) {
    const firstJan = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - firstJan) / 86400000);
    const week = Math.ceil((days + firstJan.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  async checkDailyLimitWarning() {
    try {
      const today = this.getTodayString();
      const { blockedSites = [] } = await chrome.storage.sync.get(["blockedSites"]);
      const allData = await chrome.storage.local.get();
      let total = 0;
      for (const site of blockedSites) {
        const timeKey = `time_${site}_${today}`;
        if (allData[timeKey]) {
          total += allData[timeKey];
        }
      }

      if (total > DAILY_LIMIT_WARNING) {
        const opt = {
          type: "basic",
          title: "사용 시간 경고",
          message: "오늘 차단 사이트 사용 시간이 10분을 초과했습니다.",
          requireInteraction: true,
        };
        chrome.notifications.create("dailyLimit", opt);
      }
    } catch (e) {}
  }

  getTodayString() {
    const today = new Date();
    return today.toISOString().split("T")[0]; // YYYY-MM-DD 형식
  }
}
