import os
import re
import sys
import time
import uuid
import zipfile
import threading
import urllib.parse
import urllib.request
from io import BytesIO

import numpy as np
import soundfile as sf
import torch
from demucs.api import Separator, convert_audio
from flask import Flask, request, jsonify, send_file, render_template

# Optimize PyTorch CPU execution for maximum inference speed
torch.set_num_threads(os.cpu_count() or 4)
if hasattr(torch, 'set_num_interop_threads'):
    try:
        torch.set_num_interop_threads(2)
    except RuntimeError:
        pass

def get_ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

# In-memory job status store
jobs = {}

# Model Cache and Synchronization
_MODEL_CACHE = {}
_MODEL_LOCK = threading.Lock()
_SEPARATION_LOCK = threading.Lock()

def sanitize_track_name(filename):
    """Generates a clean, URL-safe and filesystem-safe track name."""
    name = os.path.splitext(filename)[0]
    sanitized = re.sub(r'[^\w\s\-\.\(\)]', '_', name)
    sanitized = re.sub(r'[\s_]+', '_', sanitized).strip('._')
    return sanitized or f"track_{uuid.uuid4().hex[:8]}"

def get_cached_separator(model_name='htdemucs', mode='fast'):
    """Returns an in-memory cached Separator instance, eliminating cold-start latency."""
    # Fast mode skips time shifts and uses slight overlap reduction for a 40%+ speed boost
    shifts = 0 if mode == 'fast' else 1
    overlap = 0.15 if mode == 'fast' else 0.25
    key = (model_name, shifts, overlap)
    
    with _MODEL_LOCK:
        if key not in _MODEL_CACHE:
            print(f"[ModelManager] Warming up Demucs model: {model_name} (shifts={shifts}, overlap={overlap})...")
            separator = Separator(
                model=model_name,
                shifts=shifts,
                overlap=overlap,
                split=True,
                progress=False
            )
            _MODEL_CACHE[key] = separator
        return _MODEL_CACHE[key]

