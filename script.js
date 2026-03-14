// ══════════════════════════════════════════
// AUDIO ENGINE
// ══════════════════════════════════════════
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let currentMusicSource = null;
let musicGainNode = null;
let distortionNode = null;
let droppedMusicBuffer = null;
let fadeTimeout = null;

function playTone(freq, type, dur, vol = 0.15) {
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.start(); o.stop(audioCtx.currentTime + dur);
    } catch(e) {}
}

function sfxCorrect() { playTone(1047, 'sine', 0.06, 0.08); }
function sfxWrong()   { playTone(160, 'sawtooth', 0.12, 0.15); }
function sfxComplete() {
    [523,659,784,1047,1319].forEach((f,i) =>
        setTimeout(() => playTone(f,'sine',0.4,0.18), i*90));
}
function sfxStar() { playTone(1568,'sine',0.25,0.12); }

function sfxBassDrop() {
    // deep bass sweep
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const dist = audioCtx.createWaveShaper();
        dist.curve = makeDistortionCurve(80);
        o.connect(dist); dist.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(60, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.4);
        g.gain.setValueAtTime(0.6, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        o.start(); o.stop(audioCtx.currentTime + 0.7);
    } catch(e) {}
}

function makeDistortionCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return curve;
}

function stopMusic() {
    if (currentMusicSource) { try { currentMusicSource.stop(); } catch(e) {} currentMusicSource = null; }
    if (fadeTimeout) { clearTimeout(fadeTimeout); fadeTimeout = null; }
    musicGainNode = null;
    distortionNode = null;
}

function playMusicContinuous(buffer) {
    stopMusic();
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);

    distortionNode = audioCtx.createWaveShaper();
    distortionNode.curve = makeDistortionCurve(0); // clean by default

    source.connect(distortionNode);
    distortionNode.connect(musicGainNode);
    musicGainNode.connect(audioCtx.destination);
    source.start(0);
    currentMusicSource = source;
}

function keepMusicAlive() {
    if (!musicGainNode) return;
    if (fadeTimeout) { clearTimeout(fadeTimeout); fadeTimeout = null; }
    musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);
    // fade after 0.8s of silence — quicker than before
    fadeTimeout = setTimeout(() => {
        if (!musicGainNode) return;
        musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        musicGainNode.gain.setValueAtTime(musicGainNode.gain.value, audioCtx.currentTime);
        musicGainNode.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.8);
    }, 800);
}

function musicDistort() {
    if (!distortionNode || !musicGainNode) return;
    // slam distortion on, then ramp off
    distortionNode.curve = makeDistortionCurve(400);
    musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGainNode.gain.setValueAtTime(0.9, audioCtx.currentTime);
    musicGainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.08);
    setTimeout(() => {
        if (!distortionNode) return;
        distortionNode.curve = makeDistortionCurve(0);
        if (musicGainNode) {
            musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            musicGainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            musicGainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.2);
        }
    }, 120);
}

function musicBassDrop() {
    if (!musicGainNode) return;
    // duck music briefly then slam back
    musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);
    musicGainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
    musicGainNode.gain.linearRampToValueAtTime(0.9, audioCtx.currentTime + 0.3);
    musicGainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.6);
}

// ══════════════════════════════════════════
// CANVAS BACKGROUND
// ══════════════════════════════════════════
const bgCv = document.getElementById('bgCanvas');
const bgCtx = bgCv.getContext('2d');
let bgW, bgH;
let bgOrbs = [];
let bgPulse = 0;
let bgError = 0;

function resizeBg() {
    bgW = bgCv.width = window.innerWidth;
    bgH = bgCv.height = window.innerHeight;
}

function initOrbs() {
    bgOrbs = [
        { x: 0.2, y: 0.5,  r: 0.35, c: [110,40,220],  spd: 0.0003, phase: 0 },
        { x: 0.8, y: 0.2,  r: 0.30, c: [20,130,220],   spd: 0.0004, phase: 2 },
        { x: 0.6, y: 0.8,  r: 0.28, c: [120,50,200],   spd: 0.00025,phase: 4 },
        { x: 0.1, y: 0.85, r: 0.22, c: [30,120,180],   spd: 0.0005, phase: 1 },
        { x: 0.9, y: 0.6,  r: 0.20, c: [160,80,240],   spd: 0.00035,phase: 3 },
    ];
}

function drawBg(t) {
    bgCtx.clearRect(0, 0, bgW, bgH);
    bgCtx.fillStyle = '#080810';
    bgCtx.fillRect(0, 0, bgW, bgH);

    bgOrbs.forEach(o => {
        const nx = o.x + Math.sin(t * o.spd + o.phase) * 0.12;
        const ny = o.y + Math.cos(t * o.spd * 0.7 + o.phase) * 0.09;
        const px = nx * bgW, py = ny * bgH;
        const pr = o.r * Math.min(bgW, bgH);
        const extra = bgPulse * 0.3 + bgError * 0.15;
        const grad = bgCtx.createRadialGradient(px, py, 0, px, py, pr * (1 + extra));
        const [r,g,b] = o.c;
        const alpha = 0.18 + bgPulse * 0.12 + bgError * 0.08;
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        bgCtx.fillStyle = grad;
        bgCtx.beginPath();
        bgCtx.arc(px, py, pr * (1 + extra), 0, Math.PI * 2);
        bgCtx.fill();
    });

    if (bgPulse > 0) bgPulse -= 0.04;
    if (bgError > 0) bgError -= 0.05;
}

