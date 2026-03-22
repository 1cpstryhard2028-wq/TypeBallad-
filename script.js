// =============================================
// AUDIO ENGINE
// =============================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let currentMusicSource = null;
let musicGainNode      = null;
let distortionNode     = null;
let analyserNode       = null;
let droppedMusicBuffer = null;
let fadeTimeout        = null;
let beatAnimFrame      = null;

// Beat detection state
let lastBeatTime  = 0;
let beatThreshold = 1.3;   // energy ratio to trigger a beat
let beatCooldown  = 300;   // ms minimum between beats
let energyHistory = [];
const ENERGY_HISTORY_SIZE = 43;

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

function sfxCorrect()  { playTone(1047, 'sine',     0.06, 0.08); }
function sfxWrong()    { playTone(160,  'sawtooth', 0.12, 0.15); }
function sfxComplete() {
    [523,659,784,1047,1319].forEach((f,i) =>
        setTimeout(() => playTone(f,'sine',0.4,0.18), i*90));
}
function sfxStar() { playTone(1568,'sine',0.25,0.12); }

function sfxBassDrop() {
    try {
        const o    = audioCtx.createOscillator();
        const g    = audioCtx.createGain();
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
    if (beatAnimFrame) { cancelAnimationFrame(beatAnimFrame); beatAnimFrame = null; }
    if (currentMusicSource) { try { currentMusicSource.stop(); } catch(e) {} currentMusicSource = null; }
    if (fadeTimeout)         { clearTimeout(fadeTimeout); fadeTimeout = null; }
    musicGainNode  = null;
    distortionNode = null;
    analyserNode   = null;
    energyHistory  = [];
}

function playMusicContinuous(buffer) {
    stopMusic();
    if (!buffer) return;

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;

    musicGainNode  = audioCtx.createGain();
    musicGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);

    distortionNode = audioCtx.createWaveShaper();
    distortionNode.curve = makeDistortionCurve(0);

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.8;

    source.connect(analyserNode);
    analyserNode.connect(distortionNode);
    distortionNode.connect(musicGainNode);
    musicGainNode.connect(audioCtx.destination);
    source.start(0);
    currentMusicSource = source;

    energyHistory = new Array(ENERGY_HISTORY_SIZE).fill(0);
    startBeatLoop();
}

// =============================================
// BEAT DETECTION LOOP
// =============================================
function getBassEnergy() {
    if (!analyserNode) return 0;
    const buf = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(buf);
    // Focus on bass frequencies (roughly 60-200 Hz)
    const nyquist   = audioCtx.sampleRate / 2;
    const binWidth  = nyquist / buf.length;
    const lowBin    = Math.floor(60  / binWidth);
    const highBin   = Math.floor(200 / binWidth);
    let sum = 0;
    for (let i = lowBin; i <= highBin && i < buf.length; i++) sum += buf[i];
    return sum / (highBin - lowBin + 1);
}

function getFullEnergy() {
    if (!analyserNode) return 0;
    const buf = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    return sum / buf.length;
}

function startBeatLoop() {
    function loop() {
        if (!analyserNode) return;
        beatAnimFrame = requestAnimationFrame(loop);

        const energy = getBassEnergy();
        energyHistory.push(energy);
        if (energyHistory.length > ENERGY_HISTORY_SIZE) energyHistory.shift();

        const avg = energyHistory.reduce((a,b) => a+b, 0) / energyHistory.length;
        const now = performance.now();

        // Pulse orbs with full energy continuously
        const fullE = getFullEnergy();
        bgBeatPulse = Math.max(bgBeatPulse, fullE / 255 * 0.7);

        if (avg > 5 && energy > avg * beatThreshold && now - lastBeatTime > beatCooldown) {
            lastBeatTime = now;
            onBeat(energy / 255);
        }
    }
    loop();
}

function onBeat(strength) {
    // Big orb expansion on beat
    bgBeatPulse = Math.min(1, bgBeatPulse + strength * 0.8);
    // Flash the stage glow
    if (stageGlow) {
        stageGlow.style.opacity = '1';
        stageGlow.style.transform = 'translate(-50%,-50%) scale(1.3)';
        setTimeout(() => {
            stageGlow.style.opacity  = '';
            stageGlow.style.transform = '';
        }, 120);
    }
    // Subtle caret pulse
    const caretEl = document.getElementById('caret');
    if (caretEl) {
        caretEl.style.boxShadow = '0 0 30px rgba(167,139,250,1), 0 0 60px rgba(56,189,248,0.8)';
        setTimeout(() => { caretEl.style.boxShadow = ''; }, 150);
    }
}

function keepMusicAlive() {
    if (!musicGainNode) return;
    if (fadeTimeout) { clearTimeout(fadeTimeout); fadeTimeout = null; }
    musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);
    fadeTimeout = setTimeout(() => {
        if (!musicGainNode) return;
        musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        musicGainNode.gain.setValueAtTime(musicGainNode.gain.value, audioCtx.currentTime);
        musicGainNode.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.8);
    }, 800);
}

function musicDistort() {
    if (!distortionNode || !musicGainNode) return;
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
    musicGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);
    musicGainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
    musicGainNode.gain.linearRampToValueAtTime(0.9, audioCtx.currentTime + 0.3);
    musicGainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.6);
}

// =============================================
// CANVAS BACKGROUND
// =============================================
const bgCv  = document.getElementById('bgCanvas');
const bgCtx = bgCv.getContext('2d');
let bgW, bgH;
let bgOrbs      = [];
let bgPulse     = 0;   // typing correct
let bgError     = 0;   // typing wrong
let bgBeatPulse = 0;   // music beat

function resizeBg() {
    bgW = bgCv.width  = window.innerWidth;
    bgH = bgCv.height = window.innerHeight;
}

function initOrbs() {
    bgOrbs = [
        { x:0.2,  y:0.5,  r:0.35, c:[110,40,220],  spd:0.0003,  phase:0 },
        { x:0.8,  y:0.2,  r:0.30, c:[20,130,220],   spd:0.0004,  phase:2 },
        { x:0.6,  y:0.8,  r:0.28, c:[120,50,200],   spd:0.00025, phase:4 },
        { x:0.1,  y:0.85, r:0.22, c:[30,120,180],   spd:0.0005,  phase:1 },
        { x:0.9,  y:0.6,  r:0.20, c:[160,80,240],   spd:0.00035, phase:3 },
    ];
}

function drawBg(t) {
    bgCtx.clearRect(0,0,bgW,bgH);
    bgCtx.fillStyle = '#080810';
    bgCtx.fillRect(0,0,bgW,bgH);

    const beatExtra = bgBeatPulse * 0.45;

    bgOrbs.forEach(o => {
        const nx = o.x + Math.sin(t * o.spd + o.phase) * 0.12;
        const ny = o.y + Math.cos(t * o.spd * 0.7 + o.phase) * 0.09;
        const px = nx * bgW, py = ny * bgH;
        const pr = o.r * Math.min(bgW, bgH);

        const extra = bgPulse * 0.3 + bgError * 0.15 + beatExtra;
        const grad  = bgCtx.createRadialGradient(px, py, 0, px, py, pr * (1 + extra));
        const [r,g,b] = o.c;
        const alpha = 0.18 + bgPulse * 0.12 + bgError * 0.08 + bgBeatPulse * 0.18;
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        bgCtx.fillStyle = grad;
        bgCtx.beginPath();
        bgCtx.arc(px, py, pr * (1 + extra), 0, Math.PI * 2);
        bgCtx.fill();
    });

    if (bgPulse     > 0) bgPulse     -= 0.04;
    if (bgError     > 0) bgError     -= 0.05;
    if (bgBeatPulse > 0) bgBeatPulse -= 0.06;
}

function bgLoop(t) { drawBg(t); requestAnimationFrame(bgLoop); }

resizeBg(); initOrbs();
requestAnimationFrame(bgLoop);
window.addEventListener('resize', resizeBg);

function triggerBgCorrect() { bgPulse = Math.min(1, bgPulse + 0.3); }
function triggerBgError()   { bgError = Math.min(1, bgError + 0.4); }

// =============================================
// DISTORT OVERLAY
// =============================================
const distEl = document.createElement('div');
distEl.id = 'distortOverlay';
document.body.appendChild(distEl);

function flashDistort() {
    distEl.classList.remove('active');
    void distEl.offsetWidth;
    distEl.classList.add('active');
    setTimeout(() => distEl.classList.remove('active'), 300);
}

// =============================================
// PROFILE & PROGRESS
// =============================================
function getProfile()   { return JSON.parse(localStorage.getItem('tb_profile'))  || null; }
function saveProfile(p) { localStorage.setItem('tb_profile',  JSON.stringify(p)); }
function getProgress()  { return JSON.parse(localStorage.getItem('tb_progress')) || { unlocked:1, stars:{}, bestWpm:{} }; }
function saveProgress(p){ localStorage.setItem('tb_progress', JSON.stringify(p)); }

// =============================================
// STATE
// =============================================
let score = 0, streak = 0, charIndex = 0, charRandom = '';
let elapsedSeconds = 0, WPM = 0, newScore = 0;
let currentLevelIndex = 0, pendingLevelIndex = 0;
let timerInterval, seconds = 0, minutes = 0;
let selectedAvatarColor = '#6d28d9';
let gameActive = false, lastLength = 0;
let correctCount = 0, liveWpmInterval = null;

