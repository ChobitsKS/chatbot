const props = PropertiesService.getScriptProperties();

const USER_DATA_SHEET_NAME = "bot_users";
const CONVERSATION_HISTORY_SHEET_NAME = "bot_history";
const LAST_USER_MESSAGE_SHEET_NAME = "bot_last_messages";
const PROCESSED_EVENTS_SHEET_NAME = "bot_processed_events";
const AGENT_TIMEOUT_CONFIG_SHEET_NAME = "bot_agent_config";

const DEFAULT_SYSTEM_PROMPT = [
  "- คุณคือแชทบอทภาษาไทยสไตล์ ChatGPT ของโรงเรียนแพทย์วิทยาศาสตร์สุขภาพนี้",
  "- ใช้สรรพนามแทนตัวเองว่า มีใจ",
  "- ใช้คำลงท้ายสุภาพแบบผู้หญิง เช่น ค่ะ",
  "- ตอบเป็นธรรมชาติ เป็นมิตร ชัดเจน และกระชับพอเหมาะ",
  "- ช่วยผู้ใช้เรื่องข้อมูลของโรงเรียนแพทย์ฯ",
  "- หากมีบริบทจาก vector store ให้ตอบเฉพาะข้อมูลที่ระบุอยู่ในบริบทเท่านั้น ห้ามสรุปความ ห้ามตีความ ห้ามอนุมาน ห้ามขยายความ ห้ามอธิบายประโยชน์หรือวัตถุประสงค์เพิ่มเติม",
  "- ห้ามแต่งข้อมูลขององค์กรหรือหลักสูตรขึ้นเอง",
  "- หากผู้ใช้ระบุปี เช่น 2570, 2569, 2568 หรือเลขย่อ เช่น 70, 69, 68 ให้ตรวจสอบปีให้ถูกต้อง",
  "- ห้ามใช้ข้อมูลของปีอื่นมาตอบแทน",
  "- หากไม่มีข้อมูลปีที่ผู้ใช้ถาม ให้ตอบ [[NO_DATA]]",
  "- ถ้าคำถามเป็นเรื่องข้อมูลเฉพาะของโรงเรียนแพทย์ฯ/หลักสูตร และบริบทที่ให้มาไม่พอที่จะตอบอย่างมั่นใจ ให้ตอบตรงๆ ว่า [[NO_DATA]]",
  "- ห้ามเดาหรือใช้ความรู้ทั่วไปมาตอบแทนข้อมูลของโรงเรียนแพทย์ฯ",
  "- หากผู้ใช้ถามเรื่องทั่วไปที่ไม่เกี่ยวข้องกับโรงเรียนแพทย์ฯ ให้ตอบสั้น ๆ อย่างสุภาพ และพาผู้ใช้กลับเข้าสู่เรื่องที่เกี่ยวข้องกับโรงเรียนแพทย์ฯ",
  "- หลีกเลี่ยงการสนทนาเชิงส่วนตัว เช่น ความชอบส่วนตัว อาหาร งานอดิเรก หรือความคิดเห็นส่วนตัว",
  "- ไม่ต้องเพิ่มประโยคชวนสนทนา ไม่ต้องเชิญชวนให้สอบถามเพิ่มเติม เว้นแต่ผู้ใช้กำลังสนทนาเชิงต่อเนื่อง",
  "",
  "แนวทางการตอบ",
  "- ให้ปรับความละเอียดของคำตอบตามลักษณะคำถาม",
  "- หากเป็นคำถามข้อเท็จจริงสั้น ๆ ที่ต้องการคำตอบตรงไปตรงมา เช่น วันรับสมัคร สถานที่สมัคร เอกสารที่ใช้ คำนิยามของระบบหรือบริการ ให้ตอบสั้น กระชับ ตรงประเด็น 1-3 ประโยค",
  "- หากเป็นคำถามเกี่ยวกับคุณสมบัติ เงื่อนไข ขั้นตอน รายละเอียดหลักสูตร รายวิชา การเปรียบเทียบความแตกต่าง หรือผู้ใช้ขอข้อมูลเพิ่มเติม ให้ตอบอย่างละเอียดและเป็นข้อ ๆ ตามข้อมูลที่มี",
  "- หากผู้ใช้ใช้คำว่า “รายละเอียด”, “เพิ่มเติม”, “อธิบาย”, “แตกต่าง”, “เปรียบเทียบ”, “มีอะไรบ้าง”, “ทั้งหมด” ให้ตอบแบบละเอียด",
  "- ห้ามขยายความหรือสรุปเพิ่มเติมจากข้อมูลที่มี หากข้อมูลเพียงกล่าวถึงชื่อของระบบ โครงการ รายวิชา หรือบริการ แต่ไม่ได้อธิบายรายละเอียด ให้ตอบว่า [[NO_DATA]]",
  "- ห้ามอนุมานหน้าที่ วัตถุประสงค์ หรือคุณสมบัติของระบบจากชื่อหรือบริบทเพียงอย่างเดียว"
].join("\n");

