/**
 * Jungle Raj — survey vote collector (no database)
 * ==================================================
 * This is a Google Apps Script, not part of the website's own JS bundle.
 * It turns a Google Sheet into a tiny REST-like backend: every vote is
 * appended as a row, and reading it back returns per-option tallies.
 *
 * SETUP (one-time, in your own Google account):
 *   1. Go to https://sheets.google.com and create a new blank spreadsheet.
 *      (You can rename it, e.g. "Jungle Raj Votes" — doesn't matter.)
 *   2. In that sheet: Extensions > Apps Script.
 *   3. Delete the placeholder code in the editor and paste this entire file.
 *   4. Click Deploy > New deployment.
 *        - Type: "Web app"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Click Deploy, authorize the requested permissions (this is your own
 *      script accessing your own sheet — Google will warn because it's
 *      unverified; click "Advanced" > "Go to <project> (unsafe)" to proceed).
 *   6. Copy the Web app URL it gives you (ends in /exec).
 *   7. Paste that URL into js/vote-sync.js as the value of
 *      window.JR_VOTE_ENDPOINT.
 *
 * That's it — no server to run, no database. The sheet itself IS the data
 * store, and you can open it anytime to see every vote as a plain row.
 *
 * Re-deploying: if you edit this script later, use Deploy > Manage
 * deployments > Edit > New version, otherwise your changes won't take
 * effect on the existing /exec URL.
 */

const SHEET_NAME = 'Votes';

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (!data.survey_id || !data.voter_id || !data.selected_option) {
    return jsonResponse({ error: 'missing_fields' });
  }

  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();

  // Duplicate-vote guard, server-side — the same defense the site's own
  // localStorage check does client-side, but this one can't be bypassed by
  // clearing local storage, since it looks at every row ever recorded.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === data.survey_id && rows[i][2] === data.voter_id) {
      return jsonResponse({ error: 'already_voted' });
    }
  }

  sheet.appendRow([new Date().toISOString(), data.survey_id, data.voter_id, data.selected_option]);
  return jsonResponse({ ok: true });
}

function doGet(e) {
  const surveyId = e.parameter.survey_id;
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();

  if (surveyId && e.parameter.raw === '1') {
    // Raw rows for one survey — used where the caller needs to know WHO
    // voted for what (e.g. to check "has this browser's voter_id already
    // voted"), not just aggregate counts.
    const votes = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] !== surveyId) continue;
      votes.push({ survey_id: rows[i][1], voter_id: rows[i][2], selected_option: rows[i][3] });
    }
    return jsonResponse({ votes });
  }

  if (surveyId) {
    // Tallies for one survey: { counts: { optionId: count } }
    const counts = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] !== surveyId) continue;
      const optionId = rows[i][3];
      counts[optionId] = (counts[optionId] || 0) + 1;
    }
    return jsonResponse({ counts });
  }

  // No survey_id: totals across every survey, for the site-wide stat.
  const bySurvey = {};
  for (let i = 1; i < rows.length; i++) {
    const sid = rows[i][1];
    bySurvey[sid] = (bySurvey[sid] || 0) + 1;
  }
  const totalVotes = rows.length - 1; // minus header row
  return jsonResponse({ totalVotes, bySurvey });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['timestamp', 'survey_id', 'voter_id', 'selected_option']);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
