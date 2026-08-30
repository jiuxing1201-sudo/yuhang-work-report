import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, BookOpen, CalendarCheck, CaretDown, CaretLeft,
  CaretRight, Check, CheckCircle, CloudCheck, ImageSquare, ImagesSquare,
  Plus, Sparkle, Target, ThumbsUp, UploadSimple, WarningCircle, X,
} from "@phosphor-icons/react";

const baseUrl = import.meta.env.BASE_URL || "/";
const staticDataMode = import.meta.env.VITE_STATIC_DATA === "true";

function publicUrl(value) {
  if (!value || /^(data:|blob:|https?:)/.test(value)) return value;
  return `${baseUrl}${String(value).replace(/^\/+/, "")}`;
}

function normalizeImages(source) {
  return Object.fromEntries(Object.entries(source || {}).map(([date, image]) => {
    const items = (image.items?.length ? image.items : [image]).map((item) => ({ ...item, src: publicUrl(item.src) }));
    return [date, { ...image, ...items[0], items }];
  }));
}

const wallpapers = [
  { id: "coast", label: "海岸晨光", src: publicUrl("assets/wallpaper-coast.png") },
  { id: "valley", label: "山谷晴空", src: publicUrl("assets/wallpaper-valley.png") },
  { id: "sunset", label: "日落云海", src: publicUrl("assets/wallpaper-sunset.png") },
];

const fieldMap = {
  achieved: "今日达成",
  good: "今日做得好的",
  improve: "还能做的更好的",
  tomorrow: "明日计划",
};

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const categoryColors = ["#56a9ff", "#55c991", "#f4ba59", "#ea7a72", "#a884e8"];
const workThemeRules = [
  { id: "content", label: "视频内容生产与交付", pattern: /视频|剪辑|片子|拍摄|包版|口播/, summary: "完成多批 ADQ 与岸源短视频剪辑、拍摄及包版迭代，持续提升批量交付效率与成片质量。" },
  { id: "studio", label: "拍摄执行与直播间落地", pattern: /直播间|灯光|置景|场景|道具|机位/, summary: "推进多位老师的拍摄执行，并完成直播间置景、灯光、设备、道具和实际运行效果优化。" },
  { id: "assets", label: "素材资产与工作流程建设", pattern: /素材|硬盘|网盘|归档|知识库|整理/, summary: "持续整理硬盘、百度网盘和公司素材库，沉淀剪辑模板、字体、音效及可复用知识资产。" },
  { id: "learning", label: "学习成长与跨部门协同", pattern: /培训|课程|学习|对接|协同|观摩/, summary: "通过课程培训、现场观摩和跨部门对接，把学习收获与业务问题转化为后续优化方向。" },
];
const keywordDefinitions = [
  ["视频剪辑", /视频|剪辑|片子|adq/gi], ["直播间", /直播间/gi], ["素材整理", /素材|硬盘|网盘|归档/gi],
  ["拍摄", /拍摄|录制|口播/gi], ["调整优化", /调整|优化|改进/gi], ["搭建", /搭建|布置|置景/gi],
  ["短视频", /短视频/gi], ["老师", /老师|高导/gi], ["灯光", /灯光/gi], ["上传归档", /上传|归档|拷贝/gi],
  ["设计包版", /设计|包版/gi], ["课程培训", /课程|培训|学习/gi], ["工作流程", /工作流|流程|规范/gi],
  ["百度网盘", /百度网盘|网盘/gi], ["设备道具", /设备|道具|相机/gi], ["场景方案", /场景|方案|背景/gi],
  ["对接协同", /对接|协同|品宣/gi], ["交付审核", /交付|审核/gi], ["知识沉淀", /知识库|模板|字体|音效/gi],
  ["现场执行", /现场|执行|观摩/gi], ["复盘反馈", /复盘|反馈|问题/gi], ["上海", /上海/gi],
];