// =============================================
// WORD POOLS BY TIER
// Words get progressively harder: short/common -> long/complex
// =============================================
const wordPools = {
    // Tier 1: levels 1-10 — basic short words
    tier1: [
        'cat','dog','sun','hat','run','cup','top','red','big','hot',
        'sit','map','net','jam','fix','box','fog','dip','log','pin',
        'rug','cap','lip','rub','tap','bud','cob','dim','dug','fan',
        'gap','hem','ivy','jet','keg','lag','mat','nap','orb','pat',
        'rib','sob','tab','urn','vat','wax','yam','zip','ash','bay'
    ],
    // Tier 2: levels 11-20 — common words, slightly longer
    tier2: [
        'bring','chair','dance','earth','fence','ghost','house','index',
        'judge','knife','light','magic','nerve','ocean','place','quick',
        'round','stone','table','under','voice','water','exist','young',
        'blank','coast','drift','flesh','glare','heavy','inner','joint',
        'kneel','layer','metal','night','ought','press','queen','reach',
        'sharp','thick','until','vapor','wheat','xray','yield','zone',
        'blood','brave','chess','doubt','enter','false','grain','habit'
    ],
    // Tier 3: levels 21-30 — moderate difficulty
    tier3: [
        'balance','cabinet','defense','elegant','farther','galactic','harvest',
        'integer','journey','kingdom','lasting','mention','natural','observe',
        'patient','quantum','require','station','texture','uniform','visible',
        'written','anxiety','barrier','capable','decline','exhaust','framing',
        'genuine','horizon','imagine','justice','knowing','lengthy','morning',
        'nucleus','obvious','painful','quickly','rapidly','science','thermal',
        'unknown','venture','western','exactly','younger','advance','blossom'
    ],
    // Tier 4: levels 31-40 — longer common words
    tier4: [
        'absolute','abstract','activity','addition','although','argument',
        'attitude','audience','bachelor','balanced','calendar','capacity',
        'chemical','children','circular','climbing','collapse','complete',
        'concrete','consider','contents','contrast','convince','criminal',
        'cultural','darkness','database','decision','describe','directly',
        'discover','distance','distinct','dominant','dramatic','duration',
        'economic','election','employee','equation','essential','evidence',
        'exchange','exercise','explicit','exposure','external','familiar',
        'feedback','flexible','fragment','function','generate','guidance'
    ],
    // Tier 5: levels 41-50 — complex words, trickier spelling
    tier5: [
        'accomplish','accumulate','acknowledge','acquisition','appropriate',
        'assessment','assumption','atmosphere','attraction','brilliance',
        'bureaucrat','calculator','captivating','catastrophe','chancellor',
        'chromosome','circumstance','collaborate','complication','compromise',
        'concentrate','consequently','construction','contribution','controversy',
        'conveniently','corporation','counterpart','credentials','cultivation',
        'declaration','deliberately','demonstrate','description','determination',
        'development','differential','disappearing','disciplinary','displacement',
        'distribute','documentary','effectively','efficiently','elimination',
        'embarrassment','employment','encouragement','enlightenment','enthusiasm'
    ],
    // Tier 6: levels 51-60 — technical/academic vocabulary
    tier6: [
        'acknowledgement','administration','amplification','approximation',
        'authentication','categorization','choreography','clarification',
        'collaboration','commemoration','comprehension','concentration',
        'configuration','confirmation','congratulation','consciousness',
        'consolidation','constellation','contamination','contradiction',
        'crystallization','decomposition','demonstration','differentiation',
        'discrimination','documentation','electromagnetic','encouragement',
        'establishment','experimentation','extrapolation','generalization',
        'hallucination','hospitalization','hypothetically','identification',
        'implementation','improvisation','infrastructure','instantiation',
        'instrumentation','interpretation','jurisdiction','justification',
        'liberalization','manifestation','minimization','miscommunication',
        'modernization','multiplication','nationalization','normalization'
    ],
    // Tier 7: levels 61-70 — rare and difficult words
    tier7: [
        'acquiescence','admonishment','ambiguously','amelioration',
        'anachronistic','antagonistically','anthropological','apprehension',
        'archaic','assimilation','authorization','bibliographical',
        'bureaucratic','caricature','cartographical','catastrophically',
        'chronological','circumstantially','clarification','climatological',
        'cognizance','commiseration','computational','conceptualization',
        'conscientiously','contemporaneous','contentiousness','contextualizing',
        'contradictorily','counterintuitive','cryptographically','cybersecurity',
        'definitively','demonstratively','departmentalization','deterministic',
        'disenfranchisement','disproportionate','ecclesiastically','environmental',
        'epistemological','equilibrium','etymologically','experimentally',
        'extraordinarily','familiarization','fundamentalism','globalization'
    ],
    // Tier 8: levels 71-80 — very hard, rare spelling
    tier8: [
        'abhorrent','aberration','abnormality','absurdity','acclimation',
        'accreditation','acquittance','agglomeration','aggregation',
        'alliteration','ameliorating','anachronism','anathematize',
        'antidisestablishment','antiquity','apotheosis','approximating',
        'arbitrariness','archipelago','argumentative','asymmetrical',
        'bureaucratization','categorically','circumnavigation','circumscription',
        'clandestine','collaboratively','colloquialism','commensurate',
        'communicability','consequentialism','constitutionally','contemplatively',
        'counterproductive','decomposing','definitiveness','deliberateness',
        'deoxyribonucleic','diametrically','discombobulation','disestablishment',
        'disproportionately','distinguishable','extraterrestrial','flabbergasted',
        'gubernatorial','hallucinating','hippopotamus','hypersensitivity'
    ],
    // Tier 9: levels 81-90 — elite level, hardest words
    tier9: [
        'abracadabra','abstemiously','accidentally','accommodating',
        'accomplishment','accountability','accreditations','acknowledgements',
        'administratively','advantageously','aerodynamically','affectionately',
        'agglutinative','algebraically','algorithmically','allegorically',
        'alliteratively','ambidextrously','ambitiousness','anachronistically',
        'anagrammatically','anthropomorphic','antidisestablishmentarianism',
        'archaeologically','architecturally','arithmetically','asynchronously',
        'atmospherically','autobiographically','bacteriologically','biochemically',
        'bureaucratically','cardiovascular','characteristically','chronologically',
        'circumnavigating','collaboratively','commensurately','communicatively',
        'comprehensively','consequentially','constitutionally','contemporaneously',
        'controversially','counterintuitively','cryptographically','democratically',
        'differentiation','diplomatically','discombobulated','disenfranchisement',
        'electromagnetically','etymologically','extraterrestrially','fundamentally'
    ]
};

