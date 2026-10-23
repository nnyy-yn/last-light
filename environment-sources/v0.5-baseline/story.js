// 影片事件构成战役骨架；阿米娜、里德与米勒及选择分支均为原创。
// 坐标使用 [x, z]；角色朝向 0 时面向 -z。
export const INITIAL_RESOURCES = {
  trust: 2, medicine: 3, ammo: 90, civilians: 0, fatigue: 0, cohesion: 2,
};

const task = (id, label, kind, pos, text, seconds = 2) => ({ id, label, kind, pos, text, seconds });
const option = (id, label, description, effects, flag, response) => ({ id, label, description, effects, flag, response });
const voice = (speaker, text) => ({ speaker, text });
// Authored encounters start on an actual sight line. Patrol points stay on the
// street, and every actor is present from chapter load rather than spawned in view.
const hostile = (pos, lookAt, patrol, fireDelay = 2.4, opening = true) => ({ pos, lookAt, patrol, fireDelay, opening });

export const CHAPTERS = [
  {
    id: 1, title: '饥饿之城', subtitle: '这里也是某个人的家',
    role: '阿米娜 · 索马里救护志愿者（原创）', time: '10月3日 · 午后', mood: 'day', armed: false,
    spawn: [0, 65], facing: 0,
    intro: '远处的旋翼声越来越近。你想把诊所里的最后几个人带到安全处，也想知道妹妹是否已经回家。',
    radio: [voice('阿米娜', '先看清路，再带他们走。'), voice('邻居', '我们不是地图上的一个点。我们住在这里。')],
    tasks: [
      task('find-family', '找到路口等待撤离的邻居', 'civilian', [3, 43], '年轻人一直攥着空水壶。你告诉他们，先离开这条街。', 3),
      task('clinic-kit', '取回诊所急救箱', 'supplies', [-3, 21], '箱里只剩有限的敷料。每一份都意味着你还能帮一个人。', 3),
      task('quiet-street', '确认居民撤离方向', 'radio', [2, 0], '熟悉的小路暂时畅通，但带所有人走会更慢。', 2),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 行动前', mood: 'day', armed: true,
    spawn: [0, 65], facing: 0,
    intro: '临时接任指挥后，所有目光都落在你身上。你熟悉武器，却还不熟悉让别人信任自己的重量。',
    radio: [voice('米勒（原创）', '长官，我知道流程。只是第一次真的要进去。'), voice('埃弗斯曼', '有问题就说。别一个人硬撑。')],
    tasks: [
      task('check-kit', '检查行动补给', 'supplies', [-3, 43], '水、弹匣、敷料。装备表很短，可能发生的事情却很多。', 2),
      task('meet-miller', '与新队员米勒交谈', 'radio', [3, 21], '米勒把家人的照片塞回口袋，问你是否还会赶上晚饭。', 3),
      task('assemble', '抵达集合车辆', 'vehicle', [0, 0], '熟悉彼此的声音，将比记住每一张脸更加重要。', 2),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 出发前', mood: 'day', armed: false,
    spawn: [-65, 0], facing: -Math.PI / 2,
    intro: '简报把城市变成了几条路线和一个目标。你被告知行动会很快结束，但仍要为队员决定带什么出发。',
    radio: [voice('简报广播', '完成抓捕后，按指示与地面车队会合。'), voice('埃弗斯曼', '听清目标，也记住回来的人。')],
    tasks: [
      task('briefing', '听取任务简报', 'radio', [-43, 3], '地图上的距离很短，实地的每一个转角却都未知。', 3),
      task('loadout', '检查额外携行物资', 'supplies', [-21, -3], '多带一件物资，也意味着有人要承担更多重量。', 2),
      task('boarding', '前往登机集合点', 'vehicle', [0, 2], '发动机掩盖了最后几句闲聊。所有人开始检查身旁的人。', 2),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 下午', mood: 'day', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '落地后，布莱克本已经躺在街上。刚才还整齐的计划骤然失去形状，你必须让身边的人重新行动起来。',
    radio: [voice('队员', '有人坠落！需要担架！'), voice('埃弗斯曼', '看着我。我们先把他带到车旁。')],
    tasks: [
      task('blackburn', '抵达布莱克本身旁', 'wounded', [3, -43], '他仍有反应。你叫他的名字，让他知道身边有人。', 4),
      task('stretcher', '取来转运装备', 'supplies', [-3, -21], '担架很轻，抬起来后才知道两个人的手也会发抖。', 3),
      task('transfer', '协助转交撤送车辆', 'vehicle', [2, 0], '伤员被接上车辆。你清点身边的人，队伍还没有重新站稳。', 4),
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
    role: '里德 · 车队联络员（原创）', time: '10月3日 · 下午', mood: 'day', armed: true,
    spawn: [-65, -50], facing: -Math.PI / 2,
    intro: '抓捕目标已经上车，但无线电里同时响着伤员和路况报告。你坐在车队一侧，发现每个人都在等别人先动。',
    radio: [voice('车队频道', '伤员撤送车辆先行。保持联络。'), voice('里德（原创）', '收到。告诉我们你们到了哪里。')],
    tasks: [
      task('convoy-check', '确认车队人员', 'vehicle', [-43, -47], '有人重复清点人数，有人盯着已经变暗的车窗。', 3),
      task('casualty-kit', '补充伤员转运物资', 'supplies', [-21, -53], '返回的报告里出现了皮拉的名字，随后是一段难以忍受的沉默。', 3),
      task('contact-convoy', '恢复与先行车辆的联络', 'radio', [0, -48], '你重复呼号，直到对面终于答复。回程同样布满危险。', 3),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 下午', mood: 'day', armed: true,
    spawn: [0, 65], facing: 0,
    intro: '一声坠响盖过交火。烟柱从屋顶后升起，无线电里的撤离指令被新的呼叫打断：“黑鹰坠落。”',
    radio: [voice('指挥频道', '超级六一坠落。地面单位转向救援。'), voice('埃弗斯曼', '所有人看向我。我们的目标变了。')],
    tasks: [
      task('receive-update', '确认新的救援目标', 'radio', [-3, 43], '你听了两遍指令。原本的回程，已经变成另一段未知的路。', 3),
      task('rally-point', '确认小队集合位置', 'supplies', [3, 21], '米勒望着烟柱。你提醒他先找到身旁的队友。', 2),
      task('crash-approach', '抵达坠机区外围', 'wreck', [-2, 0], '烧焦的气味先于残骸出现。有人还在等待回答。', 4),
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
    role: '米勒 · 游骑兵队员（原创）', time: '10月3日 · 傍晚前', mood: 'dusk', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '转过一道街口后，你听不见熟悉的脚步了。地图还在手里，但让你镇定的，是无线电里偶尔出现的名字。',
    radio: [voice('米勒（原创）', '我看不到主队。正在寻找集合位置。'), voice('埃弗斯曼', '说清你能看到什么。我们还在听。')],
    tasks: [
      task('reconnect', '尝试联系主队', 'radio', [3, -43], '电台终于传回声音。你没有再掩饰自己的紧张。', 3),
      task('side-patient', '查看路边的原创伤员', 'wounded', [-3, -21], '他问你是否认识回去的路。你说，先一起走。', 4),
      task('find-rally', '到达约定集合点', 'supplies', [2, 0], '熟悉的呼号从街口传来。你终于能把手从电台上放下。', 2),
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
    role: '里德 · 车队联络员（原创）', time: '10月3日 · 傍晚前', mood: 'dusk', armed: true,
    spawn: [65, 50], facing: Math.PI / 2,
    intro: '街口一次次被挡住。命令传到车里时，车队已经错过转弯。你必须把混乱里的信息拼成别人能够理解的话。',
    radio: [voice('车队频道', '前方受阻。确认后车还在跟随。'), voice('里德（原创）', '请逐辆回答。我们不能只听见最前面。')],
    tasks: [
      task('road-status', '核对受阻路段', 'radio', [43, 47], '报告不再只是左转和右转，还包括哪辆车需要立刻停下。', 3),
      task('rear-vehicle', '确认后车的伤员', 'vehicle', [21, 53], '你拉开车门，发现他们已经很久没有听清前面的声音。', 4),
      task('link-back', '建立返程联络', 'radio', [0, 48], '车队必须返回。没有人把这句话说成轻松的决定。', 3),
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
    role: '杜兰特 · 超级六四机长', time: '10月3日 · 下午（并行事件）', mood: 'dusk', armed: false,
    spawn: [0, 65], facing: 0,
    intro: '第二架黑鹰坠落。你在破碎的感知中等待联络恢复。本章街道行走是意识片段，不代表伤重的机长实际穿行城区。',
    radio: [voice('杜兰特', '有人能听到吗……'), voice('断续电台', '保持联络。我们知道你们在那里。')],
    tasks: [
      task('durant-voice', '寻找电台里的声音', 'radio', [-3, 43], '声音断断续续，但有人听见了你。', 3),
      task('durant-crew', '记住机组的呼号', 'memorial', [3, 21], '这是对机组的意识回想；伤重的你仍留在坠机现场。', 3),
      task('durant-wait', '把注意力留在眼前', 'wreck', [-2, 0], '时间失去清晰的刻度。你等待外面传来一句可以辨认的话。', 4),
    ],
    choice: {
      title: '传出的最后一句话', context: '这是叙事表达选择，不改变杜兰特被俘及后来获释的既定结局。',
      options: [
        option('names', '重复机组人员的呼号', '凝聚力 +1；尾声保留这段对同伴的记忆。', { cohesion: 1 }, 'durant_names', '你努力把每一个呼号说清楚。'),
        option('listen', '回应前来救援的人', '信任 +1；尾声保留这次短暂联络的回声。', { trust: 1 }, 'durant_answered', '你让他们知道，你仍在听。'),
      ],
    },
    outro: '有脚步接近残骸。你还不知道来者是谁，只能继续等待。',
    hostiles: [],
  },
  {
    id: 10, title: '两个人的决定', subtitle: '保护，不是胜利倒计时',
    role: '戈登 · 前往第二坠机点的救援人员', time: '10月3日 · 下午（并行事件）', mood: 'dusk', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '你与舒加特进入第二坠机点保护幸存者。这段经历有固定结局：两人牺牲，杜兰特被俘；此刻的目标是完成救助。',
    radio: [voice('戈登', '我们已经到地面。'), voice('舒加特', '先找到幸存者。让他知道我们在这里。')],
    tasks: [
      task('second-wreck', '靠近第二坠机点', 'wreck', [3, -43], '残骸旁的声响忽近忽远。你开始寻找能得到回应的声音。', 3),
      task('protect-durant', '协助保护杜兰特', 'wounded', [-3, -21], '你告诉他自己的名字，帮助他保持注意。', 4),
      task('relay-condition', '报告幸存者状况', 'radio', [2, 0], '你把现场情况说清楚。接下来的命运不会由一次操作成败改写。', 3),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 入夜', mood: 'night', armed: false,
    spawn: [0, 65], facing: 0,
    intro: '史密斯伤势严重，救治正在继续。影片中的结局不会被选择改写；你能决定的是如何陪伴他，以及怎样照顾还在等待的人。',
    radio: [voice('军医', '帮我照看其他人。告诉他们有人在。'), voice('埃弗斯曼', '史密斯，我在这里。')],
    tasks: [
      task('medical-supplies', '送来救护物资', 'supplies', [-3, 43], '你把物资交到军医手中，尽量让自己的声音保持稳定。', 3),
      task('stay-smith', '陪伴史密斯', 'wounded', [3, 21], '你听他说话。此刻陪伴本身，就是你能完成的事情。', 5),
      task('care-living', '查看其余伤员', 'radio', [-2, 0], '还有人在等待你回应。你擦了擦手，重新蹲到他们身边。', 3),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月3日 · 深夜', mood: 'night', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '黑暗让街区失去熟悉的轮廓。你开始用队友的声音辨认位置，守住的目标逐渐只剩一个：等到所有人能够离开。',
    radio: [voice('指挥频道', '救援正在组织。继续保持联络。'), voice('米勒（原创）', '我还在，长官。')],
    tasks: [
      task('night-contact', '确认各组人员状态', 'radio', [3, -43], '你等到最后一组回答，才松开电台按键。', 3),
      task('night-supplies', '分配剩余补给', 'supplies', [-3, -21], '没有人拿走超过自己需要的份额。水和弹药一样沉默地传递。', 3),
      task('night-patient', '协助疲惫队员换位', 'wounded', [2, 0], '他终于能够坐下几分钟。你看见他一直在发抖。', 4),
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
    role: '里德 · 车队联络员（原创）', time: '10月4日 · 凌晨', mood: 'night', armed: true,
    spawn: [-65, 0], facing: -Math.PI / 2,
    intro: '联合救援力量终于接近。美军以及参与救援的马来西亚、巴基斯坦部队需要彼此配合，才能接走仍困在城里的人。',
    radio: [voice('救援频道', '已经接近接应区域。请确认伤员位置。'), voice('里德（原创）', '有人在等待你们。我会把信息说清楚。')],
    tasks: [
      task('relief-contact', '接通救援车队联络', 'radio', [-43, 3], '不同口音在电台里重复同一个位置。你逐项确认。', 3),
      task('relief-patient', '标记伤员交接位置', 'wounded', [-21, -3], '你没有说“那边还有几个”，而是报出他们的名字。', 3),
      task('relief-vehicle', '协助车辆接应', 'vehicle', [0, 2], '车灯终于照进街口。有人直到这时才相信救援真的到了。', 4),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月4日 · 黎明前', mood: 'dawn', armed: true,
    spawn: [0, 65], facing: 0,
    intro: '救援还没有结束。机组遗体需要被带走，伤员需要完成交接。你不愿再用“差不多”回答人数是否齐全。',
    radio: [voice('救援人员', '我们还需要一点时间。'), voice('埃弗斯曼', '我会把外面的交接准备好。')],
    tasks: [
      task('recover-crew', '协助机组遗体转运', 'wreck', [-3, 43], '你放慢动作。沉默里，每个人都知道此刻的重量。', 5),
      task('personal-items', '收集并标记随身物品', 'memorial', [3, 21], '一件小物品也有主人。你把标签重新系紧。', 3),
      task('last-count', '完成最后一次人员交接', 'vehicle', [-2, 0], '名单上有人不再回答，但他们仍在这里。', 4),
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
    role: '米勒 · 游骑兵队员（原创）', time: '10月4日 · 清晨', mood: 'dawn', armed: true,
    spawn: [0, -65], facing: Math.PI,
    intro: '本章沿用影片的徒步撤离呈现。车队正在前方移动，你的腿越来越沉，只能不断确认身旁的人有没有跟上。',
    radio: [voice('米勒（原创）', '我能走。别让我看不见你们。'), voice('埃弗斯曼', '一起到下一个街口。先到那里。')],
    tasks: [
      task('run-rally', '到达第一个集合街口', 'radio', [3, -43], '你把整段路缩成下一个转角，终于又迈出一步。', 2),
      task('run-help', '帮助落后的原创队员', 'wounded', [-3, -21], '他没有要求你留下，只是一直看着队伍前进的方向。', 4),
      task('run-safe', '抵达安全区接应车辆', 'vehicle', [2, 0], '有人伸手接过你的装备。你花了几秒才理解自己可以停下。', 4),
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
    role: '埃弗斯曼 · 游骑兵小队长', time: '10月4日 · 清晨之后', mood: 'dawn', armed: false,
    spawn: [-65, 50], facing: -Math.PI / 2,
    intro: '武器被放下，名字仍在被反复确认。影片的事件已经结束，原创人物的余波将由你一路留下的选择共同决定。',
    radio: [voice('埃弗斯曼', '有人回来了。也有人再也不能回答。'), voice('阿米娜（原创）', '我们开始寻找失散的人。城市还要继续生活。')],
    tasks: [
      task('leave-gear', '放下行动装备', 'supplies', [-43, 53], '肩膀轻了，你却没有立刻站直。', 3),
      task('visit-survivors', '探望仍在接受照顾的人', 'wounded', [-21, 47], '此前的物资、陪伴和交接，如今变成他们身边具体的人与物。', 4),
      task('remember', '记下没有回来的名字', 'memorial', [0, 52], '你把名字写完整，停顿，然后继续。', 5),
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
