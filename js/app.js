/**
 * FocusFlow Task Manager
 * JavaScript Logic (Bulletproof - LocalStorage + Supabase Hybrid Sync)
 */

// --- 0. KONFIGURASI SUPABASE ---
const SUPABASE_URL = 'https://pzatorrpfumpbpzuyeob.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6YXRvcnJwZnVtcGJwenV5ZW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNzcwNjUsImV4cCI6MjEwMzY1MzA2NX0.22qH2ruiAW6mep97CK9QF5pnNIQVX-orLmQScnhxH80';
let supabaseClient = null;

// --- 1. STATE & CONSTANTS ---
const LOCAL_STORAGE_KEY = 'focusflow_tasks_data';
const THEME_KEY = 'focusflow_theme';

let tasks = [];
let currentFilter = 'all'; 
let searchQuery = '';
let editingTaskId = null; 
let deletingTaskId = null; 
let deadlinePicker = null; // Flatpickr Instance

// DOM Elements
const DOM = {
    themeToggle: document.getElementById('theme-toggle'),
    themeIconMoon: document.getElementById('theme-icon-moon'),
    themeIconSun: document.getElementById('theme-icon-sun'),
    
    statTotal: document.getElementById('stat-total'),
    statActive: document.getElementById('stat-active'),
    statCompleted: document.getElementById('stat-completed'),
    statUrgent: document.getElementById('stat-urgent'),
    
    filterChips: document.querySelectorAll('.filter-chip'),
    searchInput: document.getElementById('search-input'),
    taskList: document.getElementById('task-list'),
    
    taskModal: document.getElementById('task-modal'),
    deleteModal: document.getElementById('delete-modal'),
    
    taskForm: document.getElementById('task-form'),
    modalTitle: document.getElementById('modal-title'),
    submitBtnText: document.getElementById('submit-btn-text'),
    inputTitle: document.getElementById('task-title-input'),
    inputSubject: document.getElementById('task-subject-input'),
    inputType: document.getElementById('task-type-input'),
    inputDeadline: document.getElementById('task-deadline-input'),
    inputDesc: document.getElementById('task-desc-input'),
    
    errorTitle: document.getElementById('error-title'),
    errorSubject: document.getElementById('error-subject'),
    errorType: document.getElementById('error-type'),
    errorDeadline: document.getElementById('error-deadline'),
    errorDesc: document.getElementById('error-desc'),
    
    deletePreview: document.getElementById('delete-task-preview'),
    
    btnAddNav: document.getElementById('btn-add-task'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    btnCloseDelete: document.getElementById('btn-close-delete-modal'),
    btnCancelDelete: document.getElementById('btn-cancel-delete'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),
    
    toastContainer: document.getElementById('toast-container')
};

// --- 2. INITIALIZATION ---
function init() {
    applyTheme();
    setupCustomSelects();
    initDeadlinePicker(); 
    setupEventListeners();

    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (err) {
        console.warn('Inisialisasi Supabase gagal, menggunakan LocalStorage:', err);
    }

    loadTasks();
    setInterval(renderTasks, 60000);
}

function renderIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// --- 3. THEME MANAGEMENT ---
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

// --- 4. DATA STORAGE & SYNC ---
function saveToLocalStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tasks));
}

async function loadTasks() {
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
        try {
            tasks = JSON.parse(localData);
        } catch (e) {
            tasks = [];
        }
    }
    renderTasks();

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
                saveToLocalStorage();
                renderTasks();
            }
        } catch (error) {
            console.warn("Gagal memuat data dari cloud, menggunakan data lokal.");
        }
    }
}

// --- 5. LOGIC & HELPERS ---
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

// --- 6. COMPONENTS & PLUGINS ---
function initDeadlinePicker() {
    if (typeof flatpickr !== 'undefined') {
        deadlinePicker = flatpickr("#task-deadline-input", {
            enableTime: true,
            time_24hr: true,
            locale: "id",
            disableMobile: true,
            altInput: true,
            altFormat: "l, d F Y • H:i", 
            dateFormat: "Z",
            altInputClass: "input-custom-flatpickr" 
        });
    }
}

