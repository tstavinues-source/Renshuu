import { db } from './firebase-config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==========================================
// KOTOBA+ CORE ENGINE
// ==========================================
const KotobaApp = {
    data: [], currentCard: null,
    score: 0, streak: 0, exp: 0, level: 1,
    quizMode: '', questionIndex: 0,
    
    // Inisialisasi Aplikasi
    init() {
        lucide.createIcons(); // Render ikon premium
        this.loadPlayerData();
        this.fetchDatabase();
        this.setupAudioAndHaptics();

        // Listener untuk Flip Card 3D
        document.getElementById('flashcard3D').addEventListener('click', () => {
            document.getElementById('flashcard3D').classList.toggle('is-flipped');
            document.querySelector('.flashcard-controls').classList.add('show');
            this.playSound('flip');
        });
    },

    // Memuat Data Pemain dari LocalStorage
    loadPlayerData() {
        this.exp = parseInt(localStorage.getItem('kotoba_exp')) || 0;
        this.score = parseInt(localStorage.getItem('kotoba_gem')) || 0;
        this.calculateLevel();
        this.updateUI();
    },

    // Sistem Gamifikasi (Level & EXP)
    calculateLevel() {
        this.level = Math.floor(this.exp / 1000) + 1;
        let currentLevelExp = this.exp % 1000;
        
        document.getElementById('playerLevel').innerText = `Lv.${this.level}`;
        document.getElementById('playerExp').innerText = currentLevelExp;
        document.getElementById('gemCount').innerText = this.score;

        // Animasi Lingkaran EXP
        let percentage = (currentLevelExp / 1000) * 100;
        let dashoffset = 283 - (283 * percentage) / 100;
        document.getElementById('expRing').style.strokeDashoffset = dashoffset;
    },

    addReward(expGained, gemGained) {
        this.exp += expGained;
        this.score += gemGained;
        localStorage.setItem('kotoba_exp', this.exp);
        localStorage.setItem('kotoba_gem', this.score);
        this.calculateLevel();
    },

    // Mengambil Data dari Firebase
    async fetchDatabase() {
        try {
            const dbRef = ref(db);
            const [kanjiSnap, tangoSnap] = await Promise.all([get(child(dbRef, `renshuu/kanji`)), get(child(dbRef, `renshuu/tango`))]);
            
            let kanjiData = kanjiSnap.exists() ? kanjiSnap.val() : [];
            let tangoData = tangoSnap.exists() ? tangoSnap.val() : [];
            tangoData = tangoData.map(item => ({ id: item.id + 1000, kanji: item.kata, hiragana: item.hiragana, arti: item.arti }));
            
            let allData = [...kanjiData, ...tangoData].filter(i => i);
            
            // Filter kosakata yang sudah dihafal (Mastered)
            let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];
            this.data = allData.filter(item => !masteredIds.includes(item.id));

        } catch (error) {
            console.error("Firebase Error:", error);
        }
    },

    // Sistem Navigasi Halus (GSAP Transisi)
    navigate(targetViewId) {
        this.playSound('click');
        const currentView = document.querySelector('.active-view');
        const targetView = document.getElementById(targetViewId);
        
        if(currentView.id === targetViewId) return;

        // Animasi keluar
        gsap.to(currentView, { 
            opacity: 0, y: -20, duration: 0.3, ease: "power2.in",
            onComplete: () => {
                currentView.classList.remove('active-view');
                targetView.classList.add('active-view');
                // Animasi masuk
                gsap.fromTo(targetView, 
                    { opacity: 0, y: 20 }, 
                    { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.5)" }
                );
            }
        });

        // Update Bottom Nav Status
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        if(targetViewId === 'view-dashboard') document.querySelectorAll('.nav-item')[0].classList.add('active');
    },

    // ==========================================
    // LOGIKA KUIS
    // ==========================================
    startQuiz(mode) {
        if(this.data.length < 4) return alert("Data kosakata belum cukup!");
        this.quizMode = mode;
        this.questionIndex = 0;
        this.streak = 0;
        this.navigate('view-quiz');
        this.generateQuizQuestion();
    },

    generateQuizQuestion() {
        // Acak array
        let shuffled = [...this.data].sort(() => 0.5 - Math.random());
        this.currentCard = shuffled[0];

        let askProp, ansProp, hint;
        if(this.quizMode === 'kanji-arti') { askProp = 'kanji'; ansProp = 'arti'; hint = 'Terjemahkan'; }
        if(this.quizMode === 'kanji-hiragana') { askProp = 'kanji'; ansProp = 'hiragana'; hint = 'Cara baca'; }
        if(this.quizMode === 'hiragana-arti') { askProp = 'hiragana'; ansProp = 'arti'; hint = 'Terjemahkan'; }

        document.getElementById('quizHint').innerText = hint;
        document.getElementById('quizQuestion').innerText = this.currentCard[askProp];
        
        // Progress Bar Animasi
        let progress = ((this.questionIndex % 10) / 10) * 100;
        document.getElementById('quizProgressBar').style.width = `${progress}%`;
        document.getElementById('streakCount').innerText = this.streak;

        // Pilihan Ganda (1 Benar, 3 Salah)
        let options = [this.currentCard[ansProp], shuffled[1][ansProp], shuffled[2][ansProp], shuffled[3][ansProp]];
        options.sort(() => 0.5 - Math.random()); // Acak posisi

        const btns = document.querySelectorAll('.option-btn');
        btns.forEach((btn, i) => {
            btn.innerText = options[i];
            btn.className = "glass-btn option-btn"; // Reset class
            btn.disabled = false;
            btn.onclick = () => this.checkAnswer(btn, options[i] === this.currentCard[ansProp]);
        });

        // Animasikan teks masuk
        gsap.fromTo(".question-display", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });
    },

    checkAnswer(btn, isCorrect) {
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        
        if (isCorrect) {
            btn.classList.add('correct');
            this.streak++;
            this.addReward(15, 2); // +15 EXP, +2 Gems
            this.playSound('correct');
            this.haptic([50]);
            
            // Confetti Effect
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 }, colors: ['#2EE6FF', '#FF4DD8'] });
        } else {
            btn.classList.add('wrong');
            this.streak = 0;
            this.playSound('wrong');
            this.haptic([50, 100, 50]); // Getar error

            // Shake Animation GSAP
            gsap.to(".question-display", { x: [-10, 10, -10, 10, 0], duration: 0.4 });
            
            // Tunjukkan yang benar
            let correctAns = (this.quizMode === 'kanji-arti' || this.quizMode === 'hiragana-arti') ? this.currentCard.arti : this.currentCard.hiragana;
            document.querySelectorAll('.option-btn').forEach(b => { if(b.innerText === correctAns) b.classList.add('correct'); });
        }
        
        document.getElementById('streakCount').innerText = this.streak;
        
        setTimeout(() => {
            this.questionIndex++;
            this.generateQuizQuestion();
        }, 1500);
    },

    // ==========================================
    // LOGIKA TRUE FLASHCARD 3D
    // ==========================================
    startFlashcard() {
        if(this.data.length === 0) return alert("Semua kosakata telah dikuasai! Luar biasa.");
        this.navigate('view-flashcard');
        this.loadCardToUI();
    },

    loadCardToUI() {
        // Reset rotasi kartu
        document.getElementById('flashcard3D').classList.remove('is-flipped');
        document.querySelector('.flashcard-controls').classList.remove('show');
        
        // Ambil acak
        this.currentCard = this.data[Math.floor(Math.random() * this.data.length)];
        
        document.getElementById('fcFrontText').innerText = this.currentCard.kanji;
        document.getElementById('fcBackHira').innerText = this.currentCard.hiragana;
        document.getElementById('fcBackArti').innerText = this.currentCard.arti;

        // Animasi pop-in kartu
        gsap.fromTo(".card-3d", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.5)" });
    },

    nextCard(isMastered) {
        this.playSound('click');
        if (isMastered) {
            let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];
            masteredIds.push(this.currentCard.id);
            localStorage.setItem('kotoba_mastered', JSON.stringify(masteredIds));
            
            // Hapus dari data aktif
            this.data = this.data.filter(item => item.id !== this.currentCard.id);
            this.addReward(30, 5); // Reward besar karena sudah hafal
            
            // Animasi terbang ke atas
            gsap.to(".card-3d", { y: -500, opacity: 0, duration: 0.5, onComplete: () => this.loadCardToUI() });
        } else {
            // Animasi geser kiri (Swipe out)
            gsap.to(".card-3d", { x: -300, opacity: 0, duration: 0.3, onComplete: () => {
                gsap.set(".card-3d", { x: 300 }); // Pindah ke kanan
                this.loadCardToUI();
                gsap.to(".card-3d", { x: 0, duration: 0.4, ease: "power2.out" });
            }});
        }
    },

    // ==========================================
    // SENSOR & MEDIA (Audio & Getaran)
    // ==========================================
    setupAudioAndHaptics() {
        // Web Audio API untuk efek suara ringan tanpa MP3
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
    },

    playSound(type) {
        if(!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        if(type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(800, this.audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, this.audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1); osc.start(); osc.stop(this.audioCtx.currentTime + 0.1); }
        else if(type === 'flip') { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, this.audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(400, this.audioCtx.currentTime + 0.15); gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15); osc.start(); osc.stop(this.audioCtx.currentTime + 0.15); }
        else if(type === 'correct') { osc.type = 'square'; osc.frequency.setValueAtTime(400, this.audioCtx.currentTime); osc.frequency.setValueAtTime(600, this.audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.05, this.audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3); osc.start(); osc.stop(this.audioCtx.currentTime + 0.3); }
        else if(type === 'wrong') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, this.audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.2); gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2); osc.start(); osc.stop(this.audioCtx.currentTime + 0.2); }
    },

    haptic(pattern) {
        // Haptic Feedback untuk Android
        if ("vibrate" in navigator) navigator.vibrate(pattern);
    },

    // Placeholder Fitur Kamus
    openDictionary() {
        alert("Kotoba+ Dictionary dengan Filter dan Sistem Tagging sedang dipersiapkan!");
    }
};

// Expose fungsi ke global window agar bisa dipanggil dari HTML onclick
window.KotobaApp = KotobaApp;

// Jalankan saat HTML selesai dirender
document.addEventListener('DOMContentLoaded', () => KotobaApp.init());
