/**
 * DDPP enrollment dashboard
 * Google Apps Script — paste into Extensions ▸ Apps Script on the Client Log workbook.
 *
 * Builds two tabs and keeps them current:
 *
 *   Dashboard   for people. Totals, a per-site table, progress against goal.
 *   Feed        one header row and one data row, for the resource center to read.
 *               This is the only tab that should ever be published to the web.
 *
 * Columns are resolved BY HEADER NAME, never by position. The two source tabs
 * do not share a column order — WIC Sites has site_initial / unique_id /
 * site_code in E/F/G, Home Visiting has site_code / site_initial / unique_id.
 * Anything written against fixed letters reads the wrong field on one of them
 * and fails silently.
 *
 * Setup:  run installTriggers() once, then updateDashboard().
 */

var SOURCE_TABS      = ['WIC Sites', 'Home Visiting'];
var DASHBOARD_TAB    = 'Dashboard';
var FEED_TAB         = 'Feed';

var H_STATUS         = 'bs_status';
var H_SITE           = 'site_code';
var H_DATE           = 'Submission Date';
var COMPLETED        = 'completed';          // compared case-insensitively

// Children per household is not in the export yet. When it is added to the
// Jotform → Sheets field mapping this picks it up automatically, whatever it
// is called, as long as the header mentions "child".
var CHILD_HINT       = 'child';

var GOAL_CHILDREN    = 5500;

var GREEN = '#1B3939', TEAL = '#64E8E4', CREAM = '#EBE9E3', MUTED = '#67655F';

/* ------------------------------------------------------------------ */

function updateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = collect_(ss);
  writeDashboard_(ss, data);
  writeFeed_(ss, data);
}

/** Read both source tabs into one normalised list of completed rows. */
function collect_(ss) {
  var perTab = {}, sites = {}, totalRows = 0, completed = 0, children = 0;
  var childrenFound = false, childBlank = 0, lastDate = null, missing = [];

  SOURCE_TABS.forEach(function (tabName) {
    var sh = ss.getSheetByName(tabName);
    if (!sh) { missing.push(tabName); perTab[tabName] = 0; return; }

    var values = sh.getDataRange().getValues();
    if (values.length < 2) { perTab[tabName] = 0; return; }

    var idx = headerIndex_(values[0]);
    var cStatus = idx[norm_(H_STATUS)];
    var cSite   = idx[norm_(H_SITE)];
    var cDate   = idx[norm_(H_DATE)];
    var cChild  = findChildColumn_(values[0]);
    if (cChild >= 0) childrenFound = true;

    var n = 0;
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (isBlankRow_(row)) continue;
      totalRows++;

      // Only completed enrollments count. A blank status is a submission that
      // has not finished, and counting it overstates the program.
      if (cStatus === undefined) continue;
      if (String(row[cStatus]).trim().toLowerCase() !== COMPLETED) continue;

      n++; completed++;

      if (cSite !== undefined) {
        var site = String(row[cSite]).trim() || '(no site recorded)';
        sites[site] = (sites[site] || 0) + 1;
      }
      if (cChild >= 0) {
        var kids = parseInt(row[cChild], 10);
        if (isNaN(kids) || kids < 1) {
          // Jotform's Sheets integration only writes new submissions, so rows
          // that predate the column have nothing here. Every completed
          // enrollment has at least one eligible child, so floor at 1 and
          // count how often we had to guess.
          kids = 1;
          childBlank++;
        }
        children += kids;
      }
      if (cDate !== undefined && row[cDate] instanceof Date) {
        if (!lastDate || row[cDate] > lastDate) lastDate = row[cDate];
      }
    }
    perTab[tabName] = n;
  });

  return {
    perTab: perTab,
    sites: sites,
    totalRows: totalRows,
    completed: completed,
    children: childrenFound ? children : null,   // null = column not in the export yet
    childBlank: childBlank,
    lastDate: lastDate,
    missing: missing
  };
}

/** Map normalised header name -> column index. */
function headerIndex_(headerRow) {
  var idx = {};
  headerRow.forEach(function (h, i) {
    var k = norm_(h);
    if (k && idx[k] === undefined) idx[k] = i;
  });
  return idx;
}

function findChildColumn_(headerRow) {
  for (var i = 0; i < headerRow.length; i++) {
    if (norm_(headerRow[i]).indexOf(CHILD_HINT) !== -1) return i;
  }
  return -1;
}

function norm_(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isBlankRow_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i]).trim() !== '') return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */

function writeDashboard_(ss, d) {
  var sh = ss.getSheetByName(DASHBOARD_TAB) || ss.insertSheet(DASHBOARD_TAB, 0);
  sh.clear();
  sh.clearFormats();

  var counted = d.children === null ? d.completed : d.children;
  var unit    = d.children === null ? 'households enrolled' : 'children enrolled';
  var pct     = GOAL_CHILDREN ? counted / GOAL_CHILDREN : 0;

  var rows = [];
  rows.push(['DDPP enrollment', '', '']);
  rows.push(['Updated', new Date(), '']);
  rows.push(['', '', '']);
  rows.push([unit, counted, '']);
  rows.push(['Goal', GOAL_CHILDREN, '']);
  rows.push(['Progress', pct, '']);
  rows.push(['', '', '']);
  rows.push(['Completed enrollments', d.completed, '']);
  if (d.children !== null && d.childBlank > 0) {
    rows.push(['Rows counted as 1 child (no value recorded)', d.childBlank, '']);
  }
  rows.push(['Rows in the log (all statuses)', d.totalRows, '']);
  rows.push(['Last submission', d.lastDate || '—', '']);
  rows.push(['', '', '']);
  rows.push(['By form', 'Completed', '']);
  SOURCE_TABS.forEach(function (t) { rows.push([t, d.perTab[t] || 0, '']); });
  rows.push(['', '', '']);
  rows.push(['By site', 'Completed', '% of total']);

  var siteNames = Object.keys(d.sites).sort(function (a, b) { return d.sites[b] - d.sites[a]; });
  siteNames.forEach(function (s) {
    rows.push([s, d.sites[s], d.completed ? d.sites[s] / d.completed : 0]);
  });

  if (d.children === null) {
    rows.push(['', '', '']);
    rows.push(['COUNTING HOUSEHOLDS, NOT CHILDREN. The goal is 5,500 children, but "Number of Children under 3" is not in the Jotform → Sheets field mapping, so the log has nothing to add up. Add that field in Jotform and this switches over by itself — no script change.', '', '']);
  } else if (d.childBlank > 0) {
    rows.push(['', '', '']);
    rows.push(['Note: ' + d.childBlank + ' completed row(s) have no children value and were counted as 1. Jotform only writes new submissions to the sheet, so rows created before the field was mapped cannot be filled in retrospectively. The real figure is this or higher.', '', '']);
  }
  if (d.missing.length) {
    rows.push(['', '', '']);
    rows.push(['WARNING — source tab not found: ' + d.missing.join(', '), '', '']);
  }

  sh.getRange(1, 1, rows.length, 3).setValues(rows);

  // formatting
  sh.getRange('A1').setFontSize(18).setFontWeight('bold').setFontColor(GREEN);
  sh.getRange('B2').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange('A4:B4').setFontWeight('bold');
  sh.getRange('B4').setFontSize(28).setFontColor(GREEN).setNumberFormat('#,##0');
  sh.getRange('B5').setNumberFormat('#,##0');
  sh.getRange('B6').setNumberFormat('0.0%');
  sh.getRange('B10').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange('A12:C12').setFontWeight('bold').setBackground(CREAM);
  var bySiteRow = 12 + SOURCE_TABS.length + 2;
  sh.getRange(bySiteRow, 1, 1, 3).setFontWeight('bold').setBackground(CREAM);
  if (siteNames.length) {
    sh.getRange(bySiteRow + 1, 3, siteNames.length, 1).setNumberFormat('0.0%');
  }
  sh.setColumnWidth(1, 330);
  sh.setColumnWidth(2, 130);
  sh.setColumnWidth(3, 110);
  sh.setFrozenRows(1);
}

/**
 * One header row, one data row. Nothing else.
 * Publish ONLY this tab (File ▸ Share ▸ Publish to web ▸ Feed ▸ CSV) —
 * publishing "Entire document" would expose the caregiver IDs in the log.
 */
function writeFeed_(ss, d) {
  var sh = ss.getSheetByName(FEED_TAB) || ss.insertSheet(FEED_TAB);
  sh.clear();
  var counted = d.children === null ? d.completed : d.children;
  sh.getRange(1, 1, 2, 6).setValues([
    ['count', 'unit', 'goal', 'completed_rows', 'estimated_rows', 'updated'],
    [counted,
     d.children === null ? 'households' : 'children',
     GOAL_CHILDREN,
     d.completed,
     d.children === null ? '' : d.childBlank,
     Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX")]
  ]);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold');
  sh.autoResizeColumns(1, 6);
}

/* ------------------------------------------------------------------ */

/** Run once. Hourly refresh, plus a rebuild whenever Jotform adds a row. */
function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  existing.forEach(function (t) {
    if (t.getHandlerFunction() === 'updateDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateDashboard').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('updateDashboard')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Triggers installed: hourly + on change.');
}

/** Convenience menu so it can be refreshed by hand. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DDPP')
    .addItem('Refresh dashboard now', 'updateDashboard')
    .addItem('Install triggers', 'installTriggers')
    .addToUi();
}
