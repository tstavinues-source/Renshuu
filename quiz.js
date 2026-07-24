// quiz.js
import { db } from './firebase-config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Mengambil mode dari URL (misal: ?mode=kanji-arti)
const urlParams = new URLSearchParams(window.location.search);
const currentMode = urlParams.get('mode') || 'kanji-arti'; 

let fullData = [];       // Menyimpan seluruh data kuis
let currentQuestion = {}; // Data soal saat ini
let score = 0;
let streak = 0;
let timer;
let timeLeft = 10;       // 10 Detik per soal

const flashcard = document.getElementById('flashcard');
const questionText = document.getElementById('questionText');
const questionHint = document.getElementById('questionHint');
const timerBar = document.getElementById('timerBar');
const buttons = [
    document.getElementById('opt0'),
    document.getElementById('opt1'),
    document.getElementById('opt2'),
    document.getElementById('opt3')
];

// Tombol Keluar
document.getElementById('btnExit').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Fungsi Mengambil Data dari Firebase
async function loadData() {
    const dbRef = ref(db);
    try {
        // Mengambil Kanji dan Tango secara bersamaan
        const [kanjiSnapshot, tangoSnapshot] = await Promise.all([
            get(child(dbRef, `renshuu/kanji`)),
            get(child(dbRef, `renshuu/tango`))
        ]);

        let kanjiData = kanjiSnapshot.exists() ? kanjiSnapshot.val() : [];
        let tangoData = tangoSnapshot.exists() ? tangoSnapshot.val() : [];
        
        // Menyamakan format (Tango menggunakan 'kata', kita ubah propertinya jadi 'kanji' agar seragam)
        tangoData = tangoData.map(item => ({
            id: item.id + 1000, // ID dibedakan
            kanji: item.kata, 
            hiragana: item.hiragana,
            arti: item.arti
        }));

        // Gabungkan semua data
        fullData = [...kanjiData, ...tangoData].filter(item => item !== null && item !== undefined);

        // Sembunyikan loading, Tampilkan kuis
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('quizArea').style.display = 'block';

        nextQuestion();

    } catch (error) {
        console.error("Gagal memuat data:", error);
        document.getElementById('loadingScreen').innerHTML = "<p style='color:red;'>Gagal terhubung ke database. Periksa koneksi/aturan Firebase.</p>";
    }
}

// Fungsi Mengacak Array (Algoritma Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Memuat soal selanjutnya
function nextQuestion() {
    resetTimer();
    
    // Hapus kelas warna pada tombol
    buttons.forEach(btn => {
        btn.className = "option-btn"; 
        btn.disabled = false;
    });

    // Pilih 1 data acak sebagai soal utama
    currentQuestion = fullData[Math.floor(Math.random() * fullData.length)];
    
    // Tentukan Properti Pertanyaan & Jawaban berdasarkan Mode
    let askProp, answerProp, hintStr;

    // Jika mode flashcard, acak modenya per soal
    let modeToUse = currentMode;
    if (currentMode === 'flashcard') {
        const modes = ['kanji-arti', 'kanji-hiragana', 'hiragana-arti'];
        modeToUse = modes[Math.floor(Math.random() * modes.length)];
    }

    if (modeToUse === 'kanji-arti') {
        askProp = 'kanji'; answerProp = 'arti'; hintStr = 'Apa Arti dari:';
    } else if (modeToUse === 'kanji-hiragana') {
        askProp = 'kanji'; answerProp = 'hiragana'; hintStr = 'Cara bacanya:';
    } else if (modeToUse === 'hiragana-arti') {
        askProp = 'hiragana'; answerProp = 'arti'; hintStr = 'Apa Arti dari:';
    }

    // Tampilkan Pertanyaan
    questionHint.innerText = hintStr;
    questionText.innerText = currentQuestion[askProp];

    // Buat Pilihan Ganda (1 Benar + 3 Salah)
    let options = [currentQuestion[answerProp]];
    while (options.length < 4) {
        let randomWrong = fullData[Math.floor(Math.random() * fullData.length)][answerProp];
        if (!options.includes(randomWrong)) {
            options.push(randomWrong);
        }
    }

    // Acak posisi pilihan ganda
    options = shuffleArray(options);

    // Tampilkan teks ke tombol dan pasang Event Listener
    buttons.forEach((btn, index) => {
        btn.innerText = options[index];
        btn.onclick = () => checkAnswer(btn, options[index] === currentQuestion[answerProp]);
    });

    startTimer();
}

// Mengecek Jawaban
function checkAnswer(clickedBtn, isCorrect) {
    clearInterval(timer); // Hentikan waktu
    
    // Matikan semua tombol agar tidak bisa diklik dua kali
    buttons.forEach(btn => btn.disabled = true);

    if (isCorrect) {
        clickedBtn.classList.add('correct');
        flashcard.style.borderColor = "#00ff00"; // Efek glow hijau
        streak++;
        
        // Perhitungan Skor Dinamis: Poin dasar 10 + Bonus Streak + Bonus Sisa Waktu
        let pointsEarned = 10 + (streak * 2) + Math.floor(timeLeft);
        score += pointsEarned;
        
    } else {
        clickedBtn.classList.add('wrong');
        flashcard.style.borderColor = "#ff0000"; // Efek glow merah
        streak = 0; // Reset streak
        
        // Beri tahu mana jawaban yang benar
        buttons.forEach(btn => {
            let correctAns = (currentMode === 'kanji-arti' || currentMode === 'hiragana-arti') ? currentQuestion.arti : currentQuestion.hiragana;
            if (btn.innerText === correctAns) {
                btn.classList.add('correct');
            }
        });
    }

    // Update UI Skor
    document.getElementById('scoreDisplay').innerText = `💎 ${score}`;
    document.getElementById('streakDisplay').innerText = `🔥 Streak: ${streak}`;

    // Lanjut ke soal berikutnya setelah 1.5 detik
    setTimeout(() => {
        flashcard.style.borderColor = "var(--neon-purple)"; // Kembalikan warna asli
        nextQuestion();
    }, 1500);
}

// Sistem Timer (Waktu Mundur)
function startTimer() {
    timeLeft = 10;
    timerBar.style.width = '100%';
    timerBar.classList.remove('warning');

    timer = setInterval(() => {
        timeLeft -= 0.1;
        let percentage = (timeLeft / 10) * 100;
        timerBar.style.width = percentage + '%';

        if (timeLeft <= 3) {
            timerBar.classList.add('warning'); // Berubah merah saat mau habis
        }

        if (timeLeft <= 0) {
            clearInterval(timer);
            // Anggap salah jika waktu habis
            buttons[0].click(); 
        }
    }, 100);
}

function resetTimer() {
    clearInterval(timer);
    timerBar.style.transition = 'none'; // Matikan animasi sementara agar garis langsung penuh
    timerBar.style.width = '100%';
    setTimeout(() => { timerBar.style.transition = 'width 1s linear'; }, 50); // Nyalakan lagi
}

// Tombol Kembali ke Menu saat ingin selesai (Simpan Skor)
document.getElementById('btnBackToMenu').addEventListener('click', () => {
    let currentTotal = parseInt(localStorage.getItem('renshuu_points')) || 0;
    localStorage.setItem('renshuu_points', currentTotal + score);
    window.location.href = 'index.html';
});

// Mulai Aplikasi saat pertama kali halaman terbuka
window.onload = loadData;