function bgLoop(t) {
    drawBg(t);
    requestAnimationFrame(bgLoop);
}

resizeBg(); initOrbs();
requestAnimationFrame(bgLoop);
window.addEventListener('resize', resizeBg);

function triggerBgCorrect() { bgPulse = Math.min(1, bgPulse + 0.3); }
function triggerBgError()   { bgError = Math.min(1, bgError + 0.4); }

// ══════════════════════════════════════════
// DISTORT OVERLAY
// ══════════════════════════════════════════
const distEl = document.createElement('div');
distEl.id = 'distortOverlay';
document.body.appendChild(distEl);

function flashDistort() {
    distEl.classList.remove('active');
    void distEl.offsetWidth;
    distEl.classList.add('active');
    setTimeout(() => distEl.classList.remove('active'), 300);
}

// ══════════════════════════════════════════
// PROFILE & PROGRESS
// ══════════════════════════════════════════
function getProfile()  { return JSON.parse(localStorage.getItem('tb_profile'))  || null; }
function saveProfile(p){ localStorage.setItem('tb_profile',  JSON.stringify(p)); }
function getProgress() { return JSON.parse(localStorage.getItem('tb_progress')) || { unlocked:1, stars:{}, bestWpm:{} }; }
function saveProgress(p){ localStorage.setItem('tb_progress', JSON.stringify(p)); }

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let score = 0, streak = 0, charIndex = 0, charRandom = '';
let elapsedSeconds = 0, WPM = 0, newScore = 0;
let currentLevelIndex = 0, pendingLevelIndex = 0;
let timerInterval, seconds = 0, minutes = 0;
let selectedAvatarColor = '#6d28d9';
let gameActive = false, lastLength = 0;
let correctCount = 0, liveWpmInterval = null;

