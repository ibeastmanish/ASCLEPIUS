// ASCLEPIUS_SpaceApps2026_deck.pptx: each rendered slide as a full-bleed image, its title as
// real (searchable) text, and the pitch line in the speaker notes.
const path = require('path');
const pptxgen = require('pptxgenjs');
const S = [
  ["ASCLEPIUS: Medicine for when Earth is too far away", "Hi everyone. I'm Tula Manish, from Warangal. Let me start with a question. Imagine you're an astronaut on Mars. You wake up, and something feels wrong. Your heart is racing. You hardly slept. You want to ask a doctor. But the closest doctor is on Earth. That's the problem I worked on. My project is called ASCLEPIUS. Medicine for when Earth is too far away."],
  ["On Mars, your doctor is on Earth", "Here's why it's hard. A message from Mars takes up to twenty-two minutes to reach Earth. The answer takes just as long to come back. And in 2028, it gets worse. The Sun moves between Earth and Mars. For twenty-seven days, you can't reach Earth at all. There's a second problem too. Normal is personal. A heart rate of seventy-four is fine for most people. But if yours is usually in the fifties, seventy-four is a warning. A normal health chart would miss that."],
  ["One minute. One clear answer.", "So here's what my app does. Every morning, the astronaut spends one minute on six things. Blood pressure. Heart rate. Blood sugar. Temperature. Sleep. And mood. These are the six the challenge asks for. The app checks each one twice. Once against the normal adult range. And once against that person's own normal. It learns that normal in the first week. Then it shows a body map. Green, yellow or red. Tap any colour, and it tells you why. No AI makes the health decisions. Just clear rules you can check. And it all works offline."],
  ["Earth Reply Clock and Autonomy Forecast", "Now, this is the part I'm proudest of. I call it the Earth Reply Clock. When something looks wrong, the app asks one question. Can Earth answer before you have to act? Here's an example. Your blood sugar drops very low. NASA's distance data says Earth needs at least twenty-seven minutes to reply. Maybe an hour, if the doctor is off shift. But you have to act in ten. So the app tells you straight. Don't wait. Your crew decides now. Earth checks it later. I didn't stop at one day. I ran it for every day of the mission, up to 2029. So the crew knows ahead of time when they'll be on their own. They get a month's warning to prepare."],
  ["Crew Pulse: one person, the cabin, or something spreading?", "I also built something for the crew's medical officer. It's called Crew Pulse. It looks at the whole crew, not just one person. If one person has a headache, that's about them. But if three out of four get headaches on the same day? It's probably not the people. It's the air. So the app says, check the air first. And if a fever moves from one person to the next, it warns about a possible infection."],
  ["Proof on real NASA crew data", "I didn't want to just say that your own normal matters. I wanted to test it on real astronauts. So I used NASA's blood tests from the four Inspiration Four crew members. The day after they landed, all four looked normal on the standard chart. But compared with their own numbers from before the flight, all four had changed. While I was working with that file, I found a mistake in NASA's data. One row was shifted by a column. I fixed it, and I reported it to NASA. To be fair, that's only four people. So it supports the idea. It doesn't prove it."],
  ["Earth can answer back: two-way link and impact", "One last thing. Earth can answer back. The doctor on Earth reads the report, and writes back. That reply travels to Mars with the same real delay. Every message is locked and signed. So nobody can read it, or fake it, on the way. And this isn't only a space problem. Near Warangal, where I live, some villages are hours from a doctor. A delay is a delay. Light from Mars, or a three-hour bus ride. So the same app works there too, in Telugu and Hindi. It's live right now. You can try it on your phone. ASCLEPIUS. Medicine for when Earth is too far away. Thank you."],
];
const SCHOOL = process.env.DECK === 'school';
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.title = 'ASCLEPIUS · NASA Space Apps 2026';
S.forEach(([title, notes], i) => {
  const s = pres.addSlide();
  s.background = { color: '000000' };
  s.addText(title, { x: 0, y: 0, w: 13.333, h: 0.4, fontSize: 1, color: '000000' }); // searchable title, hidden under the image
  s.addImage({ path: path.join(__dirname, 'png', `${SCHOOL ? 'school' : 'slide'}-${i + 1}.png`), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addNotes(notes);
});
pres.writeFile({ fileName: path.join(__dirname, '..', SCHOOL ? 'ASCLEPIUS_SpaceApps2026_deck_school.pptx' : 'ASCLEPIUS_SpaceApps2026_deck.pptx') }).then((f) => console.log('wrote', f));
