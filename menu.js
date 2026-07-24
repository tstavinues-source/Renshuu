// menu.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Mengambil data user dan poin dari Local Storage (Penyimpanan Browser)
    // Jika belum ada data, kita beri nilai default "Wibu Learner" dan 0 poin.
    let userName = localStorage.getItem('renshuu_username') || "Wibu Learner";
    let userPoints = localStorage.getItem('renshuu_points') || 0;

    // 2. Menampilkan data ke UI Halaman Depan
    document.getElementById('userName').innerText = userName;
    // Mengambil huruf pertama dari nama untuk dijadikan inisial di avatar
    document.getElementById('userInitial').innerText = userName.charAt(0).toUpperCase(); 
    document.getElementById('userPoints').innerText = userPoints;

    // 3. Efek Animasi "Pop-Up" Futuristik untuk Menu Diamond
    const diamondButtons = document.querySelectorAll('.diamond-btn');
    
    diamondButtons.forEach((btn, index) => {
        // Set kondisi awal: transparan dan mengecil
        btn.style.opacity = '0';
        btn.style.transform = 'rotate(45deg) scale(0.5)';
        
        // Animasi muncul berurutan (delay bertingkat)
        setTimeout(() => {
            btn.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            btn.style.opacity = '1';
            btn.style.transform = 'rotate(45deg) scale(1)';
        }, 150 * (index + 1));
    });

    // 4. (Opsional) Fitur ubah nama jika user mengklik nama mereka
    const userNameElement = document.getElementById('userName');
    userNameElement.style.cursor = 'pointer';
    userNameElement.addEventListener('click', () => {
        const newName = prompt("Masukkan namamu:", userName);
        if (newName && newName.trim() !== "") {
            localStorage.setItem('renshuu_username', newName.trim());
            // Refresh halaman untuk memperbarui nama dan inisial
            window.location.reload(); 
        }
    });
});