// ══════════════════════════════════════════
// LEVELS
// ══════════════════════════════════════════
const levels = [
  { id:1,  name:"First Steps",      texts:["The cat sat on the mat.","A big dog ran fast.","The sun is hot today.","I like to eat cake.","She has a red hat."], starThresholds:[5,15,30,50], wpmFull:15, accFull:80 },
  { id:2,  name:"Warming Up",       texts:["The boy went to the shop.","A cold wind blew all day.","My dog likes to play outside.","She made a cup of tea.","He read a short book last night."], starThresholds:[8,20,38,58], wpmFull:18, accFull:82 },
  { id:3,  name:"Getting There",    texts:["The birds sang in the tall oak tree.","She walked slowly down the empty road.","He found an old coin in the garden.","The sky turned pink as the sun went down.","A small cat slept on the warm windowsill."], starThresholds:[10,25,42,62], wpmFull:20, accFull:83 },
  { id:4,  name:"Building Speed",   texts:["They played football in the park after school.","The rain fell hard against the window all night.","She packed her bag and left before sunrise.","He cooked a simple meal and sat down to eat.","The old clock on the wall ticked slowly."], starThresholds:[12,28,46,66], wpmFull:23, accFull:84 },
  { id:5,  name:"Finding Rhythm",   texts:["The morning sun crept over the hills, painting the meadow gold.","She found the old letters at the bottom of a dusty trunk.","Neon signs flickered on as the city shifted into evening.","He stood at the cliff's edge, coat snapping in the wind.","Children chased bubbles through the park while a dog bounded after them."], starThresholds:[15,32,50,70], wpmFull:25, accFull:85 },
  { id:6,  name:"Picking Up Pace",  texts:["The old bookshop smelled of cedar and dust, its shelves bowed under years of stories.","Rain fell steadily on the empty street, each drop a small percussion against the pavement.","She pressed her hands into the soil, feeling the cool earth give way beneath her fingers.","The train moved through darkness between stations, its passengers half-asleep and swaying gently.","He set the coffee down and watched the steam curl and slowly vanish into the air."], starThresholds:[18,36,55,74], wpmFull:28, accFull:85 },
  { id:7,  name:"Steady Hands",     texts:["The lighthouse stood firm against the crashing waves, its beam sweeping endlessly through the dark.","She closed the book and sat in silence, letting the story settle like dust in still air.","The market was loud and colourful, vendors calling out over the noise of the midday crowd.","He watched the last train pull away and felt the quiet of the empty platform wrap around him.","A single candle burned on the table, casting long shadows across the bare walls of the room."], starThresholds:[20,40,58,77], wpmFull:30, accFull:86 },
  { id:8,  name:"Getting Serious",  texts:["The forest was dense and silent, broken only by the occasional snap of a twig underfoot.","She had spent years collecting these moments, tucking them away like pressed flowers between pages.","The clock struck midnight and the last guest finally pulled on their coat and stepped into the cold.","He had never been good at goodbyes, so he simply turned and walked without looking back once.","The cafe was nearly empty at that hour, just two strangers nursing cold cups at opposite ends."], starThresholds:[23,44,62,80], wpmFull:33, accFull:86 },
  { id:9,  name:"Smooth Operator",  texts:["The autumn leaves fell in slow spirals, collecting in drifts against the iron gate at the end of the lane.","She remembered the way he laughed — sudden and loud, filling whatever room he happened to be standing in.","The city looked different at four in the morning, emptied of its daytime noise and urgency and restless motion.","He had mapped every corner of the neighbourhood, yet still found streets that surprised him on quiet Sunday walks.","The storm had passed by morning, leaving everything washed clean and glittering under a pale winter sun."], starThresholds:[26,48,66,83], wpmFull:35, accFull:87 },
  { id:10, name:"Double Digits",    texts:["The violin solo drifted through the open window and stopped every person on the pavement below for just a moment.","She had kept the letter for years without opening it, afraid of what the words inside might rearrange in her.","The old bridge groaned under the weight of traffic, its iron bones holding fast despite the years of rust and rain.","He sat at the back of every meeting, notebook open, pen moving, though no one ever asked what he was writing.","The garden in winter looked abandoned, but she knew every bulb buried beneath the frost was simply waiting for its turn."], starThresholds:[30,52,70,86], wpmFull:38, accFull:87 },
  { id:11, name:"Consistent",       texts:["The ferry cut through the grey water, its horn sounding once as it pulled away from the dock into open sea.","She organised her thoughts the way she organised her desk — everything in its place, nothing left to chance or feeling.","The argument had ended hours ago but the silence that replaced it was somehow louder and harder to sit with.","He read the same paragraph three times before accepting that his mind was somewhere else entirely that afternoon.","The town had changed so much in ten years that she walked its streets like a tourist in her own history."], starThresholds:[33,56,73,88], wpmFull:40, accFull:88 },
  { id:12, name:"In The Zone",      texts:["The astronomer had spent forty years looking at the same patch of sky, finding something new in it every single night.","She wrote the first line of the letter four times before crumpling each attempt and dropping it into the bin beside her.","The road stretched ahead in a long straight line, bordered on both sides by flat fields going gold in the late sun.","He had a habit of arriving early everywhere, then sitting quietly and watching the place fill up around him like a tide.","The cat watched the rain from the windowsill with the calm authority of someone who had never needed to be anywhere."], starThresholds:[36,60,76,90], wpmFull:43, accFull:88 },
  { id:13, name:"Locked In",        texts:["The pianist played without sheet music, her fingers moving across the keys from memory built over thirty years of practice.","She had learned early that silence could be a form of speech, and she had grown fluent in it over the years.","The building had been empty for a decade, but someone had left a light on in the top floor window every single night.","He kept a journal not to remember things, but to understand them — writing was how he figured out what he actually thought.","The harbour at dawn was the only time the city felt truly still, the water flat and the gulls not yet awake."], starThresholds:[40,64,79,92], wpmFull:45, accFull:89 },
  { id:14, name:"Sharp Focus",      texts:["The technician worked in silence, disassembling the machine with the careful precision of someone who understood each of its parts intimately.","She had lived in six cities in ten years and had learned to make a home quickly, finding the nearest bakery and park first.","The debate had gone on for hours, circling the same points without resolution, everyone too committed to their position to truly listen.","He remembered his grandfather saying that patience was not the absence of action but the presence of the right kind of waiting.","The valley was visible from the ridge, a wide green bowl of farmland divided into neat squares by hedgerows and stone walls."], starThresholds:[44,68,82,93], wpmFull:48, accFull:89 },
  { id:15, name:"Halfway There",    texts:["The exhibition opened to a quiet crowd who moved slowly from piece to piece, speaking in low voices as if in a library.","She had always been better at beginnings than endings — full of energy at the start of things, restless when they wound down.","The satellite image showed the glacier had retreated another kilometre since the last survey, the data cold and precise and damning.","He carried the photograph in his wallet for years, not out of sentimentality but because he needed to remember what hope looked like.","The workshop smelled of sawdust and linseed oil, and the craftsman moved around it with the ease of someone in their truest element."], starThresholds:[48,72,85,94], wpmFull:50, accFull:90 },
  { id:16, name:"Pushing Further",  texts:["The composer sat at the piano for three hours without playing a single note, listening to the music that existed only in his head.","She understood that kindness was not weakness — it required more precision and more courage than most people were willing to admit or practise.","The archive contained thousands of letters written during the war, each one a small window into a life being lived under impossible pressure.","He had always suspected that the most important conversations happened not at the table but in the car, driving somewhere at night.","The reef was barely visible from the surface, but beneath it an entire world moved and fed and competed in brilliant silence."], starThresholds:[52,76,87,95], wpmFull:53, accFull:90 },
  { id:17, name:"Building Fluency", texts:["The surgeon worked with the focused calm of someone who had long since made peace with the weight of what their hands were doing.","She rewrote the opening chapter eleven times before she understood that the story did not begin where she thought it did.","The canyon walls were layered in shades of red and ochre, each band a different century compressed into stone by unimaginable pressure and time.","He had always found airports melancholy — not because of departures, but because of all the arrivals that went unmet by anyone waiting.","The algorithm processed the data in milliseconds, but understanding what the numbers meant took the team the better part of a week."], starThresholds:[56,79,89,96], wpmFull:55, accFull:91 },
  { id:18, name:"Accelerating",     texts:["The river had carved through limestone for ten thousand years, and standing at its edge you could feel the patience required in the sound of it.","She spoke four languages fluently and said that each one gave her a slightly different personality, a different way of being in the world.","The investigation had stalled for months until a single overlooked detail in the original report suddenly reframed the entire sequence of events.","He believed that cities revealed themselves not in their landmarks but in their corners — the alleyways and thresholds and unremarkable in-between places.","The prototype failed three times before the team understood that the problem was not in the design but in the assumptions behind the design."], starThresholds:[60,82,91,96], wpmFull:58, accFull:91 },
  { id:19, name:"Strong & Steady",  texts:["The philosopher argued that boredom was not an absence of stimulation but an excess of it — the mind finally rebelling against the noise.","She had cultivated the rare skill of entering a room full of strangers and making each of them feel, briefly, that they were known.","The manuscript had been found in a monastery library, misfiled under the wrong century, and had sat unread for over two hundred years.","He noticed that the people who spoke most confidently about the future were usually the ones least burdened by knowledge of the past.","The delta spread across the map like a hand opening, each finger of water carrying sediment slowly toward the sea over geological time."], starThresholds:[64,85,92,97], wpmFull:60, accFull:92 },
  { id:20, name:"Twenty Down",      texts:["The conductor raised her baton and the orchestra settled into a silence so complete that the audience stopped breathing for a moment before the music began.","She had built her career on the ability to ask the question that everyone else in the room was thinking but had decided was too obvious to say.","The migration route had been used by the same bird species for millennia, a path encoded not in maps but in the birds themselves across generations.","He kept a list of every book he had ever read, not the titles but a single sentence describing how each one had changed the way he thought.","The bridge had been designed to sway slightly in high winds — rigidity, the engineer explained, was not the same thing as strength."], starThresholds:[68,87,93,97], wpmFull:63, accFull:92 },
  { id:21, name:"Elite Territory",  texts:["The archaeologist brushed away centuries of soil with the patience of someone who understood that the thing you are looking for is always exactly where you find it.","She had spent the better part of her career studying how people make decisions under pressure, and the conclusion she kept returning to was that most do not.","The telecommunications network had been designed with so many redundancies that it could sustain multiple simultaneous failures without the end user noticing any disruption at all.","He wrote in the mornings before his mind filled with the obligations of the day, finding in those early hours a clarity that he could not manufacture later.","The ecological survey revealed that the forest, which had appeared uniform from above, was in fact composed of dozens of distinct micro-habitats invisible from any distance."], starThresholds:[72,89,94,98], wpmFull:65, accFull:93 },
  { id:22, name:"High Precision",   texts:["The historian noted that the most consequential decisions of the century had often been made not in grand chambers but in corridors, between sessions, informally.","She understood instinctively that the space between words was where meaning accumulated — that what was left unsaid shaped the conversation as much as what was said.","The neurological study suggested that expertise did not reside in any single region of the brain but was distributed across networks that had been strengthened through repetition.","He had long believed that the quality of a city could be measured by the quality of its public libraries — their funding, their hours, their welcome.","The structural engineer identified the flaw not by calculation but by instinct, a sense built from twenty years of looking at things that were about to fail."], starThresholds:[76,91,95,98], wpmFull:68, accFull:93 },
  { id:23, name:"Near Mastery",     texts:["The documentary followed three generations of a family living in the same house, each generation leaving marks on the walls that the next generation painted over without knowing.","She argued that the most underrated quality in a leader was the willingness to change their mind publicly and without defensiveness when presented with better information.","The cartographer spent years mapping coastlines that were actively eroding, producing documents that were already partially obsolete by the time they were printed and distributed.","He had learned that the way a person treated a waiter told you more about their character than anything they said in the first hour of conversation.","The installation used light and sound to recreate the experience of standing inside a thunderstorm, and most visitors spent longer inside it than they had planned."], starThresholds:[79,92,96,98], wpmFull:70, accFull:94 },
  { id:24, name:"Advanced",         texts:["The quantum computing research team had spent three years solving a problem that classical computers would have taken longer than the age of the universe to complete.","She had written the algorithm herself, but reading it now — months later — it felt like the work of someone else, someone who thought in a language she had since forgotten.","The diplomat explained that the treaty had succeeded not because of any grand gesture but because both sides had been quietly exhausted by the cost of continuing.","He believed that the purpose of education was not the transmission of knowledge but the cultivation of the capacity to be surprised and to follow that surprise somewhere.","The glacier moved imperceptibly — a few centimetres a day — but over centuries had carved a valley so wide and deep it seemed impossible that ice alone had done it."], starThresholds:[82,93,96,99], wpmFull:73, accFull:94 },
  { id:25, name:"Expert",           texts:["The linguist had documented seventeen languages that were now spoken by fewer than ten people, each one a complete world of meaning balanced on the edge of disappearing.","She built her argument slowly and without flourish, laying each premise down with care and returning to test its strength before moving on to the next one.","The research station operated year-round in conditions that made most equipment unreliable, requiring engineers who could improvise solutions from whatever materials happened to be available.","He had always found it easier to understand people through their bookshelves than through their conversation — the books they kept said things they would never say aloud.","The performance lasted three hours without an interval, and yet no one in the audience looked at their watch or shifted in their seat or wished it shorter."], starThresholds:[85,94,97,99], wpmFull:75, accFull:95 },
  { id:26, name:"Formidable",       texts:["The archaeological excavation revealed not just the structure of the ancient city but the evidence of a catastrophic event that had ended it in a single afternoon.","She had developed the theory over fifteen years, revising it quietly whenever the evidence demanded, never announcing the revisions because she did not think the process was interesting — only the conclusion.","The composer described the symphony as an attempt to write music that sounded inevitable in retrospect but could not have been predicted from any of its individual parts.","He kept a notebook of questions he could not answer, adding to it regularly and returning to earlier questions to see whether time or experience had changed how he thought about them.","The manufacturing process had been optimised so many times that the engineers had started to worry they were optimising out the margins that protected against unforeseen variations in the materials."], starThresholds:[88,95,97,99], wpmFull:78, accFull:95 },
  { id:27, name:"Relentless",       texts:["The legal team had prepared extensively for the case, but the opposing counsel introduced a line of argument so unexpected that the first ten minutes of the hearing were lost to quiet recalibration.","She noticed that the most creative people she had worked with shared a common trait — not talent or intelligence but a high tolerance for the discomfort of not yet knowing the answer.","The satellite had been in orbit for thirty years, long past its design life, still transmitting data that no one had expected it to still be capable of generating.","He wrote the dedication last, after the book was finished, and found that what he wanted to say had changed completely from what he had imagined he would say at the start.","The coastal town had been flooded seventeen times in the past century and rebuilt seventeen times, each time slightly differently, as if the town were slowly learning something from the water."], starThresholds:[90,95,98,99], wpmFull:80, accFull:96 },
  { id:28, name:"Unstoppable",      texts:["The philosopher had spent forty years writing about the nature of time and confessed in his final lecture that he understood it less clearly now than he had when he began.","She ran the organisation with a combination of strategic vision and operational precision that most people who worked there experienced simply as a pervasive sense that things were going to be alright.","The telescope array had detected a signal that matched no known natural phenomenon, and the team spent six months ruling out instrument error before they began to discuss what else it might be.","He believed that the best conversations were the ones that ended with both people thinking about something they had not thought about before walking into the room together.","The restoration project had taken twelve years and involved specialists from nine countries, all of them working on different parts of a problem so large that no single person could hold it entirely in mind."], starThresholds:[92,96,98,99], wpmFull:83, accFull:96 },
  { id:29, name:"Legendary",        texts:["The manuscript described in precise and unhurried detail a world so different from our own that scholars had spent decades debating whether it was history, fiction, or something the author had invented a category for.","She had learned that the most dangerous assumption in any negotiation was the belief that the other party wanted what you thought they wanted rather than something you had not yet thought to ask about.","The submersible descended through water so dark and cold and pressurised that the team inside it was aware, on some level they did not discuss, of how thin the barrier was between them and the deep.","He had published forty-seven papers and supervised thirty-one doctoral students and still felt, on the best days, the same disoriented excitement he had felt in the library at nineteen, pulling a book off the shelf at random.","The city had been built on a swamp, which the engineers of the time considered a problem they had solved, and which the engineers three hundred years later were beginning to understand they had only deferred."], starThresholds:[94,97,98,100], wpmFull:86, accFull:97 },
  { id:30, name:"TypeBallad Master", texts:["The expedition had been planned for two years and executed over four months in conditions that the team's equipment was not fully rated for, producing data that rewrote several assumptions that had stood unchallenged for decades.","She had spent her career arguing that the distinction between art and science was not a difference in method or rigour but in the questions each was willing to ask and the forms of answer each was willing to accept.","The infrastructure project connected twelve previously isolated communities to the national grid, but the engineers who built it noted in their final report that the most significant impact had been psychological rather than material.","He had always been suspicious of certainty — not because he thought doubt was a virtue in itself, but because in his experience the people who were most certain were usually the ones who had stopped paying attention.","The archive preserved not just documents but the metadata of documents — who had accessed them, when, and for how long — creating a record of how knowledge had moved through the institution across more than a century."], starThresholds:[96,98,99,100], wpmFull:90, accFull:98 }
];