function doGet(e) {
  const verifyToken = getConfig("VERIFY_TOKEN", "");
  if (e.parameter["hub.verify_token"] === verifyToken) {
    return ContentService.createTextOutput(e.parameter["hub.challenge"]);
  }
  return ContentService.createTextOutput("error");
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    if (data.object !== "page") return ContentService.createTextOutput("EVENT_RECEIVED");

    for (const entry of data.entry || []) {
      for (const event of entry.messaging || []) {
        const userId = event.sender?.id || event.recipient?.id;
        if (!userId) continue;

        const eventId =
          event.message?.mid ||
          event.postback?.mid ||
          `${userId}_${event.timestamp}_${event.message?.text || event.message?.quick_reply?.payload || event.postback?.payload || ""}`;

        if (isEventProcessed_(eventId)) continue;

        if (event.message && event.message.is_echo) {
          if (getMode(userId) === "agent") setLastAdminReply(userId);
          setLastActivity(userId);
          continue;
        }

        setLastActivity(userId);

        if (event.message?.quick_reply) {
          replyMessage(userId, event.message.quick_reply.payload, { source: "quick_reply" });
          continue;
        }
        if (event.postback) {
          replyMessage(userId, event.postback.payload, { source: "postback" });
          continue;
        }
        if (event.message?.text) {
          setLastUserReply(userId);
          replyMessage(userId, event.message.text, { source: "text" });
        }
      }
    }
  } catch (err) {
    Logger.log(err);
  }
  return ContentService.createTextOutput("EVENT_RECEIVED");
}

function replyMessage(userId, message, meta) {
  const rawMessage = normalizeText(message);
  const currentMode = getMode(userId);

  if (!rawMessage) return;

  if (isDuplicateUserMessage_(userId, rawMessage)) return;

  if (rawMessage === "END_CHAT" || rawMessage === getConfig("BOT_AGENT_MENU_PAYLOAD", "END_CHAT")) {
    setMode(userId, "bot");
    clearAgentTracking(userId);
    sendText(userId, getConfig("BOT_AGENT_END_TEXT", "✅ สิ้นสุดการสนทนากับเจ้าหน้าที่แล้ว\nระบบได้กลับสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติเรียบร้อยค่ะ 😊"));
    return;
  }

  if (normalizeIntentText(rawMessage) === normalizeIntentText(getConfig("BOT_AGENT_END_BUTTON_TITLE", "จบการสนทนา"))) {
    setMode(userId, "bot");
    clearAgentTracking(userId);
    sendText(userId, getConfig("BOT_AGENT_END_TEXT", "✅ สิ้นสุดการสนทนากับเจ้าหน้าที่แล้ว\nระบบได้กลับสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติเรียบร้อยค่ะ 😊"));
    return;
  }

  if (rawMessage === "CONTACT_AGENT" || matchesAny(rawMessage, getCsvConfig("BOT_CONTACT_KEYWORDS", ["ติดต่อเจ้าหน้าที่", "ขอคุยกับคน", "คุยกับคน", "อยากคุยกับคน", "คุยกับเจ้าหน้าที่"]))) {
    enterAgentMode(userId);
    return;
  }

  if (currentMode === "agent") return;

  const ruleReply = getRuleBaseReply(rawMessage);
  if (ruleReply) {
    sendRuleBaseReply(userId, ruleReply);
    appendConversationHistory(userId, "user", rawMessage);
    appendConversationHistory(userId, "assistant", ruleReply.replyText || ruleReply.replyData || "");
    return;
  }

  handleBotTurn(userId, rawMessage);
}

function handleBotTurn(userId, userMessage) {
  sendTyping(userId);
  const history = getConversationHistory(userId);
  const context = buildVectorContext(userMessage);
  const answer = askOpenAI({ userMessage, context, history });

  if (!answer || /\[\[NO_DATA\]\]/i.test(answer)) {
    sendNoDataFallback(userId);
    appendConversationHistory(userId, "user", userMessage);
    appendConversationHistory(userId, "assistant", "[[NO_DATA]]");
    return;
  }

  sendText(userId, answer);
  appendConversationHistory(userId, "user", userMessage);
  appendConversationHistory(userId, "assistant", answer);
}

function getRuleBaseReply(userMessage) {
  const rules = loadRuleBaseRules();
  if (!rules.length) return null;

  const normalizedUserMessage = normalizeIntentText(userMessage);
  const isLongMessage = normalizedUserMessage.length >= Number(getConfig("RULEBASE_LONG_MESSAGE_LENGTH", "60"));
  let bestRule = null;
  let bestScore = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.replyText && !rule.replyData) continue;
    const score = scoreRuleMatch_(normalizedUserMessage, rule, isLongMessage);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  const minScore = Number(getConfig("RULEBASE_MIN_SCORE", "12"));
  if (bestRule && bestScore >= minScore) {
    Logger.log("Rulebase matched: " + (bestRule.id || bestRule.intent || "(no id)") + " score=" + bestScore);
    return bestRule;
  }
  return null;
}

