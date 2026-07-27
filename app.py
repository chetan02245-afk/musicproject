import os
import sys
import uuid
import zipfile
import threading
import subprocess
from io import BytesIO
from flask import Flask, request, jsonify, send_file, render_template

# Helper for resolving ffmpeg executable safely
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

def process_separation_job(job_id, filename, mode):
    try:
        jobs[job_id]['status'] = 'processing'
        jobs[job_id]['progress'] = 10
        jobs[job_id]['message'] = 'Initializing audio environment...'

        model = 'htdemucs_ft' if mode == 'quality' else 'htdemucs'

        ffmpeg_exe = get_ffmpeg_exe()
        env = os.environ.copy()
        if ffmpeg_exe != "ffmpeg" and os.path.exists(ffmpeg_exe):
            ffmpeg_dir = os.path.dirname(ffmpeg_exe)
            env["PATH"] = ffmpeg_dir + os.pathsep + env["PATH"]

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        wav_filename = os.path.splitext(filename)[0] + '.wav'
        wav_filepath = os.path.join(app.config['UPLOAD_FOLDER'], wav_filename)

        base_name = os.path.splitext(wav_filename)[0]
        out_dir = os.path.join(app.config['OUTPUT_FOLDER'], model, base_name)
        stem_files = ['vocals.wav', 'drums.wav', 'bass.wav', 'other.wav']

        # Stem Caching check: Instant completion if stems already exist
        if os.path.exists(out_dir) and all(os.path.exists(os.path.join(out_dir, f)) for f in stem_files):
            jobs[job_id]['progress'] = 100
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['message'] = 'Retrieved stems instantly from studio cache!'
            jobs[job_id]['stems'] = {
                'vocals': f'/download/{model}/{base_name}/vocals.wav',
                'drums': f'/download/{model}/{base_name}/drums.wav',
                'bass': f'/download/{model}/{base_name}/bass.wav',
                'other': f'/download/{model}/{base_name}/other.wav'
            }
            jobs[job_id]['model'] = model
            jobs[job_id]['base_name'] = base_name
            return

        # 1. Convert to WAV format
        jobs[job_id]['progress'] = 25
        jobs[job_id]['message'] = 'Converting audio format to high-precision WAV...'
        subprocess.run([ffmpeg_exe, '-y', '-i', filepath, wav_filepath], check=True, capture_output=True)

        # 2. Run Demucs AI separation
        jobs[job_id]['progress'] = 45
        jobs[job_id]['message'] = f'Isolating frequency stems using AI ({model})...'

        cmd = [sys.executable, 'run_demucs_patched.py', '-n', model, '-o', app.config['OUTPUT_FOLDER']]
        if mode == 'fast':
            cmd.extend(['--shifts', '1', '--overlap', '0.25'])
        cmd.append(wav_filepath)

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        
        while True:
            line = process.stderr.readline()
            if not line and process.poll() is not None:
                break
            if line and '%' in line:
                try:
                    parts = line.strip().split('%')[0].split()
                    if parts:
                        pct = float(parts[-1])
                        jobs[job_id]['progress'] = min(95, int(45 + (pct * 0.5)))
                except Exception:
                    pass

        rc = process.poll()
        if rc != 0:
            stderr_out = process.stderr.read()
            raise Exception(f"Demucs processing failed (exit code {rc}): {stderr_out}")

        jobs[job_id]['progress'] = 100
        jobs[job_id]['status'] = 'completed'
        jobs[job_id]['message'] = 'Stem separation completed successfully!'
        jobs[job_id]['stems'] = {
            'vocals': f'/download/{model}/{base_name}/vocals.wav',
            'drums': f'/download/{model}/{base_name}/drums.wav',
            'bass': f'/download/{model}/{base_name}/bass.wav',
            'other': f'/download/{model}/{base_name}/other.wav'
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
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filepath)
        return jsonify({'filename': file.filename, 'message': 'File uploaded successfully'})

@app.route('/separate', methods=['POST'])
def separate():
    data = request.json or {}
    filename = data.get('filename')
    mode = data.get('mode', 'fast')
    
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
        
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
        
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        'status': 'queued',
        'progress': 0,
        'message': 'Queued for processing...',
        'filename': filename,
        'mode': mode
    }

    # Run in background thread so server returns immediately
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

@app.route('/download/<model>/<track>/<stem>')
def download(model, track, stem):
    filepath = os.path.join(app.config['OUTPUT_FOLDER'], model, track, stem)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    return send_file(filepath, as_attachment=False)

@app.route('/download_zip/<model>/<track>')
def download_zip(model, track):
    dir_path = os.path.join(app.config['OUTPUT_FOLDER'], model, track)
    if not os.path.exists(dir_path):
        return jsonify({'error': 'Track outputs not found'}), 404

    memory_file = BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for stem in ['vocals.wav', 'drums.wav', 'bass.wav', 'other.wav']:
            stem_path = os.path.join(dir_path, stem)
            if os.path.exists(stem_path):
                zf.write(stem_path, arcname=f"{track}_{stem}")

    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"{track}_stems_bundle.zip"
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000)