const successMsg  = ["Great job!","You're on fire!","Absolutely crushing it!","Nailed it!","Keep it up!","You're a natural!","Unstoppable!","That was smooth!","Legendary typing!","You're built different!","Chef's kiss!","Flawless!","On a roll!","Too easy for you!","Speed demon!","Born to type!","No mistakes, no mercy!","Fingers of fury!","Keyboard warrior!","You make it look easy!","Straight up elite!","That's what I'm talking about!","Phenomenal!","Crispy clean!","Absolutely unreal!","The keyboard fears you!","Not even close!","Certified typist!","Go again, I dare you!","That run was clean!"];
const encourageMsg = ["Keep going!","You've got this!","Don't give up!","Almost there!","Stay focused!","Every rep counts!","Push through it!","You're improving!","Believe in yourself!","One key at a time!","Stay in the zone!","You're getting better!","Lock in!","Channel your inner typist!","Breathe and focus!","Consistency is key!","You're so close!","Trust the process!","Keep your eyes on the screen!","Shake it off and go again!","Progress over perfection!","Stay sharp!","You were built for this!","Don't slow down now!","Grind time!","Less thinking, more typing!","Find your rhythm!","Block out the noise!","Fingers don't fail me now!","Reset and go harder!"];
const slowMsg      = ["Slow down a little!","Accuracy over speed!","Take your time!","Don't rush it!","Breathe and type!","Slow is smooth, smooth is fast!","One character at a time!","Speed means nothing without accuracy!","Relax your fingers!","Quality over quantity!","Less haste, more accuracy!","You're fumbling, slow down!","Reset your pace!","Precision first, speed later!","Stop rushing!","Calm down and focus!","Slow it down a notch!","Your fingers are ahead of your brain!","Think before you type!","Patience is a skill too!","Slow down and lock in!","You're overthinking it, breathe!","Control the pace!","Accuracy is your friend!","Don't let your fingers run wild!","Type with intention!","Slow down, you're making errors!","Cool it, focus up!","Let your brain catch up!","Slow hands, clean run!"];

