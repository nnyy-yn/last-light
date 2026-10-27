// Metres, +Y up. facing uses the player camera convention: 0 looks toward -Z.
// These are sixteen authored footprints, not variants of one city or seeded tiles.
import {expandChapterLayout} from './chapter-expansion.js';
const B=(x,z,w,d,h=6,extra={})=>({x,z,w,d,h,...extra});
const P=(kind,x,z,rotation=0,extra={})=>({kind,pos:[x,z],rotation,...extra});
const R=(points,width=10,surface='road')=>({points,width,surface});
const E=(points,lookAt)=>points.map((pos,i)=>({pos,lookAt,patrol:[[pos[0]+(i%2?-1.1:1.1),pos[1]],[pos[0],pos[1]+(i%2?1.4:-1.4)]],fireDelay:3.2+i*.6,opening:false}));
const layouts=[
  {
    id:'clinic-courtyard',chapter:1,name:'诊所与居民院落',type:'civilian-courtyard',bound:37,bounds:{minX:-34,maxX:34,minZ:-32,maxZ:32},
    spawn:[-18,22],facing:0,taskPositions:[[-17,4],[9,4],[21,-19]],route:[[-18,22],[-18,4],[-18,8],[7,8],[7,4],[9,4],[7,4],[7,8],[21,8],[21,-19]],enemySpawns:[],
    roads:[R([[-18,27],[-18,8],[21,8],[21,-25]],7,'sand')],
    buildings:[B(7,-4,18,18,3.6,{interior:'clinic',doors:['south','east'],label:'社区诊所'}),B(-28,-16,9,21,6.2),B(-6,21,12,15,4),B(28,20,9,18,6.2),B(-6,-25,18,9,3.8)],
    props:[P('well',-5,4),P('washing',-24,16),P('stall',27,-11),P('wall',5,29,0,{length:35}),P('lamp',15,8)],
    landmarks:[{name:'开放式诊所',pos:[7,-4]},{name:'院落水井',pos:[-5,4]}],ambientAircraft:false,
  },
  {
    id:'airfield-barracks',chapter:2,name:'机场营房整备区',type:'military-camp',bound:48,bounds:{minX:-43,maxX:43,minZ:-40,maxZ:40},
    spawn:[-27,24],facing:0,taskPositions:[[-25,5],[0,-8],[25,-24]],route:[[-27,24],[-25,5],[0,5],[0,-8],[25,-8],[25,-24]],enemySpawns:[],
    roads:[R([[-27,32],[-27,5],[25,5],[25,-32]],10,'sand'),R([[0,5],[0,-27]],9,'sand')],
    buildings:[B(-9,22,16,12,3.2,{style:'barracks'}),B(-10,-19,15,14,3.2,{style:'barracks'}),B(17,22,16,12,3.4,{style:'barracks'}),B(38,-9,8,42,4,{style:'warehouse'})],
    props:[P('tent',-31,-23),P('tent',11,-25),P('cargo',-20,0),P('cargo',4,-13),P('vehicle',31,17),P('sandbags',20,-32),P('flag',-3,2),P('lamp',-18,12)],
    landmarks:[{name:'营房与装备检查区',pos:[-9,22]},{name:'车辆集合线',pos:[25,-24]}],ambientAircraft:true,
  },
  {
    id:'hangar-briefing',chapter:3,name:'机库简报与停机坪',type:'hangar-apron',bound:61,bounds:{minX:-56,maxX:56,minZ:-43,maxZ:43},
    spawn:[-35,13],facing:Math.PI/2,taskPositions:[[-35,-9],[-13,0],[29,0]],route:[[-35,13],[-35,-9],[-35,0],[-13,0],[29,0]],enemySpawns:[],
    roads:[R([[-48,0],[50,0]],24,'concrete')],
    buildings:[B(-30,0,39,38,11,{style:'hangar',interior:'briefing',doors:['east'],label:'行动简报机库'}),B(38,32,24,11,4,{style:'warehouse'})],
    props:[P('helipad',27,0),P('aircraft',28,-14),P('cargo',-13,-12),P('cargo',-45,15),P('fuel',46,-25),P('lamp',0,21)],
    landmarks:[{name:'高跨钢架机库',pos:[-30,0]},{name:'停机坪',pos:[27,0]}],ambientAircraft:false,
  },
  {
    id:'rope-insertion-street',chapter:4,name:'目标区索降街道',type:'narrow-t-street',bound:52,bounds:{minX:-45,maxX:45,minZ:-47,maxZ:47},
    spawn:[0,36],facing:0,taskPositions:[[2,20],[-3,-5],[21,-26]],route:[[0,36],[0,20],[0,-5],[0,-26],[21,-26]],
    roads:[R([[0,43],[0,-40]],12),R([[-37,-26],[37,-26]],12)],
    buildings:[B(-17,24,18,22,9.6),B(17,25,18,20,6.4),B(-17,-3,18,21,6.4,{ruin:true}),B(17,-5,18,24,9.6),B(-18,-41,21,10,6.4),B(19,-41,22,10,6.4)],
    props:[P('stall',-6,12),P('washing',9,11),P('vehicle',-30,-26,Math.PI/2),P('rubble',8,-16),P('lamp',-7,30)],
    enemySpawns:E([[-3,8],[3,-13],[-15,-28],[32,-28],[-32,-23],[3,-36],[25,-23],[-24,-23]],[0,25]),
    landmarks:[{name:'索降十字绳影',pos:[0,25]},{name:'转运路口',pos:[21,-26]}],ambientAircraft:true,
    cinematic:{anchor:[0,0,25],crashPoint:[3,0,20],vehicleRoute:[[-34,0,-26],[0,0,-26],[34,0,-26]],cameraSafe:[-4,1.7,34]},
  },
  {
    id:'target-compound',chapter:5,name:'抓捕建筑与车队庭院',type:'walled-compound',bound:48,bounds:{minX:-43,maxX:43,minZ:-41,maxZ:41},
    spawn:[-31,26],facing:0,taskPositions:[[-30,4],[0,4],[29,-21]],route:[[-31,26],[-30,4],[0,4],[29,4],[29,-21]],
    roads:[R([[-31,35],[-31,4],[29,4],[29,-33]],11),R([[-31,-24],[29,-24]],10)],
    buildings:[B(0,-12,27,22,9.6,{doors:['south'],interior:'target',label:'目标建筑'}),B(-17,26,13,17,6.4),B(15,26,17,17,6.4),B(-35,-18,9,19,6.4),B(35,23,9,24,3.2)],
    props:[P('gate',-17,4,Math.PI/2),P('gate',13,4,Math.PI/2),P('cargo',-4,13.5),P('lamp',20,11),P('wall',0,37,0,{length:45})],
    enemySpawns:E([[-28,-12],[-29,-28],[-15,-24],[11,-26],[31,-9],[32,-31],[-3,2],[16,2],[-31,11],[27,12]],[0,4]),
    landmarks:[{name:'双门围合庭院',pos:[0,4]},{name:'三层目标楼',pos:[0,-12]}],ambientAircraft:true,
    cinematic:{anchor:[-31,0,26],crashPoint:[0,0,4],vehicleRoute:[[-31,0,35],[-31,0,4],[29,0,4],[29,0,-33]],cameraSafe:[-35,1.7,25]},
  },
  {
    id:'super61-plaza',chapter:6,name:'超级六一坠机广场',type:'crash-plaza',bound:65,bounds:{minX:-58,maxX:58,minZ:-58,maxZ:58},
    spawn:[0,47],facing:0,taskPositions:[[-4,17],[14,-3],[1,-27]],route:[[0,47],[0,22],[-4,17],[14,17],[14,-3],[14,-27],[1,-27]],
    roads:[R([[0,52],[0,-49]],13),R([[-48,-6],[48,-6]],14),R([[-21,21],[21,21],[21,-25],[-21,-25],[-21,21]],10)],
    plaza:{x:0,z:-2,w:49,d:50},buildings:[B(-34,33,20,21,9.6,{ruin:true}),B(34,33,21,21,6.4,{ruin:true}),B(-36,-31,22,24,9.6,{ruin:true}),B(36,-31,22,24,6.4,{ruin:true}),B(-33,-51,22,9,6.4),B(33,-51,22,9,9.6)],
    props:[P('wreck',-8,-3,.25,{fire:true}),P('burned',31,11,.6,{fire:true}),P('rubble',-22,16),P('rubble',20,-20),P('sandbags',-15,20),P('lamp',25,21)],
    enemySpawns:E([[-22,29],[22,29],[-34,-5],[35,-4],[-20,-21],[21,-29],[-3,-41],[-47,-9],[46,-9],[19,11],[-18,-16],[3,-52]],[0,23]),
    landmarks:[{name:'超级六一完整尺度残骸',pos:[-8,-3]},{name:'弹坑广场',pos:[0,-2]}],ambientAircraft:true,
    cinematic:{anchor:[0,0,3],crashPoint:[-8,0,-3],vehicleRoute:[[0,0,50],[0,0,30],[16,0,20]],cameraSafe:[17,1.7,21]},
  },
  {
    id:'lost-market-maze',chapter:7,name:'失散的市场巷道',type:'market-dogleg',bound:54,bounds:{minX:-48,maxX:48,minZ:-45,maxZ:45},
    spawn:[-34,33],facing:0,taskPositions:[[-33,9],[0,5],[27,-25]],route:[[-34,33],[-34,5],[0,5],[0,-25],[27,-25]],
    roads:[R([[-34,39],[-34,5],[0,5],[0,-25],[38,-25]],8,'sand'),R([[0,5],[33,5],[33,30]],7,'sand')],
    buildings:[B(-44,25,12,26,6.4,{ruin:true}),B(-19,25,19,26,6.4),B(-19,-15,20,27,9.6,{ruin:true}),B(16,24,23,24,6.4),B(17,-10,23,17,6.4),B(-35,-35,22,10,3.2),B(22,-38,28,10,6.4),B(43,8,7,31,6.4)],
    props:[P('stall',-39,14),P('stall',-24,0),P('stall',-10,10),P('stall',5,-13),P('stall',14,-30),P('stall',27,10),P('washing',7,0),P('rubble',-5,-19),P('well',34,24),P('lamp',-28,9)],
    enemySpawns:E([[-32,-4],[-22,6],[-9,3],[2,-8],[-2,-20],[14,-23],[35,-28],[29,4],[34,18],[37,31]],[0,5]),
    landmarks:[{name:'折返棚布集市',pos:[-16,5]},{name:'弯折窄巷',pos:[0,-16]}],ambientAircraft:false,
  },
  {
    id:'convoy-s-bend',chapter:8,name:'受阻车队 S 弯路口',type:'convoy-switchback',bound:63,bounds:{minX:-55,maxX:55,minZ:-56,maxZ:56},
    spawn:[-32,45],facing:0,taskPositions:[[-30,19],[7,0],[31,-32]],route:[[-32,45],[-32,16],[7,16],[7,-15],[31,-15],[31,-39]],
    roads:[R([[-32,51],[-32,16],[7,16],[7,-15],[31,-15],[31,-48]],13),R([[-43,-15],[31,-15]],10)],
    buildings:[B(-12,36,25,25,9.6),B(-45,-4,12,26,6.4,{ruin:true}),B(-13,-1,25,18,6.4),B(27,24,24,28,9.6),B(-12,-37,34,27,6.4,{ruin:true}),B(47,-34,10,29,6.4)],
    props:[P('burned',17,-9,1.2,{fire:true}),P('barricade',31,-44,0),P('rubble',24,-21),P('cargo',3,27),P('lamp',-25,9)],
    enemySpawns:E([[-30,4],[-36,-14],[-25,-16],[-8,-13],[8,-25],[3,2],[20,-13],[35,-26],[29,-44],[3,29]],[7,16]),
    landmarks:[{name:'双折返被堵车道',pos:[7,16]},{name:'燃烧路障车',pos:[13,-10]}],ambientAircraft:false,
    cinematic:{anchor:[7,0,16],crashPoint:[17,0,-9],vehicleRoute:[[-32,0,51],[-32,0,16],[7,0,16],[7,0,-15],[31,0,-15],[31,0,-48]],cameraSafe:[-25,1.7,29]},
  },
  {
    id:'super64-cockpit',chapter:9,name:'超级六四残骸驾驶舱',type:'restricted-cockpit',bound:6,bounds:{minX:-1.12,maxX:1.12,minZ:-1.8,maxZ:1.6},mobility:'restricted',
    spawn:[0,.9],facing:0,taskPositions:[[-.55,-.55],[.55,-.5],[1.95,.9]],route:[[0,.9],[0,0],[.8,.9]],enemySpawns:[],interactionZones:[{taskIndex:2,pos:[1.95,.9],radius:2.4,outsidePlayerBounds:true}],
    roads:[],buildings:[],props:[P('cockpit',0,0)],landmarks:[{name:'破损驾驶舱与无线电',pos:[0,0]}],ambientAircraft:false,
    cinematic:{anchor:[0,0,0],crashPoint:[0,0,-3],vehicleRoute:[],cameraSafe:[0,1.4,1]},
  },
  {
    id:'super64-defense-ring',chapter:10,name:'第二坠机点防御圈',type:'crash-perimeter',bound:49,bounds:{minX:-44,maxX:44,minZ:-44,maxZ:44},
    spawn:[-23,30],facing:0,taskPositions:[[-16,10],[13,-7],[19,21]],route:[[-23,30],[-23,10],[-16,10],[-16,-17],[13,-17],[13,-7],[19,21]],
    roads:[R([[-23,37],[-23,-20],[23,-20],[23,31]],10,'sand'),R([[-36,17],[35,17]],10,'sand')],
    plaza:{x:0,z:0,w:35,d:29},buildings:[B(-36,-7,12,25,6.4,{ruin:true}),B(36,-7,12,25,9.6,{ruin:true}),B(0,-34,29,13,6.4,{ruin:true}),B(-9,34,14,13,3.2,{ruin:true}),B(10,34,13,13,6.4)],
    props:[P('wreck',0,-3,-.6,{fire:true}),P('sandbags',-15,3,Math.PI/2),P('sandbags',14,4,Math.PI/2),P('rubble',-12,-11),P('rubble',10,9),P('burned',30,25,.4)],
    enemySpawns:E([[-24,-26],[24,-26],[-25,0],[25,0],[-34,18],[33,18],[-23,14],[21,32],[-9,-21],[10,-20],[-37,20],[38,16]],[0,8]),
    landmarks:[{name:'独立残骸防御圈',pos:[0,-3]},{name:'外圈沙袋阵地',pos:[14,4]}],ambientAircraft:false,
  },
  {
    id:'field-treatment-rooms',chapter:11,name:'可进入的临时救治室',type:'interior-triage',bound:26,bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},
    spawn:[0,15],facing:0,taskPositions:[[-6,1],[6,0],[0,-9]],route:[[0,15],[0,1],[-6,1],[6,1],[0,1],[0,-9]],enemySpawns:[],
    roads:[R([[0,19],[0,9]],7,'sand')],buildings:[B(0,-2,24,26,3.6,{interior:'treatment',doors:['south'],label:'临时救治所'}),B(-18,-13,7,11,6.4,{ruin:true}),B(18,-13,7,11,6.4,{ruin:true})],
    props:[P('lamp',-8,10),P('vehicle',14,12)],landmarks:[{name:'中央通道与床位两翼',pos:[0,-2]},{name:'后部物资间',pos:[0,-9]}],ambientAircraft:false,
  },
  {
    id:'night-defensive-court',chapter:12,name:'夜间防御院落',type:'defended-courtyard',bound:48,bounds:{minX:-43,maxX:43,minZ:-43,maxZ:43},
    spawn:[0,24],facing:0,taskPositions:[[-15,11],[14,-4],[0,-23]],route:[[0,24],[-15,24],[-15,11],[-15,-4],[14,-4],[14,-23],[0,-23]],
    roads:[R([[0,35],[0,-35]],12,'sand'),R([[-34,-4],[34,-4]],10,'sand')],plaza:{x:0,z:0,w:37,d:49},
    buildings:[B(-29,19,16,20,6.4,{ruin:true}),B(29,19,16,20,6.4),B(-29,-21,16,22,9.6,{ruin:true}),B(29,-21,16,22,6.4,{ruin:true}),B(-13,-37,14,8,3.2),B(13,-37,14,8,6.4)],
    props:[P('sandbags',-10,18),P('sandbags',10,-17),P('burned',-30,-3,1.5,{fire:true}),P('well',-12,-12),P('lamp',16,16),P('lamp',-17,-19),P('cargo',14,9),P('rubble',-19,26)],
    enemySpawns:E([[-3,-33],[3,-39],[-31,-5],[32,-3],[-37,1],[37,-1],[-7,38],[4,38],[-15,-28],[17,-29],[-17,4],[17,6]],[0,12]),
    landmarks:[{name:'多入口夜间防御庭院',pos:[0,0]},{name:'燃烧车入口',pos:[-30,-3]}],ambientAircraft:false,
  },
  {
    id:'relief-assembly-avenue',chapter:13,name:'联合救援装甲车集结街',type:'relief-avenue',bound:68,bounds:{minX:-60,maxX:60,minZ:-56,maxZ:56},
    spawn:[-47,0],facing:-Math.PI/2,taskPositions:[[-25,3],[7,-4],[39,3]],route:[[-47,0],[-25,0],[7,0],[39,0]],
    roads:[R([[-55,0],[55,0]],22),R([[8,-45],[8,43]],14),R([[-32,0],[-32,35]],12)],
    buildings:[B(-44,-24,22,25,9.6,{ruin:true}),B(-16,-28,21,32,6.4),B(31,-27,28,30,9.6,{ruin:true}),B(-47,26,12,24,6.4),B(-11,28,26,28,6.4,{ruin:true}),B(32,28,30,28,9.6)],
    props:[P('burned',10,30,.3,{fire:true}),P('sandbags',45,-10),P('lamp',-26,12),P('lamp',25,12),P('rubble',42,-13)],
    enemySpawns:E([[-8,3],[19,5],[34,-4],[49,4],[7,-20],[10,-37],[6,24],[-32,22],[-32,34],[48,-4]],[0,0]),
    landmarks:[{name:'宽阔装甲车集合大道',pos:[-12,0]},{name:'救援交汇路口',pos:[8,0]}],ambientAircraft:false,
    cinematic:{anchor:[0,0,0],crashPoint:[10,0,30],vehicleRoute:[[-55,0,0],[-25,0,0],[12,0,0],[49,0,0]],cameraSafe:[-36,1.7,5]},
  },
  {
    id:'recovery-ruin-lane',chapter:14,name:'遗体转运废墟小巷',type:'recovery-ruins',bound:48,bounds:{minX:-42,maxX:42,minZ:-43,maxZ:43},
    spawn:[-24,32],facing:0,taskPositions:[[-22,9],[1,-12],[25,-29]],route:[[-24,32],[-24,9],[-3,9],[-3,-12],[25,-12],[25,-29]],
    roads:[R([[-24,37],[-24,9],[-3,9],[-3,-12],[25,-12],[25,-36]],8,'sand')],
    buildings:[B(-9,25,17,22,4.9,{ruin:true}),B(-33,-8,12,26,7.2,{ruin:true}),B(-15,-10,15,20,6.4,{ruin:true}),B(13,6,22,24,6.4,{ruin:true}),B(10,-29,17,20,4.7,{ruin:true}),B(36,-22,8,27,6.4,{ruin:true})],
    props:[P('rubble',-18,13),P('rubble',4,-7),P('rubble',30,-17),P('memorial',-28,-2),P('burned',32,10,-.6),P('washing',-6,5),P('lamp',-29,19)],
    enemySpawns:E([[-25,-5],[-25,-17],[-5,1],[-5,-18],[9,-14],[20,-9],[24,-37],[27,-23]],[0,-12]),
    landmarks:[{name:'断楼板遗体转运通道',pos:[-3,9]},{name:'最后一段抬运巷',pos:[25,-22]}],ambientAircraft:false,
  },
  {
    id:'dawn-mile-switchbacks',chapter:15,name:'黎明长跑多折线街道',type:'long-escape-route',bound:92,bounds:{minX:-85,maxX:85,minZ:-79,maxZ:79},
    spawn:[-65,65],facing:0,taskPositions:[[-27,35],[18,-15],[65,-57]],route:[[-65,65],[-65,35],[-27,35],[-27,-15],[18,-15],[18,-57],[65,-57]],
    roads:[R([[-65,72],[-65,35],[-27,35],[-27,-15],[18,-15],[18,-57],[73,-57]],12)],
    buildings:[B(-45,57,24,28,6.4,{ruin:true}),B(-78,35,10,36,6.4),B(-45,4,24,45,9.6,{ruin:true}),B(-7,17,24,48,6.4),B(43,-33,35,30,9.6,{ruin:true}),B(3,-40,16,24,6.4),B(47,-71,41,12,6.4),B(-48,-38,30,23,6.4,{ruin:true}),B(42,5,29,20,9.6)],
    props:[P('stall',-40,29),P('rubble',-32,4),P('sandbags',8,-20),P('burned',23,-44,-.4,{fire:true}),P('rubble',51,-50),P('lamp',-59,31),P('lamp',12,-31)],
    enemySpawns:E([[-68,25],[-50,38],[-32,24],[-30,10],[-30,-10],[-13,-18],[7,-13],[15,-29],[16,-43],[33,-54],[49,-59],[68,-55]],[18,-15]),
    landmarks:[{name:'七段折返撤离路线',pos:[-27,35]},{name:'黎明最后直道',pos:[48,-57]}],ambientAircraft:true,
    cinematic:{anchor:[18,0,-40],crashPoint:[23,0,-44],vehicleRoute:[[-65,0,72],[-65,0,35],[-27,0,35],[-27,0,-15],[18,0,-15],[18,0,-57],[73,0,-57]],cameraSafe:[12,1.7,-51]},
  },
  {
    id:'base-medical-memorial',chapter:16,name:'基地救护站与纪念区',type:'base-hospital',bound:49,bounds:{minX:-43,maxX:43,minZ:-40,maxZ:40},
    spawn:[-29,25],facing:0,taskPositions:[[-26,2],[0,-10],[28,9]],route:[[-29,25],[-26,2],[0,2],[0,-10],[0,9],[28,9]],enemySpawns:[],
    roads:[R([[-29,32],[-29,2],[0,2],[0,9],[34,9]],11,'sand')],
    buildings:[B(-13,-10,18,20,3.8,{interior:'recovery',doors:['south','east'],label:'基地救护站'}),B(17,-22,28,13,4,{style:'barracks'}),B(-13,27,17,12,3.2,{style:'barracks'})],
    props:[P('tent',6,-3),P('memorialArea',28,13),P('vehicle',-34,-15),P('flag',13,13),P('lamp',-22,10),P('lamp',21,3),P('wall',0,38,0,{length:69})],
    landmarks:[{name:'基地医疗入口',pos:[-13,-10]},{name:'空担架与纪念区',pos:[28,13]}],ambientAircraft:false,
  },
];

for(const layout of layouts){
  // More distant groups reinforce an established fight through the streets;
  // noncombat chapters receive none. Actual placement happens after collision.
  layout.encounter={reserveCount:layout.enemySpawns.length?({4:2,5:3,6:4,7:2,8:3,10:2,12:3,13:4,14:3,15:4}[layout.chapter]??2):0,reserveDelay:layout.chapter===4?14:10};
  layout.cinematic??={anchor:[layout.spawn[0],0,layout.spawn[1]],crashPoint:[layout.taskPositions[1][0],0,layout.taskPositions[1][1]],vehicleRoute:layout.route.map(([x,z])=>[x,0,z]),cameraSafe:[layout.spawn[0],1.65,layout.spawn[1]]};
  expandChapterLayout(layout);
}
export const CHAPTER_LAYOUTS=layouts;
export function getChapterLayout(id=1){
  const layout=typeof id==='number'?layouts[id-1]:layouts.find(item=>item.id===id||String(item.chapter)===String(id));
  if(!layout)throw new RangeError(`Unknown chapter scene: ${id}`);
  return structuredClone(layout);
}
