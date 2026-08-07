const fs = require('fs');

const openapi = JSON.parse(fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/openapi.json', 'utf8'));
const collector = JSON.parse(fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/collector.json', 'utf8'));
const analyzer = JSON.parse(fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/analyzer.json', 'utf8'));
const orchestrator = JSON.parse(fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/orchestrator.json', 'utf8'));
const operator = JSON.parse(fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/operator.json', 'utf8'));
const realtime = JSON.parse(fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/realtime.json', 'utf8'));

const specsObj = {
  "openapi.json": openapi,
  "collector.json": collector,
  "analyzer.json": analyzer,
  "orchestrator.json": orchestrator,
  "operator.json": operator,
  "realtime.json": realtime
};

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AstraWatch — OpenAPI 3.0 Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #000; color: #fff; font-family: 'Inter', sans-serif; height: 100vh; overflow: hidden; -webkit-font-smoothing: antialiased; }

    #layout { display: flex; height: 100vh; width: 100vw; overflow: hidden; }

    /* ── SIDEBAR ── */
    #sidebar {
      width: 280px; flex-shrink: 0; background: #050505;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; flex-direction: column; height: 100vh;
      z-index: 50;
    }
    .sb-header {
      padding: 18px 20px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .brand-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .brand-logo {
      width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .brand-logo::before, .brand-logo::after {
      content: ''; position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff;
    }
    .brand-logo::before { top: 4px; left: 50%; transform: translateX(-50%); }
    .brand-logo::after { bottom: 4px; left: 50%; transform: translateX(-50%); }
    .brand-name { font-weight: 800; font-size: 15px; letter-spacing: -0.02em; color: #fff; }
    .sb-badge { font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 2px 8px; border-radius: 99px; margin-left: auto; }

    .sb-search-wrap {
      display: flex; align-items: center; gap: 8px;
      background: #0a0a0a; border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px; padding: 7px 10px;
      transition: border-color 0.2s;
    }
    .sb-search-wrap:focus-within { border-color: #3b82f6; }
    .sb-search-wrap svg { color: #555; flex-shrink: 0; }
    .sb-search-input {
      background: transparent; border: none; outline: none;
      color: #fff; font-family: 'Inter', sans-serif; font-size: 12px; width: 100%;
    }
    .sb-search-input::placeholder { color: #555; }

    .sb-scroll { flex: 1; overflow-y: auto; padding: 16px 12px; }
    .sb-section-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin: 0 8px 8px; }

    .svc-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-radius: 10px; cursor: pointer;
      margin-bottom: 3px; transition: background 0.15s;
    }
    .svc-item:hover { background: rgba(255, 255, 255, 0.04); }
    .svc-item.active { background: rgba(59, 130, 246, 0.12); }
    .svc-item.active .svc-title { color: #60a5fa; font-weight: 600; }
    .svc-icon-box {
      width: 26px; height: 26px; border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      background: #111; color: #3b82f6; flex-shrink: 0;
    }
    .svc-title { font-size: 12.5px; color: #aaa; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .svc-count { font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #555; background: #0d0d0d; padding: 2px 6px; border-radius: 4px; }

    .tag-menu { margin-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 14px; }
    .tag-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 10px 6px 16px; font-size: 11.5px; color: #777;
      cursor: pointer; border-radius: 6px; margin-bottom: 2px;
      transition: color 0.15s, background 0.15s;
    }
    .tag-item:hover { color: #fff; background: rgba(255, 255, 255, 0.03); }
    .tag-pip { width: 5px; height: 5px; border-radius: 50%; background: #3b82f6; opacity: 0.6; }

    /* ── MAIN CONTENT ── */
    #main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #000; }

    #topnav {
      height: 56px; background: rgba(5, 5, 5, 0.85);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; flex-shrink: 0;
    }
    .nav-left { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #555; font-family: 'JetBrains Mono', monospace; }
    .nav-left span { color: #888; }
    .nav-actions { display: flex; align-items: center; gap: 10px; }
    .btn-action {
      background: #0d0d0d; border: 1px solid rgba(255, 255, 255, 0.15);
      color: #ddd; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
      text-decoration: none; transition: background 0.15s, border-color 0.15s;
    }
    .btn-action:hover { background: #161616; border-color: #3b82f6; color: #fff; }
    .btn-primary {
      background: linear-gradient(to top, #3b82f6, #60a5fa); color: #000;
      border: none; font-weight: 700;
    }
    .btn-primary:hover { opacity: 0.9; }

    #swagger-scroll { flex: 1; overflow-y: auto; padding: 20px 32px 100px; }

    /* Custom Swagger UI Dark Theme Overrides */
    .swagger-ui { font-family: 'Inter', sans-serif !important; color: #ccc !important; }
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .wrapper { padding: 0 !important; max-width: 1000px !important; margin: 0 auto !important; }
    .swagger-ui .info { margin: 16px 0 24px !important; }
    .swagger-ui .info .title { color: #fff !important; font-family: 'Inter', sans-serif !important; font-weight: 800 !important; font-size: 28px !important; }
    .swagger-ui .info p, .swagger-ui .info li { color: #888 !important; font-size: 13.5px !important; line-height: 1.6 !important; }
    .swagger-ui .scheme-container { background: transparent !important; box-shadow: none !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; padding: 12px 0 20px !important; margin-bottom: 24px !important; }
    
    /* Operations & Cards */
    .swagger-ui .opblock-tag { font-family: 'Inter', sans-serif !important; font-weight: 700 !important; color: #fff !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; font-size: 16px !important; margin-top: 24px !important; }
    .swagger-ui .opblock { background: rgba(255, 255, 255, 0.02) !important; border: 1px solid rgba(255, 255, 255, 0.08) !important; border-radius: 12px !important; box-shadow: none !important; margin-bottom: 12px !important; }
    .swagger-ui .opblock .opblock-summary { border-bottom: none !important; padding: 10px 14px !important; }
    .swagger-ui .opblock .opblock-summary-method { border-radius: 6px !important; font-family: 'JetBrains Mono', monospace !important; font-weight: 700 !important; font-size: 11px !important; padding: 4px 10px !important; }
    .swagger-ui .opblock .opblock-summary-path { font-family: 'JetBrains Mono', monospace !important; color: #eee !important; font-size: 13px !important; }
    .swagger-ui .opblock .opblock-summary-description { color: #777 !important; font-size: 12px !important; }

    /* HTTP Method Colors */
    .swagger-ui .opblock.opblock-get { border-color: rgba(16, 185, 129, 0.25) !important; background: rgba(16, 185, 129, 0.02) !important; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #10b981 !important; color: #000 !important; }
    .swagger-ui .opblock.opblock-post { border-color: rgba(59, 130, 246, 0.25) !important; background: rgba(59, 130, 246, 0.02) !important; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #3b82f6 !important; color: #000 !important; }
    .swagger-ui .opblock.opblock-put { border-color: rgba(245, 158, 11, 0.25) !important; background: rgba(245, 158, 11, 0.02) !important; }
    .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #f59e0b !important; color: #000 !important; }
    .swagger-ui .opblock.opblock-delete { border-color: rgba(239, 68, 68, 0.25) !important; background: rgba(239, 68, 68, 0.02) !important; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #ef4444 !important; color: #fff !important; }

    /* Text & Form Inputs */
    .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select { background: #070707 !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; color: #fff !important; border-radius: 6px !important; font-family: 'JetBrains Mono', monospace !important; font-size: 12px !important; }
    .swagger-ui table thead tr th, .swagger-ui table thead tr td { color: #555 !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; font-size: 11px !important; }
    .swagger-ui .parameter__name, .swagger-ui .parameter__type { color: #60a5fa !important; font-family: 'JetBrains Mono', monospace !important; font-size: 12px !important; }
    .swagger-ui label { color: #888 !important; }
    .swagger-ui .btn { background: #111 !important; color: #fff !important; border-color: rgba(255, 255, 255, 0.15) !important; border-radius: 6px !important; }
    .swagger-ui .btn.execute { background: #3b82f6 !important; color: #000 !important; font-weight: 700 !important; }
    .swagger-ui section.models { border: 1px solid rgba(255, 255, 255, 0.08) !important; border-radius: 12px !important; background: rgba(255, 255, 255, 0.02) !important; }
    .swagger-ui section.models h4 { color: #fff !important; }
    .swagger-ui .model-box { background: #070707 !important; }
  </style>
</head>
<body>

<div id="layout">
  <!-- ════════ SIDEBAR ════════ -->
  <aside id="sidebar">
    <div class="sb-header">
      <div class="brand-row">
        <div class="brand-logo"></div>
        <span class="brand-name">AstraWatch</span>
        <span class="sb-badge">OpenAPI 3.0</span>
      </div>
      <div class="sb-search-wrap">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="sb-search-input" id="sbSearch" type="text" placeholder="Filter endpoints..." oninput="filterEndpoints(this.value)">
      </div>
    </div>

    <div class="sb-scroll">
      <div class="sb-section-lbl">Microservice Specs</div>
      
      <div class="svc-item active" id="svc-all" onclick="selectService('openapi.json', 'svc-all')">
        <div class="svc-icon-box" style="color:#60a5fa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <span class="svc-title">All Services</span>
        <span class="svc-count">165+</span>
      </div>

      <div class="svc-item" id="svc-collector" onclick="selectService('collector.json', 'svc-collector')">
        <div class="svc-icon-box" style="color:#10b981">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4.9 19.1C3.1 17.3 2 14.8 2 12s1.1-5.3 2.9-7.1M19.1 4.9C20.9 6.7 22 9.2 22 12s-1.1 5.3-2.9 7.1"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
        <span class="svc-title">Collector</span>
        <span class="svc-count">14</span>
      </div>

      <div class="svc-item" id="svc-analyzer" onclick="selectService('analyzer.json', 'svc-analyzer')">
        <div class="svc-icon-box" style="color:#c084fc">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>
        </div>
        <span class="svc-title">Analyzer</span>
        <span class="svc-count">8</span>
      </div>

      <div class="svc-item" id="svc-orchestrator" onclick="selectService('orchestrator.json', 'svc-orchestrator')">
        <div class="svc-icon-box" style="color:#60a5fa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v7M12 15v7M2 12h7M15 12h7"/></svg>
        </div>
        <span class="svc-title">Orchestrator</span>
        <span class="svc-count">77</span>
      </div>

      <div class="svc-item" id="svc-operator" onclick="selectService('operator.json', 'svc-operator')">
        <div class="svc-icon-box" style="color:#f59e0b">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        <span class="svc-title">Operator</span>
        <span class="svc-count">10</span>
      </div>

      <div class="svc-item" id="svc-realtime" onclick="selectService('realtime.json', 'svc-realtime')">
        <div class="svc-icon-box" style="color:#818cf8">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <span class="svc-title">Realtime Gateway</span>
        <span class="svc-count">7</span>
      </div>

      <div class="tag-menu" id="tagMenu">
        <div class="sb-section-lbl">Tags &amp; Groups</div>
        <div id="tagList"></div>
      </div>
    </div>
  </aside>

  <!-- ════════ MAIN CONTENT ════════ -->
  <main id="main">
    <div id="topnav">
      <div class="nav-left">
        <span>AstraWatch</span> / <span id="navService">Unified OpenAPI 3.0</span>
      </div>
      <div class="nav-actions">
        <a href="api-reference.html" class="btn-action">
          <span>Interactive Custom Portal</span>
        </a>
        <button onclick="downloadCurrentSpec()" class="btn-action btn-primary">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          <span>Download Spec JSON</span>
        </button>
      </div>
    </div>

    <div id="swagger-scroll">
      <div id="swagger-ui"></div>
    </div>
  </main>
</div>

<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
  const SPECS = ${JSON.stringify(specsObj)};
  let currentKey = 'openapi.json';
  let ui;

  function initSwagger(key) {
    currentKey = key;
    document.getElementById('swagger-ui').innerHTML = '';
    
    ui = SwaggerUIBundle({
      spec: SPECS[key],
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset
      ],
      plugins: [
        SwaggerUIBundle.plugins.DownloadUrl
      ],
      layout: "BaseLayout",
      persistAuthorization: true,
      onComplete: function() {
        populateTags(SPECS[key]);
      }
    });
  }

  function selectService(key, elemId) {
    document.querySelectorAll('.svc-item').forEach(el => el.classList.remove('active'));
    document.getElementById(elemId)?.classList.add('active');
    
    const titles = {
      'openapi.json': 'Unified OpenAPI 3.0 Spec',
      'collector.json': 'Collector Service (:8080)',
      'analyzer.json': 'Analyzer Service (:8000)',
      'orchestrator.json': 'Orchestrator Service (:8082)',
      'operator.json': 'Operator Service (:8081 healthz)',
      'realtime.json': 'Realtime Gateway (:8084)'
    };
    document.getElementById('navService').textContent = titles[key] || key;
    initSwagger(key);
  }

  function populateTags(spec) {
    const list = document.getElementById('tagList');
    list.innerHTML = '';
    if (spec.tags && spec.tags.length) {
      spec.tags.forEach(t => {
        const item = document.createElement('div');
        item.className = 'tag-item';
        item.innerHTML = '<div class="tag-pip"></div><span>' + t.name + '</span>';
        item.onclick = function() {
          const tagEl = document.getElementById('operations-tag-' + t.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
          if (tagEl) tagEl.scrollIntoView({ behavior: 'smooth' });
        };
        list.appendChild(item);
      });
    }
  }

  function filterEndpoints(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('.opblock-tag-section').forEach(sec => {
      let matchCount = 0;
      sec.querySelectorAll('.opblock').forEach(op => {
        const path = op.querySelector('.opblock-summary-path')?.textContent.toLowerCase() || '';
        const desc = op.querySelector('.opblock-summary-description')?.textContent.toLowerCase() || '';
        const match = !q || path.includes(q) || desc.includes(q);
        op.style.display = match ? 'block' : 'none';
        if (match) matchCount++;
      });
      sec.style.display = (matchCount > 0 || !q) ? 'block' : 'none';
    });
  }

  function downloadCurrentSpec() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(SPECS[currentKey], null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", currentKey);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  }

  window.onload = function() {
    initSwagger('openapi.json');
  };
</script>
</body>
</html>`;

fs.writeFileSync('/Users/abuzar/Desktop/Astrawatch/docs/swagger.html', htmlContent);
console.log("Updated docs/swagger.html with SVG icons (Zero Emojis)");