// ══════════════════════════════════════════
// DOM
// ══════════════════════════════════════════
const $ = id => document.getElementById(id);
const usernameInput  = $('usernameInput');
const avatarPicker   = $('avatarPicker');
const saveProfileBtn = $('saveProfile');
const homeAvatar     = $('homeAvatar');
const homeUsername   = $('homeUsername');
const homeStats      = $('homeStats');
const editProfileBtn = $('editProfile');
const levelGrid      = $('levelGrid');
const backToHomeBtn  = $('backToHome');
const levelAvatar    = $('levelAvatar');
const levelUsername  = $('levelUsername');
const carouselTrack  = $('carouselTrack');
const floatingScores = $('floatingScores');
const textArea       = $('textArea');
const backBtn        = $('backBtn');
const scoreDisplay   = $('scoreDisplay');
const streakDisplay  = $('streakDisplay');
const streakCount    = $('streakCount');
const timerDisplayEl = $('timerDisplay');
const finishedTitle  = $('FinishedTitle');
const finalScoreEl   = $('finalScore');
const starsRow       = $('starsRow');
const wpmFill        = $('wpmFill');
const accFill        = $('accFill');
const wpmValue       = $('wpmValue');
const accValue       = $('accValue');
const gameLoopBtn    = $('gameLoop');
const nextLevelBtn   = $('nextLevel');
const backToMenuBtn  = $('backToMenu');
const dropZone       = $('dropZone');
const dropLabel      = $('dropLabel');
const fileInput      = $('fileInput');
const startWithMusic = $('startWithMusic');
const skipMusic      = $('skipMusic');
const preGameBack    = $('preGameBack');
const preGameTitle   = $('preGameTitle');
const preGameSub     = $('preGameSub');
const stageGlow      = $('stageGlow');
const liveWpmEl      = $('liveWpm');
const gameScreenEl   = $('gameScreen');

