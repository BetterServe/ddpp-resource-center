/**
 * DDPP enrollment dashboard
 * Google Apps Script — paste into Extensions ▸ Apps Script on the Client Log workbook.
 *
 * Builds two tabs and keeps them current:
 *
 *   Dashboard   for people. Children, applications, a per-site table, progress.
 *   Feed        one header row and one data row, for the resource center to read.
 *               This is the only tab that should ever be published to the web.
 *
 * WHAT IT COUNTS
 * Children, by summing the "Number of Children under 3?" column across every
 * application. It does NOT filter on bs_status: that column is written by a
 * downstream process and is empty on live rows, so filtering on it discards
 * the whole log.
 *
 * COLUMNS ARE RESOLVED BY HEADER NAME, never by position. The two source tabs
 * do not share a column order — WIC Sites has site_initial / unique_id /
 * site_code in E/F/G, Home Visiting has site_code / site_initial / unique_id.
 * The children header also carries a trailing space. Matching on position or
 * on an exact string would break on one tab and fail silently.
 *
 * Setup:  run installTriggers() once, then updateDashboard().
 */

var SOURCE_TABS   = ['WIC Sites', 'Home Visiting'];
var DASHBOARD_TAB = 'Dashboard';
var FEED_TAB      = 'Feed';

var H_SITE  = 'site_code';
var H_DATE  = 'Submission Date';
var CHILD_HINT = 'child';          // matches "Number of Children under 3? "

var GOAL_CHILDREN = 5500;

// What the website calls the number. Change it here, not in the site's code.
var SITE_LABEL = 'children enrolled';

var GREEN = '#1B3939', CREAM = '#EBE9E3';

/* ------------------------------------------------------------------ */

function updateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = collect_(ss);
  writeDashboard_(ss, data);
  writeFeed_(ss, data);
}

