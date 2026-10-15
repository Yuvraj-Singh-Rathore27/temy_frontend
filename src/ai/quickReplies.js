/**
 * Instant reply suggestions without any AI model: common messages (greetings, thanks,
 * "where are you?", requests…) get three short answers, in English or Hinglish to
 * match the message.
 */
const HINGLISH = /\b(kya|kaise|kaisa|kaisi|kab|kaha|kahan|kyu|kyun|hai|hain|ho|haan|han|nahi|nhi|acha|accha|achha|thik|theek|bhai|yaar|yar|kar|karo|krna|karna|tum|aap|mera|meri|tera|teri|bata|batao|chalo|abhi|kal|aaj)\b/i;

// [test, English replies, Hinglish replies]
const RULES = [
  [/\b(happy\s+b(irth)?day|hbd)\b/i, ['Thank you so much! 🎉', 'Thanks a lot 😊', 'Thank you! ❤️'], ['Thank you so much! 🎉', 'Bahut bahut shukriya 😊', 'Thanks yaar ❤️']],
  [/\b(congrat(s|ulations)?|well done|great job|badhai)\b/i, ['Thank you! 😊', 'Thanks a lot!', 'Means a lot 🙏'], ['Thank you! 😊', 'Shukriya 🙏', 'Thanks yaar!']],
  [/\b(good\s*night|gn|shubh ratri)\b/i, ['Good night 🌙', 'Sweet dreams', 'Good night, take care'], ['Good night 🌙', 'Sweet dreams', 'Good night, take care']],
  [/\b(good\s*morning|gm|suprabhat)\b/i, ['Good morning! ☀️', 'Morning! Have a great day', 'Good morning 😊'], ['Good morning! ☀️', 'Good morning, kaise ho?', 'Good morning 😊']],
  [/\b(how\s+are\s+you|how\s+r\s+u|how's it going|what'?s up|wassup|sup|kaise\s+ho|kaisa\s+hai|kya\s+haal|kya\s+chal\s+raha)\b/i, ["I'm good, you? 😊", 'All good! What about you?', 'Doing great 👍'], ['Badhiya, aap batao? 😊', 'Sab badhiya! Tum kaise ho?', 'Mast 👍']],
  [/\b(thanks|thank\s*(you|u)|thx|ty|tysm|shukriya|dhanyavad|dhanyawad)\b/i, ["You're welcome 😊", 'Anytime!', 'No problem 👍'], ['Koi baat nahi 😊', 'Anytime!', 'Welcome 👍']],
  [/\b(sorry|my bad|maaf)\b/i, ['No worries 😊', "It's okay", "Don't worry about it"], ['Koi baat nahi 😊', 'Its okay', 'Tension mat lo']],
  [/\b(where\s+(are|r)\s+(you|u)|kaha\s+ho|kahan\s+ho|kidhar\s+ho|kaha\s+hai)\b/i, ['On my way 🚗', 'At home', "I'll be there soon"], ['Raste mein hoon 🚗', 'Ghar pe hoon', 'Bas pahunch raha hoon']],
  [/\b(call\s+me|give\s+me\s+a\s+call|call\s+karo|call\s+kar)\b/i, ['Calling you now', 'Will call in 5 minutes', "Can't talk now, text me?"], ['Abhi call karta hoon', '5 min mein call karta hoon', 'Abhi baat nahi kar sakta, message karo?']],
  [/\b(what\s+time|when\s+(are|r|will|should|do|can)|kab|kitne\s+baje)\b/i, ['Let me check and tell you', 'Not sure yet, will confirm', 'When works for you?'], ['Check karke batata hoon', 'Abhi pakka nahi, confirm karta hoon', 'Tumhe kab theek rahega?']],
  [/\b(can\s+(you|u)|could\s+(you|u)|will\s+(you|u)|would\s+(you|u)|please|pls|plz|kar\s+doge|kar\s+do|kar\s+dena|bhej\s+do)\b/i, ['Sure 👍', "Yes, I'll do it", "Sorry, I can't"], ['Haan, kar dunga 👍', 'Theek hai', 'Sorry, nahi ho payega']],
  [/^\s*(hi+|hello+|hey+|hy+|helo|namaste|namaskar|yo)\b[\s!.👋]*$/iu, ['Hi! 👋', 'Hey, how are you?', 'Hello 😊'], ['Hi! 👋', 'Hey, kaise ho?', 'Hello 😊']],
  [/^\s*(ok+|okay|done|cool|fine|alright|k|kk|theek\s+hai|thik\s+hai|👍)\s*[.!]*\s*$/iu, ['👍', 'Great!', 'Thanks!'], ['👍', 'Badhiya!', 'Thanks!']],
  [/\b(miss\s+(you|u))\b/i, ['Miss you too ❤️', 'Aww ❤️', "Let's meet soon"], ['Miss you too ❤️', 'Aww ❤️', 'Jaldi milte hain']],
  [/\b(lol|lmao|haha+|hehe+)\b|😂|🤣/iu, ['😂😂', 'Haha true', 'I know right 😄'], ['😂😂', 'Haha sahi hai', 'Exactly 😄']],
];

const QUESTION = [['Yes', 'No', 'Let me check'], ['Haan', 'Nahi', 'Check karke batata hoon']];
const MEDIA = ['Nice! 😍', 'Looks great!', 'Wow 👌'];

/** Up to three suggestions for a message (or [] when nothing obvious fits). */
export function quickReplies(message) {
  const text = message?.body?.trim() ?? '';
  if (!text) {
    const visual = message?.attachments?.some((a) => a.kind === 'image' || a.kind === 'video') || message?.sticker;
    return visual ? MEDIA : [];
  }
  const hinglish = HINGLISH.test(text) ? 1 : 0;
  for (const [test, english, hindi] of RULES) if (test.test(text)) return hinglish ? hindi : english;
  if (/\?\s*$/.test(text) && text.length < 120) return QUESTION[hinglish];
  return [];
}
