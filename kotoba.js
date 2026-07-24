import { db } from './firebase-config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const KotobaApp = {
    allData: [], 
    activeData: [], 
    currentCard: null,
    score: 0, streak: 0, exp: 0, level: 1,
    quizMode: '', flashMode: '', questionIndex: 0, flashIndex: 0,
    isDataReady: false,
    
    async init() {
        lucide.createIcons(); 
        this.loadPlayerData();
        this.setupAudioAndHaptics();

        const subtitle = document.querySelector('.section-title p');
        subtitle.innerHTML = "<span style='color: var(--cyan);'>⏳ Mengambil Data Server...</span>";

        await this.fetchDatabase();

        if (this.allData.length > 0) {
            subtitle.innerHTML = `✅ Sistem Aktif. <span style="color:var(--yellow); font-weight:bold;">${this.activeData.length} Kosakata</span> dipelajari.`;
            this.isDataReady = true;
        } else {
            subtitle.innerHTML = "❌ Gagal memuat data.";
            this.showToast("Database kosong!", "error");
        }
    },

    showToast(message, type = "error") {
        const oldToast = document.getElementById('kotobaToast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'kotobaToast';
        toast.className = `kotoba-toast ${type === 'success' ? 'toast-success' : type === 'info' ? 'toast-info' : ''}`;
        let icon = type === 'success' ? 'check-circle' : type === 'info' ? 'info' : 'alert-circle';
        toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
        document.body.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 3000);
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
        document.getElementById('expRing').style.strokeDashoffset = 283 - (283 * percentage) / 100;
    },

    addReward(expGained, gemGained) {
        this.exp += expGained;
        this.score += gemGained;
        localStorage.setItem('kotoba_exp', this.exp);
        localStorage.setItem('kotoba_gem', this.score);
        this.calculateLevel();
    },

    async fetchDatabase() {
        try {
            const dbRef = ref(db);
            const [kanjiSnap, tangoSnap] = await Promise.all([get(child(dbRef, `renshuu/kanji`)), get(child(dbRef, `renshuu/tango`))]);
            
            let kanjiData = kanjiSnap.exists() ? Object.values(kanjiSnap.val()) : [];
            let tangoData = tangoSnap.exists() ? Object.values(tangoSnap.val()) : [];
            tangoData = tangoData.map(item => ({ id: item.id + 1000, kanji: item.kata, hiragana: item.hiragana, arti: item.arti }));
            
            this.allData = [...kanjiData, ...tangoData].filter(i => i && i.kanji);
            this.refreshActiveData();
        } catch (error) {
            console.error(error);
        }
    },

    refreshActiveData() {
        let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];
        this.activeData = this.allData.filter(item => !masteredIds.includes(item.id));
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
                gsap.fromTo(targetView, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.5)" });
            }
        });
    },

    // ==========================================
    // LOGIKA KUIS
    // ==========================================
    startQuiz(mode) {
        if (!this.isDataReady) return this.showToast("Sedang memuat data...", "info");
        if (this.activeData.length < 4) return this.showToast("Kosakata tersisa kurang dari 4!", "error");
        
        this.quizMode = mode;
        this.questionIndex = 0;
        this.streak = 0;
        this.navigate('view-quiz');
        this.generateQuizQuestion();
    },

    generateQuizQuestion() {
        let shuffled = [...this.activeData].sort(() => 0.5 - Math.random());
        this.currentCard = shuffled[0];

        let askProp, ansProp, hint;
        if(this.quizMode === 'kanji-arti') { askProp = 'kanji'; ansProp = 'arti'; hint = 'Terjemahkan'; }
        if(this.quizMode === 'kanji-hiragana') { askProp = 'kanji'; ansProp = 'hiragana'; hint = 'Cara baca'; }
        if(this.quizMode === 'hiragana-arti') { askProp = 'hiragana'; ansProp = 'arti'; hint = 'Terjemahkan'; }

        document.getElementById('quizHint').innerText = hint;
        document.getElementById('quizQuestion').innerText = this.currentCard[askProp];
        document.getElementById('quizProgressBar').style.width = `${((this.questionIndex % 10) / 10) * 100}%`;
        document.getElementById('streakCount').innerText = this.streak;

        let options = [this.currentCard[ansProp], shuffled[1][ansProp], shuffled[2][ansProp], shuffled[3][ansProp]].sort(() => 0.5 - Math.random());

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
            btn.classList.add('correct'); this.streak++; this.addReward(15, 2); 
            this.playSound('correct'); this.haptic([50]);
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 }, colors: ['#2EE6FF', '#FF4DD8'] });
        } else {
            btn.classList.add('wrong'); this.streak = 0;
            this.playSound('wrong'); this.haptic([50, 100, 50]); 
            gsap.to(".question-display", { x: [-10, 10, -10, 10, 0], duration: 0.4 });
            let correctAns = (this.quizMode === 'kanji-arti' || this.quizMode === 'hiragana-arti') ? this.currentCard.arti : this.currentCard.hiragana;
            document.querySelectorAll('.option-btn').forEach(b => { if(b.innerText === correctAns) b.classList.add('correct'); });
        }
        document.getElementById('streakCount').innerText = this.streak;
        setTimeout(() => { this.questionIndex++; this.generateQuizQuestion(); }, 1500);
    },

    // ==========================================
    // LOGIKA FLASHCARD (Update Kiri Kanan)
    // ==========================================
    startFlashcard(mode) {
        if (!this.isDataReady) return this.showToast("Sedang memuat data...", "info");
        if (this.activeData.length === 0) return this.showToast("Semua kosakata telah dikuasai!", "success");
        
        // Acak list untuk sesi flashcard ini
        this.activeData.sort(() => 0.5 - Math.random());
        
        this.flashMode = mode;
        this.flashIndex = 0;
        this.navigate('view-flashcard');
        this.loadCardToUI();
    },

    loadCardToUI() {
        document.getElementById('flashcard3D').classList.remove('is-flipped');
        this.currentCard = this.activeData[this.flashIndex];
        
        let front, backMain, backSub, badge;
        if(this.flashMode === 'kanji-arti') { front = this.currentCard.kanji; backMain = this.currentCard.arti; backSub = this.currentCard.hiragana; badge = "Arti"; }
        if(this.flashMode === 'kanji-hiragana') { front = this.currentCard.kanji; backMain = this.currentCard.hiragana; backSub = this.currentCard.arti; badge = "Cara Baca"; }
        if(this.flashMode === 'hiragana-arti') { front = this.currentCard.hiragana; backMain = this.currentCard.arti; backSub = this.currentCard.kanji; badge = "Arti"; }

        document.getElementById('fcFrontText').innerText = front;
        document.getElementById('fcBackMain').innerText = backMain;
        document.getElementById('fcBackSub').innerText = backSub;
        document.getElementById('fcModeBadge').innerText = badge;
        
        document.getElementById('flashcardCounter').innerText = `${this.flashIndex + 1} / ${this.activeData.length}`;
    },

    flipCard() {
        const card = document.getElementById('flashcard3D');
        card.classList.toggle('is-flipped');
        
        if(card.classList.contains('is-flipped')) {
            this.playSound('flip');
            this.haptic([30]);
        }
    },

    nextFlashcard() {
        this.playSound('click');
        // Animasi keluar ke kiri
        gsap.to(".card-3d", { x: -300, opacity: 0, duration: 0.3, onComplete: () => {
            // Naikkan index, balik ke 0 jika mentok
            this.flashIndex = (this.flashIndex + 1) % this.activeData.length;
            this.loadCardToUI();
            
            // Set posisi awal di kanan, lalu masuk dengan opacity 1 (FIXED)
            gsap.set(".card-3d", { x: 300 });
            gsap.to(".card-3d", { x: 0, opacity: 1, duration: 0.4, ease: "power2.out" });
        }});
    },

    prevFlashcard() {
        this.playSound('click');
        // Animasi keluar ke kanan
        gsap.to(".card-3d", { x: 300, opacity: 0, duration: 0.3, onComplete: () => {
            // Turunkan index, pergi ke ujung jika kurang dari 0
            this.flashIndex = (this.flashIndex - 1 + this.activeData.length) % this.activeData.length;
            this.loadCardToUI();
            
            // Set posisi awal di kiri, lalu masuk dengan opacity 1 (FIXED)
            gsap.set(".card-3d", { x: -300 });
            gsap.to(".card-3d", { x: 0, opacity: 1, duration: 0.4, ease: "power2.out" });
        }});
    },

    // ==========================================
    // LOGIKA DAFTAR KOSAKATA (KAMUS)
    // ==========================================
    openDictionary() {
        if (!this.isDataReady) return this.showToast("Sedang memuat data...", "info");
        // Hapus peringatan lama, langsung navigasi dan jalankan render
        this.navigate('view-dictionary');
        this.renderDictionary();
    },

    renderDictionary() {
        const listDiv = document.getElementById('dictionaryList');
        listDiv.innerHTML = '';
        let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];

        this.allData.forEach(item => {
            let isMastered = masteredIds.includes(item.id);
            
            let card = document.createElement('div');
            card.className = `dict-card ${isMastered ? 'mastered' : ''}`;
            
            card.innerHTML = `
                <div style="display:flex; align-items:center; flex:1;">
                    <div class="dict-kanji">${item.kanji}</div>
                    <div class="dict-sub">
                        <span class="dict-hira">${item.hiragana}</span>
                        <span class="dict-arti">${item.arti}</span>
                    </div>
                </div>
                <button class="btn-toggle-dict" onclick="KotobaApp.toggleMastered(${item.id})">
                    <i data-lucide="${isMastered ? 'check-square-2' : 'square'}"></i>
                </button>
            `;
            listDiv.appendChild(card);
        });
        lucide.createIcons();
    },

    toggleMastered(id) {
        let masteredIds = JSON.parse(localStorage.getItem('kotoba_mastered')) || [];
        if (masteredIds.includes(id)) {
            masteredIds = masteredIds.filter(x => x !== id); // Hapus (jadi belum hafal)
        } else {
            masteredIds.push(id); // Tambah (jadi sudah hafal)
        }
        localStorage.setItem('kotoba_mastered', JSON.stringify(masteredIds));
        
        this.refreshActiveData();
        this.renderDictionary(); // Render ulang agar UI seketika berubah
        this.playSound('click');
        this.haptic([40]);
    },

    // ==========================================
    // SENSOR & MEDIA
    // ==========================================
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

    haptic(pattern) { if ("vibrate" in navigator) navigator.vibrate(pattern); }
};

window.KotobaApp = KotobaApp;
document.addEventListener('DOMContentLoaded', () => KotobaApp.init());
