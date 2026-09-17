/**
 * SchoolMedChatBot - unified Google Apps Script edition
 * Facebook Messenger + OpenAI Responses API + OpenAI vector store + Google Sheets
 *
 * Run initializeSheets() once after pasting this file into a Google Apps Script
 * project bound to the Google Spreadsheet used as the rule base.
 */

const PROPS = PropertiesService.getScriptProperties();
const SHEETS = {
  RULEBASE: 'rulebase',
  USERS: 'bot_users',
  HISTORY: 'bot_history'
};

const DEFAULT_SYSTEM_PROMPT = [
  'คุณคือแชทบอตภาษาไทยของโรงเรียนแพทย์วิทยาศาสตร์สุขภาพ',
  'เรียกตัวเองว่า "มีใจ" และลงท้ายอย่างสุภาพ เช่น ค่ะ',
  'ตอบข้อมูลของโรงเรียนจากข้อมูลอ้างอิงที่ให้เท่านั้น ห้ามเดาหรือแต่งข้อมูลขึ้นเอง',
  'หากคำถามเฉพาะเจาะจงแต่ไม่มีข้อมูลอ้างอิงเพียงพอ ให้ตอบ [[NO_DATA]] เท่านั้น',
  'หากผู้ใช้ระบุปีการศึกษา ต้องตอบจากปีที่ระบุเท่านั้น ห้ามใช้ข้อมูลคนละปี',
  'คำถามทั่วไปนอกเรื่องโรงเรียนให้ตอบสั้นและพากลับมาที่ข้อมูลโรงเรียน',
  'คำตอบข้อเท็จจริงสั้น ๆ ให้ตอบตรงประเด็น; คำถามที่ขอรายละเอียดให้ตอบเป็นข้อ ๆ'
].join('\n');

// -----------------------------------------------------------------------------
// Webhook
// -----------------------------------------------------------------------------

function doGet(e) {
  const token = getConfig_('VERIFY_TOKEN', '');
  const parameter = (e && e.parameter) || {};
  if (parameter['hub.verify_token'] === token) {
    return ContentService.createTextOutput(parameter['hub.challenge'] || '');
  }
  return ContentService.createTextOutput('error');
}

function doPost(e) {
  try {
    const parameter = (e && e.parameter) || {};
    const webhookSecret = getConfig_('WEBHOOK_SECRET', '');
    if (webhookSecret && parameter.secret !== webhookSecret) {
      consoleError_('doPost', 'Rejected webhook with an invalid secret');
      return ContentService.createTextOutput('EVENT_RECEIVED');
    }
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.object !== 'page') return ContentService.createTextOutput('EVENT_RECEIVED');

    (data.entry || []).forEach(function(entry) {
      (entry.messaging || []).forEach(function(event) {
        const eventId = getEventId_(event);
        if (!eventId || isEventProcessed_(eventId)) return;
        const userId = (event.sender && event.sender.id) || '';
        if (!userId) return;

        // Echo is a staff reply sent through the page, not a new user message.
        if (event.message && event.message.is_echo) {
          if (getMode_(userId) === 'agent') setLastAdminReply_(userId);
          return;
        }
        if (event.message && event.message.quick_reply) {
          replyMessage_(userId, event.message.quick_reply.payload, 'quick_reply');
        } else if (event.postback) {
          replyMessage_(userId, event.postback.payload, 'postback');
        } else if (event.message && event.message.text) {
          replyMessage_(userId, event.message.text, 'text');
        }
      });
    });
  } catch (error) {
    consoleError_('doPost', error);
  }
  return ContentService.createTextOutput('EVENT_RECEIVED');
}
function getEventId_(event) {
  if ((event.message || {}).mid) return event.message.mid;
  if ((event.postback || {}).mid) return event.postback.mid;
  return [event.sender && event.sender.id, event.timestamp,
    (event.message || {}).text || ((event.message || {}).quick_reply || {}).payload ||
    (event.postback || {}).payload || ''].join('_');
}

function isEventProcessed_(eventId) {
  const cache = CacheService.getScriptCache();
  const key = 'event:' + eventId;
  if (cache.get(key)) return true;
  cache.put(key, '1', 600); // Messenger retries can arrive within minutes.
  return false;
}