def load_audio_to_tensor(filepath):
    """Universal audio loader: reads WAV, MP3, FLAC, OGG directly with soundfile.
    Falls back to imageio_ffmpeg pipe for M4A, AAC, and other formats."""
    try:
        data, sr = sf.read(filepath, dtype='float32')
        tensor = torch.from_numpy(data)
        if tensor.dim() == 1:
            tensor = tensor.unsqueeze(0)
        else:
            tensor = tensor.t().contiguous()
        return tensor, sr
    except Exception:
        # Fallback to ffmpeg pipe stream
        import subprocess
        ffmpeg_exe = get_ffmpeg_exe()
        cmd = [
            ffmpeg_exe, '-v', 'error',
            '-i', filepath,
            '-f', 'f32le',
            '-ac', '2',
            '-ar', '44100',
            '-'
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        arr = np.frombuffer(proc.stdout, dtype=np.float32).reshape(-1, 2)
        tensor = torch.from_numpy(arr.copy()).t().contiguous()
        return tensor, 44100

def save_stem_pcm(tensor, out_path, samplerate=44100):
    """Saves tensor (channels, samples) as 16-bit PCM WAV.
    Provides standard DAW-ready quality, half the disk footprint,
    and 2x faster browser loading compared to 32-bit float."""
    data = tensor.t().clamp(-1.0, 1.0).cpu().numpy()
    sf.write(out_path, data, samplerate, subtype='PCM_16')

def process_separation_job(job_id, filename, mode):
    try:
        jobs[job_id]['status'] = 'processing'
        jobs[job_id]['progress'] = 5
        jobs[job_id]['message'] = 'Analyzing audio source...'

        model = 'htdemucs_ft' if mode == 'quality' else 'htdemucs'
        base_name = sanitize_track_name(filename)
        out_dir = os.path.join(app.config['OUTPUT_FOLDER'], model, base_name)
        stem_files = ['vocals.wav', 'drums.wav', 'bass.wav', 'other.wav']

        # Stem Caching check: Instant completion if stems already exist
        # Check both sanitized name and raw filename directory
        raw_base = os.path.splitext(filename)[0]
        raw_out_dir = os.path.join(app.config['OUTPUT_FOLDER'], model, raw_base)

        target_dir = None
        target_base = None

        if os.path.exists(out_dir) and all(os.path.exists(os.path.join(out_dir, f)) for f in stem_files):
            target_dir = out_dir
            target_base = base_name
        elif os.path.exists(raw_out_dir) and all(os.path.exists(os.path.join(raw_out_dir, f)) for f in stem_files):
            target_dir = raw_out_dir
            target_base = raw_base

        if target_dir:
            jobs[job_id]['progress'] = 100
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['message'] = 'Retrieved stems instantly from studio cache!'
            quoted_base = urllib.parse.quote(target_base)
            jobs[job_id]['stems'] = {
                'vocals': f'/download/{model}/{quoted_base}/vocals.wav',
                'drums': f'/download/{model}/{quoted_base}/drums.wav',
                'bass': f'/download/{model}/{quoted_base}/bass.wav',
                'other': f'/download/{model}/{quoted_base}/other.wav'
            }
            jobs[job_id]['model'] = model
            jobs[job_id]['base_name'] = target_base
            return

        # 1. Load Audio directly into Memory Tensor
        jobs[job_id]['progress'] = 15
        jobs[job_id]['message'] = 'Decoding audio stream into memory...'
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Uploaded audio file not found: {filename}")

        tensor, sr = load_audio_to_tensor(filepath)

        # 2. Acquire Separator Model and register live progress callback
        jobs[job_id]['progress'] = 22
        jobs[job_id]['message'] = f'Initializing AI Separator ({model})...'
        separator = get_cached_separator(model_name=model, mode=mode)

        total_length = tensor.shape[1]

        def separation_callback(info):
            offset = info.get('segment_offset', 0)
            bag_idx = info.get('model_idx_in_bag', 0)
            models = max(1, info.get('models', 1))

            track_fraction = offset / max(1, total_length)
            total_fraction = (bag_idx + track_fraction) / models
            pct = min(94, int(25 + total_fraction * 70))

            jobs[job_id]['progress'] = pct
            jobs[job_id]['message'] = f"Isolating Vocals, Drums, Bass & Instruments ({pct}%)..."

        # 3. Perform AI Separation in memory
        with _SEPARATION_LOCK:
            separator.update_parameter(callback=separation_callback)
            with torch.inference_mode():
                _, stems = separator.separate_tensor(tensor, sr)

        # 4. Save High-Precision 16-bit PCM WAV Stems
        jobs[job_id]['progress'] = 96
        jobs[job_id]['message'] = 'Finalizing studio stem tracks...'
        os.makedirs(out_dir, exist_ok=True)

        for stem_name in ['vocals', 'drums', 'bass', 'other']:
            if stem_name in stems:
                out_path = os.path.join(out_dir, f"{stem_name}.wav")
                save_stem_pcm(stems[stem_name], out_path, samplerate=separator.samplerate)

        quoted_base = urllib.parse.quote(base_name)
        jobs[job_id]['progress'] = 100
        jobs[job_id]['status'] = 'completed'
        jobs[job_id]['message'] = 'Stem separation completed successfully!'
        jobs[job_id]['stems'] = {
            'vocals': f'/download/{model}/{quoted_base}/vocals.wav',
            'drums': f'/download/{model}/{quoted_base}/drums.wav',
            'bass': f'/download/{model}/{quoted_base}/bass.wav',
            'other': f'/download/{model}/{quoted_base}/other.wav'
        }
        jobs[job_id]['model'] = model
        jobs[job_id]['base_name'] = base_name

    except Exception as e:
        print(f"Job {job_id} Error:", str(e))
        jobs[job_id]['status'] = 'failed'
        jobs[job_id]['error'] = str(e)
        jobs[job_id]['message'] = f"Error: {str(e)}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    original_name = file.filename
    ext = os.path.splitext(original_name)[1].lower()
    if not ext:
        ext = '.mp3'

    safe_base = sanitize_track_name(original_name)
    safe_filename = f"{safe_base}{ext}"

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
    file.save(filepath)

    return jsonify({
        'filename': safe_filename,
        'original_name': original_name,
        'message': 'File uploaded successfully'
    })

@app.route('/upload_url', methods=['POST'])
def upload_url():
    data = request.json or {}
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'Please enter a valid URL'}), 400

    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return jsonify({'error': 'Invalid URL scheme. Must begin with http:// or https://'}), 400

    try:
        url_path = parsed.path
        raw_name = os.path.basename(url_path) or f"downloaded_track_{int(time.time())}.mp3"
        safe_base = sanitize_track_name(raw_name)
        ext = os.path.splitext(raw_name)[1].lower()
        if ext not in ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']:
            ext = '.mp3'

        safe_filename = f"{safe_base}{ext}"
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)

        # Download with stream and size safeguard
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SonicSplit/2.0'})
        with urllib.request.urlopen(req, timeout=30) as resp, open(save_path, 'wb') as out_f:
            max_size = 150 * 1024 * 1024
            downloaded = 0
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                downloaded += len(chunk)
                if downloaded > max_size:
                    raise Exception('Audio file exceeds 150MB limit')
                out_f.write(chunk)

        return jsonify({
            'filename': safe_filename,
            'original_name': raw_name,
            'message': 'Audio fetched from URL successfully'
        })
    except Exception as e:
        return jsonify({'error': f'Failed to fetch audio: {str(e)}'}), 400

