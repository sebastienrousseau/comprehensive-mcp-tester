/* ── Log ── */
function addLog(dir, method, detail, httpStatus, respHeaders, res) {
  state.log.unshift({
    dir: dir, method: method,
    body: detail.body, sseEvents: detail.sseEvents || null,
    httpStatus: httpStatus, headers: respHeaders,
    diag: res ? res.diag : null,
    clientMs: res ? res.clientMs : null,
    overheadMs: res ? res.overheadMs : null,
    time: new Date()
  });
  if (state.log.length > LOG_MAX) state.log.length = LOG_MAX;   // drop the oldest
  updateBadges();
  if (state.activeTab === 'log') renderTab();
}

function clearLog() {
  state.log = [];
  updateBadges();
  if (state.activeTab === 'log') renderTab();
}

function renderLog() {
  if (!state.log.length) return '<div class="empty-state">No requests yet \u2014 connect to a server to see traffic</div>';
  var html = '';
  for (var i = 0; i < state.log.length; i++) {
    var e = state.log[i];
    var label = e.dir === 'req' ? 'REQ' : e.dir === 'err' ? 'ERR' : e.dir === 'sse' ? 'SSE' : 'RES';
    var ts = fmtClock(e.time.getTime());

    html += '<div class="log-entry"><div class="log-entry-header" onclick="var b=this.nextElementSibling;b.hidden=!b.hidden">';
    html += '<span class="log-pill ' + e.dir + '">' + label + '</span>';

    if (e.httpStatus) {
      html += '<span class="http-status ' + statusClass(e.httpStatus) + '">' + e.httpStatus + '</span>';
    } else if (e.dir !== 'req') {
      html += '<span class="http-status snet">NET</span>';
    }

    html += '<span class="log-method">' + esc(e.method) + '</span>';
    if (e.sseEvents) html += '<span style="font-size:10px;color:var(--info)">' + e.sseEvents + ' events</span>';
    if (e.diag && e.diag.totalMs != null) {
      var slow = e.diag.totalMs > diag.slowMs;
      html += '<span class="log-timing' + (slow ? ' slow' : '') + '">' + fmtMs(e.diag.totalMs) + '</span>';
    }
    html += '<span class="log-time">' + ts + '</span></div>';

    html += '<div class="log-body" hidden>';

    if (e.diag) html += renderLogTiming(e);

    if (e.headers) {
      html += '<div class="log-body-section"><div class="log-body-label">Response Headers</div>';
      html += '<div class="log-body-content" style="color:var(--ink-muted)">' + esc(JSON.stringify(e.headers, null, 2)) + '</div></div>';
    }
    html += '<div class="log-body-section"><div class="log-body-label">Body</div>';
    html += '<div class="log-body-content">' + esc(JSON.stringify(e.body, null, 2)) + '</div></div>';
    html += '</div></div>';
  }
  return html;
}

function renderLogTiming(e) {
  var d = e.diag;
  var size = d.bodyBytes == null ? null : fmtBytes(d.bodyBytes) + (d.truncated ? ' (truncated at the proxy\'s cap)' : '');
  var rows = [
    ['time to first byte', timingOrNull(d.ttfbMs)],
    ['body transfer', timingOrNull(d.bodyMs)],
    ['origin total', timingOrNull(d.totalMs)],
    ['browser round trip', timingOrNull(e.clientMs)],
    ['proxy overhead', timingOrNull(e.overheadMs)],
    ['body size', size],
    ['attempts', d.attempts || null],
    ['worker colo', d.colo || null],
    ['error type', d.errorType || null]
  ];
  var html = '<div class="log-body-section"><div class="log-body-label">Timing</div><div class="log-body-content" style="color:var(--ink-muted)">';
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] != null) html += (rows[i][0] + ':' + '                    ').slice(0, 20) + rows[i][1] + '\n';
  }
  return html + '</div></div>';
}

function timingOrNull(v) {
  return v == null ? null : fmtMs(v);
}
