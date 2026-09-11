/**
 * STREAM EVENTS — a moment can originate anywhere, not only on the cameras.
 *
 * WHY THIS EXISTS. Events were camera-only, and a playtester had one attention point spare for
 * the cameras, so he saw TWO moments in twenty-two minutes and called the phase boring. He was
 * right, and the fix is not a faster spawn rate: it is that every stream should be able to
 * produce something worth noticing, which is also what a control centre actually feels like.
 *
 * Each stream's moments must feel like THAT stream. The Call Archive is something you HEAR; the
 * Switchboard is a pattern in a log; the Dialler is a screen of lead data; the Group Chats are
 * messages arriving; the Spreadsheet is a figure changing. A chat message must not read like a
 * camera observation, so each stream carries its own verb and its own noticing label.
 *
 * The writing follows the mechanism my camera lines were missing: a TURN in the second or third
 * sentence. 'The daily total updates. It goes up by $3,000 in a single edit. The refund was
 * meant to be $300. The zero was added by hand.' The flat register is the delivery; the turn is
 * the joke, or the horror, and without one a line is merely a stock-take.
 *
 * Grounded in the reporting collated in please-hold-research/02-scam-operations-domain.md and
 * 18-stream-events.md: Jim Browning's surveillance, Scammer Payback's refund-and-courier arc,
 * the Indian call-centre raids, and FTC material on gift cards and mules. The
 * workers-are-also-victims tier is drawn from that reporting, not invented for effect.
 */

import type { IntelKind, StreamId } from '../engine/types';
import type { CameraEventTier } from './phase2events';

export interface StreamEventDef {
  tier: CameraEventTier;
  line: string;
  kinds: IntelKind[];
}

/**
 * How each stream announces a moment, and what the claim button says.
 *
 * The verb is the whole point of splitting these out: 'SEE THIS' on a spreadsheet is wrong, and
 * a group chat does not light up the way a camera does.
 */
export const STREAM_EVENT_VOICE: Record<StreamId, { flag: string; claim: string; noun: string }> = {
  cctv: { flag: 'SEE THIS', claim: 'Note it down', noun: 'camera' },
  recordings: { flag: 'HEAR THIS', claim: 'Keep the recording', noun: 'recording' },
  switchboard: { flag: 'PATTERN', claim: 'Log the pattern', noun: 'switchboard log' },
  crm: { flag: 'ON SCREEN', claim: 'Copy the record', noun: 'dialler console' },
  whatsapp: { flag: 'NEW MESSAGE', claim: 'Screenshot it', noun: 'group chat' },
  ledger: { flag: 'FIGURE CHANGED', claim: 'Keep the version', noun: 'spreadsheet' },
};

