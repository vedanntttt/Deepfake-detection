document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewSection = document.getElementById('preview-section');
    const imagePreview = document.getElementById('image-preview');
    const scanningOverlay = document.getElementById('scanning-overlay');
    const resultsDiv = document.getElementById('results');
    const realProgress = document.getElementById('real-progress');
    const fakeProgress = document.getElementById('fake-progress');
    const realScoreTxt = document.getElementById('real-score');
    const fakeScoreTxt = document.getElementById('fake-score');
    const resetBtn = document.getElementById('reset-btn');
    const errorToast = document.getElementById('error-toast');
    const errorMessage = document.getElementById('error-message');
    
    // History UI elements
    const historyGrid = document.getElementById('history-grid');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    
    const tabImage = document.getElementById('tab-image');
    const tabAudio = document.getElementById('tab-audio');

    const audioPreview = document.getElementById('audio-preview');

    let currentMode = 'image'; // 'image' or 'audio'

    // Tab Switching
    tabImage.addEventListener('click', () => switchMode('image'));
    tabAudio.addEventListener('click', () => switchMode('audio'));

    function switchMode(mode) {
        currentMode = mode;
        tabImage.classList.toggle('active', mode === 'image');
        tabAudio.classList.toggle('active', mode === 'audio');
        
        const text = uploadZone.querySelector('.upload-text');
        const subtext = uploadZone.querySelector('.upload-subtext.small');
        
        const scanningText = scanningOverlay.querySelector('p');
        const uploadIcon = uploadZone.querySelector('.upload-icon');

        if (mode === 'image') {
            fileInput.accept = "image/png, image/jpeg, image/jpg";
            text.textContent = "Drag & Drop your image here";
            subtext.textContent = "(Supported: JPG, PNG, JPEG)";
            resetBtn.textContent = "Analyze Another Image";
            scanningText.textContent = "Analyzing pixels...";
            uploadIcon.innerHTML = '<path d="M12 4L12 16M12 4L8 8M12 4L16 8M4 20L20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        } else {
            fileInput.accept = "audio/wav, audio/mpeg, audio/mp3";
            text.textContent = "Drag & Drop your audio here";
            subtext.textContent = "(Supported: WAV, MP3)";
            resetBtn.textContent = "Analyze Another Audio";
            scanningText.textContent = "Analyzing frequencies...";
            uploadIcon.innerHTML = '<path d="M12 18V6M16 14V10M8 14V10M20 16V8M4 16V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        }
        resetUI();
    }

    // Make clicking the upload zone trigger the hidden file input
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.remove('dragover');
        }, false);
    });

    uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) handleFile(files[0]);
    });

    fileInput.addEventListener('change', function() {
        if (this.files.length) handleFile(this.files[0]);
    });

    function handleFile(file) {
        if (currentMode === 'image' && !file.type.startsWith('image/')) {
            showError("Please upload a valid image file.");
            return;
        }
        if (currentMode === 'audio' && !file.type.startsWith('audio/')) {
            showError("Please upload a valid audio file.");
            return;
        }

        // Display preview
        const reader = new FileReader();
        reader.onload = (e) => {
            if (currentMode === 'image') {
                imagePreview.src = e.target.result;
                imagePreview.classList.remove('hidden');
                audioPreview.classList.add('hidden');
            } else {
                audioPreview.src = e.target.result;
                audioPreview.classList.remove('hidden');
                imagePreview.classList.add('hidden');
            }
            
            // UI Transitions
            uploadZone.classList.add('hidden');
            previewSection.classList.remove('hidden');
            scanningOverlay.classList.remove('hidden');
            resultsDiv.classList.add('hidden');
            
            // Upload to backend
            uploadToBackend(file);
        };
        reader.readAsDataURL(file);
    }

    async function uploadToBackend(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? 'http://localhost:8000' 
                : '';
            const url = `${baseUrl}/api/detect/${currentMode}`;

            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Upload failed");
            }

            const data = await response.json();
            
            // Generate visual/audio preview to store in history
            let previewData = "";
            if (currentMode === 'image') {
                previewData = imagePreview.src;
            } else {
                // Keep audio previews light by storing an icon or relying on mode instead of base64 audio
                previewData = "audio"; 
            }

            showResults(data.real_confidence, data.fake_confidence, previewData, currentMode);

        } catch (error) {
            console.error(error);
            showError("Analysis failed. Is the local backend running?");
            setTimeout(resetUI, 3000);
        }
    }

    function showResults(realConf, fakeConf, previewData, mode) {
        scanningOverlay.classList.add('hidden');
        resultsDiv.classList.remove('hidden');

        realProgress.style.width = '0%';
        fakeProgress.style.width = '0%';

        setTimeout(() => {
            realProgress.style.width = `${realConf}%`;
            fakeProgress.style.width = `${fakeConf}%`;
            animateValue(realScoreTxt, 0, realConf, 1000);
            animateValue(fakeScoreTxt, 0, fakeConf, 1000);
            
            // Now save to history
            saveToHistory(realConf, fakeConf, previewData, mode);
        }, 100);
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = (progress * (end - start) + start).toFixed(1) + "%";
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorToast.classList.remove('hidden');
        setTimeout(() => {
            errorToast.classList.add('hidden');
        }, 4000);
    }

    resetBtn.addEventListener('click', resetUI);

    function resetUI() {
        uploadZone.classList.remove('hidden');
        previewSection.classList.add('hidden');
        fileInput.value = "";
        imagePreview.src = "";
        audioPreview.src = "";
        imagePreview.classList.remove('hidden');
        audioPreview.classList.add('hidden');
        realProgress.style.width = '0%';
        fakeProgress.style.width = '0%';
        realScoreTxt.textContent = "0%";
        fakeScoreTxt.textContent = "0%";
    }

    // --- Local History Implementation ---
    function saveToHistory(realConf, fakeConf, previewData, mode) {
        let history = JSON.parse(localStorage.getItem('deepfake-history') || '[]');
        
        // Add new scan at the beginning
        history.unshift({
            id: Date.now(),
            mode: mode,
            realConf: realConf,
            fakeConf: fakeConf,
            preview: mode === 'image' ? previewData : null, // Limit storage size
            date: new Date().toLocaleString()
        });
        
        // Keep only the last 10 scans to not exceed LocalStorage limits
        if (history.length > 10) { history.pop(); }
        
        localStorage.setItem('deepfake-history', JSON.stringify(history));
        loadHistory();
    }

    function loadHistory() {
        const history = JSON.parse(localStorage.getItem('deepfake-history') || '[]');
        
        if (history.length === 0) {
            historyGrid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 1rem; text-align: center; grid-column: 1 / -1;">No recent scans yet.</p>';
            clearHistoryBtn.style.display = 'none';
            return;
        }

        historyGrid.innerHTML = '';
        clearHistoryBtn.style.display = 'block';
        
        history.forEach(item => {
            const isFake = item.fakeConf > item.realConf;
            const card = document.createElement('div');
            card.className = 'history-card';
            
            let previewHTML = '';
            if (item.mode === 'image' && item.preview) {
                previewHTML = `<img src="${item.preview}" alt="Scan thumbnail">`;
            } else {
                // Audio placeholder
                previewHTML = `<div class="history-card-audio">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 18V6M16 14V10M8 14V10M20 16V8M4 16V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>`;
            }

            card.innerHTML = `
                ${previewHTML}
                <div class="history-info">
                    <span class="history-date">${item.date}</span>
                    <span class="history-badge ${isFake ? 'badge-fake' : 'badge-real'}">
                        ${isFake ? 'FAKE (' + item.fakeConf + '%)' : 'REAL (' + item.realConf + '%)'}
                    </span>
                </div>
            `;
            historyGrid.appendChild(card);
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('deepfake-history');
        loadHistory();
    });

    // Load history on startup
    loadHistory();
});