function replyMessage_(userId, incoming, source) {
  const message = normalizeText_(incoming);
  if (!message || isDuplicateUserMessage_(userId, message)) return;
  setLastUserReply_(userId);

  if (message === 'END_CHAT' || message === getConfig_('BOT_AGENT_MENU_PAYLOAD', 'END_CHAT')) {
    leaveAgentMode_(userId, getConfig_('BOT_AGENT_END_TEXT', 'สิ้นสุดการสนทนากับเจ้าหน้าที่แล้ว ระบบกลับสู่โหมดบอตเรียบร้อยค่ะ'));
    return;
  }
  if (message === 'CONTACT_AGENT' || matchesAny_(message, getCsvConfig_('BOT_CONTACT_KEYWORDS', [
    'ติดต่อเจ้าหน้าที่', 'ขอคุยกับคน', 'คุยกับคน', 'อยากคุยกับคน', 'คุยกับเจ้าหน้าที่'
  ]))) {
    enterAgentMode_(userId);
    return;
  }
  if (getMode_(userId) === 'agent') return;

  const rule = getRuleBaseReply_(message);
  if (rule) {
    sendRuleBaseReply_(userId, rule);
    appendHistory_(userId, 'user', message);
    appendHistory_(userId, 'assistant', rule.replyText || '');
    return;
  }
  handleBotTurn_(userId, message, source);
}

// -----------------------------------------------------------------------------
// AI and retrieval
// -----------------------------------------------------------------------------

function handleBotTurn_(userId, message) {
  sendTyping_(userId);
  const answer = askOpenAI_({
    userMessage: message,
    context: buildVectorContext_(message),
    history: getHistory_(userId)
  });
  appendHistory_(userId, 'user', message);
  if (!answer || /\[\[NO_DATA\]\]/i.test(answer)) {
    appendHistory_(userId, 'assistant', '[[NO_DATA]]');
    sendNoDataFallback_(userId);
    return;
  }
  appendHistory_(userId, 'assistant', answer);
  sendText_(userId, answer);
}

function askOpenAI_(params) {
  const apiKey = getRequiredConfig_('OPENAI_API_KEY');
  const model = getConfig_('OPENAI_MODEL', 'gpt-5.5');
  const history = Array.isArray(params.history) ? params.history : [];
  const context = String(params.context || '').trim();
  const historyText = history.map(function(item) {
    return String(item.role || 'user').toUpperCase() + ': ' + String(item.content || '');
  }).join('\n');
  const input = [
    context ? 'ข้อมูลอ้างอิงจาก vector store:\n' + context : '',
    historyText ? 'ประวัติการสนทนาก่อนหน้า:\n' + historyText : '',
    'คำถามล่าสุดของผู้ใช้:\n' + String(params.userMessage || '')
  ].filter(Boolean).join('\n\n');
  const payload = {
    model: model,
    instructions: getConfig_('BOT_SYSTEM_PROMPT', DEFAULT_SYSTEM_PROMPT),
    input: input,
    max_output_tokens: numberConfig_('OPENAI_MAX_OUTPUT_TOKENS', 700),
    store: false
  };
  const reasoning = getConfig_('OPENAI_REASONING_EFFORT', '');
  if (reasoning && /^o[0-9]/i.test(model)) payload.reasoning = {effort: reasoning};

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + apiKey}, payload: JSON.stringify(payload)
  });
  if (response.getResponseCode() >= 400) {
    consoleError_('OpenAI Responses API', response.getContentText());
    return '';
  }
  return extractResponseText_(JSON.parse(response.getContentText() || '{}'));
}

function extractResponseText_(data) {
  if (typeof data.output_text === 'string') return data.output_text.trim();
  const output = Array.isArray(data.output) ? data.output : [];
  for (let i = 0; i < output.length; i++) {
    const parts = Array.isArray(output[i].content) ? output[i].content : [];
    for (let j = 0; j < parts.length; j++) {
      if (typeof parts[j].text === 'string') return parts[j].text.trim();
      if (parts[j].text && typeof parts[j].text.value === 'string') return parts[j].text.value.trim();
    }
  }
  return '';
}

