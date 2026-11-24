// NPCs and their conversations. Dialogue is plain data. The server owns the conversation:
// the client asks to talk to someone, is told what the NPC says and which choices exist,
// and replies with a choice NUMBER only. It can never name a node, a reward or a decision.
//
// A node:   { lines: [text...], choices: [{ text, next?: nodeId, fx?: effects }] }
//   next missing = the conversation ends after this choice.
// Effects:  { rel: {npcId: n}, flag: 'name', decision: ['key','value'], cash: pence (+ given to you, - you pay) }
//   Effects apply ONCE per choice (remembered in story.flags), so talking again can't farm XP.
// An NPC has an `entry(story)` that picks the first node, so they remember you.
import { touchStory } from './story.mjs'

export const TALK_RANGE = 4.5 // metres, checked on the server

export const NPCS = {
  aisha: {
    id: 'aisha', name: 'Aisha Rahman', role: 'Café owner', gender: 'female',
    skin: '#A97C5B', hair: '#171514', outfit: '#6B557D',
    x: 165.5, z: 57.5, ry: 0.6,
    entry: (s) => (s.flags['met:aisha'] ? (s.flags['money:missing'] ? 'rumour' : 'again') : s.flags['met:leon'] ? 'helloLeon' : 'hello'),
    nodes: {
      hello: {
        lines: ["You're new around here, aren't you?"],
        choices: [
          { text: 'Yeah, just finding my feet.', next: 'feet', fx: { rel: { aisha: 3 }, flag: 'met:aisha' } },
          { text: 'Is it that obvious?', next: 'obvious', fx: { rel: { aisha: 2 }, flag: 'met:aisha' } },
          { text: "I'm looking for work, actually.", next: 'work', fx: { rel: { aisha: 2 }, flag: 'met:aisha' } },
        ],
      },
      helloLeon: {
        lines: [
          "You're the one Leon's been going on about. Don't look so worried, I don't bite. Much.",
          'He says you need work. Lucky for you, I need hands on shifts.',
        ],
        choices: [
          { text: "I'll take it. Thank you.", next: 'work', fx: { rel: { aisha: 3 }, flag: 'met:aisha' } },
          { text: 'Leon talks a lot.', next: 'leonTalk', fx: { rel: { aisha: 1 }, flag: 'met:aisha' } },
        ],
      },
      leonTalk: {
        lines: ['He does. Mostly about money he hasn’t got.', 'He’s a good one, underneath. Just keep your eyes open around him.'],
        choices: [
          { text: 'What do you mean by that?', next: 'worry' },
          { text: "I'll take the shifts.", next: 'work' },
        ],
      },
      worry: {
        lines: ['Debts. Digbeth runs on them, and not all of them are with banks.', 'If he ever drags you into something, I want to hear it from you first. Deal?'],
        choices: [
          { text: "Deal. I'll tell you.", next: 'work', fx: { flag: 'warned:aisha', rel: { aisha: 3 }, decision: ['aishaPromise', 'yes'] } },
          { text: "I can look after myself.", next: 'work', fx: { flag: 'warned:aisha', decision: ['aishaPromise', 'no'] } },
        ],
      },
      feet: {
        lines: ['Thought so. Everyone does, the first week.', "Digbeth's friendlier than it looks, mind."],
        choices: [
          { text: 'Do you know anywhere hiring?', next: 'work' },
          { text: "Thanks. I'll look around." },
        ],
      },
      obvious: {
        lines: ['You keep looking at the street signs like they might bite.', "Don't worry. You'll learn the place."],
        choices: [
          { text: 'Know anywhere that needs a hand?', next: 'work' },
          { text: "What's the story with this area?", next: 'area' },
        ],
      },
      work: {
        lines: ['I could always use a hand on shifts. Nothing fancy, but it’s honest pay.', 'The job is at the counter whenever you want it.'],
        choices: [
          { text: "I'll do that.", fx: { flag: 'lead:cafe' } },
          { text: "What's the story with this area?", next: 'area', fx: { flag: 'lead:cafe' } },
        ],
      },
      area: {
        lines: [
          "Meridian's been buying up half the yard. Foundry Yard, they're calling it now.",
          'Some say it is progress. My rent says otherwise. Ask around and make up your own mind.',
        ],
        choices: [
          { text: "I'll keep an ear out.", fx: { flag: 'heard:meridian', rel: { aisha: 2 } } },
          { text: 'Sounds like they could bring jobs though.', fx: { flag: 'heard:meridian', decision: ['firstView', 'open'] } },
          { text: "That doesn't sound fair on the locals.", fx: { flag: 'heard:meridian', rel: { aisha: 4 }, decision: ['firstView', 'local'] } },
        ],
      },
      again: {
        lines: ['Back again! How is Digbeth treating you?'],
        choices: [
          { text: 'Getting there.', fx: { rel: { aisha: 1 }, flag: 'chat:aisha-1' } },
          { text: 'Any more work going?', next: 'work' },
          { text: "What's the story with this area?", next: 'area' },
          { text: 'Just saying hello.' },
        ],
      },
      rumour: {
        lines: ['There was trouble under the arches last night. Everyone is talking about it.', "Leon isn't answering his phone. Is he with you?"],
        choices: [
          { text: "He's fine. I think.", next: 'rumour2', fx: { rel: { aisha: 1 } } },
          { text: 'Who runs those lock-ups?', next: 'rumour2' },
        ],
      },
      rumour2: {
        lines: ['Vic Danso, mostly. Keep well away from him.', "And remember what I said. If it's bad, I want to hear it from you."],
        choices: [{ text: 'I will.', fx: { flag: 'chat:aisha-rumour' } }],
      },
    },
  },

  raymond: {
    id: 'raymond', name: 'Raymond Ellis', role: 'Local resident', gender: 'male',
    skin: '#6B4A36', hair: '#A9A9A9', outfit: '#56704F',
    x: 134.5, z: 41, ry: -0.7,
    entry: (s) => (s.flags['met:raymond'] ? 'again' : 'hello'),
    nodes: {
      hello: {
        lines: ["Gibb Street's seen more shop fronts than I've had hot dinners.", "You're new. They all are, these days."],
        choices: [
          { text: "What's changed round here?", next: 'change', fx: { flag: 'met:raymond', rel: { raymond: 2 } } },
          { text: 'Any advice for someone new?', next: 'advice', fx: { flag: 'met:raymond', rel: { raymond: 2 } } },
          { text: 'Just passing through.', fx: { flag: 'met:raymond' } },
        ],
      },
      change: {
        lines: [
          'Thirty-one years I worked at Ellis Castings. Now they call it Foundry Yard, like it is a new idea.',
          'Same bricks, different names over the doors. Folk keep promising things. I will believe it when I see it.',
        ],
        choices: [{ text: 'Fair enough.' }],
      },
      advice: {
        lines: ['Keep your receipts. Keep your head down till you know who is who.', 'And say hello to the ones who run the cafés. They know everything.'],
        choices: [{ text: "I'll remember that.", fx: { flag: 'tip:raymond' } }],
      },
      again: {
        lines: ['Still here, then. Good.'],
        choices: [
          { text: "What's changed round here?", next: 'change' },
          { text: 'Take care, Raymond.' },
        ],
      },
    },
  },

  // Mission 2 (v53): the parts dealer Leon sends you to. Haggling decides what you can hand back.
  kenny: {
    id: 'kenny', name: 'Kenny Doyle', role: 'Parts dealer', gender: 'male',
    skin: '#E2BDA4', hair: '#7A7A7A', outfit: '#4A3B2A',
    x: 445.2, z: 95, ry: 0.79,
    entry: (s) => (!s.flags['part:asked'] ? 'closed' : !s.flags['part:bought'] ? 'sell' : 'done'),
    nodes: {
      closed: {
        lines: ["We're shut. Unless you're buying, in which case we're open."],
        choices: [{ text: 'Just looking.' }],
      },
      sell: {
        lines: ["You're Leon's lad? He still owes me for the last two.", 'Clutch kit for a Corsa. Hundred and twenty. Cash.'],
        choices: [
          { text: 'Fine. A hundred and twenty.', next: 'sold', fx: { flag: 'part:bought', decision: ['partPrice', '120'], cash: -12000 } },
          { text: "Leon's a regular. Ninety, and he keeps coming back.", next: 'ninety' },
          { text: "Seventy. That's off a scrapper, I can see the rust.", next: 'seventy' },
        ],
      },
      ninety: {
        lines: ["A regular who doesn't pay. Lovely.", '...Go on then. Ninety.'],
        choices: [{ text: 'Deal.', next: 'sold', fx: { flag: 'part:bought', decision: ['partPrice', '90'], cash: -9000, rel: { kenny: 1 } } }],
      },
      seventy: {
        lines: ['You what?', '...Seventy. And you tell nobody where it came from.'],
        choices: [
          { text: "Wouldn't dream of it.", next: 'sold', fx: { flag: 'part:bought', decision: ['partPrice', '70'], cash: -7000, rel: { kenny: -2 } } },
          { text: 'Alright, ninety. Call it goodwill.', next: 'sold', fx: { flag: 'part:bought', decision: ['partPrice', '90'], cash: -9000, rel: { kenny: 2 } } },
        ],
      },
      sold: {
        lines: ["There. Tell Leon I want paying for the last two. And drive careful, I know that hatchback's history."],
        choices: [{ text: 'Cheers, Kenny.' }],
      },
      done: {
        lines: ['Got your part. Go on, before I change my mind.'],
        choices: [{ text: 'Going.' }],
      },
    },
  },
  leon: {
    id: 'leon', name: 'Leon Campbell', role: 'Mechanic and hustler', gender: 'male',
    skin: '#8A5A3C', hair: '#171514', outfit: '#30343A',
    x: 101, z: 79.5, ry: -2.2,
    // Act 1 as in the story bible (v53): the sofa (mission 1), then the clutch kit (mission 2, decision 1).
    // The old lock-up nodes (favour, tonight, alone, blamed) wait to be reworked into mission 6.
    entry: (s) => {
      if (!s.flags['met:leon']) return 'hello'
      if (!s.flags['lead:garage']) return 'again'
      if (!s.flags['part:asked']) return 'part'
      if (!s.flags['part:bought']) return 'partWaiting'
      if (!s.flags['leon:paid']) return `back${s.decisions.partPrice ?? '120'}`
      return s.decisions.helpedLeon === 'yes' ? 'afterHelped' : 'afterNot'
    },
    nodes: {
      hello: {
        lines: ['Oi! Look who actually turned up.', "Told you Digbeth wasn't far. Dump your bag, my sofa's yours till you sort yourself out."],
        choices: [
          { text: 'Cheers, Leon. I owe you.', next: 'sofa', fx: { flag: 'met:leon', rel: { leon: 3 } } },
          { text: 'Nice garage. Business good?', next: 'garage', fx: { flag: 'met:leon', rel: { leon: 1 } } },
          { text: 'Where am I actually sleeping?', next: 'sofa', fx: { flag: 'met:leon' } },
        ],
      },
      sofa: {
        lines: ['Mind the springs, it bites. Rent is cheap, mind. The landlord owes me a favour. Do not ask.', 'First rule: get a job. I am not your bank.'],
        choices: [
          { text: 'Where do I start?', next: 'job' },
          { text: 'You alright? You look knackered.', next: 'tired', fx: { rel: { leon: 1 } } },
        ],
      },
      garage: {
        lines: ['Business is fine. Mostly cash, mostly quiet.', 'Some of it is other people’s cash, mind. Long story.'],
        choices: [
          { text: "Other people's?", next: 'tired' },
          { text: 'Right. Where do I start?', next: 'job' },
        ],
      },
      tired: {
        lines: [
          'I owe someone. Not a lot, not yet. A bloke called Vic Danso, runs the scrapyard behind the arches.',
          "It's sorted. Nearly. Forget I said it.",
        ],
        choices: [
          { text: 'Forget what?', next: 'job', fx: { flag: 'heard:danso', decision: ['leonHelp', 'brushed'] } },
          { text: 'If you need help, ask.', next: 'job', fx: { flag: 'heard:danso', rel: { leon: 3 }, decision: ['leonHelp', 'offered'] } },
        ],
      },
      job: {
        lines: ['Get your head down tonight. Tomorrow I need you for something.', 'Garage stuff. Nothing dodgy. Mostly.'],
        choices: [{ text: 'Night, Leon.', fx: { flag: 'lead:garage' } }],
      },
      again: {
        lines: ["Still up? Sofa. Sleep. I'll need you in the morning."],
        choices: [
          { text: 'Night, Leon.', fx: { flag: 'lead:garage' } },
          { text: 'Tell me about this Danso.', next: 'tired' },
        ],
      },
      // ---- Mission 2: One More Favour ----
      part: {
        lines: [
          "Right. Don't laugh. My supplier's stopped giving me credit, and I've got a Corsa on the ramp with no clutch and a customer who wants it Friday.",
          "Kenny's Motor Spares, Adderley Street. Clutch kit. Here's a hundred and twenty, it's all that's in the tin. Take the grey hatchback out front.",
          "And Jordan? That hatchback isn't exactly... registered. Keep it clean. No police.",
        ],
        choices: [
          { text: 'On it.', fx: { flag: 'part:asked', cash: 12000, rel: { leon: 1 } } },
          { text: "A hundred and twenty for a clutch kit? You're being robbed.", next: 'robbed' },
        ],
      },
      robbed: {
        lines: ["Probably. Kenny charges what he thinks you'll pay. Talk him down if you can. Every quid helps."],
        choices: [{ text: 'Leave it with me.', fx: { flag: 'part:asked', cash: 12000, rel: { leon: 2 } } }],
      },
      partWaiting: {
        lines: ["Kenny's. Adderley Street. Clutch kit. Go on, the Corsa isn't fixing itself."],
        choices: [{ text: 'Going.' }],
      },
      back120: {
        lines: ['You got it! Go on then, what did he sting me for?'],
        choices: [
          { text: "Full whack. A hundred and twenty. He wouldn't budge.", next: 'afterPaid', fx: { flag: 'leon:paid', decision: ['helpedLeon', 'no'] } },
          { text: 'Full price. And here, fifty quid towards the invoices.', next: 'thanks', fx: { flag: 'leon:paid', decision: ['helpedLeon', 'yes'], cash: -5000, rel: { leon: 6 } } },
        ],
      },
      back90: {
        lines: ['You got it! Go on then, what did he sting me for?'],
        choices: [
          { text: 'Ninety. Here’s your thirty back.', next: 'thanks', fx: { flag: 'leon:paid', decision: ['helpedLeon', 'yes'], cash: -3000, rel: { leon: 4 } } },
          { text: "A hundred and twenty. He wouldn't budge.", next: 'afterPaid', fx: { flag: 'leon:paid', decision: ['helpedLeon', 'no'] } },
        ],
      },
      back70: {
        lines: ['You got it! Go on then, what did he sting me for?'],
        choices: [
          { text: 'Seventy. Here’s fifty back. Kenny was not happy.', next: 'thanks', fx: { flag: 'leon:paid', decision: ['helpedLeon', 'yes'], cash: -5000, rel: { leon: 5 } } },
          { text: 'A hundred and twenty. Daylight robbery.', next: 'afterPaid', fx: { flag: 'leon:paid', decision: ['helpedLeon', 'no'] } },
        ],
      },
      thanks: {
        lines: ["...You're joking. That's this week's invoices covered.", "Don't tell anyone I nearly cried in my own garage. Owe you one, proper."],
        choices: [{ text: 'You put a roof over my head. Call it even.' }],
      },
      afterPaid: {
        lines: ["Kenny. Course he wouldn't. Right, cheers for running it over.", "I'll find the money somewhere. Always do."],
        choices: [{ text: 'See you later.' }],
      },
      afterHelped: {
        lines: ["Supplier's back on side. The Corsa's out Friday. You're alright, you."],
        choices: [{ text: 'Told you I would be.' }],
      },
      afterNot: {
        lines: ['Busy. Invoices. Don’t ask.'],
        choices: [{ text: 'Right.' }],
      },
      favour: {
        lines: [
          'Right. Got a minute? A proper favour this time.',
          'A friend is moving some cash tonight at a lock-up near the courier depot. I need someone at the end of the lane to whistle if anyone turns up.',
          'Twenty minutes. Fifty quid. No bags touched, no questions asked.',
        ],
        choices: [
          { text: "Fine. I'll do it.", next: 'yes', fx: { flag: 'favour:decided', rel: { leon: 4 }, decision: ['favour', 'accepted'] } },
          { text: "Not my kind of thing, Leon.", next: 'no', fx: { flag: 'favour:decided', rel: { leon: -3 }, decision: ['favour', 'declined'] } },
          { text: 'Whose money is it?', next: 'whose' },
        ],
      },
      whose: {
        lines: ["Doesn't matter. Not mine. Safer if you don't know."],
        choices: [
          { text: "Fine. I'll do it.", next: 'yes', fx: { flag: 'favour:decided', rel: { leon: 4 }, decision: ['favour', 'accepted'] } },
          { text: "No. I'm out.", next: 'no', fx: { flag: 'favour:decided', rel: { leon: -3 }, decision: ['favour', 'declined'] } },
        ],
      },
      yes: {
        lines: ['Knew I could count on you.', 'Head to the lock-up near the courier depot. Stand at the end of the lane. If it goes quiet, you have done it right.'],
        choices: [{ text: 'Got it.' }],
      },
      no: {
        lines: ['Fine. Fine. Forget I asked.', "I'll sort it myself. Don't wait up."],
        choices: [
          { text: 'Leon, be careful.', fx: { rel: { leon: 1 } } },
          { text: 'See you later.' },
        ],
      },
      tonight: {
        lines: ['Tonight, remember. The lock-up near the courier depot. End of the lane.'],
        choices: [{ text: 'I remember.' }],
      },
      alone: {
        lines: ["I said I'd sort it myself. I'm sorting it."],
        choices: [{ text: 'Just be careful.' }],
      },
      blamed: {
        lines: [
          "Danso's people are asking questions. I was meant to be the lookout, remember? It's on me now.",
          'Whatever you saw, whatever you heard: keep it to yourself until I know who took it.',
        ],
        choices: [
          { text: "I'll help you find it.", fx: { rel: { leon: 3 }, decision: ['leonTrust', 'helps'] } },
          { text: 'Then keep me out of it.', fx: { rel: { leon: -3 }, decision: ['leonTrust', 'distant'] } },
        ],
      },
    },
  },

  nia: {
    id: 'nia', name: 'Nia Okafor', role: 'Recruiter', gender: 'female',
    skin: '#6B4A36', hair: '#171514', outfit: '#315B78',
    x: 196, z: 63.5, ry: 2.4,
    entry: (s) => {
      if (s.flags['met:nia'] || s.flags['money:missing']) return 'again'
      if (s.decisions.favour === 'accepted') return 'nightYes'
      if (s.decisions.favour === 'declined') return 'nightNo'
      return 'hello'
    },
    nodes: {
      hello: {
        lines: ["Hi, sorry to stop you. Are you local? I'm Nia. I recruit for a few firms round here."],
        choices: [
          { text: 'Fairly new. Looking for opportunities.', next: 'offer', fx: { flag: 'met:nia', rel: { nia: 2 } } },
          { text: 'Just passing. What do you do, exactly?', next: 'what', fx: { flag: 'met:nia', rel: { nia: 1 } } },
        ],
      },
      what: {
        lines: ['Recruitment and business development. I connect people with employers who actually pay properly.'],
        choices: [{ text: 'Anything for someone starting out?', next: 'offer' }],
      },
      offer: {
        lines: [
          'There is a local business and jobs event coming up. Meridian Developments are hosting it, for the Foundry Yard project.',
          'Employers, independents, some training providers. Worth showing your face.',
        ],
        choices: [
          { text: 'Meridian? What are they planning?', next: 'meridian' },
          { text: "I'll think about it.", fx: { flag: 'invite:meridian' } },
        ],
      },
      meridian: {
        lines: ['Redevelopment. Flats, offices, shops, a whole new quarter. Daniel Mercer leads it, he is the one to talk to.'],
        choices: [
          { text: 'Sounds interesting.', fx: { flag: 'invite:meridian', rel: { nia: 2 } } },
          { text: "Aisha wasn't keen on them.", fx: { flag: 'invite:meridian', rel: { nia: -1 } } },
        ],
      },
      nightYes: {
        lines: ["You're the lookout. Leon's lookout. Right.", "Then hear this before anyone else tells you: the lock-up is empty. The money is gone, and so is the man who was carrying it."],
        choices: [
          { text: 'Gone? Gone where?', next: 'gone' },
          { text: "I didn't see anyone. I swear.", next: 'gone', fx: { rel: { nia: 1 } } },
        ],
      },
      nightNo: {
        lines: ["You shouldn't be here. Are you with Leon Campbell?", "Never mind. Something has happened at that lock-up. The money is gone and the courier with it. Leon is going to need friends."],
        choices: [
          { text: 'What money?', next: 'gone' },
          { text: 'I told him no.', next: 'gone' },
        ],
      },
      gone: {
        lines: [
          "I can't explain here. But Danso's people will be asking who was close, and Leon's name will come up first.",
          'I help people untangle things like this. If you want to help Leon, find me tomorrow. Same spot.',
        ],
        choices: [
          { text: 'Why would you help us?', next: 'why' },
          { text: "I'll be there.", fx: { flag: 'money:missing', rel: { nia: 2 } } },
          { text: 'Not my problem.', fx: { flag: 'money:missing', rel: { nia: -2 } } },
        ],
      },
      why: {
        lines: ["Let's just say I have seen what happens when people like Danso get angry, and who ends up paying for it."],
        choices: [
          { text: "I'll be there.", fx: { flag: 'money:missing', rel: { nia: 2 } } },
          { text: 'I need to think.', fx: { flag: 'money:missing' } },
        ],
      },
      again: {
        lines: ['Hello again. We should talk properly when things are quieter.'],
        choices: [
          { text: 'What do you know about the lock-up?', next: 'again2' },
          { text: 'Not today.' },
        ],
      },
      again2: {
        lines: ['More than I can say here. Keep your head down and watch who asks about Leon.'],
        choices: [{ text: 'I will.' }],
      },
    },
  },
}

