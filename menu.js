import { db } from './firebase-config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    let userName = localStorage.getItem('renshuu_username') || "Wibu Learner";
    let userPoints = localStorage.getItem('renshuu_points') || 0;

    document.getElementById('userName').innerText = userName;
    document.getElementById('userInitial').innerText = userName.charAt(0).toUpperCase(); 
    document.getElementById('userPoints').innerText = userPoints;

    const diamondButtons = document.querySelectorAll('.diamond-btn');
    diamondButtons.forEach((btn, index) => {
        btn.style.opacity = '0';
        btn.style.transform = 'rotate(45deg) scale(0.5)';
        setTimeout(() => {
            btn.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            btn.style.opacity = '1';
            btn.style.transform = 'rotate(45deg) scale(1)';
        }, 150 * (index + 1));
    });

    const userNameElement = document.getElementById('userName');
    userNameElement.style.cursor = 'pointer';
    userNameElement.addEventListener('click', () => {
        const newName = prompt("Masukkan namamu:", userName);
        if (newName && newName.trim() !== "") {
            localStorage.setItem('renshuu_username', newName.trim());
            window.location.reload(); 
        }
    });

    // --- LOGIKA DAFTAR KOSAKATA (DICTIONARY) ---
    const modal = document.getElementById('dictionaryModal');
    const btnOpen = document.getElementById('btnOpenDictionary');
    const btnClose = document.getElementById('btnCloseDictionary');
    const dictList = document.getElementById('dictionaryList');

    btnOpen.addEventListener('click', async () => {
        modal.style.display = 'flex';
        
        // Ambil ID yang sudah dihafal dari Local Storage
        let hiddenIds = JSON.parse(localStorage.getItem('renshuu_hidden_ids')) || [];

        try {
            const dbRef = ref(db);
            const [kanjiSnap, tangoSnap] = await Promise.all([
                get(child(dbRef, `renshuu/kanji`)),
                get(child(dbRef, `renshuu/tango`))
            ]);

            let kanjiData = kanjiSnap.exists() ? kanjiSnap.val() : [];
            let tangoData = tangoSnap.exists() ? tangoSnap.val() : [];
            
            tangoData = tangoData.map(item => ({ id: item.id + 1000, kanji: item.kata, hiragana: item.hiragana, arti: item.arti }));
            let fullData = [...kanjiData, ...tangoData].filter(item => item !== null && item !== undefined);

            dictList.innerHTML = ''; // Bersihkan loading
            
            fullData.forEach(item => {
                const isHidden = hiddenIds.includes(item.id);
                const div = document.createElement('div');
                div.className = `dict-item ${isHidden ? 'hidden-item' : ''}`;
                div.innerHTML = `
                    <div class="dict-info">
                        <span class="dict-kanji">${item.kanji}</span>
                        <div class="dict-details">
                            <span class="dict-hira">${item.hiragana}</span>
                            <span class="dict-arti">${item.arti}</span>
                        </div>
                    </div>
                    <button class="toggle-hide-btn ${isHidden ? 'active' : ''}" data-id="${item.id}">
                        ${isHidden ? 'Dikuasai ✅' : 'Hafal?'}
                    </button>
                `;
                dictList.appendChild(div);
            });

            // Pasang event listener untuk tombol hafal
            document.querySelectorAll('.toggle-hide-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.target.getAttribute('data-id'));
                    let currentHidden = JSON.parse(localStorage.getItem('renshuu_hidden_ids')) || [];
                    
                    if (currentHidden.includes(id)) {
                        currentHidden = currentHidden.filter(hId => hId !== id);
                        e.target.innerText = 'Hafal?';
                        e.target.classList.remove('active');
                        e.target.parentElement.classList.remove('hidden-item');
                    } else {
                        currentHidden.push(id);
                        e.target.innerText = 'Dikuasai ✅';
                        e.target.classList.add('active');
                        e.target.parentElement.classList.add('hidden-item');
                    }
                    localStorage.setItem('renshuu_hidden_ids', JSON.stringify(currentHidden));
                });
            });

        } catch (error) {
            dictList.innerHTML = "<p style='color:red;'>Gagal memuat data.</p>";
        }
    });

    btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
});
