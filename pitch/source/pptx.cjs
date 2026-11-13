// ASCLEPIUS_SpaceApps2026_deck.pptx: each rendered slide as a full-bleed image, its title as
// real (searchable) text, and the pitch line in the speaker notes.
const path = require('path');
const pptxgen = require('pptxgenjs');
const S = [
  ['ASCLEPIUS: Medicine for when Earth is too far away', 'I am Tula Manish from Warangal, and this is ASCLEPIUS. It is an offline health check for astronauts that knows whether Earth can answer in time, and tells the crew what to do when it cannot.'],
  ['On Mars, your doctor is on Earth', 'Mars is 4 to 22 minutes away by radio, each way. 11 minutes on 14 November 2026, from NASA JPL Horizons. In 2028 the Sun cuts the link for 27 days. And normal is personal: a heart rate of 74 is fine for most people, but a warning for someone whose own normal is 52 to 62.'],
  ['One minute. Six readings. One clear answer.', 'The daily check takes about a minute: the six readings from the challenge. Each one is checked against the usual adult range and against your own learned normal. The worse result wins, and every colour on the body map shows its rule and source. No AI makes health decisions.'],
  ['Earth Reply Clock: can Earth answer before you must act?', 'This is new. For every finding we compare when you must act with when Earth can answer: light time there, the flight surgeon\'s reply, light time back. Earth guides, Earth confirms, or the crew decides. For a red result on Mars, Earth needs 27 minutes even with the surgeon on shift. You have 10. The crew decides.'],
  ['Crew Pulse: one person, the cabin, or something spreading?', 'The medical officer sees the whole crew. Three of four crew with headaches on the same day, and cabin CO2 above NASA\'s 3 mmHg limit: it is the air, not the people. A fever moving from Kwame to Mei two days apart: possible infection. Mood stays private.'],
  ['Proof on real NASA crew data', 'We ran our own rule on NASA\'s Inspiration4 blood data. The day after landing, all four crew had smaller red blood cells than their own lowest pre-flight value, while all four looked normal on the population range. I also found and fixed a shifted row in the NASA file. Four people and a 3-day flight, so this is consistent with our idea, not proof.'],
  ['Delay is delay: impact on Earth', 'The same clock works near Warangal, where the nearest doctor can be hours away: travel time replaces light time, with a Telugu daily check. It is open source, tested with 147 automated tests, and the live demo runs on any phone. Thank you.'],
];
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.title = 'ASCLEPIUS · NASA Space Apps 2026';
S.forEach(([title, notes], i) => {
  const s = pres.addSlide();
  s.background = { color: '000000' };
  s.addText(title, { x: 0, y: 0, w: 13.333, h: 0.4, fontSize: 1, color: '000000' }); // searchable title, hidden under the image
  s.addImage({ path: path.join(__dirname, 'png', `slide-${i + 1}.png`), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addNotes(notes);
});
pres.writeFile({ fileName: path.join(__dirname, '..', 'ASCLEPIUS_SpaceApps2026_deck.pptx') }).then((f) => console.log('wrote', f));
