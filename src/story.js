import {getChapterStoryDirection,getTaskStoryDirection,getDramaticDialogue} from './chapter-story-direction.js';
// 影片事件构成战役骨架；阿米娜、里德与米勒及选择分支均为原创。
// 坐标使用 [x, z]；角色朝向 0 时面向 -z。
export const INITIAL_RESOURCES = {
  trust: 2, medicine: 3, ammo: 360, civilians: 0, fatigue: 0, cohesion: 2,
};

const line = (speaker, text, channel = 'local') => ({ speaker, text, channel });
const task = (id, label, kind, pos, text, seconds, details) => ({
  id, label, kind, pos, text, seconds, ...details,
  // A radio task uses the player's carried set, never a world-space radio prop.
  spawn: details.interaction !== 'radio' && details.spawn !== false,
});
const option = (id, label, description, effects, flag, response) => ({ id, label, description, effects, flag, response });
const voice = (speaker, text) => ({ speaker, text });
// Authored encounters start on an actual sight line. Patrol points stay on the
// street, and every actor is present from chapter load rather than spawned in view.
const hostile = (pos, lookAt, patrol, fireDelay = 2.4, opening = true) => ({ pos, lookAt, patrol, fireDelay, opening });

export const CHAPTERS = [
  {
    id: 1, title: '饥饿之城', subtitle: '这里也是某个人的家',
    opening: 'ch01-clinic-evac', closing: 'ch01-civilians-depart',
    role: '阿米娜 · 索马里救护志愿者（原创）', time: '10月3日 · 午后', mood: 'day', armed: false,
    spawn: [0, 65], facing: 0,
    intro: '远处的旋翼声越来越近。你想把诊所里的最后几个人带到安全处，也想知道妹妹是否已经回家。',
    radio: [voice('阿米娜', '先看清路，再带他们走。'), voice('邻居', '我们不是地图上的一个点。我们住在这里。')],
    tasks: [
      task('find-family', '向哈娃确认失散家人的去向', 'civilian', [3, 43], '哈娃指向诊所后门，答应先把孩子留在遮蔽处。', 3, { interaction: 'talk', speaker: '哈娃（原创）', animation: 'talk', sceneEvent: 'ch01-family-locates-clinic', dialogue: [line('哈娃（原创）', '孩子在院子里。我父亲还在诊所，他走不快。'), line('阿米娜', '我去接他。你先数清院里的人，不要到大街上找我。'), line('哈娃（原创）', '我会在后门等你，带上他的水壶。')] }),
      task('clinic-kit', '从诊所助手手中接过急救包', 'civilian', [-3, 21], '助手把敷料包交给你，随后扶老人坐稳。', 3, { interaction: 'hold', speaker: '诊所助手（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch01-medical-bag-handover', dialogue: [line('诊所助手（原创）', '敷料都在这里。拿好，我要扶他起来。'), line('阿米娜', '把包带绕到我肩上。我空出一只手扶他。'), line('诊所助手（原创）', '好了，抓稳这边，等他站住再走。')] }),
      task('quiet-street', '陪哈娃一家走到背街接应处', 'civilian', [2, 0], '一家人在背街重新聚齐。哈娃回头确认诊所的人也跟上了。', 2, { interaction: 'escort', speaker: '哈娃（原创）', animation: 'escort', escortFrom: 'find-family', escortFromPrevious: true, sceneEvent: 'ch01-family-reaches-shelter', dialogue: [line('哈娃（原创）', '这条巷子还通，孩子们已经过去了。'), line('阿米娜', '我陪你走到门廊。别落下你父亲，我们一起慢慢走。'), line('哈娃（原创）', '我扶另一边。到门廊以后再清点一次。')] }),
    ],
    choice: {
      title: '先带谁走', context: '邻居们需要带路；诊所还有一位无法独自行走的老人。两件事都要耗费时间。',
      options: [
        option('guide', '带邻居们绕行', '居民安全 +3，疲劳 +1；阿米娜会在尾声收到这些家庭的消息。', { civilians: 3, fatigue: 1 }, 'amina_guided', '你记住了每个人的名字，确认他们在转角重新聚齐。'),
        option('elder', '留下协助老人', '医疗物资 −1，居民安全 +2，信任 +1；老人一家记得你的陪伴。', { medicine: -1, civilians: 2, trust: 1 }, 'amina_stayed', '你放慢脚步。老人握住你的手，终于愿意离开。'),
      ],
    },
    outro: '城市上空传来更多旋翼声。你不知道行动的名字，只知道明天还要有人在这里生活。',
    hostiles: [],
  },
  {
    id: 2, title: '出发前的人们', subtitle: '先记住他们的名字',
    opening: 'ch02-base-handover', closing: 'ch02-squad-assemble',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 行动前', mood: 'day', armed: true,
    spawn: [0, 65], facing: 0,
    intro: '临时接任指挥后，所有目光都落在你身上。你熟悉武器，却还不熟悉让别人信任自己的重量。',
    radio: [voice('米勒（原创）', '长官，我知道流程。只是第一次真的要进去。'), voice('埃弗斯曼', '有问题就说。别一个人硬撑。')],
    tasks: [
      task('check-kit', '与军需员核对并接取小队补给', 'soldier', [-3, 43], '你检查封口，接过补给，让军需员在清单上划去这一项。', 2, { interaction: 'hold', speaker: '军需员（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch02-kit-check', dialogue: [line('军需员（原创）', '这一组是你们的。水壶、备用弹匣和敷料，逐项看。'), line('埃弗斯曼', '敷料分别放，不能全在一个人身上。'), line('军需员（原创）', '明白。接好这一袋，我去叫下一组。')] }),
      task('meet-miller', '听米勒说完，再确认他的搭档', 'soldier', [3, 21], '米勒收起照片，转身叫出了搭档的名字。', 3, { interaction: 'talk', speaker: '米勒（原创）', animation: 'talk', sceneEvent: 'ch02-miller-buddy-check', dialogue: [line('米勒（原创）', '我背熟了流程，可一想到要进去，脑子就空了。'), line('埃弗斯曼', '先记住身边的人。看不到队伍就说出来，不要独自追。'), line('米勒（原创）', '我跟着哈里斯。有问题我会直接叫你。')] }),
      task('assemble', '到车旁向班长确认人员已齐', 'soldier', [0, 0], '班长逐个点名，队员回声从车旁传来。', 2, { interaction: 'talk', speaker: '班长（原创）', animation: 'observe', sceneEvent: 'ch02-roll-call', dialogue: [line('班长（原创）', '车旁就差你这组。新队员也检查过了？'), line('埃弗斯曼', '检查过。先点人，再确认谁坐哪辆车。'), line('班长（原创）', '收到。各组报名字，让后排也听清。')] }),
    ],
    choice: {
      title: '接过指挥', context: '出发前还剩几分钟。米勒明显紧张，而全队需要最后一次核对。',
      options: [
        option('listen', '单独听米勒说完', '信任 +2；米勒在后续章节更愿意报告自己的伤势。', { trust: 2 }, 'miller_listened', '他没有变得无所畏惧，只是不必再假装如此。'),
        option('rehearse', '带全队复核集合约定', '凝聚力 +2；失散后的队员更容易重新会合。', { cohesion: 2 }, 'rally_rehearsed', '每个人重复了一遍集合约定。你也重复了一遍。'),
      ],
    },
    outro: '他们不再只是装备相同的轮廓。你能分辨谁在开玩笑，谁正在用力保持平静。',
    hostiles: [],
  },
  {
    id: 3, title: '预计一小时', subtitle: '计划里没有漫长的夜',
    opening: 'ch03-mission-briefing', closing: 'ch03-helicopter-board',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 出发前', mood: 'day', armed: false,
    spawn: [-65, 0], facing: -Math.PI / 2,
    intro: '简报把城市变成了几条路线和一个目标。你被告知行动会很快结束，但仍要为队员决定带什么出发。',
    radio: [voice('简报广播', '完成抓捕后，按指示与地面车队会合。'), voice('埃弗斯曼', '听清目标，也记住回来的人。')],
    tasks: [
      task('briefing', '向简报军官复述抓捕与会合安排', 'soldier', [-43, 3], '你在地图旁确认会合条件，军官把目标建筑再次指给你看。', 3, { interaction: 'talk', speaker: '简报军官（原创）', animation: 'observe', sceneEvent: 'ch03-map-briefing', dialogue: [line('简报军官（原创）', '目标位于奥林匹克饭店附近。完成抓捕后与地面车队会合。'), line('埃弗斯曼', '如果车队没有准时到，我们先稳住集合位置，再报告。'), line('简报军官（原创）', '对。不要把预计时间当成街上已经发生的情况。')] }),
      task('loadout', '与米勒整理额外携行物资', 'soldier', [-21, -3], '米勒把两组物资摆开，等你做出最后的携行选择。', 2, { interaction: 'hold', speaker: '米勒（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch03-loadout-packs', dialogue: [line('米勒（原创）', '包里还空一点，能塞进这组敷料，或者备用弹药。'), line('埃弗斯曼', '先重新绑紧，别让物资卡在舱门上。分量由我们一起担。'), line('米勒（原创）', '我把绑带扣好了。出发前等你最后确认。')] }),
      task('boarding', '按机组指示进入登机队列', 'soldier', [0, 2], '机组成员给出手势，队员低头走向舱门。', 2, { interaction: 'hold', speaker: '机组成员（原创）', animation: 'board', sceneEvent: 'ch03-team-boards', dialogue: [line('机组成员（原创）', '这一组从这里上，低头，别停在尾部。'), line('埃弗斯曼', '收到。我等最后一名队员到门口。'), line('机组成员（原创）', '他到了。抓住扶手，现在可以上来。')] }),
    ],
    choice: {
      title: '有限的携行空间', context: '额外空间只能装下一组物资。两种准备都会影响后续章节。',
      options: [
        option('medical', '增加医疗物资', '医疗物资 +2，疲劳 +1；后续可以照顾更多原创支线伤员。', { medicine: 2, fatigue: 1 }, 'packed_medical', '你把额外的敷料分给队员，提醒他们记住放在哪里。'),
        option('ammunition', '增加备用弹药', '弹药 +30，疲劳 +1；夜间防守的补给余量增加。', { ammo: 30, fatigue: 1 }, 'packed_ammo', '弹匣撞在一起发出轻响。你希望这些准备不会全部用上。'),
      ],
    },
    outro: '地图被折起，舱门边的风越来越大。那句“一小时”，仍留在每个人心里。',
    hostiles: [],
  },
  {
    id: 4, title: '飞越屋顶', subtitle: '第一个意外',
    opening: 'ch04-rooftop-insertion', closing: 'ch04-blackburn-transfer',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 下午', mood: 'day', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '落地后，布莱克本已经躺在街上。刚才还整齐的计划骤然失去形状，你必须让身边的人重新行动起来。',
    radio: [voice('队员', '有人坠落！需要担架！'), voice('埃弗斯曼', '看着我。我们先把他带到车旁。')],
    tasks: [
      task('blackburn', '在军医指示下稳住布莱克本', 'wounded', [3, -43], '军医检查伤员，你托住他的肩侧，等候转运口令。', 4, { interaction: 'hold', speaker: '军医（原创）', animation: 'treat', carry: false, sceneEvent: 'ch04-blackburn-stabilized', participants: [{ name: '军医（原创）', kind: 'soldier' }], dialogue: [line('军医（原创）', '先别拉他。帮我稳住这里，给他留出呼吸的空间。'), line('埃弗斯曼', '布莱克本，我们在你旁边。军医正在检查。'), line('军医（原创）', '稳住，等担架就位，我们一起移动。')] }),
      task('stretcher', '接过队员展开的担架', 'soldier', [-3, -21], '队员拉开担架，你接住另一端，检查受力点。', 3, { interaction: 'hold', speaker: '担架队员（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch04-stretcher-open', dialogue: [line('担架队员（原创）', '这边已经展开。你握住另一头，别扯开绑带。'), line('埃弗斯曼', '接住了。跟着军医的口令抬，不要抢先。'), line('担架队员（原创）', '好，我看着他的手势。一起过去。')] }),
      task('transfer', '掩护军医把担架交给撤送组', 'soldier', [2, 0], '担架从两组人的手中交接，撤送组确认伤员已固定。', 4, { interaction: 'hold', speaker: '撤送组长（原创）', animation: 'handover', sceneEvent: 'ch04-blackburn-loaded', dialogue: [line('撤送组长（原创）', '车门打开了。把担架送过来，我接前端。'), line('埃弗斯曼', '布莱克本在担架上。军医，跟车的人是谁？'), line('撤送组长（原创）', '已经安排好了。等我们固定完，你再松手。')] }),
    ],
    choice: {
      title: '重新组织队伍', context: '伤员已经转交。其余人有人慌乱，有人仍在寻找命令。',
      options: [
        option('reassure', '先安抚受到惊吓的队员', '信任 +1，疲劳 +1；队员知道自己的恐惧可以被说出来。', { trust: 1, fatigue: 1 }, 'landing_reassured', '你蹲到他身边，把接下来的事情一件件说清楚。'),
        option('regroup', '先清点人员并重新集合', '凝聚力 +1；后续失散支线更容易保持联络。', { cohesion: 1 }, 'landing_regrouped', '名字一个接一个得到回应。短暂的秩序回到了街上。'),
      ],
    },
    outro: '行动才刚开始，就已经有人需要被送回去。你第一次意识到，回来可能比进去更难。',
    hostiles: [
      hostile([-1.4, -38.5], [0, -65], [[1.8, -36], [-2.5, -32]], 5.0),
      hostile([2.0, -20], [0, -65], [[-2.0, -18], [2.4, -12]], 6.5, false),
    ],
  },
  {
    id: 5, title: '目标到手', subtitle: '撤离并未开始',
    opening: 'ch05-targets-secured', closing: 'ch05-convoy-depart',
    role: '里德 · 车队联络员（原创）', time: '10月3日 · 下午', mood: 'day', armed: true,
    spawn: [-65, -50], facing: -Math.PI / 2,
    intro: '抓捕目标已经上车，但无线电里同时响着伤员和路况报告。你坐在车队一侧，发现每个人都在等别人先动。',
    radio: [voice('车队频道', '伤员撤送车辆先行。保持联络。'), voice('里德（原创）', '收到。告诉我们你们到了哪里。')],
    tasks: [
      task('convoy-check', '向押送组长核对已上车人员', 'soldier', [-43, -47], '组长关上车门前，再次把人员数报给你。', 3, { interaction: 'talk', speaker: '押送组长（原创）', animation: 'observe', sceneEvent: 'ch05-target-door-closes', dialogue: [line('押送组长（原创）', '目标人员已在车里。后车还没有回人数。'), line('里德', '先别凭车门关上就判齐。我去叫后车回应。'), line('押送组长（原创）', '我留在这里看着这辆，你把结果带回来。')] }),
      task('casualty-kit', '把救护包交给伤员车上的救护员', 'soldier', [-21, -53], '救护员接过包，又检查了一遍车内伤员。', 3, { interaction: 'hold', speaker: '车队救护员（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch05-casualty-car-kit', dialogue: [line('车队救护员（原创）', '这辆先送伤员。把包放到我伸手能拿到的地方。'), line('里德', '给你。先行车辆的联络频率我会一直听着。'), line('车队救护员（原创）', '谢谢。别只问路，也问他们车里人的情况。')] }),
      task('contact-convoy', '用随身电台核对先行车队情况', 'waypoint', [0, -48], '电台传回先行车队遇袭及皮拉死亡的消息。你把报告写下，继续确认伤员去向。', 3, { interaction: 'radio', speaker: '先行车辆', animation: 'radio', sceneEvent: 'ch05-pilla-report', dialogue: [line('里德', '先行车辆，收到请回答。你们还在一起吗？', 'radio'), line('先行车辆', '我们遭到射击。皮拉没能活下来，车队仍在撤送伤员。', 'radio'), line('里德', '收到。报告会转交救护区，告诉我还有谁需要接应。', 'radio')] }),
    ],
    choice: {
      title: '车厢里的空位', context: '米勒的同行者受了伤，另一辆车还在找补给。你只能立即完成一项额外准备。',
      options: [
        option('aid', '给原创伤员留下救护包', '医疗物资 −1，信任 +1；该伤员在尾声有更好的恢复条件。', { medicine: -1, trust: 1 }, 'convoy_patient_aided', '你把名字写在救护包上，确保交接时不会有人被遗漏。'),
        option('share', '协助后车核对人员与交接', '凝聚力 +1，疲劳 +1；不消耗物资，但需要你留下协助。', { fatigue: 1, cohesion: 1 }, 'convoy_people_checked', '后车的人点了点头。车队终于不再只是各自封闭的车厢。'),
      ],
    },
    outro: '无线电宣布抓捕目标完成。车里的伤员却仍在问，什么时候才能回去。',
    hostiles: [
      hostile([-39, -51.4], [-65, -50], [[-36, -48], [-31, -52.3]], 2.4),
      hostile([-25, -48.2], [-65, -50], [[-23, -51.7], [-17, -48.5]], 4.6),
      hostile([-7, -51.7], [-65, -50], [[-10, -48.2], [-3, -51.5]], 6.0, false),
    ],
  },
  {
    id: 6, title: '第一架黑鹰坠落', subtitle: '任务被改写',
    opening: 'ch06-crash61', closing: 'ch06-rescue-redirect',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 下午', mood: 'day', armed: true,
    spawn: [0, 65], facing: 0,
    intro: '一声坠响盖过交火。烟柱从屋顶后升起，无线电里的撤离指令被新的呼叫打断：“黑鹰坠落。”',
    radio: [voice('指挥频道', '超级六一坠落。地面单位转向救援。'), voice('埃弗斯曼', '所有人看向我。我们的目标变了。')],
    tasks: [
      task('receive-update', '通过随身电台确认超级六一求援', 'waypoint', [-3, 43], '新的救援命令得到复诵，队伍不再向原会合点前进。', 3, { interaction: 'radio', speaker: '指挥频道', animation: 'radio', sceneEvent: 'ch06-objective-changes', dialogue: [line('指挥频道', '超级六一坠落。地面单位转向坠机点，报告你们的位置。', 'radio'), line('埃弗斯曼', '收到，正在重新集合。确认是第一道烟柱方向。', 'radio'), line('指挥频道', '确认。先接近并建立外围，救援组正在进入。', 'radio')] }),
      task('rally-point', '与米勒当面清点并重新分配补给', 'soldier', [3, 21], '米勒叫回落后的队员，把补给递给身旁的人。', 2, { interaction: 'talk', speaker: '米勒（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch06-squad-regroups', dialogue: [line('米勒（原创）', '我们还向原来那条街走吗？后面的人听到两个命令。'), line('埃弗斯曼', '现在去坠机点。把后面的人叫到这里，先互认名字。'), line('米勒（原创）', '明白。哈里斯也到了，我把他那份补给递过去。')] }),
      task('crash-approach', '在坠机点外围守住救援组入口', 'soldier', [-2, 0], '外围稳住后，救援人员从你身边进入残骸区域。', 4, { interaction: 'defend', speaker: '救援组员（原创）', animation: 'defend', defendSeconds: 10, requiredKills: 1, sceneEvent: 'ch06-rescue-enters-wreck', dialogue: [line('救援组员（原创）', '我们要从这个缺口进去。掩护入口，别跟着挤到机身旁。'), line('埃弗斯曼', '我们守在外围。你们进去以后给个确认。'), line('救援组员（原创）', '收到。等这段路压住，我们就动。')] }),
    ],
    choice: {
      title: '烟柱之前', context: '队伍必须继续救援，但有人的脚步已经开始乱了。',
      options: [
        option('count', '停下完成一次人员互认', '凝聚力 +2，疲劳 +1；失散时更容易确认缺少谁。', { cohesion: 2, fatigue: 1 }, 'crash_counted', '每个人都说出了自己和身旁人的名字。'),
        option('carry', '替疲惫队员承担物资', '信任 +2，疲劳 +2；你承担更多重量，队员仍能跟上。', { trust: 2, fatigue: 2 }, 'crash_load_carried', '肩带压得更深了。身后的脚步重新接近。'),
      ],
    },
    outro: '任务不再是把目标带走。你必须先找到那些从天上落下来的人。',
    hostiles: [
      hostile([-1.5, 39], [0, 65], [[2.2, 37], [-2.2, 32]], 2.2),
      hostile([2.2, 24], [0, 65], [[-2.1, 25], [2.3, 18]], 4.8),
      hostile([-1.8, 8], [0, 65], [[1.5, 11], [-2.0, 6]], 6.0, false),
    ],
  },
  {
    id: 7, title: '穿过街区', subtitle: '谁还没有回答',
    opening: 'ch07-separated-patrol', closing: 'ch07-patrol-reunites',
    role: '米勒 · 游骑兵队员（原创）', time: '10月3日 · 傍晚前', mood: 'dusk', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '转过一道街口后，你听不见熟悉的脚步了。地图还在手里，但让你镇定的，是无线电里偶尔出现的名字。',
    radio: [voice('米勒（原创）', '我看不到主队。正在寻找集合位置。'), voice('埃弗斯曼', '说清你能看到什么。我们还在听。')],
    tasks: [
      task('reconnect', '用随身电台向埃弗斯曼描述街口', 'waypoint', [3, -43], '埃弗斯曼复述了你看到的门廊，约定在下个接应点碰面。', 3, { interaction: 'radio', speaker: '埃弗斯曼', animation: 'radio', sceneEvent: 'ch07-rally-agreed', dialogue: [line('米勒', '我看不到主队。旁边有一道低门廊，我停在墙后。', 'radio'), line('埃弗斯曼', '收到。别追远处的人影，沿接应标记到下一街口。', 'radio'), line('米勒', '我会先叫清呼号，再接近你们。', 'radio')] }),
      task('side-patient', '扶稳负伤的哈里斯并检查绑带', 'wounded', [-3, -21], '哈里斯撑住你的肩，等你确认他能否继续移动。', 4, { interaction: 'hold', speaker: '哈里斯（原创）', animation: 'treat', carry: false, sceneEvent: 'ch07-harris-supported', dialogue: [line('哈里斯（原创）', '别丢下我。我能走，只是站起来就发软。'), line('米勒', '先靠住墙。我把带子绑稳，再一起走。'), line('哈里斯（原创）', '好。你说走的时候我再动。')] }),
      task('find-rally', '陪哈里斯抵达队伍的接应门廊', 'soldier', [2, 0], '接应队员扶住哈里斯，复核两人的名字后让开入口。', 2, { interaction: 'escort', speaker: '哈里斯（原创）', animation: 'escort', escortFrom: 'side-patient', escortFromPrevious: true, reward: 'supplies', sceneEvent: 'ch07-harris-rejoins', dialogue: [line('哈里斯（原创）', '我能动了。接应的人是在前面那个门廊吗？'), line('米勒', '是，按刚才约定的呼号过去。我陪你走完这段。'), line('哈里斯（原创）', '好，慢一点。到那里以后再让他们接住我。')] }),
    ],
    choice: {
      title: '一起回到队伍', context: '伤员能走，但需要帮助。你可以替他处理伤势，也可以共同分担装备。',
      options: [
        option('treat', '使用一份医疗物资', '医疗物资 −1，信任 +2；原创伤员的后续恢复条件改善。', { medicine: -1, trust: 2 }, 'lost_patient_treated', '他重新站起来，这次没有急着把疼痛藏住。'),
        option('support', '分担装备，陪他慢慢走', '凝聚力 +1，疲劳 +2；保留物资，但米勒会更加疲惫。', { cohesion: 1, fatigue: 2 }, 'lost_patient_supported', '你们的脚步变慢，却终于有了相同的节奏。'),
      ],
    },
    outro: '回到队伍时，你先看清了每一张脸。被找到的感觉，比你想象中更加沉重。',
    hostiles: [
      hostile([1.4, -39], [0, -65], [[-2.1, -36], [2.2, -31]], 2.8),
      hostile([-2.0, -23], [0, -65], [[2.1, -25], [-2.0, -17]], 4.6),
    ],
  },
  {
    id: 8, title: '迷失的车队', subtitle: '地图没有告诉我们的事',
    opening: 'ch08-convoy-wrong-turn', closing: 'ch08-convoy-return',
    role: '里德 · 车队联络员（原创）', time: '10月3日 · 傍晚前', mood: 'dusk', armed: true,
    spawn: [65, 50], facing: Math.PI / 2,
    intro: '街口一次次被挡住。命令传到车里时，车队已经错过转弯。你必须把混乱里的信息拼成别人能够理解的话。',
    radio: [voice('车队频道', '前方受阻。确认后车还在跟随。'), voice('里德（原创）', '请逐辆回答。我们不能只听见最前面。')],
    tasks: [
      task('road-status', '听领车驾驶员说明错过的转弯', 'soldier', [43, 47], '驾驶员指向封住的路口，你把已确认的情况记下来。', 3, { interaction: 'talk', speaker: '领车驾驶员（原创）', animation: 'observe', sceneEvent: 'ch08-road-block-assessed', dialogue: [line('领车驾驶员（原创）', '指令传来时转弯已经过去了，前面又堵住。'), line('里德', '我只报我们现在能看到的路，不再重复上一条位置。'), line('领车驾驶员（原创）', '那先确认后车跟上。我要倒车，不能把他们堵在这里。')] }),
      task('rear-vehicle', '协助后车救护员固定伤员', 'soldier', [21, 53], '后车救护员把人员情况交给你，车辆可以重新起步。', 4, { interaction: 'hold', speaker: '后车救护员（原创）', animation: 'treat', sceneEvent: 'ch08-rear-casualty-secured', dialogue: [line('后车救护员（原创）', '这边一直听不清领车，伤员随着刹车滑下来。'), line('里德', '我帮你固定担架。你把名字和状况说给我。'), line('后车救护员（原创）', '两名伤员都在，我会跟住他们。绑带扣紧后再走。')] }),
      task('link-back', '随身电台通报无法接近与返程需求', 'waypoint', [0, 48], '返程请求得到确认，你逐车传达新的集合安排。', 3, { interaction: 'radio', speaker: '车队指挥频道', animation: 'radio', sceneEvent: 'ch08-return-order', dialogue: [line('里德', '车队未能接近坠机点，车内有多名伤员，需要返回交接。', 'radio'), line('车队指挥频道', '收到。保持车辆联络，返回后立即报告失联人员。', 'radio'), line('里德', '明白。我按车序确认，不让后车漏掉这条命令。', 'radio')] }),
    ],
    choice: {
      title: '带什么回去', context: '你能亲自整理一项交接。伤员需要照顾，下一次出发也需要完整的信息。',
      options: [
        option('handover', '陪同伤员完成交接', '医疗物资 −1，信任 +2；原创车队伤员获得持续照顾。', { medicine: -1, trust: 2 }, 'convoy_handover', '你把刚才记录的名字交给救护人员，等到对方逐个确认。'),
        option('report', '整理失联人员与路况记录', '凝聚力 +2，疲劳 +1；后续救援队获得更清楚的联络信息。', { cohesion: 2, fatigue: 1 }, 'convoy_report', '你删去了猜测，只留下确实看到和听到的事情。'),
      ],
    },
    outro: '返回基地没有带来解脱。你知道，还有人留在那片烟里。',
    hostiles: [
      hostile([39, 51.4], [65, 50], [[36, 48.2], [31, 52.0]], 2.4),
      hostile([25, 48.2], [65, 50], [[27, 51.8], [17, 48.3]], 4.6),
      hostile([7, 51.6], [65, 50], [[10, 48.2], [3, 51.4]], 6.0, false),
    ],
  },
  {
    id: 9, title: '第二道烟柱', subtitle: '等待有人回答',
    opening: 'ch09-crash64-cockpit', closing: 'ch09-rescuers-arrive',
    playerMode: 'cockpit', movementLocked: true,
    role: '杜兰特 · 超级六四机长', time: '10月3日 · 下午（并行事件）', mood: 'dusk', armed: false,
    spawn: [0, 65], facing: 0,
    intro: '超级六四坠落。你受伤留在破损的驾驶舱，无法起身行走。你只能转头观察、使用够得到的电台，并回应接近舱门的人。',
    radio: [voice('杜兰特', '有人能听到吗……'), voice('断续电台', '保持联络。我们知道你们在那里。')],
    tasks: [
      task('durant-voice', '在驾驶舱用手边电台发出求救', 'waypoint', [-3, 43], '救援频道重复了你的呼号，你留在座位里听着回答。', 3, { interaction: 'radio', speaker: '救援频道', animation: 'radio', anchor: 'cockpit', sceneEvent: 'ch09-cockpit-distress', dialogue: [line('杜兰特', '超级六四，我们坠落了。我受了伤，不能起身。', 'radio'), line('救援频道', '收到超级六四。保持联络，救援人员正在接近。', 'radio'), line('杜兰特', '我还在驾驶舱里。能听见你们。', 'radio')] }),
      task('durant-crew', '留在座位中稳住身体，回应救援频道', 'wreck', [3, 21], '你保持受伤姿势，手扶住座椅边缘，尽力作出清晰回应。', 3, { interaction: 'hold', speaker: '救援频道', animation: 'injured-seated', anchor: 'cockpit', spawn: false, carry: false, sceneEvent: 'ch09-seated-response', dialogue: [line('救援频道', '超级六四，你还能回答吗？我们继续呼叫你。', 'radio'), line('杜兰特', '能。我看得到破开的舱门，但我站不起来。', 'radio'), line('救援频道', '收到。告诉接近你的人你在什么位置，我们仍在听。', 'radio')] }),
      task('durant-wait', '从驾驶舱回应到达舱门的戈登', 'soldier', [-2, 0], '戈登在舱门外俯下身。你仍坐在受损驾驶舱内，终于能看见来救你的人。', 4, { interaction: 'talk', speaker: '戈登', animation: 'treat', anchor: 'cockpit', sceneEvent: 'ch09-contact-at-door', dialogue: [line('戈登', '我叫戈登。能听清我吗？我们找到你了。'), line('杜兰特', '能。我腿伤得很重，自己出不去。'), line('戈登', '我知道。先留在这里，我们来帮你。')] }),
    ],
    choice: {
      title: '传出的最后一句话', context: '这是叙事表达选择，不改变杜兰特被俘及后来获释的既定结局。',
      options: [
        option('names', '重复机组人员的呼号', '凝聚力 +1；尾声保留这段对同伴的记忆。', { cohesion: 1 }, 'durant_names', '你努力把每一个呼号说清楚。'),
        option('listen', '回应前来救援的人', '信任 +1；尾声保留这次短暂联络的回声。', { trust: 1 }, 'durant_answered', '你让他们知道，你仍在听。'),
      ],
    },
    outro: '戈登与舒加特已来到残骸旁。你仍受伤困在驾驶舱里，救援的行动从舱门外开始。',
    hostiles: [],
  },
  {
    id: 10, title: '两个人的决定', subtitle: '保护，不是胜利倒计时',
    opening: 'ch10-snipers-insert', closing: 'ch10-fixed-sacrifice',
    fixedOutcome: 'gordon-shughart-killed-durant-captured',
    role: '戈登 · 前往第二坠机点的救援人员', time: '10月3日 · 下午（并行事件）', mood: 'dusk', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '你与舒加特进入第二坠机点保护幸存者。这段经历有固定结局：两人牺牲，杜兰特被俘；此刻的目标是完成救助。',
    radio: [voice('戈登', '我们已经到地面。'), voice('舒加特', '先找到幸存者。让他知道我们在这里。')],
    tasks: [
      task('second-wreck', '与舒加特确认进入残骸的路线', 'soldier', [3, -43], '两人分开观察残骸两侧，向驾驶舱接近。', 3, { interaction: 'talk', speaker: '舒加特', animation: 'observe', sceneEvent: 'ch10-pair-approaches', dialogue: [line('舒加特', '驾驶舱那边有回应。我看住这一侧，你从舱门过去。'), line('戈登', '好。先找到还活着的人，别失去彼此的位置。'), line('舒加特', '我会叫你。接近以后告诉他我们是谁。')] }),
      task('protect-durant', '协助把受伤的杜兰特转到残骸旁', 'wounded', [-3, -21], '两人协力转移杜兰特，让他靠在残骸旁，随后继续保护他。', 4, { interaction: 'hold', speaker: '杜兰特', animation: 'treat', carry: false, sceneEvent: 'ch10-durant-extracted', dialogue: [line('戈登', '杜兰特，我们一起扶你出来。告诉我哪里疼，不用自己站。'), line('杜兰特', '腿和背都很疼。我能听见你，告诉我什么时候动。'), line('戈登', '知道了。等舒加特接住另一边，我们一起抬。')] }),
      task('relay-condition', '通过随身电台报告幸存者与增援需要', 'waypoint', [2, 0], '最后的现场报告被复诵。救助行动已完成，后续固定事件不由击杀数量改写。', 3, { interaction: 'radio', speaker: '指挥频道', animation: 'radio', sceneEvent: 'ch10-last-condition-report', dialogue: [line('戈登', '已找到幸存机长，伤势严重。我们正在保护他，需要支援。', 'radio'), line('指挥频道', '收到幸存者情况。保持联络，地面接近仍然受阻。', 'radio'), line('戈登', '明白。记录他的名字：杜兰特。他还活着。', 'radio')] }),
    ],
    choice: {
      title: '留下什么', context: '两人的牺牲是固定事件。选择改变这段经历的表达和团队留下的记忆。',
      options: [
        option('stay', '陪杜兰特说几句话', '信任 +2；尾声记录被困者获得陪伴的片刻。', { trust: 2 }, 'gordon_stayed', '短短几句话，让他知道自己没有被遗忘。'),
        option('relay', '完成最后一次现场报告', '凝聚力 +2；后续交接保留更完整的人员信息。', { cohesion: 2 }, 'gordon_reported', '你先报告人员，再报告位置。电台里有人重复确认。'),
      ],
    },
    outro: '叙事转场：戈登与舒加特牺牲，杜兰特被俘。这里没有胜利提示，也不是玩家操作失败。',
    hostiles: [
      hostile([-1.5, -39], [0, -65], [[-2.1, -35], [-1.4, -31]], 2.4),
      hostile([1.5, -24], [0, -65], [[-2.2, -26], [2.0, -18]], 4.4),
      hostile([-1.6, -7], [0, -65], [[1.3, -10], [-2.1, -3]], 6.0, false),
    ],
  },
  {
    id: 11, title: '伤员所在的房间', subtitle: '你能留下陪伴',
    opening: 'ch11-aid-station', closing: 'ch11-smith-dies', fixedOutcome: 'smith-dies',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 入夜', mood: 'night', armed: false,
    spawn: [0, 65], facing: 0,
    intro: '史密斯伤势严重，救治正在继续。影片中的结局不会被选择改写；你能决定的是如何陪伴他，以及怎样照顾还在等待的人。',
    radio: [voice('军医', '帮我照看其他人。告诉他们有人在。'), voice('埃弗斯曼', '史密斯，我在这里。')],
    tasks: [
      task('medical-supplies', '把敷料交到军医手里', 'soldier', [-3, 43], '军医接过敷料，继续处理史密斯的伤势。', 3, { interaction: 'hold', speaker: '军医（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch11-medic-receives-dressings', dialogue: [line('军医（原创）', '敷料放到我手边。不要挡住灯，我还需要一点位置。'), line('埃弗斯曼', '这里。我还能做什么？'), line('军医（原创）', '陪他说话，让他知道你在。其他伤员也需要有人照看。')] }),
      task('stay-smith', '在史密斯身旁听他说完', 'wounded', [3, 21], '你留在他的视线里，听完他断续说出的担忧。', 5, { interaction: 'talk', speaker: '史密斯', animation: 'treat', carry: false, sceneEvent: 'ch11-smith-conversation', dialogue: [line('史密斯', '外面的人……他们都还在吗？'), line('埃弗斯曼', '我们在确认每一个人。我现在就在你旁边。'), line('史密斯', '别急着走。再跟我说一会儿。'), line('埃弗斯曼', '好。我在听。')] }),
      task('care-living', '为米勒调整敷料并安排陪护', 'wounded', [-2, 0], '你回应下一位伤员的呼唤，让陪护队员坐到米勒身边。', 3, { interaction: 'hold', speaker: '米勒（原创）', animation: 'treat', carry: false, sceneEvent: 'ch11-miller-attended', dialogue: [line('米勒（原创）', '我一直没说，胳膊还在流血。'), line('埃弗斯曼', '让我看看。我们先稳住敷料，再决定怎么安排下一份物资。'), line('米勒（原创）', '这次我不说没事了。找个人陪我坐一会儿。')] }),
    ],
    choice: {
      title: '下一位仍在等待', context: '史密斯的死亡是固定剧情。原创队员米勒还需要救护与陪伴。',
      options: [
        option('miller-aid', '把医疗物资交给米勒', '医疗物资 −1，信任 +2；改善米勒的尾声恢复条件。', { medicine: -1, trust: 2 }, 'miller_medical', '米勒没有再说自己没事。他让你帮他处理伤势。'),
        option('miller-company', '安排队友轮流照看米勒', '凝聚力 +2，疲劳 +1；米勒获得持续陪伴，物资得以保留。', { cohesion: 2, fatigue: 1 }, 'miller_company', '没有人能让这一夜立刻结束，但没人再独自等待。'),
      ],
    },
    outro: '史密斯最终没能活下来。你久久没有说话，然后回应了下一声呼唤。',
    hostiles: [],
  },
  {
    id: 12, title: '熬过黑夜', subtitle: '每一次回应都很重要',
    opening: 'ch12-night-perimeter', closing: 'ch12-relief-approaches',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 深夜', mood: 'night', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '黑暗让街区失去熟悉的轮廓。你开始用队友的声音辨认位置，守住的目标逐渐只剩一个：等到所有人能够离开。',
    radio: [voice('指挥频道', '救援正在组织。继续保持联络。'), voice('米勒（原创）', '我还在，长官。')],
    tasks: [
      task('night-contact', '随身电台逐组确认夜间阵位', 'waypoint', [3, -43], '最后一组完成应答，空缺的观察方向有人接上。', 3, { interaction: 'radio', speaker: '后组队长（原创）', animation: 'radio', sceneEvent: 'ch12-perimeter-check', dialogue: [line('埃弗斯曼', '各组报人和位置，不要只说没事。后组先来。', 'radio'), line('后组队长（原创）', '三个人在，门廊方向能看到。右侧需要有人轮换。', 'radio'), line('埃弗斯曼', '收到。等我确认替换，再让疲惫的人下来。', 'radio')] }),
      task('night-supplies', '与米勒分装剩余弹药和饮水', 'soldier', [-3, -21], '米勒接过分装物资，逐人确认谁还缺少补给。', 3, { interaction: 'hold', speaker: '米勒（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch12-supplies-distributed', dialogue: [line('米勒（原创）', '还有这些。有人一直说不用给他，我觉得他没水了。'), line('埃弗斯曼', '按实际需要分，别让谁因为不好意思就空着。'), line('米勒（原创）', '我去问清楚。你接住这边，我把袋口重新系上。')] }),
      task('night-patient', '接替疲惫哨兵守住接应方向', 'soldier', [2, 0], '哨兵退到墙内短暂休息，下一班接上你的观察位置。', 4, { interaction: 'defend', speaker: '疲惫哨兵（原创）', animation: 'defend', defendSeconds: 14, requiredKills: 1, sceneEvent: 'ch12-watch-relieved', dialogue: [line('疲惫哨兵（原创）', '我眼前全是晃动的影子，再站下去怕认错人。'), line('埃弗斯曼', '到墙里坐下。我先接这个方向，等下一班到。'), line('疲惫哨兵（原创）', '你站我刚才的位置能看到入口。有人接我了，我再退。')] }),
    ],
    choice: {
      title: '把这一夜分担下去', context: '队员需要轮换，手里的补给却已经不多。',
      options: [
        option('take-watch', '自己承担额外值守', '疲劳 +3，信任 +1；别人得到休息，你在撤离时会更加吃力。', { fatigue: 3, trust: 1 }, 'night_extra_watch', '你叫醒下一个人之前，多等了一会儿。'),
        option('share-reserve', '分出备用弹药并组织轮换', '弹药 −18，凝聚力 +2，疲劳 −1；全队共同分担夜间压力。', { ammo: -18, cohesion: 2, fatigue: -1 }, 'night_rotation', '你把轮换顺序说清楚，也给自己留了一个位置。'),
      ],
    },
    outro: '支援的声音穿过夜空。每一段短暂的安静里，你都再次清点人数。',
    hostiles: [
      hostile([-1.4, -39], [0, -65], [[2.0, -36], [-2.2, -31]], 2.6),
      hostile([2.1, -24], [0, -65], [[-2.0, -26], [1.8, -17]], 4.8),
      hostile([-1.8, -8], [0, -65], [[1.4, -11], [-2.0, -3]], 6.0, false),
    ],
  },
  {
    id: 13, title: '援军进城', subtitle: '陌生的声音，同一个方向',
    opening: 'ch13-relief-convoy', closing: 'ch13-casualties-board',
    role: '里德 · 车队联络员（原创）', time: '10月4日 · 凌晨', mood: 'night', armed: true,
    spawn: [-65, 0], facing: -Math.PI / 2,
    intro: '联合救援力量终于接近。美军以及参与救援的马来西亚、巴基斯坦部队需要彼此配合，才能接走仍困在城里的人。',
    radio: [voice('救援频道', '已经接近接应区域。请确认伤员位置。'), voice('里德（原创）', '有人在等待你们。我会把信息说清楚。')],
    tasks: [
      task('relief-contact', '用随身电台向联合救援车队确认入口', 'waypoint', [-43, 3], '救援车队复诵入口特征，双方确认伤员交接位置。', 3, { interaction: 'radio', speaker: '救援车队联络员（原创）', animation: 'radio', sceneEvent: 'ch13-relief-route-confirmed', dialogue: [line('救援车队联络员（原创）', '车队已接近。美军接应组与马来西亚装甲车辆需要同一个入口确认。', 'radio'), line('里德', '收到。伤员在门廊内，我们会在入口接车，逐人交接。', 'radio'), line('救援车队联络员（原创）', '明白。巴基斯坦部队也在支援接近路线，保持车道畅通。', 'radio')] }),
      task('relief-patient', '协助救护员把伤员移到交接线内', 'wounded', [-21, -3], '伤员被稳妥交到接应人员手中，名字和伤情一起传递。', 3, { interaction: 'hold', speaker: '接应救护员（原创）', animation: 'treat', carry: false, participants: [{ name: '接应救护员（原创）', kind: 'soldier' }], sceneEvent: 'ch13-casualty-handover', dialogue: [line('接应救护员（原创）', '先把他送到门内，车停稳后再抬出去。名字是什么？'), line('里德', '这是我们交接单上的伤员。我把名字和刚才的情况逐项读给你。'), line('接应救护员（原创）', '我记下了。接住另一端，我们一起把他放稳。')] }),
      task('relief-vehicle', '守住装载通道，等车组完成接应', 'soldier', [0, 2], '装载完成的确认从车旁传来，救援车辆准备接走下一组人。', 4, { interaction: 'defend', speaker: '救援车组成员（原创）', animation: 'defend', defendSeconds: 10, requiredKills: 1, sceneEvent: 'ch13-loading-lane-clear', dialogue: [line('救援车组成员（原创）', '伤员正在上车。请守住侧面的通道，别站在车后。'), line('里德', '我接住这一侧。每抬走一人，你给我确认。'), line('救援车组成员（原创）', '好。最后一副担架固定后，我会朝你示意。')] }),
    ],
    choice: {
      title: '接应中的片刻', context: '一组居民在等待通过，车队也需要有人逐项完成交接。',
      options: [
        option('residents', '引导原创居民远离车道', '居民安全 +2，疲劳 +1；阿米娜的尾声将收到新的平安消息。', { civilians: 2, fatigue: 1 }, 'relief_residents', '你示意他们慢慢走，等到最后一个人通过。'),
        option('coordination', '留下完成跨车组人员交接', '凝聚力 +2，信任 +1；撤离队伍的信息更加完整。', { cohesion: 2, trust: 1 }, 'relief_coordination', '名单被传到下一辆车。每一个回答都有人记录。'),
      ],
    },
    outro: '救援者也满身疲惫。他们没有问你为什么还在这里，只问还有谁没有上车。',
    hostiles: [
      hostile([-39, -1.4], [-65, 0], [[-36, 2.1], [-31, -2.0]], 2.4),
      hostile([-25, 1.8], [-65, 0], [[-27, -2.1], [-18, 2.0]], 4.8),
      hostile([-8, -1.7], [-65, 0], [[-11, 2.0], [-4, -1.8]], 6.0, false),
    ],
  },
  {
    id: 14, title: '把他们带回去', subtitle: '名字仍在名单上',
    opening: 'ch14-crew-recovery', closing: 'ch14-last-vehicle-leaves',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月4日 · 黎明前', mood: 'dawn', armed: true,
    spawn: [0, 65], facing: 0,
    intro: '救援还没有结束。机组遗体需要被带走，伤员需要完成交接。你不愿再用“差不多”回答人数是否齐全。',
    radio: [voice('救援人员', '我们还需要一点时间。'), voice('埃弗斯曼', '我会把外面的交接准备好。')],
    tasks: [
      task('recover-crew', '按回收组口令协助转移机组遗体', 'soldier', [-3, 43], '回收组接过重量，担架缓慢离开残骸旁。', 5, { interaction: 'hold', speaker: '回收组员（原创）', animation: 'handover', sceneEvent: 'ch14-crew-carried-out', dialogue: [line('回收组员（原创）', '这边可以移动了。抓稳担架，我们一起抬。'), line('埃弗斯曼', '我接住了。慢一点，先让前面的人转过身。'), line('回收组员（原创）', '好，等我的口令。我们把他们带回去。')] }),
      task('personal-items', '与记录员核对遗物袋的姓名标签', 'soldier', [3, 21], '每一袋物品都附上确认过的标签，记录员逐项登记。', 3, { interaction: 'hold', speaker: '记录员（原创）', animation: 'handover', sceneEvent: 'ch14-effects-labelled', dialogue: [line('记录员（原创）', '这些物品要分别装袋。不能确定的，留空等核对。'), line('埃弗斯曼', '我把已确认的名字念给你。不要猜是谁的。'), line('记录员（原创）', '明白。你系紧这一袋，我再读一遍标签。')] }),
      task('last-count', '向车组长逐项交接撤离名单', 'soldier', [-2, 0], '车组长重复名单，确认伤员、遗体与随行人员的去向。', 4, { interaction: 'talk', speaker: '撤离车组长（原创）', animation: 'observe', sceneEvent: 'ch14-manifest-confirmed', dialogue: [line('撤离车组长（原创）', '车要走了。还有谁没有交接到下一组？'), line('埃弗斯曼', '等我逐项确认。名单上不再回答的人，也必须有去向。'), line('撤离车组长（原创）', '我听着。读完我再复诵，不用“差不多”收尾。')] }),
    ],
    choice: {
      title: '最后一段搬运', context: '你的身体已经沉重。还有转运工作与人员记录等待完成。',
      options: [
        option('carry-last', '亲自承担最后一段搬运', '疲劳 +2，信任 +2；同行的人记住你留下帮忙。', { fatigue: 2, trust: 2 }, 'recovery_carried', '你重新调整肩膀，直到另一双手接住重量。'),
        option('record-last', '逐项核对遗物与交接记录', '凝聚力 +2；尾声保留更完整的归还记录。', { cohesion: 2 }, 'recovery_recorded', '你让接手的人重复了名字，才把记录交出去。'),
      ],
    },
    outro: '车辆终于准备离开。你回头看了一眼，确认没有人还在等你的命令。',
    hostiles: [
      hostile([1.5, 39], [0, 65], [[-2.2, 36], [2.0, 31]], 2.8),
      hostile([-2.0, 23], [0, 65], [[2.0, 25], [-2.0, 16]], 4.8),
    ],
  },
  {
    id: 15, title: '黎明奔跑', subtitle: '跟上身旁的人',
    opening: 'ch15-foot-withdrawal', closing: 'ch15-safety-arrival',
    role: '米勒 · 游骑兵队员（原创）', time: '10月4日 · 清晨', mood: 'dawn', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '本章沿用影片的徒步撤离呈现。车队正在前方移动，你的腿越来越沉，只能不断确认身旁的人有没有跟上。',
    radio: [voice('米勒（原创）', '我能走。别让我看不见你们。'), voice('埃弗斯曼', '一起到下一个街口。先到那里。')],
    tasks: [
      task('run-rally', '抵达埃弗斯曼所在的第一个转角', 'soldier', [3, -43], '埃弗斯曼确认你到位，让后一组沿同一路线接上。', 2, { interaction: 'reach', speaker: '埃弗斯曼', animation: 'observe', sceneEvent: 'ch15-first-corner-reached', dialogue: [line('埃弗斯曼', '米勒，看我这里。先到这个转角，再看下一段。'), line('米勒', '我到了。后面还有人，别让他们失去方向。'), line('埃弗斯曼', '我会等他们看到手势。你先喘口气，再一起走。')] }),
      task('run-help', '扶稳落后的哈里斯，让他重新跟上', 'wounded', [-3, -21], '哈里斯把重量慢慢交给你，准备与队伍一起撤离。', 4, { interaction: 'hold', speaker: '哈里斯（原创）', animation: 'treat', carry: false, sceneEvent: 'ch15-harris-lifted', dialogue: [line('哈里斯（原创）', '我腿迈不开了。别让队伍看不见我们。'), line('米勒', '扶我的肩，先站稳。我不会把你留在这里。'), line('哈里斯（原创）', '好。我数着你的脚步，和你一起走。')] }),
      task('run-safe', '陪哈里斯走到安全区救护员身旁', 'soldier', [2, 0], '救护员接过哈里斯的重量，你终于可以放下手臂。', 4, { interaction: 'escort', speaker: '哈里斯（原创）', animation: 'escort', escortFrom: 'run-help', escortFromPrevious: true, sceneEvent: 'ch15-final-handover', dialogue: [line('哈里斯（原创）', '我看见接应的人了。你先别松手。'), line('米勒', '我扶你到他们身边，让他们接住另一边再放开。'), line('哈里斯（原创）', '好。我们一起走到那里，就最后这一段。')] }),
    ],
    choice: {
      title: '最后几步', context: '队友仍在喘息。你可以分担他的重量，也可以立即把剩余物资交给接应人员。',
      options: [
        option('shoulder', '继续扶着他完成交接', '信任 +2，凝聚力 +1，疲劳 +2；原创队友不会独自进入救护区。', { trust: 2, cohesion: 1, fatigue: 2 }, 'mile_supported', '直到救护人员接住他，你才松开手。'),
        option('reserve', '把最后的救护物资交出去', '医疗物资 −1，信任 +1，疲劳 −1；改善原创伤员的后续救治条件。', { medicine: -1, trust: 1, fatigue: -1 }, 'mile_medical', '你把包交出去，第一次允许自己坐下来。'),
      ],
    },
    outro: '抵达安全区没有欢呼。你听见自己的呼吸，也听见身旁仍有人叫着队友的名字。',
    hostiles: [
      hostile([-1.4, -39], [0, -65], [[2.2, -36], [-2.0, -31]], 2.6),
      hostile([2.1, -24], [0, -65], [[-2.0, -26], [2.0, -17]], 4.8),
      hostile([-1.8, -8], [0, -65], [[1.4, -10], [-2.0, -3]], 6.0, false),
    ],
  },
  {
    id: 16, title: '回来的人', subtitle: '战争留下的空位',
    opening: 'ch16-base-return', closing: 'ch16-names-remembered',
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月4日 · 清晨之后', mood: 'dawn', armed: false,
    spawn: [-65, 50], facing: -Math.PI / 2,
    intro: '武器被放下，名字仍在被反复确认。影片的事件已经结束，原创人物的余波将由你一路留下的选择共同决定。',
    radio: [voice('埃弗斯曼', '有人回来了。也有人再也不能回答。'), voice('阿米娜（原创）', '我们开始寻找失散的人。城市还要继续生活。')],
    tasks: [
      task('leave-gear', '把行动装备交给归建登记员', 'soldier', [-43, 53], '登记员接住装备，没有催你立刻离开。', 3, { interaction: 'hold', speaker: '归建登记员（原创）', animation: 'handover', reward: 'supplies', sceneEvent: 'ch16-gear-put-down', dialogue: [line('归建登记员（原创）', '把装备放在这边。我来记，你先缓一缓。'), line('埃弗斯曼', '我还得去救护区确认几个人。'), line('归建登记员（原创）', '会有人带你去。先把肩带松开，东西我接着。')] }),
      task('visit-survivors', '听米勒说出这一夜留下的感受', 'wounded', [-21, 47], '米勒不再用“没事”结束谈话，你坐下来听他讲。', 4, { interaction: 'talk', speaker: '米勒（原创）', animation: 'talk', carry: false, sceneEvent: 'ch16-miller-speaks', dialogue: [line('米勒（原创）', '我一直记着街口那次呼叫。我以为再也没人会回答。'), line('埃弗斯曼', '我们听见了。以后想说这些，不必等到撑不住。'), line('米勒（原创）', '那你坐一会儿吧。我想把还记得的事情说清楚。')] }),
      task('remember', '与记录员记全没有回来的名字', 'soldier', [0, 52], '你与记录员逐字核对姓名，再为居民与救援者留下记录的位置。', 5, { interaction: 'hold', speaker: '伤亡记录员（原创）', animation: 'observe', sceneEvent: 'ch16-names-entered', dialogue: [line('伤亡记录员（原创）', '我读一遍，你帮我核对。别让名字在交接里漏掉。'), line('埃弗斯曼', '我会写下亲眼看见的，也标出还不能确定的。'), line('伤亡记录员（原创）', '好。写完整，留给后来的人继续确认。')] }),
    ],
    choice: {
      title: '你愿意留下怎样的声音', context: '这次选择决定尾声的侧重点。前面章节留下的结果不会被一句话抹去。',
      options: [
        option('letter', '写一封关于同伴的信', '信任 +1；尾声从人与人之间留下的记忆结束。', { trust: 1 }, 'ending_letter', '你写下他平时说话的样子，而不只是最后发生的事。'),
        option('testimony', '完整记录自己的所见', '凝聚力 +1；尾声保留救援、平民与不同部队的共同经历。', { cohesion: 1 }, 'ending_testimony', '你写下知道的事情，也留下自己仍无法回答的问题。'),
      ],
    },
    outro: '影片后续交代：杜兰特在被俘十一天后获释。历史人物结局保持固定；以下为依据玩家选择生成的原创人物尾声。',
    hostiles: [],
  },
];