function setupCustomSelects() {
    const customSelects = document.querySelectorAll('.custom-select');

    customSelects.forEach(selectEl => {
        const trigger = selectEl.querySelector('.custom-select-trigger');
        const options = selectEl.querySelectorAll('.custom-option');
        const targetSelectId = selectEl.id === 'custom-select-subject' ? 'task-subject-input' : 'task-type-input';
        const targetSelect = document.getElementById(targetSelectId);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            customSelects.forEach(s => {
                if (s !== selectEl) s.classList.remove('active');
            });
            selectEl.classList.toggle('active');
        });

        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;
                setCustomSelectValue(selectEl.id, val);
                selectEl.classList.remove('active');

                const event = new Event('change', { bubbles: true });
                targetSelect.dispatchEvent(event);
            });
        });
    });

    document.addEventListener('click', () => {
        customSelects.forEach(s => s.classList.remove('active'));
    });
}

function setCustomSelectValue(customSelectId, value) {
    const selectEl = document.getElementById(customSelectId);
    if (!selectEl) return;

    const triggerValue = selectEl.querySelector('.custom-select-value');
    const options = selectEl.querySelectorAll('.custom-option');
    const targetSelectId = customSelectId === 'custom-select-subject' ? 'task-subject-input' : 'task-type-input';
    const targetSelect = document.getElementById(targetSelectId);

    if (targetSelect) {
        targetSelect.value = value;
    }

    let foundOpt = null;
    options.forEach(opt => {
        if (opt.dataset.value === value) {
            opt.classList.add('selected');
            foundOpt = opt;
        } else {
            opt.classList.remove('selected');
        }
    });

    if (foundOpt) {
        triggerValue.textContent = foundOpt.textContent;
        if (foundOpt.classList.contains('placeholder')) {
            triggerValue.classList.add('placeholder-style');
            triggerValue.style.color = 'var(--text-muted)';
        } else {
            triggerValue.classList.remove('placeholder-style');
            triggerValue.style.color = 'var(--text-primary)';
        }
    }
}

// --- 7. RENDER ---
function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.isCompleted).length;
    const active = total - completed;
    
    const urgentCount = tasks.filter(t => {
        const status = getDeadlineStatus(t.deadline, t.isCompleted);
        return status === 'urgent' || status === 'warning';
    }).length;
    
    DOM.statTotal.textContent = total;
    DOM.statActive.textContent = active;
    DOM.statCompleted.textContent = completed;
    DOM.statUrgent.textContent = urgentCount;
}

function filterTasks() {
    let filtered = tasks;
    
    if (currentFilter !== 'all') {
        if (currentFilter === 'individual') filtered = filtered.filter(t => t.type === 'individual');
        if (currentFilter === 'group') filtered = filtered.filter(t => t.type === 'group');
        if (currentFilter === 'active') filtered = filtered.filter(t => !t.isCompleted);
        if (currentFilter === 'completed') filtered = filtered.filter(t => t.isCompleted);
    }
    
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => 
            t.title.toLowerCase().includes(query) || 
            (t.description && t.description.toLowerCase().includes(query)) ||
            (t.subject && t.subject.toLowerCase().includes(query))
        );
    }
    
    filtered.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });
    
    return filtered;
}

