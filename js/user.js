/**
 * FocusFlow Task Manager - Mode Pengingat (Viewer / Read-Only)
 * JavaScript Logic Utuh Tanpa Manipulasi Data (Strict Read-Only)
 */

// --- 1. KONFIGURASI SUPABASE & CONSTANTS ---
const SUPABASE_URL = 'https://pzatorrpfumpbpzuyeob.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YXRvcnJwZnVtcGJwenV5ZW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNzcwNjUsImV4cCI6MjEwMzY1MzA2NX0.22qH2ruiAW6mep97CK9QF5pnNIQVX-orLmQScnhxH80';
let supabaseClient = null;

const LOCAL_STORAGE_KEY = 'focusflow_tasks_data';
const THEME_KEY = 'focusflow_theme';

let tasks = [];
let currentFilter = 'all'; 
let searchQuery = '';

// DOM Elements
const DOM = {
    themeToggle: document.getElementById('theme-toggle'),
    themeIconMoon: document.getElementById('theme-icon-moon'),
    themeIconSun: document.getElementById('theme-icon-sun'),
    
    statTotal: document.getElementById('stat-total'),
    statUrgent: document.getElementById('stat-urgent'),
    
    filterChips: document.querySelectorAll('.filter-chip'),
    searchInput: document.getElementById('search-input'),
    taskList: document.getElementById('task-list'),
    
    liveClock: document.getElementById('live-clock'),
    clockText: document.getElementById('clock-text'),
    
    detailModal: document.getElementById('detail-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnModalCloseAction: document.getElementById('btn-modal-close-action'),
    
    modalBadges: document.getElementById('modal-badges'),
    modalTaskTitle: document.getElementById('modal-task-title'),
    modalTaskDesc: document.getElementById('modal-task-desc'),
    modalTaskDeadline: document.getElementById('modal-task-deadline'),
    modalTaskCountdown: document.getElementById('modal-task-countdown'),
    modalTaskCreated: document.getElementById('modal-task-created')
};

// --- 2. INITIALIZATION ---
function init() {
    applyTheme();
    setupEventListeners();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (err) {
        console.warn('Inisialisasi Supabase gagal, fallback ke LocalStorage:', err);
    }

    // Tampilkan Skeleton saat pertama memuat
    renderSkeletonLoading();
    
    // Memuat data pertama kali
    loadTasks();
    
    // Auto-refresh setiap 30 detik (Read-Only Fetching)
    setInterval(loadTasks, 30000);
}

function renderIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// --- 3. LIVE CLOCK & THEME MANAGEMENT ---
function updateLiveClock() {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now).replace(/\./g, ':');
    if (DOM.clockText) {
        DOM.clockText.textContent = `${timeStr} WIB`;
    }
}

function applyTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        DOM.themeIconMoon.classList.add('hidden');
        DOM.themeIconSun.classList.remove('hidden');
    } else {
        document.documentElement.removeAttribute('data-theme');
        DOM.themeIconMoon.classList.remove('hidden');
        DOM.themeIconSun.classList.add('hidden');
    }
    renderIcons();
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(THEME_KEY, 'light');
        DOM.themeIconMoon.classList.remove('hidden');
        DOM.themeIconSun.classList.add('hidden');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem(THEME_KEY, 'dark');
        DOM.themeIconMoon.classList.add('hidden');
        DOM.themeIconSun.classList.remove('hidden');
    }
    renderIcons();
}

// --- 4. DATA LOADING (READ-ONLY) ---
async function loadTasks() {
    // 1. Ambil data dari LocalStorage terlebih dahulu
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
        try {
            tasks = JSON.parse(localData);
        } catch (e) {
            tasks = [];
        }
    }

    // 2. Ambil data dari Supabase Cloud (Khusus SELECT / Mode Baca)
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                tasks = data.map(t => ({
                    id: t.id,
                    title: t.title,
                    subject: t.subject || '',
                    type: t.type,
                    deadline: t.deadline,
                    description: t.description || '',
                    isCompleted: t.is_completed,
                    createdAt: t.created_at
                }));
                // Simpan cache ke LocalStorage agar tetap ter-synchronize
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tasks));
            }
        } catch (error) {
            console.warn("Gagal terhubung ke Cloud, menggunakan cache lokal.");
        }
    }

    renderTasks();
}

