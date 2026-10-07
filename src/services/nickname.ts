import { NICKNAME_MAX, NICKNAME_MIN } from '@/config/gameConfig';

export type NicknameError = 'tooShort' | 'tooLong' | 'invalid' | 'inappropriate';

/** Hebrew letters (incl. finals), Latin letters, digits, spaces and a few gentle symbols. */
const ALLOWED = /^[א-תa-zA-Z0-9 _\-.'׳״]+$/;

/**
 * Basic profanity filter (Hebrew + English). Deliberately conservative: blocks clear slurs and
 * obscenities while avoiding common innocent words. Not a perfect filter — and not meant to be.
 */
const BLOCK_SUBSTRINGS = [
  'זונה',
  'שרמוט',
  'מזדיי',
  'לזיין',
  'זיון',
  'כוסית',
  'כוסאמ',
  'כוסעמ',
  'כוסאוח',
  'מניאק',
  'קוקסינל',
  'נאצי',
  'היטלר',
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigg',
  'whore',
  'slut',
  'porn',
  'nazi',
  'hitler',
  'rape',
  'penis',
  'vagin',
  'asshole',
  'faggot',
  'retard',
];
const BLOCK_TOKENS = ['זין', 'כוס', 'חרא', 'סקס', 'הומו', 'sex', 'dick', 'cock', 'pussy', 'fag', 'ass', 'tits', 'kkk'];

/** Collapses look-alike characters and separators so "f.u_c k" style tricks still match. */
function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[ךכ]/g, 'כ')
    .replace(/[םמ]/g, 'מ')
    .replace(/[ןנ]/g, 'נ')
    .replace(/[ףפ]/g, 'פ')
    .replace(/[ץצ]/g, 'צ')
    .replace(/[\s_\-.'׳״]+/g, '');
}

/** Control characters, zero-width characters and bidi overrides (written as escapes on purpose). */
const INVISIBLE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(0x1f) + String.fromCharCode(0x7f) + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f) + String.fromCharCode(0x202a) + '-' + String.fromCharCode(0x202e) + String.fromCharCode(0x2066) + '-' + String.fromCharCode(0x2069) + String.fromCharCode(0xfeff) + ']', 'g');

export function sanitizeNickname(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // niqqud and cantillation
    .replace(INVISIBLE, '') // control characters + bidi overrides
    .replace(/\s+/g, ' ')
    .trim();
}

export function isProfane(nickname: string): boolean {
  const s = squash(nickname);
  if (BLOCK_SUBSTRINGS.some((w) => s.includes(squash(w)))) return true;
  const tokens = nickname
    .toLowerCase()
    .split(/[\s_\-.]+/)
    .map(squash)
    .filter(Boolean);
  return tokens.some((t) => BLOCK_TOKENS.some((w) => t === squash(w)));
}

export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; error: NicknameError } {
  const value = sanitizeNickname(raw);
  if ([...value].length < NICKNAME_MIN) return { ok: false, error: 'tooShort' };
  if ([...value].length > NICKNAME_MAX) return { ok: false, error: 'tooLong' };
  if (!ALLOWED.test(value)) return { ok: false, error: 'invalid' };
  if (isProfane(value)) return { ok: false, error: 'inappropriate' };
  return { ok: true, value };
}