function renderTasks() {
    const filteredTasks = filterTasks();
    updateStatistics();
    
    DOM.taskList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
        const isDefault = tasks.length === 0;
        const emptyTitle = isDefault ? 'Belum ada tugas' : 'Tidak ada tugas yang cocok';
        const emptyDesc = isDefault 
            ? 'Tambahkan tugas pertama untuk mulai mengatur fokusmu.' 
            : 'Coba ubah kata kunci pencarian atau filter tugas.';
        
        DOM.taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon-wrapper">
                    <i data-lucide="clipboard-list"></i>
                </div>
                <h3 class="empty-title">${emptyTitle}</h3>
                <p class="empty-desc">${emptyDesc}</p>
                ${isDefault ? `
                    <button class="btn btn-primary" id="btn-empty-add">
                        <i data-lucide="plus"></i>
                        <span>Tambah Tugas</span>
                    </button>
                ` : ''}
            </div>
        `;

        const btnEmptyAdd = document.getElementById('btn-empty-add');
        if (btnEmptyAdd) {
            btnEmptyAdd.addEventListener('click', () => openModal('add'));
        }
        
        renderIcons();
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    filteredTasks.forEach(task => {
        const status = getDeadlineStatus(task.deadline, task.isCompleted);
        const statusConfig = getBadgeConfig(status);
        
        const typeClass = task.type === 'individual' ? 'badge-type-individual' : 'badge-type-group';
        const typeIcon = task.type === 'individual' ? 'user' : 'users';
        const typeText = task.type === 'individual' ? 'Individu' : 'Kelompok';
        const subjectText = task.subject && task.subject !== '-' ? task.subject : 'Tanpa Mapel';
        
        const article = document.createElement('article');
        article.className = 'task-card';
        
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
                <div class="task-meta">
                    <i data-lucide="calendar"></i>
                    <time datetime="${task.deadline}">${formatDeadline(task.deadline)}</time>
                </div>
                <div class="task-actions">
                    <button class="btn btn-icon btn-toggle-task" data-id="${task.id}" title="${task.isCompleted ? 'Batalkan selesai' : 'Tandai selesai'}">
                        <i data-lucide="${task.isCompleted ? 'rotate-ccw' : 'check'}"></i>
                    </button>
                    <button class="btn btn-icon btn-edit-task" data-id="${task.id}" title="Edit">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn btn-icon btn-delete-task danger-text" data-id="${task.id}" title="Hapus">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
        fragment.appendChild(article);
    });
    
    DOM.taskList.appendChild(fragment);
    renderIcons();
}

// --- 8. MODALS & FORMS ---
function openModal(mode, taskIdStr = null) {
    resetFormErrors();
    
    if (mode === 'add') {
        editingTaskId = null;
        DOM.modalTitle.textContent = 'Tambah Tugas Baru';
        DOM.submitBtnText.textContent = 'Simpan Tugas';
        DOM.taskForm.reset();
        
        setCustomSelectValue('custom-select-subject', '');
        setCustomSelectValue('custom-select-type', 'individual');
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if(deadlinePicker) deadlinePicker.setDate(tomorrow);
        
    } else if (mode === 'edit' && taskIdStr) {
        const task = tasks.find(t => String(t.id) === String(taskIdStr));
        if (!task) return;
        
        editingTaskId = task.id; 
        
        DOM.modalTitle.textContent = 'Edit Tugas';
        DOM.submitBtnText.textContent = 'Simpan Perubahan';
        
        DOM.inputTitle.value = task.title;
        
        const subjVal = (task.subject && task.subject !== '-') ? task.subject : '';
        setCustomSelectValue('custom-select-subject', subjVal);
        setCustomSelectValue('custom-select-type', task.type || 'individual');
        
        if(deadlinePicker) deadlinePicker.setDate(new Date(task.deadline));
        DOM.inputDesc.value = task.description || '';
    }
    
    DOM.taskModal.classList.remove('hidden');
    DOM.inputTitle.focus();
}

function closeModal() {
    DOM.taskModal.classList.add('hidden');
    editingTaskId = null;
    DOM.taskForm.reset();
    setCustomSelectValue('custom-select-subject', '');
    setCustomSelectValue('custom-select-type', 'individual');
}

function openDeleteModal(taskIdStr) {
    const task = tasks.find(t => String(t.id) === String(taskIdStr));
    if (!task) return;
    
    deletingTaskId = task.id; 
    DOM.deletePreview.textContent = task.title;
    DOM.deleteModal.classList.remove('hidden');
    DOM.btnConfirmDelete.focus();
}

function closeDeleteModal() {
    DOM.deleteModal.classList.add('hidden');
    deletingTaskId = null;
    DOM.deletePreview.textContent = '';
}

function resetFormErrors() {
    DOM.errorTitle.textContent = '';
    DOM.errorSubject.textContent = '';
    DOM.errorType.textContent = '';
    DOM.errorDeadline.textContent = '';
    DOM.errorDesc.textContent = '';
}

function validateForm() {
    resetFormErrors();
    let isValid = true;
    
    const title = DOM.inputTitle.value.trim();
    if (title.length < 3) {
        DOM.errorTitle.textContent = 'Nama tugas minimal 3 karakter.';
        isValid = false;
    } else if (title.length > 100) {
        DOM.errorTitle.textContent = 'Nama tugas maksimal 100 karakter.';
        isValid = false;
    }
    
    if (!DOM.inputSubject.value) {
        DOM.errorSubject.textContent = 'Pilih mata pelajaran.';
        isValid = false;
    }
    
    if (!DOM.inputType.value) {
        DOM.errorType.textContent = 'Pilih jenis tugas.';
        isValid = false;
    }
    
    if (!DOM.inputDeadline.value) {
        DOM.errorDeadline.textContent = 'Tentukan batas waktu tugas.';
        isValid = false;
    }
    
    return isValid;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;
    
    const title = DOM.inputTitle.value.trim();
    const subject = DOM.inputSubject.value;
    const type = DOM.inputType.value;
    
    const selectedDate = deadlinePicker ? deadlinePicker.selectedDates[0] : null;
    const deadlineIso = selectedDate ? selectedDate.toISOString() : new Date().toISOString();
    
    const description = DOM.inputDesc.value.trim();
    
    if (editingTaskId !== null) {
        const currentTaskId = editingTaskId; 
        
        const index = tasks.findIndex(t => t.id === currentTaskId); 
        if (index !== -1) {
            tasks[index] = { ...tasks[index], title, subject, type, deadline: deadlineIso, description };
        }
        
        saveToLocalStorage();
        renderTasks();
        showToast('Tugas berhasil diperbarui.', 'success');
        
        closeModal();

        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('tasks')
                .update({ title, subject, type, deadline: deadlineIso, description })
                .eq('id', currentTaskId);

            if (error) {
                console.error('Gagal mengupdate database Supabase:', error);
                showToast('Terjadi kesalahan saat sinkronisasi ke database.', 'error');
            }
        }

    } else {
        const tempId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const newTask = {
            id: tempId,
            title,
            subject,
            type,
            deadline: deadlineIso,
            description,
            isCompleted: false,
            createdAt: new Date().toISOString()
        };
        
        tasks.unshift(newTask);
        saveToLocalStorage();
        renderTasks();
        showToast('Tugas berhasil ditambahkan.', 'success');
        
        closeModal();

        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('tasks')
                .insert([{
                    title, subject, type, deadline: deadlineIso, description, is_completed: false
                }])
                .select();

            if (!error && data && data.length > 0) {
                const realIndex = tasks.findIndex(t => t.id === tempId);
                if (realIndex !== -1) {
                    tasks[realIndex].id = data[0].id;
                    saveToLocalStorage();
                    renderTasks();
                }
            } else if (error) {
                console.error('Gagal menyimpan tugas baru ke Supabase:', error);
            }
        }
    }
}

async function handleTaskDelete() {
    if (deletingTaskId === null) return;
    
    const idToDelete = deletingTaskId;
    tasks = tasks.filter(t => t.id !== idToDelete);
    
    saveToLocalStorage();
    renderTasks();
    showToast('Tugas berhasil dihapus.', 'success');
    closeDeleteModal();

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', idToDelete);
            
        if (error) console.error('Gagal menghapus dari Supabase:', error);
    }
}

async function handleTaskToggle(taskIdStr) {
    const task = tasks.find(t => String(t.id) === String(taskIdStr));
    if (!task) return;
    
    task.isCompleted = !task.isCompleted;
    saveToLocalStorage();
    renderTasks();
    
    const actionText = task.isCompleted ? 'diselesaikan' : 'diaktifkan kembali';
    showToast(`Tugas berhasil ${actionText}.`, 'success');

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ is_completed: task.isCompleted })
            .eq('id', task.id);
            
        if (error) console.error('Gagal mengubah status di Supabase:', error);
    }
}

// --- 9. TOAST NOTIFICATION ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconName = type === 'success' ? 'check-circle-2' : 'alert-circle';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${escapeHTML(message)}</span>
    `;
    
    DOM.toastContainer.appendChild(toast);
    renderIcons();
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

// --- 10. EVENT LISTENERS ---
function setupEventListeners() {
    DOM.themeToggle.addEventListener('click', toggleTheme);
    
    DOM.btnAddNav.addEventListener('click', () => openModal('add'));
    DOM.btnCloseModal.addEventListener('click', closeModal);
    DOM.btnCancelModal.addEventListener('click', closeModal);
    DOM.taskForm.addEventListener('submit', handleFormSubmit);
    
    DOM.btnCloseDelete.addEventListener('click', closeDeleteModal);
    DOM.btnCancelDelete.addEventListener('click', closeDeleteModal);
    DOM.btnConfirmDelete.addEventListener('click', handleTaskDelete);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeDeleteModal();
        }
    });
    
    DOM.filterChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            DOM.filterChips.forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTasks();
        });
    });
    
    DOM.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTasks();
    });
    
    DOM.taskList.addEventListener('click', (e) => {
        const btnToggle = e.target.closest('.btn-toggle-task');
        const btnEdit = e.target.closest('.btn-edit-task');
        const btnDelete = e.target.closest('.btn-delete-task');
        
        if (btnToggle) handleTaskToggle(btnToggle.dataset.id);
        else if (btnEdit) openModal('edit', btnEdit.dataset.id);
        else if (btnDelete) openDeleteModal(btnDelete.dataset.id);
    });
}

// Bootstrap App
document.addEventListener('DOMContentLoaded', init);