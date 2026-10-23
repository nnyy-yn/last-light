export const SAVE_KEY = 'last-light-campaign-v1';
export const SETTINGS_KEY = 'last-light-settings-v1';
export const RESOURCE_LIMITS = {trust:[0,10],medicine:[0,12],ammo:[0,240],civilians:[0,30],fatigue:[0,10],cohesion:[0,10]};
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function newCampaign(initial) { return {version:1,chapter:0,unlocked:1,resources:{...initial},flags:[],history:[],completed:false,checkpoints:{}}; }
export function snapshot(state) { return JSON.parse(JSON.stringify(state)); }
export function applyEffects(resources,effects={}) { const result={...resources}; for(const [key,delta] of Object.entries(effects)){if(RESOURCE_LIMITS[key]&&Number.isFinite(delta))result[key]=clamp((result[key]||0)+delta,...RESOURCE_LIMITS[key]);}return result; }
export function canChoose(resources,option){return ['medicine','ammo'].every(k=>!(option.effects?.[k]<0)||resources[k]>=-option.effects[k]);}
export function choose(state,chapter,option) {
  if(state.history.some(h=>h.chapter===chapter.id))throw new Error('本章选择已记录');
  if(!chapter.choice.options.includes(option))throw new Error('选择不属于当前章节');
  if(chapter.id!==state.chapter+1)throw new Error('必须按当前章节推进');
  if(!canChoose(state.resources,option))throw new Error('物资不足，无法执行这个选择');
  state.resources=applyEffects(state.resources,option.effects);
  if(option.flag&&!state.flags.includes(option.flag))state.flags.push(option.flag);
  state.history.push({chapter:chapter.id,title:chapter.title,role:chapter.role,option:option.label,response:option.response,effects:{...option.effects}});
  state.chapter=Math.min(chapter.id,15);state.unlocked=Math.max(state.unlocked,Math.min(chapter.id+1,16));state.completed=chapter.id===16;
  return state;
}
export function validateSave(value) {
  if(!value||value.version!==1||!Number.isInteger(value.chapter)||value.chapter<0||value.chapter>15||!Array.isArray(value.history)||!Array.isArray(value.flags)||typeof value.resources!=='object'||!value.resources)return null;
  for(const [key,limits] of Object.entries(RESOURCE_LIMITS))if(!Number.isFinite(value.resources[key])||value.resources[key]<limits[0]||value.resources[key]>limits[1])return null;
  if(typeof value.completed!=='boolean')return null;
  const validHistory=(history)=>history.length<=16&&history.every((h,i)=>h&&Number.isInteger(h.chapter)&&h.chapter>=1&&h.chapter<=16&&typeof h.option==='string'&&typeof h.title==='string'&&history.findIndex(item=>item.chapter===h.chapter)===i);
  if(!validHistory(value.history))return null;
  value.unlocked=clamp(Math.floor(Number(value.unlocked)||1),1,16);value.checkpoints=value.checkpoints&&typeof value.checkpoints==='object'?value.checkpoints:{};
  for(const [key,point] of Object.entries(value.checkpoints)){
    if(!/^([0-9]|1[0-5])$/.test(key)||!point||!Array.isArray(point.flags)||!Array.isArray(point.history)||!point.resources)return null;
    for(const [resource,limits] of Object.entries(RESOURCE_LIMITS))if(!Number.isFinite(point.resources[resource])||point.resources[resource]<limits[0]||point.resources[resource]>limits[1])return null;
    if(point.flags.some(f=>typeof f!=='string')||!validHistory(point.history))return null;
  }
  value.flags=value.flags.filter(f=>typeof f==='string').slice(0,80);
  value.history=value.history.filter(h=>h&&Number.isInteger(h.chapter)&&typeof h.option==='string'&&typeof h.title==='string').slice(0,16);
  return value;
}
export function saveCampaign(storage,state){try{storage.setItem(SAVE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export function readCampaign(storage){try{return validateSave(JSON.parse(storage.getItem(SAVE_KEY)));}catch{return null;}}
export function checkpoint(state,index){state.checkpoints[index]={resources:{...state.resources},flags:[...state.flags],history:state.history.map(h=>({...h}))};}
export function restoreChapter(state,index){const point=state.checkpoints[index];if(!point||!point.resources||!Array.isArray(point.flags)||!Array.isArray(point.history))return false;state.resources={...point.resources};state.flags=[...point.flags];state.history=point.history.map(h=>({...h}));state.chapter=index;state.unlocked=index+1;state.completed=false;for(const k of Object.keys(state.checkpoints))if(Number(k)>index)delete state.checkpoints[k];return true;}
export function blocked(x,z,boxes,radius=.36) {return boxes.some(b=>x>b.minX-radius&&x<b.maxX+radius&&z>b.minZ-radius&&z<b.maxZ+radius);}
export function movePlayer(player,dx,dz,boxes,bound=92){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.25));for(let i=0;i<steps;i++){const x=clamp(player.x+dx/steps,-bound,bound),z=clamp(player.z+dz/steps,-bound,bound);if(!blocked(x,player.z,boxes))player.x=x;if(!blocked(player.x,z,boxes))player.z=z;}return player;}
export function lineBlocked(a,b,boxes){const dx=b.x-a.x,dz=b.z-a.z;for(const box of boxes){let low=0,high=1;for(const [p,d,min,max] of [[a.x,dx,box.minX,box.maxX],[a.z,dz,box.minZ,box.maxZ]]){if(Math.abs(d)<1e-8){if(p<min||p>max){low=2;break;}}else{let t1=(min-p)/d,t2=(max-p)/d;if(t1>t2)[t1,t2]=[t2,t1];low=Math.max(low,t1);high=Math.min(high,t2);}}if(low<=high&&high>0&&low<1)return true;}return false;}
export function canFire(mode,armed,ammo,reloading,cooldown){return mode==='playing'&&armed&&ammo>0&&reloading<=0&&cooldown<=0;}