// --- 5. LOGIC & HELPER FUNCTIONS ---
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
    );
}

function getDeadlineStatus(deadlineIso, isCompleted) {
    if (isCompleted) return 'completed';
    
    const now = new Date();
    const deadline = new Date(deadlineIso);
    const diffMs = deadline - now;
    
    if (diffMs < 0) return 'overdue';
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 24) return 'urgent'; 
    if (diffHours <= 72) return 'warning'; 
    return 'normal';
}

function getBadgeConfig(status) {
    const configs = {
        normal: { class: 'badge-status-normal', icon: 'clock', text: 'Normal' },
        warning: { class: 'badge-status-warning', icon: 'alert-triangle', text: 'Mendekati Deadline' },
        urgent: { class: 'badge-status-urgent', icon: 'flame', text: 'Sangat Mendesak' },
        overdue: { class: 'badge-status-overdue', icon: 'alert-circle', text: 'Terlambat' },
        completed: { class: 'badge-status-completed', icon: 'check-circle-2', text: 'Selesai' }
    };
    return configs[status] || configs.normal;
}

function getRelativeTimeText(deadlineIso, isCompleted) {
    if (isCompleted) return { text: 'Tugas Selesai', class: '' };
    
    const now = new Date();
    const deadline = new Date(deadlineIso);
    const diffMs = deadline - now;
    const diffMinutes = Math.floor(Math.abs(diffMs) / (1000 * 60));
    const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

    if (diffMs < 0) {
        if (diffDays > 0) return { text: `Terlambat ${diffDays} hari`, class: 'overdue' };
        if (diffHours > 0) return { text: `Terlambat ${diffHours} jam`, class: 'overdue' };
        return { text: `Terlambat ${diffMinutes} menit`, class: 'overdue' };
    } else {
        if (diffDays > 0) return { text: `${diffDays} hari lagi`, class: diffDays <= 3 ? 'warning' : '' };
        if (diffHours > 0) return { text: `${diffHours} jam lagi`, class: 'urgent' };
        if (diffMinutes > 0) return { text: `${diffMinutes} menit lagi`, class: 'urgent' };
        return { text: 'Sisa < 1 menit', class: 'urgent' };
    }
}

function formatDeadline(isoString) {
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;

        const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date);
        const dayNum = new Intl.DateTimeFormat('id-ID', { day: 'numeric' }).format(date);
        const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(date);
        const yearNum = new Intl.DateTimeFormat('id-ID', { year: 'numeric' }).format(date);
        const timeStr = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(/\./g, ':');

        const formattedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        return `${formattedDay}, ${dayNum} ${monthName} ${yearNum} • ${timeStr}`;
    } catch (e) {
        return isoString;
    }
}

function updateStatistics() {
    const total = tasks.length;
    const urgentCount = tasks.filter(t => {
        const status = getDeadlineStatus(t.deadline, t.isCompleted);
        return status === 'urgent' || status === 'warning';
    }).length;
    
    DOM.statTotal.textContent = total;
    DOM.statUrgent.textContent = urgentCount;
}

function filterTasks() {
    let filtered = tasks;
    
    if (currentFilter !== 'all') {
        if (currentFilter === 'individual') filtered = filtered.filter(t => t.type === 'individual');
        if (currentFilter === 'group') filtered = filtered.filter(t => t.type === 'group');
    }
    
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => 
            t.title.toLowerCase().includes(query) || 
            (t.description && t.description.toLowerCase().includes(query)) ||
            (t.subject && t.subject.toLowerCase().includes(query))
        );
    }
    
    // Sortir: Deadline Terdekat Lebih Dulu
    filtered.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    
    return filtered;
}