/** What the client is told about each NPC (no dialogue). */
export const NPC_LIST = Object.values(NPCS).map(({ id, name, role, gender, skin, hair, outfit, x, z, ry }) => ({ id, name, role, gender, skin, hair, outfit, x, z, ry }))

const clamp = (n) => Math.max(-100, Math.min(100, n))

export function startTalk(story, npcId) {
  const npc = NPCS[npcId]
  if (!npc) return null
  return { npc: npcId, node: npc.entry(story) }
}

/** What to show for the current node: lines and the choice texts (numbered by position). */
export function view(state) {
  const npc = NPCS[state.npc]
  const node = npc.nodes[state.node]
  return { t: 'dialogue', npc: npc.id, name: npc.name, role: npc.role, lines: node.lines, choices: node.choices.map((c) => c.text) }
}

function applyEffects(story, npcId, nodeId, index, fx) {
  if (!fx) return
  const once = `fx:${npcId}:${nodeId}:${index}`
  if (story.flags[once]) return
  story.flags[once] = true
  for (const [who, delta] of Object.entries(fx.rel ?? {})) story.relationships[who] = clamp((story.relationships[who] ?? 0) + delta)
  if (fx.flag) story.flags[fx.flag] = true
  if (fx.decision) story.decisions[fx.decision[0]] ??= fx.decision[1] // the first answer is the one that counts
  touchStory()
  return fx.cash ?? 0
}

/**
 * Applies the player's pick. `index` is a position in the current node's choices, checked here.
 * Returns { end: true } or { end: false, state } for the next node, or null if the pick was invalid.
 */
export function choose(story, state, index) {
  const npc = NPCS[state.npc]
  const node = npc?.nodes[state.node]
  if (!node || !Number.isInteger(index) || index < 0 || index >= node.choices.length) return null
  const picked = node.choices[index]
  const cash = applyEffects(story, state.npc, state.node, index, picked.fx) ?? 0
  if (!picked.next) return { end: true, cash }
  return { end: false, state: { npc: state.npc, node: picked.next }, cash }
}

export const storySnapshot = (story) => ({
  t: 'story',
  chapterId: story.chapterId,
  relationships: story.relationships,
  decisions: story.decisions,
  flags: Object.fromEntries(Object.entries(story.flags).filter(([k]) => !k.startsWith('fx:'))),
})