// =============================================
// SENTENCE POOLS — used when NO music is loaded
// Same 30-level baseline texts (no em dashes, cleaned up)
// Extended with 31-90 additional sets
// =============================================
const sentencePools = [
    // 1-10: very short sentences
    ["The cat sat on the mat.","A big dog ran fast.","The sun is hot today.","I like to eat cake.","She has a red hat."],
    ["The boy went to the shop.","A cold wind blew all day.","My dog likes to play outside.","She made a cup of tea.","He read a short book last night."],
    ["The birds sang in the tall oak tree.","She walked slowly down the empty road.","He found an old coin in the garden.","The sky turned pink as the sun went down.","A small cat slept on the warm windowsill."],
    ["They played football in the park after school.","The rain fell hard against the window all night.","She packed her bag and left before sunrise.","He cooked a simple meal and sat down to eat.","The old clock on the wall ticked slowly."],
    ["The morning sun crept over the hills, painting the meadow gold.","She found the old letters at the bottom of a dusty trunk.","Neon signs flickered on as the city shifted into evening.","He stood at the cliff edge, coat snapping in the wind.","Children chased bubbles through the park while a dog bounded after them."],
    ["The old bookshop smelled of cedar and dust, its shelves bowed under years of stories.","Rain fell steadily on the empty street, each drop a small percussion against the pavement.","She pressed her hands into the soil, feeling the cool earth give way beneath her fingers.","The train moved through darkness between stations, its passengers half-asleep and swaying gently.","He set the coffee down and watched the steam curl and slowly vanish into the air."],
    ["The lighthouse stood firm against the crashing waves, its beam sweeping endlessly through the dark.","She closed the book and sat in silence, letting the story settle like dust in still air.","The market was loud and colourful, vendors calling out over the noise of the midday crowd.","He watched the last train pull away and felt the quiet of the empty platform wrap around him.","A single candle burned on the table, casting long shadows across the bare walls of the room."],
    ["The forest was dense and silent, broken only by the occasional snap of a twig underfoot.","She had spent years collecting these moments, tucking them away like pressed flowers between pages.","The clock struck midnight and the last guest finally pulled on their coat and stepped into the cold.","He had never been good at goodbyes, so he simply turned and walked without looking back once.","The cafe was nearly empty at that hour, just two strangers nursing cold cups at opposite ends."],
    ["The autumn leaves fell in slow spirals, collecting in drifts against the iron gate at the end of the lane.","She remembered the way he laughed, sudden and loud, filling whatever room he happened to be standing in.","The city looked different at four in the morning, emptied of its daytime noise and urgency and restless motion.","He had mapped every corner of the neighbourhood, yet still found streets that surprised him on quiet Sunday walks.","The storm had passed by morning, leaving everything washed clean and glittering under a pale winter sun."],
    ["The violin solo drifted through the open window and stopped every person on the pavement below for just a moment.","She had kept the letter for years without opening it, afraid of what the words inside might rearrange in her.","The old bridge groaned under the weight of traffic, its iron bones holding fast despite the years of rust and rain.","He sat at the back of every meeting, notebook open, pen moving, though no one ever asked what he was writing.","The garden in winter looked abandoned, but she knew every bulb buried beneath the frost was simply waiting for its turn."],
    // 11-20
    ["The ferry cut through the grey water, its horn sounding once as it pulled away from the dock into open sea.","She organised her thoughts the way she organised her desk, everything in its place, nothing left to chance or feeling.","The argument had ended hours ago but the silence that replaced it was somehow louder and harder to sit with.","He read the same paragraph three times before accepting that his mind was somewhere else entirely that afternoon.","The town had changed so much in ten years that she walked its streets like a tourist in her own history."],
    ["The astronomer had spent forty years looking at the same patch of sky, finding something new in it every single night.","She wrote the first line of the letter four times before crumpling each attempt and dropping it into the bin beside her.","The road stretched ahead in a long straight line, bordered on both sides by flat fields going gold in the late sun.","He had a habit of arriving early everywhere, then sitting quietly and watching the place fill up around him like a tide.","The cat watched the rain from the windowsill with the calm authority of someone who had never needed to be anywhere."],
    ["The pianist played without sheet music, her fingers moving across the keys from memory built over thirty years of practice.","She had learned early that silence could be a form of speech, and she had grown fluent in it over the years.","The building had been empty for a decade, but someone had left a light on in the top floor window every single night.","He kept a journal not to remember things, but to understand them, writing was how he figured out what he actually thought.","The harbour at dawn was the only time the city felt truly still, the water flat and the gulls not yet awake."],
    ["The technician worked in silence, disassembling the machine with careful precision, as if each part deserved its own moment of attention.","She had lived in six cities in ten years and had learned to make a home quickly, finding the nearest bakery and park first.","The debate had gone on for hours, circling the same points without resolution, everyone too committed to their position to truly listen.","He remembered his grandfather saying that patience was not the absence of action but the presence of the right kind of waiting.","The valley was visible from the ridge, a wide green bowl of farmland divided into neat squares by hedgerows and stone walls."],
    ["The exhibition opened to a quiet crowd who moved slowly from piece to piece, speaking in low voices as if in a library.","She had always been better at beginnings than endings, full of energy at the start of things, restless when they wound down.","The satellite image showed the glacier had retreated another kilometre since the last survey, the data cold and precise and damning.","He carried the photograph in his wallet for years, not out of sentimentality but because he needed to remember what hope looked like.","The workshop smelled of sawdust and linseed oil, and the craftsman moved around it with the ease of someone in their truest element."],
    ["The composer sat at the piano for three hours without playing a single note, listening to the music that existed only in his head.","She understood that kindness was not weakness, it required more precision and more courage than most people were willing to admit.","The archive contained thousands of letters written during the war, each one a small window into a life being lived under impossible pressure.","He had always suspected that the most important conversations happened not at the table but in the car, driving somewhere at night.","The reef was barely visible from the surface, but beneath it an entire world moved and fed and competed in brilliant silence."],
    ["The surgeon worked with the focused calm of someone who had long since made peace with the weight of what their hands were doing.","She rewrote the opening chapter eleven times before she understood that the story did not begin where she thought it did.","The canyon walls were layered in shades of red and ochre, each band a different century compressed into stone by unimaginable pressure and time.","He had always found airports melancholy, not because of departures, but because of all the arrivals that went unmet by anyone waiting.","The algorithm processed the data in milliseconds, but understanding what the numbers meant took the team the better part of a week."],
    ["The river had carved through limestone for ten thousand years, and standing at its edge you could feel the patience required in the sound of it.","She spoke four languages fluently and said that each one gave her a slightly different personality, a different way of being in the world.","The investigation had stalled for months until a single overlooked detail in the original report suddenly reframed the entire sequence of events.","He believed that cities revealed themselves not in their landmarks but in their corners, the alleyways and thresholds and unremarkable in-between places.","The prototype failed three times before the team understood that the problem was not in the design but in the assumptions behind the design."],
    ["The philosopher argued that boredom was not an absence of stimulation but an excess of it, the mind finally rebelling against the noise.","She had cultivated the rare skill of entering a room full of strangers and making each of them feel, briefly, that they were known.","The manuscript had been found in a monastery library, misfiled under the wrong century, and had sat unread for over two hundred years.","He noticed that the people who spoke most confidently about the future were usually the ones least burdened by knowledge of the past.","The delta spread across the map like a hand opening, each finger of water carrying sediment slowly toward the sea over geological time."],
    ["The conductor raised her baton and the orchestra settled into a silence so complete that the audience stopped breathing for a moment before the music began.","She had built her career on the ability to ask the question that everyone else in the room was thinking but had decided was too obvious to say.","The migration route had been used by the same bird species for millennia, a path encoded not in maps but in the birds themselves across generations.","He kept a list of every book he had ever read, not the titles but a single sentence describing how each one had changed the way he thought.","The bridge had been designed to sway slightly in high winds, because rigidity, the engineer explained, was not the same thing as strength."],
    // 21-30
    ["The archaeologist brushed away centuries of soil with the patience of someone who understood that the thing you are looking for is always exactly where you find it.","She had spent the better part of her career studying how people make decisions under pressure, and the conclusion she kept returning to was that most do not.","The telecommunications network had been designed with so many redundancies that it could sustain multiple simultaneous failures without the end user noticing any disruption at all.","He wrote in the mornings before his mind filled with the obligations of the day, finding in those early hours a clarity that he could not manufacture later.","The ecological survey revealed that the forest, which had appeared uniform from above, was in fact composed of dozens of distinct micro-habitats invisible from any distance."],
    ["The historian noted that the most consequential decisions of the century had often been made not in grand chambers but in corridors, between sessions, informally.","She understood instinctively that the space between words was where meaning accumulated, and that what was left unsaid shaped a conversation as much as what was said.","The neurological study suggested that expertise did not reside in any single region of the brain but was distributed across networks that had been strengthened through repetition.","He had long believed that the quality of a city could be measured by the quality of its public libraries, their funding, their hours, their welcome.","The structural engineer identified the flaw not by calculation but by instinct, a sense built from twenty years of looking at things that were about to fail."],
    ["The documentary followed three generations of a family living in the same house, each generation leaving marks on the walls that the next painted over without knowing.","She argued that the most underrated quality in a leader was the willingness to change their mind publicly and without defensiveness when presented with better information.","The cartographer spent years mapping coastlines that were actively eroding, producing documents that were already partially obsolete by the time they were printed and distributed.","He had learned that the way a person treated a waiter told you more about their character than anything they said in the first hour of conversation.","The installation used light and sound to recreate the experience of standing inside a thunderstorm, and most visitors spent longer inside it than they had planned."],
    ["The quantum computing research team had spent three years solving a problem that classical computers would have taken longer than the age of the universe to complete.","She had written the algorithm herself, but reading it months later it felt like the work of someone else, someone who thought in a language she had since forgotten.","The diplomat explained that the treaty had succeeded not because of any grand gesture but because both sides had been quietly exhausted by the cost of continuing.","He believed that the purpose of education was not the transmission of knowledge but the cultivation of the capacity to be surprised and to follow that surprise somewhere.","The glacier moved imperceptibly, a few centimetres a day, but over centuries had carved a valley so wide and deep it seemed impossible that ice alone had done it."],
    ["The linguist had documented seventeen languages now spoken by fewer than ten people, each one a complete world of meaning balanced on the edge of disappearing.","She built her argument slowly and without flourish, laying each premise down with care and returning to test its strength before moving on to the next one.","The research station operated year-round in conditions that made most equipment unreliable, requiring engineers who could improvise solutions from whatever materials happened to be available.","He had always found it easier to understand people through their bookshelves than through their conversation, the books they kept said things they would never say aloud.","The performance lasted three hours without an interval, and yet no one in the audience looked at their watch or shifted in their seat or wished it shorter."],
    ["The archaeological excavation revealed not just the structure of the ancient city but the evidence of a catastrophic event that had ended it in a single afternoon.","She had developed the theory over fifteen years, revising it quietly whenever the evidence demanded, never announcing the revisions because she did not think the process was interesting.","The composer described the symphony as an attempt to write music that sounded inevitable in retrospect but could not have been predicted from any of its individual parts.","He kept a notebook of questions he could not answer, adding to it regularly and returning to earlier questions to see whether time or experience had changed how he thought.","The manufacturing process had been optimised so many times that the engineers had started to worry they were optimising out the margins that protected against unforeseen variations in materials."],
    ["The legal team had prepared extensively for the case, but the opposing counsel introduced a line of argument so unexpected that the first ten minutes were lost to recalibration.","She noticed that the most creative people she had worked with shared a common trait, not talent or intelligence but a high tolerance for the discomfort of not yet knowing the answer.","The satellite had been in orbit for thirty years, long past its design life, still transmitting data that no one had expected it to still be capable of generating.","He wrote the dedication last, after the book was finished, and found that what he wanted to say had changed completely from what he had imagined he would say at the start.","The coastal town had been flooded seventeen times in the past century and rebuilt seventeen times, each time slightly differently, as if the town were slowly learning something from the water."],
    ["The philosopher had spent forty years writing about the nature of time and confessed in his final lecture that he understood it less clearly now than he had when he began.","She ran the organisation with a combination of strategic vision and operational precision that most people who worked there experienced simply as a pervasive sense that things were going to be alright.","The telescope array had detected a signal that matched no known natural phenomenon, and the team spent six months ruling out instrument error before they began to discuss what else it might be.","He believed that the best conversations were the ones that ended with both people thinking about something they had not thought about before walking into the room together.","The restoration project had taken twelve years and involved specialists from nine countries, all working on different parts of a problem so large that no single person could hold it entirely in mind."],
    ["The manuscript described in precise and unhurried detail a world so different from our own that scholars had spent decades debating whether it was history, fiction, or something else entirely.","She had learned that the most dangerous assumption in any negotiation was the belief that the other party wanted what you thought they wanted rather than something you had not yet thought to ask about.","The submersible descended through water so dark and cold and pressurised that the team inside it was aware, on some level they did not discuss, of how thin the barrier was between them and the deep.","He had published forty-seven papers and supervised thirty-one doctoral students and still felt, on the best days, the same disoriented excitement he had felt in the library at nineteen, pulling a book off the shelf at random.","The city had been built on a swamp, which the engineers of the time considered a problem they had solved, and which the engineers three hundred years later were beginning to understand they had only deferred."],
    ["The expedition had been planned for two years and executed over four months in conditions that the team's equipment was not fully rated for, producing data that rewrote several assumptions that had stood unchallenged for decades.","She had spent her career arguing that the distinction between art and science was not a difference in method or rigour but in the questions each was willing to ask and the forms of answer each was willing to accept.","The infrastructure project connected twelve previously isolated communities to the national grid, but the engineers who built it noted in their final report that the most significant impact had been psychological rather than material.","He had always been suspicious of certainty, not because he thought doubt was a virtue in itself, but because in his experience the people who were most certain were usually the ones who had stopped paying attention.","The archive preserved not just documents but the metadata of documents, who had accessed them, when, and for how long, creating a record of how knowledge had moved through the institution across more than a century."],
    // 31-40: longer sentences, academic register
    ["The investigative journalist spent three years building a case from fragments of evidence scattered across jurisdictions that had no formal mechanism for sharing information with each other.","She had studied the psychology of memory long enough to know that the most confident recollections were not necessarily the most accurate ones, which made her a careful and somewhat unsettling witness.","The seismograph registered vibrations too subtle to be felt by anyone in the building, but the technicians had learned to read those patterns the way some people read weather, with a mixture of science and instinct.","He found the older he got the less interested he was in being right and the more interested he was in understanding why intelligent people could look at the same facts and arrive at such different conclusions.","The garden had been designed to be experienced in sequence, each section revealing itself only after you had spent time in the previous one, so that the whole did not become apparent until you were nearly at the end."],
    ["The concept of universal basic income had been tested in a dozen countries over thirty years, always producing results that supporters and critics alike could interpret as confirming exactly what they had already believed.","She woke each morning with the same ten-minute ritual, not because she thought it would change anything but because it reminded her that even the smallest deliberate acts were a form of agency in an indifferent world.","The ancient amphitheatre had been built with an acoustic logic so precise that a whisper from the stage could be heard in the back row without any amplification, a fact that still surprised visitors two thousand years later.","He had spent his career in a field that most people could not explain to their families at dinner, which had given him an unusual combination of precision in his own thinking and patience with other people's confusion.","The restoration team discovered that the original painting had been executed in at least four distinct phases spanning nearly a decade, and that the figure in the foreground had been painted over a completely different composition underneath."],
    ["The committee had been established to resolve a dispute between three parties who each had a legitimate claim to the same resource, and it had now been meeting quarterly for eleven years without producing a resolution.","She argued that the most important thing a city could do for its young people was not to build playgrounds or sports facilities but to ensure that public libraries remained fully funded, fully staffed, and open every single day.","The fishermen had been mapping the same stretch of coastline for generations, each one adding notes in the margin of the chart about currents and rocks that no official survey had ever recorded and that no satellite could see.","He noticed that the language used to describe economic policy had become so technical and abstracted that it was nearly impossible for anyone who was not already an expert to evaluate whether the arguments being made were sound.","The monastery had survived invasions, fires, and three separate attempts to dissolve it over the course of seven centuries, and the monks who lived there now carried that survival as a form of institutional memory that shaped everything they did."],
    ["The climate model incorporated data from four thousand weather stations, two hundred ocean buoys, and seventeen satellites, and still had uncertainty ranges wide enough that the policy implications of its projections remained genuinely contested.","She had written the report at the request of the board, knowing that what they actually wanted was confirmation of a decision they had already made, and she had spent two weeks deciding how honest she was prepared to be.","The linguist discovered that the language, which had been declared extinct in nineteen eighty-two, was still spoken by fourteen people in a single village who had simply chosen not to mention it to anyone who had come asking.","He was the kind of person who could explain a complicated idea simply without making it simplistic, which is a much rarer ability than it sounds, and which he had developed through decades of teaching introductory courses to skeptical undergraduates.","The archive contained a collection of maps that had been drawn before the territory they depicted had been fully explored, so each one showed a combination of careful surveying and confident speculation that was impossible to separate without other sources."],
    ["The underwater archaeologist had spent her career excavating sites that most people could not reach, working in conditions of cold and pressure and limited visibility that required every skill she had developed over thirty years to be deployed simultaneously.","He wrote a paper arguing that the accepted timeline of the city's founding was based on a misreading of a single source document, and it had been politely ignored for twelve years until a separate excavation accidentally confirmed everything he had said.","The solar panels on the roof generated enough electricity to power the building during daylight hours, but the economics of the project only made sense if you included the full lifecycle cost in the calculation, which the initial feasibility study had not done.","She had developed the unusual habit of writing the conclusion of any piece she was working on before writing anything else, on the grounds that if you could not state clearly what you were trying to say you had no business saying it.","The protein had been known to researchers for decades as a structural component of cell walls before someone thought to look at what happened when it was absent, at which point it became apparent that it was doing something considerably more important than anyone had suspected."],
    ["The exhibition brought together works from forty-seven collections in twenty-two countries and had required nine years of negotiation to assemble, most of which had been spent resolving questions of provenance that the participating institutions preferred not to discuss in public.","He had studied the architecture of prisons for twenty years and had come to believe that the design of incarceration said more about what a society believed about human nature than almost any other kind of building it constructed.","The translation had been praised for its fidelity to the original, which struck the translator as somewhat ironic given that the choices she had made involved constant small betrayals of the letter in order to preserve what she considered the spirit.","She understood that the most effective advocates she had encountered were not the loudest or the most passionate but the ones who had taken the time to understand the opposing argument well enough to know exactly where it was most vulnerable.","The river delta had been reshaped by a century of upstream damming, and the communities that depended on it had adapted so many times that the knowledge of what it had originally looked like existed only in the memories of the very oldest residents."],
    ["The theoretical framework had been developed as an explanatory model for a very specific set of observations, and the subsequent decades of attempts to apply it more broadly had produced a literature that was, in the estimation of several of its own practitioners, more confusing than illuminating.","She spent her days working with data sets large enough that no single person could hold them in mind, which had given her a different relationship to knowledge than her colleagues who worked with smaller and more tractable problems.","The architectural competition had attracted submissions from sixty-three firms across thirty-one countries, and the selection panel had spent a week reviewing them before realizing that the brief had been unclear enough that many of the submissions were answering a fundamentally different question.","He had been asked many times over the course of his career whether he found his work meaningful, and he had always answered honestly that he found it interesting, which he thought was both a more accurate description and a higher compliment.","The coral reef survey documented species that had not been recorded in the region for decades and also noted several absences that had once been common, and the net balance of this information was sufficiently ambiguous that it could support either an optimistic or a pessimistic interpretation."],
    ["The commission found that the failure had not been caused by any single dramatic mistake but by the accumulation of small decisions made under time pressure by people who each had incomplete information and who had no reason to consult with each other before acting.","She had spent years trying to explain to people outside her field why the question she was working on mattered, and she had eventually concluded that the explanation itself was more important than the answer, because it changed how people thought about the subject even before they knew anything about it.","The philosopher argued that the distinction between describing what is and prescribing what ought to be, while logically clean, was practically speaking impossible to maintain, because every choice about what to describe and how to describe it already embedded normative assumptions.","He kept his lecture notes on index cards, not because he thought that was an efficient system but because the constraint forced him to decide what was actually important enough to include, and he had found over forty years of teaching that the constraint produced better lectures than freedom would have.","The building had been constructed in haste during a period of rapid urban expansion and had been described at the time as a temporary solution that would be replaced within five years, a description that had been made in good faith and had proved completely wrong."],
    ["The investigative team discovered that the financial irregularities they had been asked to examine were not, as originally suspected, the result of deliberate fraud, but rather the consequence of a record-keeping system so poorly designed that it had made honest accounting nearly impossible.","She argued that any theory of justice that could not be explained to an intelligent twelve-year-old in terms they found plausible was probably not capturing something universal about human moral intuition but instead reflecting the specific assumptions of a particular intellectual tradition.","The oceanographic survey had been at sea for ninety-four days when the instruments detected an anomaly in the temperature readings that none of the scientists on board could immediately explain and that turned out, after six months of analysis on shore, to have been a measurement error.","He had developed a practice of writing down everything he was worried about at the beginning of each day and then revisiting the list at the end, not because it resolved anything but because it imposed a useful discipline on the relationship between anxiety and attention.","The restoration of the fresco had taken fourteen years and involved techniques that had not existed when the project began, because the conservators had discovered early on that the standard methods were inadequate and had needed to develop new ones as they went."],
    ["The competition had been designed to identify the most technically sophisticated solution to a well-defined engineering problem, but the winning submission was remarkable not for its technical sophistication but for its elegant simplicity, and the judges spent some time debating whether they were allowed to give the prize to something so straightforward.","She had built her reputation on a methodology that her colleagues considered either rigorous or rigid depending on how sympathetically they viewed her work, and she had never found a way to resolve this disagreement because it rested on a prior disagreement about what the field was actually trying to accomplish.","The international collaboration had been proposed as a model for how countries with competing interests could nonetheless cooperate on problems that were too large for any single nation to address, and it had indeed become a model in the sense that people frequently cited it, though rarely in contexts that suggested they thought it had been a success.","He found that the longer he spent working on a problem the harder it became to explain why it was difficult, because the difficulty was increasingly located in the precise formulation of what the problem actually was rather than in any of the methods available for addressing it.","The manuscript had been written in four different hands, which the palaeographers agreed were separated by at least two generations, suggesting that the text had been transmitted and added to over time rather than composed as a whole, which changed considerably how its arguments needed to be read."],
    // 41-50
    ["The mathematician had been working on the same problem for eleven years and had accumulated a drawer full of notebooks containing approaches that had not worked, which she regarded not as failures but as a map of the space of wrong answers that any future solution would have to navigate around.","He argued that the most important institutional reform of the past century had not been any of the dramatic ones that everyone remembered but the slow accumulation of procedural changes that had made it harder for any single actor to concentrate enough power to do lasting damage without being checked.","The translation of the poem had been praised for its musicality in English but criticised for its infidelity to the original, a tension that the translator had been aware of from the beginning and had resolved in favour of music on the grounds that a faithful but unreadable translation served no one.","She had spent her career at the intersection of two fields that did not traditionally speak to each other, which had made her work difficult to place and difficult to review but had also given her access to methods and frameworks that specialists in either field alone did not have.","The archaeological site had been continuously inhabited for over eight thousand years, and the excavation had proceeded slowly enough that each layer told a distinct story, none of which had prepared the team for what they found when they finally reached the lowest stratum."],
    ["The epidemiological study followed a cohort of forty-three thousand people for twenty-five years and found a correlation that was statistically robust, causally plausible, and completely contrary to the existing clinical guidance, which created a problem that the relevant medical authorities handled by commissioning another study.","She understood that the relationship between evidence and belief was not straightforwardly rational even among people who considered themselves rational, because the weight assigned to any particular piece of evidence was itself a function of prior beliefs that evidence alone could not change.","The engineer had spent his career designing systems intended to be used by people who did not understand how they worked, which had given him an unusual perspective on the relationship between technical complexity and practical reliability, and he had come to believe they were more often in conflict than most of his colleagues were willing to admit.","The biography covered a life so eventful that the author had faced a constant choice between depth and breadth, and the reviews reflected this tension, with some praising the book's comprehensiveness and others arguing that its exhaustiveness had paradoxically obscured what was most interesting about its subject.","The conservation programme had been running for thirty years and had succeeded by most measurable indicators, but the conservationists who had started it were increasingly worried that it had been too successful in a narrow sense, creating a population that was genetically less diverse than the one they had set out to protect."],
    ["The security researcher had identified the vulnerability in a widely-used protocol eighteen months before it was publicly disclosed, a period she had spent negotiating with vendors who were simultaneously acknowledging the seriousness of the problem and arguing for the maximum possible time before it needed to be fixed.","He had spent his career studying organisations that had failed, and the pattern he found most consistently was not incompetence or corruption but a structural tendency to suppress information that contradicted the organisation's official view of how well it was performing, which meant the failure was usually already well advanced before anyone in authority knew it had begun.","The novelist had spent seven years on a book that reviewers described as either a masterpiece or a failure depending on whether they thought the ambiguity at its centre was an achievement or an evasion, and she had long since stopped trying to convince anyone that these were not actually incompatible assessments.","The international climate negotiations had produced a framework that every participating country had endorsed and that analysis suggested was insufficient by a considerable margin to achieve the stated goals, but the negotiators argued, not without logic, that an insufficient framework that existed was better than a sufficient one that did not.","The data centre had been built to the highest available standards of redundancy and had nonetheless experienced three unplanned outages in its first year of operation, each caused by a different interaction between components that had each individually been tested to specification but had never been tested together."],
    ["The welfare economist argued that the conventional measures of national income were inadequate not because they failed to capture non-market activity but because they aggregated in ways that made it impossible to distinguish between economic activity that increased wellbeing and economic activity that merely compensated for reductions in it.","She had developed the analysis over years of careful work and presented it at a conference where it was challenged by someone who had not read the paper carefully enough to understand what the analysis was claiming, and she had spent the subsequent decade dealing with critiques directed at the argument she had not made rather than the one she had.","The urban designer argued that the most important decisions about how a city functioned were not made by planners or architects but by the people who decided where to put parking and how to price it, decisions that were rarely treated as design decisions at all but that shaped the experience of the city more thoroughly than any individual building.","He kept a list of assumptions he was making in any given piece of work, not because he thought he could eliminate assumptions from research but because he had found that the ones you did not acknowledge were the ones most likely to turn out to be wrong in ways that were most difficult to notice.","The conservatory had been training musicians for a hundred and forty years and had produced alumni of extraordinary distinction, but the current director was increasingly troubled by evidence suggesting that the intensity of the training was leaving a substantial proportion of graduates unable to sustain a relationship with music once the institutional structure that had organised their lives was removed."],
    ["The experiment had been designed to test a specific hypothesis about the relationship between two variables, but the results had revealed an unexpected third relationship that was more interesting than the original hypothesis and that the team had spent the subsequent three years trying to replicate in conditions controlled enough to satisfy a sceptical editorial board.","She argued in her dissertation that the canonical history of the discipline had been constructed in ways that systematically excluded contributions that did not fit the dominant narrative, not through deliberate suppression but through the cumulative effect of choices about what was worth citing and what could be treated as a footnote.","The ship had been at sea for four months when the engine failed in a way that the manual had not anticipated, and the engineer who fixed it did so through a combination of knowledge, improvisation, and a willingness to try things that the manufacturer would certainly not have recommended, all of which he later wrote up in a report that the manufacturer officially ignored and unofficially circulated.","He had spent his career working on problems that seemed intractable and had found that the ones most resistant to direct attack often yielded to an indirect approach, not through any strategic insight but through the accumulated understanding of the problem that came from spending a long time failing to solve it in the obvious way.","The report documented in careful and unsensational language a situation that was, when its full implications were understood, as serious as any the department had faced, and the measured tone that made it credible also, unfortunately, made it easy for people to read without feeling the urgency that the situation required."],
    // 51-60: complex, dense writing
    ["The theoretical physicist had spent twenty years developing a framework that unified two previously incompatible descriptions of physical reality, and the framework was mathematically consistent, experimentally untestable with any technology currently available, and the subject of a disagreement among her colleagues so fundamental that it concerned not just whether she was right but whether what she was doing constituted physics at all.","She had observed over the course of a long career in policy that the people most confident in their ability to predict the consequences of proposed changes were reliably less accurate than those who acknowledged uncertainty, but that the former were consistently more persuasive to the people who had to make decisions, and she had never found a satisfactory explanation for why this was so.","The restoration of the ecosystem had required the reintroduction of species that had been absent for over a century, a process that had proceeded more successfully in biological terms than anyone had anticipated, and had simultaneously created social conflicts between different communities with legitimate but incompatible interests in how the land was used that no amount of ecological success could resolve.","He had written the book twice, the second time after deciding that the first version was technically accurate but gave the reader no reason to care about what was accurate in it, which was a more fundamental problem than the factual errors he had also corrected in the second draft, though the factual errors were the ones that got reviewed.","The commission's final report ran to four hundred and twelve pages and concluded that the situation it had been established to investigate had resulted from a combination of factors that each, taken alone, would have been insufficient to produce the outcome but that together had created conditions in which something like what happened had become, in retrospect, almost inevitable."],
    ["The ethnographer had spent eighteen months embedded in the community she was studying and had arrived at conclusions that challenged the existing literature so fundamentally that she had spent the subsequent two years questioning not just her conclusions but the methodology that had produced them, and the resulting book was praised for its reflexivity and criticised for the extent to which that reflexivity had displaced the community itself from the centre of the account.","She had developed an approach to the problem that her colleagues described as either elegant or evasive depending on their prior commitments, and she had come to think that the disagreement was not really about her approach but about a deeper methodological dispute that her approach had made impossible to avoid acknowledging.","The decision to decommission the facility had been taken for financial reasons and had been communicated to the staff in language designed to make it appear to have been taken for technical ones, a gap between the stated and actual reasons that the people affected had no difficulty identifying and that had shaped their relationship with the institution's subsequent communications about the closure process.","He argued that the emergence of the technology had not, as both its advocates and its critics assumed, fundamentally changed the underlying dynamics of the process it had been designed to improve, but had instead made those dynamics more visible in ways that were useful to researchers and uncomfortable to practitioners.","The graduate student had spent three years collecting a data set that turned out, when she finally analysed it, to support a conclusion that directly contradicted the hypothesis her supervisor had asked her to test, and the subsequent conversation about what to do with this information had been the most educational exchange of her academic career, though not in ways she would have chosen."],
    ["The political theorist argued that the difficulty with procedural accounts of justice was not that they failed to identify fair processes but that they provided no resources for evaluating outcomes that were produced by fair processes but that almost everyone would nonetheless describe as unjust, and that this limitation was not a refinement to be addressed but a fundamental constraint on what the procedural approach could do.","She had spent her professional life studying institutional failure and had arrived at the view that the most dangerous institutions were not the ones that failed suddenly and visibly but the ones that failed slowly and in ways that their own members had every incentive not to notice or report, because the costs of acknowledging failure were immediate and the benefits of continued denial were distributed across time in ways that made them feel more manageable than they were.","The restoration project had been funded on the assumption that traditional techniques would be sufficient, but the lead conservator had discovered early on that the condition of the object was more severe than any preliminary examination had suggested, and the project had subsequently expanded in scope, timeline, and budget in ways that required each funding body to make decisions it had not been asked to make when it originally committed.","He had trained as a scientist and had spent the first decade of his career convinced that the purpose of scientific communication was the transmission of information, and the second decade realising that it was much more often the performance of credibility, and the third decade trying to understand whether this distinction was as important as he had initially thought or whether credibility was just information about reliability expressed in a different register.","The survey asked respondents to evaluate the performance of institutions across a range of dimensions, and the results confirmed what previous surveys had found, which was that people's assessments of institutional performance were more strongly correlated with their prior political commitments than with any objective measure of how the institutions were actually performing, a finding that was simultaneously unsurprising and resistant to any straightforward remediation."],
    ["The epistemologist distinguished between knowledge that could be articulated and knowledge that could only be demonstrated through performance, and argued that most of what was actually useful in any technical domain belonged to the second category, which meant that the standard methods of knowledge transfer, which were almost entirely oriented toward the first category, were systematically transferring the less important part of what experts knew.","She had spent her career studying the boundary between what could and could not be known about a particular domain, and had found that the boundary was not fixed but moved in response to methodological innovation, theoretical development, and the accumulation of data, and that the most interesting moments in the history of her field were the ones when the boundary moved in an unexpected direction.","The legal scholar argued that the distinction between law as it was written and law as it was applied was not a defect in the legal system but one of its defining features, because the gap between the two was where most of the practical and normative work of law actually happened, and any account that did not take the gap seriously was describing a legal system that did not exist.","He had been working on the problem for long enough to know that the solution, when it came, would probably feel obvious in retrospect, and this knowledge had not made the process of finding it any less difficult but had at least made it easier to distinguish between the feeling of being close to a solution and the feeling of having found one, which turned out to be useful more often than he had expected.","The sociologist had conducted sixty-three interviews over the course of the study and had found that the most informative data came not from what people said about the topic she was investigating but from the language they used to avoid talking about it, which had led her to revise her analytical framework substantially between the data collection and the writing phases."],
    ["The complexity theorist argued that most of the systems that social scientists studied were not complicated in the engineering sense, meaning difficult but tractable, but complex in the technical sense, meaning that their behaviour emerged from the interactions of components in ways that could not be predicted from knowledge of the components alone, and that this distinction had profound implications for what kinds of interventions were likely to work and what kinds were likely to produce unintended consequences.","She had spent twenty years studying a phenomenon that most of her colleagues considered either obviously important or obviously trivial depending on their disciplinary training, and she had found the disagreement more illuminating than any of the empirical results she had produced, because it revealed assumptions about what counts as an explanation that ran so deep they were rarely made explicit.","The architect had designed buildings on four continents and had arrived at the view that the most important factor in whether a building was experienced as good or bad by the people who used it was not anything that appeared in the design brief or the construction specification but the quality of the transition between the building and the street, a feature that was almost never discussed in architectural education and almost always decisive in practice.","He argued that the standard account of how the institution had come to adopt the policy it had was accurate as far as it went but omitted the sequence of informal conversations that had actually structured the formal process, and that understanding the formal process without understanding the informal one was like understanding the text of a law without understanding the circumstances under which it had been drafted.","The conservationist had spent her career working to protect species whose ecological importance was not obvious to non-specialists, which meant that most of her professional energy had been spent on the question of how to explain why something mattered rather than on the question of how to protect it, and she had come to think that this was actually the more difficult problem of the two."],
    // 61-70: very dense, long, academic
    ["The philosopher of language had spent thirty years arguing that the distinction between what a sentence meant and what a speaker meant by using it was not a refinement of ordinary semantic analysis but a fundamental reorientation of it, and had found over those thirty years that the argument was easier to state than to elaborate and easier to elaborate than to persuade other philosophers of, because the distinction required taking seriously a set of considerations that the standard framework had been designed to set aside.","She had worked in international development for two decades and had arrived at the uncomfortable conclusion that the field's dominant model of what development was and how it happened was not just empirically contestable but was actively organised around assumptions that made it difficult to notice the evidence against it, because the evidence against it was generally produced by the people the model classified as the objects rather than the agents of development.","The palaeoclimatologist had spent her career reconstructing climate conditions from proxy data of various kinds, and had become increasingly interested not in any particular reconstruction but in the question of how much confidence was warranted in any reconstruction given the assumptions that had to be made in interpreting the proxies, an interest that her colleagues found either methodologically sophisticated or methodologically paralysing depending on how urgently they felt the policy applications of the research required clear answers.","He had written extensively about the relationship between technological change and institutional adaptation and had found that the standard narrative, in which institutions adapted too slowly to keep pace with technology, was approximately the opposite of what the historical record showed, in that institutions typically adapted faster than anyone expected and in directions that were often more consequential than the technological changes that had prompted them.","The musicologist had spent her career studying a tradition that was largely oral and that had never developed a system of notation, which meant that her work required not just historical research but extended fieldwork, and the tension between these two methodologies had shaped everything she had published in ways that were visible to specialists and invisible to everyone else."],
    ["The developmental psychologist had followed a cohort of children from birth through early adulthood and had found that the predictors of outcomes at twenty-five that were most robust across the cohort were not the ones that had received the most attention in the policy literature, a discrepancy that she had spent several years trying to understand and had eventually concluded was less about what the policy literature got wrong than about what it was trying to accomplish.","She argued that the concept of authenticity, which had become central to discussions of identity and self-presentation in contemporary culture, was philosophically incoherent not because there was no self to be authentic to but because the processes by which a self came into being were so thoroughly social that the distinction between the authentic self and its social construction could not be made in the way the concept required.","The geographer had spent his career studying the spatial organisation of economic activity and had found that the models that economists used to explain where things happened were good at predicting aggregate patterns and consistently poor at predicting specific cases, a limitation that the models themselves could not account for and that he had come to think reflected something genuinely difficult about the relationship between structure and contingency in economic geography.","He had trained as an engineer and had spent the last decade of his career studying how engineers made decisions under conditions of uncertainty, and had found that the formal decision procedures taught in engineering schools were rarely used in practice, not because engineers were irrational but because the formal procedures assumed a clarity about objectives and constraints that was almost never available in the situations where decisions actually had to be made.","The anthropologist had conducted fieldwork in communities on three continents and had found that the question that most consistently revealed the assumptions embedded in her own analytical framework was not any question about kinship or religion or exchange but the question of what counted as work, because the answers she got were so different from each other and from what her framework had led her to expect that she had eventually had to rewrite the framework rather than the data."],
    ["The sociologist of science had spent her career studying how scientific communities decided what counted as a sufficient demonstration of a result, and had found that the answer was not primarily a function of methodological standards applied consistently but of a negotiation between the standards and the significance of the result, in which more extraordinary claims required more extraordinary evidence and more ordinary claims could be established with considerably less, a dynamic that was rational in context and that made the standards appear inconsistent when viewed from outside.","He argued that the standard account of how professional norms developed in any given field was teleological in a way that was both historically inaccurate and practically misleading, because it treated the norms that existed as the outcome of a process of refinement toward an ideal rather than as the product of a series of contingent negotiations among parties with different interests, a distinction that mattered enormously for understanding both how the norms had come to be and how they might change.","The bioethicist had spent her career at the intersection of clinical practice and philosophical analysis and had found that the concepts developed in each domain were useful in the other but never straightforwardly transferable, because the precision that philosophical analysis required was incompatible with the speed that clinical practice demanded, and the practical wisdom that clinical practice developed was expressed in forms that philosophical analysis had difficulty evaluating without distorting.","She had spent fifteen years building a longitudinal database that was, by any measure, the most comprehensive resource available for addressing the questions her field was most interested in, and the single most important thing she had learned from building it was how much the questions the field was most interested in had been shaped by the kinds of data that had previously been available rather than by any independent assessment of what would be most important to know.","The economist had spent his career studying markets that did not work in the ways that standard models predicted, and had found that the most consistent explanation for the deviation was not information asymmetry or transaction costs or any of the other mechanisms that had been proposed in the theoretical literature, but something more basic, which was that the people participating in the markets did not experience them as markets and therefore did not behave like market participants."],
    ["The philosopher of mind had spent twenty-five years working on the problem of consciousness and had arrived at the view that the problem was not one problem but at least three, each of which could be made to seem like the others if the relevant concepts were used loosely enough, and that most of the apparent progress in the field had consisted of solutions to one of the three problems being presented as solutions to the others in ways that were persuasive to people who were not tracking the distinctions carefully.","She had studied the history of her discipline carefully enough to know that most of the methodological debates that consumed enormous quantities of professional energy in any given decade were resolved not by the production of decisive evidence but by the retirement of the generation that had initiated them, a finding that she found equally humbling about the discipline and about the processes by which knowledge actually accumulated within it.","The political economist had spent his career studying the relationship between economic institutions and political institutions and had found that the direction of causality ran in both directions simultaneously in ways that made it nearly impossible to assign priority to either, a finding that was both intellectually satisfying and practically frustrating because it implied that any reform strategy that addressed only one side of the relationship was probably insufficient.","He had spent his career developing tools for measuring things that were generally considered immeasurable and had found that the most important consequence of being able to measure something was not that it produced better decisions but that it changed what counted as a legitimate consideration in the first place, a dynamic that was sometimes beneficial and sometimes not and that he had never found a reliable way to anticipate in advance.","The historian had spent thirty years studying an institution that had been continuously operating for four centuries and had found that the most significant changes in how it functioned had come not from the dramatic reorganisations that appeared in its official history but from accumulating small adjustments in practice that had gradually displaced the formal rules without ever explicitly replacing them, a process she described as institutional drift and that she had come to think was probably the dominant mode of institutional change in most stable organisations."],
    ["The social psychologist had spent her career studying the conditions under which people were willing to revise beliefs they had held for a long time and had found that the standard model, in which evidence was the primary driver of belief revision, described a much smaller portion of actual belief change than the literature had assumed, and that the more important drivers were social in nature, involving changes in the composition of the groups whose views people attended to rather than changes in what those views were grounded in.","He had written a book arguing that the distinction between sincere and performative assertion, while philosophically important, had been applied in ways that systematically underestimated the degree to which most ordinary assertion was neither fully sincere nor fully performative but occupied a position somewhere between the two that existing conceptual frameworks were not well suited to describe.","The ecologist had spent her career studying ecosystems at the edge of transition, and had found that the most reliable indicator of an impending transition was not any single measurable variable but the increase in the variability of multiple variables simultaneously, a signal that was theoretically well-understood and practically very difficult to distinguish from normal fluctuation until the transition had already begun.","She had developed her argument over a decade of careful work and had presented it at dozens of conferences where it had been received with a combination of intellectual engagement and institutional resistance that she had eventually come to understand as informative not about the quality of the argument but about the degree to which accepting it would require acknowledging that a substantial body of prior work had been organised around a mistaken premise.","The cognitive scientist had spent his career studying how people solved problems that were too complex to be solved by any systematic procedure and had found that expertise in such domains consisted less in having better explicit knowledge than in having developed the ability to recognise when a particular approach was unlikely to work without being able to say why, a form of tacit knowledge that was extraordinarily difficult to teach and that was acquired almost exclusively through extended practice with feedback."],
    // 71-80: very hard words and complex structures
    ["The epistemological foundations of the research programme had been contested since its inception, not because the empirical work it produced was of poor quality but because the criteria for evaluating that quality were themselves dependent on theoretical commitments that different practitioners in the field did not share, a situation that had produced a literature of considerable internal sophistication and almost no capacity for resolving the disputes that had motivated it.","She had spent her career studying the relationship between institutional design and organisational behaviour and had found that the systems which performed most reliably were not the ones with the most sophisticated formal structures but the ones where the informal norms governing actual behaviour most closely tracked the formal rules, a finding that was simultaneously obvious and consistently ignored in institutional design practice.","The palaeontologist had spent decades working in a region that had yielded fewer significant discoveries than almost any other area of comparable extent, and had developed a theory about why this was so that, if correct, implied that the area contained the most important fossils of any site in the hemisphere, which were simply buried at a depth that made them inaccessible with current technology and funding constraints.","He had written extensively about the difficulties of translating between scientific and policy contexts and had arrived at the view that the problem was not primarily one of communication but of epistemology, in that the standards of evidence that were appropriate for scientific purposes and the standards of evidence that were appropriate for policy purposes were genuinely different and that trying to apply one set of standards in the other context produced systematic errors in both directions.","The archaeologist had developed a methodology for dating organic material that was more accurate than existing methods within certain temperature ranges and less accurate outside them, and the pattern of adoption of the methodology within her field had been almost perfectly predicted by whether practitioners worked in regions that fell inside or outside those ranges, which she found both entirely rational and faintly depressing as a study in how methodological choices were made."],
    ["The philosopher had spent a decade arguing for a position that most of her colleagues regarded as obviously false and had found that the most productive aspect of the exercise was not any progress she had made toward convincing them but the clarity she had developed about exactly which assumptions needed to be in place for her position to be obviously false, which turned out to be a considerably larger number of assumptions than the obviously-false verdict had implied.","She had studied the governance of international institutions for twenty years and had found that the most consequential feature of any institution was not its formal mandate or its procedural rules but the informal understandings among the small number of people who actually ran it about what the institution was really for, understandings that were rarely written down and that frequently diverged from the official account in ways that were important for understanding both how the institution behaved and why reform efforts so often failed to produce the results their architects had intended.","The molecular biologist had spent her career studying a mechanism that had been described in the literature for thirty years and had arrived at the conclusion that the description was wrong in a way that was difficult to demonstrate because the incorrect description made predictions that were correct in the experimental systems most commonly used to study the mechanism and only became distinguishable from the correct description in systems that were technically demanding enough that most researchers had not worked with them.","He argued that the standard account of how professions established and maintained the boundaries of their jurisdiction was accurate as a description of the strategies that professions used but systematically underestimated the degree to which those strategies succeeded only when they aligned with the interests of other powerful actors who had reasons of their own to prefer professional rather than market or state provision, and that understanding professional power required understanding these alliances rather than treating professional strategies as self-explanatory.","The historian of science had spent her career studying cases where scientific consensus had been wrong for extended periods and had found that the most reliable predictor of eventual revision was not the accumulation of anomalous evidence, which could be accommodated within existing frameworks indefinitely, but the appearance of a new framework that made the anomalies central rather than peripheral, which typically required both intellectual resources and social conditions that were not in place until they were."],
    ["The developmental economist had spent twenty years studying the conditions under which technological capabilities were successfully transferred between countries and had found that the standard model, which emphasised the role of foreign direct investment, intellectual property regimes, and technical assistance programmes, consistently overestimated the importance of these factors and consistently underestimated the importance of domestic institutional conditions that were rarely mentioned in the policy literature because they were difficult to measure and even more difficult to change through external intervention.","She had spent her career at the intersection of linguistics and cognitive science and had found that the two fields had been having an increasingly productive conversation for thirty years that had nonetheless been systematically hampered by the fact that each field was using the same terms to mean different things, a situation that could not be resolved by terminological agreement because the difference in usage reflected genuine theoretical disagreements about the nature of the phenomena under investigation.","The urban sociologist had spent fifteen years studying the consequences of large-scale urban regeneration and had found that the projects that were described by their advocates as producing mixed results and by their critics as producing negative ones were almost always producing both simultaneously for different groups of people, and that the disagreement about outcomes was less about what had happened than about which outcomes were treated as the ones that mattered.","He had spent his career developing theoretical frameworks for understanding phenomena that existing frameworks did not handle well and had found that the most difficult aspect of the work was not developing the frameworks, which was difficult, but communicating them to audiences whose training had equipped them very well to evaluate claims made within existing frameworks and not at all well to evaluate claims that required stepping outside them.","The immunologist had spent her career studying the mechanisms by which pathogens evaded immune responses and had found that the diversity of evasion strategies observed across different pathogen classes was much greater than existing theoretical accounts could explain, a finding that she suspected reflected not a fundamental inadequacy in the theory but a sampling bias in the pathogens that had been studied in sufficient detail to characterise their evasion strategies."],
    ["The constitutional scholar had spent thirty years studying the relationship between constitutional text and constitutional practice and had found that the text constrained practice less than formalists believed and more than political scientists typically acknowledged, and that the interesting question was not which side of this debate was correct but what determined the degree of constraint in any particular constitutional system at any particular moment in its history, a question that existing accounts of constitutional interpretation were not designed to answer.","She had spent her professional life studying the conditions under which cooperation emerged in situations where individual incentives pointed toward defection, and had found that the theoretical prediction, which was that cooperation would not emerge without external enforcement, was contradicted by a very large body of empirical evidence, and that the theoretical prediction survived in the face of this evidence primarily because the situations in which it was contradicted were classified as exceptions in ways that were themselves theoretically unsatisfying.","The physicist had spent twenty years working on a problem that was considered either fundamental or peripheral depending on whether you shared her view of which questions in the field were worth asking, and had produced a body of work that people who shared her view considered important and people who did not found difficult to evaluate because they lacked the context to know what it would mean if it turned out to be right.","He had trained as a historian and had spent the last fifteen years of his career working in a policy context, and the most important thing he had learned from the transition was that the questions that history was well suited to answer were rarely the questions that policy needed to answer, not because history was irrelevant to policy but because the temporal and causal structures of historical explanation and policy analysis were different in ways that were easy to misunderstand and difficult to articulate.","The sociologist had spent her career studying how organisations processed failure and had found that the most dangerous response to failure was not the one that attracted the most criticism, which was denial, but the one that attracted the least, which was the transformation of failure into a learning opportunity in ways that preserved the structural features of the organisation that had produced the failure in the first place."],
    ["The philosopher of mathematics had spent her career on the question of what mathematical objects were and had found that each of the major positions in the debate had resources for handling certain cases elegantly and was forced into increasingly complicated manoeuvres when confronted with others, a pattern she had come to think was not a defect in any particular position but a feature of the question itself, which might not have the kind of answer that would allow all the cases to be handled uniformly.","She had spent twenty years studying the relationship between professional training and professional judgement and had found that training was better at producing consistency than at producing accuracy, and that in domains where the correct answer was unknown the two properties were in tension in ways that professional culture typically resolved in favour of consistency, a resolution that was defensible but that made it very difficult for a professional community to update its practices in response to evidence that its collective judgements were systematically wrong.","The materials scientist had spent his career studying phenomena at scales too small to be observed directly, working instead from the indirect evidence provided by the instruments available to him, and had developed a view of scientific knowledge in which what was known was always indexed to the resolution of the instruments, a view that his colleagues found either appropriately humble or unnecessarily limiting depending on how urgently they felt the need for results that could be communicated to non-specialists.","He had spent his career studying the politics of international environmental agreements and had found that the agreements that were actually implemented were not generally the ones that were most environmentally ambitious but the ones that had been designed with the political sustainability of implementation in mind from the beginning, a finding that was theoretically straightforward and that practitioners in the field consistently ignored in the design of new agreements.","The cognitive neuroscientist had spent her career studying what happened in the brain during the kinds of creative work that appeared to involve sudden insight, and had found that the neural signature of insight was less distinctive than the phenomenology suggested, in that the brain states associated with reported insight were not qualitatively different from those associated with more incremental forms of problem-solving but were quantitatively different in ways that suggested the subjective experience of sudden understanding was more a function of how the process was interpreted after the fact than of anything that had happened during it."],
    // 81-90: hardest - very long, complex vocabulary
    ["The epistemologist had spent her career working on the problem of the reliability of testimony and had found that the standard accounts, which treated testimony as a source of belief that was either always prima facie justified or always in need of positive corroboration, were both inadequate to the diversity of testimonial situations that actually arose, and that a satisfactory account would need to be sensitive to the features of the testifying context in ways that required a degree of theoretical complexity that had not yet been achieved but that she thought was in principle achievable.","He had spent his career studying the institutional conditions under which expert knowledge was successfully incorporated into public decision-making and had found that the factor most consistently correlated with successful incorporation was not the quality of the expert knowledge or the sophistication of the institutional mechanisms for accessing it but the degree to which decision-makers had developed the capacity to ask useful questions, a capacity that was rarely developed systematically and that appeared to require sustained engagement with substantive uncertainty rather than simply exposure to expert opinion.","The historian had spent thirty years studying the relationship between economic and political change in a region where both had been unusually rapid and had found that the causal story, which was supposed to run from economic to political change, was considerably more complicated than either the economic or the political historians of the region had acknowledged, because the economic changes had been in significant part produced by political choices that had been made for reasons that had nothing to do with economics, a circularity that neither discipline had theoretical resources to handle.","She had spent her career developing methods for studying phenomena that were too complex to be studied using the methods that her discipline had developed for studying simpler phenomena, and had found that the most important consequence of the methodological development was not any particular result it had made possible but the change it had produced in what counted as a well-formed question, because the new methods made some questions tractable that had been intractable and revealed that some questions that had seemed tractable were actually not.","The political philosopher had spent twenty years arguing for a position on distributive justice that most of her colleagues regarded as either too demanding or not demanding enough depending on their prior commitments, and had found that the most informative responses to her work were not the ones that engaged directly with the argument but the ones that objected to the framing, because the framing objections revealed which background assumptions people were not prepared to treat as negotiable, which was more fundamental information than any response to the argument itself could provide."],
    ["The developmental biologist had spent her career studying the mechanisms by which a single fertilised cell gave rise to the complexity of a mature organism, and had found that the most important conceptual shift in her field over the period of her career had been away from the idea that the developmental programme was encoded in the genome and toward the idea that it was distributed across the genome, the cytoplasm, and the environment in ways that made the metaphor of a programme significantly less illuminating than it had initially seemed, though the field had not yet developed a better metaphor to replace it with.","He had spent his career studying the relationship between formal and informal institutions and had found that the most important finding from the empirical literature was not about the relative importance of the two types but about the conditions under which informal institutions reproduced themselves in ways that stabilised formal institutions and the conditions under which they reproduced themselves in ways that undermined them, a distinction that the theoretical literature had discussed extensively but that empirical researchers had found very difficult to operationalise in ways that produced reliable findings.","The philosopher of action had spent twenty years arguing that the standard accounts of the relationship between intention and action were inadequate because they treated intention as a mental state that preceded action and caused it, whereas a more accurate account would treat intention and action as aspects of a single complex phenomenon that could only be fully understood by attending to both simultaneously, a position that was difficult to argue for without being misread as either eliminating the distinction between intention and action or reducing action to a form of intentional content.","She had spent her career at the intersection of economics and political science and had found that the most productive exchanges between the two disciplines had happened not when each had tried to import the other's methods but when practitioners in each had taken seriously the other's accounts of which aspects of the phenomena under investigation were most important to explain, because the disciplinary differences in what counted as a satisfying explanation were themselves informative about the phenomena.","The systems theorist had spent his career developing formal models of phenomena that could not be adequately described by the analytical tools available within any single discipline, and had found that the most difficult aspect of the work was not the formal modelling, which was technically demanding but tractable, but the prior question of how to specify the boundaries of the system being modelled in ways that were neither too narrow, which produced models that were formally tractable but substantively irrelevant, nor too broad, which produced models that were substantively relevant but formally intractable."],
    ["The moral philosopher had spent her career on the relationship between moral theory and moral practice and had found that the accounts of this relationship that circulated among professional philosophers were considerably more optimistic than the historical and empirical evidence warranted, not because moral theory had had no influence on practice but because its influence had been so thoroughly mediated by institutional, cultural, and political factors that tracing a direct line from theoretical development to practical change was nearly impossible, and the apparent cases where such a line could be traced typically dissolved under scrutiny into much more complicated stories.","He had spent his career studying the conditions under which scientific communities changed their collective views on contested questions and had found that the standard philosophical accounts, which emphasised the role of evidence and rational persuasion, described a much smaller portion of actual belief change than the sociological accounts, which emphasised the role of social structure and professional incentives, but that the sociological accounts in their turn underestimated the degree to which the social and professional factors themselves operated through the mediation of epistemic considerations rather than in spite of them.","The historian of philosophy had spent twenty years studying a figure who was universally acknowledged as important but whose importance was understood in incompatible ways by different scholarly traditions, and had found that the incompatibility was not primarily a function of reading the texts differently but of treating different questions as the central ones, a situation that made adjudication between the traditions very difficult because the choice of central question was prior to any interpretive disagreement about the texts themselves.","She had spent her career developing a theoretical account of how institutions reproduced themselves over time and had found that the account that emerged from her research was considerably more agency-sceptical than the one she had started with, not because she had become convinced that institutional structures were determinative of individual behaviour but because the evidence consistently showed that the opportunities for effective agency were much more constrained and much less evenly distributed than liberal accounts of institutional change had assumed.","The cognitive linguist had spent thirty years studying the relationship between language and thought and had arrived at a position that was simultaneously more and less Whorfian than either the proponents or the critics of the Sapir-Whorf hypothesis typically assumed, because the evidence supported a version of the hypothesis that was domain-specific and gradient rather than general and categorical, a version that was less dramatic than the strong hypothesis but more interesting than the null hypothesis that most of her contemporaries had converged on, and that required keeping careful track of distinctions that both sides of the debate had found it convenient to collapse."]
];

