const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const GUNS={m16a2:[138,.032,.70,2350],m4a1:[154,.027,.78,2760],m249:[112,.043,.67,1840],ak:[98,.046,.62,2110],mp5:[186,.021,.46,3100],m1911:[121,.038,.57,1650]};
export const AIRCRAFT_SAMPLE='audio/rotor-loop.wav';
export const AUDIO_VOICE_LIMIT=48;
function randomStream(seed=1){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function lowpass(data,hz,sr){const out=new Float32Array(data.length),a=1-Math.exp(-TAU*hz/sr);let v=0;for(let i=0;i<data.length;i++){v+=a*(data[i]-v);out[i]=v;}return out;}
function highpass(data,hz,sr){const low=lowpass(data,hz,sr),out=new Float32Array(data.length);for(let i=0;i<data.length;i++)out[i]=data[i]-low[i];return out;}
function normalize(channels,peak=.88){let max=0;for(const ch of channels)for(const v of ch)max=Math.max(max,Math.abs(v));const scale=max?peak/max:1;for(const ch of channels)for(let i=0;i<ch.length;i++)ch[i]*=scale;return channels;}

/** Original deterministic PCM; live playback and offline exports use the same synthesis. */
export function renderSoundPCM(kind,{sampleRate=48000,seed=1,weaponId='m4a1',distant=false,material='masonry'}={}){
  const rng=randomStream(seed),duration=kind==='explosion'?3.5:['rotor','turbine','air','fire'].includes(kind)?4:kind==='shot'?1.1:kind==='debris'?.75:.5;
  const n=Math.ceil(duration*sampleRate),raw=new Float32Array(n),p=GUNS[weaponId]||GUNS.m4a1;let low=0,mid=0,phase=0;
  for(let i=0;i<n;i++){
    const t=i/sampleRate,w=rng()*2-1;low+=.008*(w-low);mid+=.18*(w-mid);
    if(kind==='shot'){
      const attack=1-Math.exp(-t*10000),body=Math.exp(-t/p[1]);phase+=TAU*(43+p[0]*Math.exp(-t*23))/sampleRate;
      raw[i]=attack*((w-mid)*Math.exp(-t/.0055)*p[2]+mid*body*1.35+Math.sin(phase)*body*.30+(t>.017?Math.sin(TAU*p[3]*t)*Math.exp(-(t-.017)/.009)*.07:0));
    }else if(kind==='explosion'){
      const pressure=Math.sin(TAU*(43*t+.34*(1-Math.exp(-t*17))))*Math.exp(-t/.32);
      raw[i]=Math.min(1,t/.0018)*(w*Math.exp(-t/.022)*.75+mid*Math.exp(-t/.14)*1.5+pressure*.43+low*Math.exp(-t/.85)*3.3);
    }else if(kind==='rotor'){
      // Unequal blade-pressure pulses plus turbulent slap; not a single sine bed.
      const cycle=(t*18)%1,pulse=Math.exp(-Math.pow((cycle-.12)/.11,2)),rebound=Math.exp(-Math.pow((cycle-.44)/.19,2)),rev=1+.20*Math.sin(TAU*4.5*t)+.09*Math.sin(TAU*9*t+.7);
      raw[i]=((pulse-.55*rebound)*.28+mid*pulse*.78+low*1.8)*rev;
    }else if(kind==='turbine')raw[i]=(.45*Math.sin(TAU*730*t+.8*Math.sin(TAU*3*t))+.20*Math.sin(TAU*1460*t+.3*Math.sin(TAU*7*t)))*.06+(w-mid)*.10*(.8+.2*Math.sin(TAU*7*t));
    else if(kind==='air')raw[i]=(mid-low)*(.45+.20*Math.sin(TAU*.75*t)+.16*Math.sin(TAU*1.5*t+1));
    else if(kind==='fire')raw[i]=mid*.28+low*.9;
    else if(kind==='debris'){
      const metal=material==='metal';raw[i]=(w-mid)*Math.exp(-t/.22)*Math.min(1,t*65)*.12;
      for(const [at,f]of[[.018,metal?2800:1100],[.071,metal?4100:1700],[.19,metal?1950:790],[.31,metal?3300:1300]])if(t>=at)raw[i]+=Math.sin(TAU*f*(t-at))*Math.exp(-(t-at)/(metal?.06:.014))*.11;
    }else raw[i]=w;
  }
  let signal=['shot','explosion'].includes(kind)?highpass(raw,kind==='explosion'?27:45,sampleRate):raw;
  if(kind==='shot'&&distant)signal=lowpass(signal,1300,sampleRate);
  if(['rotor','air','fire','turbine'].includes(kind)){
    signal=highpass(signal,kind==='turbine'?400:35,sampleRate);
    const overlap=Math.round(sampleRate*.06),loop=new Float32Array(n-overlap);loop.set(signal.subarray(overlap));
    for(let i=0;i<overlap;i++){const w=.5-.5*Math.cos(Math.PI*i/(overlap-1)),at=loop.length-overlap+i;loop[at]=signal[n-overlap+i]*(1-w)+signal[i]*w;}
    return{sampleRate,channels:normalize([loop],kind==='turbine'?.24:.65),duration:loop.length/sampleRate};
  }
  const channels=[signal.slice(),signal.slice()];
  if(['shot','explosion'].includes(kind)){
    const reflection=lowpass(signal,kind==='explosion'?750:distant?720:1700,sampleRate);
    const taps=kind==='explosion'?[[.095,.28,.70],[.22,.22,-.65],[.43,.14,.35],[.78,.09,-.35]]:[[.043,distant?.29:.18,-.55],[.091,.16,.60],[.166,.09,-.18]];
    for(const [delay,level,pan]of taps){const offset=Math.round(delay*sampleRate),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);for(let i=0;i<n-offset;i++){channels[0][i+offset]+=reflection[i]*level*l;channels[1][i+offset]+=reflection[i]*level*r;}}
  }
  return{sampleRate,channels:normalize(channels,kind==='shot'&&distant?.60:.88),duration};
}

