// Pure narrative progression. This module never creates world objects, moves
// actors, changes campaign resources, reads time, or plays audio.
export const INTERACTIONS = Object.freeze(['talk', 'radio', 'hold', 'reach', 'defend', 'escort']);

export function needsWorldTarget(task) {
  return Boolean(task && task.interaction !== 'radio' && task.spawn !== false);
}

function validateChapter(chapter) {
  if (!chapter || !Array.isArray(chapter.tasks) || !chapter.tasks.length) throw new TypeError('A chapter needs ordered tasks');
  const ids = new Set();
  for (const task of chapter.tasks) {
    if (!task.id || ids.has(task.id)) throw new TypeError('Task IDs must be unique within a chapter');
    ids.add(task.id);
    if (!INTERACTIONS.includes(task.interaction)) throw new TypeError(`Unknown interaction: ${task.interaction}`);
    if (!Array.isArray(task.dialogue) || !task.dialogue.length || task.dialogue.some(line => !line.speaker || !line.text || !['local', 'radio'].includes(line.channel))) throw new TypeError(`Task ${task.id} needs attributed dialogue`);
    if (task.interaction === 'hold' && !(Number.isFinite(task.seconds) && task.seconds > 0)) throw new TypeError(`Task ${task.id} needs a hold duration`);
    if (task.interaction === 'defend' && !(Number.isFinite(task.defendSeconds) && task.defendSeconds > 0)) throw new TypeError(`Task ${task.id} needs a defence duration`);
    if (task.requiredKills != null && (!Number.isInteger(task.requiredKills) || task.requiredKills < 0)) throw new TypeError(`Task ${task.id} has an invalid kill gate`);
  }
}

/**
 * createNarrative(chapter) -> { press, update, cancel, reset, inspect }
 *
 * Context: {taskId?, near, clear, blocked?, paused?, held?, repeat?, kills?,
 *           escortReady?}. kills is the chapter's cumulative confirmed count.
 *
 * Call press once per non-repeat E keydown. The first press displays line 0;
 * each subsequent press advances one line. Confirming the last visible line
 * completes talk/radio, or enters the physical action phase for other verbs.
 * update(dt, context) progresses only that action. For escort, use actor range
 * during idle/dialogue and destination range during action; escortReady must
 * come from the actor actually reaching that destination.
 *
 * Every call returns an inspect snapshot plus one-shot `events`. Completion
 * events identify the old task; the snapshot already points at the next task.
 * `complete` is true only after every task in this chapter. There is no public
 * skip/set-task/complete method. Resource and cinematic effects belong to the
 * caller, applied once when it consumes a task-complete event.
 */
export function createNarrative(initialChapter) {
  let chapter, taskIndex, phase, lineIndex, holdElapsed, defendElapsed, kills;
  const current = () => chapter.tasks[taskIndex] ?? null;
  const atTarget = (context) => current()?.interaction === 'radio' || context.near === true && context.clear === true;
  const accepts = (context) => current() && (context.taskId == null || context.taskId === current().id);
  const blocked = (context) => Boolean(context.blocked || context.paused);
  const rememberKills = (context) => {
    if (Number.isFinite(context.kills) && context.kills >= 0) kills = Math.max(kills, Math.floor(context.kills));
  };
  function inspect() {
    const task = current();
    let progress = 0;
    if (phase === 'action' && task?.interaction === 'hold') progress = holdElapsed / task.seconds;
    if (phase === 'action' && task?.interaction === 'defend') progress = defendElapsed / task.defendSeconds;
    return {
      chapterId: chapter.id, taskIndex, taskId: task?.id ?? null,
      interaction: task?.interaction ?? null, phase,
      line: phase === 'dialogue' ? { ...task.dialogue[lineIndex] } : null,
      lineIndex, lineCount: task?.dialogue.length ?? 0,
      progress: Math.min(1, Math.max(0, progress)), holdElapsed, defendElapsed,
      requiredKills: task?.requiredKills ?? 0, kills,
      complete: phase === 'done',
    };
  }
  const result = (events = []) => ({ ...inspect(), events });
  function reset(nextChapter = chapter) {
    validateChapter(nextChapter);
    // Copy the authored data so external UI or event consumers cannot mutate
    // progression halfway through a chapter.
    chapter = { id: nextChapter.id, tasks: nextChapter.tasks.map(task => ({ ...task, dialogue: task.dialogue.map(line => ({ ...line })) })) };
    taskIndex = 0; phase = 'idle'; lineIndex = -1;
    holdElapsed = 0; defendElapsed = 0; kills = 0;
    return result();
  }
  function lineEvent() {
    return { type: 'dialogue', taskId: current().id, taskIndex, lineIndex, line: { ...current().dialogue[lineIndex] } };
  }
  function finish() {
    const task = current();
    const event = {
      type: 'task-complete', taskId: task.id, taskIndex,
      interaction: task.interaction, animation: task.animation ?? null,
      sceneEvent: task.sceneEvent ?? null,
    };
    taskIndex++;
    phase = current() ? 'idle' : 'done'; lineIndex = -1;
    holdElapsed = 0; defendElapsed = 0;
    return result([event]);
  }
  function press(context = {}) {
    if (!accepts(context) || blocked(context) || context.repeat || !atTarget(context)) return result();
    rememberKills(context);
    if (phase === 'idle') {
      phase = 'dialogue'; lineIndex = 0;
      return result([lineEvent()]);
    }
    if (phase !== 'dialogue') return result();
    if (lineIndex + 1 < current().dialogue.length) {
      lineIndex++;
      return result([lineEvent()]);
    }
    if (current().interaction === 'talk' || current().interaction === 'radio') return finish();
    phase = 'action'; lineIndex = -1;
    return result([{ type: 'action-start', taskId: current().id, taskIndex, interaction: current().interaction, animation: current().animation ?? null }]);
  }
  function update(dt, context = {}) {
    if (!accepts(context)) return result();
    if (blocked(context)) {
      holdElapsed = 0;
      return result();
    }
    rememberKills(context);
    if (phase !== 'action') return result();
    const task = current(), near = atTarget(context);
    const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (task.interaction === 'hold') {
      if (!near || !context.held) holdElapsed = 0;
      else holdElapsed = Math.min(task.seconds, holdElapsed + elapsed);
      if (holdElapsed >= task.seconds) return finish();
    } else if (task.interaction === 'reach') {
      if (near) return finish();
    } else if (task.interaction === 'escort') {
      if (near && context.escortReady === true) return finish();
    } else if (task.interaction === 'defend') {
      if (near) defendElapsed = Math.min(task.defendSeconds, defendElapsed + elapsed);
      if (near && defendElapsed >= task.defendSeconds && kills >= (task.requiredKills ?? 0)) return finish();
    }
    return result();
  }
  function cancel() {
    holdElapsed = 0;
    return result();
  }
  reset(initialChapter);
  return { press, update, cancel, reset, inspect };
}