function scoreRuleMatch_(normalizedUserMessage, rule, isLongMessage) {
  const matchType = normalizeIntentText(rule.matchType || "contains");
  const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
  if (!keywords.length) return 0;

  let bestScore = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeIntentText(keyword);
    if (!normalizedKeyword) continue;

    if (matchType === "exact") {
      if (normalizedUserMessage === normalizedKeyword) return 100 + normalizedKeyword.length;
      continue;
    }

    if (matchType === "regex") {
      try {
        const re = new RegExp(keyword, "i");
        if (re.test(normalizedUserMessage)) bestScore = Math.max(bestScore, 80 + Math.min(normalizedKeyword.length, 20));
      } catch (err) {
        Logger.log(err);
      }
      continue;
    }

    if (normalizedUserMessage.includes(normalizedKeyword)) {
      const keywordLength = normalizedKeyword.length;
      let score = keywordLength;

      if (keywordLength >= 18) score += 25;
      else if (keywordLength >= 12) score += 18;
      else if (keywordLength >= 8) score += 10;
      else score += 2;

      if (isLongMessage && keywordLength < 8) score -= 12;
      if (normalizedUserMessage === normalizedKeyword) score += 20;

      bestScore = Math.max(bestScore, score);
    }
  }
  return bestScore;
}

function loadRuleBaseRules() {
  const sheetName = getConfig("RULEBASE_SHEET_NAME", "rulebase");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(cell => normalizeHeader_(cell));
  const rules = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const record = {};
    headers.forEach((header, idx) => record[header] = row[idx]);

    const id = String(record.id || "").trim();
    const intent = String(record.intent || "").trim();
    const matchType = String(record.match_type || record.matchtype || "contains").trim();
    const keywords = splitCsvValue_(record.keywords || record.keyword || "");
    const replyType = String(record.reply_type || record.replytype || "text").trim().toLowerCase();
    const replyText = String(record.reply_text || record.reply || "").trim();
    const replyData = String(record.reply_data || "").trim();
    const enabled = parseBoolean_(record.enabled, true);

    if (!id && !intent && !replyText && !replyData && !keywords.length) continue;

    rules.push({ id, intent, matchType, keywords, replyType, replyText, replyData, enabled });
  }

  return rules;
}

function parseButtonData_(data) {
  if (!data) return [];
  return String(data).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split("|");
    const title = String(parts[0] || "").trim().substring(0, 20);
    const payload = String(parts[1] || "").trim();
    if (!title || !payload) return null;
    return { type: "postback", title, payload };
  }).filter(Boolean).slice(0, 3);
}

function parseQuickReplyData_(data) {
  if (!data) return [];
  return String(data).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split("|");
    const title = String(parts[0] || "").trim().substring(0, 20);
    const payload = String(parts[1] || "").trim();
    if (!title || !payload) return null;
    return { content_type: "text", title, payload };
  }).filter(Boolean).slice(0, 13);
}

function parseCardData_(data) {
  if (!data) return {};
  const parts = String(data).split("|").map(x => x.trim());
  return { title: parts[0] || "", subtitle: parts[1] || "", payload: parts[2] || "" };
}

function parseCarouselData_(data) {
  if (!data) return [];
  try { const parsed = JSON.parse(data); return Array.isArray(parsed) ? parsed : []; }
  catch (err) { Logger.log("Carousel JSON error: " + err); return []; }
}

function sendRuleBaseReply(userId, rule) {
  if (!rule) return;
  const type = String(rule.replyType || "text").trim().toLowerCase();
  const text = String(rule.replyText || "").trim();
  const data = String(rule.replyData || "").trim();

  switch (type) {
    case "button":
      sendButton(userId, text, parseButtonData_(data));
      break;
    case "quick":
      sendQuickReplies(userId, text, parseQuickReplyData_(data));
      break;
    case "carousel":
      sendCarousel(userId, text, parseCarouselData_(data));
      break;
    case "card":
      sendCard(userId, text, parseCardData_(data));
      break;
    case "img":
      sendImage(userId, data);
      break;
    case "filepdf":
      sendPdf(userId, data);
      break;
    case "text":
    default:
      sendText(userId, text);
      break;
  }
}