function collect_(ss) {
  var perTab = {}, sites = {}, apps = 0, children = 0, estimated = 0;
  var childColFound = false, lastDate = null, missing = [];

  SOURCE_TABS.forEach(function (tabName) {
    var sh = ss.getSheetByName(tabName);
    if (!sh) { missing.push(tabName); perTab[tabName] = { apps: 0, children: 0 }; return; }

    var values = sh.getDataRange().getValues();
    if (values.length < 2) { perTab[tabName] = { apps: 0, children: 0 }; return; }

    var idx    = headerIndex_(values[0]);
    var cSite  = idx[norm_(H_SITE)];
    var cDate  = idx[norm_(H_DATE)];
    var cChild = findChildColumn_(values[0]);
    if (cChild >= 0) childColFound = true;

    var a = 0, k = 0;
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (isBlankRow_(row)) continue;

      a++; apps++;

      // Every application is for at least one child. A missing or unreadable
      // value is floored at 1 and counted, so the headline is a floor rather
      // than a guess dressed up as a measurement.
      var kids = 1;
      if (cChild >= 0) {
        var parsed = parseInt(row[cChild], 10);
        if (!isNaN(parsed) && parsed >= 1) kids = parsed; else estimated++;
      } else {
        estimated++;
      }
      k += kids; children += kids;

      if (cSite !== undefined) {
        var site = String(row[cSite]).trim() || '(no site recorded)';
        if (!sites[site]) sites[site] = { apps: 0, children: 0 };
        sites[site].apps++;
        sites[site].children += kids;
      }
      if (cDate !== undefined && row[cDate] instanceof Date) {
        if (!lastDate || row[cDate] > lastDate) lastDate = row[cDate];
      }
    }
    perTab[tabName] = { apps: a, children: k };
  });

  return {
    perTab: perTab, sites: sites, apps: apps, children: children,
    estimated: estimated, childColFound: childColFound,
    lastDate: lastDate, missing: missing
  };
}

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

  var pct = GOAL_CHILDREN ? d.children / GOAL_CHILDREN : 0;
  var avg = d.apps ? d.children / d.apps : 0;

  var rows = [];
  rows.push(['DDPP enrollment', '', '']);
  rows.push(['Updated', new Date(), '']);
  rows.push(['', '', '']);
  rows.push(['Children', d.children, '']);
  rows.push(['Goal', GOAL_CHILDREN, '']);
  rows.push(['Progress', pct, '']);
  rows.push(['', '', '']);
  rows.push(['Applications', d.apps, '']);
  rows.push(['Children per application', avg, '']);
  rows.push(['Last submission', d.lastDate || '—', '']);
  rows.push(['', '', '']);
  rows.push(['By form', 'Applications', 'Children']);
  SOURCE_TABS.forEach(function (t) {
    var v = d.perTab[t] || { apps: 0, children: 0 };
    rows.push([t, v.apps, v.children]);
  });
  rows.push(['', '', '']);
  rows.push(['By site', 'Applications', 'Children']);

  var siteNames = Object.keys(d.sites).sort(function (a, b) {
    return d.sites[b].children - d.sites[a].children;
  });
  siteNames.forEach(function (s) {
    rows.push([s, d.sites[s].apps, d.sites[s].children]);
  });

  if (!d.childColFound) {
    rows.push(['', '', '']);
    rows.push(['WARNING — no "Number of Children under 3" column found on either tab, so every application is being counted as one child. Check the Jotform to Sheets field mapping.', '', '']);
  } else if (d.estimated > 0) {
    rows.push(['', '', '']);
    rows.push(['Note: ' + d.estimated + ' application(s) had no readable children value and were counted as 1. The real figure is this or higher.', '', '']);
  }
  if (d.missing.length) {
    rows.push(['', '', '']);
    rows.push(['WARNING — source tab not found: ' + d.missing.join(', '), '', '']);
  }

  sh.getRange(1, 1, rows.length, 3).setValues(rows);

  sh.getRange('A1').setFontSize(18).setFontWeight('bold').setFontColor(GREEN);
  sh.getRange('B2').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange('A4:B4').setFontWeight('bold');
  sh.getRange('B4').setFontSize(28).setFontColor(GREEN).setNumberFormat('#,##0');
  sh.getRange('B5').setNumberFormat('#,##0');
  sh.getRange('B6').setNumberFormat('0.0%');
  sh.getRange('B8').setNumberFormat('#,##0');
  sh.getRange('B9').setNumberFormat('0.00');
  sh.getRange('B10').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange(12, 1, 1, 3).setFontWeight('bold').setBackground(CREAM);
  var bySiteRow = 12 + SOURCE_TABS.length + 2;
  sh.getRange(bySiteRow, 1, 1, 3).setFontWeight('bold').setBackground(CREAM);
  sh.setColumnWidth(1, 340);
  sh.setColumnWidth(2, 130);
  sh.setColumnWidth(3, 120);
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
  // Row 1 headers. Row 2 is the totals row. Every row after it is one site,
  // ranked. Keeping it all on one tab means the published URL never changes.
  var out = [
    ['type', 'name', 'applications', 'children', 'unit', 'label', 'goal', 'estimated_rows', 'updated'],
    ['total', 'All sites', d.apps, d.children, 'children', SITE_LABEL, GOAL_CHILDREN, d.estimated,
     Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX")]
  ];
  Object.keys(d.sites)
    .sort(function (a, b) { return d.sites[b].children - d.sites[a].children; })
    .forEach(function (name) {
      out.push(['site', name, d.sites[name].apps, d.sites[name].children, '', '', '', '', '']);
    });

  sh.getRange(1, 1, out.length, 9).setValues(out);
  sh.getRange(1, 1, 1, 9).setFontWeight('bold');
  sh.autoResizeColumns(1, 9);
}

/* ------------------------------------------------------------------ */

/** Run once. Refreshes every 15 minutes, and whenever the sheet changes. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateDashboard').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('updateDashboard')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Triggers installed: every 15 minutes + on change.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DDPP')
    .addItem('Refresh dashboard now', 'updateDashboard')
    .addItem('Install triggers', 'installTriggers')
    .addToUi();
}
