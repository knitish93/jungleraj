/* =========================================================
   vote-sync.js — optional shared backend for survey votes,
   without a database: votes are appended as rows to a Google
   Sheet via a Google Apps Script Web App.

   Setup: see tools/google-apps-script.gs for the script to deploy,
   then paste the deployed Web App URL below. Until you do, this
   is a no-op and every page keeps working exactly as before
   (localStorage-only, this-browser-only results).
   ========================================================= */
'use strict';

window.JR_VOTE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzcN67LfIi8zkK--u3U37PTd4bK6E9eKG2wQT54o9xVXw05XY8koeJO7Z-QwtjrcYUslg/exec'; // e.g. 'https://script.google.com/macros/s/XXXXX/exec'

const JrVoteSync = (() => {
  function isConfigured() {
    return !!window.JR_VOTE_ENDPOINT;
  }

  // Fire-and-forget: append one vote to the sheet. Uses text/plain instead
  // of application/json to avoid a CORS preflight request, which Apps
  // Script Web Apps don't handle (there's no doOptions()).
  async function submitVote(surveyId, voterId, optionId) {
    if (!isConfigured()) return null;
    try {
      const resp = await fetch(window.JR_VOTE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ survey_id: surveyId, voter_id: voterId, selected_option: optionId }),
      });
      return await resp.json();
    } catch (err) {
      console.warn('JrVoteSync: submitVote failed, vote kept locally only.', err);
      return null;
    }
  }

  // Every GET below hits the exact same URL each time a survey's tallies
  // are re-checked (e.g. once on modal open, again right after voting) —
  // without cache:'no-store' the browser can silently serve the FIRST
  // (pre-vote) response for the second, identical request instead of
  // re-fetching, making a fresh vote look like it was never counted.
  const NO_CACHE = { cache: 'no-store' };

  // Returns { [optionId]: count } for one survey, or null if unavailable.
  async function fetchTallies(surveyId) {
    if (!isConfigured()) return null;
    try {
      const resp = await fetch(`${window.JR_VOTE_ENDPOINT}?survey_id=${encodeURIComponent(surveyId)}`, NO_CACHE);
      const data = await resp.json();
      return data.counts || null;
    } catch (err) {
      console.warn('JrVoteSync: fetchTallies failed, showing local data only.', err);
      return null;
    }
  }

  // Returns the raw [{survey_id, voter_id, selected_option}, ...] rows for
  // one survey, or null if unavailable — used where callers need to know
  // who voted for what (e.g. "has this browser already voted"), not just
  // aggregate counts.
  async function fetchRawVotes(surveyId) {
    if (!isConfigured()) return null;
    try {
      const resp = await fetch(`${window.JR_VOTE_ENDPOINT}?survey_id=${encodeURIComponent(surveyId)}&raw=1`, NO_CACHE);
      const data = await resp.json();
      return data.votes || null;
    } catch (err) {
      console.warn('JrVoteSync: fetchRawVotes failed, showing local data only.', err);
      return null;
    }
  }

  // Returns { totalVotes, bySurvey: { surveyId: count } } across every
  // survey in one request — used for the site-wide "total votes" stat so it
  // doesn't need one request per survey.
  async function fetchAllTallies() {
    if (!isConfigured()) return null;
    try {
      const resp = await fetch(window.JR_VOTE_ENDPOINT, NO_CACHE);
      const data = await resp.json();
      return data.totalVotes != null ? data : null;
    } catch (err) {
      console.warn('JrVoteSync: fetchAllTallies failed, showing local data only.', err);
      return null;
    }
  }

  return { isConfigured, submitVote, fetchTallies, fetchRawVotes, fetchAllTallies };
})();

// Top-level `const` in a classic script doesn't become a window property
// (unlike `var`/function declarations), but surveys.js/featured-surveys.js
// guard their calls with `window.JrVoteSync && ...` — so it needs to be
// attached explicitly for that check to ever pass.
window.JrVoteSync = JrVoteSync;
