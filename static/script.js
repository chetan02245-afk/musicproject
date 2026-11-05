/* SonicSplit Studio — script.js */
document.addEventListener('DOMContentLoaded', () => {

    // ── DOM refs ────────────────────────────────────────────────────────────
    const dragArea          = document.getElementById('dragArea');
    const fileInput         = document.getElementById('fileInput');
    const browseBtn         = document.getElementById('browseBtn');
    const fileNameDisplay   = document.getElementById('fileNameDisplay');
    const fileDetailsDisplay= document.getElementById('fileDetailsDisplay');
    const fileInspector     = document.getElementById('fileInspector');
    const clearFileBtn      = document.getElementById('clearFileBtn');
    const processBtn        = document.getElementById('processBtn');
    const modeSelect        = document.getElementById('modeSelect');

    const tabFileBtn        = document.getElementById('tabFileBtn');
    const tabUrlBtn         = document.getElementById('tabUrlBtn');
    const urlInputContainer = document.getElementById('urlInputContainer');
    const urlInput          = document.getElementById('urlInput');
    const fetchUrlBtn       = document.getElementById('fetchUrlBtn');

    const uploadSection     = document.getElementById('uploadSection');
    const loadingSection    = document.getElementById('loadingSection');
    const resultsSection    = document.getElementById('resultsSection');

    const progressPercent   = document.getElementById('progressPercent');
    const progressArc       = document.getElementById('progressArc');
    const progressBarFill   = document.getElementById('progressBarFill');
    const loadingStatusTitle= document.getElementById('loadingStatusTitle');
    const loadingStatusSub  = document.getElementById('loadingStatusSub');

    const stage1 = document.getElementById('stage1');
    const stage2 = document.getElementById('stage2');
    const stage3 = document.getElementById('stage3');
    const stage4 = document.getElementById('stage4');

    const toast        = document.getElementById('toast');
    const toastIcon    = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    // ── State ───────────────────────────────────────────────────────────────
    const STEMS = ['vocals', 'drums', 'bass', 'other'];
    const COLORS = { vocals: '#f43f5e', drums: '#38bdf8', bass: '#a855f7', other: '#10b981' };

    let selectedFile     = null;
    let uploadedFilename = null;
    let pollInterval     = null;
    let wavesurfers      = {};
    let pannerNodes      = {};
    let masterVolume     = 1;
    let isLooping        = false;
    let isPlaying        = false;
    let activeSoloTrack  = null;
    let activeModel      = 'htdemucs';
    let activeBaseName   = '';
    let isSeeking        = false;

    const trackStates = {
        vocals: { volume: 1, muted: false, pan: 0 },
        drums:  { volume: 1, muted: false, pan: 0 },
        bass:   { volume: 1, muted: false, pan: 0 },
        other:  { volume: 1, muted: false, pan: 0 }
    };

    // ── Toast ───────────────────────────────────────────────────────────────
    let _toastTimer = null;
    function showToast(msg, icon = '✨') {
        if (_toastTimer) clearTimeout(_toastTimer);
        toastIcon.textContent = icon;
        toastMessage.textContent = msg;
        toast.classList.remove('hidden');
        _toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function formatBytes(b) {
        if (!b) return '0 B';
        const i = Math.floor(Math.log(b) / Math.log(1024));
        return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B','KB','MB','GB'][i];
    }
    function formatTime(s) {
        if (!s || isNaN(s) || s < 0) return '00:00';
        return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
    }

    // Update the circular SVG arc based on progress (0-100)
    function setProgressArc(pct) {
        if (progressArc) progressArc.setAttribute('stroke-dasharray', `${pct}, 100`);
        if (progressPercent) progressPercent.textContent = `${pct}%`;
        if (progressBarFill) progressBarFill.style.width = `${pct}%`;
    }

    // ── Tabs ────────────────────────────────────────────────────────────────
    tabFileBtn.addEventListener('click', () => {
        tabFileBtn.classList.add('active');
        tabUrlBtn.classList.remove('active');
        dragArea.classList.remove('hidden');
        urlInputContainer.classList.add('hidden');
    });
    tabUrlBtn.addEventListener('click', () => {
        tabUrlBtn.classList.add('active');
        tabFileBtn.classList.remove('active');
        dragArea.classList.add('hidden');
        urlInputContainer.classList.remove('hidden');
    });

    // ── URL Fetch ────────────────────────────────────────────────────────────
    fetchUrlBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) { showToast('Please enter an audio URL', '⚠️'); return; }

        fetchUrlBtn.disabled = true;
        fetchUrlBtn.textContent = 'Fetching…';
        showToast('Fetching audio from URL…', '🌐');

        try {
            const res  = await fetch('/upload_url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'URL fetch failed');

            selectedFile     = null;
            uploadedFilename = data.filename;
            fileNameDisplay.textContent   = data.original_name || data.filename;
            fileDetailsDisplay.textContent= 'Web Audio · Ready';
            fileInspector.classList.remove('hidden');
            processBtn.disabled = false;
            showToast(`Loaded: ${data.original_name || data.filename}`, '🎵');
        } catch (err) {
            showToast(`Error: ${err.message}`, '❌');
        } finally {
            fetchUrlBtn.disabled = false;
            fetchUrlBtn.textContent = 'Fetch';
        }
    });

    // ── File Browse & Drag ──────────────────────────────────────────────────
    browseBtn.addEventListener('click', () => fileInput.click());

    ['dragenter','dragover'].forEach(e => dragArea.addEventListener(e, ev => {
        ev.preventDefault(); dragArea.classList.add('active');
    }));
    ['dragleave','drop'].forEach(e => dragArea.addEventListener(e, ev => {
        ev.preventDefault(); dragArea.classList.remove('active');
    }));
    dragArea.addEventListener('drop', e => {
        const f = e.dataTransfer.files?.[0];
        if (f) handleFileSelect(f);
    });
    fileInput.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (f) handleFileSelect(f);
    });

    function handleFileSelect(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['mp3','wav','flac','m4a','aac','ogg'].includes(ext)) {
            showToast('Unsupported format. Use MP3, WAV, FLAC, M4A, OGG.', '⚠️'); return;
        }
        selectedFile     = file;
        uploadedFilename = null;
        fileNameDisplay.textContent    = file.name;
        fileDetailsDisplay.textContent = `${formatBytes(file.size)} · ${ext.toUpperCase()}`;
        fileInspector.classList.remove('hidden');
        processBtn.disabled = false;
        showToast(`Loaded: ${file.name}`, '🎵');
    }

    clearFileBtn.addEventListener('click', () => {
        selectedFile = null; uploadedFilename = null;
        if (fileInput) fileInput.value = '';
        if (urlInput)  urlInput.value  = '';
        fileInspector.classList.add('hidden');
        processBtn.disabled = true;
        showToast('File removed', '🗑️');
    });

    // ── Start Separation ────────────────────────────────────────────────────
    processBtn.addEventListener('click', async () => {
        if (!selectedFile && !uploadedFilename) return;

        uploadSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        resetStages();
        setProgressArc(0);

        try {
            let filename = uploadedFilename;

            if (!filename && selectedFile) {
                updateStage(stage1, 'active');
                loadingStatusTitle.textContent = 'Uploading audio…';
                const fd = new FormData();
                fd.append('file', selectedFile);
                const r  = await fetch('/upload', { method: 'POST', body: fd });
                const d  = await r.json();
                if (!r.ok) throw new Error(d.error || 'Upload failed');
                filename = d.filename;
                uploadedFilename = filename;
                updateStage(stage1, 'completed');
            } else {
                updateStage(stage1, 'completed');
            }

            updateStage(stage2, 'active');
            loadingStatusTitle.textContent = 'Starting AI engine…';

            const mode = modeSelect ? modeSelect.value : 'balanced';
            const sr   = await fetch('/separate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, mode })
            });
            const sd = await sr.json();
            if (!sr.ok) throw new Error(sd.error || 'Separation failed to start');

            pollJobStatus(sd.job_id);

        } catch (err) {
            showToast(`Error: ${err.message}`, '❌');
            loadingSection.classList.add('hidden');
            uploadSection.classList.remove('hidden');
        }
    });

    // ── Polling ─────────────────────────────────────────────────────────────
    function pollJobStatus(jobId) {
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            try {
                const res  = await fetch(`/status/${jobId}`);
                if (!res.ok) return;
                const data = await res.json();
                const pct  = data.progress || 0;

                setProgressArc(pct);
                loadingStatusTitle.textContent = data.message || 'Processing…';

                if (pct >= 15) updateStage(stage2, 'completed');
                if (pct >= 25) updateStage(stage3, 'active');
                if (pct >= 95) updateStage(stage3, 'completed');

                if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    updateStage(stage4, 'completed');
                    setProgressArc(100);
                    activeModel    = data.model    || 'htdemucs';
                    activeBaseName = data.base_name || 'track';

                    setTimeout(() => {
                        loadingSection.classList.add('hidden');
                        resultsSection.classList.remove('hidden');
                        document.getElementById('currentTrackTitle').textContent = activeBaseName;
                        document.getElementById('downloadZipBtn').onclick = () => {
                            window.location.href = `/download_zip/${activeModel}/${encodeURIComponent(activeBaseName)}`;
                        };
                        initPlayers(data.stems);
                        showToast('Stems ready! Adjust your mix below.', '🎉');
                    }, 400);

                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    throw new Error(data.error || 'Separation failed');
                }

            } catch (err) {
                clearInterval(pollInterval);
                showToast(`Failed: ${err.message}`, '❌');
                loadingSection.classList.add('hidden');
                uploadSection.classList.remove('hidden');
            }
        }, 700);
    }

    // ── Stage helpers ────────────────────────────────────────────────────────
    function resetStages() {
        [stage1,stage2,stage3,stage4].forEach(s => { if (s) s.className = 'step'; });
        loadingStatusTitle.textContent = 'Preparing audio…';
        loadingStatusSub.textContent   = 'Demucs AI is isolating your stems.';
    }
    function updateStage(el, state) {
        if (!el) return;
        el.classList.remove('active','completed');
        if (state) el.classList.add(state);
    }

    // ── Destroy & Reset ──────────────────────────────────────────────────────
    function destroyPlayers() {
        STEMS.forEach(s => {
            if (wavesurfers[s]) {
                try { wavesurfers[s].pause(); wavesurfers[s].destroy(); } catch {}
                wavesurfers[s] = null;
            }
            const c = document.getElementById(`waveform-${s}`);
            if (c) c.innerHTML = '';
        });
        wavesurfers  = {};
        pannerNodes  = {};
    }

    function resetToUploadView() {
        destroyPlayers();
        isPlaying = false; activeSoloTrack = null;
        selectedFile = null; uploadedFilename = null;
        if (fileInput) fileInput.value = '';
        if (urlInput)  urlInput.value  = '';
        fileInspector.classList.add('hidden');
        fileNameDisplay.textContent    = '';
        fileDetailsDisplay.textContent = '';
        processBtn.disabled = true;

        const pb = document.getElementById('playAllBtn');
        if (pb) pb.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Play</span>`;

        STEMS.forEach(s => {
            trackStates[s] = { volume:1, muted:false, pan:0 };
            const mBtn = document.querySelector(`.mute-btn[data-target="${s}"]`);
            const sBtn = document.querySelector(`.solo-btn[data-target="${s}"]`);
            const vol  = document.querySelector(`.volume-slider[data-target="${s}"]`);
            const pan  = document.querySelector(`.pan-slider[data-target="${s}"]`);
            if (mBtn) mBtn.classList.remove('active');
            if (sBtn) sBtn.classList.remove('active');
            if (vol)  vol.value = 1;
            if (pan)  pan.value = 0;
            const vv = document.getElementById(`vol-val-${s}`);
            const pv = document.getElementById(`pan-val-${s}`);
            if (vv) vv.textContent = '100%';
            if (pv) pv.textContent = 'C';
        });

        resetStages();
        setProgressArc(0);
        resultsSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        showToast('Ready — drop a new track', '🎵');
    }

    document.getElementById('newSongBtn')?.addEventListener('click', resetToUploadView);

    // ── Web Audio stereo panner ──────────────────────────────────────────────
    function setupPanner(stem, ws) {
        try {
            const mediaEl = ws.getMediaElement?.();
            if (!mediaEl) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!window._studioCtx) window._studioCtx = new AC();
            const ctx = window._studioCtx;
            if (ctx.state === 'suspended') {
                const resume = () => { ctx.resume(); document.removeEventListener('click', resume); };
                document.addEventListener('click', resume);
            }
            if (ctx.createStereoPanner && !ws._pannerConnected) {
                const src     = ctx.createMediaElementSource(mediaEl);
                const panner  = ctx.createStereoPanner();
                panner.pan.value = trackStates[stem].pan;
                src.connect(panner); panner.connect(ctx.destination);
                pannerNodes[stem]    = panner;
                ws._pannerConnected  = true;
            }
        } catch {}
    }

    // ── Init WaveSurfer players ──────────────────────────────────────────────
    function initPlayers(stemUrls) {
        destroyPlayers();
        let loaded = 0;
        const total = STEMS.length;

        STEMS.forEach(stem => {
            const container = document.getElementById(`waveform-${stem}`);
            if (!container) return;
            container.innerHTML = '';

            const ws = WaveSurfer.create({
                container,
                waveColor:     'rgba(255,255,255,0.14)',
                progressColor: COLORS[stem],
                cursorColor:   '#f59e0b',
                cursorWidth:   2,
                barWidth:      2,
                barGap:        1,
                barRadius:     2,
                height:        60,
                normalize:     true,
                interact:      true
            });

            ws.load(stemUrls[stem]);
            wavesurfers[stem] = ws;

            ws.on('ready', () => {
                loaded++;
                setupPanner(stem, ws);
                ws.setVolume(trackStates[stem].volume * masterVolume);
                ws.setMuted(trackStates[stem].muted);
                if (loaded === total) updateTimeDisplays();
            });

            ws.on('interaction', () => {
                const dur = ws.getDuration();
                if (dur > 0) {
                    const ratio = ws.getCurrentTime() / dur;
                    STEMS.forEach(s => { if (s !== stem && wavesurfers[s]) wavesurfers[s].seekTo(ratio); });
                }
                updateTimeDisplays();
            });

            ws.on('timeupdate', () => {
                if (stem === 'vocals') updateTimeDisplays();
            });

            ws.on('finish', () => {
                if (isLooping && stem === 'vocals') {
                    STEMS.forEach(s => wavesurfers[s]?.play());
                }
            });

            const dlLink = document.getElementById(`download-${stem}`);
            if (dlLink) dlLink.href = stemUrls[stem];
        });
    }

    // ── Time display ─────────────────────────────────────────────────────────
    function updateTimeDisplays() {
        const ref = wavesurfers['vocals'] || Object.values(wavesurfers)[0];
        if (!ref) return;
        const cur = ref.getCurrentTime();
        const dur = ref.getDuration();
        const curEl = document.getElementById('currentTimeDisplay');
        const durEl = document.getElementById('totalDurationDisplay');
        if (curEl) curEl.textContent = formatTime(cur);
        if (durEl) durEl.textContent = formatTime(dur);
        const sb = document.getElementById('masterSeekBar');
        if (sb && !isSeeking && dur > 0) sb.value = (cur / dur) * 100;
    }

    // ── Master Transport ──────────────────────────────────────────────────────
    function setupMasterControls() {
        const playBtn    = document.getElementById('playAllBtn');
        const stopBtn    = document.getElementById('stopAllBtn');
        const loopBtn    = document.getElementById('loopBtn');
        const seekBar    = document.getElementById('masterSeekBar');
        const volSlider  = document.getElementById('masterVolumeSlider');
        const speedSel   = document.getElementById('speedSelect');
        const zoomSlider = document.getElementById('zoomSlider');

        isPlaying = false;

        if (playBtn) {
            playBtn.onclick = () => {
                isPlaying = !isPlaying;
                if (isPlaying) {
                    playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pause</span>`;
                    STEMS.forEach(s => wavesurfers[s]?.play());
                } else {
                    playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Play</span>`;
                    STEMS.forEach(s => wavesurfers[s]?.pause());
                }
            };
        }

        if (stopBtn) {
            stopBtn.onclick = () => {
                isPlaying = false;
                if (playBtn) playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Play</span>`;
                STEMS.forEach(s => wavesurfers[s]?.stop());
                updateTimeDisplays();
            };
        }

        if (loopBtn) {
            loopBtn.onclick = () => {
                isLooping = !isLooping;
                loopBtn.classList.toggle('active', isLooping);
                showToast(isLooping ? 'Loop ON' : 'Loop OFF', '🔁');
            };
        }

        if (seekBar) {
            seekBar.addEventListener('mousedown',  () => isSeeking = true);
            seekBar.addEventListener('touchstart', () => isSeeking = true);
            const commitSeek = e => {
                isSeeking = false;
                const pct = parseFloat(e.target.value) / 100;
                STEMS.forEach(s => wavesurfers[s]?.seekTo(pct));
                updateTimeDisplays();
            };
            seekBar.addEventListener('change',   commitSeek);
            seekBar.addEventListener('mouseup',  commitSeek);
            seekBar.addEventListener('touchend', commitSeek);
            seekBar.oninput = e => {
                const pct = parseFloat(e.target.value) / 100;
                STEMS.forEach(s => wavesurfers[s]?.seekTo(pct));
                updateTimeDisplays();
            };
        }

        if (volSlider) {
            volSlider.oninput = e => {
                masterVolume = parseFloat(e.target.value);
                STEMS.forEach(s => { if (wavesurfers[s]) wavesurfers[s].setVolume(trackStates[s].volume * masterVolume); });
            };
        }

        if (speedSel) {
            speedSel.onchange = e => {
                const r = parseFloat(e.target.value);
                STEMS.forEach(s => wavesurfers[s]?.setPlaybackRate(r));
            };
        }

        if (zoomSlider) {
            zoomSlider.oninput = e => {
                const z = parseInt(e.target.value, 10);
                STEMS.forEach(s => wavesurfers[s]?.zoom(z));
            };
        }

        // Mix Presets
        const resetMix = () => {
            activeSoloTrack = null;
            document.querySelectorAll('.solo-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mute-btn').forEach(b => b.classList.remove('active'));
            if (speedSel) speedSel.value = '1.0';
            STEMS.forEach(s => {
                trackStates[s] = { volume:1, muted:false, pan:0 };
                wavesurfers[s]?.setVolume(1 * masterVolume);
                wavesurfers[s]?.setMuted(false);
                wavesurfers[s]?.setPlaybackRate(1.0);
                const vol = document.querySelector(`.volume-slider[data-target="${s}"]`);
                const pan = document.querySelector(`.pan-slider[data-target="${s}"]`);
                const vv  = document.getElementById(`vol-val-${s}`);
                const pv  = document.getElementById(`pan-val-${s}`);
                if (vol) vol.value = 1;
                if (pan) pan.value = 0;
                if (vv)  vv.textContent = '100%';
                if (pv)  pv.textContent = 'C';
                if (pannerNodes[s]) pannerNodes[s].pan.value = 0;
            });
        };

        document.getElementById('resetMixerBtn')?.addEventListener('click', () => {
            resetMix(); showToast('Mix reset', '🔄');
        });

        document.getElementById('presetKaraoke')?.addEventListener('click', () => {
            resetMix();
            trackStates['vocals'].muted = true;
            wavesurfers['vocals']?.setMuted(true);
            document.querySelector('.mute-btn[data-target="vocals"]')?.classList.add('active');
            showToast('Karaoke — vocals muted', '🎤');
        });

        document.getElementById('presetAcapella')?.addEventListener('click', () => {
            resetMix();
            activeSoloTrack = 'vocals';
            STEMS.forEach(s => { wavesurfers[s]?.setMuted(s !== 'vocals'); });
            document.querySelector('.solo-btn[data-target="vocals"]')?.classList.add('active');
            showToast('Acapella — vocals only', '🎙️');
        });

        document.getElementById('presetDnB')?.addEventListener('click', () => {
            resetMix();
            ['vocals','other'].forEach(s => {
                trackStates[s].muted = true;
                wavesurfers[s]?.setMuted(true);
                document.querySelector(`.mute-btn[data-target="${s}"]`)?.classList.add('active');
            });
            showToast('Drums + Bass focus', '🥁');
        });

        document.getElementById('presetBacking')?.addEventListener('click', () => {
            resetMix();
            trackStates['vocals'].muted = true;
            wavesurfers['vocals']?.setMuted(true);
            document.querySelector('.mute-btn[data-target="vocals"]')?.classList.add('active');
            showToast('Instrumental backing', '🎹');
        });

        // Spacebar shortcut
        document.onkeydown = e => {
            if (e.code === 'Space' && !resultsSection.classList.contains('hidden')) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                e.preventDefault();
                playBtn?.click();
            }
        };
    }

    // ── Stem Controls ─────────────────────────────────────────────────────────
    function setupStemControls() {
        STEMS.forEach(stem => {
            const vol    = document.querySelector(`.volume-slider[data-target="${stem}"]`);
            const vv     = document.getElementById(`vol-val-${stem}`);
            const pan    = document.querySelector(`.pan-slider[data-target="${stem}"]`);
            const pv     = document.getElementById(`pan-val-${stem}`);
            const muteB  = document.querySelector(`.mute-btn[data-target="${stem}"]`);
            const soloB  = document.querySelector(`.solo-btn[data-target="${stem}"]`);

            if (vol) {
                vol.oninput = e => {
                    const v = parseFloat(e.target.value);
                    trackStates[stem].volume = v;
                    wavesurfers[stem]?.setVolume(v * masterVolume);
                    if (vv) vv.textContent = `${Math.round(v * 100)}%`;
                    if (muteB) {
                        if (v === 0) muteB.classList.add('active');
                        else if (!trackStates[stem].muted) muteB.classList.remove('active');
                    }
                };
            }

            if (pan) {
                pan.oninput = e => {
                    const p = parseFloat(e.target.value);
                    trackStates[stem].pan = p;
                    if (pannerNodes[stem]) pannerNodes[stem].pan.value = p;
                    if (pv) {
                        if (p === 0)       pv.textContent = 'C';
                        else if (p < 0)    pv.textContent = `L${Math.abs(Math.round(p * 50))}`;
                        else               pv.textContent = `R${Math.round(p * 50)}`;
                    }
                };
            }

            if (muteB) {
                muteB.onclick = () => {
                    const ws = wavesurfers[stem];
                    if (!ws) return;
                    trackStates[stem].muted = !trackStates[stem].muted;
                    ws.setMuted(trackStates[stem].muted);
                    muteB.classList.toggle('active', trackStates[stem].muted);
                    showToast(`${stem.toUpperCase()} ${trackStates[stem].muted ? 'muted' : 'unmuted'}`, trackStates[stem].muted ? '🔇' : '🔊');
                };
            }

            if (soloB) {
                soloB.onclick = () => {
                    const isSolo = activeSoloTrack === stem;
                    if (isSolo) {
                        activeSoloTrack = null;
                        soloB.classList.remove('active');
                        STEMS.forEach(s => wavesurfers[s]?.setMuted(trackStates[s].muted));
                        showToast('Solo off', '🎧');
                    } else {
                        activeSoloTrack = stem;
                        document.querySelectorAll('.solo-btn').forEach(b => b.classList.remove('active'));
                        soloB.classList.add('active');
                        STEMS.forEach(s => wavesurfers[s]?.setMuted(s !== stem));
                        showToast(`Solo: ${stem.toUpperCase()}`, '🎧');
                    }
                };
            }
        });
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    setupMasterControls();
    setupStemControls();
});
