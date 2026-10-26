// Uses the same solid footprints as movement and visibility. Return the first
// contact, so tracers and near-miss reactions cannot continue through cover.
export function traceObstacles(start, end, boxes = [], sampleHeight = null) {
  const delta = { x:end.x-start.x, y:end.y-start.y, z:end.z-start.z };
  let result = null, nearest = 1;
  for (const box of boxes) {
    let enter = 0, leave = 1, normal = { x:0, y:0, z:0 };
    const axes=Number.isFinite(box.minY)&&Number.isFinite(box.maxY)?['x','y','z']:['x','z'];
    for (const axis of axes) {
      const suffix=axis.toUpperCase(),min=box['min'+suffix], max=box['max'+suffix];
      if (Math.abs(delta[axis]) < 1e-8) { if (start[axis]<min || start[axis]>max) { enter=2; break; } }
      else {
        let a=(min-start[axis])/delta[axis], b=(max-start[axis])/delta[axis], sign=-1;
        if(a>b){[a,b]=[b,a];sign=1;}
        if(a>enter){enter=a;normal={x:0,y:0,z:0};normal[axis]=sign;}
        leave=Math.min(leave,b);
      }
    }
    if(enter<=leave && leave>0 && enter>=0 && enter<nearest){
      nearest=enter;
      result={fraction:enter,point:{x:start.x+delta.x*enter,y:start.y+delta.y*enter,z:start.z+delta.z*enter},normal,kind:'cover',material:box.material||'masonry'};
    }
  }
  if(typeof sampleHeight==='function'){
    const height=(x,z)=>{const y=sampleHeight(x,z);return(Number.isFinite(y)?y:0)+.035;};
    const gap=t=>start.y+delta.y*t-height(start.x+delta.x*t,start.z+delta.z*t);
    const limit=nearest,steps=Math.max(1,Math.min(512,Math.ceil(Math.hypot(delta.x,delta.z)*limit/.4)));
    let previous=0,previousGap=gap(0);
    for(let i=1;i<=steps;i++){
      const t=limit*i/steps,currentGap=gap(t);
      if(previousGap>0&&currentGap<=0){
        let lo=previous,hi=t;
        for(let j=0;j<14;j++){const mid=(lo+hi)/2;if(gap(mid)>0)lo=mid;else hi=mid;}
        if(hi<nearest){
          const x=start.x+delta.x*hi,z=start.z+delta.z*hi,e=.04;
          const nx=-(height(x+e,z)-height(x-e,z))/(2*e),nz=-(height(x,z+e)-height(x,z-e))/(2*e),length=Math.hypot(nx,1,nz);
          result={fraction:hi,point:{x,y:height(x,z),z},normal:{x:nx/length,y:1/length,z:nz/length},kind:'ground'};
        }
        break;
      }
      previous=t;previousGap=currentGap;
    }
  } else if(delta.y<0 && start.y>.035){
    const t=(.035-start.y)/delta.y;
    if(t>=0 && t<nearest)result={fraction:t,point:{x:start.x+delta.x*t,y:.035,z:start.z+delta.z*t},normal:{x:0,y:1,z:0},kind:'ground'};
  }
  return result;
}

export function nearestOnSegment(point,start,end){
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
  const t=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy+(point.z-start.z)*dz)/(dx*dx+dy*dy+dz*dz||1)));
  const nearest={x:start.x+dx*t,y:start.y+dy*t,z:start.z+dz*t};
  return{...nearest,distance:Math.hypot(nearest.x-point.x,nearest.y-point.y,nearest.z-point.z),fraction:t};
}