// ══════════════════════════════════════════
// SCREEN MANAGER
// ══════════════════════════════════════════
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
}

// ══════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════
avatarPicker.querySelectorAll('.av-opt').forEach(opt => {
    opt.style.backgroundColor = opt.dataset.color;
    opt.addEventListener('click', () => {
        avatarPicker.querySelectorAll('.av-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedAvatarColor = opt.dataset.color;
    });
});

saveProfileBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim() || 'Player';
    saveProfile({ name, color: selectedAvatarColor });
    loadHome(); showScreen('access');
});

editProfileBtn.addEventListener('click', () => {
    const p = getProfile();
    if (p) usernameInput.value = p.name;
    showScreen('profileSetup');
});

function renderAv(el, profile) {
    el.style.backgroundColor = profile.color;
    el.textContent = profile.name.charAt(0).toUpperCase();
}

function loadHome() {
    const p = getProfile(), pr = getProgress();
    if (!p) return;
    renderAv(homeAvatar, p);
    homeUsername.textContent = p.name;
    const stars = Object.values(pr.stars).reduce((a,b) => a+b, 0);
    const done  = Object.keys(pr.stars).length;
    homeStats.textContent = `${done} levels · ${stars} stars`;
}

// ══════════════════════════════════════════
// LEVEL GRID
// ══════════════════════════════════════════
function buildGrid() {
    const pr = getProgress(), p = getProfile();
    levelGrid.innerHTML = '';
    if (p) { renderAv(levelAvatar, p); levelUsername.textContent = p.name; }
    levels.forEach((lv, i) => {
        const locked = i >= pr.unlocked;
        const saved  = pr.stars[i] || 0;
        const card = document.createElement('div');
        card.className = 'level-card' + (locked ? ' locked' : '') + (saved > 0 ? ' completed' : '');
        let sh = '';
        for (let j = 1; j <= 5; j++) sh += `<i class="fa-solid fa-star ${j <= saved ? 'earned' : ''}"></i>`;
        card.innerHTML = `<div class="level-num">${lv.id}</div><div class="level-name">${lv.name}</div><div class="card-stars">${sh}</div>`;
        if (!locked) card.addEventListener('click', () => openPreGame(i));
        levelGrid.appendChild(card);
    });
}

// ══════════════════════════════════════════
// PRE GAME
// ══════════════════════════════════════════
function openPreGame(i) {
    pendingLevelIndex = i;
  if (droppedMusicBuffer) {
        dropZone.classList.add('loaded');
        dropLabel.textContent = '✓ music loaded — drop to change';
        startWithMusic.disabled = false;
    } else {
        dropZone.classList.remove('loaded');
        dropLabel.textContent = 'drag & drop an MP3';
        startWithMusic.disabled = true;
    }
    preGameTitle.textContent = `Level ${levels[i].id} — ${levels[i].name}`;
    showScreen('preGame');
}

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleAudio(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleAudio(fileInput.files[0]); });

async function handleAudio(file) {
    dropLabel.textContent = `Loading ${file.name}…`;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    try {
        const buf = await file.arrayBuffer();
        droppedMusicBuffer = await audioCtx.decodeAudioData(buf);
        dropLabel.textContent = `✓ ${file.name}`;
        dropZone.classList.add('loaded');
        startWithMusic.disabled = false;
    } catch(e) {
        dropLabel.textContent = 'Could not load file — try another MP3';
        droppedMusicBuffer = null;
        startWithMusic.disabled = true;
    }
}

startWithMusic.addEventListener('click', () => startLevel(pendingLevelIndex, droppedMusicBuffer));
skipMusic.addEventListener('click',       () => startLevel(pendingLevelIndex, null));
preGameBack.addEventListener('click',     () => { buildGrid(); showScreen('levelSelect'); });

// ══════════════════════════════════════════
// TIMER
// ══════════════════════════════════════════
function startTimer() {
    seconds = 0; minutes = 0;
    timerDisplayEl.textContent = '00:00';
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        if (seconds === 60) { seconds = 0; minutes++; }
        timerDisplayEl.textContent = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    }, 1000);
}
function stopTimer() {
    elapsedSeconds = (minutes * 60) + seconds;
    clearInterval(timerInterval);
    if (liveWpmInterval) { clearInterval(liveWpmInterval); liveWpmInterval = null; }
}