// The core IDs, effects and fixed character outcomes remain the campaign spine.
// Presentation now starts with the current human conflict and a visible place.
for(const chapter of CHAPTERS){
  const direction=getChapterStoryDirection(chapter.id);chapter.intro=direction.intro;
  chapter.throughline=direction.throughline;chapter.stakes=direction.stakes;chapter.turn=direction.turn;chapter.outcome=direction.outcome;chapter.handoff=direction.handoff;chapter.storyDirection=direction;
  chapter.choice.context=direction.choiceContext;
  for(const task of chapter.tasks){Object.assign(task,getTaskStoryDirection(chapter.id,task));task.text=task.successText;const dialogue=getDramaticDialogue(chapter.id,task);if(dialogue)task.dialogue=dialogue;}
}

export function getEpilogue(state = {}) {
  const resources = state.resources || state;
  const value = (key) => Number.isFinite(resources[key]) ? resources[key] : INITIAL_RESOURCES[key];
  const flags = state.flags || [];
  const has = (flag) => flags instanceof Set ? flags.has(flag)
    : Array.isArray(flags) ? flags.includes(flag) : Boolean(flags[flag]);
  const paragraphs = [];

  if (has('miller_medical') || (has('miller_company') && value('medicine') > 0)) {
    paragraphs.push('米勒（原创）在持续照顾下开始恢复。他记得的不是一个分数，而是有人听完了他的担忧，也有人在天亮时没有松开他的手。');
  } else if (value('fatigue') >= 10) {
    paragraphs.push('米勒（原创）活着抵达安全区，但伤势与疲惫让恢复更加漫长。他需要更多治疗，也需要时间重新讲述那一夜。');
  } else {
    paragraphs.push('米勒（原创）正在恢复。他时常想起与队伍失散的街口，以及无线电里重新出现的熟悉声音。');
  }

  if (value('civilians') >= 4) {
    paragraphs.push('阿米娜（原创）陆续收到几户居民的平安消息。仍有人失散，但她保存的名单上，终于出现了新的住址和可以再次联系的人。');
  } else if (has('amina_stayed')) {
    paragraphs.push('阿米娜（原创）再次见到了自己帮助的老人一家。更多邻居仍没有消息；她继续寻找，继续记录，不肯把未知写成结局。');
  } else {
    paragraphs.push('阿米娜（原创）回到街区寻找邻居。有人已经离开，有人仍在等待家人的消息。她的生活并未随着部队撤离而恢复平静。');
  }

  if (has('convoy_handover') || has('convoy_patient_aided') || has('mile_medical')) {
    paragraphs.push('里德（原创）在救护区找到了自己交接过的伤员。那些及时留下的物资和记录，让照顾能够继续下去。');
  } else {
    paragraphs.push('里德（原创）仍在补全车队的伤员记录。有些名字终于找到去向，有些问题还需要等待新的消息。');
  }

  if (value('cohesion') >= 10) {
    paragraphs.push('多次清点、共享和交接，让原创队伍的撤离记录较为完整。队员开始彼此探望，并把能够归还的物品送回家人手里。');
  } else {
    paragraphs.push('失散与混乱在队伍里留下裂痕。幸存者尝试对照彼此的记忆，慢慢拼起各自没有看见的那段经历。');
  }

  if (value('trust') >= 10) {
    paragraphs.push('有人终于愿意说出自己一直隐瞒的恐惧。那些停下倾听的片刻，使这场谈话成为可能。');
  } else {
    paragraphs.push('许多话还没有说出口。人与人之间重新建立信任，需要比一夜更长的时间。');
  }

  if (has('ending_letter')) {
    paragraphs.push('信的最后没有写下胜利。你写下一个人的习惯、一句普通的玩笑，以及他曾经被认真记住。');
  } else {
    paragraphs.push('记录最后留下不同的名字：士兵、救援人员、居民。你没有替他们决定这场战争的意义，只尽力让他们的经历不被遗漏。');
  }

  return {
    title: value('civilians') >= 4 && value('cohesion') >= 10 ? '留下彼此的名字' : '天亮以后，生活继续',
    paragraphs,
  };
}