// =============================================
// LEVEL DEFINITIONS (90 levels)
// =============================================
function makeLevels() {
    const names = [
        "First Steps","Warming Up","Getting There","Building Speed","Finding Rhythm",
        "Picking Up Pace","Steady Hands","Getting Serious","Smooth Operator","Double Digits",
        "Consistent","In The Zone","Locked In","Sharp Focus","Halfway There",
        "Pushing Further","Building Fluency","Accelerating","Strong And Steady","Twenty Down",
        "Elite Territory","High Precision","Near Mastery","Advanced","Expert",
        "Formidable","Relentless","Unstoppable","Legendary","TypeBallad Master",
        "Ignition","Raw Power","Surge","Momentum","Full Throttle",
        "Unstuck","Rolling","Breakneck","Avalanche","Fifty Down",
        "Calibrated","Locked On","Overclocked","Precision Pilot","Tuned",
        "Signal Clear","Deep Run","Terminal Velocity","No Ceiling","Halfway To Elite",
        "Keymaster","Word Architect","Syntax Storm","Scholar","Lexicon",
        "Clarity","Axiom","Theorem","Compendium","Sixty Down",
        "Luminary","Virtuoso","Echelon","Pinnacle","Transcendent",
        "Sovereign","Apex","Crystalline","Cerebral","Seventy Down",
        "Aberrant","Asymptote","Clandestine","Cryptic","Labyrinthine",
        "Omniscient","Paradox","Resonance","Singularity","Eighty Down",
        "Philosopher","Archivist","Chronicle","Codex","Doctrine",
        "Enigma","Fractal","Genesis","Harmonic","TypeBallad Legend"
    ];
    const levels = [];
    for (let i = 0; i < 90; i++) {
        const n = i + 1;
        // WPM targets scale from 15 to 120
        const wpmFull = Math.round(15 + (105 / 89) * i);
        // Accuracy targets scale from 80 to 99
        const accFull = Math.min(99, Math.round(80 + (19 / 89) * i));
        // Star thresholds scale with level
        const base = n * 1.5;
        const starThresholds = [
            Math.round(base * 3),
            Math.round(base * 7),
            Math.round(base * 13),
            Math.round(base * 20)
        ];
        levels.push({
            id: n,
            name: names[i] || `Level ${n}`,
            texts: sentencePools[Math.min(i, sentencePools.length - 1)],
            starThresholds,
            wpmFull,
            accFull
        });
    }
    return levels;
}
const levels = makeLevels();