function askOpenAI(params = {}) {
  const apiKey = getConfig("OPENAI_API_KEY", "");
  const model = getConfig("OPENAI_MODEL", "gpt-5.5");
  const reasoningEffort = getConfig("OPENAI_REASONING_EFFORT", "medium");
  const maxOutputTokens = Number(getConfig("OPENAI_MAX_OUTPUT_TOKENS", "700"));
  const systemPrompt = getConfig("BOT_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT);

  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const userMessage = params.userMessage || "";
  const context = params.context || "";
  const history = Array.isArray(params.history) ? params.history : [];
  const historyText = history.map(item => {
    const role = item && item.role ? item.role : "unknown";
    const content = item && item.content ? String(item.content) : "";
    return role.toUpperCase() + ": " + content;
  }).join("\n");

  const contextText = context && context.trim() !== "" ? "ข้อมูลอ้างอิงจาก vector store:\n" + context.trim() : "";
  const inputText = [contextText, historyText ? "ประวัติการคุยก่อนหน้า:\n" + historyText : "", "คำถามล่าสุดของผู้ใช้:\n" + userMessage].filter(Boolean).join("\n\n");

  const payload = {
    model,
    instructions: systemPrompt,
    input: inputText,
    max_output_tokens: maxOutputTokens
  };

  if (model.startsWith("o")) payload.reasoning = { effort: reasoningEffort };

  const res = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const data = JSON.parse(res.getContentText() || "{}");
  if (res.getResponseCode() >= 400) {
    Logger.log(res.getContentText());
    return "";
  }

  const text = extractResponseText(data);
  return text ? text.trim() : "";
}

function extractResponseText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string" && data.output_text.trim() !== "") return data.output_text.trim();

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (typeof part?.text === "string" && part.text.trim() !== "") return part.text.trim();
        if (typeof part?.text?.value === "string" && part.text.value.trim() !== "") return part.text.value.trim();
        if (typeof part?.value === "string" && part.value.trim() !== "") return part.value.trim();
      }
    }
  }
  return "";
}

function buildVectorContext(query) {
  const vectorStoreId = getConfig("VECTOR_STORE_ID", "");
  const apiKey = getConfig("OPENAI_API_KEY", "");
  if (!vectorStoreId || !apiKey) return "";

  const maxResults = Number(getConfig("VECTOR_MAX_RESULTS", "5"));
  const minScore = Number(getConfig("VECTOR_SCORE_THRESHOLD", "0.25"));

  const res = UrlFetchApp.fetch("https://api.openai.com/v1/vector_stores/" + vectorStoreId + "/search", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify({ query, max_num_results: maxResults }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 400) {
    Logger.log(res.getContentText());
    return "";
  }

  const data = JSON.parse(res.getContentText() || "{}");
  const items = Array.isArray(data.data) ? data.data : [];
  const lines = [];

  items.forEach(item => {
    const score = Number(item?.score || 0);
    if (score && score < minScore) return;

    const text = item?.content?.[0]?.text?.value || item?.content?.[0]?.text || "";
    if (text) lines.push(text.trim());
  });

  return lines.join("\n---\n").trim();
}

function enterAgentMode(userId) {
  setMode(userId, "agent");
  clearAgentTracking(userId);
  setAgentModeStart(userId, Date.now());
  installTimeoutTrigger();

  const buttonTitle = getConfig("BOT_AGENT_END_BUTTON_TITLE", "จบการสนทนา");
  const buttonPayload = getConfig("BOT_AGENT_MENU_PAYLOAD", "END_CHAT");
  const timeoutMinutes = getConfig("BOT_AGENT_TIMEOUT_MINUTES", "1");

  sendButton(
    userId,
    getConfig(
      "BOT_AGENT_MODE_TEXT",
      "กำลังติดต่อเจ้าหน้าที่\nกดปุ่มจบการสนทนาด้านล่างเพื่อกลับสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติได้เลยค่ะ 😊\n\n⏱️ หมายเหตุ: หากไม่มีการตอบสนองเกิน " + timeoutMinutes + " นาที จะกลับเข้าสู่โหมดอัตโนมัติเอง"
    ),
    [{ type: "postback", title: buttonTitle.substring(0, 20), payload: buttonPayload }]
  );
}

function sendNoDataFallback(userId) {
  sendButton(
    userId,
    getConfig("BOT_NO_DATA_TEXT", "🙏 ขออภัยค่ะ ขณะนี้ยังไม่พบข้อมูลที่ต้องการ\n📞 กรุณาติดต่อเจ้าหน้าที่"),
    [{ type: "postback", title: getConfig("BOT_CONTACT_BUTTON_TITLE", "ติดต่อเจ้าหน้าที่").substring(0, 20), payload: getConfig("BOT_CONTACT_BUTTON_PAYLOAD", "CONTACT_AGENT") }]
  );
}

function sendText(userId, text) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ recipient: { id: userId }, message: { text: String(text || "") } }),
    muteHttpExceptions: true
  });
}

function sendButton(userId, text, buttons) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      recipient: { id: userId },
      message: {
        attachment: {
          type: "template",
          payload: { template_type: "button", text: String(text || ""), buttons: buttons || [] }
        }
      }
    }),
    muteHttpExceptions: true
  });
}