const importedImages = {
  "2026-08-28": {
    src: publicUrl("report-images/2026-08-28-1.jpeg"),
    name: "8月28日日报原图 1",
    items: [
      { src: publicUrl("report-images/2026-08-28-1.jpeg"), name: "8月28日日报原图 1" },
      { src: publicUrl("report-images/2026-08-28-2.png"), name: "8月28日日报原图 2" },
    ],
  },
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function buildCalendar(year, month) {
  const first = new Date(year, month - 1, 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const previousDays = new Date(year, month - 1, 0).getDate();
  const cells = [];
  for (let index = leading - 1; index >= 0; index -= 1) {
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    cells.push({ year: previousYear, month: previousMonth, day: previousDays - index, muted: true });
  }
  for (let day = 1; day <= days; day += 1) cells.push({ year, month, day, muted: false });
  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    cells.push({ year: nextYear, month: nextMonth, day: nextDay, muted: true });
    nextDay += 1;
  }
  return cells;
}

function formatSyncTime(value) {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function loadImages() {
  try {
    return {
      ...importedImages,
      ...JSON.parse(localStorage.getItem("work-dashboard-images") || "{}"),
    };
  } catch {
    return importedImages;
  }
}

function imageItems(image) {
  return image?.items?.length ? image.items : image ? [image] : [];
}

function splitWorkItems(value) {
  const normalized = String(value || "").replace(/\u00a0/g, " ").trim();
  if (!normalized) return [];
  const numbered = normalized.split(/(?=\d+[、.．])/).map((item) => item.replace(/^\d+[、.．]\s*/, "").trim()).filter(Boolean);
  return numbered.length > 1 ? numbered : [normalized];
}

function StatusIcon({ type }) {
  const config = {
    achieved: { icon: CheckCircle, color: "#5d9cff" },
    good: { icon: ThumbsUp, color: "#55c991" },
    improve: { icon: Target, color: "#f2a34d" },
    tomorrow: { icon: CalendarCheck, color: "#a884e8" },
  }[type];
  const Icon = config.icon;
  return <span className="section-icon" style={{ "--icon-color": config.color }}><Icon size={15} weight="fill" /></span>;
}

function ReportText({ value }) {
  return <p className="original-report-text">{value || "飞书中这一项没有填写内容"}</p>;
}

export function App() {
  const [viewMonth, setViewMonth] = useState({ year: 2026, month: 8 });
  const [reports, setReports] = useState([]);
  const [weeklyReports, setWeeklyReports] = useState([]);
  const [selectedDate, setSelectedDate] = useState("2026-08-28");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [syncState, setSyncState] = useState({ status: "idle", at: null, message: "" });
  const [wallpaper, setWallpaper] = useState(wallpapers[2]);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [images, setImages] = useState(loadImages);
  const wallpaperInput = useRef(null);
  const storyInput = useRef(null);
  const detailPanel = useRef(null);

  const reportByDate = useMemo(() => reports.reduce((result, report) => {
    if (!result[report.date] || result[report.date].commitTime < report.commitTime) result[report.date] = report;
    return result;
  }, {}), [reports]);
  const weeklyByDate = useMemo(() => weeklyReports.reduce((result, report) => {
    if (!result[report.date] || result[report.date].commitTime < report.commitTime) result[report.date] = report;
    return result;
  }, {}), [weeklyReports]);
  const monthCells = useMemo(() => {
    const workdays = buildCalendar(viewMonth.year, viewMonth.month)
      .filter((cell) => ![0, 6].includes(new Date(cell.year, cell.month - 1, cell.day).getDay()));
    return workdays.slice(0, 5).every((cell) => cell.muted) ? workdays.slice(5) : workdays;
  }, [viewMonth]);
  const selectedReport = reports.find((report) => report.id === selectedReportId)
    || weeklyReports.find((report) => report.id === selectedReportId)
    || reportByDate[selectedDate]
    || weeklyByDate[selectedDate]
    || null;
  const selectedImage = images[selectedDate] || null;
  const imageDates = useMemo(
    () => [...new Set(reports.filter((report) => images[report.date]).map((report) => report.date))],
    [reports, images],
  );
  const imageCount = useMemo(
    () => imageDates.reduce((total, date) => total + imageItems(images[date]).length, 0),
    [imageDates, images],
  );
  const monthlyTimeline = useMemo(
    () => Object.values(reportByDate).sort((a, b) => a.commitTime - b.commitTime),
    [reportByDate],
  );
  const workThemes = useMemo(() => workThemeRules.map((theme) => {
    const matched = reports.filter((report) => theme.pattern.test(Object.values(report.fields).join(" ")));
    return { ...theme, count: matched.length };
  }).filter((theme) => theme.count), [reports]);
  const keywordCloud = useMemo(() => {
    const text = reports.flatMap((report) => Object.values(report.fields)).join(" ");
    const words = keywordDefinitions
      .map(([label, pattern]) => ({ label, count: (text.match(pattern) || []).length }))
      .filter((item) => item.count)
      .sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...words.map((item) => item.count));
    return words.map((item, index) => ({ ...item, weight: .42 + (item.count / max) * .58, colorIndex: index % categoryColors.length }));
  }, [reports]);
  const monthlyImages = useMemo(
    () => imageDates.flatMap((date) => imageItems(images[date]).map((item) => ({ ...item, date }))),
    [imageDates, images],
  );

  const syncReports = async (withImages = false, silent = false) => {
    if (!silent) setSyncState((state) => ({ ...state, status: "loading", message: "" }));
    try {
      const endpoint = staticDataMode
        ? `${publicUrl(`data/${viewMonth.year}-${pad(viewMonth.month)}.json`)}?v=${Date.now()}`
        : `/api/sync?year=${viewMonth.year}&month=${viewMonth.month}${withImages ? "&images=1&full=1" : ""}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "同步失败");
      setReports(data.dailyReports);
      setWeeklyReports(data.weeklyReports);
      if (data.images) setImages((current) => ({ ...current, ...normalizeImages(data.images) }));
      const latest = [...data.dailyReports].sort((a, b) => b.commitTime - a.commitTime)[0];
      setSelectedDate(latest?.date || dateKey(viewMonth.year, viewMonth.month, 1));
      setSelectedReportId(latest?.id || null);
      const imageMessage = staticDataMode
        ? "已加载网站最新发布版本"
        : withImages
        ? `已检查${data.imageSync?.checked || 0}篇汇报，新增${data.imageSync?.imported || 0}张原图`
        : "文字已同步，图片保持最近发布版本";
      setSyncState({ status: "success", at: data.syncedAt, message: imageMessage });
    } catch (error) {
      setSyncState({ status: "error", at: null, message: error.message });
    }
  };

  useEffect(() => {
    syncReports(false);
    if (!staticDataMode) return undefined;
    const timer = window.setInterval(() => syncReports(false, true), 60_000);
    return () => window.clearInterval(timer);
  }, [viewMonth.year, viewMonth.month]);

  const changeMonth = (offset) => {
    setViewMonth(({ year, month }) => {
      const value = new Date(year, month - 1 + offset, 1);
      return { year: value.getFullYear(), month: value.getMonth() + 1 };
    });
  };

  const uploadWallpaper = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setWallpaper({ id: "custom", label: "自定义壁纸", src: reader.result });
      setWallpaperOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const uploadStory = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = {
        ...images,
        [selectedDate]: {
          src: reader.result,
          name: file.name,
          size: file.size,
          addedAt: new Date().toISOString(),
        },
      };
      setImages(next);
      try {
        localStorage.setItem("work-dashboard-images", JSON.stringify(next));
      } catch {
        setSyncState((state) => ({ ...state, message: "图片已加入本次浏览，但文件过大，刷新后可能无法保留。" }));
      }
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const openReport = (report) => {
    setSelectedDate(report.date);
    setSelectedReportId(report.id);
    setReportOpen(true);
  };

  const selectDate = (date, reportId = null, reveal = false) => {
    setSelectedDate(date);
    setSelectedReportId(reportId);
    if (reveal || window.innerWidth <= 860) {
      window.requestAnimationFrame(() => detailPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const openImage = (date) => {
    setSelectedDate(date);
    const image = images[date];
    if (image) setLightbox({ date, items: imageItems(image), index: 0 });
    else storyInput.current?.click();
  };

  const stepLightbox = (offset) => {
    setLightbox((current) => {
      if (!current) return current;
      const index = (current.index + offset + current.items.length) % current.items.length;
      return { ...current, index };
    });
  };

  const selectedDay = Number(selectedDate.slice(-2));
  const selectedDateObject = selectedReport ? new Date(`${selectedDate}T12:00:00+08:00`) : null;
  const selectedImageItems = imageItems(selectedImage);
  const monthLabel = `${viewMonth.year}年${viewMonth.month}月`;

  return (
    <main className="dashboard" style={{ backgroundImage: `url(${wallpaper.src})` }}>
      <div className="ambient-shade" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><BookOpen size={22} weight="duotone" /><strong>宇航的工作日报</strong></div>
        <button className="month-button">{monthLabel} <CaretDown size={13} /></button>
        <span className="sync-status"><CloudCheck size={14} /> {syncState.status === "success" ? `已同步${reports.length}篇日报` : "连接飞书汇报"}</span>
        <div className="top-actions">
          <span className="top-chip"><Sparkle size={13} weight="fill" /> 飞书原文 · {reports.length}篇</span>
          <span className="top-chip"><ImagesSquare size={13} /> 日报原图 · {imageCount}张</span>
          <button className="ghost-button" onClick={() => storyInput.current?.click()}><Plus size={14} /> 添加原图</button>
        </div>
      </header>

      <button className="wallpaper-trigger" onClick={() => setWallpaperOpen((value) => !value)}><ImageSquare size={16} /> 更换壁纸</button>

      <section className="workspace calendar-workspace">
        <section className="calendar-panel month-map-panel glass-panel">
          <div className="map-toolbar">
            <div className="map-title">
              <span className="mission-label"><Sparkle size={12} weight="fill" /> MONTHLY QUEST</span>
              <h1>{monthLabel} · 工作任务地图</h1>
              <p>{syncState.message || `上次更新 ${formatSyncTime(syncState.at)}`} · 点击日期在右侧查看完整记录</p>
            </div>
            <div className="map-controls">
              <button className={`sync-button ${syncState.status}`} onClick={() => syncReports(false)} disabled={syncState.status === "loading"}>
                <ArrowClockwise size={15} className={syncState.status === "loading" ? "spinning" : ""} />
                {syncState.status === "loading" ? "正在同步" : "同步更新"}
              </button>
              <div className="icon-buttons">
                <button aria-label="上个月" onClick={() => changeMonth(-1)}><CaretLeft /></button>
                <button aria-label="下个月" onClick={() => changeMonth(1)}><CaretRight /></button>
              </div>
            </div>
          </div>

          <div className="month-hud" aria-label="本月数据概览">
            <div><strong>{reports.length}</strong><span>完成日报</span></div>
            <div><strong>{imageCount}</strong><span>工作截图</span></div>
            <div><strong>{weeklyReports.length}</strong><span>周报记录</span></div>
            <div className="progress-stat"><span>本月记录进度</span><b><i style={{ width: `${Math.min(100, Math.round((reports.length / Math.max(1, new Date(viewMonth.year, viewMonth.month, 0).getDate())) * 100))}%` }} /></b></div>
          </div>

          <div className="week-row map-week-row">{["周一", "周二", "周三", "周四", "周五"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid map-calendar-grid">
            {monthCells.map((cell) => {
              const key = dateKey(cell.year, cell.month, cell.day);
              const report = reportByDate[key];
              const weeklyReport = weeklyByDate[key];
              const dayRecord = report || weeklyReport;
              const isSelected = key === selectedDate;
              const userImage = images[key];
              const firstImage = imageItems(userImage)[0];
              const achieved = report?.fields?.["今日达成"] || "";
              const workItems = splitWorkItems(achieved).slice(0, 2);
              return (
                <button
                  key={key}
                  className={`day-cell map-day-cell ${cell.muted ? "muted" : ""} ${isSelected ? "selected" : ""} ${dayRecord ? "completed" : ""} ${firstImage ? "has-thumbnail" : ""} ${!cell.muted && !dayRecord ? "rest" : ""}`}
                  onClick={() => {
                    if (cell.muted) setViewMonth({ year: cell.year, month: cell.month });
                    else {
                      selectDate(key, dayRecord?.id || null);
                    }
                  }}
                >
                  <span className="map-day-top"><b>{cell.day}</b>{dayRecord && <em>完成</em>}</span>
                  {firstImage ? (
                    <span className="day-thumb" style={{ backgroundImage: `url(${firstImage.src})` }}>
                      <img src={firstImage.src} alt={`${cell.day}日工作缩略图`} />
                      {imageItems(userImage).length > 1 && <i>{imageItems(userImage).length}张</i>}
                    </span>
                  ) : dayRecord ? (
                    <span className="text-quest" style={{ "--quest-color": categoryColors[cell.day % categoryColors.length] }}><Target size={15} weight="fill" /></span>
                  ) : !cell.muted ? <span className="rest-label">调休</span> : null}
                  {dayRecord && <ul className="day-task-list">{(workItems.length ? workItems : [weeklyReport ? "查看本周工作记录" : "查看当天工作记录"]).map((item, index) => <li key={index}>{item}</li>)}</ul>}
                </button>
              );
            })}
          </div>
        </section>

        <aside ref={detailPanel} className="detail-panel glass-panel">
          {selectedReport ? (
            <>
              <div className="detail-heading">
                <div>
                  <h2>{viewMonth.month}月{selectedDay}日 <span>{weekdays[selectedDateObject.getDay()]}</span></h2>
                  <p>以下文字保持飞书汇报原文</p>
                </div>
                <span className="detail-status"><CheckCircle size={13} weight="fill" /> 已完成</span>
              </div>
              {selectedImageItems.length ? (
                <button className={`detail-gallery thumbnail-grid thumbnail-count-${Math.min(selectedImageItems.length, 4)}`} onClick={() => openImage(selectedDate)} aria-label="查看当天全部原图">
                  {selectedImageItems.slice(0, 4).map((item, index) => <img key={item.hash || item.src} src={item.src} alt={`当天原图 ${index + 1}`} />)}
                  <span><ImagesSquare size={13} /> 查看全部 {selectedImageItems.length} 张</span>
                </button>
              ) : (
                <button className="detail-add-image" onClick={() => storyInput.current?.click()}><ImageSquare size={19} /> 添加当天工作截图</button>
              )}
              <div className="detail-sections">
                {Object.entries(fieldMap).map(([key, title]) => (
                  <section key={key}><h3><StatusIcon type={key} />{title}</h3><ReportText value={selectedReport.fields[title]} /></section>
                ))}
              </div>
              <div className="detail-footer">
                <span><CloudCheck size={14} /> 飞书原文 · 已同步</span>
                <button onClick={() => openReport(selectedReport)}>大字查看完整日报</button>
                <button onClick={() => openImage(selectedDate)}><ImagesSquare size={14} /> {selectedImage ? `查看当天原图（${selectedImageItems.length}张）` : "添加当天原图"}</button>
              </div>
            </>
          ) : (
            <div className="empty-detail">
              <CalendarCheck size={34} />
              <span className="empty-date">{viewMonth.month}月{selectedDay}日</span>
              <h2>调休</h2>
              <p>飞书中没有查到当天的日报或周报，因此在月历中统一标记为调休。请选择带有“完成”标记的日期查看工作详情。</p>
            </div>
          )}
        </aside>
      </section>

      <section className="monthly-report-section glass-panel" aria-label={`${monthLabel}完整工作汇报`}>
        <div className="monthly-report-heading">
          <div>
            <span className="mission-label"><Sparkle size={12} weight="fill" /> MONTHLY DEBRIEF</span>
            <h2>{monthLabel}工作汇报</h2>
            <p>根据 {monthlyTimeline.length} 个工作日的飞书日报原文和 {imageCount} 张工作截图自动汇总</p>
          </div>
        </div>

        <div className="executive-summary">
          <div><strong>{monthlyTimeline.length}</strong><span>有记录的工作日</span></div>
          <div><strong>{reports.length}</strong><span>日报提交</span></div>
          <div><strong>{imageCount}</strong><span>工作截图</span></div>
          <p>本月工作主要覆盖 {workThemes.map((theme) => theme.label).join("、") || "日常工作推进"}。每条结论都可以回到上方日期查看日报原文和对应图片。</p>
        </div>

        <div className="monthly-report-grid">
          <section className="theme-summary">
            <h3>核心工作版块</h3>
            <div className="theme-cards">{workThemes.map((theme, index) => (
              <article key={theme.id} style={{ "--theme-color": categoryColors[index % categoryColors.length] }}>
                <span>{theme.label}</span><strong>{theme.count} 天</strong>
                <p>{theme.summary}</p>
              </article>
            ))}</div>
          </section>

          <section className="evidence-gallery">
            <h3>本月工作证据</h3>
            <div>{monthlyImages.slice(0, 8).map((item, index) => (
              <button key={`${item.date}-${item.hash || index}`} onClick={() => openImage(item.date)}>
                <img src={item.src} alt={`${item.date}工作截图`} /><span>{Number(item.date.slice(-2))}日</span>
              </button>
            ))}</div>
          </section>
        </div>

        <section className="boss-brief-section">
          <div className="boss-brief-heading"><div><h3>老板一眼看懂</h3><p>不仅展示做了什么，也说明交付、价值、进度和下一步</p></div><span>基于日报原文归纳</span></div>
          <div className="boss-brief-grid">
            <article><CheckCircle size={20} weight="fill" /><div><strong>本月核心交付</strong><p>完成多批岸源与 ADQ 短视频剪辑、包版迭代，并推进许莹、高导、若霞老师相关拍摄任务。</p></div></article>
            <article><Target size={20} weight="fill" /><div><strong>业务落地成果</strong><p>完成日不落直播间的方案、置景、灯光和设备调整，并持续观察实际直播效果。</p></div></article>
            <article><ArrowClockwise size={20} weight="bold" /><div><strong>仍在推进</strong><p>公司素材库仍处于持续上传、分类和归档阶段，日报记录进度约为 30%–40%。</p></div></article>
            <article><WarningCircle size={20} weight="fill" /><div><strong>下月建议关注</strong><p>补齐素材工作流与复用规范，跟踪直播间昼夜灯光问题，并继续稳定批量视频交付效率。</p></div></article>
          </div>
        </section>

        <section className="keyword-cloud-section">
          <div className="keyword-cloud-heading"><div><h3>本月日报高频关键词</h3><p>同类表达已归并；字号越大，代表相关内容出现得越频繁</p></div><span>共提取 {keywordCloud.length} 个有效词汇</span></div>
          <div className="keyword-cloud" aria-label="本月日报关键词云">
            {keywordCloud.map((keyword) => (
              <span key={keyword.label} title={`${keyword.label}：${keyword.count} 次`} style={{ "--word-size": `${Math.round(12 + keyword.weight * 30)}px`, "--word-color": categoryColors[keyword.colorIndex] }}>
                {keyword.label}<em>{keyword.count}</em>
              </span>
            ))}
          </div>
          <p className="keyword-cloud-note">出现最多的工作词汇：{keywordCloud.slice(0, 6).map((item) => `${item.label}（${item.count}次）`).join("、")}。</p>
        </section>
      </section>

      {wallpaperOpen && (
        <aside className="wallpaper-popover glass-panel" aria-label="壁纸选择器">
          <div className="popover-heading"><h3>更换壁纸</h3><button onClick={() => setWallpaperOpen(false)} aria-label="关闭"><X size={17} /></button></div>
          <div className="wallpaper-list">{wallpapers.map((item) => (
            <button key={item.id} onClick={() => { setWallpaper(item); setWallpaperOpen(false); }} className={wallpaper.id === item.id ? "active" : ""}>
              <img src={item.src} alt={item.label} /><span>{item.label}</span>{wallpaper.id === item.id && <i><Check size={13} weight="bold" /></i>}
            </button>
          ))}</div>
          <button className="upload-wallpaper" onClick={() => wallpaperInput.current?.click()}><UploadSimple size={16} /> 上传自定义壁纸</button>
        </aside>
      )}

      {reportOpen && selectedReport && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setReportOpen(false); }}>
          <section className="report-modal glass-panel">
            <button className="modal-close" onClick={() => setReportOpen(false)} aria-label="关闭"><X size={19} /></button>
            <span className="summary-kicker"><CloudCheck size={15} /> 飞书原文</span>
            <h2>{selectedDate.replaceAll("-", "年").replace(/年(\d{2})年/, "年$1月")}日工作日报</h2>
            <div className="report-modal-grid">
              {Object.entries(fieldMap).map(([key, title]) => (
                <section key={key}><h3><StatusIcon type={key} />{title}</h3><ReportText value={selectedReport.fields[title]} /></section>
              ))}
            </div>
          </section>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onMouseDown={(event) => { if (event.currentTarget === event.target) setLightbox(null); }}>
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="关闭原图"><X size={24} /></button>
          {lightbox.items.length > 1 && <button className="lightbox-nav previous" onClick={() => stepLightbox(-1)} aria-label="上一张"><CaretLeft size={28} /></button>}
          <img src={lightbox.items[lightbox.index].src} alt={lightbox.items[lightbox.index].name || "工作原图"} />
          {lightbox.items.length > 1 && <button className="lightbox-nav next" onClick={() => stepLightbox(1)} aria-label="下一张"><CaretRight size={28} /></button>}
          <div className="lightbox-caption">
            <strong>{lightbox.date} 工作原图</strong>
            <span>{lightbox.items[lightbox.index].name}</span>
            {lightbox.items.length > 1 && <em>{lightbox.index + 1} / {lightbox.items.length}</em>}
          </div>
        </div>
      )}

      <input ref={wallpaperInput} className="file-input" type="file" accept="image/*" onChange={uploadWallpaper} />
      <input ref={storyInput} className="file-input" type="file" accept="image/*" onChange={uploadStory} />
    </main>
  );
}