// --- 6. RENDER LOGIC WITH SKELETON & GROUPING ---
function renderSkeletonLoading() {
    DOM.taskList.innerHTML = `
        <div class="task-grid">
            <div class="skeleton-card"><div class="skeleton-box" style="width: 40%; height: 20px;"></div><div class="skeleton-box" style="width: 80%; height: 24px;"></div><div class="skeleton-box" style="width: 100%; height: 40px;"></div></div>
            <div class="skeleton-card"><div class="skeleton-box" style="width: 40%; height: 20px;"></div><div class="skeleton-box" style="width: 80%; height: 24px;"></div><div class="skeleton-box" style="width: 100%; height: 40px;"></div></div>
            <div class="skeleton-card"><div class="skeleton-box" style="width: 40%; height: 20px;"></div><div class="skeleton-box" style="width: 80%; height: 24px;"></div><div class="skeleton-box" style="width: 100%; height: 40px;"></div></div>
        </div>
    `;
}

function renderTasks() {
    const filteredTasks = filterTasks();
    updateStatistics();
    
    DOM.taskList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
        DOM.taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon-wrapper">
                    <i data-lucide="inbox"></i>
                </div>
                <h3 class="empty-title">Tidak ada tugas ditemukan</h3>
                <p class="empty-desc">Tidak ada tugas yang sesuai dengan kriteria pencarian atau filter yang aktif.</p>
            </div>
        `;
        renderIcons();
        return;
    }

    // Kelompokkan Tugas Berdasarkan Krisis Waktu
    const buckets = {
        overdue: { title: 'Terlambat', icon: 'alert-circle', color: 'var(--danger)', tasks: [] },
        urgent: { title: 'Mendekati Deadline (≤72 Jam)', icon: 'flame', color: 'var(--warning)', tasks: [] },
        upcoming: { title: 'Tugas Mendatang', icon: 'calendar-clock', color: 'var(--primary)', tasks: [] },
        completed: { title: 'Selesai', icon: 'check-circle-2', color: 'var(--success)', tasks: [] }
    };

    filteredTasks.forEach(task => {
        const status = getDeadlineStatus(task.deadline, task.isCompleted);
        if (status === 'completed') buckets.completed.tasks.push(task);
        else if (status === 'overdue') buckets.overdue.tasks.push(task);
        else if (status === 'urgent' || status === 'warning') buckets.urgent.tasks.push(task);
        else buckets.upcoming.tasks.push(task);
    });

    // Render per Kelompok
    Object.keys(buckets).forEach(key => {
        const bucket = buckets[key];
        if (bucket.tasks.length === 0) return;

        const section = document.createElement('section');
        section.className = 'bucket-section';

        const headerHtml = `
            <div class="bucket-header">
                <div class="bucket-title" style="color: ${bucket.color}">
                    <i data-lucide="${bucket.icon}"></i>
                    <span>${bucket.title}</span>
                </div>
                <span class="bucket-count">${bucket.tasks.length} Tugas</span>
            </div>
        `;

        const grid = document.createElement('div');
        grid.className = 'task-grid';

        bucket.tasks.forEach(task => {
            grid.appendChild(createTaskCardElement(task));
        });

        section.innerHTML = headerHtml;
        section.appendChild(grid);
        DOM.taskList.appendChild(section);
    });

    renderIcons();
}

function createTaskCardElement(task) {
    const status = getDeadlineStatus(task.deadline, task.isCompleted);
    const statusConfig = getBadgeConfig(status);
    const relativeTime = getRelativeTimeText(task.deadline, task.isCompleted);
    
    const typeClass = task.type === 'individual' ? 'badge-type-individual' : 'badge-type-group';
    const typeIcon = task.type === 'individual' ? 'user' : 'users';
    const typeText = task.type === 'individual' ? 'Individu' : 'Kelompok';
    const subjectText = task.subject && task.subject !== '-' ? task.subject : 'Tanpa Mapel';

    const article = document.createElement('article');
    article.className = 'task-card';
    article.setAttribute('data-subject', escapeHTML(subjectText));
    article.onclick = () => openDetailModal(task);

    article.innerHTML = `
        <div class="task-header">
            <span class="badge badge-mapel" data-subject="${escapeHTML(subjectText)}">
                <i data-lucide="book-open"></i> ${escapeHTML(subjectText)}
            </span>
            <span class="badge ${typeClass}">
                <i data-lucide="${typeIcon}"></i> ${typeText}
            </span>
            <span class="badge ${statusConfig.class}">
                <i data-lucide="${statusConfig.icon}"></i> ${statusConfig.text}
            </span>
        </div>

        <div class="task-body">
            <h3 class="task-title">${escapeHTML(task.title)}</h3>
            ${task.description ? `<p class="task-desc">${escapeHTML(task.description)}</p>` : ''}
        </div>

        <div class="task-footer">
            <div class="task-meta-line">
                <div class="task-deadline-text">
                    <i data-lucide="calendar"></i>
                    <time datetime="${task.deadline}">${formatDeadline(task.deadline)}</time>
                </div>
                <span class="countdown-pill ${relativeTime.class}">
                    <i data-lucide="timer"></i> ${relativeTime.text}
                </span>
            </div>
            <div class="card-action-bar">
                <span class="btn-detail-view">Lihat Detail <i data-lucide="chevron-right"></i></span>
            </div>
        </div>
    `;

    return article;
}

// --- 7. DETAIL MODAL (READ-ONLY) ---
function openDetailModal(task) {
    const status = getDeadlineStatus(task.deadline, task.isCompleted);
    const statusConfig = getBadgeConfig(status);
    const relativeTime = getRelativeTimeText(task.deadline, task.isCompleted);
    
    const typeClass = task.type === 'individual' ? 'badge-type-individual' : 'badge-type-group';
    const typeIcon = task.type === 'individual' ? 'user' : 'users';
    const typeText = task.type === 'individual' ? 'Individu' : 'Kelompok';
    const subjectText = task.subject && task.subject !== '-' ? task.subject : 'Tanpa Mapel';

    DOM.modalBadges.innerHTML = `
        <span class="badge badge-mapel" data-subject="${escapeHTML(subjectText)}">
            <i data-lucide="book-open"></i> ${escapeHTML(subjectText)}
        </span>
        <span class="badge ${typeClass}">
            <i data-lucide="${typeIcon}"></i> ${typeText}
        </span>
        <span class="badge ${statusConfig.class}">
            <i data-lucide="${statusConfig.icon}"></i> ${statusConfig.text}
        </span>
    `;

    DOM.modalTaskTitle.textContent = task.title;
    DOM.modalTaskDesc.textContent = task.description || 'Tidak ada deskripsi tambahan.';
    DOM.modalTaskDeadline.textContent = formatDeadline(task.deadline);
    DOM.modalTaskCountdown.textContent = relativeTime.text;
    DOM.modalTaskCreated.textContent = task.createdAt ? formatDeadline(task.createdAt) : '-';

    DOM.detailModal.classList.remove('hidden');
    renderIcons();
}

function closeDetailModal() {
    DOM.detailModal.classList.add('hidden');
}

// --- 8. EVENT LISTENERS ---
function setupEventListeners() {
    DOM.themeToggle.addEventListener('click', toggleTheme);
    
    DOM.filterChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-chip');
            if (!btn) return;
            DOM.filterChips.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });
    
    DOM.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTasks();
    });

    DOM.btnCloseModal.addEventListener('click', closeDetailModal);
    DOM.btnModalCloseAction.addEventListener('click', closeDetailModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDetailModal();
    });
}

// Bootstrap Application
document.addEventListener('DOMContentLoaded', init);
