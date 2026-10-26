// Stopped, occupied columns which remain present during normal gameplay.
// +Z is vehicle forward. These placements are original game blocking, not a
// claim to reproduce every historical vehicle's position or the night force.
export const CONVOY_FOOTPRINTS = Object.freeze({
  humvee:Object.freeze({width:2.4,length:4.9}),
  'cargo-truck':Object.freeze({width:2.6,length:7.8}),
});
const H='humvee',T='cargo-truck',S=Math.PI,E=Math.PI/2;
const slots={
  5:[
    [H,-27.5,35,S],[H,-27.5,26.5,S],[H,-27.5,18,S],
    [T,-23,7.6,E],[H,-12.5,7.6,E],[T,-2,7.6,E],
    [H,8.5,7.6,E],[T,19,7.6,E],[H,29.1,7.6,E],
    [H,25.4,-5.5,S],[H,25.4,-15,S],[H,25.4,-30,S],
  ],
  8:[
    [H,-28.5,47,S],[H,-28.5,38.5,S],[T,-28.5,28.3,S],
    [H,-22,12.4,E],[T,-11.5,12.4,E],[H,-1,12.4,E],
    [H,10.6,4.8,S],[H,10.6,-4.5,S],[T,20,-18.6,E],
  ],
  15:[
    [H,-61.5,61,S],[H,-61.5,45,S],[T,-48,31.5,E],
    [H,-35,31.5,E],[H,-23.5,23,S],[T,-23.5,6,S],
    [H,-16,-18.5,E],[H,0,-18.5,E],[T,21.5,-28,S],
    [H,21.5,-51,S],[H,37,-60.5,E],[H,56,-60.5,E],
  ],
};
// A 107.1m loading column fits the 110m relief avenue. The side lane leaves the
// full central player route and casualty transfer points unobstructed.
{
  const types=[H,H,H,T,H,H,H,T,H,H,H,T];let x=-51;
  slots[13]=types.map((type,i)=>{if(i)x+=(CONVOY_FOOTPRINTS[types[i-1]].length+CONVOY_FOOTPRINTS[type].length)/2+3.6;return[type,x,7.2,E];});
}
export function getChapterConvoy(layout){
  const chapter=typeof layout==='number'?layout:layout.chapter;
  const group=chapter===5?'assault-main':chapter===8?'assault-remainder':'relief-detachment';
  return (slots[chapter]||[]).map(([type,x,z,rotation],index)=>({
    kind:'vehicle',pos:[x,z],rotation,type,variant:index%4===1?'sand':'olive',occupied:true,
    convoy:true,convoyGroup:group,convoyIndex:index,convoyId:`${group}-${chapter}-${index+1}`,
    role:type===T?'cargo-and-casualty-carrier':index===0?'lead-security':'escort',
  }));
}
export function convoyBounds(spec,margin=0){
  const size=CONVOY_FOOTPRINTS[spec.type],c=Math.abs(Math.cos(spec.rotation||0)),s=Math.abs(Math.sin(spec.rotation||0));
  const hx=(size.width*c+size.length*s)/2+margin,hz=(size.width*s+size.length*c)/2+margin;
  return {minX:spec.pos[0]-hx,maxX:spec.pos[0]+hx,minZ:spec.pos[1]-hz,maxZ:spec.pos[1]+hz,material:'metal'};
}