export const STREAM_EVENTS: Partial<Record<StreamId, StreamEventDef[]>> = {
  // ------------------------------------------------------ THE CALL ARCHIVE — something you hear
  recordings: [
    { tier: 'mundane', kinds: ['evidence'],
      line: 'A recording has finished processing. It is nineteen minutes long. Two of those minutes are hold music. It is the hold music.' },
    { tier: 'revealing', kinds: ['people', 'structure'],
      line: 'A call in the archive has no speech for the first four minutes. There is typing. There is a second voice, faint, coaching.' },
    { tier: 'revealing', kinds: ['structure'],
      line: 'The same three-second clip appears at the start of forty recordings. It is a greeting. It is read from the same script by different voices.' },
    { tier: 'revealing', kinds: ['structure', 'evidence'],
      line: 'A recording is tagged QUALITY REVIEW. The reviewer\'s note reads: "Good. But offer the case ID sooner."' },
    { tier: 'incriminating', kinds: ['structure', 'evidence'],
      line: 'A call is transferred at 11:40. The first voice says "putting you through to the refund department." There is no refund department. It is the next desk.' },
    { tier: 'incriminating', kinds: ['evidence', 'money'],
      line: 'In one recording a long number is read aloud, then read again more slowly. A card is being confirmed digit by digit.' },
    { tier: 'incriminating', kinds: ['evidence'],
      line: 'A recording captures the closer saying "do not tell your bank what it is for." The caller agrees. The caller sounds relieved to be helped.' },
    { tier: 'human', kinds: ['evidence', 'money'],
      line: 'A caller in a recording says she is seventy-nine. She is walked through buying six gift cards. She reads all six codes. She thanks him.' },
    { tier: 'human', kinds: ['evidence'],
      line: 'A recording ends with the caller crying. The agent does not end the call. The agent begins a second sale on the same call.' },
    { tier: 'incriminating', kinds: ['people', 'structure'],
      line: 'The archive holds one recording marked TRAINING. A trainer stops the trainee mid-line and says "again, and this time she believes you."' },
    { tier: 'human', kinds: ['people'],
      line: 'A recording is 04:00 local. The agent yawns twice. The script does not change. The pressure does not change.' },
    { tier: 'human', kinds: ['evidence'],
      line: 'A recording contains a second call bleeding through from the next desk. Two victims are audible at once. Neither knows the other exists.' },
    { tier: 'human', kinds: ['people', 'evidence'],
      line: 'A recording is filed under an agent name that also appears on the roster as RECRUITED. His first archived call is a training call. He is the victim in it.' },
    { tier: 'incriminating', kinds: ['evidence'],
      line: 'A recording is flagged for deletion by an account that is not the IT account. It has not been deleted. It plays.' },
    { tier: 'revealing', kinds: ['people', 'evidence'],
      line: 'A caller in a recording says "you\'ve called me four times this week." The agent checks the list and says "our records show this is the first contact."' },
  ],

  // ------------------------------------------------------ THE SWITCHBOARD — a pattern in a log
  switchboard: [
    { tier: 'mundane', kinds: ['structure'],
      line: 'Extension 118 has not received a call in nine days. It receives a call today. It rings once and stops.' },
    { tier: 'revealing', kinds: ['structure', 'evidence'],
      line: 'Every outbound call on the log presents a United States area code. The building is not in the United States.' },
    { tier: 'revealing', kinds: ['structure'],
      line: 'One extension routes to eleven others and receives from none. The log calls it the DIALLER trunk. Everything starts there.' },
    { tier: 'revealing', kinds: ['structure'],
      line: 'Three extensions ring only one other extension, and only ever after a call has run past nine minutes. That extension is not on the floor plan.' },
    { tier: 'revealing', kinds: ['structure', 'people'],
      line: 'At 02:14 every extension on the floor goes idle within the same minute. One extension in the back office stays active for another hour.' },
    { tier: 'revealing', kinds: ['structure'],
      line: 'Extension 200 receives a short call from every desk at the end of each shift. The calls are under thirty seconds. It is a count being reported.' },
    { tier: 'incriminating', kinds: ['structure', 'evidence'],
      line: 'A caller ID on an inbound call reads the name of a real bank. The routing shows it originated three desks away.' },
    { tier: 'incriminating', kinds: ['structure', 'evidence'],
      line: 'The log shows a call transferred through four extensions in ninety seconds. Opener, closer, a third desk, then the back office. The victim was on hold for all of it.' },
    { tier: 'incriminating', kinds: ['people', 'evidence'],
      line: 'One number is dialled outbound two hundred and forty times in a day. It is a single victim. The log calls the list REACTIVATION.' },
    { tier: 'incriminating', kinds: ['structure', 'money'],
      line: 'An extension is logged calling an international number every night at the same minute. The number is not a victim. It is where the money reports.' },
    { tier: 'revealing', kinds: ['people', 'structure'],
      line: 'A block of forty extensions was renamed last night. The old names are still in the archive. They match names on the roster.' },
    { tier: 'human', kinds: ['people'],
      line: 'Extension 143 stops appearing in the log entirely after a Tuesday. The desk it maps to is reassigned by Thursday. The name is not.' },
    { tier: 'revealing', kinds: ['people', 'structure'],
      line: 'Three extensions share a single handset serial in the log. One person has been three agents this week.' },
    { tier: 'incriminating', kinds: ['structure', 'people'],
      line: 'The log shows one extension that only ever calls the others. It never takes a call, never dials out. It is listening. It is the manager.' },
  ],

  // ------------------------------------------------------ THE DIALLER CONSOLE — a screen of lead data
  crm: [
    { tier: 'mundane', kinds: ['people', 'money'],
      line: 'The dialler is loading a lead list of 4,102 names. The list is titled with last month and the word FRESH.' },
    { tier: 'mundane', kinds: ['structure', 'people'],
      line: 'A lead\'s status field is updated from NO ANSWER to CALLBACK. The callback time is 03:00. The lead\'s time zone is not this one.' },
    { tier: 'revealing', kinds: ['structure', 'evidence'],
      line: 'The rebuttal tree branches on "I need to ask my son." The selected branch is headed DO NOT LET THEM HANG UP.' },
    { tier: 'incriminating', kinds: ['people', 'money', 'evidence'],
      line: 'A lead list is tagged PRIOR. Every name on it has a note, and every note is a dollar figure already taken.' },
    { tier: 'incriminating', kinds: ['people', 'money'],
      line: 'The leaderboard reorders. The top name has a figure beside it in the tens of thousands for the day. It is one person\'s day.' },
    { tier: 'incriminating', kinds: ['people', 'evidence'],
      line: 'A lead record carries a full name, an address, a date of birth, and a bank. The bank field is populated. That did not come from the phone book.' },
    { tier: 'human', kinds: ['people', 'evidence'],
      line: 'A column on the lead list is headed AGE. It is sorted descending. The console is working from the top.' },
    { tier: 'human', kinds: ['evidence'],
      line: 'A lead is flagged DECEASED — DO NOT CALL. The flag was added today. The prior status was PAYMENT PENDING.' },
    { tier: 'human', kinds: ['people'],
      line: 'The bottom of the leaderboard is highlighted. A note has been appended to that agent\'s row. The note is a warning, and it is not the first.' },
    { tier: 'human', kinds: ['evidence', 'money'],
      line: 'A lead note reads "widow, alone, calls me every day now." The status is kept OPEN.' },
    { tier: 'incriminating', kinds: ['structure', 'evidence'],
      line: 'A rebuttal branch is headed IF THEY MENTION THE POLICE. It has three sub-branches. All three end at the same instruction: stay on the line.' },
    { tier: 'revealing', kinds: ['people'],
      line: 'The console shows a per-agent conversion rate. One agent\'s rate is zero across two hundred calls. His start date was yesterday.' },
    { tier: 'incriminating', kinds: ['people', 'evidence'],
      line: 'A lead list is being imported from a file named for a data breach that was in the news. The import completes. 61,000 records.' },
    { tier: 'incriminating', kinds: ['people', 'money', 'evidence'],
      line: 'A "sucker list" of prior victims is loaded on its own. It is smaller and it is worth more. The console prioritises it above the fresh list.' },
    { tier: 'revealing', kinds: ['people', 'structure'],
      line: 'A trainee account is logged in on the console. Its screen mirrors a senior agent\'s, three desks over, in real time. The trainee is watching a live call being run.' },
    { tier: 'human', kinds: ['people', 'evidence'],
      line: 'An agent\'s own name appears on a lead list as a record. The status is RECRUITED. The source field reads a job advertisement.' },
  ],

  // ------------------------------------------------------ THE GROUP CHATS — messages arriving
  whatsapp: [
    { tier: 'mundane', kinds: ['structure'],
      line: 'A message is pinned in the main group. It reads: "TARGET 40 today. anyone under 5 stays late."' },
    { tier: 'mundane', kinds: ['people'],
      line: '04:12. A manager posts: "great energy tonight team. lets finish strong." No one replies.' },
    { tier: 'mundane', kinds: ['people'],
      line: 'Someone posts in the floor group: "what is the wifi password." A reply: "same as always." No one gives the password.' },
    { tier: 'mundane', kinds: ['people'],
      line: 'A message reads: "who took the good headset from desk 14." Three people deny it. The headset is not returned.' },
    { tier: 'revealing', kinds: ['structure', 'evidence'],
      line: 'A voice note is posted, forty seconds long. It is a script being read aloud, for practice. The reactions are thumbs-up.' },
    { tier: 'revealing', kinds: ['people', 'structure'],
      line: 'A new number joins the group. The admin posts: "everyone this is the new joining today, be nice, no floor talk here." Floor talk continues.' },
    { tier: 'incriminating', kinds: ['money', 'evidence'],
      line: 'A message: "boss says no gift cards under 200 from now, waste of time." A reply: "what about the ones already loaded."' },
    { tier: 'incriminating', kinds: ['money', 'evidence'],
      line: 'Someone posts a screenshot of a bank confirmation into the group with the caption "CLEARED." Twelve reactions.' },
    { tier: 'human', kinds: ['evidence', 'money'],
      line: 'A message reads: "the old lady from tuesday called back she wants to send more. do i take it." The reply is one word: "yes."' },
    { tier: 'incriminating', kinds: ['money', 'evidence'],
      line: 'A pinned message lists account names and numbers under the heading DROP THIS WEEK. It has been edited four times today.' },
    { tier: 'incriminating', kinds: ['structure', 'evidence'],
      line: 'A message: "police came to my cousin\'s centre in the morning. everyone out by lunch. we are fine here."' },
    { tier: 'human', kinds: ['people', 'evidence'],
      line: 'Someone posts: "i cant do this one she reminds me of my grandmother." A manager replies: "close it or i find someone who will."' },
    { tier: 'human', kinds: ['people'],
      line: 'A message reads: "when do we get paid." It is posted four times over three days by four different people. There is no reply in the group.' },
    { tier: 'human', kinds: ['people', 'evidence'],
      line: 'A new joiner posts: "the ad said customer support. this is not customer support." He is removed from the group at 04:40. He is still on the roster.' },
    { tier: 'revealing', kinds: ['structure', 'evidence'],
      line: 'A message: "if anyone asks the landlord we are a marketing company." A reply: "we are a marketing company."' },
    { tier: 'human', kinds: ['people'],
      line: 'Someone posts a photo of the leaderboard with "bottom three know who you are." The three are named in the next message.' },
  ],

  // ------------------------------------------------------ THE SPREADSHEET — a figure changing
  ledger: [
    { tier: 'incriminating', kinds: ['money', 'evidence'],
      line: 'The daily total updates. It goes up by $3,000 in a single edit. The refund was meant to be $300. The zero was added by hand.' },
    { tier: 'mundane', kinds: ['structure', 'money'],
      line: 'A new tab has been added, named for today\'s date. It is a copy of yesterday\'s, with the numbers cleared and the names kept.' },
    { tier: 'revealing', kinds: ['money'],
      line: 'A cell in the TAKINGS column turns from a figure to the text PENDING. An hour later it is a figure again, larger.' },
    { tier: 'incriminating', kinds: ['money', 'structure', 'evidence'],
      line: 'A column headed FEES lists a cut against each mule account. The cut is fifteen percent. It is subtracted before the row above it is paid.' },
    { tier: 'incriminating', kinds: ['money', 'evidence'],
      line: 'A row is added under the heading GIFT. It records a card brand, a value, and a code. The code column is set to hidden.' },
    { tier: 'incriminating', kinds: ['money', 'people', 'evidence'],
      line: 'A tab named GOLD converts dollar figures to weights. The rightmost column is a courier\'s name.' },
    { tier: 'human', kinds: ['people', 'money'],
      line: 'The per-agent sales column is sorted. A conditional format turns the bottom two rows red. The red does not change for a week.' },
    { tier: 'human', kinds: ['money', 'evidence'],
      line: 'A single victim\'s first name recurs down forty rows across three months. The running total beside it passes six figures.' },
    { tier: 'incriminating', kinds: ['money', 'people', 'evidence'],
      line: 'A tab is named MULES. It lists account holders, banks, and a status column. Most say ACTIVE. Three say FROZEN. One says ARRESTED.' },
    { tier: 'incriminating', kinds: ['structure', 'money'],
      line: 'A formula in the summary cell references a tab that is not in this workbook. The tab is named for a jurisdiction with no extradition treaty.' },
    { tier: 'human', kinds: ['people', 'money'],
      line: 'A row\'s PAID-OUT cell for an agent is blank while the SOLD cell is not. It has been blank for two pay periods.' },
    { tier: 'revealing', kinds: ['structure', 'money'],
      line: 'The owner\'s tab is password protected. The summary figure from it is pasted, as a value, into the shared sheet each morning. Only the figure travels.' },
    { tier: 'revealing', kinds: ['money', 'evidence'],
      line: 'A cell comment reads "chargeback, reverse it out." The figure is reversed out. The victim\'s name stays on the sheet.' },
    { tier: 'human', kinds: ['people', 'money'],
      line: 'A new column is inserted headed RECRUITMENT COST. It lists small negative figures against agent names. The workers are a line item.' },
    { tier: 'incriminating', kinds: ['money', 'evidence'],
      line: 'The monthly total is calculated. It is $313,000. The figure is not flagged, not hidden, not remarked on. It is just the total.' },
  ],

};

/** Every stream that can produce a moment of its own. */
export const EVENT_STREAMS = Object.keys(STREAM_EVENTS) as StreamId[];
