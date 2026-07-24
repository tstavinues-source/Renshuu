import { db } from './firebase-config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==========================================
// KOTOBA+ CORE ENGINE
// ==========================================
const KotobaApp = {
    data: [], currentCard: null,
    score: 0, streak: 0, exp: 0, level: 1,
    quizMode: '', questionIndex: 0,
    isDataReady: false, // Mencegah klik sebelum data siap
    
    // Inisialisasi Aplikasi (Dibuat async agar menunggu Firebase)
    async init() {
        lucide.createIcons(); 
        this.loadPlayerData();
        this.setupAudioAndHaptics();

        // 1. Tampilkan status sedang memuat
        const subtitle = document.querySelector('.section-title p');
        subtitle.innerHTML = "<span style='color: var(--cyan);'>⏳ Menghubungkan ke Server Cyber...</span>";

        // 2. Tunggu data Firebase selesai diunduh
        await this.fetchDatabase();

        // 3. Cek hasil unduhan
        if (this.data.length >= 4) {
            subtitle.innerHTML = `✅ Sistem Aktif. <span style="color:var(--yellow); font-weight:bold;">${this.data.length} Kosakata</span> siap dipelajari.`;
            this.isDataReady = true;
        } else {
            subtitle.innerHTML = "❌ Gagal memuat data. Cek koneksi atau database-mu.";
            this.showToast("Database kosong atau gagal dimuat!", "error");
        }

        // Listener untuk Flip Card 3D
        document.getElementById('flashcard3D').addEventListener('click', () => {
            document.getElementById('flashcard3D').classList.toggle('is-flipped');
            document.querySelector('.flashcard-controls').classList.add('show');
            this.playSound('flip');
        });
    },

    // Sistem Notifikasi Pop-up (Pengganti Alert)
    showToast(message, type = "error") {
        // Hapus toast lama jika ada
        const oldToast = document.getElementById('kotobaToast');
        if (oldToast) oldToast.remove();

        // Buat elemen toast baru
        const toast = document.createElement('div');
        toast.id = 'kotobaToast';
        toast.className = `kotoba-toast ${type === 'success' ? 'toast-success' : type === 'info' ? 'toast-info' : ''}`;
        
        let icon = type === 'success' ? 'check-circle' : type === 'info' ? 'info' : 'alert-circle';
        toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
        document.body.appendChild(toast);
        lucide.createIcons();

        // Animasikan masuk, lalu hilang setelah 3 detik
        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    loadPlayerData() {
        this.exp = parseInt(localStorage.getItem('kotoba_exp')) || 0;
        this.score = parseInt(localStorage.getItem('kotoba_gem')) || 0;
        this.calculateLevel();
    },

    calculateLevel() {
        this.level = Math.floor(this.exp / 1000) + 1;
        let currentLevelExp = this.exp % 1000;
        
        document.getElementById('playerLevel').innerText = `Lv.${this.level}`;
        document.getElementById('playerExp').innerText = currentLevelExp;
        document.getElementById('gemCount').innerText = this.score;

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
            
            // Konversi dari Firebase Object ke Array yang benar
            let kanjiData = kanjiSnap.exists() ? Object.values(kanjiSnap.val()) : [];
            let tangoData = tangoSnap.exists() ? Object.values(tangoSnap.val()) : [];
            
            tangoData = tangoData.map(item => ({ id: item.id + 1000, kanji: item.kata, hiragana: item.hiragana, arti: item.arti }));
            
            let allData = [...kanjiData, ...tangoData].filter(i => i && i.kanji);
            
            // Filter kosakata yang sudah dihafal
            let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];
            this.data = allData.filter(item => !masteredIds.includes(item.id));

        } catch (error) {
            console.error("Firebase Error:", error);
        }
    },

    navigate(targetViewId) {
        this.playSound('click');
        const currentView = document.querySelector('.active-view');
        const targetView = document.getElementById(targetViewId);
        
        if(currentView.id === targetViewId) return;

        gsap.to(currentView, { 
            opacity: 0, y: -20, duration: 0.3, ease: "power2.in",
            onComplete: () => {
                currentView.classList.remove('active-view');
                targetView.classList.add('active-view');
                gsap.fromTo(targetView, 
                    { opacity: 0, y: 20 }, 
                    { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.5)" }
                );
            }
        });

        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        if(targetViewId === 'view-dashboard') document.querySelectorAll('.nav-item')[0].classList.add('active');
    },

    // ==========================================
    // LOGIKA KUIS
    // ==========================================
    startQuiz(mode) {
        if (!this.isDataReady) {
            return this.showToast("Sabar, sedang mengunduh data dari server...", "info");
        }
        if (this.data.length < 4) {
            return this.showToast("Data kosakata belum cukup! Butuh minimal 4 data.", "error");
        }
        
        this.quizMode = mode;
        this.questionIndex = 0;
        this.streak = 0;
        this.navigate('view-quiz');
        this.generateQuizQuestion();
    },

    generateQuizQuestion() {
        let shuffled = [...this.data].sort(() => 0.5 - Math.random());
        this.currentCard = shuffled[0];

        let askProp, ansProp, hint;
        if(this.quizMode === 'kanji-arti') { askProp = 'kanji'; ansProp = 'arti'; hint = 'Terjemahkan'; }
        if(this.quizMode === 'kanji-hiragana') { askProp = 'kanji'; ansProp = 'hiragana'; hint = 'Cara baca'; }
        if(this.quizMode === 'hiragana-arti') { askProp = 'hiragana'; ansProp = 'arti'; hint = 'Terjemahkan'; }

        document.getElementById('quizHint').innerText = hint;
        document.getElementById('quizQuestion').innerText = this.currentCard[askProp];
        
        let progress = ((this.questionIndex % 10) / 10) * 100;
        document.getElementById('quizProgressBar').style.width = `${progress}%`;
        document.getElementById('streakCount').innerText = this.streak;

        let options = [this.currentCard[ansProp], shuffled[1][ansProp], shuffled[2][ansProp], shuffled[3][ansProp]];
        options.sort(() => 0.5 - Math.random());

        const btns = document.querySelectorAll('.option-btn');
        btns.forEach((btn, i) => {
            btn.innerText = options[i];
            btn.className = "glass-btn option-btn"; 
            btn.disabled = false;
            btn.onclick = () => this.checkAnswer(btn, options[i] === this.currentCard[ansProp]);
        });

        gsap.fromTo(".question-display", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });
    },

    checkAnswer(btn, isCorrect) {
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        
        if (isCorrect) {
            btn.classList.add('correct');
            this.streak++;
            this.addReward(15, 2); 
            this.playSound('correct');
            this.haptic([50]);
            
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 }, colors: ['#2EE6FF', '#FF4DD8'] });
        } else {
            btn.classList.add('wrong');
            this.streak = 0;
            this.playSound('wrong');
            this.haptic([50, 100, 50]); 

            gsap.to(".question-display", { x: [-10, 10, -10, 10, 0], duration: 0.4 });
            
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
        if (!this.isDataReady) {
            return this.showToast("Sabar, sedang mengunduh data...", "info");
        }
        if (this.data.length === 0) {
            return this.showToast("Semua kosakata telah dikuasai!", "success");
        }
        this.navigate('view-flashcard');
        this.loadCardToUI();
    },

    loadCardToUI() {
        document.getElementById('flashcard3D').classList.remove('is-flipped');
        document.querySelector('.flashcard-controls').classList.remove('show');
        
        this.currentCard = this.data[Math.floor(Math.random() * this.data.length)];
        
        document.getElementById('fcFrontText').innerText = this.currentCard.kanji;
        document.getElementById('fcBackHira').innerText = this.currentCard.hiragana;
        document.getElementById('fcBackArti').innerText = this.currentCard.arti;

        gsap.fromTo(".card-3d", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.5)" });
    },

    nextCard(isMastered) {
        this.playSound('click');
        if (isMastered) {
            let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];
            masteredIds.push(this.currentCard.id);
            localStorage.setItem('kotoba_mastered', JSON.stringify(masteredIds));
            
            this.data = this.data.filter(item => item.id !== this.currentCard.id);
            this.addReward(30, 5); 
            
            if(this.data.length === 0) {
                this.showToast("Deck selesai! Semua dikuasai.", "success");
                return setTimeout(() => this.navigate('view-dashboard'), 1500);
            }
            gsap.to(".card-3d", { y: -500, opacity: 0, duration: 0.5, onComplete: () => this.loadCardToUI() });
        } else {
            gsap.to(".card-3d", { x: -300, opacity: 0, duration: 0.3, onComplete: () => {
                gsap.set(".card-3d", { x: 300 }); 
                this.loadCardToUI();
                gsap.to(".card-3d", { x: 0, duration: 0.4, ease: "power2.out" });
            }});
        }
    },

    setupAudioAndHaptics() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
    },

    playSound(type) {
        if(!this.audioCtx) return;
        if(this.audioCtx.state === 'suspended') this.audioCtx.resume();
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
        if ("vibrate" in navigator) navigator.vibrate(pattern);
    },

    openDictionary() {
        this.showToast("Fitur Kamus sedang disempurnakan!", "info");
    }
};

window.KotobaApp = KotobaApp;
document.addEventListener('DOMContentLoaded', () => KotobaApp.init());
