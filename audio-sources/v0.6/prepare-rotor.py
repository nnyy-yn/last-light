"""Deterministic offline PCM preparation; run with bundled Blender Python.
No device is opened and no sound is played. Original source remains unchanged.
"""
from pathlib import Path
import json,hashlib,wave,datetime
import numpy as np
import aud

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
ANALYSIS=ROOT/'artifacts/model-upgrade-v0.6/audio-assets';ANALYSIS.mkdir(parents=True,exist_ok=True)
source=HERE/'ezwa-helicopter-source.ogg'
sound=aud.Sound.file(str(source));source_rate=int(sound.specs[0])
decoded=np.asarray(sound.data(),dtype=np.float64).mean(axis=1)
np.save(ANALYSIS/'ezwa-helicopter-source.ogg.npy',decoded[:,None])
start_seconds=18.25;loop_seconds=6.;overlap_seconds=.60;rate=48000
start=int(start_seconds*source_rate);count=int((loop_seconds+overlap_seconds)*source_rate)
cut=decoded[start:start+count]
# Smooth zero-phase FFT response removes subsonic handling noise and high
# ambient hiss. It does not generate a synthetic rotor or change its pitch.
cut-=np.mean(cut)
freq=np.fft.rfftfreq(len(cut),1/source_rate)
high=1/(1+(45/np.maximum(freq,.001))**4)
low=1/(1+(freq/4400)**6)
filtered=np.fft.irfft(np.fft.rfft(cut)*high*low,n=len(cut))
resampled=np.interp(np.arange(round((loop_seconds+overlap_seconds)*rate))/rate,
                    np.arange(len(filtered))/source_rate,filtered)
length=round(loop_seconds*rate);fade=round(overlap_seconds*rate)
t=np.linspace(0,1,fade);weight=.5-.5*np.cos(np.pi*t)
seam=resampled[length:length+fade]*(1-weight)+resampled[:fade]*weight
loop=np.concatenate((resampled[fade:length],seam))
loop-=np.mean(loop);loop*=10**(-1.5/20)/np.max(np.abs(loop))
pcm=np.round(np.clip(loop,-1,1)*32767).astype('<i2')
output=ROOT/'public/audio/rotor-loop.wav';output.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(output),'wb') as stream:
 stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(rate);stream.writeframes(pcm.tobytes())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
differences=np.diff(pcm.astype(np.float64))/32768
audit={
 'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'source':{'file':str(source.relative_to(ROOT)).replace('\\','/'),'url':'https://upload.wikimedia.org/wikipedia/commons/b/b8/Helicopter_over_quiet_n.ogg','author':'ezwa','title':'Helicopter over quiet neighbourhood - 2','license':'Public-domain dedication by author (PD-author)','licensePage':'https://commons.wikimedia.org/wiki/File:Helicopter_over_quiet_n.ogg','sourceSampleRate':source_rate,'sourceChannels':int(sound.specs[1]),'sourceSeconds':len(decoded)/source_rate,'bytes':source.stat().st_size,'sha256':sha(source)},
 'output':{'file':'public/audio/rotor-loop.wav','format':'PCM signed 16-bit little endian WAV','sampleRate':rate,'channels':1,'frames':len(pcm),'seconds':len(pcm)/rate,'bytes':output.stat().st_size,'sha256':sha(output),'peakDbFS':float(20*np.log10(np.max(np.abs(pcm.astype(float)))/32768)),'rmsDbFS':float(20*np.log10(np.sqrt(np.mean((pcm.astype(float)/32768)**2)))),'seamStepFullScale':float(abs(float(pcm[0])-float(pcm[-1]))/32768),'interiorStepP99':float(np.quantile(np.abs(differences),.99)),'dcFullScale':float(np.mean(pcm)/32768),'clippedSamples':int(np.sum(np.abs(pcm.astype(float))>=32767))},
 'processing':{'sourceRangeSeconds':[start_seconds,start_seconds+loop_seconds+overlap_seconds],'highPassHz':45,'lowPassHz':4400,'resample':'linear interpolation from 44100 to 48000 Hz','wrapCrossfadeSeconds':overlap_seconds,'crossfade':'raised-cosine complementary overlap; no silent fade at loop boundary','peakTargetDbFS':-1.5},
 'review':{'noPlayback':True,'notCertifiedAircraftModel':'Original record does not identify the helicopter type; this is not a verified UH-60 recording.','listeningLimitation':'No speaker playback or human listening certification performed; source describes a single natural helicopter subject. Spectrum and waveform are retained for review.'}}
assert len(pcm)==288000 and audit['output']['peakDbFS']<-1 and audit['output']['clippedSamples']==0
assert audit['output']['seamStepFullScale']<audit['output']['interiorStepP99']
(HERE/'rotor-loop-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
np.save(ANALYSIS/'rotor-loop-analysis.npy',loop)
print(json.dumps(audit,indent=2))