function sendQuickReplies(userId, text, replies) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ recipient: { id: userId }, message: { text: String(text || ""), quick_replies: replies || [] } }),
    muteHttpExceptions: true
  });
}

function sendCard(userId, text, card) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  const buttons = card.payload ? [{ type: "postback", title: "ดูรายละเอียด", payload: card.payload }] : [];
  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      recipient: { id: userId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [{ title: card.title || text, subtitle: card.subtitle || "", buttons }]
          }
        }
      }
    }),
    muteHttpExceptions: true
  });
}

function sendCarousel(userId, text, cards) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  const elements = (cards || []).slice(0, 10).map(card => {
    const element = { title: String(card.title || "").substring(0, 80) };
    if (card.subtitle) element.subtitle = String(card.subtitle).substring(0, 80);
    if (card.image_url) element.image_url = card.image_url;
    if (card.payload) element.buttons = [{ type: "postback", title: String(card.button_title || "ดูรายละเอียด").substring(0, 20), payload: card.payload }];
    return element;
  });

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      recipient: { id: userId },
      message: { attachment: { type: "template", payload: { template_type: "generic", elements } } }
    }),
    muteHttpExceptions: true
  });
}

function sendImage(userId, imageUrl) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      recipient: { id: userId },
      message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } }
    }),
    muteHttpExceptions: true
  });
}

function sendPdf(userId, pdfUrl) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      recipient: { id: userId },
      message: { attachment: { type: "file", payload: { url: pdfUrl, is_reusable: true } } }
    }),
    muteHttpExceptions: true
  });
}

function sendTyping(userId) {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messages?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ recipient: { id: userId }, sender_action: "typing_on" }),
    muteHttpExceptions: true
  });
}