// =============================================
// WORD DIFFICULTY BY LEVEL
// =============================================
function getWordPoolForLevel(levelIdx) {
    if (levelIdx <= 9)  return wordPools.tier1;
    if (levelIdx <= 19) return wordPools.tier2;
    if (levelIdx <= 29) return wordPools.tier3;
    if (levelIdx <= 39) return wordPools.tier4;
    if (levelIdx <= 49) return wordPools.tier5;
    if (levelIdx <= 59) return wordPools.tier6;
    if (levelIdx <= 69) return wordPools.tier7;
    if (levelIdx <= 79) return wordPools.tier8;
    return wordPools.tier9;
}

// Song duration (in seconds) -> word count for music mode
// Roughly: 1 word per 3 seconds of song, with level difficulty scaling
function getWordCountFromDuration(durationSec, levelIdx) {
    const base     = Math.max(8, Math.round(durationSec / 3));
    // Higher levels get more words per second (harder)
    const factor   = 1 + (levelIdx / 89) * 1.5;
    const count    = Math.round(base * factor);
    return Math.min(120, Math.max(8, count));
}

// Build a passage from individual words for music mode
function buildMusicModeText(durationSec, levelIdx) {
    const pool  = getWordPoolForLevel(levelIdx);
    const count = getWordCountFromDuration(durationSec, levelIdx);
    const words = [];
    for (let i = 0; i < count; i++) {
        words.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return words.join(' ');
}

const successMsg   = ["Great job!","You're on fire!","Absolutely crushing it!","Nailed it!","Keep it up!","You're a natural!","Unstoppable!","That was smooth!","Legendary typing!","You're built different!","Chef's kiss!","Flawless!","On a roll!","Too easy for you!","Speed demon!","Born to type!","No mistakes, no mercy!","Fingers of fury!","Keyboard warrior!","You make it look easy!","Straight up elite!","That's what I'm talking about!","Phenomenal!","Crispy clean!","Absolutely unreal!","The keyboard fears you!","Not even close!","Certified typist!","Go again, I dare you!","That run was clean!"];
const encourageMsg = ["Keep going!","You've got this!","Don't give up!","Almost there!","Stay focused!","Every rep counts!","Push through it!","You're improving!","Believe in yourself!","One key at a time!","Stay in the zone!","You're getting better!","Lock in!","Channel your inner typist!","Breathe and focus!","Consistency is key!","You're so close!","Trust the process!","Keep your eyes on the screen!","Shake it off and go again!","Progress over perfection!","Stay sharp!","You were built for this!","Don't slow down now!","Grind time!","Less thinking, more typing!","Find your rhythm!","Block out the noise!","Fingers don't fail me now!","Reset and go harder!"];
const slowMsg      = ["Slow down a little!","Accuracy over speed!","Take your time!","Don't rush it!","Breathe and type!","Slow is smooth, smooth is fast!","One character at a time!","Speed means nothing without accuracy!","Relax your fingers!","Quality over quantity!","Less haste, more accuracy!","You're fumbling, slow down!","Reset your pace!","Precision first, speed later!","Stop rushing!","Calm down and focus!","Slow it down a notch!","Your fingers are ahead of your brain!","Think before you type!","Patience is a skill too!","Slow down and lock in!","You're overthinking it, breathe!","Control the pace!","Accuracy is your friend!","Don't let your fingers run wild!","Type with intention!","Slow down, you're making errors!","Cool it, focus up!","Let your brain catch up!","Slow hands, clean run!"];

// =============================================
// DOM
// =============================================
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
const stageGlow      = $('stageGlow');
const liveWpmEl      = $('liveWpm');
const gameScreenEl   = $('gameScreen');
const progressFill   = $('progressFill');
const songInfoRow    = $('songInfoRow');
const songInfoText   = $('songInfoText');

// =============================================
// SCREEN MANAGER
// =============================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
}