// ══════════════════════════════════════════
// CAROUSEL
// ══════════════════════════════════════════
function buildCarousel(text) {
    carouselTrack.innerHTML = '';
    charRandom = text; charIndex = 0;
    for (let i = 0; i < text.length; i++) {
        const s = document.createElement('span');
        const ch = text[i];
        s.className = 'cl' + (ch === ' ' ? ' sp' : '');
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        s.dataset.i = i;
        carouselTrack.appendChild(s);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
        repositionTrack();
        highlightCurrent();
    }));
}

function repositionTrack() {
    const letters = carouselTrack.querySelectorAll('.cl');
    if (!letters[charIndex]) return;
    let offset = 0;
    for (let i = 0; i < charIndex; i++) {
        offset += letters[i].offsetWidth + 2;
    }
    const lw = letters[charIndex].offsetWidth;
    const trackLeft = carouselTrack.parentElement.getBoundingClientRect().left;
    const cx = (window.innerWidth / 2) - trackLeft - offset - (lw / 2);
    carouselTrack.style.transform = `translateX(${cx}px)`;
}

function highlightCurrent() {
    carouselTrack.querySelectorAll('.cl').forEach((l, i) => {
        if (l.classList.contains('ok') || l.classList.contains('err')) return;
        l.classList.toggle('cur', i === charIndex);
    });
}

// ══════════════════════════════════════════
// FLOATING +1 / -5
// ══════════════════════════════════════════
function spawnFloat(txt, pos, x, y) {
    const el = document.createElement('div');
    el.className = 'fn ' + (pos ? 'pos' : 'neg');
    el.textContent = txt;
    el.style.cssText = `left:${x}px;top:${y}px`;
    floatingScores.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

// ══════════════════════════════════════════
// STREAK
// ══════════════════════════════════════════
function updateStreak(good) {
    if (good) {
        streak++;
        streakCount.textContent = streak;
        if (streak >= 10) {
            streakDisplay.classList.add('hot');
            if (streak % 10 === 0) {
                showStreakPopup(streak);
                if (streak % 20 === 0) triggerBassDrop();
            }
        }
    } else {
        streak = 0;
        streakCount.textContent = 0;
        streakDisplay.classList.remove('hot');
    }
}

function showStreakPopup(n) {
    document.querySelector('.streak-popup')?.remove();
    const el = document.createElement('div');
    el.className = 'streak-popup';
    el.textContent = `⚡ ${n} streak!`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}

function triggerBassDrop() {
    sfxBassDrop();
    musicBassDrop();
    document.querySelector('.bass-drop-popup')?.remove();
    const el = document.createElement('div');
    el.className = 'bass-drop-popup';
    el.textContent = '🔥';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
    // shake the stage
    const stage = document.querySelector('.stage');
    stage.style.animation = 'none';
    void stage.offsetWidth;
    stage.style.animation = 'stageShake 0.4s ease';
}

// ══════════════════════════════════════════
// START LEVEL
// ══════════════════════════════════════════
async function startLevel(idx, musicBuf) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    currentLevelIndex = idx;
    score = 0; streak = 0; charIndex = 0; correctCount = 0;
    scoreDisplay.textContent = '0';
    streakCount.textContent  = '0';
    streakDisplay.classList.remove('hot');
    textArea.value = ''; gameActive = true; lastLength = 0;
    liveWpmEl.textContent = '0';

    const text = levels[idx].texts[Math.floor(Math.random() * levels[idx].texts.length)];
    buildCarousel(text);

    if (musicBuf) { playMusicContinuous(musicBuf); keepMusicAlive(); }
    else stopMusic();

    showScreen('gameScreen');
    setTimeout(() => { textArea.focus(); startTimer(); startLiveWpm(); }, 150);
}

function startLiveWpm() {
    liveWpmInterval = setInterval(() => {
        if (!gameActive) return;
        const elapsed = (minutes * 60) + seconds;
        if (elapsed > 0) liveWpmEl.textContent = Math.round((correctCount / 5) / (elapsed / 60));
    }, 1000);
}

// ══════════════════════════════════════════
// TYPING
// ══════════════════════════════════════════
textArea.addEventListener('input', () => {
    if (!gameActive) return;
    const val = textArea.value;
    const letters = carouselTrack.querySelectorAll('.cl');

    if (val.length > lastLength) {
        const typed    = val[val.length - 1];
        const expected = charRandom[charIndex];

        if (typed === expected) {
            letters[charIndex].classList.remove('cur','err');
            letters[charIndex].classList.add('ok');
            score += 1 + Math.floor(streak / 10);
            correctCount++;
            scoreDisplay.textContent = score;
            updateStreak(true);
            sfxCorrect();
            triggerBgCorrect();
            keepMusicAlive();
            stageGlow.style.opacity = '1';
            setTimeout(() => { stageGlow.style.opacity = ''; }, 200);
            spawnFloat(`+${1 + Math.floor(streak/10)}`, true,
                window.innerWidth/2 + (Math.random()-0.5)*140,
                window.innerHeight/2 + (Math.random()-0.5)*60);
            charIndex++;
        } else {
            letters[charIndex].classList.add('err');
            score = Math.max(0, score - 5);
            scoreDisplay.textContent = score;
            updateStreak(false);
            sfxWrong();
            triggerBgError();
            flashDistort();
            musicDistort();
            spawnFloat('-5', false,
                window.innerWidth/2 + (Math.random()-0.5)*140,
                window.innerHeight/2 + (Math.random()-0.5)*60);
            setTimeout(() => { if (letters[charIndex]) letters[charIndex].classList.remove('err'); }, 200);
            textArea.value = val.slice(0,-1);
            lastLength = textArea.value.length;
            return;
        }

        repositionTrack();
        highlightCurrent();

        if (charIndex >= charRandom.length) {
            gameActive = false;
            stopTimer();
            stopMusic();
            sfxComplete();
            setTimeout(showResults, 500);
        }
    }
    lastLength = textArea.value.length;
});

