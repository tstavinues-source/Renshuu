import { db } from './firebase-config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const urlParams = new URLSearchParams(window.location.search);
const currentMode = urlParams.get('mode') || 'kanji-arti'; 

let fullData = [];
let currentQuestion = {};
let score = 0;
let streak = 0;
let timer;
let timeLeft = 10;

const flashcard = document.getElementById('flashcard');
const flashcardAnswer = document.getElementById('flashcardAnswer');
const questionText = document.getElementById('questionText');
const questionHint = document.getElementById('questionHint');
const timerBar = document.getElementById('timerBar');
const timerWrapper = document.getElementById('timerWrapper');
const optionsGrid = document.getElementById('optionsGrid');
const trueFlashcardControls = document.getElementById('trueFlashcardControls');
const buttons = [
    document.getElementById('opt0'), document.getElementById('opt1'),
    document.getElementById('opt2'), document.getElementById('opt3')
];

document.getElementById('btnExit').addEventListener('click', () => { window.location.href = 'index.html'; });

async function loadData() {
    const dbRef = ref(db);
    try {
        const [kanjiSnap, tangoSnap] = await Promise.all([ get(child(dbRef, `renshuu/kanji`)), get(child(dbRef, `renshuu/tango`)) ]);
        let kanjiData = kanjiSnap.exists() ? kanjiSnap.val() : [];
        let tangoData = tangoSnap.exists() ? tangoSnap.val() : [];
        tangoData = tangoData.map(item => ({ id: item.id + 1000, kanji: item.kata, hiragana: item.hiragana, arti: item.arti }));
        
        let allData = [...kanjiData, ...tangoData].filter(item => item !== null && item !== undefined);
        
        // FILTER: Buang item yang sudah dihafal
        let hiddenIds = JSON.parse(localStorage.getItem('renshuu_hidden_ids')) || [];
        fullData = allData.filter(item => !hiddenIds.includes(item.id));

        document.getElementById('loadingScreen').style.display = 'none';

        if (fullData.length === 0) {
            document.getElementById('resultScreen').style.display = 'block';
            document.getElementById('emptyMessage').innerText = "Luar biasa! Kamu sudah menghafal SEMUA kosakata di database.";
            return;
        }

        document.getElementById('quizArea').style.display = 'block';

        // Setup UI untuk True Flashcard
        if (currentMode === 'true-flashcard') {
            optionsGrid.style.display = 'none';
            timerWrapper.style.display = 'none';
            trueFlashcardControls.style.display = 'flex';
            document.querySelector('.score-board').style.display = 'none'; // Sembunyikan skor di mode ini
        }

        nextQuestion();
    } catch (error) {
        document.getElementById('loadingScreen').innerHTML = "<p style='color:red;'>Gagal terhubung.</p>";
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function nextQuestion() {
    // Jika data habis di tengah sesi True Flashcard
    if (fullData.length === 0) {
        document.getElementById('quizArea').style.display = 'none';
        document.getElementById('resultScreen').style.display = 'block';
        document.getElementById('emptyMessage').innerText = "Semua kosakata sudah dikuasai!";
        return;
    }

    currentQuestion = fullData[Math.floor(Math.random() * fullData.length)];

    if (currentMode === 'true-flashcard') {
        questionHint.innerText = 'Apa cara baca & artinya?';
        questionText.innerText = currentQuestion.kanji;
        flashcardAnswer.style.display = 'none';
        document.getElementById('btnReveal').style.display = 'block';
        document.getElementById('nextCardControls').style.display = 'none';
    } else {
        // Logika Pilihan Ganda (seperti sebelumnya)
        resetTimer();
        buttons.forEach(btn => { btn.className = "option-btn"; btn.disabled = false; });
        let askProp, answerProp, hintStr;
        if (currentMode === 'kanji-arti') { askProp = 'kanji'; answerProp = 'arti'; hintStr = 'Apa Arti dari:'; } 
        else if (currentMode === 'kanji-hiragana') { askProp = 'kanji'; answerProp = 'hiragana'; hintStr = 'Cara bacanya:'; } 
        else if (currentMode === 'hiragana-arti') { askProp = 'hiragana'; answerProp = 'arti'; hintStr = 'Apa Arti dari:'; }

        questionHint.innerText = hintStr;
        questionText.innerText = currentQuestion[askProp];

        let options = [currentQuestion[answerProp]];
        while (options.length < 4) {
            let randomWrong = fullData[Math.floor(Math.random() * fullData.length)][answerProp];
            if (!options.includes(randomWrong)) options.push(randomWrong);
        }
        options = shuffleArray(options);
        buttons.forEach((btn, index) => {
            btn.innerText = options[index];
            btn.onclick = () => checkAnswer(btn, options[index] === currentQuestion[answerProp]);
        });
        startTimer();
    }
}

// Logika Interaksi True Flashcard
document.getElementById('btnReveal').addEventListener('click', revealCard);
flashcard.addEventListener('click', () => { if (currentMode === 'true-flashcard') revealCard(); });

function revealCard() {
    if (currentMode !== 'true-flashcard' || flashcardAnswer.style.display === 'block') return;
    document.getElementById('answerHiragana').innerText = currentQuestion.hiragana;
    document.getElementById('answerArti').innerText = currentQuestion.arti;
    flashcardAnswer.style.display = 'block';
    
    document.getElementById('btnReveal').style.display = 'none';
    document.getElementById('nextCardControls').style.display = 'flex';
}

document.getElementById('btnNextCard').addEventListener('click', nextQuestion);
document.getElementById('btnMarkLearned').addEventListener('click', () => {
    // Tambahkan ke Local Storage lalu lanjut
    let hiddenIds = JSON.parse(localStorage.getItem('renshuu_hidden_ids')) || [];
    hiddenIds.push(currentQuestion.id);
    localStorage.setItem('renshuu_hidden_ids', JSON.stringify(hiddenIds));
    
    // Buang dari array sesi ini agar tidak keluar lagi
    fullData = fullData.filter(item => item.id !== currentQuestion.id);
    nextQuestion();
});

// Pilihan Ganda Check Answer & Timer (Sama seperti sebelumnya)
function checkAnswer(clickedBtn, isCorrect) {
    clearInterval(timer);
    buttons.forEach(btn => btn.disabled = true);
    if (isCorrect) {
        clickedBtn.classList.add('correct'); flashcard.style.borderColor = "#00ff00"; streak++;
        score += (10 + (streak * 2) + Math.floor(timeLeft));
    } else {
        clickedBtn.classList.add('wrong'); flashcard.style.borderColor = "#ff0000"; streak = 0;
        buttons.forEach(btn => {
            let correctAns = (currentMode === 'kanji-arti' || currentMode === 'hiragana-arti') ? currentQuestion.arti : currentQuestion.hiragana;
            if (btn.innerText === correctAns) btn.classList.add('correct');
        });
    }
    document.getElementById('scoreDisplay').innerText = `💎 ${score}`;
    document.getElementById('streakDisplay').innerText = `🔥 Streak: ${streak}`;
    setTimeout(() => { flashcard.style.borderColor = "var(--neon-purple)"; nextQuestion(); }, 1500);
}

function startTimer() {
    timeLeft = 10; timerBar.style.width = '100%'; timerBar.classList.remove('warning');
    timer = setInterval(() => {
        timeLeft -= 0.1; timerBar.style.width = (timeLeft / 10) * 100 + '%';
        if (timeLeft <= 3) timerBar.classList.add('warning');
        if (timeLeft <= 0) { clearInterval(timer); buttons[0].click(); }
    }, 100);
}

function resetTimer() {
    clearInterval(timer); timerBar.style.transition = 'none'; timerBar.style.width = '100%';
    setTimeout(() => { timerBar.style.transition = 'width 1s linear'; }, 50);
}

document.getElementById('btnBackToMenu').addEventListener('click', () => {
    let currentTotal = parseInt(localStorage.getItem('renshuu_points')) || 0;
    localStorage.setItem('renshuu_points', currentTotal + score);
    window.location.href = 'index.html';
});

window.onload = loadData;