// =============================================
// PROFILE
// =============================================
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

// =============================================
// LEVEL GRID
// =============================================
function buildGrid() {
    const pr = getProgress(), p = getProfile();
    levelGrid.innerHTML = '';
    if (p) { renderAv(levelAvatar, p); levelUsername.textContent = p.name; }

    // Create tier section headers
    const tierLabels = {0:'Beginner',10:'Novice',20:'Intermediate',30:'Advanced',40:'Skilled',
                        50:'Expert',60:'Elite',70:'Master',80:'Legend'};

    levels.forEach((lv, i) => {
        if (tierLabels[i]) {
            const hdr = document.createElement('div');
            hdr.className = 'tier-header';
            hdr.textContent = tierLabels[i];
            levelGrid.appendChild(hdr);
        }
        const locked = i >= pr.unlocked;
        const saved  = pr.stars[i] || 0;
        const card   = document.createElement('div');
        card.className = 'level-card' + (locked ? ' locked' : '') + (saved > 0 ? ' completed' : '');
        let sh = '';
        for (let j = 1; j <= 5; j++) sh += `<i class="fa-solid fa-star ${j <= saved ? 'earned' : ''}"></i>`;
        card.innerHTML = `<div class="level-num">${lv.id}</div><div class="level-name">${lv.name}</div><div class="card-stars">${sh}</div>`;
        if (!locked) card.addEventListener('click', () => openPreGame(i));
        levelGrid.appendChild(card);
    });
}

