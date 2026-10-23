import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

// Decode and play the actual MediaRecorder videos at 1x in a hidden browser.
// Review sheets below contain decoded video frames, not animation re-renders.
const input=process.argv[2];assert.ok(input,'Pass the completed reload report.json.');
const report=JSON.parse(await fs.readFile(input,'utf8')),out=path.dirname(path.resolve(input));
const require=createRequire(import.meta.url),dependency=path.join(process.env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules');
const {chromium}=require(path.join(dependency,'playwright')),sharp=require(path.join(dependency,'sharp'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),review={passed:false,source:path.resolve(input),playbackRate:1,headless:true,videos:[]};
try{
 for(const item of report.weapons){
  const source=item.sequence?.video;assert.ok(source,`Missing recorded ${item.id} video.`);
  const encoded=(await fs.readFile(source.file)).toString('base64');
  const decoded=await page.evaluate(async({encoded,seconds})=>{
   const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'video/webm'})),video=document.createElement('video'),canvas=document.createElement('canvas'),frames=[],targets=[.1,.25,.4,.55,.7,.85];
   video.src=url;video.muted=true;video.playsInline=true;video.playbackRate=1;document.body.replaceChildren(video);let next=0,decodedFrames=0,lastTime=0;
   try{
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Video metadata decoding failed'));});
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;const context=canvas.getContext('2d');
    const ended=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Recorded video did not complete at normal speed')),30000);video.onended=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Recorded video decode/playback failed'));};});
    const capture=(now,metadata)=>{decodedFrames++;lastTime=metadata.mediaTime;if(next<targets.length&&metadata.mediaTime>=seconds*targets[next]){context.drawImage(video,0,0);frames.push({time:metadata.mediaTime,presentedFrames:metadata.presentedFrames,jpeg:canvas.toDataURL('image/jpeg',.93).split(',')[1]});next++;}if(!video.ended)video.requestVideoFrameCallback(capture);};
    video.requestVideoFrameCallback(capture);await video.play();await ended;
    return{width:video.videoWidth,height:video.videoHeight,lastMediaTime:lastTime,decodedFrames,playbackQuality:video.getVideoPlaybackQuality().toJSON?.()||{totalVideoFrames:video.getVideoPlaybackQuality().totalVideoFrames,droppedVideoFrames:video.getVideoPlaybackQuality().droppedVideoFrames},frames};
   }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  },{encoded,seconds:source.recordedWallSeconds});
  assert.ok(decoded.decodedFrames>=15,`${item.id} must decode multiple actual frames.`);assert.ok(decoded.lastMediaTime>1);assert.ok(decoded.frames.length>=4);
  const layers=[];for(let i=0;i<decoded.frames.length;i++){
   const frame=decoded.frames[i],bytes=Buffer.from(frame.jpeg,'base64'),file=path.join(out,`${item.id}-video-${i}.jpg`);await fs.writeFile(file,bytes);frame.file=file;delete frame.jpeg;
   const label=Buffer.from(`<svg width="640" height="30"><rect width="640" height="30" fill="#101817"/><text x="12" y="21" fill="#e5d9b6" font-family="Arial" font-size="16">${item.id} / decoded video ${frame.time.toFixed(3)} s</text></svg>`),thumb=await sharp(bytes).resize(640,400).toBuffer(),tile=await sharp({create:{width:640,height:430,channels:3,background:'#101817'}}).composite([{input:thumb,top:30,left:0},{input:label,top:0,left:0}]).png().toBuffer();layers.push({input:tile,left:(i%2)*640,top:Math.floor(i/2)*430});
  }
  decoded.contactSheet=path.join(out,`${item.id}-decoded-video.png`);await sharp({create:{width:1280,height:Math.ceil(layers.length/2)*430,channels:3,background:'#101817'}}).composite(layers).png().toFile(decoded.contactSheet);
  review.videos.push({id:item.id,source:source.file,...decoded});console.log(JSON.stringify({id:item.id,decodedFrames:decoded.decodedFrames,lastMediaTime:decoded.lastMediaTime,contactSheet:decoded.contactSheet}));
 }
 review.passed=true;
}catch(error){review.failure=String(error.stack||error);process.exitCode=1;console.error(error);}finally{await fs.writeFile(path.join(out,'video-playback-review.json'),JSON.stringify(review,null,2));await browser.close();}
