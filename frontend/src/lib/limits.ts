// Input limits, mirrored from app/schemas.py. The server is the real guard
// (it rejects anything longer); these stop it at the keystroke so nobody ever
// sees a validation error for it — and so no string can ever be long enough to
// overflow the cards it gets rendered in.
export const MAX_QUESTION_LEN = 100;
export const MAX_MEMBER_NAME_LEN = 32;
export const MAX_MEMBERS = 100;

// Show the "x left" counter only near the ceiling, so it isn't noise while
// typing something of a normal length.
export const COUNTER_SHOWS_AT = 20;