function buildVectorContext_(query) {
  const vectorStoreId = getConfig_('VECTOR_STORE_ID', '');
  if (!vectorStoreId) return '';
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/vector_stores/' + encodeURIComponent(vectorStoreId) + '/search', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + getRequiredConfig_('OPENAI_API_KEY')},
    payload: JSON.stringify({query: query, max_num_results: numberConfig_('VECTOR_MAX_RESULTS', 5)})
  });
  if (response.getResponseCode() >= 400) {
    consoleError_('Vector search', response.getContentText());
    return '';
  }
  const minimumScore = numberConfig_('VECTOR_SCORE_THRESHOLD', 0.25);
  return ((JSON.parse(response.getContentText() || '{}').data) || []).filter(function(item) {
    return Number(item.score || 0) >= minimumScore;
  }).map(function(item) {
    return ((item.content || []).map(function(part) { return part.text || ''; }).join('\n')).trim();
  }).filter(Boolean).join('\n---\n');
}

// -----------------------------------------------------------------------------
// Rule base: columns id, intent, match_type, keywords, reply_type, reply_text,
// reply_data, enabled. reply_type = text|button|quick_reply|card|carousel|img|filepdf
// -----------------------------------------------------------------------------

function getRuleBaseReply_(message) {
  const normalized = normalizeIntentText_(message);
  const isLong = normalized.length >= numberConfig_('RULEBASE_LONG_MESSAGE_LENGTH', 60);
  let best = null, bestScore = 0;
  loadRules_().forEach(function(rule) {
    if (!rule.enabled || (!rule.replyText && !rule.replyData)) return;
    const score = scoreRuleMatch_(normalized, rule, isLong);
    if (score > bestScore) { best = rule; bestScore = score; }
  });
  return bestScore >= numberConfig_('RULEBASE_MIN_SCORE', 5) ? best : null;
}

function loadRules_() {
  const sheet = getSheet_(getConfig_('RULEBASE_SHEET_NAME', SHEETS.RULEBASE));
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(normalizeHeader_);
  return values.map(function(row) {
    const record = {};
    headers.forEach(function(header, index) { record[header] = row[index]; });
    return {
      id: String(record.id || '').trim(), intent: String(record.intent || '').trim(),
      matchType: String(record.match_type || record.matchtype || 'contains').trim(),
      keywords: splitCsv_(record.keywords || record.keyword || ''),
      replyType: String(record.reply_type || record.replytype || 'text').trim().toLowerCase(),
      replyText: String(record.reply_text || record.reply || '').trim(),
      replyData: String(record.reply_data || record.replydata || '').trim(),
      enabled: parseBoolean_(record.enabled, true)
    };
  }).filter(function(rule) { return rule.id || rule.intent || rule.keywords.length; });
}

function scoreRuleMatch_(message, rule, isLong) {
  let best = 0;
  rule.keywords.forEach(function(keyword) {
    const key = normalizeIntentText_(keyword);
    if (!key) return;
    if (rule.matchType === 'exact') { if (message === key) best = Math.max(best, 100 + key.length); return; }
    if (rule.matchType === 'regex') { try { if (new RegExp(keyword, 'i').test(message)) best = Math.max(best, 80); } catch (e) {} return; }
    if (message.indexOf(key) !== -1) {
      let score = key.length + (key.length >= 18 ? 25 : key.length >= 12 ? 18 : key.length >= 8 ? 10 : 2);
      if (isLong && key.length < 8) score -= 12;
      if (message === key) score += 20;
      best = Math.max(best, score);
    }
  });
  return best;
}

function sendRuleBaseReply_(userId, rule) {
  const data = rule.replyData, text = rule.replyText;
  switch (rule.replyType) {
    case 'button': return sendButton_(userId, text, parseLineButtons_(data));
    case 'quick_reply': return sendQuickReplies_(userId, text, parseLineQuickReplies_(data));
    case 'card': return sendCard_(userId, parseCard_(data, text));
    case 'carousel': return sendCarousel_(userId, parseJsonArray_(data));
    case 'img': return sendAttachment_(userId, 'image', data);
    case 'filepdf': return sendAttachment_(userId, 'file', data);
    default: return sendText_(userId, text);
  }
}