export class Soundscape{
  constructor(options={}){
    this.ctx=options.context||null;this.ownsContext=!options.context;this.autoLoadSamples=options.autoLoadSamples!==false;
    this.volume=.48;this.mix={aircraft:1,battle:1};this.enabled=true;this.paused=true;this.nodes=[];this.voices=new Set();this.events={};this.buffers=new Map();this.stepClock=0;
    this.maxVoices=AUDIO_VOICE_LIMIT;this.droppedVoices=0;this.resetCount=0;this.disposed=false;
    this.aircraftState={distance:500,gain:0,pan:0,rate:1,radialVelocity:0,active:false,sampleLoaded:false,sampleState:'not-requested',sampleURL:null,sampleError:null};
    this.fireState={distance:500,gain:0,pan:0};this.aircraftHistory=null;
  }
  start(){
    if(this.disposed)return;
    if(!this.ctx){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;this.ctx=new C();}
    if(!this.master)this._initialize();this.paused=false;if(this.ctx.state==='suspended')this.ctx.resume()?.catch?.(()=>{});
  }
  _initialize(){
    const c=this.ctx;this.master=c.createGain();this.master.gain.value=this.volume;
    this.aircraftBus=c.createGain();this.aircraftBus.gain.value=this.mix.aircraft;this.battleBus=c.createGain();this.battleBus.gain.value=this.mix.battle;
    this.aircraftBus.connect(this.master);this.battleBus.connect(this.master);
    this.dcFilter=c.createBiquadFilter();this.dcFilter.type='highpass';this.dcFilter.frequency.value=25;
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-7;this.limiter.knee.value=5;this.limiter.ratio.value=10;this.limiter.attack.value=.001;this.limiter.release.value=.18;
    this.ceiling=c.createWaveShaper();const curve=new Float32Array(4097);
    for(let i=0;i<curve.length;i++){const v=i/(curve.length-1)*2-1,a=Math.abs(v);curve[i]=Math.sign(v)*(a<=.78?a:.78+.16*(1-Math.exp(-(a-.78)*7)));}
    this.ceiling.curve=curve;this.ceiling.oversample='2x';this.master.connect(this.dcFilter).connect(this.limiter).connect(this.ceiling).connect(c.destination);
    this.transient=this._buffer('noise',{seed:602});this.noise=this._buffer('air',{seed:44});
    for(const id of Object.keys(GUNS))for(let v=0;v<3;v++)this._buffer('shot',{weaponId:id,seed:107+v*71});
    this._buffer('explosion',{seed:412});this._createAircraft();this._createFire();
    if(this.autoLoadSamples)this.loadAircraftSample((import.meta.env?.BASE_URL||'./')+AIRCRAFT_SAMPLE);
  }
  _buffer(kind,options={}){
    const key=JSON.stringify([kind,options]);if(this.buffers.has(key))return this.buffers.get(key);
    const pcm=renderSoundPCM(kind,{...options,sampleRate:this.ctx.sampleRate}),buffer=this.ctx.createBuffer(pcm.channels.length,pcm.channels[0].length,pcm.sampleRate);
    pcm.channels.forEach((ch,i)=>buffer.getChannelData(i).set(ch));this.buffers.set(key,buffer);return buffer;
  }
  _canPlay(){return this.ctx&&this.master&&this.ctx.state==='running'&&!this.paused&&!this.disposed;}
  _event(name){this.events[name]=(this.events[name]||0)+1;}
  _retire(v){if(v.retired)return;v.retired=true;try{v.source.stop();}catch{}for(const n of v.nodes)try{n.disconnect();}catch{}this.voices.delete(v);}
  _voice(buffer,{level=.5,pan=0,delay=0,rate=1,lowpassHz=16000,highpassHz=25,duration=buffer?.duration||0,envelope=false,priority=1,bus=this.battleBus}={}){
    if(!this._canPlay()||!buffer||level<=0)return null;
    if(this.voices.size>=this.maxVoices){const oldest=[...this.voices].sort((a,b)=>a.priority-b.priority||a.start-b.start)[0];this.droppedVoices++;if(oldest.priority>priority)return null;this._retire(oldest);}
    const c=this.ctx,now=c.currentTime+clamp(delay,0,2),source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),hp=c.createBiquadFilter(),panner=c.createStereoPanner();
    source.buffer=buffer;source.playbackRate.value=clamp(rate,.65,1.5);filter.type='lowpass';filter.frequency.value=lowpassHz;filter.Q.value=.55;hp.type='highpass';hp.frequency.value=highpassHz;hp.Q.value=.5;
    panner.pan.value=clamp(pan,-1,1);gain.gain.value=level;const length=Math.min(duration,buffer.duration/source.playbackRate.value);
    if(envelope){gain.gain.setValueAtTime(.00001,now);gain.gain.linearRampToValueAtTime(level,now+Math.min(.003,length*.1));gain.gain.exponentialRampToValueAtTime(.00001,now+Math.max(.006,length));}
    source.connect(hp).connect(filter).connect(gain).connect(panner).connect(bus);
    const voice={source,nodes:[source,hp,filter,gain,panner],start:now,end:now+length,priority,retired:false};
    this.voices.add(voice);source.onended=()=>this._retire(voice);source.start(now);source.stop(now+length+.005);return voice;
  }
  _loop(buffer,destination,level=1,cutoff=16000){const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.5;gain.gain.value=level;source.connect(filter).connect(gain).connect(destination);source.start();this.nodes.push(source);return{source,filter,gain};}
  _createAircraft(){
    const c=this.ctx,gain=c.createGain(),pan=c.createStereoPanner(),low=c.createBiquadFilter();gain.gain.value=0;low.type='lowpass';low.frequency.value=400;low.Q.value=.5;low.connect(gain).connect(pan).connect(this.aircraftBus);
    this.aircraft={gain,panner:pan,low,rotor:this._loop(this._buffer('rotor',{seed:7}),low,.55,1100),turbine:this._loop(this._buffer('turbine',{seed:9}),low,.22,3700),air:this._loop(this.noise,low,.18,2100),sample:null};
  }
  _createFire(){const gain=this.ctx.createGain(),pan=this.ctx.createStereoPanner();gain.gain.value=0;gain.connect(pan).connect(this.battleBus);this.fireBed={gain,pan,loop:this._loop(this._buffer('fire',{seed:15}),gain,.45,1350)};this.crackleAt=.1;}
  async loadAircraftSample(urlOrData){
    if(!this.ctx||!this.aircraft||this.disposed)return false;
    const state=this.aircraftState;state.sampleState='loading';state.sampleError=null;state.sampleURL=typeof urlOrData==='string'?urlOrData:'provided-arraybuffer';
    try{
      let bytes=urlOrData;
      if(typeof urlOrData==='string'){
        const viaXHR=()=>new Promise((resolve,reject)=>{const request=new XMLHttpRequest();request.open('GET',urlOrData,true);request.responseType='arraybuffer';request.onload=()=>request.response&&(request.status===0||request.status<400)?resolve(request.response):reject(new Error(`XHR ${request.status}`));request.onerror=()=>reject(new Error(`Aircraft recording could not be loaded: ${urlOrData}`));request.send();});
        // Electron file pages use the same status-0 XHR path as local assets,
        // without issuing an expected-to-fail file fetch first.
        if(globalThis.location?.protocol==='file:'&&typeof XMLHttpRequest!=='undefined')bytes=await viaXHR();
        else{try{const response=await fetch(urlOrData);if(!response.ok)throw new Error(`HTTP ${response.status}`);bytes=await response.arrayBuffer();}catch(error){if(typeof XMLHttpRequest==='undefined')throw error;bytes=await viaXHR();}}
      }
      const decoded=await this.ctx.decodeAudioData(bytes.slice(0));if(this.disposed)return false;if(decoded.duration<.5)throw new Error('Aircraft loop must be longer than 0.5 seconds.');
      // Packaged public-domain recording is already crossfaded: preserve the real blade rhythm.
      let sum=0,peak=0;for(let ch=0;ch<decoded.numberOfChannels;ch++)for(const v of decoded.getChannelData(ch)){sum+=v*v;peak=Math.max(peak,Math.abs(v));}
      const rms=Math.sqrt(sum/decoded.length/decoded.numberOfChannels),level=Math.min(.25/Math.max(.01,rms),.92/Math.max(.01,peak),2);
      if(this.aircraft.sample){const old=this.aircraft.sample;old.source.stop();old.source.disconnect();old.filter.disconnect();old.gain.disconnect();this.nodes=this.nodes.filter(n=>n!==old.source);}
      this.aircraft.sample=this._loop(decoded,this.aircraft.low,level,8000);this.aircraft.rotor.gain.gain.setTargetAtTime(.13,this.ctx.currentTime,.25);this.aircraft.air.gain.gain.setTargetAtTime(.10,this.ctx.currentTime,.25);
      state.sampleLoaded=true;state.sampleState='ready';state.sampleDuration=decoded.duration;state.sampleChannels=decoded.numberOfChannels;return true;
    }catch(error){state.sampleState='error';state.sampleError=String(error?.message||error);state.sampleLoaded=false;return false;}
  }
  updateAircraft(distance,pan=0,active=true,dt){
    if(!this._canPlay())return;distance=clamp(distance,0,2000);const now=this.ctx.currentTime,prev=this.aircraftHistory,elapsed=Number.isFinite(dt)?dt:prev?now-prev.time:0;let radial=0;
    if(active&&prev?.active&&elapsed>.0001&&elapsed<.5&&Math.abs(distance-prev.distance)<Math.max(25,elapsed*150))radial=clamp((distance-prev.distance)/elapsed,-75,75);
    const smooth=1-Math.exp(-Math.max(0,elapsed)/.18),velocity=active?this.aircraftState.radialVelocity+(radial-this.aircraftState.radialVelocity)*smooth:0;
    const presence=active?Math.pow(Math.max(0,1-distance/260),1.4)/(1+Math.pow(distance/48,1.5)):0,rate=clamp(343/(343+velocity),.82,1.22),gain=presence*1.16,stereo=clamp(pan,-1,1)*.91;
    this.aircraft.gain.gain.setTargetAtTime(gain,now,active?.13:.07);this.aircraft.panner.pan.setTargetAtTime(stereo,now,.10);this.aircraft.low.frequency.setTargetAtTime(350+5400*Math.pow(presence,.6),now,.16);
    for(const layer of[this.aircraft.rotor,this.aircraft.turbine,this.aircraft.air,this.aircraft.sample])if(layer)layer.source.playbackRate.setTargetAtTime(rate,now,.10);
    Object.assign(this.aircraftState,{distance,gain,pan:stereo,rate,radialVelocity:velocity,active:Boolean(active)});this.aircraftHistory={distance,time:now,active};
  }
  setVolume(v){this.volume=clamp(v,0,1);if(this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.035);}
  setMix(values={}){for(const key of['aircraft','battle'])if(Number.isFinite(values[key]))this.mix[key]=clamp(values[key],0,1);if(this.master){this.aircraftBus.gain.setTargetAtTime(this.mix.aircraft,this.ctx.currentTime,.04);this.battleBus.gain.setTargetAtTime(this.mix.battle,this.ctx.currentTime,.04);}}
  updateBattle(dt,fireDistance=500,firePan=0,active=false){
    if(!this._canPlay())return;const presence=active?Math.pow(Math.max(0,1-fireDistance/34),2):0,gain=presence*.42;
    this.fireBed.gain.gain.setTargetAtTime(gain,this.ctx.currentTime,.18);this.fireBed.pan.pan.setTargetAtTime(clamp(firePan,-1,1)*.9,this.ctx.currentTime,.14);this.fireState={distance:fireDistance,gain,pan:clamp(firePan,-1,1)*.9};
    if(!active||dt<=0)return;this.crackleAt-=dt;if(presence>.02&&this.crackleAt<=0){this.spatialBurst(.028+Math.random()*.065,presence*.19,1800+Math.random()*1800,firePan);this.crackleAt=.12+Math.random()*.43;}
    // No timer-driven explosions: impact() is called by visible battle events only.
  }
  spatialBurst(duration,volume,frequency,pan=0,delay=0){return this._voice(this.transient,{duration,level:volume,pan,delay,envelope:true,lowpassHz:frequency*1.6,highpassHz:frequency*.5,priority:0});}
  burst(duration,volume,frequency){return this._voice(this.transient,{duration,level:volume,highpassHz:frequency,lowpassHz:Math.max(2200,frequency*3),envelope:true,priority:0});}
  tone(freq,duration,volume=.1,type='sine',endFreq=freq,delay=0){
    if(!this._canPlay())return;const buffer=this.ctx.createBuffer(1,Math.ceil(duration*this.ctx.sampleRate),this.ctx.sampleRate),data=buffer.getChannelData(0);let phase=0;
    for(let i=0;i<data.length;i++){const t=i/data.length;phase+=TAU*freq*Math.pow(Math.max(1,endFreq)/freq,t)/this.ctx.sampleRate;data[i]=(type==='triangle'?Math.asin(Math.sin(phase))*2/Math.PI:Math.sin(phase))*Math.exp(-t*6)*Math.min(1,t*60);}
    this._voice(buffer,{level:volume,delay,priority:0,bus:this.master});
  }
  impact(distance=0,pan=0,occluded=false){
    if(!this._canPlay())return;this._event('impacts');if(occluded)this._event('occludedImpacts');
    const level=.95/(1+Math.pow(Math.max(0,distance)/42,1.2))*(occluded?.60:1),delay=clamp(distance/343,0,1.5);
    this._voice(this._buffer('explosion',{seed:412}),{level,pan,delay,lowpassHz:occluded?650:600+9500/(1+distance/24),rate:.92+Math.random()*.12,priority:3});
    if(distance<90&&!occluded)this._voice(this._buffer('debris',{seed:314}),{level:level*.23,pan:-pan*.25,delay:delay+.12,priority:1});
  }
  shot(id='m4a1'){if(!this._canPlay())return;this._event('shots');this._event(`shot_${id}`);const variant=(this.events.shots-1)%3;this._voice(this._buffer('shot',{weaponId:id,seed:107+variant*71}),{level:id==='m249'?.74:id==='mp5'?.66:.83,rate:.975+Math.random()*.05,priority:2});}
  shotAt(distance=20,pan=0,id='m4a1',occluded=false){
    if(!this._canPlay())return;this._event('remoteShots');if(occluded)this._event('occludedShots');
    const level=.74/(1+Math.pow(Math.max(0,distance)/19,1.35))*(occluded?.56:1),far=distance>40;
    this._voice(this._buffer('shot',{weaponId:id,seed:107,distant:far}),{level,pan,delay:clamp(distance/343,0,1.5),lowpassHz:occluded?720:850+11000/(1+distance/13),rate:.97+Math.random()*.06,priority:1});
  }
  bulletImpact(distance,pan,material='masonry'){if(!this._canPlay())return;this._event('bulletImpacts');const level=.42/(1+Math.pow(Math.max(0,distance)/8,1.5));if(material==='metal')this._voice(this._buffer('debris',{seed:58,material:'metal'}),{level,pan,delay:distance/343,lowpassHz:8000,priority:1});else this.spatialBurst(['sand','soil','ground'].includes(material)?.12:.065,level,['sand','soil','ground'].includes(material)?480:2100,pan,distance/343);}
  confirmHit(killed=false){if(!this._canPlay())return;this.spatialBurst(.045,.11,510);if(killed)this.spatialBurst(.08,.09,260,0,.03);}
  smoke(){if(!this._canPlay())return;this._event('smoke');this.spatialBurst(.055,.22,1800);this.spatialBurst(.48,.11,2600,0,.18);}
  nearMiss(distance,pan){if(!this._canPlay())return;this._event('nearMisses');const level=Math.max(.03,1-distance/3);this.spatialBurst(.024,level*.30,5200,pan);this.spatialBurst(.10,level*.09,1800,-pan*.3,.014);}
  hit(){if(!this._canPlay())return;this._event('hits');this.burst(.16,.35,95);this.tone(66,.24,.12,'sine',31);}
  click(){this.tone(720,.045,.035,'sine',430);}
  radio(){if(!this._canPlay())return;this._event('radio');this.spatialBurst(.055,.13,2400,-.12);this.tone(880,.065,.035);}
  reload(){if(!this._canPlay())return;this._event('reloads');this.reloadProgress=0;this.spatialBurst(.045,.10,1100,.12);}
  reloadPhase(phase,id){if(phase<=0){this.reloadProgress=0;return;}if(!this._canPlay())return;const previous=this.reloadProgress||0;for(const[at,freq,level]of[[.19,1400,.14],[.38,520,.10],[.72,1850,.21],[.88,3200,.17]])if(previous<at&&phase>=at){this._event('reloadPhases');this.spatialBurst(id==='m249'?.10:.052,level,freq,.1);}this.reloadProgress=phase;}
  step(sprint=false){if(!this._canPlay())return;this._event('steps');this.burst(sprint?.12:.095,sprint?.20:.13,110);this.spatialBurst(.045,.045,1800,this.events.steps%2?-.12:.12,.016);}
  complete(){this.tone(280,.5,.055);this.tone(420,.7,.045,'sine',420,.18);}
  _quietContinuous(){
    if(!this.ctx||!this.aircraft)return;const now=this.ctx.currentTime;for(const n of[this.aircraft.gain,this.fireBed.gain]){n.gain.cancelScheduledValues(now);n.gain.setValueAtTime(0,now);}
    for(const layer of[this.aircraft.rotor,this.aircraft.turbine,this.aircraft.air,this.aircraft.sample])if(layer){layer.source.playbackRate.cancelScheduledValues(now);layer.source.playbackRate.setValueAtTime(1,now);}
    Object.assign(this.aircraftState,{gain:0,pan:0,rate:1,radialVelocity:0,active:false});this.fireState.gain=0;this.aircraftHistory=null;
  }
  reset(){for(const v of[...this.voices])this._retire(v);this._quietContinuous();this.reloadProgress=0;this.crackleAt=.1;this.resetCount++;}
  pause(value){this.paused=Boolean(value);if(!this.ctx)return;if(this.paused){this.reset();this.ctx.suspend()?.catch?.(()=>{});}else if(!this.disposed)this.ctx.resume()?.catch?.(()=>{});}
  inspect(){const time=this.ctx?.currentTime||0,queued=[...this.voices].filter(v=>v.start>time).length;return{contextState:this.ctx?.state||'not-started',currentTime:time,volume:this.volume,mix:{...this.mix},paused:this.paused,activeVoices:this.voices.size-queued,queuedVoices:queued,maxVoices:this.maxVoices,persistentSources:this.nodes.length,droppedVoices:this.droppedVoices,events:{...this.events},aircraft:{...this.aircraftState,rawGain:this.aircraftState.gain,gain:this.aircraftState.gain*this.mix.aircraft},fire:{...this.fireState,rawGain:this.fireState.gain,gain:this.fireState.gain*this.mix.battle},resetCount:this.resetCount,disposed:this.disposed};}
  dispose(){
    if(this.disposed)return;this.reset();this.disposed=true;this.paused=true;for(const n of this.nodes)try{n.stop();n.disconnect();}catch{}this.nodes.length=0;
    for(const layer of[this.aircraft?.rotor,this.aircraft?.turbine,this.aircraft?.air,this.aircraft?.sample,this.fireBed?.loop])if(layer){layer.filter.disconnect();layer.gain.disconnect();}
    for(const n of[this.aircraft?.low,this.aircraft?.gain,this.aircraft?.panner,this.fireBed?.gain,this.fireBed?.pan,this.master,this.aircraftBus,this.battleBus,this.dcFilter,this.limiter,this.ceiling])n?.disconnect();
    this.buffers.clear();if(this.ownsContext)this.ctx?.close()?.catch?.(()=>{});
  }
}