document.addEventListener('keydown', () => {
    if (gameScreenEl.classList.contains('active')) textArea.focus();
});
document.addEventListener('click', () => {
    if (gameScreenEl.classList.contains('active')) textArea.focus();
});

// ══════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════
function showResults() {
    const lv      = levels[currentLevelIndex];
    const correct = carouselTrack.querySelectorAll('.ok').length;
    const total   = carouselTrack.querySelectorAll('.cl').length;
    const acc     = Math.round((correct / total) * 100);
    WPM      = elapsedSeconds > 0 ? Math.round((correct / 5) / (elapsedSeconds / 60)) : 0;
    newScore = WPM * acc / 100;

    const msg = Math.round((score / total) * 100);
    finishedTitle.textContent =
        msg >= 80  ? successMsg [Math.floor(Math.random()*successMsg.length)]  :
        acc >= 50  ? encourageMsg[Math.floor(Math.random()*encourageMsg.length)] :
                     slowMsg    [Math.floor(Math.random()*slowMsg.length)];

    finalScoreEl.textContent = score;
    wpmValue.textContent     = WPM;
    accValue.textContent     = acc + '%';

    setTimeout(() => {
        wpmFill.style.width           = Math.min(100, (WPM / lv.wpmFull) * 100) + '%';
        wpmFill.style.backgroundColor = WPM >= lv.wpmFull ? 'var(--green)' : WPM >= lv.wpmFull*0.6 ? 'var(--yellow)' : 'var(--red)';
        accFill.style.width           = acc + '%';
        accFill.style.backgroundColor = acc >= 90 ? 'var(--green)' : acc >= 60 ? 'var(--yellow)' : 'var(--red)';
    }, 300);

    let stars = 0;
    if      (newScore >= lv.starThresholds[3]) stars = 5;
    else if (newScore >= lv.starThresholds[2]) stars = 4;
    else if (newScore >= lv.starThresholds[1]) stars = 3;
    else if (newScore >= lv.starThresholds[0]) stars = 2;
    else if (newScore > 0)                     stars = 1;

    const pr = getProgress();
    if (stars > (pr.stars[currentLevelIndex] || 0)) pr.stars[currentLevelIndex] = stars;
    if (stars >= 3 && currentLevelIndex + 1 >= pr.unlocked)
        pr.unlocked = Math.min(currentLevelIndex + 2, levels.length);
    if (WPM > (pr.bestWpm[currentLevelIndex] || 0)) pr.bestWpm[currentLevelIndex] = WPM;
    saveProgress(pr);

    const starEls = starsRow.querySelectorAll('.fa-star');
    starEls.forEach(s => s.classList.remove('lit'));
    starEls.forEach((s, i) => setTimeout(() => {
        if (i < stars) { s.classList.add('lit'); sfxStar(); }
    }, 300 + i*200));

    nextLevelBtn.style.display = (stars >= 3 && currentLevelIndex < levels.length-1) ? '' : 'none';
    loadHome();
    showScreen('successWindow');
}

// ══════════════════════════════════════════
// STAGE SHAKE KEYFRAME (injected)
// ══════════════════════════════════════════
const styleTag = document.createElement('style');
styleTag.textContent = `
@keyframes stageShake {
    0%,100% { transform: translate(0,0) rotate(0deg); }
    15%      { transform: translate(-6px,3px) rotate(-0.5deg); }
    30%      { transform: translate(6px,-3px) rotate(0.5deg); }
    45%      { transform: translate(-4px,2px) rotate(-0.3deg); }
    60%      { transform: translate(4px,-2px) rotate(0.3deg); }
    75%      { transform: translate(-2px,1px); }
}`;
document.head.appendChild(styleTag);

// ══════════════════════════════════════════
// BUTTONS
// ══════════════════════════════════════════
$('enter').addEventListener('click',    () => { buildGrid(); showScreen('levelSelect'); });
backToHomeBtn.addEventListener('click', () => showScreen('access'));
backBtn.addEventListener('click',       () => { stopTimer(); stopMusic(); gameActive = false; buildGrid(); showScreen('levelSelect'); });

gameLoopBtn.addEventListener('click',  () => { wpmFill.style.width='0%'; accFill.style.width='0%'; startLevel(currentLevelIndex, droppedMusicBuffer); });
nextLevelBtn.addEventListener('click', () => { wpmFill.style.width='0%'; accFill.style.width='0%'; startLevel(currentLevelIndex + 1, droppedMusicBuffer); });
backToMenuBtn.addEventListener('click',() => { wpmFill.style.width='0%'; accFill.style.width='0%'; buildGrid(); showScreen('levelSelect'); });
$('changeMusic').addEventListener('click', () => { wpmFill.style.width='0%'; accFill.style.width='0%'; openPreGame(currentLevelIndex); });
// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(function init() {
    const p = getProfile();
    if (!p) showScreen('profileSetup');
    else { loadHome(); showScreen('access'); }
})();