// -----------------------------------------------------------------------------
// Messenger senders and human handoff
// -----------------------------------------------------------------------------

function graphPost_(body) {
  const url = 'https://graph.facebook.com/v19.0/me/messages?access_token=' + encodeURIComponent(getRequiredConfig_('PAGE_ACCESS_TOKEN'));
  const response = UrlFetchApp.fetch(url, {method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body)});
  if (response.getResponseCode() >= 400) consoleError_('Messenger Graph API', response.getContentText());
}
function sendText_(id, text) { graphPost_({recipient: {id: id}, message: {text: String(text || '').slice(0, 2000)}}); }
function sendTyping_(id) { graphPost_({recipient: {id: id}, sender_action: 'typing_on'}); }
function sendButton_(id, text, buttons) { graphPost_({recipient: {id: id}, message: {attachment: {type: 'template', payload: {template_type: 'button', text: String(text).slice(0, 640), buttons: buttons.slice(0, 3)}}}}); }
function sendQuickReplies_(id, text, replies) { graphPost_({recipient: {id: id}, message: {text: String(text).slice(0, 2000), quick_replies: replies.slice(0, 13)}}); }
function sendAttachment_(id, type, url) { graphPost_({recipient: {id: id}, message: {attachment: {type: type, payload: {url: url, is_reusable: true}}}}); }
function sendCard_(id, card) { sendCarousel_(id, [card]); }
function sendCarousel_(id, cards) {
  const elements = cards.slice(0, 10).map(function(card) {
    const element = {title: String(card.title || '').slice(0, 80)};
    if (card.subtitle) element.subtitle = String(card.subtitle).slice(0, 80);
    if (card.image_url) element.image_url = card.image_url;
    if (card.payload) element.buttons = [{type: 'postback', title: String(card.button_title || 'ดูรายละเอียด').slice(0, 20), payload: card.payload}];
    return element;
  });
  if (elements.length) graphPost_({recipient: {id: id}, message: {attachment: {type: 'template', payload: {template_type: 'generic', elements: elements}}}});
}

function enterAgentMode_(userId) {
  updateUser_(userId, function(s) { s.mode = 'agent'; s.agentModeStartAt = Date.now(); s.lastAdminReply = 0; });
  sendButton_(userId, getConfig_('BOT_AGENT_MODE_TEXT', 'กำลังติดต่อเจ้าหน้าที่ กดปุ่มด้านล่างเมื่อต้องการกลับสู่บอตค่ะ'), [{type: 'postback', title: getConfig_('BOT_AGENT_END_BUTTON_TITLE', 'จบการสนทนา').slice(0, 20), payload: getConfig_('BOT_AGENT_MENU_PAYLOAD', 'END_CHAT')}]);
}
function leaveAgentMode_(userId, message) { updateUser_(userId, function(s) { s.mode = 'bot'; s.agentModeStartAt = 0; s.lastAdminReply = 0; }); sendText_(userId, message); }
function sendNoDataFallback_(userId) { sendButton_(userId, getConfig_('BOT_NO_DATA_TEXT', 'ขออภัยค่ะ ขณะนี้ยังไม่พบข้อมูลที่ต้องการ กรุณาติดต่อเจ้าหน้าที่ค่ะ'), [{type: 'postback', title: getConfig_('BOT_CONTACT_BUTTON_TITLE', 'ติดต่อเจ้าหน้าที่').slice(0, 20), payload: getConfig_('BOT_CONTACT_BUTTON_PAYLOAD', 'CONTACT_AGENT')}]); }