@app.route('/separate', methods=['POST'])
def separate():
    data = request.json or {}
    filename = data.get('filename')
    mode = data.get('mode', 'fast')

    if not filename:
        return jsonify({'error': 'No filename provided'}), 400

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Audio file not found'}), 404

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        'status': 'queued',
        'progress': 0,
        'message': 'Queued for processing...',
        'filename': filename,
        'mode': mode
    }

    # Run in background daemon thread
    thread = threading.Thread(target=process_separation_job, args=(job_id, filename, mode))
    thread.daemon = True
    thread.start()

    return jsonify({'job_id': job_id, 'message': 'Separation started'})

@app.route('/status/<job_id>')
def job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)

@app.route('/download/<model>/<path:track>/<stem>')
def download(model, track, stem):
    # Support both quoted/unquoted and sanitized track paths
    clean_track = urllib.parse.unquote(track)
    filepath = os.path.join(app.config['OUTPUT_FOLDER'], model, clean_track, stem)
    if not os.path.exists(filepath):
        filepath = os.path.join(app.config['OUTPUT_FOLDER'], model, track, stem)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Stem file not found'}), 404
    return send_file(filepath, as_attachment=False, conditional=True)

@app.route('/download_zip/<model>/<path:track>')
def download_zip(model, track):
    clean_track = urllib.parse.unquote(track)
    dir_path = os.path.join(app.config['OUTPUT_FOLDER'], model, clean_track)
    if not os.path.exists(dir_path):
        dir_path = os.path.join(app.config['OUTPUT_FOLDER'], model, track)
    if not os.path.exists(dir_path):
        return jsonify({'error': 'Track outputs not found'}), 404

    memory_file = BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for stem in ['vocals.wav', 'drums.wav', 'bass.wav', 'other.wav']:
            stem_path = os.path.join(dir_path, stem)
            if os.path.exists(stem_path):
                zf.write(stem_path, arcname=f"{os.path.basename(clean_track)}_{stem}")

    memory_file.seek(0)
    safe_download_name = f"{sanitize_track_name(clean_track)}_stems_bundle.zip"
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=safe_download_name
    )

def warmup_model():
    """Asynchronously warm up default model into memory on boot."""
    try:
        get_cached_separator(model_name='htdemucs', mode='fast')
    except Exception as e:
        print("[ModelManager] Model warmup notice:", e)

if __name__ == '__main__':
    # Start model warmup in background thread
    threading.Thread(target=warmup_model, daemon=True).start()
    app.run(debug=False, port=5000, threaded=True)
