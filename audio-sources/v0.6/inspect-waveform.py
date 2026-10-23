from pathlib import Path
import json, numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent.parent.parent/'artifacts/model-upgrade-v0.6/audio-assets'
source=np.load(root/'ezwa-helicopter-source.ogg.npy').mean(axis=1)
rate=44100;size=2048;hop=512
frames=np.lib.stride_tricks.sliding_window_view(source,size)[::hop]*np.hanning(size)
power=20*np.log10(np.abs(np.fft.rfft(frames,axis=1)).T+1e-8)
frequencies=np.linspace(60,6000,400);bins=np.clip(np.round(frequencies/(rate/size)).astype(int),0,power.shape[0]-1)
shown=power[bins][::-1];shown=(np.clip((shown+40)/60,0,1)*255).astype('uint8')
rgb=np.stack([shown,shown*.68,shown*.27],axis=2).astype('uint8')
image=Image.new('RGB',(1500,590),'#111820');image.paste(Image.fromarray(rgb).resize((1400,400)),(70,50));draw=ImageDraw.Draw(image)
draw.text((70,15),'PD-author ezwa helicopter field recording: spectrogram, 60-6000 Hz; selected 18.25-24.85 s',fill='white')
duration=len(source)/rate
for second in range(0,46,5):
 x=70+second/duration*1400;draw.line((x,50,x,450),fill='#4d555b');draw.text((x,458),str(second)+' s',fill='white')
for freq in[1000,2000,3000,4000,5000,6000]:
 y=450-(freq-60)/5940*400;draw.text((8,y),str(freq)+' Hz',fill='white')
draw.rectangle((70+18.25/duration*1400,50,70+24.85/duration*1400,450),outline='#56d3c7',width=3)
loop=np.load(root/'rotor-loop-analysis.npy');rms=[]
for i in range(0,len(loop),2400):rms.append(float(np.sqrt(np.mean(loop[i:i+2400]**2))))
for i in range(1,len(rms)):
 draw.line((70+(i-1)/(len(rms)-1)*1400,550-rms[i-1]*250,70+i/(len(rms)-1)*1400,550-rms[i]*250),fill='#56d3c7',width=2)
draw.text((70,565),'Processed 6 s loop: 50 ms RMS envelope; no added music, speech, or synthetic oscillator.',fill='white')
image.save(root/'rotor-spectrum-review.png')
print(root/'rotor-spectrum-review.png')