// =============================================
// PRE GAME
// =============================================
function openPreGame(i) {
    pendingLevelIndex = i;
    if (droppedMusicBuffer) {
        dropZone.classList.add('loaded');
        dropLabel.textContent = 'music loaded -- drop to change';
        startWithMusic.disabled = false;
        updateSongInfo();
    } else {
        dropZone.classList.remove('loaded');
        dropLabel.textContent = 'drag & drop an MP3';
        startWithMusic.disabled = true;
        songInfoRow.style.display = 'none';
    }
    preGameTitle.textContent = `Level ${levels[i].id} -- ${levels[i].name}`;
    showScreen('preGame');
}

function updateSongInfo() {
    if (!droppedMusicBuffer) { songInfoRow.style.display = 'none'; return; }
    const dur = droppedMusicBuffer.duration;
    const wc  = getWordCountFromDuration(dur, pendingLevelIndex);
    const mins = Math.floor(dur / 60), secs = Math.round(dur % 60);
    songInfoText.textContent = `${mins}:${String(secs).padStart(2,'0')} song  --  ~${wc} words to type`;
    songInfoRow.style.display = 'flex';
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
    dropLabel.textContent = `Loading ${file.name}...`;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    try {
        const buf = await file.arrayBuffer();
        droppedMusicBuffer = await audioCtx.decodeAudioData(buf);
        dropLabel.textContent = `${file.name}`;
        dropZone.classList.add('loaded');
        startWithMusic.disabled = false;
        updateSongInfo();
    } catch(e) {
        dropLabel.textContent = 'Could not load file -- try another MP3';
        droppedMusicBuffer = null;
        startWithMusic.disabled = true;
        songInfoRow.style.display = 'none';
    }
}

