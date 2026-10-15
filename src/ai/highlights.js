/**
 * Instant "Quick highlights" without any AI model: the messages most likely to
 * matter to someone catching up — plans with times or dates, money, questions,
 * requests, locations and @mentions of you.
 */
const TIME = /\b([01]?\d|2[0-3])(:[0-5]\d)?\s?(am|pm)\b|\b([01]?\d|2[0-3]):[0-5]\d\b/i;
const DATE = /\b(today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|next week|\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i;
const MONEY = /(₹|rs\.?\s?\d|\$\s?\d|€\s?\d|\d+\s?(rupees|rs|inr|dollars|usd|eur|k)\b)/i;
const PLAN = /\b(let'?s|we will|we'll|i'll|i will|can you|could you|please|meet|deadline|don'?t forget|remember|bring|pay|book|confirm|decided|plan)\b/i;

export function scoreMessage(message, myFirstName) {
  const text = message.body ?? '';
  let score = 0;
  if (TIME.test(text)) score += 3;
  if (MONEY.test(text)) score += 3;
  if (DATE.test(text)) score += 2;
  if (PLAN.test(text)) score += 2;
  if (text.includes('?')) score += 1;
  if (myFirstName && new RegExp(`@${myFirstName}\\b`, 'i').test(text)) score += 4;
  if (message.location) score += 2;
  if (message.attachments?.some((a) => a.kind === 'file')) score += 1;
  if (text.length > 40) score += 1;
  return score;
}

/** Up to `limit` of the most important messages, shown in chat order. */
export function quickHighlights(messages, { limit = 5, myFirstName } = {}) {
  return messages
    .map((message, index) => ({ message, index, score: scoreMessage(message, myFirstName) }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.message);
}
