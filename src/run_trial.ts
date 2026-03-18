import {
  set_trial_context,
  type StimBank,
  type StimSpec,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import { buildVisualSearchTrialSpec } from "./utils";

interface TrialOutcome {
  response_key: string;
  responded: boolean;
  hit: boolean;
  rt_s: number | null;
  timed_out: boolean;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getOutcome(snapshot: TrialSnapshot): TrialOutcome | null {
  const value = snapshot.units.trial_outcome?.outcome_payload;
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as TrialOutcome;
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    block_id: string;
    block_idx: number;
    block_seed: number;
    condition_generation: Record<string, unknown>;
  }
): TrialBuilder {
  const {
    settings,
    stimBank,
    block_id,
    block_idx,
    block_seed,
    condition_generation
  } = context;
  const trialSpec = buildVisualSearchTrialSpec({
    condition,
    trialId: trial.trial_id,
    blockSeed: block_seed,
    generationConfig: condition_generation
  });

  const presentKey = normalizeKey(settings.present_key ?? "f");
  const absentKey = normalizeKey(settings.absent_key ?? "j");
  const responseKeys = [presentKey, absentKey];
  const correctKey = trialSpec.target_present ? presentKey : absentKey;
  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;

  const fixationDuration = (settings.fixation_duration ?? 0.6) as number | number[] | null;
  const responseDeadline = (settings.response_deadline ?? 2.0) as number | number[] | null;
  const itiDuration = (settings.iti_duration ?? 0.4) as number | number[] | null;
  const itemHeight = Math.max(1, Number(settings.item_height ?? 44));
  const itemFont = String(settings.item_font ?? "Arial");

  const fixation = trial
    .unit("fixation")
    .addStim(stimBank.get("fixation"))
    .addStim(stimBank.get("search_goal"));
  set_trial_context(fixation, {
    trial_id: trial.trial_id,
    phase: "fixation",
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id,
    condition_id: trialSpec.condition_id,
    task_factors: {
      condition: trialSpec.condition,
      search_type: trialSpec.search_type,
      target_present: trialSpec.target_present,
      set_size: trialSpec.set_size,
      stage: "fixation",
      block_idx
    },
    stim_id: "fixation+search_goal"
  });
  fixation.show({ duration: fixationDuration }).to_dict();

  const searchItems: StimSpec[] = trialSpec.items.map((item) => ({
    type: "text",
    text: item.glyph,
    pos: [item.pos[0], item.pos[1]],
    color: item.color,
    ori: item.ori,
    height: itemHeight,
    font: itemFont
  }));

  const searchArray = trial
    .unit("search_array")
    .addStim(stimBank.get("array_boundary"))
    .addStim(stimBank.get("fixation"))
    .addStim(stimBank.get("search_goal"))
    .addStim(...searchItems);
  set_trial_context(searchArray, {
    trial_id: trial.trial_id,
    phase: "search_array",
    deadline_s: responseDeadline,
    valid_keys: responseKeys,
    block_id,
    condition_id: trialSpec.condition_id,
    task_factors: {
      condition: trialSpec.condition,
      search_type: trialSpec.search_type,
      target_present: trialSpec.target_present,
      set_size: trialSpec.set_size,
      present_key: presentKey,
      absent_key: absentKey,
      block_idx
    },
    stim_id: "array_boundary+fixation+search_goal+search_items"
  });
  searchArray
    .captureResponse({
      keys: responseKeys,
      correct_keys: [correctKey],
      duration: responseDeadline,
      response_trigger: {
        [presentKey]: Number(triggerMap.response_present ?? 31),
        [absentKey]: Number(triggerMap.response_absent ?? 32)
      },
      timeout_trigger: Number(triggerMap.search_timeout ?? 33)
    })
    .set_state({
      response_key: (snapshot: TrialSnapshot) => normalizeKey(snapshot.units.search_array?.response),
      responded: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.search_array?.response);
        return key === presentKey || key === absentKey;
      },
      hit: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.search_array?.response);
        return key === correctKey;
      },
      rt_s: (snapshot: TrialSnapshot) => {
        const rt = Number(snapshot.units.search_array?.rt);
        return Number.isFinite(rt) ? rt : null;
      },
      timed_out: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.search_array?.response);
        return key !== presentKey && key !== absentKey;
      }
    })
    .to_dict();

  const trialOutcome = trial.unit("trial_outcome");
  set_trial_context(trialOutcome, {
    trial_id: trial.trial_id,
    phase: "trial_outcome",
    deadline_s: 0,
    valid_keys: [],
    block_id,
    condition_id: trialSpec.condition_id,
    task_factors: {
      condition: trialSpec.condition,
      search_type: trialSpec.search_type,
      target_present: trialSpec.target_present,
      set_size: trialSpec.set_size,
      target_index: trialSpec.target_index,
      stage: "trial_outcome",
      block_idx
    },
    stim_id: "trial_outcome"
  });
  trialOutcome
    .show({ duration: 0 })
    .set_state({
      outcome_payload: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.search_array?.response_key);
        const responded = key === presentKey || key === absentKey;
        const rt = Number(snapshot.units.search_array?.rt_s);
        const rtS = Number.isFinite(rt) ? rt : null;
        return {
          response_key: responded ? key : "",
          responded,
          hit: responded && key === correctKey,
          rt_s: rtS,
          timed_out: !responded
        } satisfies TrialOutcome;
      }
    });

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: "iti",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: trialSpec.condition_id,
    task_factors: {
      condition: trialSpec.condition,
      search_type: trialSpec.search_type,
      target_present: trialSpec.target_present,
      set_size: trialSpec.set_size,
      stage: "iti",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const outcome = getOutcome(snapshot);
    if (!outcome) {
      return;
    }

    helpers.setTrialState("condition", trialSpec.condition);
    helpers.setTrialState("condition_id", trialSpec.condition_id);
    helpers.setTrialState("search_type", trialSpec.search_type);
    helpers.setTrialState("target_present", trialSpec.target_present);
    helpers.setTrialState("set_size", trialSpec.set_size);
    helpers.setTrialState("target_index", trialSpec.target_index);
    helpers.setTrialState("correct_key", correctKey);
    helpers.setTrialState("present_key", presentKey);
    helpers.setTrialState("absent_key", absentKey);
    helpers.setTrialState("search_array_response", outcome.response_key);
    helpers.setTrialState("search_array_rt", outcome.rt_s);
    helpers.setTrialState("search_array_hit", outcome.hit);
    helpers.setTrialState("timed_out", outcome.timed_out);
    helpers.setTrialState("responded", outcome.responded);
  });

  return trial;
}