startWithMusic.addEventListener('click', () => startLevel(pendingLevelIndex, droppedMusicBuffer));
skipMusic.addEventListener('click',       () => startLevel(pendingLevelIndex, null));
preGameBack.addEventListener('click',     () => { buildGrid(); showScreen('levelSelect'); });

// =============================================
// TIMER
// =============================================
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

// =============================================
// CAROUSEL
// =============================================
function buildCarousel(text) {
    carouselTrack.innerHTML = '';
    charRandom = text; charIndex = 0;
    for (let i = 0; i < text.length; i++) {
        const s  = document.createElement('span');
        const ch = text[i];
        s.className   = 'cl' + (ch === ' ' ? ' sp' : '');
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        s.dataset.i   = i;
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
    for (let i = 0; i < charIndex; i++) offset += letters[i].offsetWidth + 2;
    const lw       = letters[charIndex].offsetWidth;
    const trackLeft = carouselTrack.parentElement.getBoundingClientRect().left;
    const cx       = (window.innerWidth / 2) - trackLeft - offset - (lw / 2);
    carouselTrack.style.transform = `translateX(${cx}px)`;
    // Update progress bar
    progressFill.style.width = (charIndex / charRandom.length * 100) + '%';
}

function highlightCurrent() {
    carouselTrack.querySelectorAll('.cl').forEach((l, i) => {
        if (l.classList.contains('ok') || l.classList.contains('err')) return;
        l.classList.toggle('cur', i === charIndex);
    });
}

// =============================================
// FLOATING SCORES
// =============================================
function spawnFloat(txt, pos, x, y) {
    const el = document.createElement('div');
    el.className = 'fn ' + (pos ? 'pos' : 'neg');
    el.textContent = txt;
    el.style.cssText = `left:${x}px;top:${y}px`;
    floatingScores.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

// =============================================
// STREAK
// =============================================
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
    el.textContent = `${n} streak!`;
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
    const stage = document.querySelector('.stage');
    stage.style.animation = 'none';
    void stage.offsetWidth;
    stage.style.animation = 'stageShake 0.4s ease';
}

// =============================================
// START LEVEL
// =============================================
async function startLevel(idx, musicBuf) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    currentLevelIndex = idx;
    score = 0; streak = 0; charIndex = 0; correctCount = 0;
    scoreDisplay.textContent = '0';
    streakCount.textContent  = '0';
    streakDisplay.classList.remove('hot');
    textArea.value = ''; gameActive = true; lastLength = 0;
    liveWpmEl.textContent = '0';
    progressFill.style.width = '0%';

    let text;
    if (musicBuf) {
        // Music mode: word-based passage derived from song duration
        text = buildMusicModeText(musicBuf.duration, idx);
        playMusicContinuous(musicBuf);
        keepMusicAlive();
    } else {
        // No music: use sentence pool
        const pool = levels[idx].texts;
        text = pool[Math.floor(Math.random() * pool.length)];
        stopMusic();
    }

    buildCarousel(text);
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

// =============================================
// TYPING
// =============================================
textArea.addEventListener('input', () => {
    if (!gameActive) return;
    const val     = textArea.value;
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
            stageGlow.style.opacity   = '1';
            stageGlow.style.transform = 'translate(-50%,-50%) scale(1.1)';
            setTimeout(() => { stageGlow.style.opacity = ''; stageGlow.style.transform = ''; }, 200);
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

// =============================================
// RESULTS
// =============================================
function showResults() {
    const lv      = levels[currentLevelIndex];
    const correct = carouselTrack.querySelectorAll('.ok').length;
    const total   = carouselTrack.querySelectorAll('.cl').length;
    const acc     = Math.round((correct / total) * 100);
    WPM      = elapsedSeconds > 0 ? Math.round((correct / 5) / (elapsedSeconds / 60)) : 0;
    newScore = WPM * acc / 100;

    const msg = Math.round((score / total) * 100);
    finishedTitle.textContent =
        msg >= 80  ? successMsg  [Math.floor(Math.random()*successMsg.length)]   :
        acc >= 50  ? encourageMsg[Math.floor(Math.random()*encourageMsg.length)] :
                     slowMsg     [Math.floor(Math.random()*slowMsg.length)];

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

// =============================================
// INJECTED KEYFRAMES
// =============================================
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

// =============================================
// BUTTON WIRING
// =============================================
$('enter').addEventListener('click',    () => { buildGrid(); showScreen('levelSelect'); });
backToHomeBtn.addEventListener('click', () => showScreen('access'));
backBtn.addEventListener('click',       () => { stopTimer(); stopMusic(); gameActive = false; buildGrid(); showScreen('levelSelect'); });
gameLoopBtn.addEventListener('click',   () => { wpmFill.style.width='0%'; accFill.style.width='0%'; startLevel(currentLevelIndex, droppedMusicBuffer); });
nextLevelBtn.addEventListener('click',  () => { wpmFill.style.width='0%'; accFill.style.width='0%'; startLevel(currentLevelIndex + 1, droppedMusicBuffer); });
backToMenuBtn.addEventListener('click', () => { wpmFill.style.width='0%'; accFill.style.width='0%'; buildGrid(); showScreen('levelSelect'); });
$('changeMusic').addEventListener('click', () => { wpmFill.style.width='0%'; accFill.style.width='0%'; openPreGame(currentLevelIndex); });

// =============================================
// INIT
// =============================================
(function init() {
    const p = getProfile();
    if (!p) showScreen('profileSetup');
    else { loadHome(); showScreen('access'); }
})();