function setupPersistentMenu() {
  const pageAccessToken = getConfig("PAGE_ACCESS_TOKEN", "");
  if (!pageAccessToken) throw new Error("PAGE_ACCESS_TOKEN is missing");

  const rawMenu = getConfig("BOT_PERSISTENT_MENU_JSON", "");
  const payload = rawMenu ? JSON.parse(rawMenu) : {
    persistent_menu: [{
      locale: "default",
      composer_input_disabled: false,
      call_to_actions: [
        { type: "postback", title: "เกี่ยวกับเรา", payload: "ABOUT" },
        { type: "postback", title: "การรับสมัคร", payload: "TCAS" },
        { type: "postback", title: "เบอร์โทรติดต่อ", payload: "CONTACT" },
        { type: "postback", title: "ติดต่อเจ้าหน้าที่", payload: "CONTACT_AGENT" },
        { type: "postback", title: "จบการสนทนา", payload: "END_CHAT" }
      ]
    }]
  };

  UrlFetchApp.fetch("https://graph.facebook.com/v19.0/me/messenger_profile?access_token=" + pageAccessToken, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function normalizeText(text) {
  return String(text || "").replace(/\u00A0/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeIntentText(text) {
  return normalizeText(text).toLowerCase().replace(/\s+/g, "");
}

function matchesAny(text, keywords) {
  const candidate = normalizeIntentText(text);
  return keywords.some(keyword => {
    const k = normalizeIntentText(keyword);
    return k !== "" && (candidate === k || candidate.includes(k));
  });
}

function getCsvConfig(name, defaultValue) {
  const raw = getConfig(name, "");
  if (!raw) return Array.isArray(defaultValue) ? defaultValue : [];
  return raw.split(",").map(item => item.trim()).filter(Boolean);
}

function getConfig(name, defaultValue) {
  const raw = props.getProperty(name);
  if (raw === null || raw === undefined || raw === "") return defaultValue;
  return raw;
}

function normalizeHeader_(value) {
  return normalizeIntentText(value).replace(/[^a-z0-9_ก-๙]/g, "");
}

function splitCsvValue_(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function parseBoolean_(value, defaultValue) {
  if (value === null || value === undefined || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = normalizeIntentText(value);
  if (["true", "1", "yes", "y", "ใช่", "เปิด"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "ไม่", "ปิด"].includes(normalized)) return false;
  return defaultValue;
}

function getBotSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("ไม่พบ Active Spreadsheet กรุณาเปิด Apps Script จาก Google Sheet ที่ใช้กับบอท");
  return ss;
}

function ensureSheetExists_(sheetName, headers) {
  const ss = getBotSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function getUserDataSheet_() {
  return ensureSheetExists_(USER_DATA_SHEET_NAME, ["user_id", "mode", "lastUserReply", "lastAdminReply", "agentModeStartAt", "lastActivity"]);
}

function getConversationHistorySheet_() {
  return ensureSheetExists_(CONVERSATION_HISTORY_SHEET_NAME, ["timestamp", "user_id", "role", "content"]);
}

function getLastUserMessageSheet_() {
  return ensureSheetExists_(LAST_USER_MESSAGE_SHEET_NAME, ["user_id", "normalized_message", "timestamp", "expires_at"]);
}

function getProcessedEventsSheet_() {
  return ensureSheetExists_(PROCESSED_EVENTS_SHEET_NAME, ["event_id", "timestamp", "expires_at"]);
}

function getAgentTimeoutConfigSheet_() {
  return ensureSheetExists_(AGENT_TIMEOUT_CONFIG_SHEET_NAME, ["config_key", "config_value"]);
}

function findRowByFirstColumn_(sheet, searchValue) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const target = String(searchValue);
  for (let i = 0; i < values.length; i++) if (String(values[i][0]) === target) return i + 2;
  return 0;
}

function getUserState_(userId) {
  const sheet = getUserDataSheet_();
  const row = findRowByFirstColumn_(sheet, userId);
  if (!row) {
    return { userId: String(userId), mode: "bot", lastUserReply: 0, lastAdminReply: 0, agentModeStartAt: 0, lastActivity: 0 };
  }
  const values = sheet.getRange(row, 1, 1, 6).getValues()[0];
  return {
    userId: String(values[0] || userId),
    mode: String(values[1] || "bot"),
    lastUserReply: Number(values[2] || 0),
    lastAdminReply: Number(values[3] || 0),
    agentModeStartAt: Number(values[4] || 0),
    lastActivity: Number(values[5] || 0)
  };
}

function updateUserState_(userId, updater) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getUserDataSheet_();
    const row = findRowByFirstColumn_(sheet, userId);

    let state = row ? {
      userId: String(sheet.getRange(row, 1, 1, 6).getValues()[0][0] || userId),
      mode: String(sheet.getRange(row, 1, 1, 6).getValues()[0][1] || "bot"),
      lastUserReply: Number(sheet.getRange(row, 1, 1, 6).getValues()[0][2] || 0),
      lastAdminReply: Number(sheet.getRange(row, 1, 1, 6).getValues()[0][3] || 0),
      agentModeStartAt: Number(sheet.getRange(row, 1, 1, 6).getValues()[0][4] || 0),
      lastActivity: Number(sheet.getRange(row, 1, 1, 6).getValues()[0][5] || 0)
    } : { userId: String(userId), mode: "bot", lastUserReply: 0, lastAdminReply: 0, agentModeStartAt: 0, lastActivity: 0 };

    updater(state);

    const output = [[String(state.userId), String(state.mode || "bot"), Number(state.lastUserReply || 0), Number(state.lastAdminReply || 0), Number(state.agentModeStartAt || 0), Number(state.lastActivity || 0)]];
    if (row) sheet.getRange(row, 1, 1, 6).setValues(output);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, 6).setValues(output);

    return state;
  } catch (err) {
    Logger.log("updateUserState_ error: " + err);
    throw err;
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function getMode(userId) {
  return getUserState_(userId).mode || "bot";
}

function setMode(userId, mode) {
  updateUserState_(userId, state => { state.mode = mode || "bot"; });
}

function setLastUserReply(userId) {
  updateUserState_(userId, state => { state.lastUserReply = Date.now(); state.lastActivity = Date.now(); });
}

function setLastAdminReply(userId) {
  updateUserState_(userId, state => { state.lastAdminReply = Date.now(); state.lastActivity = Date.now(); });
}

function setLastActivity(userId, timestamp) {
  updateUserState_(userId, state => { state.lastActivity = Number(timestamp || Date.now()); });
}

function getLastUserReply(userId) {
  return getUserState_(userId).lastUserReply || 0;
}

function getLastAdminReply(userId) {
  return getUserState_(userId).lastAdminReply || 0;
}

function getLastActivity(userId) {
  return getUserState_(userId).lastActivity || 0;
}

function setAgentModeStart(userId, timestamp) {
  updateUserState_(userId, state => { state.agentModeStartAt = Number(timestamp || Date.now()); });
}

function getAgentModeStart(userId) {
  return getUserState_(userId).agentModeStartAt || 0;
}

function clearAgentTracking(userId) {
  updateUserState_(userId, state => { state.lastUserReply = 0; state.lastAdminReply = 0; state.agentModeStartAt = 0; });
}

function trimHistory(history, maxMessages, maxChars) {
  while (history.length > maxMessages) history.shift();
  while (JSON.stringify(history).length > maxChars && history.length > 1) history.shift();
}

function getConversationHistory(userId) {
  const sheet = getConversationHistorySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const maxMessages = Number(getConfig("BOT_HISTORY_MAX_MESSAGES", "12"));
  const maxChars = Number(getConfig("BOT_HISTORY_MAX_CHARS", "8000"));
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const history = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[1] || "") !== String(userId)) continue;
    history.unshift({ role: String(row[2] || ""), content: String(row[3] || "") });
    const trimmed = history.slice();
    trimHistory(trimmed, maxMessages, maxChars);
    if (trimmed.length >= maxMessages && history.length >= maxMessages) return trimmed;
    if (JSON.stringify(history).length >= maxChars) {
      trimHistory(history, maxMessages, maxChars);
      return history;
    }
  }

  trimHistory(history, maxMessages, maxChars);
  return history;
}

function appendConversationHistory(userId, role, content) {
  const text = String(content || "").trim();
  if (!userId || !text) return;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getConversationHistorySheet_();
    sheet.appendRow([new Date(), String(userId), String(role || ""), text]);
  } catch (err) {
    Logger.log("appendConversationHistory error: " + err);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function clearConversationHistory(userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getConversationHistorySheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][1] || "") === String(userId)) sheet.deleteRow(i + 2);
    }
  } catch (err) {
    Logger.log("clearConversationHistory error: " + err);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function isEventProcessed_(eventId) {
  if (!eventId) return false;
  const lock = LockService.getScriptLock();
  const now = Date.now();
  try {
    lock.waitLock(10000);
    const sheet = getProcessedEventsSheet_();
    const row = findRowByFirstColumn_(sheet, eventId);
    if (row) {
      const values = sheet.getRange(row, 1, 1, 3).getValues()[0];
      const expiresAt = Number(values[2] || 0);
      if (now < expiresAt) return true;
      sheet.deleteRow(row);
    }
    const expiresAt = now + 3600000;
    sheet.appendRow([String(eventId), now, expiresAt]);
    return false;
  } catch (err) {
    Logger.log("Event dedup lock error: " + err);
    return true;
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function isDuplicateUserMessage_(userId, message) {
  if (!userId || !message) return false;
  const lock = LockService.getScriptLock();
  const normalizedMessage = normalizeIntentText(message);
  const now = Date.now();

  try {
    lock.waitLock(10000);
    const sheet = getLastUserMessageSheet_();
    const row = findRowByFirstColumn_(sheet, userId);

    if (row) {
      const values = sheet.getRange(row, 1, 1, 4).getValues()[0];
      const previousMessage = String(values[1] || "");
      const expiresAt = Number(values[3] || 0);
      if (now < expiresAt) {
        if (previousMessage === normalizedMessage) return true;
      } else {
        sheet.deleteRow(row);
      }
    }

    const expiresAt = now + 60000;
    if (row) sheet.getRange(row, 1, 1, 4).setValues([[String(userId), normalizedMessage, now, expiresAt]]);
    else sheet.appendRow([String(userId), normalizedMessage, now, expiresAt]);
    return false;
  } catch (err) {
    Logger.log("Duplicate message lock error: " + err);
    return true;
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function cleanupExpiredRecords_(sheetName, expiresAtColumnIndex) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getBotSpreadsheet_().getSheetByName(sheetName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const now = Date.now();
    const values = sheet.getRange(2, 1, lastRow - 1, expiresAtColumnIndex).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const expiresAt = Number(values[i][expiresAtColumnIndex - 1] || 0);
      if (now > expiresAt) sheet.deleteRow(i + 2);
    }
  } catch (err) {
    Logger.log("cleanupExpiredRecords_ error (" + sheetName + "): " + err);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function cleanupExpiredLastMessages() {
  cleanupExpiredRecords_(LAST_USER_MESSAGE_SHEET_NAME, 4);
}

function cleanupExpiredProcessedEvents() {
  cleanupExpiredRecords_(PROCESSED_EVENTS_SHEET_NAME, 3);
}

function installCleanupTriggers() {
  removeTriggersByHandler_("cleanupExpiredLastMessages");
  removeTriggersByHandler_("cleanupExpiredProcessedEvents");
  ScriptApp.newTrigger("cleanupExpiredLastMessages").timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger("cleanupExpiredProcessedEvents").timeBased().everyMinutes(10).create();
}

function setupNewSheetSystem() {
  getLastUserMessageSheet_();
  getProcessedEventsSheet_();
  installCleanupTriggers();
}

function getAgentConfig(configKey, defaultValue) {
  const sheet = getAgentTimeoutConfigSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return defaultValue;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(configKey)) return String(values[i][1] || defaultValue);
  }
  return defaultValue;
}

function setAgentConfig(configKey, configValue) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getAgentTimeoutConfigSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      sheet.appendRow([String(configKey), String(configValue)]);
      return;
    }
    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    let found = false;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(configKey)) {
        sheet.getRange(i + 2, 2, 1, 1).setValue(String(configValue));
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([String(configKey), String(configValue)]);
  } catch (err) {
    Logger.log("setAgentConfig error: " + err);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function checkAgentTimeout() {
  const sheet = getUserDataSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const timeoutMinutes = Number(getConfig("BOT_AGENT_TIMEOUT_MINUTES", "1"));
  const now = Date.now();
  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  values.forEach(row => {
    const userId = String(row[0] || "");
    const mode = String(row[1] || "bot");
    if (!userId || mode !== "agent") return;

    const lastUserReply = Number(row[2] || 0);
    const lastAdminReply = Number(row[3] || 0);
    const startAt = Number(row[4] || 0);

    if (!startAt) return;

    let shouldTimeout = false;
    let timeoutReason = "";

    if (!lastUserReply && !lastAdminReply) {
      const idleMinutes = (now - startAt) / 1000 / 60;
      if (idleMinutes >= timeoutMinutes) {
        shouldTimeout = true;
        timeoutReason = "USER_NO_ACTIVITY";
      }
    } else if (lastAdminReply && lastAdminReply > lastUserReply) {
      const noReplyMinutes = (now - lastAdminReply) / 1000 / 60;
      if (noReplyMinutes >= timeoutMinutes) {
        shouldTimeout = true;
        timeoutReason = "ADMIN_REPLIED_NO_USER_RESPONSE";
      }
    }

    if (!shouldTimeout) return;

    setMode(userId, "bot");
    clearAgentTracking(userId);

    if (timeoutReason === "USER_NO_ACTIVITY") {
      const message = getAgentConfig("BOT_AGENT_IDLE_TIMEOUT_TEXT", "⏱️ เนื่องจากไม่มีการเคลื่อนไหวเกิน " + timeoutMinutes + " นาที\nระบบจะกลับเข้าสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติเรียบร้อยค่ะ 😊");
      sendText(userId, message);
    } else if (timeoutReason === "ADMIN_REPLIED_NO_USER_RESPONSE") {
      const message = getAgentConfig("BOT_AGENT_NO_RESPONSE_TIMEOUT_TEXT", "⏱️ เนื่องจากไม่มีการตอบสนองเกิน " + timeoutMinutes + " นาที\nระบบจะกลับเข้าสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติเรียบร้อยค่ะ 😊");
      sendText(userId, message);
    }
  });
}

function installTimeoutTrigger() {
  removeTriggersByHandler_("checkAgentTimeout");
  ScriptApp.newTrigger("checkAgentTimeout").timeBased().everyMinutes(1).create();
}

function setupAgentTimeoutConfig() {
  const timeoutMinutes = getConfig("BOT_AGENT_TIMEOUT_MINUTES", "1");
  getAgentTimeoutConfigSheet_();
  setAgentConfig("BOT_AGENT_IDLE_TIMEOUT_TEXT", "⏱️ เนื่องจากไม่มีการเคลื่อนไหวเกิน " + timeoutMinutes + " นาที\nระบบจะกลับเข้าสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติเรียบร้อยค่ะ 😊");
  setAgentConfig("BOT_AGENT_NO_RESPONSE_TIMEOUT_TEXT", "⏱️ เนื่องจากไม่มีการตอบสนองเกิน " + timeoutMinutes + " นาที\nระบบจะกลับเข้าสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติเรียบร้อยค่ะ 😊");
  installTimeoutTrigger();
}

function setupAgentModeProperties() {
  props.setProperty("BOT_AGENT_MODE_TEXT", "กำลังติดต่อเจ้าหน้าที่\nกดปุ่มจบการสนทนาด้านล่างเพื่อกลับสู่โหมดผู้ช่วยตอบคำถามอัตโนมัติได้เลยค่ะ 😊");
  props.setProperty("BOT_AGENT_END_BUTTON_TITLE", "จบการสนทนา");
  props.setProperty("BOT_AGENT_MENU_PAYLOAD", "END_CHAT");
}

function removeTriggersByHandler_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === handlerName) ScriptApp.deleteTrigger(trigger);
  });
}

