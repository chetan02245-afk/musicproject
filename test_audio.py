import os
import wave
import struct
import math
import subprocess
import imageio_ffmpeg

def create_dummy_wav(filename):
    sample_rate = 44100
    duration = 1  # 1 second
    freq = 440.0
    
    with wave.open(filename, 'w') as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        
        for i in range(sample_rate * duration):
            value = int(32767.0 * math.sin(2.0 * math.pi * freq * i / sample_rate))
            data = struct.pack('<hh', value, value)
            f.writeframesraw(data)

os.makedirs('uploads', exist_ok=True)
wav_path = 'uploads/test_audio.wav'
create_dummy_wav(wav_path)

# Test demucs logic
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
import shutil

# Extract ffmpeg into the project folder so torchaudio can find it as "ffmpeg.exe"
import imageio_ffmpeg
ffmpeg_original_path = imageio_ffmpeg.get_ffmpeg_exe()
ffmpeg_local_dir = os.path.join(os.path.dirname(os.path.abspath(__name__)), 'bin')
os.makedirs(ffmpeg_local_dir, exist_ok=True)
ffmpeg_local_exe = os.path.join(ffmpeg_local_dir, 'ffmpeg.exe')

if not os.path.exists(ffmpeg_local_exe):
    shutil.copy(ffmpeg_original_path, ffmpeg_local_exe)

env = os.environ.copy()
env["PATH"] = ffmpeg_local_dir + os.pathsep + env["PATH"]

try:
    print("Running demucs via python API with monkeypatched torchaudio...")
    import torchaudio
    import soundfile as sf
    import torch
    
    def my_ta_load(filepath, **kwargs):
        # Read wav using soundfile to completely bypass torchaudio's broken torchcodec/ffmpeg dependencies
        data, sr = sf.read(filepath, dtype='float32')
        tensor = torch.from_numpy(data)
        # soundfile returns (frames, channels), torchaudio expects (channels, frames)
        if tensor.dim() == 1:
            tensor = tensor.unsqueeze(0)
        else:
            tensor = tensor.t().clone()
        return tensor, sr

    torchaudio.load = my_ta_load

    def my_ta_save(filepath, src, sample_rate, **kwargs):
        if src.dim() > 1:
            src = src.t()
        sf.write(filepath, src.cpu().numpy(), sample_rate)

    torchaudio.save = my_ta_save

    from demucs.separate import main as demucs_main
    import sys
    sys.argv = ['demucs', '-n', 'htdemucs', '-o', 'outputs', wav_path]
    demucs_main()
    
    print("Demucs succeeded!")
except Exception as e:
    import traceback
    traceback.print_exc()
