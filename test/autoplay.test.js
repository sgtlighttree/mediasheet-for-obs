const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planAutoplay, planOverride, autoplayLeadMs } = require('../public/playlist.js');

const PLAYING = 'OBS_MEDIA_STATE_PLAYING';
const PAUSED = 'OBS_MEDIA_STATE_PAUSED';
const ENDED = 'OBS_MEDIA_STATE_ENDED';
const order = [{ sourceName: 'A' }, { sourceName: 'B' }, { sourceName: 'C' }];
const playing = (sourceName, cursor, duration = 60000) => ({ sourceName, state: PLAYING, cursor, duration });

describe('planAutoplay', () => {
  it('starts with the first clip when nothing is live', () => {
    assert.deepEqual(planAutoplay({ order, live: [], loop: true, leadMs: 400 }), { act: 'start', clip: order[0] });
  });

  it('does nothing for an empty playlist', () => {
    assert.equal(planAutoplay({ order: [], live: [], loop: true, leadMs: 400 }).act, 'idle');
  });

  it('plans the next clip so the take starts leadMs before the end', () => {
    const p = planAutoplay({ order, live: [playing('A', 20000)], loop: true, leadMs: 400 });
    assert.equal(p.act, 'advance');
    assert.equal(p.next.sourceName, 'B');
    assert.equal(p.takeInMs, 39600);
    assert.equal(p.cueNow, false);
  });

  it('cues the next clip once the take is within the cue-ahead window', () => {
    const p = planAutoplay({ order, live: [playing('A', 55000)], loop: true, leadMs: 400 });
    assert.equal(p.takeInMs, 4600);
    assert.equal(p.cueNow, true);
  });

  it('wraps to the first clip when looping, finishes when not', () => {
    assert.equal(planAutoplay({ order, live: [playing('C', 10000)], loop: true, leadMs: 400 }).next.sourceName, 'A');
    assert.deepEqual(planAutoplay({ order, live: [playing('C', 10000)], loop: false, leadMs: 400 }), { act: 'finished' });
  });

  it('advances at once from an ended clip, or finishes if it was the last and loop is off', () => {
    const ended = (n) => ({ sourceName: n, state: ENDED, cursor: null, duration: null });
    assert.deepEqual(planAutoplay({ order, live: [ended('A')], loop: false, leadMs: 400 }), { act: 'advance', next: order[1], takeInMs: 0, cueNow: true });
    assert.deepEqual(planAutoplay({ order, live: [ended('C')], loop: false, leadMs: 400 }), { act: 'finished' });
  });

  it('a paused live clip is a hold: nothing happens', () => {
    const p = planAutoplay({ order, live: [{ sourceName: 'A', state: PAUSED, cursor: 100, duration: 60000 }], loop: true, leadMs: 400 });
    assert.equal(p.act, 'idle');
  });

  it('a clip taken by hand that is not in the order restarts the list', () => {
    assert.equal(planAutoplay({ order, live: [playing('Z', 1000)], loop: true, leadMs: 400 }).next.sourceName, 'A');
  });

  it('keeps a minimum time on air for very short clips', () => {
    const p = planAutoplay({ order, live: [playing('A', 500, 1500)], loop: true, leadMs: 400 });
    assert.equal(p.takeInMs, 2500);
  });

  it('waits while the duration is not known yet', () => {
    const p = planAutoplay({ order, live: [{ sourceName: 'A', state: PLAYING, cursor: 0, duration: null }], loop: true, leadMs: 400 });
    assert.equal(p.act, 'idle');
  });

  it('a single-clip playlist loops onto itself (a re-take) and finishes without loop', () => {
    const one = [{ sourceName: 'A' }];
    assert.equal(planAutoplay({ order: one, live: [playing('A', 1000)], loop: true, leadMs: 400 }).next.sourceName, 'A');
    assert.equal(planAutoplay({ order: one, live: [playing('A', 1000)], loop: false, leadMs: 400 }).act, 'finished');
  });

  it('with several live clips it follows the playing one', () => {
    const live = [{ sourceName: 'A', state: ENDED }, playing('B', 1000)];
    assert.equal(planAutoplay({ order, live, loop: true, leadMs: 400 }).next.sourceName, 'C');
  });
});

describe('planOverride', () => {
  const base = { locked: false, manualAt: 0, lastAdvanceAt: 1000, heldFor: null, liveName: 'A' };
  it('runs when nothing was pressed since the last advance', () => {
    assert.equal(planOverride(base).act, 'run');
  });
  it('stands down when the operator pressed something after the last advance', () => {
    assert.equal(planOverride({ ...base, manualAt: 2000 }).act, 'hold-now');
  });
  it('an older press does not count', () => {
    assert.equal(planOverride({ ...base, manualAt: 500 }).act, 'run');
  });
  it('keeps holding while the same clip is live, releases when the live clip changes', () => {
    assert.equal(planOverride({ ...base, manualAt: 2000, heldFor: 'A' }).act, 'hold');
    assert.equal(planOverride({ ...base, manualAt: 2000, heldFor: 'A', liveName: 'Z' }).act, 'release');
  });
  it('holding on "nothing live" releases when something goes live', () => {
    assert.equal(planOverride({ ...base, heldFor: '', liveName: '' }).act, 'hold');
    assert.equal(planOverride({ ...base, heldFor: '', liveName: 'Z' }).act, 'release');
  });
  it('with the lock on, presses never make it yield', () => {
    assert.equal(planOverride({ ...base, locked: true, manualAt: 2000 }).act, 'run');
  });
});

describe('autoplayLeadMs', () => {
  const t = { audioFadeMs: 400, fadeMs: 600, stingerPointMs: 1000 };
  it('a cut lands at the end of the clip after the audio fade-out', () => {
    assert.equal(autoplayLeadMs({ ...t, transition: 'cut' }), 400);
  });
  it('a fade and a stinger add what the take does before the picture moves', () => {
    assert.equal(autoplayLeadMs({ ...t, transition: 'fade' }), 850);
    assert.equal(autoplayLeadMs({ ...t, transition: 'stinger' }), 1250);
  });
});