// ===== Test / Utility =====
function testSheetSystem() {
  const testEventId = "test_event_" + Date.now();
  Logger.log("First event: " + isEventProcessed_(testEventId));
  Logger.log("Second event: " + isEventProcessed_(testEventId));

  const testUserId = "test_user_123";
  Logger.log("First msg: " + isDuplicateUserMessage_(testUserId, "สวัสดี"));
  Logger.log("Second msg: " + isDuplicateUserMessage_(testUserId, "สวัสดี"));
  Logger.log("Other msg: " + isDuplicateUserMessage_(testUserId, "ลาก่อน"));
}

function testRuleBaseReply() {
  const samples = ["สวัสดีค่ะ", "ขอบคุณมาก", "ขอคุยกับเจ้าหน้าที่หน่อย", "สมัครเรียนยังไง"];
  samples.forEach(text => Logger.log(text + " => " + (getRuleBaseReply(text) || "[no match]")));
}

function testChatReply() {
  const userMessage = "Binla Book คืออะไรคะ";
  const context = buildVectorContext(userMessage);
  const answer = askOpenAI({ userMessage, context, history: [] });
  Logger.log(answer);
}

function listRuleBaseRules() {
  Logger.log(JSON.stringify(loadRuleBaseRules(), null, 2));
}