function checkAgentTimeout() {
  const timeoutMs = numberConfig_('BOT_AGENT_TIMEOUT_MINUTES', 5) * 60000;
  const sheet = getUsersSheet_();
  if (sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  rows.forEach(function(row) {
    if (String(row[1]) !== 'agent') return;
    const lastActivity = Math.max(Number(row[2]) || 0, Number(row[3]) || 0, Number(row[4]) || 0);
    if (lastActivity && Date.now() - lastActivity >= timeoutMs) leaveAgentMode_(String(row[0]), getConfig_('BOT_AGENT_RETURN_TEXT', 'เนื่องจากไม่มีการตอบรับตามเวลาที่กำหนด ระบบกลับสู่โหมดบอตแล้วค่ะ'));
  });
}
function installTimeoutTrigger() { deleteTriggers_('checkAgentTimeout'); ScriptApp.newTrigger('checkAgentTimeout').timeBased().everyMinutes(1).create(); }
function setupPersistentMenu() {
  const menu = getConfig_('BOT_PERSISTENT_MENU_JSON', '');
  const payload = menu ? JSON.parse(menu) : {persistent_menu: [{locale: 'default', composer_input_disabled: false, call_to_actions: [
    {type: 'postback', title: 'ติดต่อเจ้าหน้าที่', payload: 'CONTACT_AGENT'}, {type: 'postback', title: 'จบการสนทนา', payload: 'END_CHAT'}
  ]}]};
  const url = 'https://graph.facebook.com/v19.0/me/messenger_profile?access_token=' + encodeURIComponent(getRequiredConfig_('PAGE_ACCESS_TOKEN'));
  Logger.log(UrlFetchApp.fetch(url, {method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true}).getContentText());
}

// -----------------------------------------------------------------------------
// Google Sheets persistence. These sheets are created by initializeSheets().
// -----------------------------------------------------------------------------

function initializeSheets() {
  ensureSheet_(SHEETS.RULEBASE, ['id', 'intent', 'match_type', 'keywords', 'reply_type', 'reply_text', 'reply_data', 'enabled']);
  ensureSheet_(SHEETS.USERS, ['user_id', 'mode', 'last_user_reply', 'last_admin_reply', 'agent_mode_start_at', 'last_activity']);
  ensureSheet_(SHEETS.HISTORY, ['created_at', 'user_id', 'role', 'content']);
}

function getUsersSheet_() { return ensureSheet_(SHEETS.USERS, ['user_id', 'mode', 'last_user_reply', 'last_admin_reply', 'agent_mode_start_at', 'last_activity']); }
function getHistorySheet_() { return ensureSheet_(SHEETS.HISTORY, ['created_at', 'user_id', 'role', 'content']); }
function getUser_(userId) {
  const sheet = getUsersSheet_(), row = findRow_(sheet, userId);
  if (!row) return {userId: userId, mode: 'bot', lastUserReply: 0, lastAdminReply: 0, agentModeStartAt: 0, lastActivity: 0};
  const v = sheet.getRange(row, 1, 1, 6).getValues()[0];
  return {userId: String(v[0]), mode: String(v[1] || 'bot'), lastUserReply: Number(v[2]) || 0, lastAdminReply: Number(v[3]) || 0, agentModeStartAt: Number(v[4]) || 0, lastActivity: Number(v[5]) || 0};
}
function updateUser_(userId, change) {
  const lock = LockService.getScriptLock(); lock.waitLock(5000);
  try { const state = getUser_(userId); change(state); saveUser_(state); } finally { lock.releaseLock(); }
}
function saveUser_(s) {
  const sheet = getUsersSheet_(), row = findRow_(sheet, s.userId);
  const values = [[s.userId, s.mode, s.lastUserReply, s.lastAdminReply, s.agentModeStartAt, s.lastActivity]];
  if (row) sheet.getRange(row, 1, 1, 6).setValues(values); else sheet.appendRow(values[0]);
}
function getMode_(userId) { return getUser_(userId).mode; }
function setLastUserReply_(userId) { updateUser_(userId, function(s) { s.lastUserReply = Date.now(); s.lastActivity = Date.now(); }); }
function setLastAdminReply_(userId) { updateUser_(userId, function(s) { s.lastAdminReply = Date.now(); s.lastActivity = Date.now(); }); }
function getHistory_(userId) {
  const sheet = getHistorySheet_(), max = numberConfig_('BOT_HISTORY_MAX_MESSAGES', 12), maxChars = numberConfig_('BOT_HISTORY_MAX_CHARS', 8000);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const history = [];
  for (let i = values.length - 1; i >= 0 && history.length < max; i--) if (String(values[i][1]) === String(userId)) history.unshift({role: String(values[i][2]), content: String(values[i][3])});
  while (JSON.stringify(history).length > maxChars && history.length > 1) history.shift();
  return history;
}
function appendHistory_(userId, role, content) { getHistorySheet_().appendRow([new Date(), userId, role, String(content || '')]); }

// -----------------------------------------------------------------------------
// Utilities and administrator test functions
// -----------------------------------------------------------------------------

function getSheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function ensureSheet_(name, headers) { const ss = SpreadsheetApp.getActiveSpreadsheet(); let sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name); if (!sheet.getLastRow()) sheet.appendRow(headers); return sheet; }
function findRow_(sheet, value) { const n = sheet.getLastRow(); if (n < 2) return 0; const v = sheet.getRange(2, 1, n - 1, 1).getValues(); for (let i = 0; i < v.length; i++) if (String(v[i][0]) === String(value)) return i + 2; return 0; }
function deleteTriggers_(handler) { ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t); }); }
function isDuplicateUserMessage_(id, text) { const cache = CacheService.getScriptCache(), key = 'message:' + id + ':' + Utilities.base64EncodeWebSafe(text); if (cache.get(key)) return true; cache.put(key, '1', 10); return false; }
function parseLineButtons_(data) { return String(data || '').split(/\r?\n/).map(function(line) { const p = line.split('|'); return p[0] && p[1] ? {type: 'postback', title: p[0].trim().slice(0, 20), payload: p[1].trim()} : null; }).filter(Boolean); }
function parseLineQuickReplies_(data) { return parseLineButtons_(data).map(function(b) { return {content_type: 'text', title: b.title, payload: b.payload}; }); }
function parseCard_(data, fallback) { const p = String(data || '').split('|').map(function(x) { return x.trim(); }); return {title: p[0] || fallback, subtitle: p[1] || '', payload: p[2] || '', button_title: p[3] || 'ดูรายละเอียด'}; }
function parseJsonArray_(data) { try { const value = JSON.parse(data); return Array.isArray(value) ? value : []; } catch (e) { return []; } }
function normalizeText_(value) { return String(value || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' '); }
function normalizeIntentText_(value) { return normalizeText_(value).toLowerCase().replace(/\s+/g, ''); }
function normalizeHeader_(value) { return normalizeIntentText_(value).replace(/[^a-z0-9_ก-๙]/g, ''); }
function splitCsv_(value) { return String(value || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean); }
function matchesAny_(text, keywords) { const candidate = normalizeIntentText_(text); return keywords.some(function(k) { k = normalizeIntentText_(k); return k && candidate.indexOf(k) !== -1; }); }
function parseBoolean_(value, fallback) { if (value === '' || value === null || value === undefined) return fallback; return ['true', '1', 'yes', 'y', 'ใช่', 'เปิด'].indexOf(normalizeIntentText_(value)) !== -1; }
function getConfig_(name, fallback) { const value = PROPS.getProperty(name); return value === null || value === '' ? fallback : value; }
function getRequiredConfig_(name) { const value = getConfig_(name, ''); if (!value) throw new Error(name + ' is missing from Script Properties'); return value; }
function numberConfig_(name, fallback) { const n = Number(getConfig_(name, String(fallback))); return isFinite(n) ? n : fallback; }
function consoleError_(where, error) { Logger.log(where + ': ' + (error && error.stack || error)); }
function testChatReply() { Logger.log(askOpenAI_({userMessage: 'สวัสดีค่ะ', context: buildVectorContext_('สวัสดีค่ะ'), history: []})); }
function testRuleBaseReply() { Logger.log(JSON.stringify(getRuleBaseReply_('สวัสดีค่ะ'))); }
function testRuleBaseDirectly() {
  Logger.log('Spreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log('Rules: ' + JSON.stringify(loadRules_()));
  Logger.log('Result: ' + JSON.stringify(getRuleBaseReply_('สวัสดีค่ะ')));
}
